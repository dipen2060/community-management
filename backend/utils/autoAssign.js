const User = require('../models/User');
const Complaint = require('../models/Complaint');

// Find the best staff member for a given category:
// 1. Must have matching specialization (or 'general' as fallback)
// 2. Among matches, pick the one with the FEWEST active (pending/inprogress) complaints — load balancing
async function findBestStaffForCategory(category) {
  let candidates = await User.find({ role: 'staff', specialization: category, isActive: true });

  // Fallback to general staff if no specialist found
  if (candidates.length === 0) {
    candidates = await User.find({ role: 'staff', specialization: 'general', isActive: true });
  }
  if (candidates.length === 0) return null;

  // Load balancing — count active complaints per candidate
  const loads = await Promise.all(candidates.map(async staff => {
    const activeCount = await Complaint.countDocuments({
      assignedTo: staff._id,
      status: { $in: ['pending', 'inprogress'] }
    });
    return { staff, activeCount };
  }));

  loads.sort((a, b) => a.activeCount - b.activeCount);
  return loads[0].staff;
}

module.exports = { findBestStaffForCategory };
