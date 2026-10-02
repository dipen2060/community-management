const mongoose = require('mongoose');
const Due = require('../models/Due');
const House = require('../models/House');
const ResidentHouse = require('../models/ResidentHouse');
const User = require('../models/User');
const { effectiveFine } = require('./fines');

const OUTSTANDING_STATUSES = ['pending', 'overdue', 'verification_pending'];
const DUE_STATUSES = [...OUTSTANDING_STATUSES, 'paid'];

async function getOccupiedHouses({ houseId, houseIds } = {}) {
  const filter = { isOccupied: true, status: { $ne: 'archived' } };
  if (houseId) filter._id = houseId;
  else if (houseIds) filter._id = { $in: houseIds };

  const houses = await House.find(filter)
    .select('_id houseNo section monthlyDue owner tenant isOccupied status')
    .lean();
  if (!houses.length) return [];

  const links = await ResidentHouse.find({
    house_id: { $in: houses.map(house => house._id) }
  }).select('house_id resident_id').lean();
  const residentIdsByHouse = new Map(houses.map(house => [
    String(house._id),
    [house.owner, house.tenant, ...links
      .filter(link => String(link.house_id) === String(house._id))
      .map(link => link.resident_id)]
      .filter(Boolean)
      .map(String)
  ]));
  const residentIds = [...new Set([...residentIdsByHouse.values()].flat())];
  if (!residentIds.length) return [];

  const residents = await User.find({
    _id: { $in: residentIds.map(id => new mongoose.Types.ObjectId(id)) },
    role: 'resident',
    isActive: true
  }).select('_id name phone');
  const residentsById = new Map(residents.map(resident => [String(resident._id), resident]));

  return houses
    .map(house => ({
      ...house,
      activeResidents: [...new Set(residentIdsByHouse.get(String(house._id)))]
        .map(id => residentsById.get(id))
        .filter(Boolean)
    }))
    .filter(house => house.activeResidents.length > 0);
}

async function getOutstandingByHouse({ houseId, houseIds, section, now = new Date() } = {}) {
  const occupiedHouses = await getOccupiedHouses({ houseId, houseIds });
  if (!occupiedHouses.length) return [];
  const match = {
    status: { $in: DUE_STATUSES },
    house: { $in: occupiedHouses.map(house => new mongoose.Types.ObjectId(String(house._id))) }
  };

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
    {
      $match: {
        'houseInfo.status': { $ne: 'archived' },
        'houseInfo.isOccupied': true,
        ...(section ? { 'houseInfo.section': section } : {})
      }
    },
    {
      $group: {
        _id: '$houseInfo._id',
        houseNo: { $first: '$houseInfo.houseNo' },
        section: { $first: '$houseInfo.section' },
        baseMonthlyDue: { $first: '$houseInfo.monthlyDue' },
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
  const groupedById = new Map(groupedHouses.map(house => [String(house._id), house]));
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  return occupiedHouses.map(occupiedHouse => {
    const house = groupedById.get(String(occupiedHouse._id)) || {
      _id: occupiedHouse._id,
      houseNo: occupiedHouse.houseNo,
      section: occupiedHouse.section,
      baseMonthlyDue: occupiedHouse.monthlyDue,
      dues: []
    };
    const allDues = house.dues || [];
    const breakdown = allDues.filter(due => OUTSTANDING_STATUSES.includes(due.status)).map(due => {
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
    const oldest = breakdown[0] || { month: currentMonth, year: currentYear };
    const currentDue = allDues.find(due => due.month === currentMonth && due.year === currentYear);
    const currentMonthAmount = currentDue
      ? (OUTSTANDING_STATUSES.includes(currentDue.status) ? Number(currentDue.amount || 0) : 0)
      : Number(occupiedHouse.monthlyDue || house.baseMonthlyDue || 0);
    const previousBalance = breakdown
      .filter(due => due.year < currentYear || (due.year === currentYear && due.month < currentMonth))
      .reduce((total, due) => total + due.amount, 0);
    const totalFine = breakdown.reduce((total, due) => total + due.fine, 0);
    const totalPayable = Number((currentMonthAmount + previousBalance + totalFine).toFixed(2));
    const activeResidents = occupiedHouse.activeResidents || [];
    const owner = activeResidents.find(resident => String(resident._id) === String(occupiedHouse.owner));
    const tenant = activeResidents.find(resident => String(resident._id) === String(occupiedHouse.tenant));
    const residentName = activeResidents.map(resident => resident.name).filter(Boolean).join(' / ');
    const contactNumber = activeResidents.map(resident => resident.phone).filter(Boolean).join(' / ') || null;

    return {
      houseId: house._id,
      houseNo: house.houseNo,
      section: house.section,
      ownerName: owner?.name || null,
      tenantName: tenant?.name || null,
      residentName: residentName || null,
      contactNumber,
      baseMonthlyDue: Number(occupiedHouse.monthlyDue || house.baseMonthlyDue || 0),
      dueSince: { month: oldest.month, year: oldest.year },
      monthsUnpaid: breakdown.length,
      currentMonthAmount,
      previousBalance,
      totalFine,
      totalOutstanding: totalPayable,
      totalPayable,
      hasVerificationPending: breakdown.some(due => due.status === 'verification_pending'),
      breakdown
    };
  })
    .filter(house => house.totalOutstanding > 0 && (!section || house.section === section))
    .sort((a, b) => a.section.localeCompare(b.section) || a.houseNo.localeCompare(b.houseNo, undefined, { numeric: true }));
}

module.exports = { OUTSTANDING_STATUSES, getOccupiedHouses, getOutstandingByHouse };
