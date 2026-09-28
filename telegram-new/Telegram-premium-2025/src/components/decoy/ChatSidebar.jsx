import React, { useState, useRef, useCallback } from "react";
import PropTypes from "prop-types";

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

const ChatSidebar = ({ targets, drafts = {}, activeTargetId, onSelectTarget, onAddTarget, onBack, expanded }) => {
  const [tooltip, setTooltip] = useState({ visible: false, target: null, y: 0 });
  const sidebarRef = useRef(null);
  const hideTimer = useRef(null);
  const [searchQuery, setSearchQuery] = useState("");

  const showTooltip = useCallback((e, t) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ visible: true, target: t, y: rect.top + rect.height / 2 });
  }, []);

  const hideTooltip = useCallback(() => {
    hideTimer.current = setTimeout(() => {
      setTooltip({ visible: false, target: null, y: 0 });
    }, 80);
  }, []);

  const keepTooltip = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  // Sort targets: chats with unread notifications bubble to the top
  const sortedTargets = [...targets].sort((a, b) => {
    const aUnread = a.unseenCount || 0;
    const bUnread = b.unseenCount || 0;
    if (aUnread > 0 && bUnread === 0) return -1;
    if (aUnread === 0 && bUnread > 0) return 1;
    return bUnread - aUnread;  // higher unseen count first
  });

  // Filter targets by search query if in expanded mode
  const filteredTargets = searchQuery.trim()
    ? sortedTargets.filter(
        (t) =>
          t.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.profile?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.tag?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sortedTargets;

  const activeCount = sortedTargets.filter((t) => !t.paused).length;
  const pausedCount = sortedTargets.filter((t) => t.paused).length;

  if (expanded) {
    return (
      <div
        ref={sidebarRef}
        className="w-[18%] shrink-0 flex flex-col bg-[#00070D] border-r border-[#126382]/30 h-full overflow-hidden select-none font-sans"
      >
        {/* Expanded Top Header */}
        <div className="flex items-center justify-between px-4 py-3.5 shrink-0 border-b border-[#126382]/15">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            Targets
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-bold text-emerald-400 tracking-wider uppercase flex items-center gap-1 bg-emerald-500/5 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {activeCount} Active
            </span>
            {pausedCount > 0 && (
              <span className="text-[8px] font-bold text-amber-500 tracking-wider uppercase flex items-center gap-1 bg-amber-500/5 px-1.5 py-0.5 rounded-full border border-amber-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {pausedCount} Paused
              </span>
            )}
          </div>
        </div>

        {/* Beautiful Search Box */}
        <div className="p-3 shrink-0">
          <div className="relative flex items-center">
            <svg
              className="w-3.5 h-3.5 text-gray-500 absolute left-3 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search targets, tags..."
              className="w-full bg-[#030D16] border border-[#126382]/20 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[#00d1ff]/50 transition-all font-sans"
            />
          </div>
        </div>

        {/* Target Cards Scrollable Feed */}
        <div className="grow overflow-y-auto flex flex-col gap-1.5 p-2 custom-scrollbar">
          {filteredTargets.length > 0 ? (
            filteredTargets.map((t) => {
              const isActive = t.id === activeTargetId;
              const lastMsg =
                t.messages && t.messages.length > 0
                  ? t.messages[t.messages.length - 1]
                  : null;
              let lastMsgText = "No messages yet";
              if (lastMsg) {
                const prefix = lastMsg.sender === "bot" ? "Decoy: " : lastMsg.sender === "user" ? "Target: " : "";
                lastMsgText = `${prefix}${lastMsg.text}`;
              }
              const currentDraft = drafts[t.id];
              const hasDraft = !isActive && currentDraft && currentDraft.text.trim().length > 0;
              const displayText = hasDraft ? currentDraft.text : lastMsgText;
              const tagStyles = getTagStyles(t.tag);
              const statusColor = !t.paused ? "#10B981" : "#F59E0B";

              return (
                <div
                  key={t.id}
                  onClick={() => onSelectTarget(t.id)}
                  className={`relative shrink-0 flex flex-col gap-2 p-3 rounded-xl border cursor-pointer select-none transition-all duration-300 overflow-hidden ${
                    isActive
                      ? "bg-[linear-gradient(135deg,rgba(0,209,255,0.06)_0%,rgba(0,209,255,0.01)_100%)] border-[#00d1ff]/40 shadow-[0_0_15px_rgba(0,209,255,0.08)]"
                      : "bg-[#020A10]/40 border-[#126382]/10 hover:border-[#126382]/35 hover:bg-[#020A10]/70"
                  }`}
                >
                  {isActive && <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-gradient-to-b from-blue-500 to-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.5)]" />}
                  <div className="flex items-start justify-between gap-2.5">
                    {/* Circle Profile on the left */}
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 relative"
                      style={{
                        border: isActive ? "1.5px solid #00d1ff" : "1px solid #126382/40",
                        background: "linear-gradient(0deg, #000B14 0%, #001A2C 100%)",
                      }}
                    >
                      <span className="text-[10px] font-bold text-[#00d1ff] tracking-widest z-0">
                        {t.profile?.name?.[0]?.toUpperCase() || t.username?.[1]?.toUpperCase() || "?"}
                      </span>
                      {t.username && (
                        <img 
                          src={`https://tgpfp.darkmap.org/pfp?username=@${t.username.replace(/^@/, "")}`}
                          className="absolute inset-0 w-full h-full rounded-full object-cover z-10"
                          onError={(e) => { e.target.style.display = 'none'; }}
                          alt=""
                        />
                      )}
                      <span
                        className="absolute bottom-0 right-0 w-2 h-2 rounded-full border border-[#00070D] z-20"
                        style={{ background: statusColor }}
                      />
                    </div>

                    {/* Middle Info */}
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <span className="text-[11px] font-bold text-white leading-tight truncate">
                        {t.username}
                      </span>
                      <span className="text-[9px] text-gray-500 font-semibold truncate leading-tight">
                        {t.profile?.name}
                      </span>
                    </div>

                    {/* Right side stats */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[8px] text-gray-600 font-semibold">
                        {t.elapsed || "just now"}
                      </span>
                      {t.unseenCount > 0 && (
                        <span className="mt-1.5 min-w-[14px] h-[14px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center shadow-[0_0_8px_rgba(239,68,68,0.5)] leading-none pt-[1px]">
                          {t.unseenCount > 99 ? '99+' : t.unseenCount}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Subtitle Message snippet */}
                  <div className={`text-[10px] ${hasDraft ? "text-red-400 font-semibold" : "text-gray-400"} leading-normal truncate italic font-sans pr-1`}>
                    {hasDraft ? <span className="text-red-500 font-bold not-italic mr-1">Draft:</span> : null}
                    {displayText}
                  </div>

                  {/* Security Threat Tag badge */}
                  {t.tag && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className="px-2 py-0.5 rounded text-[7px] font-bold border uppercase tracking-wider leading-none"
                        style={{
                          color: tagStyles.color,
                          background: tagStyles.bg,
                          borderColor: tagStyles.border,
                        }}
                      >
                        {t.tag}
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="grow flex items-center justify-center text-center text-[10px] text-gray-600 uppercase tracking-widest py-10 px-4">
              No matching targets detected
            </div>
          )}
        </div>

        {/* Deploy New Decoy bottom-aligned full button */}
        <div className="p-3 shrink-0 border-t border-[#126382]/15 mt-auto">
          <button
            onClick={onAddTarget}
            className="w-full h-11 rounded-xl flex items-center justify-center gap-2.5 text-[13px] font-semibold text-white bg-gradient-to-r from-[#00d1ff]/20 to-[#8b5cf6]/20 border border-[#00d1ff]/40 hover:border-[#00d1ff]/70 hover:from-[#00d1ff]/30 hover:to-[#8b5cf6]/30 hover:shadow-[0_0_15px_rgba(0,209,255,0.2)] transition-all active:scale-95 duration-200"
          >
            <span className="text-[#00d1ff] text-xl font-light leading-none mb-[2px]">+</span>
            Deploy New Decoy
          </button>
        </div>
      </div>
    );
  }

  // --- ORIGINAL COMPACT MODE ---
  return (
    <>
      <div
        ref={sidebarRef}
        className="w-20 flex flex-col items-center py-4 shrink-0 select-none font-sans h-full overflow-hidden"
        style={{ borderRight: "1px solid #126382", background: "#000B14" }}
      >
        {/* Back Button Circle */}
        {onBack && (
          <button
            onClick={onBack}
            className="w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 text-white border border-[#126382]/50 bg-black hover:bg-[#126382]/20 hover:border-[#00d1ff] shrink-0"
            title="Disconnect & Back to Welcome"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* Divider */}
        <div className="w-10 h-[1px] my-3 shrink-0" style={{ background: "#126382", opacity: 0.3 }} />

        {/* Targets Scrollable List */}
        <div
          className="grow w-full overflow-y-auto flex flex-col items-center gap-3 custom-scrollbar"
          style={{ scrollbarWidth: "none" }}
        >
          {sortedTargets.length > 0 &&
            sortedTargets.map((t) => {
              const isActive = t.id === activeTargetId;
              const statusColor = !t.paused ? "#10B981" : "#F59E0B";

              return (
                <div
                  key={t.id}
                  onClick={() => onSelectTarget(t.id)}
                  className="relative shrink-0 flex items-center justify-center py-2 w-full cursor-pointer transition-all duration-200 select-none"
                  style={{
                    background: isActive ? "rgba(0, 209, 255, 0.1)" : "transparent",
                    borderLeft: isActive ? "3px solid #00d1ff" : "3px solid transparent",
                  }}
                >
                  {/* Profile Circle Avatar — tooltip trigger */}
                  <div
                    onMouseEnter={(e) => showTooltip(e, t)}
                    onMouseLeave={hideTooltip}
                    className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 relative transition-transform duration-300 hover:scale-105 cursor-pointer"
                    style={{
                      border: isActive ? "2px solid #00d1ff" : "1px solid #126382",
                      background: "linear-gradient(0deg, #000B14 0%, #001A2C 100%)",
                      boxShadow: isActive ? "0 0 10px rgba(0, 209, 255, 0.25)" : "none",
                    }}
                  >
                    <span className="w-5 h-5 flex items-center justify-center z-0">
                      <svg
                        className="w-full h-full shrink-0 transition-colors duration-300"
                        style={{ color: isActive ? "#00d1ff" : "rgba(0,209,255,0.7)" }}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                    </span>
                    {t.username && (
                      <img 
                        src={`https://tgpfp.darkmap.org/pfp?username=@${t.username.replace(/^@/, "")}`}
                        className="absolute inset-0 w-full h-full rounded-full object-cover z-10"
                        onError={(e) => { e.target.style.display = 'none'; }}
                        alt=""
                      />
                    )}
                    {/* Status Dot */}
                    <span
                      className="absolute bottom-0 right-0 w-3 h-3 rounded-full z-20"
                      style={{ background: statusColor, border: "2px solid #000B14" }}
                    />
                    {t.unseenCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-[#000B14] z-30 shadow-[0_0_8px_rgba(239,68,68,0.5)]">
                        {t.unseenCount > 99 ? '99+' : t.unseenCount}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        {/* Spacing/Divider before Add Target */}
        <div className="w-10 h-[1px] my-3 shrink-0" style={{ background: "#126382", opacity: 0.3 }} />

        {/* Add Target Button */}
        <button
          onClick={onAddTarget}
          className="w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 text-[#00d1ff] bg-gradient-to-r from-[#00d1ff]/20 to-[#8b5cf6]/20 border border-[#00d1ff]/40 hover:border-[#00d1ff]/70 hover:from-[#00d1ff]/30 hover:to-[#8b5cf6]/30 hover:shadow-[0_0_15px_rgba(0,209,255,0.2)] shrink-0"
          title="Add New Target"
        >
          <span className="text-[#00d1ff] text-2xl font-light leading-none mb-[2px]">+</span>
        </button>
      </div>

      {/* Fixed Portal Tooltip — escapes overflow-hidden parents */}
      {tooltip.visible && tooltip.target && (() => {
        const t = tooltip.target;
        const msgs = t.messages;
        const last = msgs && msgs.length > 0 ? msgs[msgs.length - 1] : null;
        const lastMsgTime = last ? last.time : null;
        const lastSeenLabel = t.isTyping
          ? "typing now..."
          : lastMsgTime
          ? `last seen ${lastMsgTime}`
          : "last seen recently";
        const currentDraft = drafts[t.id];
        const isActive = t.id === activeTargetId;
        const hasDraft = !isActive && currentDraft && currentDraft.text.trim().length > 0;

        const lastMsgText = t.isTyping
          ? null
          : hasDraft
          ? currentDraft.text.slice(0, 65) + (currentDraft.text.length > 65 ? "…" : "")
          : last
          ? `${last.sender === 'bot' ? 'Decoy: ' : last.sender === 'user' ? 'Target: ' : ''}${last.text.slice(0, 65)}${last.text.length > 65 ? "…" : ""}`
          : "No messages yet";
        const intel = t.behavior
          ? t.behavior.slice(0, 72) + (t.behavior.length > 72 ? "…" : "")
          : "Target behaviour tracking active";

        return (
          <div
            onMouseEnter={keepTooltip}
            onMouseLeave={hideTooltip}
            className="fixed z-[9999] flex items-center pointer-events-auto"
            style={{ left: "84px", top: tooltip.y, transform: "translateY(-50%)" }}
          >
            {/* Arrow */}
            <div
              className="w-0 h-0 shrink-0"
              style={{
                borderTop: "6px solid transparent",
                borderBottom: "6px solid transparent",
                borderRight: "6px solid #126382",
              }}
            />
            {/* Card */}
            <div
              className="rounded-xl font-sans border text-left min-w-[215px] overflow-hidden"
              style={{
                background: "rgba(0, 9, 18, 0.97)",
                borderColor: "#126382",
                boxShadow: "0 6px 28px rgba(0, 209, 255, 0.22), 0 0 0 1px rgba(0,209,255,0.07)",
                backdropFilter: "blur(12px)",
              }}
            >
              {/* Username + last seen */}
              <div className="px-3 pt-2.5 pb-2 flex flex-col gap-0.5">
                <span className="font-bold text-white text-[12px] tracking-wide leading-tight">
                  {t.username}
                </span>
                <span
                  className="text-[9px] font-medium tracking-wide"
                  style={{ color: t.isTyping ? "#00d1ff" : "#6B7280" }}
                >
                  {t.isTyping && (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#00d1ff] mr-1 animate-pulse align-middle" />
                  )}
                  {lastSeenLabel}
                </span>
              </div>

              <div style={{ height: "1px", background: "rgba(18,99,130,0.35)" }} />

              {/* Last message */}
              <div className="px-3 py-2">
                {t.isTyping ? (
                  <span className="text-[10px] text-[#00d1ff] animate-pulse italic">
                    💬 typing...
                  </span>
                ) : (
                  <p className="text-[10px] text-gray-300 italic leading-relaxed m-0">
                    {hasDraft ? (
                      <>
                        <span className="text-red-500 font-bold not-italic mr-1">Draft:</span>
                        {lastMsgText}
                      </>
                    ) : lastMsgText && lastMsgText !== "No messages yet" ? (
                      `"${lastMsgText}"`
                    ) : (
                      <span className="text-gray-500 not-italic">No messages yet</span>
                    )}
                  </p>
                )}
              </div>

              <div style={{ height: "1px", background: "rgba(18,99,130,0.25)" }} />

              {/* Intelligence capsule */}
              <div className="px-3 py-2">
                <span
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-semibold leading-snug"
                  style={{
                    background: "rgba(16,185,129,0.12)",
                    color: "#34D399",
                    border: "1px solid rgba(16,185,129,0.35)",
                    letterSpacing: "0.01em",
                  }}
                >
                  <span className="opacity-60 font-bold not-italic shrink-0">//</span>
                  {intel}
                </span>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
};

ChatSidebar.propTypes = {
  targets: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      username: PropTypes.string.isRequired,
      purpose: PropTypes.string.isRequired,
      isTyping: PropTypes.bool.isRequired,
      isActive: PropTypes.bool,
      profile: PropTypes.shape({
        name: PropTypes.string.isRequired,
      }).isRequired,
      messages: PropTypes.arrayOf(
        PropTypes.shape({
          text: PropTypes.string.isRequired,
          time: PropTypes.string.isRequired,
        })
      ).isRequired,
      tag: PropTypes.string,
      elapsed: PropTypes.string,
    })
  ).isRequired,
  activeTargetId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onSelectTarget: PropTypes.func.isRequired,
  onAddTarget: PropTypes.func.isRequired,
  onBack: PropTypes.func,
  expanded: PropTypes.bool,
};

export default ChatSidebar;
