import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { useDecoy } from "../../context/DecoyContext";
import { buildDecoyAccountProfiles, getWarningMeta } from "../../utils/decoyProfiles";

const AccountPrompt = ({ onSubmit, onBack }) => {
  const { fetchAccounts } = useDecoy();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [error, setError] = useState("");
  const decoyAccounts = buildDecoyAccountProfiles(accounts);

  useEffect(() => {
    let mounted = true;
    fetchAccounts().then((data) => {
      if (mounted) {
        setAccounts(data);
        setLoading(false);
      }
    }).catch(err => {
      console.error('Failed to fetch accounts:', err);
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [fetchAccounts]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedAccountId) {
      setError("Please select a decoy account to proceed.");
      return;
    }
    setError("");
    onSubmit({ accountId: selectedAccountId });
  };

  return (
    <div className="grow m-6 md:m-10 self-stretch flex items-center justify-center p-[3px] rounded-2xl gemini-galaxy-container animate-[fade-in_0.2s_ease-out]">
      <div 
        className="w-full h-full rounded-2xl flex flex-col justify-center items-center p-8 font-sans relative overflow-hidden gemini-galaxy-inner"
        style={{ background: "#000B14" }}
      >
        {/* Ambient inner glows */}
        <div className="ambient-glow-blue" style={{ width: "300px", height: "300px", filter: "blur(80px)" }} />
        <div className="ambient-glow-green" style={{ width: "300px", height: "300px", filter: "blur(80px)" }} />

        {/* Back button */}
        {onBack && (
          <button
            onClick={onBack}
            type="button"
            className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white transition-all duration-200 active:scale-95 border border-blue-900 bg-black hover:bg-primary-700 hover:border-primary-500 rounded z-20"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
            <span>Back</span>
          </button>
        )}

        {/* Form Container */}
        <div className="w-full max-w-md relative z-10">
          <div className="flex flex-col items-center mb-6 pb-5" style={{ borderBottom: "1px solid #126382" }}>
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mb-3 relative"
              style={{ border: "1px solid #126382", background: "linear-gradient(0deg, #000B14 0%, #001A2C 100%)" }}
            >
              <svg className="w-6 h-6 text-[#00d1ff]/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
              </svg>
            </div>
            <div className="text-sm font-semibold text-white tracking-wide">Select Agent</div>
          </div>

          <div className="text-center mb-5">
            <span className="text-[#00D1FF] bg-[#0B2530] font-bold p-2 text-sm tracking-wide">
              Decoy Assignment
            </span>
            <p className="text-xs text-gray-400 mt-3">
              Choose the decoy agent identity to assign to this session.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <div className="text-xs text-red-400 rounded px-3 py-2 flex items-center gap-1.5"
                style={{ border: "1px solid rgba(220,38,38,0.3)", background: "rgba(220,38,38,0.08)" }}>
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#00d1ff" }}>
                Available Accounts
              </label>
              
              {loading ? (
                <div className="flex items-center gap-2 text-xs text-gray-400 p-3 bg-[#000B14] rounded" style={{ border: "1px solid #126382" }}>
                  <svg className="animate-spin w-4 h-4 text-[#00d1ff]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Loading Decoy Accounts...
                </div>
              ) : decoyAccounts.length === 0 ? (
                <div className="p-4 rounded-xl text-sm text-gray-400 text-center" style={{ border: "1px solid #126382", background: "#000B14" }}>
                  {accounts.length === 0 ? 'No Accounts Available' : 'No matching profile mapping found'}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 max-h-[320px] overflow-y-auto pr-1">
                  {decoyAccounts.map((acc) => {
                    const isSelected = selectedAccountId === acc._id;
                    const warningMeta = getWarningMeta(acc.warning);

                    return (
                      <button
                        key={acc._id}
                        type="button"
                        onClick={() => {
                          setSelectedAccountId(acc._id);
                          setError("");
                        }}
                        className={`w-full text-left rounded-2xl p-3 transition-all duration-200 border ${isSelected ? 'border-[#00d1ff] bg-[#06202B]' : 'border-[#126382] bg-[#000B14] hover:border-[#00d1ff]/60 hover:bg-[#04141D]'}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="shrink-0 w-14 h-14 rounded-full overflow-hidden border border-[#126382] bg-[#00131F]">
                            <img
                              src={acc.profile.avatar}
                              alt={acc.profile.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-semibold text-white truncate">{acc.profile.name}</div>
                              {isSelected && <span className="text-[10px] uppercase tracking-widest text-[#00d1ff]">Selected</span>}
                            </div>
                            <div className="text-xs text-gray-400 mt-1 truncate">{acc.profile.bio}...</div>
                            <div className="mt-2 flex items-center gap-2">
                              {acc.profile.handle ? (
                                <div className="text-[12px] text-gray-400">{acc.profile.handle}</div>
                              ) : null}
                              {warningMeta && (
                                <span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-widest ${warningMeta.className}`}>
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

            <button
              type="submit"
              disabled={loading || decoyAccounts.length === 0}
              className="w-full mt-2 py-2.5 rounded text-sm font-semibold tracking-wide text-white transition-all duration-200 active:scale-[0.98] bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue to Target Setup
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

AccountPrompt.propTypes = {
  onSubmit: PropTypes.func.isRequired,
  onBack: PropTypes.func,
};

export default AccountPrompt;
