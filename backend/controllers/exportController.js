const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const Due = require('../models/Due');
const Complaint = require('../models/Complaint');
const House = require('../models/House');
const ExportAudit = require('../models/ExportAudit');

const configuredMaxExportLimit = Number.parseInt(process.env.EXPORT_MAX_RECORDS, 10);
const MAX_EXPORT_LIMIT = Number.isSafeInteger(configuredMaxExportLimit) && configuredMaxExportLimit > 0
  ? configuredMaxExportLimit
  : 1000;
const DEFAULT_EXPORT_LIMIT = Math.min(500, MAX_EXPORT_LIMIT);
const DUE_STATUSES = new Set(['pending', 'overdue', 'verification_pending', 'paid']);
const COMPLAINT_STATUSES = new Set(['pending', 'inprogress', 'resolved', 'closed']);
const COMPLAINT_CATEGORIES = new Set(['water', 'electric', 'lift', 'sanitation', 'security', 'other']);
const MIN_EXPORT_YEAR = 2000;
const MAX_EXPORT_YEAR = 2100;

function getSingleQueryValue(value) {
  return typeof value === 'string' ? value : null;
}

function validateOptionalInteger(value, name, min, max, errors) {
  if (value === undefined) return;

  const stringValue = getSingleQueryValue(value);
  if (!stringValue || !/^\d+$/.test(stringValue)) {
    errors.push(`${name} must be an integer between ${min} and ${max}`);
    return;
  }

  const parsedValue = Number(stringValue);
  if (!Number.isSafeInteger(parsedValue) || parsedValue < min || parsedValue > max) {
    errors.push(`${name} must be between ${min} and ${max}`);
  }
}

function validateOptionalEnum(value, name, allowedValues, errors) {
  if (value === undefined) return;

  const stringValue = getSingleQueryValue(value);
  if (!stringValue || !allowedValues.has(stringValue)) {
    errors.push(`${name} is invalid`);
  }
}

function validateExportFilters(req, res, next) {
  const errors = [];
  const isDuesExport = req.path.startsWith('/dues/');
  const isComplaintsExport = req.path.startsWith('/complaints/');

  validateOptionalInteger(req.query.month, 'month', 1, 12, errors);
  validateOptionalInteger(req.query.year, 'year', MIN_EXPORT_YEAR, MAX_EXPORT_YEAR, errors);
  validateOptionalEnum(
    req.query.status,
    'status',
    isDuesExport ? DUE_STATUSES : COMPLAINT_STATUSES,
    errors
  );
  validateOptionalEnum(req.query.category, 'category', COMPLAINT_CATEGORIES, errors);

  if (req.query.section !== undefined) {
    const section = getSingleQueryValue(req.query.section);
    if (!section || !/^Section \d+$/.test(section)) {
      errors.push('section must match the format "Section <number>"');
    }
  }

  if (!isDuesExport && !isComplaintsExport) {
    errors.push('unsupported export endpoint');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Invalid export filter',
      errors
    });
  }

  return next();
}

function getExportPagination(req, res) {
  const pageValue = req.query.page === undefined ? '1' : req.query.page;
  const limitValue = req.query.limit === undefined
    ? String(DEFAULT_EXPORT_LIMIT)
    : req.query.limit;
  const isIntegerString = value => typeof value === 'string' && /^\d+$/.test(value);
  const page = isIntegerString(pageValue) ? Number(pageValue) : NaN;
  const limit = isIntegerString(limitValue) ? Number(limitValue) : NaN;

  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1) {
    res.status(400).json({
      success: false,
      message: 'Export page and limit must be positive integers'
    });
    return null;
  }

  if (limit > MAX_EXPORT_LIMIT) {
    res.status(400).json({
      success: false,
      message: `Export limit cannot exceed ${MAX_EXPORT_LIMIT} records`
    });
    return null;
  }

  const skip = (page - 1) * limit;
  if (!Number.isSafeInteger(skip)) {
    res.status(400).json({
      success: false,
      message: 'Export page is too large'
    });
    return null;
  }
  return { page, limit, skip };
}

function isAdmin(req) {
  return req.user.role === 'admin';
}

function getExportDetails(req) {
  const match = req.path.match(/^\/(dues|complaints)\/(excel|pdf)$/);
  return match ? { resource: match[1], format: match[2] } : null;
}

function getAuditableParameters(query) {
  const parameters = { ...query };
  delete parameters.token;
  return parameters;
}

exports.auditExport = async (req, res, next) => {
  const details = getExportDetails(req);
  if (!details) return next();

  try {
    await ExportAudit.create({
      user: req.user._id,
      role: req.user.role,
      endpoint: req.originalUrl.split('?')[0],
      format: details.format,
      resource: details.resource,
      parameters: getAuditableParameters(req.query),
      triggeredAt: new Date()
    });
    return next();
  } catch (err) {
    return next(err);
  }
};

exports.validateExportPagination = (req, res, next) => {
  if (getExportPagination(req, res)) next();
};

exports.validateExportFilters = validateExportFilters;

// Export dues to Excel
exports.exportDuesToExcel = async (req, res) => {
  try {
    const pagination = getExportPagination(req, res);
    if (!pagination) return;

    const { month, year, status, section } = req.query;
    const filter = {};
    if (month) filter.month = parseInt(month);
    if (year) filter.year = parseInt(year);
    if (status) filter.status = status;
    if (section) filter.house = { $in: await House.find({ section }).distinct('_id') };

    const dueQuery = Due.find(filter)
      .populate('house', 'houseNo section floor monthlyDue')
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit);
    if (isAdmin(req)) dueQuery.populate('paidBy', 'name');
    const dues = await dueQuery;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=dues-report-${new Date().toISOString().split('T')[0]}.xlsx`
    );

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
    const worksheet = workbook.addWorksheet('Dues Report');

    // Define columns
    worksheet.columns = isAdmin(req) ? [
      { header: 'House No', key: 'houseNo', width: 15 },
      { header: 'Section', key: 'section', width: 15 },
      { header: 'Floor', key: 'floor', width: 10 },
      { header: 'Month', key: 'month', width: 10 },
      { header: 'Year', key: 'year', width: 10 },
      { header: 'Amount', key: 'amount', width: 12 },
      { header: 'Fine', key: 'fine', width: 10 },
      { header: 'Total', key: 'total', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Due Date', key: 'dueDate', width: 15 },
      { header: 'Paid Date', key: 'paidDate', width: 15 },
      { header: 'Paid By', key: 'paidBy', width: 15 },
      { header: 'Receipt No', key: 'receiptNo', width: 18 }
    ] : [
      { header: 'House No', key: 'houseNo', width: 15 },
      { header: 'Section', key: 'section', width: 15 },
      { header: 'Floor', key: 'floor', width: 10 },
      { header: 'Month', key: 'month', width: 10 },
      { header: 'Year', key: 'year', width: 10 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Due Date', key: 'dueDate', width: 15 }
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true, size: 12 };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    worksheet.getRow(1).commit();

    // Add data
    dues.forEach(due => {
      const row = {
        houseNo: due.house?.houseNo || 'N/A',
        section: due.house?.section || 'N/A',
        floor: due.house?.floor || 'N/A',
        month: due.month,
        year: due.year,
        status: due.status,
        dueDate: due.dueDate ? due.dueDate.toLocaleDateString() : 'N/A'
      };
      if (isAdmin(req)) Object.assign(row, {
        amount: due.amount,
        fine: due.fine,
        total: due.amount + due.fine,
        paidDate: due.paidDate ? due.paidDate.toLocaleDateString() : 'N/A',
        paidBy: due.paidBy?.name || 'N/A',
        receiptNo: due.receiptNo || 'N/A'
      });
      worksheet.addRow(row).commit();
    });

    await workbook.commit();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
};

// Export complaints to Excel
exports.exportComplaintsToExcel = async (req, res) => {
  try {
    const pagination = getExportPagination(req, res);
    if (!pagination) return;

    const { status, category, section } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (section) filter.section = section;

    const complaintQuery = Complaint.find(filter)
      .populate('assignedTo', isAdmin(req) ? 'name phone specialization' : 'name specialization')
      .populate('house', 'houseNo section')
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit);
    if (isAdmin(req)) {
      complaintQuery.populate('submittedBy', 'name phone')
        .populate('resolvedBy', 'name phone');
    } else {
      complaintQuery.populate('resolvedBy', 'name');
    }
    const complaints = await complaintQuery;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=complaints-report-${new Date().toISOString().split('T')[0]}.xlsx`
    );

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
    const worksheet = workbook.addWorksheet('Complaints Report');

    // Define columns
    worksheet.columns = isAdmin(req) ? [
      { header: 'Title', key: 'title', width: 30 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Category', key: 'category', width: 12 },
      { header: 'Priority', key: 'priority', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Section', key: 'section', width: 12 },
      { header: 'House', key: 'houseNo', width: 12 },
      { header: 'Submitted By', key: 'submittedBy', width: 15 },
      { header: 'Submitted Phone', key: 'submittedPhone', width: 15 },
      { header: 'Assigned To', key: 'assignedTo', width: 15 },
      { header: 'Assigned Phone', key: 'assignedPhone', width: 15 },
      { header: 'Specialization', key: 'specialization', width: 15 },
      { header: 'Resolution', key: 'resolution', width: 40 },
      { header: 'Resolved By', key: 'resolvedBy', width: 15 },
      { header: 'Resolved At', key: 'resolvedAt', width: 18 },
      { header: 'Created At', key: 'createdAt', width: 18 }
    ] : [
      { header: 'Title', key: 'title', width: 30 },
      { header: 'Category', key: 'category', width: 12 },
      { header: 'Priority', key: 'priority', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Section', key: 'section', width: 12 },
      { header: 'House', key: 'houseNo', width: 12 },
      { header: 'Assigned To', key: 'assignedTo', width: 15 },
      { header: 'Specialization', key: 'specialization', width: 15 },
      { header: 'Resolved By', key: 'resolvedBy', width: 15 },
      { header: 'Resolved At', key: 'resolvedAt', width: 18 },
      { header: 'Created At', key: 'createdAt', width: 18 }
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true, size: 12 };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    worksheet.getRow(1).commit();

    // Add data
    complaints.forEach(complaint => {
      const row = {
        title: complaint.title,
        category: complaint.category,
        priority: complaint.priority,
        status: complaint.status,
        section: complaint.section,
        houseNo: complaint.house?.houseNo || 'N/A',
        assignedTo: complaint.assignedTo?.name || 'N/A',
        specialization: complaint.assignedTo?.specialization || 'N/A',
        resolvedBy: complaint.resolvedBy?.name || 'N/A',
        resolvedAt: complaint.resolvedAt ? complaint.resolvedAt.toLocaleString() : 'N/A',
        createdAt: complaint.createdAt.toLocaleString()
      };
      if (isAdmin(req)) Object.assign(row, {
        description: complaint.description,
        submittedBy: complaint.submittedBy?.name || 'N/A',
        submittedPhone: complaint.submittedBy?.phone || 'N/A',
        assignedPhone: complaint.assignedTo?.phone || 'N/A',
        resolution: complaint.resolution || 'N/A'
      });
      worksheet.addRow(row).commit();
    });

    await workbook.commit();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
};

// Export dues to PDF
exports.exportDuesToPDF = async (req, res) => {
  try {
    const pagination = getExportPagination(req, res);
    if (!pagination) return;

    const { month, year, status, section } = req.query;
    const filter = {};
    if (month) filter.month = parseInt(month);
    if (year) filter.year = parseInt(year);
    if (status) filter.status = status;
    if (section) filter.house = { $in: await House.find({ section }).distinct('_id') };

    const dueQuery = Due.find(filter)
      .populate('house', 'houseNo section floor monthlyDue')
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit);
    if (isAdmin(req)) dueQuery.populate('paidBy', 'name');
    const dues = await dueQuery;

    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=dues-report-${new Date().toISOString().split('T')[0]}.pdf`
    );

    doc.pipe(res);

    // Title
    doc.fontSize(20).font('Helvetica-Bold').text('Dues Report', { align: 'center' });
    doc.moveDown();

    // Filters info
    doc.fontSize(10).font('Helvetica');
    if (month || year || status) {
      doc.text(`Filters: ${month ? `Month: ${month}` : ''} ${year ? `Year: ${year}` : ''} ${status ? `Status: ${status}` : ''}`);
      doc.moveDown();
    }

    // Table header
    const tableTop = doc.y;
    const headers = isAdmin(req)
      ? ['House', 'Section', 'Month/Year', 'Amount', 'Fine', 'Total', 'Status', 'Paid By']
      : ['House', 'Section', 'Month/Year', 'Status', 'Due Date'];
    const colWidths = isAdmin(req) ? [80, 80, 80, 60, 50, 60, 60, 80] : [100, 100, 100, 100, 100];
    let xPos = 30;

    doc.font('Helvetica-Bold').fontSize(9);
    headers.forEach((header, i) => {
      doc.text(header, xPos, tableTop, { width: colWidths[i] });
      xPos += colWidths[i];
    });

    // Draw line under header
    doc.moveTo(30, tableTop + 15).lineTo(doc.page.width - 30, tableTop + 15).stroke();

    // Table data
    doc.font('Helvetica').fontSize(8);
    let yPos = tableTop + 25;

    dues.forEach((due, index) => {
      if (yPos > doc.page.height - 50) {
        doc.addPage();
        yPos = 30;
      }

      xPos = 30;
      const rowData = isAdmin(req) ? [
        due.house?.houseNo || 'N/A',
        due.house?.section || 'N/A',
        `${due.month}/${due.year}`,
        `Rs. ${due.amount}`,
        `Rs. ${due.fine}`,
        `Rs. ${due.amount + due.fine}`,
        due.status,
        due.paidBy?.name || 'N/A'
      ] : [
        due.house?.houseNo || 'N/A',
        due.house?.section || 'N/A',
        `${due.month}/${due.year}`,
        due.status,
        due.dueDate ? due.dueDate.toLocaleDateString() : 'N/A'
      ];

      rowData.forEach((data, i) => {
        doc.text(data, xPos, yPos, { width: colWidths[i] });
        xPos += colWidths[i];
      });

      yPos += 20;
    });

    // Footer
    doc.fontSize(8).text(`Generated on: ${new Date().toLocaleString()}`, 30, doc.page.height - 30);

    doc.end();
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Export complaints to PDF
exports.exportComplaintsToPDF = async (req, res) => {
  try {
    const pagination = getExportPagination(req, res);
    if (!pagination) return;

    const { status, category, section } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (section) filter.section = section;

    const complaintQuery = Complaint.find(filter)
      .populate('assignedTo', 'name specialization')
      .populate('resolvedBy', 'name')
      .populate('house', 'houseNo section')
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit);
    if (isAdmin(req)) {
      complaintQuery.populate('submittedBy', 'name phone')
        .populate('assignedTo', 'name phone specialization')
        .populate('resolvedBy', 'name phone');
    }
    const complaints = await complaintQuery;

    const doc = new PDFDocument({ margin: 30 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=complaints-report-${new Date().toISOString().split('T')[0]}.pdf`
    );

    doc.pipe(res);

    // Title
    doc.fontSize(20).font('Helvetica-Bold').text('Complaints Report', { align: 'center' });
    doc.moveDown();

    // Filters info
    doc.fontSize(10).font('Helvetica');
    if (status || category || section) {
      doc.text(`Filters: ${status ? `Status: ${status}` : ''} ${category ? `Category: ${category}` : ''} ${section ? `Section: ${section}` : ''}`);
      doc.moveDown();
    }

    // Complaint details
    complaints.forEach((complaint, index) => {
      if (index > 0) doc.addPage();

      doc.fontSize(14).font('Helvetica-Bold').text(`${index + 1}. ${complaint.title}`);
      doc.moveDown(0.5);

      doc.fontSize(10).font('Helvetica');
      doc.text(`Category: ${complaint.category} | Priority: ${complaint.priority} | Status: ${complaint.status}`);
      doc.text(`Section: ${complaint.section} | House: ${complaint.house?.houseNo || 'N/A'}`);
      doc.text(`Assigned To: ${complaint.assignedTo?.name || 'N/A'} (${complaint.assignedTo?.specialization || 'N/A'})`);

      if (isAdmin(req)) {
        doc.text(`Description: ${complaint.description}`);
        doc.text(`Submitted By: ${complaint.submittedBy?.name || 'N/A'} (${complaint.submittedBy?.phone || 'N/A'})`);
      }
      
      if (complaint.resolution) {
        doc.text(`Resolution: ${complaint.resolution}`);
        doc.text(`Resolved By: ${complaint.resolvedBy?.name || 'N/A'}`);
        doc.text(`Resolved At: ${complaint.resolvedAt ? complaint.resolvedAt.toLocaleString() : 'N/A'}`);
      }

      doc.text(`Created At: ${complaint.createdAt.toLocaleString()}`);
      doc.moveDown();
    });

    // Footer
    doc.fontSize(8).text(`Generated on: ${new Date().toLocaleString()}`, 30, doc.page.height - 30);

    doc.end();
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
