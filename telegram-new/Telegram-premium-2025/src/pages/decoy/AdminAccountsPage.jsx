import { useEffect, useState } from 'react';
import axios from 'axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faShieldHalved, faPlus, faTrash, faPhone,
  faLock, faLockOpen, faRightFromBracket, faUserPlus, faPen,
} from '@fortawesome/free-solid-svg-icons';
import Spinner from '../dashboard/components/common/spinner';
import { toast } from 'react-toastify';
import { ToastContainer } from 'react-toastify';

const BASE = `${import.meta.env.VITE_API_BASE_URL}/admin`;

const adminHeaders = () => ({
  Authorization: `Bearer ${sessionStorage.getItem('admin_token')}`,
});

const EMPTY_FORM = { phoneNumber: '', apiId: '', apiHash: '', sessionString: '' };

function AdminLoginScreen({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const isSignup = mode === 'signup';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const endpoint = isSignup ? `${BASE}/auth/signup` : `${BASE}/auth/login`;
      const res = await axios.post(endpoint, form);
      sessionStorage.setItem('admin_token', res.data.data.accessToken);
      toast.success(isSignup ? 'Admin account created' : 'Logged in');
      onLogin();
    } catch (err) {
      toast.error(err.response?.data?.message ?? (isSignup ? 'Signup failed' : 'Invalid credentials'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-5">
      <div className="flex items-center gap-3 mb-2">
        <FontAwesomeIcon icon={faShieldHalved} className="text-primary-400 text-3xl" />
        <div>
          <div className="text-xl font-semibold">{isSignup ? 'Create Admin Account' : 'Admin Login'}</div>
          <div className="text-xs text-gray-500">Account Pool Management</div>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-80">
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          placeholder="Admin email"
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
          required
        />
        <input
          type="password"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          placeholder={isSignup ? 'Password (min 8 characters)' : 'Password'}
          minLength={isSignup ? 8 : undefined}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Spinner className="size-4" /> : (isSignup ? 'Create Account' : 'Login')}
        </button>
        <button
          type="button"
          onClick={() => { setMode(isSignup ? 'login' : 'signup'); setForm({ email: '', password: '' }); }}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors text-center"
        >
          {isSignup ? 'Already have an account? Login' : "Don't have an account? Sign up"}
        </button>
      </form>
    </div>
  );
}

function AddAccountModal({ onClose, onAdded }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post(`${BASE}/decoy-accounts`, form, { headers: adminHeaders() });
      onAdded(res.data.data?.account);
      onClose();
      toast.success('Account added');
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to add account');
    } finally {
      setLoading(false);
    }
  };

  const field = (key, label, placeholder, type = 'text') => (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
        required
      />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[rgb(10_18_30)] border border-gray-700 rounded-2xl p-6 w-full max-w-lg">
        <div className="flex items-center gap-2 mb-5">
          <FontAwesomeIcon icon={faPhone} className="text-primary-400" />
          <h2 className="text-white font-semibold text-lg">Add Decoy Account</h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {field('phoneNumber', 'Phone Number *', '+1234567890')}
          {field('apiId', 'API ID *', '12345678')}
          {field('apiHash', 'API Hash *', 'abcdef1234...')}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Session String *</label>
            <textarea
              value={form.sessionString}
              onChange={(e) => setForm((f) => ({ ...f, sessionString: e.target.value }))}
              placeholder="Paste GramJS StringSession here..."
              rows={4}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 resize-none font-mono text-xs"
              required
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 text-sm text-gray-400 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <Spinner className="size-4" /> : <FontAwesomeIcon icon={faPlus} />}
              Add Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateAdminModal({ onClose }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(`${BASE}/auth/signup`, form, { headers: adminHeaders() });
      toast.success('New admin account created');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to create admin');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[rgb(10_18_30)] border border-gray-700 rounded-2xl p-6 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-5">
          <FontAwesomeIcon icon={faUserPlus} className="text-primary-400" />
          <h2 className="text-white font-semibold text-lg">Create Admin Account</h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="admin@example.com"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Min 8 characters"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
              required
              minLength={8}
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 text-sm text-gray-400 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <Spinner className="size-4" /> : <FontAwesomeIcon icon={faUserPlus} />}
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UpdateSessionModal({ account, onClose, onUpdated }) {
  const [sessionString, setSessionString] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.patch(
        `${BASE}/decoy-accounts/${account._id}/session`,
        { sessionString },
        { headers: adminHeaders() },
      );
      onUpdated();
      onClose();
      toast.success('Session string updated');
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to update session string');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[rgb(10_18_30)] border border-gray-700 rounded-2xl p-6 w-full max-w-lg">
        <div className="flex items-center gap-2 mb-1">
          <FontAwesomeIcon icon={faPen} className="text-primary-400" />
          <h2 className="text-white font-semibold text-lg">Update Session String</h2>
        </div>
        <div className="text-xs text-gray-500 mb-5 font-mono">{account.phoneNumber}</div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">New Session String *</label>
            <textarea
              value={sessionString}
              onChange={(e) => setSessionString(e.target.value)}
              placeholder="Paste new GramJS StringSession here..."
              rows={5}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 resize-none font-mono text-xs"
              required
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 text-sm text-gray-400 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <Spinner className="size-4" /> : <FontAwesomeIcon icon={faPen} />}
              Update
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminAccountsPage() {
  const [loggedIn, setLoggedIn] = useState(!!sessionStorage.getItem('admin_token'));
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [editingAccount, setEditingAccount] = useState(null);

  const logout = () => {
    sessionStorage.removeItem('admin_token');
    setLoggedIn(false);
  };

  useEffect(() => {
    if (!loggedIn) return;
    setLoading(true);
    axios.get(`${BASE}/decoy-accounts`, { headers: adminHeaders() })
      .then((res) => setAccounts(res.data.data?.accounts ?? []))
      .catch((err) => {
        if (err.response?.status === 401) {
          sessionStorage.removeItem('admin_token');
          setLoggedIn(false);
        } else {
          toast.error('Failed to fetch accounts');
        }
      })
      .finally(() => setLoading(false));
  }, [loggedIn]);

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      await axios.delete(`${BASE}/decoy-accounts/${id}`, { headers: adminHeaders() });
      setAccounts((prev) => prev.filter((a) => a._id !== id));
      toast.success('Account removed');
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to delete account');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[rgb(0_8_15)] text-white flex flex-col">
      <ToastContainer theme="dark" position="top-right" />

      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <FontAwesomeIcon icon={faShieldHalved} className="text-primary-400 text-xl" />
          <div>
            <div className="text-lg font-semibold">Decoy Account Pool</div>
            <div className="text-xs text-gray-500">Manage GramJS accounts available for decoy sessions</div>
          </div>
        </div>

        {loggedIn && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreateAdmin(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <FontAwesomeIcon icon={faUserPlus} className="text-sm" />
              <span className="hidden sm:inline">New Admin</span>
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors"
            >
              <FontAwesomeIcon icon={faPlus} className="text-sm" />
              <span className="hidden sm:inline">Add Account</span>
            </button>
            <button
              onClick={logout}
              title="Logout"
              className="w-9 h-9 flex items-center justify-center text-gray-400 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <FontAwesomeIcon icon={faRightFromBracket} />
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col px-6 py-6">
        {!loggedIn ? (
          <AdminLoginScreen onLogin={() => setLoggedIn(true)} />
        ) : loading ? (
          <div className="flex justify-center items-center flex-1">
            <Spinner className="size-6" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 text-center">
            <FontAwesomeIcon icon={faPhone} className="text-gray-700 text-4xl mb-4" />
            <div className="text-gray-400 text-sm">No decoy accounts in pool</div>
            <div className="text-gray-600 text-xs mt-1">Add a GramJS account to start using the decoy bot</div>
          </div>
        ) : (
          <div className="space-y-3 max-w-3xl w-full mx-auto">
            {accounts.map((acc) => {
              const sessionCount = acc.activeSessions?.length ?? 0;
              const busy = sessionCount > 0;
              return (
                <div
                  key={acc._id}
                  className="flex items-center gap-4 p-4 border border-gray-800 rounded-xl bg-gray-900/30"
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                    busy
                      ? 'bg-yellow-500/10 border border-yellow-500/30'
                      : 'bg-green-500/10 border border-green-500/30'
                  }`}>
                    <FontAwesomeIcon
                      icon={busy ? faLock : faLockOpen}
                      className={busy ? 'text-yellow-400 text-sm' : 'text-green-400 text-sm'}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm">{acc.phoneNumber}</div>
                    <div className="text-xs text-gray-500 mt-0.5">API ID: {acc.apiId}</div>
                    {sessionCount > 0 && (
                      <div className="text-xs text-yellow-500/70 mt-0.5">
                        {sessionCount} active session{sessionCount !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${
                    busy
                      ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
                      : 'text-green-400 bg-green-500/10 border-green-500/30'
                  }`}>
                    {busy ? `${sessionCount} session${sessionCount !== 1 ? 's' : ''}` : 'Available'}
                  </span>
                  <button
                    onClick={() => setEditingAccount(acc)}
                    title="Update session string"
                    className="w-8 h-8 flex items-center justify-center text-blue-400 bg-blue-500/10 border border-blue-500/30 rounded-lg hover:bg-blue-500/20 transition-colors shrink-0"
                  >
                    <FontAwesomeIcon icon={faPen} className="text-xs" />
                  </button>
                  <button
                    onClick={() => handleDelete(acc._id)}
                    disabled={!!deletingId || busy}
                    title={busy ? `Stop all ${sessionCount} session(s) first` : 'Delete account'}
                    className="w-8 h-8 flex items-center justify-center text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                  >
                    {deletingId === acc._id
                      ? <Spinner className="size-3" />
                      : <FontAwesomeIcon icon={faTrash} className="text-xs" />
                    }
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showAdd && (
        <AddAccountModal
          onClose={() => setShowAdd(false)}
          onAdded={(acc) => setAccounts((prev) => [...prev, acc])}
        />
      )}

      {showCreateAdmin && (
        <CreateAdminModal onClose={() => setShowCreateAdmin(false)} />
      )}

      {editingAccount && (
        <UpdateSessionModal
          account={editingAccount}
          onClose={() => setEditingAccount(null)}
          onUpdated={() => setEditingAccount(null)}
        />
      )}
    </div>
  );
}
