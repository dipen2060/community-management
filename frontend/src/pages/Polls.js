import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const CHART_COLORS = ['#3b82f6', '#a855f7', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

const Polls = () => {
  const { user } = useAuth();
  const [polls, setPolls] = useState([]);
  const [selectedPoll, setSelectedPoll] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(true);
  const [availableSections, setAvailableSections] = useState(['Section 1', 'Section 2', 'Section 3', 'Section 4']);

  const [newPoll, setNewPoll] = useState({
    title: '',
    description: '',
    options: ['', ''],
    type: 'anonymous',
    targetSections: [],
    endDate: ''
  });

  useEffect(() => {
    fetchPolls();
    axios.get('/api/houses').then(r => {
      const unique = [...new Set((r.data.data || []).map(h => h.section).filter(Boolean))];
      if (unique.length > 0) setAvailableSections(unique);
    }).catch(() => {});
  }, []);

  const fetchPolls = async () => {
    try {
      const res = await axios.get('/api/polls');
      setPolls(res.data.data);
    } catch (err) {
      console.error('Failed to fetch polls:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePoll = async (e) => {
    e.preventDefault();
    try {
      const validOptions = newPoll.options.filter(opt => opt.trim());
      if (validOptions.length < 2) {
        alert('Please provide at least 2 options');
        return;
      }

      await axios.post('/api/polls', {
        ...newPoll,
        options: validOptions,
        endDate: newPoll.endDate ? new Date(newPoll.endDate).toISOString() : undefined
      });

      setShowCreateForm(false);
      setNewPoll({
        title: '',
        description: '',
        options: ['', ''],
        type: 'anonymous',
        targetSections: [],
        endDate: ''
      });
      fetchPolls();
      alert('Poll created successfully!');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create poll');
    }
  };

  const handleVote = async (pollId, optionIndex) => {
    try {
      await axios.post(`/api/polls/${pollId}/vote`, { optionIndex });
      fetchPolls();
      alert('Vote recorded successfully!');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to vote');
    }
  };

  const handleViewResults = async (pollId) => {
    try {
      const res = await axios.get(`/api/polls/${pollId}/results`);
      setSelectedPoll(res.data.data);
      setShowResults(true);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to fetch results');
    }
  };

  const handleClosePoll = async (pollId) => {
    try {
      await axios.put(`/api/polls/${pollId}`, { status: 'closed' });
      fetchPolls();
      alert('Poll closed successfully!');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to close poll');
    }
  };

  const handleDeletePoll = async (pollId) => {
    if (!window.confirm('Are you sure you want to delete this poll?')) return;
    try {
      await axios.delete(`/api/polls/${pollId}`);
      fetchPolls();
      alert('Poll deleted successfully!');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete poll');
    }
  };

  const addOption = () => {
    setNewPoll({ ...newPoll, options: [...newPoll.options, ''] });
  };

  const removeOption = (index) => {
    if (newPoll.options.length > 2) {
      const updated = newPoll.options.filter((_, i) => i !== index);
      setNewPoll({ ...newPoll, options: updated });
    }
  };

  const updateOption = (index, value) => {
    const updated = [...newPoll.options];
    updated[index] = value;
    setNewPoll({ ...newPoll, options: updated });
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading polls...</p>
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">🗳️ Community Polls</span>
          </h1>
          <p className="text-gray-600 mt-1">Vote on community decisions and see what others think</p>
        </div>
        {(user?.role === 'admin' || user?.role === 'staff') && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
          >
            <span className="text-xl">+</span>
            <span>Create Poll</span>
          </button>
        )}
      </div>

      {/* Create Poll Form */}
      {showCreateForm && (
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8 border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800">Create New Poll</h2>
            <button
              onClick={() => setShowCreateForm(false)}
              className="text-gray-400 hover:text-gray-600 transition-colors text-2xl"
            >
              ✕
            </button>
          </div>
          <form onSubmit={handleCreatePoll} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Poll Title *</label>
              <input
                type="text"
                value={newPoll.title}
                onChange={(e) => setNewPoll({ ...newPoll, title: e.target.value })}
                className="w-full border-2 border-gray-200 rounded-xl p-4 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                placeholder="What would you like to ask the community?"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
              <textarea
                value={newPoll.description}
                onChange={(e) => setNewPoll({ ...newPoll, description: e.target.value })}
                className="w-full border-2 border-gray-200 rounded-xl p-4 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none resize-none"
                rows="3"
                placeholder="Add more context to your poll (optional)"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Voting Options (minimum 2) *</label>
              <div className="space-y-3">
                {newPoll.options.map((option, index) => (
                  <div key={index} className="flex gap-3">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={option}
                        onChange={(e) => updateOption(index, e.target.value)}
                        className="w-full border-2 border-gray-200 rounded-xl p-4 pl-12 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                        placeholder={`Option ${index + 1}`}
                        required
                      />
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">
                        {index + 1}.
                      </span>
                    </div>
                    {newPoll.options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeOption(index)}
                        className="px-4 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addOption}
                className="mt-3 text-blue-600 hover:text-blue-700 font-semibold text-sm flex items-center gap-2"
              >
                <span className="text-lg">+</span>
                Add Another Option
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Voting Type</label>
                <select
                  value={newPoll.type}
                  onChange={(e) => setNewPoll({ ...newPoll, type: e.target.value })}
                  className="w-full border-2 border-gray-200 rounded-xl p-4 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none bg-white"
                >
                  <option value="anonymous">🔒 Anonymous (hide voters)</option>
                  <option value="named">👤 Named (show voters)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">End Date (optional)</label>
                <input
                  type="datetime-local"
                  value={newPoll.endDate}
                  onChange={(e) => setNewPoll({ ...newPoll, endDate: e.target.value })}
                  className="w-full border-2 border-gray-200 rounded-xl p-4 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                />
              </div>
            </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Target Sections</label>
                <select
                  multiple
                  value={newPoll.targetSections}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                    setNewPoll({ ...newPoll, targetSections: selected });
                  }}
                  className="w-full border-2 border-gray-200 rounded-xl p-4 h-32 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none bg-white"
                >
                  {availableSections.map(s => (
                    <option key={s} value={s}>📍 {s}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-2">💡 Hold Ctrl/Cmd to select multiple sections. Leave empty for all residents.</p>
              </div>

            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-4 rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl font-semibold"
              >
                Create Poll
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-6 py-4 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-semibold"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Results Modal */}
      {showResults && selectedPoll && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 p-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                📊 Poll Results
              </h2>
              <button
                onClick={() => setShowResults(false)}
                className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-6">
              <div className="mb-6">
                <h3 className="text-xl font-bold text-gray-800 mb-2">{selectedPoll.poll.title}</h3>
                <p className="text-gray-600">{selectedPoll.poll.description}</p>
                <div className="flex gap-4 mt-4 text-sm">
                  <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-medium">
                    Total Votes: {selectedPoll.poll.totalVotes}
                  </span>
                  <span className={`px-3 py-1 rounded-full font-medium ${
                    selectedPoll.poll.status === 'active' 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {selectedPoll.poll.status === 'active' ? '● Active' : '● Closed'}
                  </span>
                </div>
              </div>

              {selectedPoll.poll.totalVotes > 0 && (
                <div className="mb-8 bg-gray-50 rounded-xl p-4">
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={selectedPoll.results.map(r => ({ name: r.text, value: r.votes }))}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={95}
                        paddingAngle={2}
                      >
                        {selectedPoll.results.map((_, index) => (
                          <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value, name) => [`${value} votes`, name]} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="space-y-6">
                {selectedPoll.results.map((result, index) => (
                  <div key={index} className="bg-gray-50 rounded-xl p-5">
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-semibold text-gray-800 text-lg">{result.text}</span>
                      <span className="text-blue-600 font-bold text-xl">{result.percentage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-6 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500 ease-out bg-gradient-to-r from-blue-500 to-purple-500"
                        style={{ width: `${result.percentage}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-2 text-sm text-gray-600">
                      <span>{result.votes} votes</span>
                      {selectedPoll.poll.type === 'named' && result.voters.length > 0 && (
                        <span className="text-gray-500">
                          Voted by: {result.voters.map(v => v.name).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Polls List */}
      {polls.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl shadow-lg">
          <div className="text-6xl mb-4">🗳️</div>
          <h3 className="text-xl font-semibold text-gray-800 mb-2">No polls yet</h3>
          <p className="text-gray-600 mb-6">
            {(user?.role === 'admin' || user?.role === 'staff') 
              ? 'Create your first poll to get started!' 
              : 'Wait for admin or staff to create polls.'}
          </p>
          {(user?.role === 'admin' || user?.role === 'staff') && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg"
            >
              Create First Poll
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-6">
          {polls.map((poll) => (
            <div key={poll._id} className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-shadow border border-gray-100 overflow-hidden">
              {/* Poll Header */}
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold text-gray-800">{poll.title}</h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        poll.status === 'active' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {poll.status === 'active' ? '● Active' : '● Closed'}
                      </span>
                    </div>
                    {poll.description && <p className="text-gray-600 text-sm">{poll.description}</p>}
                    <div className="flex flex-wrap gap-3 mt-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">📅 {new Date(poll.createdAt).toLocaleDateString()}</span>
                      <span className="flex items-center gap-1">🗳️ {poll.totalVotes} votes</span>
                      {poll.endDate && (
                        <span className="flex items-center gap-1">⏰ Ends: {new Date(poll.endDate).toLocaleString()}</span>
                      )}
                      {poll.targetSections.length > 0 && (
                        <span className="flex items-center gap-1">📍 {poll.targetSections.join(', ')}</span>
                      )}
                    </div>
                  </div>

                  {(user?.role === 'admin' || user?.role === 'staff') && (
                    <div className="flex gap-2 ml-4">
                      {poll.status === 'active' && (
                        <button
                          onClick={() => handleClosePoll(poll._id)}
                          className="px-3 py-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors text-sm font-medium"
                        >
                          Close
                        </button>
                      )}
                      <button
                        onClick={() => handleDeletePoll(poll._id)}
                        className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Voting Options */}
              <div className="p-6">
                <div className="space-y-3">
                  {poll.options.map((option, index) => {
                    const votePercentage = poll.totalVotes > 0 
                      ? ((option.votes.length / poll.totalVotes) * 100).toFixed(1) 
                      : 0;
                    
                    return (
                      <button
                        key={index}
                        onClick={() => handleVote(poll._id, index)}
                        disabled={poll.status !== 'active' || poll.hasVoted}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all relative overflow-hidden group ${
                          poll.status !== 'active' || poll.hasVoted
                            ? 'bg-gray-50 border-gray-200 cursor-not-allowed'
                            : 'bg-white border-gray-200 hover:border-blue-400 hover:bg-blue-50'
                        }`}
                      >
                        {/* Progress bar background */}
                        {poll.totalVotes > 0 && (
                          <div 
                            className="absolute inset-0 bg-gradient-to-r from-blue-100 to-purple-100 transition-all duration-500"
                            style={{ width: `${votePercentage}%`, opacity: 0.3 }}
                          />
                        )}
                        
                        <div className="relative flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                              poll.status !== 'active' || poll.hasVoted
                                ? 'bg-gray-200 text-gray-500'
                                : 'bg-blue-100 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors'
                            }`}>
                              {index + 1}
                            </span>
                            <span className="font-semibold text-gray-800">{option.text}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-500">{option.votes.length} votes</span>
                            {poll.totalVotes > 0 && (
                              <span className="font-bold text-blue-600">{votePercentage}%</span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {poll.hasVoted && (
                  <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
                    <span className="text-2xl">✅</span>
                    <span className="text-green-700 font-medium">You have voted in this poll</span>
                  </div>
                )}

                {/* Backend restricts GET /api/polls/:id/results to admin/staff only (see routes/polls.js),
                    so the button must not be shown to residents — it used to appear after voting or once
                    a poll closed and would fail with a 403 when clicked. */}
                {(user?.role === 'admin' || user?.role === 'staff') && (
                  <button
                    onClick={() => handleViewResults(poll._id)}
                    className="mt-4 w-full py-3 bg-gradient-to-r from-blue-50 to-purple-50 text-blue-700 rounded-xl hover:from-blue-100 hover:to-purple-100 transition-colors font-semibold flex items-center justify-center gap-2"
                  >
                    <span>📊</span>
                    <span>View Detailed Results</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Polls;
