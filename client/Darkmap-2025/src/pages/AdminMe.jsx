import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { toast, ToastContainer } from 'react-toastify';

export default function AdminMe() {
  const { getAllUsers, signup } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    const data = await getAllUsers();
    setUsers(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await signup(firstName, lastName, email, password);
      toast.success("User created successfully!");
      setFirstName('');
      setLastName('');
      setEmail('');
      setPassword('');
      fetchUsers(); // Refresh the list
    } catch (err) {
      toast.error(err.message || "Failed to create user");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <ToastContainer />
      <div className="max-w-6xl mx-auto space-y-8">
        
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Add User Form */}
          <div className="md:col-span-1 bg-gray-800 p-6 rounded-lg shadow-lg h-fit border border-gray-700">
            <h2 className="text-xl font-semibold mb-4">Create New User</h2>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm mb-1 text-gray-300">First Name</label>
                <input required type="text" value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full p-2 bg-gray-700 rounded border border-gray-600 focus:border-primary-500 text-white" />
              </div>
              <div>
                <label className="block text-sm mb-1 text-gray-300">Last Name</label>
                <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} className="w-full p-2 bg-gray-700 rounded border border-gray-600 focus:border-primary-500 text-white" />
              </div>
              <div>
                <label className="block text-sm mb-1 text-gray-300">Email</label>
                <input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-2 bg-gray-700 rounded border border-gray-600 focus:border-primary-500 text-white" />
              </div>
              <div>
                <label className="block text-sm mb-1 text-gray-300">Password</label>
                <input required type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-2 bg-gray-700 rounded border border-gray-600 focus:border-primary-500 text-white" />
              </div>
              <button type="submit" disabled={isSubmitting} className="w-full bg-primary-600 hover:bg-primary-700 p-2 rounded font-medium transition-colors mt-4">
                {isSubmitting ? 'Creating...' : 'Create User'}
              </button>
            </form>
          </div>

          {/* Users List */}
          <div className="md:col-span-2 bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
            <h2 className="text-xl font-semibold mb-4">Existing Users ({users.length})</h2>
            {loading ? (
              <p className="text-gray-400">Loading users...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-700 text-gray-400">
                      <th className="p-3">Name</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Verified</th>
                      <th className="p-3">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(user => (
                      <tr key={user._id} className="border-b border-gray-700/50 hover:bg-gray-750 transition-colors">
                        <td className="p-3">{user.firstName} {user.lastName}</td>
                        <td className="p-3 text-gray-300">{user.email}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 text-xs rounded-full ${user.verified ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'}`}>
                            {user.verified ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="p-3 text-sm text-gray-400">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan="4" className="p-3 text-center text-gray-500">No users found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
