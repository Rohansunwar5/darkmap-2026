import React, { useState, useEffect } from "react";
 
import PropTypes from "prop-types";

/* ── colour themes per button ─────────────────────────────────── */
const BTN_THEMES = {
  "Follow Up":  { color: "#818CF8", glow: "rgba(99,102,241,0.35)",  bg: "rgba(99,102,241,0.18)"  },
  Sync:    { color: "#22D3EE", glow: "rgba(0,209,255,0.35)",   bg: "rgba(0,209,255,0.18)"   },
  Pause:   { color: "#FBBF24", glow: "rgba(245,158,11,0.35)",  bg: "rgba(245,158,11,0.18)"  },
  Resume:  { color: "#34D399", glow: "rgba(16,185,129,0.40)",  bg: "rgba(16,185,129,0.20)"  },
  Manual:  { color: "#F472B6", glow: "rgba(236,72,153,0.35)",  bg: "rgba(236,72,153,0.18)"  },
  Export:  { color: "#C4B5FD", glow: "rgba(167,139,250,0.35)", bg: "rgba(167,139,250,0.18)" },
};

const ICONS = {
  "Follow Up": "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
  Sync:   "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  Pause:  "M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z",
  Resume: "M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  Manual: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  Export: "M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
};

function ActionButton({ name, isActive, onClick }) {
  const theme = BTN_THEMES[name] || BTN_THEMES["Follow Up"];
  return (
    <button
      onClick={onClick}
      title={name}
      className="flex flex-col items-center justify-center gap-1 flex-1 py-1.5 rounded border transition-all duration-200 active:scale-90"
      style={{
        background: isActive ? theme.bg : "rgba(8,14,20,0.95)",
        border:     `1px solid ${isActive ? theme.color : "rgba(18,99,130,0.30)"}`,
        boxShadow:  isActive ? `0 0 10px ${theme.glow}` : "none",
      }}
    >
      <svg
        className="w-4 h-4 transition-all duration-200"
        style={{ 
          color: theme.color,
          opacity: isActive ? 1 : 0.45 
        }}
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={ICONS[name] || ICONS["Follow Up"]} />
      </svg>
      <span
        className="text-[6.5px] font-bold uppercase tracking-wider transition-all duration-200 leading-none mt-0.5"
        style={{ 
          color: theme.color,
          opacity: isActive ? 1 : 0.45 
        }}
      >
        {name}
      </span>
    </button>
  );
}

// Helper to extract intelligence fields dynamically from messages
const extractDynamicIntel = (messages, targetUsername, selectedProfile) => {
  const list = [];
  if (!messages || messages.length === 0) return list;

  // Helper to find message containing keywords
  const findMsgWithKeywords = (keywords) => {
    return messages.find(m => 
      keywords.some(keyword => (m.text || "").toLowerCase().includes(keyword.toLowerCase()))
    );
  };

  // 1. Crypto Wallets (Confidence: 99%)
  const trc20Regex = /\bT[A-Za-z0-9]{33}\b/i;
  const btcRegex = /\b(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}\b/i;
  const ethRegex = /\b0x[a-fA-F0-9]{40}\b/i;

  let walletMsg = messages.find(m => trc20Regex.test(m.text || "") || btcRegex.test(m.text || "") || ethRegex.test(m.text || ""));
  if (walletMsg) {
    const text = walletMsg.text;
    const match = text.match(trc20Regex) || text.match(btcRegex) || text.match(ethRegex);
    if (match) {
      list.push({
        type: "WALLET",
        label: "EXFILTRATED WALLET",
        content: match[0],
        icon: (
          <svg className="w-3.5 h-3.5 text-[#60A5FA]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 00-2 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        ),
        confidence: 99,
        time: walletMsg.time,
      });
    }
  }

  // 2. Escrow Deals (Confidence: 92%)
  const escrowMsg = findMsgWithKeywords(["escrow", "fee"]);
  if (escrowMsg) {
    list.push({
      type: "ESCROW",
      label: "ESCROW DEAL DETECTED",
      content: escrowMsg.text,
      icon: (
        <svg className="w-3.5 h-3.5 text-[#F59E0B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      confidence: 92,
      time: escrowMsg.time,
    });
  }

  // 3. Payment Method (Confidence: 96%)
  const payMsg = findMsgWithKeywords(["usdt", "trc20", "btc", "eth", "sol", "crypto", "pay"]);
  if (payMsg) {
    list.push({
      type: "PAY",
      label: "PAYMENT METHOD DISCUSS",
      content: payMsg.text,
      icon: (
        <svg className="w-3.5 h-3.5 text-[#34D399]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
      confidence: 96,
      time: payMsg.time,
    });
  }

  // 4. Balance / Deal Size / Range (Confidence: 75%)
  const balanceMsg = messages.find(m => 
    m.sender === "user" && 
    (/(\b\d+-\d+k\b|\b\$\d+|\bbalance\b|\brange\b|\bacc\b|\blogs\b)/i.test(m.text || ""))
  );
  if (balanceMsg) {
    list.push({
      type: "ESTIM",
      label: "ESTIMATED LOSS / SCALE",
      content: balanceMsg.text,
      icon: (
        <svg className="w-3.5 h-3.5 text-[#00E5FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      confidence: 75,
      time: balanceMsg.time,
    });
  }


    // 5. Phone Numbers (Confidence: 90%)
    const phoneRegex = /(?:\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}/;
    const phoneMsg = messages.find(m => phoneRegex.test(m.text || ""));
    if (phoneMsg) {
      const match = phoneMsg.text.match(phoneRegex);
      if (match && match[0].length >= 10) {
        list.push({
          type: "PHONE", label: "CONTACT NUMBER", content: match[0],
          icon: <svg className="w-3.5 h-3.5 text-[#F472B6]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>,
          confidence: 90, time: phoneMsg.time
        });
      }
    }

    // 6. Emails
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const emailMsg = messages.find(m => emailRegex.test(m.text || ""));
    if (emailMsg) {
      const match = emailMsg.text.match(emailRegex);
      if (match) list.push({
        type: "EMAIL", label: "EMAIL ADDRESS", content: match[0],
        icon: <svg className="w-3.5 h-3.5 text-[#A78BFA]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
        confidence: 95, time: emailMsg.time
      });
    }

    // 7. IP Addresses
    const ipRegex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/;
    const ipMsg = messages.find(m => ipRegex.test(m.text || ""));
    if (ipMsg) {
      const match = ipMsg.text.match(ipRegex);
      if (match) list.push({
        type: "IP", label: "IP ADDRESS", content: match[0],
        icon: <svg className="w-3.5 h-3.5 text-[#EF4444]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>,
        confidence: 85, time: ipMsg.time
      });
    }

    // 8. Credentials/Passwords
    const credRegex = /(?:pass(?:word)?|pwd|key)\s*[:=]\s*([a-zA-Z0-9_!@#$%^&*]{4,})/i;
    const credMsg = messages.find(m => credRegex.test(m.text || ""));
    if (credMsg) {
      const match = credMsg.text.match(credRegex);
      if (match) list.push({
        type: "CRED", label: "EXPOSED CREDENTIALS", content: match[1],
        icon: <svg className="w-3.5 h-3.5 text-[#FBBF24]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>,
        confidence: 80, time: credMsg.time
      });
    }

    // 9. Links / URLs
    const urlRegex = /https?:\/\/[^\s]+/i;
    const urlMsg = messages.find(m => urlRegex.test(m.text || ""));
    if (urlMsg) {
      const match = urlMsg.text.match(urlRegex);
      if (match) list.push({
        type: "URL", label: "EXTERNAL LINK", content: match[0],
        icon: <svg className="w-3.5 h-3.5 text-[#9CA3AF]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>,
        confidence: 99, time: urlMsg.time
      });
    }

    // 10. Social Handles
    const socialRegex = /(?:@|t\.me\/|twitter\.com\/)([a-zA-Z0-9_]{3,})/i;
    const socialMsg = messages.find(m => socialRegex.test(m.text || ""));
    if (socialMsg) {
      const match = socialMsg.text.match(socialRegex);
      if (match) list.push({
        type: "SOCIAL", label: "SOCIAL HANDLE", content: `@${match[1]}`,
        icon: <svg className="w-3.5 h-3.5 text-[#00d1ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" /></svg>,
        confidence: 88, time: socialMsg.time
      });
    }

    // 11. API Keys (Basic Heuristics)
    const apiRegex = /(sk_live_[a-zA-Z0-9]{24}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/;
    const apiMsg = messages.find(m => apiRegex.test(m.text || ""));
    if (apiMsg) {
      const match = apiMsg.text.match(apiRegex);
      if (match) list.push({
        type: "APIKEY", label: "DETECTED API KEY", content: match[0],
        icon: <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" /></svg>,
        confidence: 98, time: apiMsg.time
      });
    }

  return list;
};

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

const IntelligencePanel = ({
  onCreate,
  selectedProfile,
  targetUsername,
  purpose,
  behavior,
  paused,
  onPausedChange,
  manual,
  onManualChange,
  onExport,
  onUpdateBriefing,
  objective,
  onSetObjective,
  onClearObjective,
  onSendNudge,
  onSync,
  artifacts,
  
  // Premium Layout props
  // Premium Layout props
  premium,
  messages = [],
  tag,
  elapsed,
}) => {
  
  const [briefing, setBriefing] = useState(behavior || "");
  const [objectiveDraft, setObjectiveDraft] = useState(objective || "");
  useEffect(() => {
    setObjectiveDraft(objective || "");
  }, [objective]);
  const [nudgeDraft, setNudgeDraft] = useState("");
  const [follow, setFollow] = useState(false);

  // Submit the objective only when it actually changed. onBlur and the send
  // button can both fire from a single click; this guard prevents a double POST.
  const submitObjective = () => {
    const trimmed = objectiveDraft.trim();
    if (!trimmed || trimmed === (objective || "")) return;
    if (onSetObjective) onSetObjective(trimmed);
  };

  const submitNudge = () => {
    const trimmed = nudgeDraft.trim();
    if (!trimmed) return;
    if (onSendNudge) onSendNudge(trimmed);
    setNudgeDraft("");
  };
  const [syncing, setSyncing] = useState(false);
  const [exported, setExported] = useState(false);

  const dotColorClass = !paused ? "bg-emerald-500" : "bg-amber-500";

  useEffect(() => {
    setBriefing(behavior || "");
  }, [behavior]);

  const handleSync = async () => {
    setSyncing(true);
    if (onSync) await onSync();
    setSyncing(false);
  };

  const handleExport = () => {
    setExported(true);
    if (onExport) onExport();
    setTimeout(() => setExported(false), 2500);
  };

  const buttons = [
    { name: "Follow Up", isActive: follow, onClick: () => setFollow(f => !f) },
    { name: "Sync", isActive: syncing, onClick: handleSync },
    { name: paused ? "Resume" : "Pause", isActive: paused, onClick: onPausedChange },
    { name: "Manual", isActive: manual, onClick: onManualChange },
    { name: "Export", isActive: exported, onClick: handleExport },
  ];

  // Dynamic Intel extraction based purely on live Dialogue logs
  const dynamicIntel = extractDynamicIntel(messages, targetUsername, selectedProfile);

  if (premium) {
    const activeTagStyles = getTagStyles(tag || "ASSESSMENT");
    return (
      <div className="w-full h-full flex flex-col font-sans select-none overflow-hidden bg-[#00070D]">
        
        {/* PREMIUM PANEL HEADER */}
        <div
          className="flex items-center justify-between px-3 py-2.5 shrink-0 border-b border-[#126382]/30"
          style={{ background: "linear-gradient(90deg, #000B14 0%, #001A2C 100%)" }}
        >
          <span className="text-[10px] font-bold tracking-widest uppercase text-white flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-[#00d1ff] animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            AI Decoy Agent
          </span>
          <div className="flex items-center gap-1.5">
            {paused ? (
              <span className="text-[7px] font-bold px-2 py-[2.5px] rounded bg-amber-500/10 text-amber-500 border border-amber-500/30 uppercase tracking-wider leading-none">
                PAUSED
              </span>
            ) : (
              <span className="text-[7px] font-bold px-2 py-[2.5px] rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider leading-none">
                ACTIVE
              </span>
            )}
            <button className="text-gray-500 hover:text-white transition-colors" title="Sync">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          
        </div>

        {/* SCROLLABLE SIDEBAR BODY */}
        <div className="grow flex flex-col p-3 gap-3.5 overflow-y-auto custom-scrollbar">
          
          {/* PROFILE DETAIL CARD */}
          <div className="p-3 border border-[#126382]/25 rounded-xl bg-black/45 flex items-center gap-3 select-text">
            <div className="w-11 h-11 shrink-0 rounded-full border border-dashed border-[#00d1ff]/40 bg-cyan-950/10 flex items-center justify-center text-sm font-bold text-[#00d1ff] tracking-widest relative">
              <span className="z-0">{targetUsername?.[1]?.toUpperCase() || selectedProfile?.name?.[0] || "?"}</span>
              {targetUsername && (
                <img 
                  src={`https://tgpfp.darkmap.org/pfp?username=@${targetUsername.replace(/^@/, "")}`}
                  className="absolute inset-0 w-full h-full rounded-full object-cover z-10"
                  onError={(e) => { e.target.style.display = 'none'; }}
                  alt=""
                />
              )}
              <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ${dotColorClass} border border-[#00070D] z-20`} />
            </div>
            <div className="flex flex-col gap-1.5 grow min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-white tracking-wider uppercase leading-tight truncate">{targetUsername}</h4>
                {tag && (
                  <span 
                    className="text-[7px] font-bold uppercase tracking-wider border px-1.5 py-0.5 rounded leading-none shrink-0"
                    style={{
                      color: activeTagStyles.color,
                      background: activeTagStyles.bg,
                      borderColor: activeTagStyles.border,
                    }}
                  >
                    {tag}
                  </span>
                )}
              </div>
              <div className="text-[9px] text-gray-500 font-semibold flex items-center gap-1 leading-none">
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                last active {elapsed || "just now"}
              </div>
            </div>
          </div>


          {/* TARGET BRIEFING (EDITABLE TEXTAREA) */}
          <div className="flex flex-col gap-1.5">
            <h4 className="text-[8.5px] font-bold text-gray-500 tracking-widest uppercase">Target Briefing</h4>
            <div className="relative">
              <textarea
                value={briefing}
                onChange={e => setBriefing(e.target.value)}
                placeholder="Describe target's profile..."
                rows={4}
                className="w-full resize-none rounded-lg px-3 py-2 text-xs text-gray-300 leading-relaxed font-sans transition-all duration-200 bg-[#020B10] border border-[#126382]/40 border-l-[2.5px] border-l-[#00d1ff] caret-[#00d1ff] shadow-[inset_0_1px_4px_rgba(0,0,0,0.3)] outline-none ring-0 ring-transparent focus:outline-none focus:ring-0 focus:ring-transparent focus:border-[#00d1ff] focus:shadow-[inset_0_1px_4px_rgba(0,0,0,0.3),0_0_10px_rgba(0,209,255,0.3)]"
                style={{
                  outline:      "none",
                  overflow:     "hidden",
                  minHeight:    "34px",
                }}
                onInput={e => {
                  e.target.style.height = "auto";
                  e.target.style.height = e.target.scrollHeight + "px";
                }}
                onBlur={e => {
                  if (onUpdateBriefing) onUpdateBriefing(briefing.trim());
                }}
              />
            </div>
          </div>

          {/* STANDING OBJECTIVE (operator steering) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <h4 className="text-[8.5px] font-bold text-gray-500 tracking-widest uppercase">Standing Objective</h4>
              {objective ? (
                <button
                  type="button"
                  onClick={() => { if (onClearObjective) onClearObjective(); }}
                  className="text-[8px] font-bold uppercase tracking-wider text-[#F472B6] hover:text-white transition-colors"
                >
                  Clear
                </button>
              ) : null}
            </div>
            <div className="relative">
              <textarea
                value={objectiveDraft}
                onChange={e => setObjectiveDraft(e.target.value)}
                placeholder="e.g. get their USDT wallet address"
                rows={2}
                maxLength={500}
                className="w-full resize-none rounded-lg px-3 py-2 text-xs text-gray-200 leading-relaxed font-sans transition-all duration-200 bg-[#020B10] border border-[#FBBF24]/40 border-l-[2.5px] border-l-[#FBBF24] caret-[#FBBF24] shadow-[inset_0_1px_4px_rgba(0,0,0,0.3)] outline-none ring-0 ring-transparent focus:outline-none focus:ring-0 focus:ring-transparent focus:border-[#FBBF24] focus:shadow-[inset_0_1px_4px_rgba(0,0,0,0.3),0_0_10px_rgba(251,191,36,0.3)]"
                style={{
                  outline:      "none",
                  minHeight:    "34px",
                }}
                onBlur={submitObjective}
              />
              <button
                type="button"
                // onMouseDown fires before the textarea's blur, so we submit here
                // and prevent the blur from submitting a second time.
                onMouseDown={(e) => { e.preventDefault(); submitObjective(); }}
                className="absolute right-2.5 bottom-2 text-[#FBBF24] hover:text-white transition-colors"
                title="Set objective"
              >
                <svg className="w-3.5 h-3.5 rotate-90" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              </button>
            </div>
            {objective ? (
              <span className="text-[8px] text-[#FBBF24]/80 font-semibold tracking-wide">Active — shaping every reply</span>
            ) : (
              <span className="text-[8px] text-gray-600 font-semibold tracking-wide">No standing objective set</span>
            )}
          </div>

          {/* ONE-SHOT NUDGE (operator steering) */}
          <div className="flex flex-col gap-1.5">
            <h4 className="text-[8.5px] font-bold text-gray-500 tracking-widest uppercase">Nudge (next reply only)</h4>
            <div className="relative">
              <input
                type="text"
                value={nudgeDraft}
                onChange={e => setNudgeDraft(e.target.value)}
                placeholder="e.g. act convinced; ask for proof now"
                maxLength={500}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); submitNudge(); }
                }}
                className="w-full rounded-lg pl-3 pr-9 py-2 text-xs text-gray-200 leading-relaxed font-sans transition-all duration-200 bg-[#020B10] border border-[#A78BFA]/40 border-l-[2.5px] border-l-[#A78BFA] caret-[#A78BFA] shadow-[inset_0_1px_4px_rgba(0,0,0,0.3)] outline-none ring-0 ring-transparent focus:outline-none focus:ring-0 focus:ring-transparent focus:border-[#A78BFA] focus:shadow-[inset_0_1px_4px_rgba(0,0,0,0.3),0_0_10px_rgba(167,139,250,0.3)]"
                style={{ outline: "none" }}
              />
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); submitNudge(); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A78BFA] hover:text-white transition-colors"
                title="Send one-shot nudge"
              >
                <svg className="w-3.5 h-3.5 rotate-90" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              </button>
            </div>
            <span className="text-[8px] text-gray-600 font-semibold tracking-wide">Applies once, then clears automatically</span>
          </div>

          {/* QUICK ACTIONS ROW */}
          <div className="flex flex-col gap-1.5">
            <h4 className="text-[8.5px] font-bold text-gray-500 tracking-widest uppercase">Quick Actions</h4>
            <div className="flex gap-1.5">
              {buttons.map(btn => (
                <ActionButton key={btn.name} name={btn.name} isActive={btn.isActive} onClick={btn.onClick} />
              ))}
            </div>
          </div>

          {/* DYNAMIC EXTRACTED INTELLIGENCE LIST */}
          <div className="flex flex-col gap-1.5 mt-0.5 select-text">
            <div className="flex items-center justify-between">
              <h4 className="text-[8.5px] font-bold text-gray-500 tracking-widest uppercase">Extracted Intelligence</h4>
              <span className="text-[8.5px] font-bold text-[#00d1ff] bg-cyan-950/20 px-1.5 py-0.5 rounded border border-[#00d1ff]/20">
                {dynamicIntel.length} Detected
              </span>
            </div>
            {dynamicIntel.length === 0 ? (
              <div className="w-full rounded-lg border border-dashed border-[#126382]/30 bg-black/25 py-6 flex flex-col items-center justify-center gap-1.5 select-none">
                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <span className="text-[9.5px] font-bold text-gray-600 tracking-wide uppercase">No exfiltrated cyber intelligence</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {dynamicIntel.map((intelItem, idx) => (
                  <div 
                    key={idx}
                    className="p-3 bg-[#030911] border border-[#126382]/20 rounded-lg flex flex-col gap-1.5 relative overflow-hidden"
                  >
                    {/* Item header */}
                    <div className="flex items-center justify-between select-none">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-cyan-950/25 border border-[#126382]/20 flex items-center justify-center">
                          {intelItem.icon}
                        </div>
                        <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">
                          {intelItem.label}
                        </span>
                      </div>
                      <span className="text-[8px] font-semibold text-gray-600 font-mono">
                        {intelItem.time}
                      </span>
                    </div>

                    {/* Extracted value text */}
                    <div className="text-[10px] font-bold text-white leading-normal break-all font-mono">
                      {intelItem.content}
                    </div>

                    {/* Custom progress/confidence neon glow bar */}
                    <div className="w-full flex items-center gap-2 mt-0.5 select-none">
                      <div className="grow h-1 bg-gray-900 rounded-full overflow-hidden relative">
                        <div 
                          className="h-full bg-[#00d1ff] rounded-full shadow-[0_0_8px_#00d1ff]"
                          style={{ width: `${intelItem.confidence}%` }}
                        />
                      </div>
                      <span className="text-[8px] font-bold text-[#00d1ff] font-mono leading-none shrink-0 w-6 text-right">
                        {intelItem.confidence}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    );
  }

  // --- ORIGINAL COMPACT MODE ---
  return (
    <div className="w-full h-full flex flex-col font-sans select-none overflow-hidden" style={{ background: "#00070D" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{ borderBottom: "1px solid rgba(18,99,130,0.6)", background: "linear-gradient(90deg, #000B14 0%, #001A2C 100%)" }}
      >
        <span className="text-[10px] font-bold tracking-widest uppercase text-white flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-[#00d1ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Intelligence Panel
        </span>
        {manual && (
          <span
            className="text-[7px] font-bold px-2 py-[3px] rounded-full uppercase tracking-widest flex items-center gap-1"
            style={{ background: "rgba(236,72,153,0.15)", color: "#F472B6", border: "1px solid rgba(236,72,153,0.40)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#F472B6]" />
            MANUAL
          </span>
        )}
      </div>

      <div className="grow flex flex-col p-3 gap-4 overflow-y-auto custom-scrollbar">
        {/* Target Briefing */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <h4 className="text-[9px] font-bold text-gray-400 tracking-widest uppercase">Target Briefing</h4>
            <span className="text-[8px] font-medium text-gray-400 tracking-wide">[ Edit the brief if necessary ]</span>
          </div>
          <div className="relative">
            <textarea
              value={briefing}
              onChange={e => setBriefing(e.target.value)}
              placeholder="Describe target's behavior..."
              rows={1}
              className="w-full resize-none rounded-lg px-3 py-2 text-xs text-gray-200 leading-relaxed font-sans transition-all duration-200 bg-[#0E1C29] border border-[#126382]/50 border-l-2 border-l-[#00d1ff] caret-[#00d1ff] shadow-[inset_0_1px_4px_rgba(0,0,0,0.3)] outline-none ring-0 ring-transparent focus:outline-none focus:ring-0 focus:ring-transparent focus:border-[#00d1ff] focus:shadow-[inset_0_1px_4px_rgba(0,0,0,0.3),0_0_10px_rgba(0,209,255,0.3)]"
              style={{
                outline:      "none",
                overflow:     "hidden",
                minHeight:    "34px",
              }}
              onInput={e => {
                e.target.style.height = "auto";
                e.target.style.height = e.target.scrollHeight + "px";
              }}
              onBlur={e => {
                if (onUpdateBriefing) onUpdateBriefing(briefing.trim());
              }}
            />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-col gap-1.5">
          <h4 className="text-[9px] font-bold text-gray-400 tracking-widest uppercase">Quick Actions</h4>
          <div className="flex gap-1.5">
            {buttons.map(btn => (
              <ActionButton key={btn.name} name={btn.name} isActive={btn.isActive} onClick={btn.onClick} />
            ))}
          </div>
        </div>

        {/* Exposed Cyber Artifacts */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <h4 className="text-[9px] font-bold text-gray-400 tracking-widest uppercase">Exposed Cyber Artifacts</h4>
            {artifacts && (
              <span className="text-[9px] font-bold text-[#00d1ff]">
                {Object.values(artifacts).filter(Boolean).length}
              </span>
            )}
          </div>
          {!artifacts?.wallet && !artifacts?.email && !artifacts?.proof ? (
            <div className="w-full rounded-lg border border-dashed border-[#126382]/40 bg-black/30 py-6 flex flex-col items-center justify-center gap-2">
              <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span className="text-[10px] font-semibold text-gray-600 tracking-wide uppercase">No exfiltrated artifacts detected</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2 p-2.5 bg-black/40 border border-[#126382]/20 rounded-lg">
              {artifacts.wallet && (
                <div>
                  <div className="text-[8px] font-semibold text-gray-500 uppercase tracking-widest">Crypto Wallet</div>
                  <div className="text-[9px] font-bold text-emerald-400 select-all truncate mt-0.5">{artifacts.wallet}</div>
                </div>
              )}
              {artifacts.email && (
                <div className={`pt-2 ${artifacts.wallet ? "border-t border-[#126382]/10" : ""}`}>
                  <div className="text-[8px] font-semibold text-gray-500 uppercase tracking-widest">Contact Handle (Exposed)</div>
                  <div className="text-[9px] font-bold text-cyan-400 select-all truncate mt-0.5">{artifacts.email}</div>
                </div>
              )}
              {artifacts.proof && (
                <div className={`pt-2 ${(artifacts.wallet || artifacts.email) ? "border-t border-[#126382]/10" : ""}`}>
                  <div className="text-[8px] font-semibold text-gray-500 uppercase tracking-widest">Target Proof Repositories</div>
                  <div className="text-[9px] font-bold text-purple-400 select-all truncate mt-0.5">{artifacts.proof}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

IntelligencePanel.propTypes = {
  selectedProfile: PropTypes.shape({ name: PropTypes.string.isRequired }),
  targetUsername: PropTypes.string,
  purpose: PropTypes.string,
  behavior: PropTypes.string,
  paused: PropTypes.bool.isRequired,
  onPausedChange: PropTypes.func.isRequired,
  manual: PropTypes.bool.isRequired,
  onManualChange: PropTypes.func.isRequired,
  onExport: PropTypes.func,
  onUpdateBriefing: PropTypes.func,
  objective: PropTypes.string,
  onSetObjective: PropTypes.func,
  onClearObjective: PropTypes.func,
  onSendNudge: PropTypes.func,
  onSync: PropTypes.func,
  premium: PropTypes.bool,
  messages: PropTypes.array,
  tag: PropTypes.string,
};

export default IntelligencePanel;
