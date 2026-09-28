import React, { useState, useEffect } from 'react';
import { getUsers, createUser, addCredits } from '../../lib/superAdminApi';
import { toast } from 'react-toastify';
import GenericLayout from '../../components/Genric/GenericLayout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faCoins, faTimes } from '@fortawesome/free-solid-svg-icons';

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreditsModalOpen, setIsCreditsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // Form states
  const [formData, setFormData] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [creditsAmount, setCreditsAmount] = useState(0);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await getUsers();
      if (res.success) {
        setUsers(res.data);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      const res = await createUser(formData);
      if (res.success) {
        toast.success('User created successfully!');
        setIsCreateModalOpen(false);
        setFormData({ firstName: '', lastName: '', email: '', password: '' });
        fetchUsers();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create user');
    }
  };

  const handleAddCredits = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;
    try {
      const res = await addCredits(selectedUser._id, creditsAmount);
      if (res.success) {
        toast.success(`Successfully added ${creditsAmount} credits to ${selectedUser.email}`);
        setIsCreditsModalOpen(false);
        setCreditsAmount(0);
        fetchUsers();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add credits');
    }
  };

  return (
    <GenericLayout hideNavbar={false} hideSidebox={true}>
      <div className="p-8 w-full max-w-7xl mx-auto min-h-screen text-white">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            Super Admin Dashboard
          </h1>
          <button 
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 transition-all transform hover:scale-105 shadow-[0_0_15px_rgba(37,99,235,0.5)]"
          >
            <FontAwesomeIcon icon={faPlus} /> Create User
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <div className="bg-gray-800/50 backdrop-blur-md rounded-2xl border border-gray-700/50 overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-900/50 text-gray-400 text-sm uppercase tracking-wider">
                    <th className="p-4 font-semibold">User</th>
                    <th className="p-4 font-semibold">Email</th>
                    <th className="p-4 font-semibold">Credits</th>
                    <th className="p-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {users.map(user => (
                    <tr key={user._id} className="hover:bg-gray-700/30 transition-colors">
                      <td className="p-4">
                        <div className="font-medium text-gray-200">{user.firstName} {user.lastName}</div>
                        {user.isSuperAdmin && <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-1 rounded-full mt-1 inline-block">Super Admin</span>}
                      </td>
                      <td className="p-4 text-gray-400">{user.email}</td>
                      <td className="p-4 text-blue-400 font-bold">{user.credits || 0}</td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => { setSelectedUser(user); setIsCreditsModalOpen(true); }}
                          className="bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white px-3 py-1.5 rounded-lg text-sm transition-all flex items-center gap-2 inline-flex"
                        >
                          <FontAwesomeIcon icon={faCoins} /> Add Credits
                        </button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan="4" className="p-8 text-center text-gray-500">No users found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6 shadow-2xl transform transition-all animate-fadeIn">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Create New User</h2>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-gray-400 hover:text-white">
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">First Name</label>
                <input required type="text" value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Last Name</label>
                <input type="text" value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Email</label>
                <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Password</label>
                <input required minLength={8} type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-4 py-2.5 transition-colors mt-6">
                Create User
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add Credits Modal */}
      {isCreditsModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm p-6 shadow-2xl transform transition-all animate-fadeIn">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Add Credits</h2>
              <button onClick={() => { setIsCreditsModalOpen(false); setSelectedUser(null); }} className="text-gray-400 hover:text-white">
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <p className="text-gray-400 text-sm mb-4">
              Adding credits for <span className="text-white font-medium">{selectedUser.email}</span>
            </p>
            <form onSubmit={handleAddCredits} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Amount</label>
                <input 
                  required 
                  type="number" 
                  min="1"
                  value={creditsAmount} 
                  onChange={e => setCreditsAmount(e.target.value)} 
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none" 
                />
              </div>
              <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg px-4 py-2.5 transition-colors mt-6">
                Confirm & Add
              </button>
            </form>
          </div>
        </div>
      )}
    </GenericLayout>
  );
}
