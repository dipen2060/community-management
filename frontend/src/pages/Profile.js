import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { normalizeUserName, validateNewPassword, validateProfileForm } from '../utils/validation';

const Profile = () => {
  const { user, setUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [touchedFields, setTouchedFields] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const [formData, setFormData] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    address: user?.address || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        phone: user.phone || '',
        address: user.address || '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      setPhoneTouched(false);
      setTouchedFields({});
      setSubmitAttempted(false);
    }
  }, [user]);

  const handleChange = (e) => {
    const value = e.target.name === 'phone'
      ? e.target.value.replace(/\D/g, '').slice(0, 10)
      : e.target.value;
    setFormData({ ...formData, [e.target.name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitAttempted(true);
    const errors = validateProfileForm(formData);
    const currentPasswordError = formData.newPassword && !formData.currentPassword
      ? 'Current password is required to change password'
      : '';
    if (Object.values(errors).some(Boolean) || currentPasswordError) return;

    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const updateData = {
        name: normalizeUserName(formData.name),
        phone: formData.phone,
        address: formData.address
      };

      if (formData.newPassword) {
        updateData.currentPassword = formData.currentPassword;
        updateData.newPassword = formData.newPassword;
      }

      const res = await axios.put('/api/users/me/profile', updateData);
      
      // Update user context
      setUser(res.data.data);
      
      // Clear password fields
      setFormData({
        ...formData,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });

      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (err) {
      setMessage({ 
        type: 'error', 
        text: err.response?.data?.message || 'Failed to update profile' 
      });
    } finally {
      setLoading(false);
    }
  };

  const formErrors = validateProfileForm(formData);
  const currentPasswordError = formData.newPassword && !formData.currentPassword
    ? 'Current password is required to change password'
    : '';

  return (
    <div className="mx-auto w-full min-w-0 max-w-4xl p-3 sm:p-5 lg:p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">👤 My Profile</h1>
        <p className="text-gray-600">Manage your account settings and personal information</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Info Card */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <div className="text-center mb-6">
              <div className="w-24 h-24 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full mx-auto mb-4 flex items-center justify-center text-4xl text-white font-bold">
                {user?.name?.charAt(0).toUpperCase()}
              </div>
              <h2 className="text-xl font-bold text-gray-800">{user?.name}</h2>
              <p className="text-gray-600">{user?.email}</p>
              <span className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-semibold ${
                user?.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                user?.role === 'staff' ? 'bg-blue-100 text-blue-700' :
                'bg-green-100 text-green-700'
              }`}>
                {user?.role?.toUpperCase()}
              </span>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500">Username</span>
                <span className="font-medium text-gray-800">{user?.username}</span>
              </div>
              {user?.specialization && (
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">Specialization</span>
                  <span className="font-medium text-gray-800 capitalize">{user?.specialization}</span>
                </div>
              )}
              {user?.address && (
                <div className="flex justify-between py-2 border-b border-gray-100 gap-3">
                  <span className="text-gray-500 shrink-0">Address</span>
                  <span className="font-medium text-gray-800 text-right">{user?.address}</span>
                </div>
              )}
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500">Status</span>
                <span className="font-medium text-green-600">Active</span>
              </div>
            </div>
          </div>
        </div>

        {/* Edit Form Card */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Edit Profile</h2>

            {message.text && (
              <div className={`mb-6 p-4 rounded-xl ${
                message.type === 'success' 
                  ? 'bg-green-50 border border-green-200 text-green-700' 
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}>
                {message.text}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="min-w-0 space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Full Name</label>
                <input
                  type="text"
                  name="name"
                  maxLength={50}
                  value={formData.name}
                  onChange={handleChange}
                  onBlur={() => setTouchedFields({ ...touchedFields, name: true })}
                  className="w-full border-2 border-gray-200 rounded-xl p-4 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                  placeholder="Enter your full name"
                  required
                />
                {(touchedFields.name || submitAttempted || formData.name) && formErrors.name && <p role="alert" className="mt-2 text-sm text-red-600">{formErrors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Email (Cannot be changed)</label>
                <input
                  type="email"
                  value={user?.email}
                  disabled
                  className="w-full border-2 border-gray-200 rounded-xl p-4 bg-gray-50 text-gray-500 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Phone Number</label>
                <input
                  type="tel"
                  name="phone"
                  inputMode="numeric"
                  maxLength={10}
                  value={formData.phone}
                  onChange={handleChange}
                  onBlur={() => { setPhoneTouched(true); setTouchedFields({ ...touchedFields, phone: true }); }}
                  className="w-full border-2 border-gray-200 rounded-xl p-4 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                  placeholder="98XXXXXXXX"
                />
                {formErrors.phone && (phoneTouched || submitAttempted || formData.phone) && (
                  <p role="alert" className="mt-2 text-sm text-red-600">{formErrors.phone}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Address</label>
                <textarea
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  className="w-full border-2 border-gray-200 rounded-xl p-4 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none resize-none"
                  rows="2"
                  placeholder="Enter your address (e.g. House No, Tole, Ward)"
                />
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Change Password</h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Current Password</label>
                    <input
                      type="password"
                      name="currentPassword"
                      maxLength={128}
                      value={formData.currentPassword}
                      onChange={handleChange}
                      onBlur={() => setTouchedFields({ ...touchedFields, currentPassword: true })}
                      className="w-full border-2 border-gray-200 rounded-xl p-4 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                      placeholder="Enter current password"
                    />
                    {(touchedFields.currentPassword || submitAttempted) && currentPasswordError && <p role="alert" className="mt-2 text-sm text-red-600">{currentPasswordError}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">New Password</label>
                    <input
                      type="password"
                      name="newPassword"
                      maxLength={64}
                      value={formData.newPassword}
                      onChange={handleChange}
                      onBlur={() => setTouchedFields({ ...touchedFields, newPassword: true })}
                      className="w-full border-2 border-gray-200 rounded-xl p-4 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                      placeholder="Enter new password"
                    />
                    <p className="mt-2 text-xs text-gray-500">Use 8-64 characters with an uppercase letter, lowercase letter, number, and special symbol.</p>
                    {(touchedFields.newPassword || submitAttempted || formData.newPassword) && formErrors.newPassword && <p role="alert" className="mt-2 text-sm text-red-600">{formErrors.newPassword}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Confirm New Password</label>
                    <input
                      type="password"
                      name="confirmPassword"
                      maxLength={64}
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      onBlur={() => setTouchedFields({ ...touchedFields, confirmPassword: true })}
                      className="w-full border-2 border-gray-200 rounded-xl p-4 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                      placeholder="Confirm new password required"
                    />
                    {(touchedFields.confirmPassword || submitAttempted) && formErrors.confirmPassword && <p role="alert" className="mt-2 text-sm text-red-600">{formErrors.confirmPassword}</p>}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:gap-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-4 rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormData({
                      name: user?.name || '',
                      phone: user?.phone || '',
                      address: user?.address || '',
                      currentPassword: '',
                      newPassword: '',
                      confirmPassword: ''
                    });
                    setTouchedFields({});
                    setSubmitAttempted(false);
                    setMessage({ type: '', text: '' });
                  }}
                  className="px-6 py-4 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-semibold"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;