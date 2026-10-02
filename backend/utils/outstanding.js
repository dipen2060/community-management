const mongoose = require('mongoose');
const Due = require('../models/Due');
const { effectiveFine } = require('./fines');

const OUTSTANDING_STATUSES = ['pending', 'overdue', 'verification_pending'];

async function getOutstandingByHouse({ houseId, houseIds, section, now = new Date() } = {}) {
  const match = { status: { $in: OUTSTANDING_STATUSES } };
  if (houseId) {
    match.house = new mongoose.Types.ObjectId(String(houseId));
  } else if (houseIds) {
    match.house = { $in: houseIds.map(id => new mongoose.Types.ObjectId(String(id))) };
  }

  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: 'houses',
        localField: 'house',
        foreignField: '_id',
        as: 'houseInfo'
      }
    },
    { $unwind: '$houseInfo' },
    { $match: { 'houseInfo.status': { $ne: 'archived' }, ...(section ? { 'houseInfo.section': section } : {}) } },
    {
      $lookup: {
        from: 'users',
        localField: 'houseInfo.owner',
        foreignField: '_id',
        as: 'ownerInfo'
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'houseInfo.tenant',
        foreignField: '_id',
        as: 'tenantInfo'
      }
    },
    {
      $group: {
        _id: '$houseInfo._id',
        houseNo: { $first: '$houseInfo.houseNo' },
        section: { $first: '$houseInfo.section' },
        ownerName: { $first: { $arrayElemAt: ['$ownerInfo.name', 0] } },
        tenantName: { $first: { $arrayElemAt: ['$tenantInfo.name', 0] } },
        dues: {
          $push: {
            _id: '$_id',
            month: '$month',
            year: '$year',
            amount: '$amount',
            fine: '$fine',
            status: '$status',
            dueDate: '$dueDate'
          }
        }
      }
    }
  ];
  const groupedHouses = await Due.aggregate(pipeline);
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  return groupedHouses.map(house => {
    const breakdown = house.dues.map(due => {
      const fine = effectiveFine(due.fine, due.dueDate, now);
      const dueDate = due.dueDate ? new Date(due.dueDate) : null;
      const daysOverdue = dueDate && dueDate < now
        ? Math.max(0, Math.floor((now - dueDate) / (1000 * 60 * 60 * 24)))
        : 0;
      return {
        dueId: due._id,
        month: due.month,
        year: due.year,
        amount: Number(due.amount || 0),
        fine,
        total: Number(due.amount || 0) + fine,
        status: due.status,
        dueDate,
        daysOverdue
      };
    }).sort((a, b) => a.year - b.year || a.month - b.month);
    const oldest = breakdown[0];
    const currentMonthAmount = breakdown
      .filter(due => due.month === currentMonth && due.year === currentYear)
      .reduce((total, due) => total + due.amount, 0);
    const previousBalance = breakdown
      .filter(due => due.year < currentYear || (due.year === currentYear && due.month < currentMonth))
      .reduce((total, due) => total + due.amount, 0);
    const totalFine = breakdown.reduce((total, due) => total + due.fine, 0);

    return {
      houseId: house._id,
      houseNo: house.houseNo,
      section: house.section,
      ownerName: house.ownerName || null,
      tenantName: house.tenantName || null,
      dueSince: { month: oldest.month, year: oldest.year },
      monthsUnpaid: breakdown.length,
      currentMonthAmount,
      previousBalance,
      totalFine,
      totalPayable: currentMonthAmount + previousBalance + totalFine,
      hasVerificationPending: breakdown.some(due => due.status === 'verification_pending'),
      breakdown
    };
  }).sort((a, b) => a.section.localeCompare(b.section) || a.houseNo.localeCompare(b.houseNo, undefined, { numeric: true }));
}

module.exports = { OUTSTANDING_STATUSES, getOutstandingByHouse };
