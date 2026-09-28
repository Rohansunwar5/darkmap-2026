import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDecoy } from '../../context/DecoyContext';
import Spinner from '../dashboard/components/common/spinner';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRobot, faPlus, faChevronRight, faPause, faPlay } from '@fortawesome/free-solid-svg-icons';
import { toast } from 'react-toastify';
import { buildDecoyAccountProfiles, getWarningMeta } from '../../utils/decoyProfiles';

const STATUS_COLORS = {
  active: 'text-green-400 bg-green-500/10 border-green-500/30',
  paused: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  stopped: 'text-red-400 bg-red-500/10 border-red-500/30',
};

export function CreateSessionModal({ onClose, onCreate, initialDecoyAccountId = '', initialStep = 1 }) {
  const { fetchAccounts } = useDecoy();
  const [form, setForm] = useState({ targetIdentifier: '', targetContext: '', targetName: '', decoyAccountId: '' });
  const [loading, setLoading] = useState(false);
  const [showPersona, setShowPersona] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const decoyAccounts = buildDecoyAccountProfiles(accounts);
  const [step, setStep] = useState(initialStep); // 1 = select account, 2 = target details

  useEffect(() => {
    let mounted = true;
    fetchAccounts().then((data) => {
      if (mounted) {
        setAccounts(data);
        setLoadingAccounts(false);
      }
    }).catch(err => {
      console.error('Failed to fetch accounts:', err);
      if (mounted) setLoadingAccounts(false);
    });
    return () => { mounted = false; };
  }, [fetchAccounts]);

  useEffect(() => {
    if (initialDecoyAccountId) {
      setForm((f) => ({ ...f, decoyAccountId: initialDecoyAccountId }));
      setStep(initialStep);
    }
  }, [initialDecoyAccountId, initialStep]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.targetIdentifier.trim() || !form.targetContext.trim()) return;
    setLoading(true);
    try {
      await onCreate(form);
      onClose();
      toast.success('Decoy session started');
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[rgb(5_12_22)] border border-gray-800 rounded-2xl p-6 w-full max-w-lg">
        <div className="flex items-center gap-2 mb-4">
          <FontAwesomeIcon icon={faRobot} className="text-primary-400" />
          <h2 className="text-white font-semibold text-lg">New Decoy Session</h2>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-6 px-8">
          <div className="flex flex-col items-center">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step >= 1 ? 'bg-primary-600 text-white shadow-[0_0_10px_rgba(0,209,255,0.3)]' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}>1</div>
            <span className={`text-[9px] mt-1.5 font-bold uppercase tracking-widest transition-colors ${step >= 1 ? 'text-primary-400' : 'text-gray-500'}`}>Profile</span>
          </div>
          <div className={`flex-1 h-[2px] mx-3 transition-colors ${step >= 2 ? 'bg-primary-600 shadow-[0_0_8px_rgba(0,209,255,0.3)]' : 'bg-gray-800'}`}></div>
          <div className="flex flex-col items-center">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step >= 2 ? 'bg-primary-600 text-white shadow-[0_0_10px_rgba(0,209,255,0.3)]' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}>2</div>
            <span className={`text-[9px] mt-1.5 font-bold uppercase tracking-widest transition-colors ${step >= 2 ? 'text-primary-400' : 'text-gray-500'}`}>Details</span>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {step === 1 ? (
            <div>
              {loadingAccounts ? (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Spinner className="size-3" /> Loading Decoy Accounts...
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-gray-400 mb-2">Select Decoy Account *</label>
                  {decoyAccounts.length === 0 ? (
                    <div className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-3 text-sm text-gray-400 text-center">
                      {accounts.length === 0 ? 'No Accounts Available' : 'No matching profile mapping found'}
                    </div>
                  ) : (
                    <div className="grid gap-3 max-h-[340px] overflow-y-auto pr-1 sm:grid-cols-2">
                      {decoyAccounts.map((acc) => {
                        const isSelected = form.decoyAccountId === acc._id;
                        const warningMeta = getWarningMeta(acc.warning);

                        return (
                          <button
                            key={acc._id}
                            type="button"
                            onClick={() => setForm((f) => ({ ...f, decoyAccountId: acc._id }))}
                            className={`w-full text-left rounded-xl p-2.5 border transition-all ${isSelected ? 'border-primary-500 bg-primary-500/10 shadow-[0_0_8px_rgba(0,209,255,0.1)]' : 'border-gray-700 bg-gray-900 hover:border-gray-500'}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 shrink-0 rounded-full overflow-hidden border border-gray-700 bg-gray-800">
                                <img
                                  src={acc.profile.avatar}
                                  alt={acc.profile.name}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <div className="text-xs font-semibold text-white truncate">{acc.profile.name}</div>
                                  {isSelected && <span className="text-[9px] uppercase tracking-widest text-primary-400">Selected</span>}
                                </div>
                                <div className="text-[10px] text-gray-400 mt-0.5 truncate">{acc.profile.bio}...</div>
                                <div className="mt-1 flex items-center gap-2">
                                  {acc.profile.handle ? (
                                    <div className="text-[10px] text-gray-400 font-medium">{acc.profile.handle}</div>
                                  ) : null}
                                  {warningMeta && (
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border uppercase tracking-widest leading-none ${warningMeta.className}`}>
                                      {warningMeta.label}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { if (!form.decoyAccountId) { toast.error('Please select a decoy account'); return; } setStep(2); }}
                  className="ml-auto py-1.5 px-4 text-xs rounded-lg bg-primary-600 hover:bg-primary-500 transition-colors text-white font-bold tracking-wide shadow-[0_0_10px_rgba(0,209,255,0.2)]"
                >
                  Continue
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-2">
                <label className="block text-xs text-gray-400 mb-1">Target Identifier *</label>
                <input
                  value={form.targetIdentifier}
                  onChange={(e) => setForm((f) => ({ ...f, targetIdentifier: e.target.value }))}
                  placeholder="+1234567890 or @username"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
                  required
                />
              </div>
              <div className="mb-2">
                <label className="block text-xs text-gray-400 mb-1">Target Name (optional)</label>
                <input
                  value={form.targetName}
                  onChange={(e) => setForm((f) => ({ ...f, targetName: e.target.value }))}
                  placeholder="Display name for your reference"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
                />
              </div>
              {/* Collapsible base persona reveal */}
              <div className="mb-2">
                <button
                  type="button"
                  onClick={() => setShowPersona((v) => !v)}
                  className="text-xs text-gray-500 hover:text-gray-300 underline underline-offset-2 transition-colors"
                >
                  {showPersona ? 'Hide base persona ▲' : 'Show base persona ▼'}
                </button>
                {showPersona && (
                  <pre className="mt-2 text-xs text-gray-500 bg-gray-900/80 rounded-lg p-3 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto border border-gray-800">
                    {`Someone familiar with underground online marketplaces — fraud ecosystems, leaked data sellers, crypto schemes, banking mule networks, and related communities on Telegram. Builds trust gradually, gathers intelligence naturally, and adapts tone and directness to match the target as the conversation progresses.`}
                  </pre>
                )}
              </div>

              <div className="mb-2">
                <label className="block text-xs text-gray-400 mb-1">
                  Target Context * <span className="text-gray-600">(max 1000 chars)</span>
                </label>
                <textarea
                  value={form.targetContext}
                  onChange={(e) => setForm((f) => ({ ...f, targetContext: e.target.value }))}
                  placeholder={`Who is this target? What are you trying to get them to reveal?\n\nExample: "Goes by 'ph4nt0m'. Claims to have Fortune 500 employee records from a March breach. Focus on getting proof screenshots and their preferred payment method."`}
                  rows={5}
                  maxLength={1000}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 resize-none"
                  required
                />
                <div className="text-right text-xs text-gray-600 mt-1">{form.targetContext.length}/1000</div>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="py-2 flex-1 text-sm text-gray-400 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="py-2 flex-1 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? <Spinner className="size-4" /> : 'Start Session'}
                </button>
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-sm text-gray-400 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            {/* when on step 1, Continue button is rendered inside the step block */}
            {step === 1 ? null : null}
          </div>
        </form>
      </div>
    </div>
  );
}

function SessionCard({ session }) {
  const navigate = useNavigate();
  const { pauseSession, resumeSession } = useDecoy();
  const [actioning, setActioning] = useState(false);

  const handlePause = async (e) => {
    e.stopPropagation();
    setActioning(true);
    try {
      await pauseSession(session._id);
      toast.success('Session paused');
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to pause session');
    } finally {
      setActioning(false);
    }
  };

  const handleResume = async (e) => {
    e.stopPropagation();
    setActioning(true);
    try {
      await resumeSession(session._id);
      toast.success('Session resumed');
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to resume session');
    } finally {
      setActioning(false);
    }
  };

  return (
    <div
      onClick={() => navigate(`/group/decoy/${session._id}`)}
      className="flex items-center gap-4 p-4 border border-gray-800 rounded-xl bg-gradient-to-r from-gray-900/40 to-black cursor-pointer hover:border-primary-500/40 transition-all"
    >
      <div className="w-10 h-10 rounded-full bg-primary-950 border border-primary-500/30 flex items-center justify-center shrink-0">
        <FontAwesomeIcon icon={faRobot} className="text-primary-400 text-sm" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{session.targetName ?? session.targetIdentifier}</div>
        <div className="text-xs text-gray-500 truncate">{session.targetIdentifier}</div>
        <div className="text-xs text-gray-600 mt-0.5">
          Created {new Date(session.createdAt).toLocaleDateString()}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[session.status] ?? STATUS_COLORS.stopped}`}>
          {session.status}
        </span>
        {session.status === 'active' && (
          <button
            onClick={handlePause}
            disabled={actioning}
            title="Pause"
            className="w-7 h-7 flex items-center justify-center text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 rounded-lg hover:bg-yellow-500/20 transition-colors disabled:opacity-50"
          >
            {actioning ? <Spinner className="size-3" /> : <FontAwesomeIcon icon={faPause} className="text-xs" />}
          </button>
        )}
        {session.status === 'paused' && (
          <button
            onClick={handleResume}
            disabled={actioning}
            title="Resume"
            className="w-7 h-7 flex items-center justify-center text-green-400 bg-green-500/10 border border-green-500/30 rounded-lg hover:bg-green-500/20 transition-colors disabled:opacity-50"
          >
            {actioning ? <Spinner className="size-3" /> : <FontAwesomeIcon icon={faPlay} className="text-xs" />}
          </button>
        )}
        <FontAwesomeIcon icon={faChevronRight} className="text-gray-700 text-xs" />
      </div>
    </div>
  );
}

export default function DecoyPage() {
  const { sessions, loadingSessions, error, fetchSessions, createSession } = useDecoy();
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    fetchSessions();
  }, []);

  return (
    <div className="p-6 text-white min-h-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FontAwesomeIcon icon={faRobot} className="text-primary-400 text-xl" />
          <div>
            <h1 className="text-xl font-semibold">AI Decoy Sessions</h1>
            <p className="text-xs text-gray-500">Automated Telegram DM impersonation</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors"
        >
          <FontAwesomeIcon icon={faPlus} />
          New Session
        </button>
      </div>

      {loadingSessions && (
        <div className="flex justify-center items-center py-20">
          <Spinner className="size-6" />
        </div>
      )}

      {!loadingSessions && error && (
        <div className="text-red-400 text-sm text-center py-20">{error}</div>
      )}

      {!loadingSessions && !error && sessions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-primary-950/50 border border-primary-500/20 flex items-center justify-center mb-4">
            <FontAwesomeIcon icon={faRobot} className="text-primary-400 text-2xl" />
          </div>
          <div className="text-gray-400 text-sm">No decoy sessions yet</div>
          <div className="text-gray-600 text-xs mt-1">Click "New Session" to start your first bot</div>
        </div>
      )}

      {!loadingSessions && !error && sessions.length > 0 && (
        <div className="space-y-3">
          {sessions.map((session) => (
            <SessionCard key={session._id} session={session} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateSessionModal
          onClose={() => setShowCreate(false)}
          onCreate={createSession}
        />
      )}
    </div>
  );
}
