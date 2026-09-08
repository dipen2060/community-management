const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const Due = require('../models/Due');
const Complaint = require('../models/Complaint');
const House = require('../models/House');

// Export dues to Excel
exports.exportDuesToExcel = async (req, res) => {
  try {
    const { month, year, status } = req.query;
    const filter = {};
    if (month) filter.month = parseInt(month);
    if (year) filter.year = parseInt(year);
    if (status) filter.status = status;

    const dues = await Due.find(filter)
      .populate('house', 'houseNo section floor monthlyDue')
      .populate('paidBy', 'name')
      .sort({ createdAt: -1 });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Dues Report');

    // Define columns
    worksheet.columns = [
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
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true, size: 12 };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add data
    dues.forEach(due => {
      worksheet.addRow({
        houseNo: due.house?.houseNo || 'N/A',
        section: due.house?.section || 'N/A',
        floor: due.house?.floor || 'N/A',
        month: due.month,
        year: due.year,
        amount: due.amount,
        fine: due.fine,
        total: due.amount + due.fine,
        status: due.status,
        dueDate: due.dueDate ? due.dueDate.toLocaleDateString() : 'N/A',
        paidDate: due.paidDate ? due.paidDate.toLocaleDateString() : 'N/A',
        paidBy: due.paidBy?.name || 'N/A',
        receiptNo: due.receiptNo || 'N/A'
      });
    });

    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=dues-report-${new Date().toISOString().split('T')[0]}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Export complaints to Excel
exports.exportComplaintsToExcel = async (req, res) => {
  try {
    const { status, category, section } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (section) filter.section = section;

    const complaints = await Complaint.find(filter)
      .populate('submittedBy', 'name phone')
      .populate('assignedTo', 'name phone specialization')
      .populate('resolvedBy', 'name phone')
      .populate('house', 'houseNo section')
      .sort({ createdAt: -1 });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Complaints Report');

    // Define columns
    worksheet.columns = [
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
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true, size: 12 };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add data
    complaints.forEach(complaint => {
      worksheet.addRow({
        title: complaint.title,
        description: complaint.description,
        category: complaint.category,
        priority: complaint.priority,
        status: complaint.status,
        section: complaint.section,
        houseNo: complaint.house?.houseNo || 'N/A',
        submittedBy: complaint.submittedBy?.name || 'N/A',
        submittedPhone: complaint.submittedBy?.phone || 'N/A',
        assignedTo: complaint.assignedTo?.name || 'N/A',
        assignedPhone: complaint.assignedTo?.phone || 'N/A',
        specialization: complaint.assignedTo?.specialization || 'N/A',
        resolution: complaint.resolution || 'N/A',
        resolvedBy: complaint.resolvedBy?.name || 'N/A',
        resolvedAt: complaint.resolvedAt ? complaint.resolvedAt.toLocaleString() : 'N/A',
        createdAt: complaint.createdAt.toLocaleString()
      });
    });

    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=complaints-report-${new Date().toISOString().split('T')[0]}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Export dues to PDF
exports.exportDuesToPDF = async (req, res) => {
  try {
    const { month, year, status } = req.query;
    const filter = {};
    if (month) filter.month = parseInt(month);
    if (year) filter.year = parseInt(year);
    if (status) filter.status = status;

    const dues = await Due.find(filter)
      .populate('house', 'houseNo section floor monthlyDue')
      .populate('paidBy', 'name')
      .sort({ createdAt: -1 });

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
    const headers = ['House', 'Section', 'Month/Year', 'Amount', 'Fine', 'Total', 'Status', 'Paid By'];
    const colWidths = [80, 80, 80, 60, 50, 60, 60, 80];
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
      const rowData = [
        due.house?.houseNo || 'N/A',
        due.house?.section || 'N/A',
        `${due.month}/${due.year}`,
        `Rs. ${due.amount}`,
        `Rs. ${due.fine}`,
        `Rs. ${due.amount + due.fine}`,
        due.status,
        due.paidBy?.name || 'N/A'
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
    const { status, category, section } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (section) filter.section = section;

    const complaints = await Complaint.find(filter)
      .populate('submittedBy', 'name phone')
      .populate('assignedTo', 'name specialization')
      .populate('resolvedBy', 'name')
      .populate('house', 'houseNo section')
      .sort({ createdAt: -1 });

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
      doc.text(`Description: ${complaint.description}`);
      doc.text(`Category: ${complaint.category} | Priority: ${complaint.priority} | Status: ${complaint.status}`);
      doc.text(`Section: ${complaint.section} | House: ${complaint.house?.houseNo || 'N/A'}`);
      doc.text(`Submitted By: ${complaint.submittedBy?.name || 'N/A'} (${complaint.submittedBy?.phone || 'N/A'})`);
      doc.text(`Assigned To: ${complaint.assignedTo?.name || 'N/A'} (${complaint.assignedTo?.specialization || 'N/A'})`);
      
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
