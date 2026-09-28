import React, { useState } from "react";
import PropTypes from "prop-types";
import MediaModal from "./MediaModal";

// Helper to get a date label string from a timestamp
const getDateLabel = (timestamp) => {
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return null;
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const isSameDay = (a, b) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();

    if (isSameDay(d, today)) return "Today";
    if (isSameDay(d, yesterday)) return "Yesterday";
    return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  } catch {
    return null;
  }
};

// Date separator component
const DateSeparator = ({ label }) => (
  <div className="flex items-center gap-3 my-3 select-none">
    <div className="grow h-[1px] bg-gradient-to-r from-transparent via-[#126382]/40 to-transparent" />
    <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-gray-500 bg-[#0a1520] px-3 py-1 rounded-full border border-[#126382]/20 shadow-sm">
      {label}
    </span>
    <div className="grow h-[1px] bg-gradient-to-r from-transparent via-[#126382]/40 to-transparent" />
  </div>
);

const getTagStyles = (tag) => {
  const clean = (tag || "ASSESSMENT").toUpperCase().replace(/\s+/g, "_");
  if (clean.includes("BANK") || clean.includes("FRAUD")) {
    return { color: "#00E5FF", bg: "rgba(0, 229, 255, 0.08)", border: "rgba(0, 229, 255, 0.25)" };
  }
  if (clean.includes("ESCROW")) {
    return { color: "#FBBF24", bg: "rgba(251, 191, 36, 0.08)", border: "rgba(251, 191, 36, 0.25)" };
  }
  if (clean.includes("LOGISTIC") || clean.includes("DROP")) {
    return { color: "#60A5FA", bg: "rgba(96, 165, 250, 0.08)", border: "rgba(96, 165, 250, 0.25)" };
  }
  if (clean.includes("PHISH")) {
    return { color: "#F472B6", bg: "rgba(244, 114, 182, 0.08)", border: "rgba(244, 114, 182, 0.25)" };
  }
  if (clean.includes("BYPASS") || clean.includes("OTP")) {
    return { color: "#A78BFA", bg: "rgba(167, 139, 250, 0.08)", border: "rgba(167, 139, 250, 0.25)" };
  }
  if (clean.includes("DEEPFAKE") || clean.includes("FAKE")) {
    return { color: "#34D399", bg: "rgba(52, 211, 153, 0.08)", border: "rgba(52, 211, 153, 0.25)" };
  }
  return { color: "#9CA3AF", bg: "rgba(156, 163, 175, 0.08)", border: "rgba(156, 163, 175, 0.25)" };
};

const MediaRenderer = ({ msg, onMediaClick }) => {
  if (!msg.mediaUrl) return null;
  const kind = msg.mediaKind || "photo";

  const handleDownload = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const response = await fetch(msg.mediaUrl);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      const filename = msg.mediaUrl.split('/').pop() || 'downloaded_file';
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("Download failed:", err);
      window.open(msg.mediaUrl, '_blank');
    }
  };
  
  if (kind === "photo" || kind === "sticker" || kind === "gif") {
    return (
      <div className="mb-2 pr-8">
        <img 
          src={msg.mediaUrl} 
          alt="media" 
          loading="lazy" 
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onMediaClick) onMediaClick(msg.mediaUrl, kind);
          }}
          className="w-full rounded-lg max-h-64 object-contain cursor-pointer hover:opacity-90 transition-opacity relative z-10" 
        />
      </div>
    );
  }
  if (kind === "video") {
    return (
      <div 
        className="mb-2 pr-8 relative cursor-pointer hover:opacity-90 transition-opacity group z-10" 
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (onMediaClick) onMediaClick(msg.mediaUrl, kind);
        }}
      >
        <video src={msg.mediaUrl} preload="metadata" className="w-full rounded-lg max-h-64 pointer-events-none" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 rounded-lg transition-colors pointer-events-none">
          <svg className="w-10 h-10 text-white opacity-80" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
          </svg>
        </div>
      </div>
    );
  }
  if (kind === "audio") {
    return (
      <div className="mb-2 pr-8">
        <audio src={msg.mediaUrl} controls className="w-full max-w-[200px]" />
      </div>
    );
  }
  return (
    <div className="mb-2 pr-8 relative z-10">
      <button 
        onClick={handleDownload}
        className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#00E5FF]/10 border border-[#00E5FF]/30 rounded-lg text-xs font-bold text-[#00E5FF] hover:bg-[#00E5FF]/20 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Download File
      </button>
    </div>
  );
};

const ChatArea = ({
  selectedProfile,
  targetUsername,
  messages,
  inputValue,
  setInputValue,
  onSubmitMessage,
  isTyping,
  chatEndRef,
  paused,
  manual,
  briefActive,
  onPauseResume,
  onBriefToggle,
  onSendBrief,
  
  // Premium Layout props
  premium,
  onExport,
  tag,
  elapsed,
  inputMode = "brief",
  setInputMode,
  onManualToggle,
  onDelete,
}) => {
  const [inputFocused, setInputFocused] = useState(false);
  const [aiAuto, setAiAuto] = useState(true);
  const [briefInput, setBriefInput] = useState("");
  
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMedia, setModalMedia] = useState({ url: null, kind: null });

  const handleMediaClick = (url, kind) => {
    setModalMedia({ url, kind });
    setModalOpen(true);
  };

  const aiActive = !paused && !manual;
  const inputDisabled = aiActive && !briefActive;
  const isOnline = !elapsed || elapsed === "just now";

  // Normal mode placeholders
  let placeholder = "Click Brief to explain / Pause to message";
  if (briefActive) {
    placeholder = "Explain target's behavior / give briefing...";
  } else if (paused || manual) {
    placeholder = "Type manual message to send...";
  }

  // Handle form submit in standard mode
  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputDisabled) return;

    if (briefActive) {
      if (inputValue.trim()) {
        onSendBrief(inputValue.trim());
        setInputValue("");
      }
    } else {
      onSubmitMessage(e);
    }
  };

  // Handle premium form submit — the bottom composer is manual-only.
  // It always sends a real message as the decoy (auto-pausing the bot if needed,
  // handled upstream in onSubmitMessage). AI steering lives in the right panel.
  const handlePremiumSubmit = (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    onSubmitMessage(e);
  };

  const tagStyles = getTagStyles(tag);

  if (premium) {
    return (
      <div className="grow flex flex-col h-full overflow-hidden font-sans select-none bg-[#00070D]">
        
        <div id="chat-feed-export-container" className="flex flex-col grow overflow-hidden">
          {/* PREMIUM HEADER BAR */}
          <div className="flex items-center px-4 py-2 shrink-0 justify-between border-b border-[#126382]/20 bg-[#000B14]">
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center relative shrink-0"
                style={{ border: "1px solid #126382/30", background: "linear-gradient(0deg, #000B14 0%, #001A2C 100%)" }}
              >
                <svg className="w-5 h-5 z-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {targetUsername && (
                  <img 
                    src={`https://tgpfp.darkmap.org/pfp?username=@${targetUsername.replace(/^@/, "")}`}
                    className="absolute inset-0 w-full h-full rounded-full object-cover z-10"
                    onError={(e) => { e.target.style.display = 'none'; }}
                    alt=""
                  />
                )}
                {isOnline && <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 border border-[#000B14] z-20" />}
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-white tracking-wider leading-tight">
                    {targetUsername}
                  </h3>
                  {tag && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[7px] font-bold border uppercase tracking-wider leading-none"
                      style={{
                        color: tagStyles.color,
                        background: tagStyles.bg,
                        borderColor: tagStyles.border,
                      }}
                    >
                      {tag}
                    </span>
                  )}
                </div>
                {isOnline ? (
                  <span className="text-[9px] text-emerald-400 font-semibold uppercase tracking-wider flex items-center gap-1 leading-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Online
                  </span>
                ) : (
                  <span className="text-[9px] text-gray-500 font-semibold uppercase tracking-wider flex items-center gap-1 leading-none">
                    last seen {elapsed}
                  </span>
                )}
              </div>
            </div>
            
            {/* Header Action Icons */}
            <div className="flex items-center gap-3 text-gray-500">
              {onDelete && (
                <button onClick={onDelete} className="text-red-500/70 hover:text-red-400 transition-colors" title="Delete Session">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
              <button className="hover:text-white transition-colors" title="Sync Logs">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button className="hover:text-white transition-colors" title="Notifications">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </button>
              <button onClick={onExport} className="hover:text-white transition-colors" title="Export Chat">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </button>
            </div>
          </div>

          {/* MESSAGES LIST FEED */}
          <div 
            id="chat-messages-feed"
            className="grow p-4 overflow-y-auto flex flex-col gap-3 custom-scrollbar bg-[#020A10]/30"
            style={{ scrollbarWidth: "thin", scrollbarColor: "#17212B #00070D" }}
          >
            {messages.map((msg, idx) => {
              const isUser = msg.sender === "user";
              // Date separator logic
              const currentLabel = getDateLabel(msg.timestamp);
              const prevLabel = idx > 0 ? getDateLabel(messages[idx - 1].timestamp) : null;
              const showDateSep = currentLabel && currentLabel !== prevLabel;

              if (msg.role === 'directive') {
                return (
                  <React.Fragment key={msg.id}>
                    {showDateSep && <DateSeparator label={currentLabel} />}
                    <div className="self-center my-1 px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider text-[#FBBF24] bg-[#FBBF24]/10 border border-[#FBBF24]/30 select-none">
                      ⚙ {msg.text}
                    </div>
                  </React.Fragment>
                );
              }

              return (
                <React.Fragment key={msg.id}>
                  {showDateSep && <DateSeparator label={currentLabel} />}
                  <div
                    className={`flex flex-col max-w-[75%] ${isUser ? "self-start items-start animate-fade-in-left" : "self-end items-end animate-fade-in-right"}`}
                  >
                  {/* DECOY LABELS (ONLY on non-user/bot side) */}
                  {!isUser && (
                    <span
                      className="text-[7.5px] font-bold uppercase tracking-widest mb-1 px-1.5 py-[2px] rounded flex items-center gap-1 select-none"
                      style={{
                        color: msg.role === 'manual' ? "#F472B6" : "#00E5FF",
                        background: msg.role === 'manual' ? "rgba(244, 114, 182, 0.05)" : "rgba(0, 229, 255, 0.05)",
                        border: msg.role === 'manual' ? "1px solid rgba(244, 114, 182, 0.2)" : "1px solid rgba(0, 229, 255, 0.2)",
                      }}
                    >
                      <span className={`w-1 h-1 rounded-full ${msg.role === 'manual' ? 'bg-[#F472B6]' : 'bg-[#00E5FF] animate-pulse'}`} />
                      {msg.role === 'manual' ? 'DECOY • MANUAL' : 'DECOY • AI'}
                    </span>
                  )}
                  {isUser && (
                    <span
                      className="text-[7.5px] font-bold uppercase tracking-widest mb-1 px-1.5 py-[2px] rounded flex items-center gap-1 select-none text-gray-500"
                    >
                      TARGET
                    </span>
                  )}
                  
                  {/* Bubble styling */}
                  <div
                    className="px-4 py-2.5 text-xs font-normal relative"
                    style={isUser ? {
                      background: "#161B22",
                      border: "1px solid rgba(99,102,241,0.25)",
                      borderRadius: "12px 12px 12px 0",
                      color: "#D1D5DB",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
                    } : {
                      background: "rgba(0, 229, 255, 0.05)",
                      border: "1px solid rgba(0, 229, 255, 0.35)",
                      borderRadius: "12px 12px 0 12px",
                      color: "#E5E7EB",
                      boxShadow: "0 1px 8px rgba(0, 229, 255, 0.08)",
                    }}
                  >
                    <MediaRenderer msg={msg} onMediaClick={handleMediaClick} />
                    {msg.text && msg.text !== '[Image]' && msg.text !== '[Media]' && (
                      <div className="pr-12 leading-relaxed break-words font-sans">{msg.text}</div>
                    )}
                    {!msg.mediaUrl && (msg.text === '[Image]' || msg.text === '[Media]') && (
                      <div className="pr-12 leading-relaxed break-words font-sans opacity-60 italic">{msg.text}</div>
                    )}
                    
                    {/* Time + status indicators */}
                    <div 
                      className="absolute bottom-1 right-2 flex items-center gap-1 select-none font-mono"
                      style={{ fontSize: "8px", color: isUser ? "rgba(255,255,255,0.4)" : "rgba(0, 229, 255, 0.6)" }}
                    >
                      <span>{msg.time}</span>
                      <span className="font-sans font-bold">✓✓</span>
                    </div>
                  </div>
                  </div>
                </React.Fragment>
              );
            })}

            {isTyping && (
              <div className="flex flex-col self-start items-start max-w-[75%]">
                <span
                  className="text-[7.5px] font-bold uppercase tracking-widest mb-1 px-1.5 py-[2px] rounded flex items-center gap-1 select-none"
                  style={{
                    color: "#00E5FF",
                    background: "rgba(0, 229, 255, 0.05)",
                    border: "1px solid rgba(0, 229, 255, 0.2)",
                  }}
                >
                  DECOY • RUNNING
                </span>
                <div
                  className="px-4 py-2.5 flex items-center gap-1.5 shrink-0 rounded-xl border border-[#00d1ff]/20"
                  style={{ background: "rgba(0, 229, 255, 0.05)" }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00d1ff] animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00d1ff] animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00d1ff] animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* BOTTOM PREMIUM CONTROL PANEL */}
        <div className="flex items-center justify-between px-4 py-2.5 shrink-0 border-t border-[#126382]/20 bg-[#000B14]">
          <div className="flex items-center gap-3">
            {/* AI AUTO SWITCH */}
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">AI AUTO</span>
              <button
                type="button"
                onClick={() => setAiAuto(!aiAuto)}
                className={`w-8 h-4.5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none flex items-center relative ${
                  aiAuto ? "bg-[#00d1ff]" : "bg-gray-800"
                }`}
              >
                <span
                  className={`w-3.5 h-3.5 rounded-full bg-black shadow-md transform transition-transform duration-200 ${
                    aiAuto ? "translate-x-3.5" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-[9px] font-bold text-white uppercase tracking-wider">ON</span>
            </div>

            {/* RESUME / PAUSE BUTTONS */}
            <div className="flex items-center gap-2 border-l border-[#126382]/20 pl-3">
              <button
                type="button"
                onClick={() => {
                  if (paused) {
                    onPauseResume();
                    setInputMode("brief");
                  }
                }}
                className={`px-3 py-1 rounded text-[9px] font-bold uppercase tracking-wider border transition-all ${
                  paused
                    ? "bg-[#34D399]/15 border-[#34D399]/40 text-[#34D399] hover:bg-[#34D399]/25"
                    : "bg-transparent border-gray-800 text-gray-500 cursor-default"
                }`}
              >
                Resume
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!paused) onPauseResume();
                }}
                className={`px-3 py-1 rounded text-[9px] font-bold uppercase tracking-wider border transition-all ${
                  !paused
                    ? "bg-[#F59E0B]/15 border-[#F59E0B]/40 text-[#F59E0B] hover:bg-[#F59E0B]/25"
                    : "bg-transparent border-gray-800 text-gray-500 cursor-default"
                }`}
              >
                Pause
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onManualToggle) {
                    onManualToggle();
                    if (!manual) setInputMode("manual");
                    else setInputMode("brief");
                  }
                }}
                className={`px-3 py-1 rounded text-[9px] font-bold uppercase tracking-wider border transition-all ${
                  manual
                    ? "bg-[#F472B6]/15 border-[#F472B6]/40 text-[#F472B6] hover:bg-[#F472B6]/25"
                    : "bg-transparent border-[#F472B6]/20 text-[#F472B6]/60 hover:bg-[#F472B6]/10 hover:text-[#F472B6]"
                }`}
              >
                {manual ? 'Manual' : 'Manual'}
              </button>
            </div>
          </div>

          {/* GENERATE CASE REPORT PDF BUTTON */}
          <button
            type="button"
            onClick={onExport}
            className="flex items-center gap-1.5 px-3 py-1 rounded border border-[#C4B5FD]/40 bg-[#C4B5FD]/10 text-[#C4B5FD] text-[9px] font-bold uppercase tracking-wider hover:bg-[#C4B5FD]/20 transition-all active:scale-95"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export Chat as PDF
          </button>
        </div>

        {/* BOTTOMMOST INPUT PANEL */}
        <form
          onSubmit={handlePremiumSubmit}
          className="flex items-center gap-3 px-4 py-3 shrink-0 bg-[#00050A] border-t border-[#126382]/20"
        >
          <div className="grow flex items-center gap-2 bg-[#030911] border border-[#126382]/30 rounded-lg pl-3 pr-2 py-1.5 focus-within:border-[#F472B6]/50 transition-colors">
            <span className="text-[9px] font-bold uppercase tracking-widest shrink-0 text-[#F472B6] select-none">
              Chat Manually
            </span>
            <div className="w-[1px] h-4 bg-[#126382]/30 shrink-0"></div>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type message to send as the decoy (pauses AI)..."
              className="w-full bg-transparent text-xs text-white placeholder-gray-700 font-sans focus:outline-none min-w-0"
            />
            <button
              type="submit"
              disabled={!inputValue.trim()}
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[#F472B6] bg-pink-950/40 border border-[#F472B6]/20 hover:bg-[#F472B6]/20 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
            >
              <svg className="w-3.5 h-3.5 rotate-90" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
              </svg>
            </button>
          </div>
        </form>

        <MediaModal 
          isOpen={modalOpen} 
          onClose={() => setModalOpen(false)} 
          mediaUrl={modalMedia.url} 
          mediaKind={modalMedia.kind} 
        />
      </div>
    );
  }

  // --- ORIGINAL STANDARD MODE ---
  return (
    <div className="grow flex flex-col h-full overflow-hidden font-sans select-none" style={{ background: "rgb(2, 2, 24)" }}>
      <div id="chat-feed-export-container" className="flex flex-col grow overflow-hidden bg-[rgb(2,2,24)]">
        {/* Target Info Section below Header */}
        <div className="flex items-center px-3 py-1.5 shrink-0 select-none justify-between border-b" style={{ borderColor: "#126382", background: "#000B14" }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center relative shrink-0"
            style={{ border: "1px solid #126382", background: "linear-gradient(0deg, #000B14 0%, #001A2C 100%)" }}
          >
            <svg className="w-4 h-4 z-0" style={{ color: "#00d1ff" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            {targetUsername && (
              <img 
                src={`https://tgpfp.darkmap.org/pfp?username=@${targetUsername.replace(/^@/, "")}`}
                className="absolute inset-0 w-full h-full rounded-full object-cover z-10"
                onError={(e) => { e.target.style.display = 'none'; }}
                alt=""
              />
            )}
            <span
              className="absolute bottom-0 right-0 w-2 h-2 rounded-full z-20"
              style={{ background: "#10B981", border: "2px solid #000B14" }}
            />
          </div>
          <div className="flex flex-col gap-[3px]">
             <h3 className="text-[12px] font-medium text-white tracking-wide leading-none">
               {targetUsername}
             </h3>
             <div className="flex items-center gap-1.5">
                <span className="px-1 py-[1px] rounded text-[7px] font-bold bg-[#00d1ff]/10 text-[#00d1ff] border border-[#00d1ff]/30 uppercase leading-tight">
                  {selectedProfile?.name || "Target"}
                </span>
                <span className="text-[9px] text-gray-500 flex items-center gap-0.5 leading-none">
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Last active now
                </span>
             </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
            {onDelete && (
              <button onClick={onDelete} className="text-red-500/70 hover:text-red-400 transition-colors mr-1" title="Delete Session">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
            {/* Right-side mode flag */}
            {manual ? (
              <span className="text-[#F472B6] text-[9px] font-semibold flex items-center gap-1 border border-[#F472B6]/30 px-1.5 py-0.5 rounded bg-[#F472B6]/10">
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                MANUAL
              </span>
            ) : (
              <span className="text-[#00d1ff] text-[9px] font-semibold flex items-center gap-1 border border-[#00d1ff]/30 px-1.5 py-0.5 rounded bg-[#00d1ff]/10">
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" /></svg>
                ONLINE
              </span>
            )}
        </div>
      </div>

      <div 
        id="chat-messages-feed"
        className="grow p-4 overflow-y-auto flex flex-col gap-2.5 custom-scrollbar" 
        style={{ scrollbarWidth: "thin", scrollbarColor: "#17212B rgb(2, 2, 24)" }}
      >
        {messages.map((msg, idx) => {
          const isUser = msg.sender === "user";
          // Date separator logic
          const currentLabel = getDateLabel(msg.timestamp);
          const prevLabel = idx > 0 ? getDateLabel(messages[idx - 1].timestamp) : null;
          const showDateSep = currentLabel && currentLabel !== prevLabel;

          if (msg.role === 'directive') {
            return (
              <React.Fragment key={msg.id}>
                {showDateSep && <DateSeparator label={currentLabel} />}
                <div className="self-center my-1 px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider text-[#FBBF24] bg-[#FBBF24]/10 border border-[#FBBF24]/30 select-none">
                  ⚙ {msg.text}
                </div>
              </React.Fragment>
            );
          }

          return (
            <React.Fragment key={msg.id}>
              {showDateSep && <DateSeparator label={currentLabel} />}
              <div
                className={`flex flex-col max-w-[85%] ${isUser ? "self-start items-start animate-fade-in-left" : "self-end items-end animate-fade-in-right"}`}
              >
              {/* Decoy label above bot bubbles */}
              {!isUser && (
                <span
                  className="text-[7px] font-bold uppercase tracking-widest mb-0.5 px-1.5 py-[2px] rounded-full"
                  style={{
                    color: msg.role === 'manual' ? "#F472B6" : "#34D399",
                    background: msg.role === 'manual' ? "rgba(244, 114, 182, 0.08)" : "rgba(16,185,129,0.08)",
                    border: msg.role === 'manual' ? "1px solid rgba(244, 114, 182, 0.28)" : "1px solid rgba(16,185,129,0.28)",
                    letterSpacing: "0.12em",
                  }}
                >
                  ⬡ {msg.role === 'manual' ? 'Manual' : 'Decoy'}
                </span>
              )}
              <div
                className="px-3.5 py-2 text-xs md:text-sm font-normal relative"
                style={isUser ? {
                  background: "#182533",
                  border: "1px solid rgba(18,99,130,0.35)",
                  borderRadius: "10px 10px 10px 0",
                  color: "#E5E7EB",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
                } : {
                  background: "rgba(16,185,129,0.08)",
                  border: "1px solid rgba(16,185,129,0.35)",
                  borderRadius: "10px 10px 0 10px",
                  color: "#E5E7EB",
                  boxShadow: "0 1px 8px rgba(16,185,129,0.08)",
                }}
              >
                {/* Message Text */}
                <MediaRenderer msg={msg} onMediaClick={handleMediaClick} />
                {msg.text && msg.text !== '[Image]' && msg.text !== '[Media]' && (
                  <div className="pr-12 leading-relaxed break-words">{msg.text}</div>
                )}
                {!msg.mediaUrl && (msg.text === '[Image]' || msg.text === '[Media]') && (
                  <div className="pr-12 leading-relaxed break-words opacity-60 italic">{msg.text}</div>
                )}
                
                {/* Timestamp + ticks */}
                <div 
                  className="absolute bottom-1 right-1.5 flex items-center gap-1 select-none font-mono"
                  style={{ fontSize: "8px", color: isUser ? "rgba(255,255,255,0.45)" : "rgba(52,211,153,0.6)" }}
                >
                  <span>{msg.time}</span>
                  {isUser && (
                    <span className="font-sans font-bold" style={{ color: "#00d1ff" }}>✓✓</span>
                  )}
                  {!isUser && (
                    <span className="font-sans font-bold" style={{ color: "#34D399" }}>✓✓</span>
                  )}
                </div>
              </div>
              </div>
            </React.Fragment>
          );
        })}

        {isTyping && (
          <div className="flex flex-col self-start items-start max-w-[75%]">
            <div
              className="px-4 py-2.5 flex items-center gap-1 shrink-0"
              style={{
                background: "#182533",
                borderRadius: "10px 10px 10px 0",
                boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#00d1ff", animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#00d1ff", animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#00d1ff", animationDelay: "300ms" }} />
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
      </div>

      {/* Input panel with Brief & Pause buttons */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 px-3 py-2.5 shrink-0"
        style={{ borderTop: "1px solid #101921", background: "#17212B" }}
      >
        {/* Brief Button */}
        <button
          type="button"
          onClick={onBriefToggle}
          className="shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all duration-200 active:scale-95"
          style={{
            background: briefActive ? "rgba(59,130,246,0.20)" : "rgba(59,130,246,0.06)",
            border: `1px solid ${briefActive ? "rgba(59,130,246,0.7)" : "rgba(59,130,246,0.25)"}`,
            color: briefActive ? "#60A5FA" : "#3B82F6",
            boxShadow: briefActive ? "0 0 10px rgba(59,130,246,0.30)" : "none",
          }}
          title="Send a briefing instruction to the AI"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Brief
        </button>

        {/* Pause / Resume Button */}
        <button
          type="button"
          onClick={onPauseResume}
          className="shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all duration-200 active:scale-95"
          style={{
            background: paused
              ? "rgba(16,185,129,0.15)"
              : "rgba(245,158,11,0.08)",
            border: `1px solid ${paused
              ? "rgba(16,185,129,0.6)"
              : "rgba(245,158,11,0.30)"}`,
            color: paused ? "#34D399" : "#FBBF24",
            boxShadow: paused
              ? "0 0 10px rgba(16,185,129,0.25)"
              : "none",
          }}
          title={paused ? "Resume AI Decoy" : "Pause AI & type manually"}
        >
          {paused ? (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Resume
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Pause
            </>
          )}
        </button>

        {/* Input box */}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={inputDisabled}
          placeholder={placeholder}
          className="grow px-3 py-1.5 rounded text-xs md:text-sm text-white placeholder-gray-600 font-sans disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: "#161F27",
            border: `1px solid ${inputFocused ? (briefActive ? "#3B82F6" : "#00d1ff") : "#1A252F"}`,
            outline: "none",
            color: "white",
          }}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
        />

        {/* Send button */}
        <button
          type="submit"
          disabled={inputDisabled || !inputValue.trim()}
          className="w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed text-white"
          style={{
            background: briefActive ? "#2563EB" : paused ? "#10B981" : "#2B5278",
          }}
        >
          <svg className="w-3.5 h-3.5 md:w-4 md:h-4 transform rotate-45 -translate-x-[1px] translate-y-[0.5px]" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
          </svg>
        </button>
      </form>

      <MediaModal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)} 
        mediaUrl={modalMedia.url} 
        mediaKind={modalMedia.kind} 
      />
    </div>
  );
};

ChatArea.propTypes = {
  selectedProfile: PropTypes.shape({
    name: PropTypes.string.isRequired,
  }),
  targetUsername: PropTypes.string.isRequired,
  messages: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      sender: PropTypes.string.isRequired,
      text: PropTypes.string.isRequired,
      time: PropTypes.string.isRequired,
      mediaUrl: PropTypes.string,
      mediaKind: PropTypes.string,
    })
  ).isRequired,
  inputValue: PropTypes.string.isRequired,
  setInputValue: PropTypes.func.isRequired,
  onSubmitMessage: PropTypes.func.isRequired,
  isTyping: PropTypes.bool.isRequired,
  chatEndRef: PropTypes.oneOfType([
    PropTypes.func,
    PropTypes.shape({ current: PropTypes.any }),
  ]).isRequired,
  paused: PropTypes.bool.isRequired,
  manual: PropTypes.bool.isRequired,
  briefActive: PropTypes.bool.isRequired,
  onPauseResume: PropTypes.func.isRequired,
  onBriefToggle: PropTypes.func.isRequired,
  onSendBrief: PropTypes.func.isRequired,
  premium: PropTypes.bool,
  onExport: PropTypes.func,
  tag: PropTypes.string,
};

export default ChatArea;
