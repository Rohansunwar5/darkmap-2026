import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useDecoy } from "../../context/DecoyContext";
import { useDecoySocket } from "../../hooks/useDecoySocket";
import { useGlobalNotificationSocket } from "../../hooks/useGlobalNotificationSocket";
import { useNotifications } from "../../hooks/useNotifications";
import { toast } from "react-toastify";
import Spinner from "../dashboard/components/common/spinner";

import ChatSidebar from "../../components/decoy/ChatSidebar";
import ChatArea from "../../components/decoy/ChatArea";
import IntelligencePanel from "../../components/decoy/IntelligencePanel";
import "../../components/decoy/decoy.css";

import logoGen from "../../assets/logo_gen.png";
import textLogo from "../../assets/textlogo.png";
import { CreateSessionModal } from "./DecoyPage";

// Helper to map backend message to local format
const mapBackendMsg = (msg, index) => {
  if (!msg) return null;
  if (msg.role === 'directive') {
    return {
      id: msg._id || `${Date.now()}-${index}`,
      sender: 'system',
      role: 'directive',
      text: msg.content || '',
      time: (() => {
        try {
          const d = new Date(msg.timestamp || Date.now());
          return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch { return ''; }
      })(),
      timestamp: msg.timestamp || Date.now(),
    };
  }
  const isOutgoing = msg.role === "ai" || msg.role === "manual";
  const rawTs = msg.timestamp || Date.now();
  let formattedTime = "";
  try {
    const d = new Date(rawTs);
    if (!isNaN(d.getTime())) {
      formattedTime = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else {
      formattedTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
  } catch (e) {
    formattedTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return {
    id: msg._id || `${Date.now()}-${index}`,
    sender: isOutgoing ? "bot" : "user",
    text: msg.content || (msg.mediaUrl ? "[Media]" : ""),
    time: formattedTime,
    timestamp: rawTs,
    mediaUrl: msg.mediaUrl || null,
    mediaKind: msg.mediaKind || null,
    role: msg.role || (isOutgoing ? "ai" : "user"),
  };
};

// Helper to map backend session to frontend target structure
const mapSessionToTarget = (session) => {
  // 1. Dynamic Security Threat Tag Assignment based on target context & metadata
  const searchStr = `${session.targetContext || ""} ${session.targetIdentifier || ""} ${session.targetName || ""}`.toLowerCase();
  let tag = null;
  if (searchStr.includes("fraud") || searchStr.includes("bank") || searchStr.includes("mule") || searchStr.includes("card")) {
    tag = "BANK_FRAUD";
  } else if (searchStr.includes("escrow") || searchStr.includes("shadow")) {
    tag = "ESCROW";
  } else if (searchStr.includes("phish") || searchStr.includes("kit") || searchStr.includes("panel")) {
    tag = "PHISHING";
  } else if (searchStr.includes("logistic") || searchStr.includes("drop") || searchStr.includes("ship")) {
    tag = "LOGISTICS";
  } else if (searchStr.includes("bypass") || searchStr.includes("otp") || searchStr.includes("2fa")) {
    tag = "OTP_BYPASS";
  } else if (searchStr.includes("deepfake") || searchStr.includes("fake") || searchStr.includes("video") || searchStr.includes("face")) {
    tag = "DEEPFAKE";
  }

  // 2. Dynamic Elapsed Time Calculation
  let elapsed = "just now";
  const targetDateStr = session.updatedAt || session.createdAt;
  if (targetDateStr) {
    const diffMs = Date.now() - new Date(targetDateStr).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins > 0) {
      if (diffMins < 60) {
        elapsed = `${diffMins} min ago`;
      } else {
        const diffHrs = Math.floor(diffMins / 60);
        if (diffHrs < 24) {
          elapsed = `${diffHrs} hour${diffHrs > 1 ? "s" : ""} ago`;
        } else {
          const days = Math.floor(diffHrs / 24);
          elapsed = `${days} day${days > 1 ? "s" : ""} ago`;
        }
      }
    }
  }

  return {
    id: session._id,
    username: session.targetIdentifier,
    profile: { name: session.targetName || "Target" },
    purpose: "General Assessment",
    behavior: session.targetContext || "",
    messages: [], // loaded asynchronously
    isTyping: false,
    paused: session.status === "paused" || session.status === "stopped",
    manual: false,
    tag,
    elapsed,
    unseenCount: session.unseenCount || 0,
    objective: session.standingObjective || '',
  };
};

export default function GenericDecoyPage() {
  const navigate = useNavigate();
  const {
    fetchSessions,
    fetchMessages,
    pauseSession,
    resumeSession,
    manualSend,
    createSession,
    markSessionRead,
    deleteSession,
    setObjective,
    clearObjective,
    sendNudge,
  } = useDecoy();

  const [targets, setTargets] = useState([]);
  const [activeTargetId, setActiveTargetId] = useState(null);
  const [drafts, setDrafts] = useState(() => {
    try {
      const stored = localStorage.getItem("decoy_drafts");
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      return {};
    }
  });
  
  useEffect(() => {
    localStorage.setItem("decoy_drafts", JSON.stringify(drafts));
  }, [drafts]);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // ── NOTIFICATION STATE ──────────────────────────────────────────────
  const { fetchNotifications, markAsRead, markAllAsRead } = useNotifications();
  const [notifications, setNotifications] = useState([]);
  const [notifUnreadCount, setNotifUnreadCount] = useState(0);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const notifPanelRef = useRef(null);

  // Load notifications on mount
  useEffect(() => {
    fetchNotifications(20, 0).then(({ notifications: items, unreadCount }) => {
      setNotifications(items);
      setNotifUnreadCount(unreadCount);
    }).catch(() => {});
  }, [fetchNotifications]);

  // Close notification panel on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifPanelRef.current && !notifPanelRef.current.contains(e.target)) {
        setShowNotifPanel(false);
      }
    };
    if (showNotifPanel) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showNotifPanel]);

  // Request desktop notification permission on first mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const handleMarkAllNotifRead = async () => {
    try {
      await markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setNotifUnreadCount(0);
    } catch { /* ignore */ }
  };

  const handleMarkNotifRead = async (id) => {
    try {
      await markAsRead(id);
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, read: true } : n));
      setNotifUnreadCount(prev => Math.max(0, prev - 1));
    } catch { /* ignore */ }
  };

  const handleCreateSession = async (formData) => {
    await createSession(formData);
    const sessionsList = await fetchSessions();
    if (sessionsList && sessionsList.length > 0) {
      const mapped = sessionsList.map(mapSessionToTarget);
      const fetchPromises = mapped.map(async (t) => {
        try {
          const msgs = await fetchMessages(t.id);
          return { ...t, messages: msgs.map(mapBackendMsg).filter(Boolean) };
        } catch (e) {
          return t;
        }
      });
      const updatedTargets = await Promise.all(fetchPromises);
      setTargets(updatedTargets);
      setActiveTargetId(updatedTargets[0].id);
    }
  };

  const handleDeleteTarget = async () => {
    if (!activeTargetId) return;
    setIsDeleting(true);
    try {
      await deleteSession(activeTargetId);
      setTargets((prev) => prev.filter((t) => t.id !== activeTargetId));
      
      const remaining = targets.filter((t) => t.id !== activeTargetId);
      setActiveTargetId(remaining.length > 0 ? remaining[0].id : null);
      
      toast.success("Session deleted permanently.");
    } catch (err) {
      toast.error("Failed to delete session.");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const chatEndRef = useRef(null);
  // Synchronous re-entrancy locks. State updates are async, so a handler that
  // fires twice in the same tick would read stale state and fire the request
  // twice. A ref flips immediately, so the second call is a no-op. One lock per
  // action so distinct actions can't block each other.
  const sendLockRef = useRef(false);
  const nudgeLockRef = useRef(false);
  const objectiveLockRef = useRef(false);
  const activeTarget = targets.find((t) => t.id === activeTargetId);

  const paused = activeTarget?.paused || false;
  const manual = activeTarget?.manual || false;
  const briefActive = activeTarget?.briefActive || false;
  const aiActive = !paused && !manual;

  // Connect socket for all sessions
  useDecoySocket({
    sessionIds: targets.map(t => t.id),
    onMessage: (msg) => {
      // Use msg.sessionId if available, fallback to activeTargetId just in case
      // Sometimes backend sends it as msg.session, msg.sessionId, or msg.targetId
      const msgSessionId = msg.sessionId || msg.session || msg.targetId || msg.session_id || activeTargetId;
      setTargets((prev) =>
        prev.map((t) => {
          if (t.id === msgSessionId) {
            const mappedMsg = mapBackendMsg(msg, 0);
            // Prevent duplicate messages if manualSend already appended it
            if (t.messages.some(m => m.id === mappedMsg.id)) {
              return t;
            }

            if (t.id === activeTargetId) {
              return {
                ...t,
                messages: [...t.messages, mappedMsg],
                isTyping: false,
              };
            } else {
              // We no longer manually increment unseenCount here because 
              // useGlobalNotificationSocket receives the absolute truth from the DB.
              return {
                ...t,
                messages: [...t.messages, mappedMsg],
                isTyping: false,
              };
            }
          }
          return t;
        })
      );
    },
    onStatus: (payload) => {
      const msgSessionId = payload.sessionId || payload.session || activeTargetId;
      setTargets((prev) =>
        prev.map((t) => {
          if (t.id === msgSessionId) {
            return {
              ...t,
              paused: payload.status === "paused" || payload.status === "stopped",
            };
          }
          return t;
        })
      );
    },
    onUnseenReset: (payload) => {
      const msgSessionId = payload.sessionId || activeTargetId;
      setTargets((prev) => prev.map((t) => (t.id === msgSessionId ? { ...t, unseenCount: 0 } : t)));
    },
    onObjective: (payload) => {
      const msgSessionId = payload.sessionId || activeTargetId;
      setTargets((prev) =>
        prev.map((t) => (t.id === msgSessionId ? { ...t, objective: payload.objective ?? '' } : t))
      );
    },
  });

  // Global notification socket — updates badge counts and notification feed
  useGlobalNotificationSocket({
    onNotification: (payload) => {
      // Update notification feed (prepend new notification)
      setNotifications((prev) => {
        // Avoid duplicates
        if (prev.some(n => n._id === payload._id)) return prev;
        return [payload, ...prev].slice(0, 50);
      });
      setNotifUnreadCount(payload.unreadCount ?? ((prev) => prev + 1));

      // Update per-session badge counts (existing behavior)
      const { sessionId, metadata } = payload;
      const unseenCount = metadata?.unseenCount;
      if (sessionId && sessionId !== activeTargetId && unseenCount != null) {
        setTargets((prev) =>
          prev.map((t) =>
            t.id === sessionId
              ? { ...t, unseenCount: unseenCount ?? (t.unseenCount || 0) + 1 }
              : t
          )
        );
      }
    },
  });

  // Load active sessions on mount
  useEffect(() => {
    const init = async () => {
      try {
        const sessionsList = await fetchSessions();
        if (sessionsList && sessionsList.length > 0) {
          const mapped = sessionsList.map(mapSessionToTarget);
          const fetchPromises = mapped.map(async (t) => {
            try {
              const msgs = await fetchMessages(t.id);
              return { ...t, messages: msgs.map(mapBackendMsg).filter(Boolean) };
            } catch (e) {
              return t;
            }
          });
          const updatedTargets = await Promise.all(fetchPromises);
          setTargets(updatedTargets);
          setActiveTargetId(updatedTargets[0].id);
        }
      } catch (err) {
        toast.error("Failed to load decoy sessions.");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [fetchSessions, fetchMessages]);

  // Load message logs when the active target changes
  useEffect(() => {
    if (activeTargetId) {
      fetchMessages(activeTargetId)
        .then((msgs) => {
          setTargets((prev) =>
            prev.map((t) => {
              if (t.id === activeTargetId) {
                return { ...t, messages: msgs.map(mapBackendMsg).filter(Boolean) };
              }
              return t;
            })
          );
        })
        .catch(() => toast.error("Failed to load chat history."));
    }
  }, [activeTargetId, fetchMessages]);

  // Scroll to bottom on updates
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeTarget?.messages, activeTarget?.isTyping]);

  // ── CORE ACTION HANDLERS ──────────────────────────────────────────
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const sessionsList = await fetchSessions();
      if (!sessionsList || sessionsList.length === 0) {
        setTargets([]);
        toast.success("Intelligence logs synchronized.");
        return;
      }
      
      const mapped = sessionsList.map(mapSessionToTarget);
      
      // Fetch messages for ALL targets
      const fetchPromises = mapped.map(async (t) => {
        try {
          const msgs = await fetchMessages(t.id);
          return { ...t, messages: msgs.map(mapBackendMsg).filter(Boolean) };
        } catch (e) {
          return t;
        }
      });
      
      const updatedTargets = await Promise.all(fetchPromises);
      setTargets(updatedTargets);
      
      if (!activeTargetId || !updatedTargets.find(t => t.id === activeTargetId)) {
        setActiveTargetId(updatedTargets[0].id);
      }
      
      toast.success("All intelligence logs synchronized.");
    } catch (err) {
      toast.error("Failed to sync records.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePauseResume = async () => {
    if (!activeTarget) return;
    const currentState = activeTarget.paused;
    try {
      if (currentState) {
        await resumeSession(activeTargetId);
        setTargets((prev) =>
          prev.map((t) => (t.id === activeTargetId ? { ...t, paused: false, manual: false } : t))
        );
        toast.success("Impersonation active.");
      } else {
        await pauseSession(activeTargetId);
        setTargets((prev) =>
          prev.map((t) => (t.id === activeTargetId ? { ...t, paused: true, briefActive: false } : t))
        );
        toast.warn("AI Agent paused.");
      }
    } catch (err) {
      toast.error("Failed to update decoy state.");
    }
  };

  const handleManualToggle = async () => {
    if (!activeTarget) return;
    const nextManual = !activeTarget.manual;
    try {
      if (nextManual) {
        if (!activeTarget.paused) {
          await pauseSession(activeTargetId);
        }
        setTargets((prev) =>
          prev.map((t) => (t.id === activeTargetId ? { ...t, manual: true, paused: true, briefActive: false } : t))
        );
        toast.info("Manual Takeover Active.");
      } else {
        await resumeSession(activeTargetId);
        setTargets((prev) =>
          prev.map((t) => (t.id === activeTargetId ? { ...t, manual: false, paused: false } : t))
        );
        toast.success("AI Impersonation Restored.");
      }
    } catch (err) {
      toast.error("Action failure.");
    }
  };

  const handleBriefToggle = () => {
    if (!activeTarget) return;
    const next = !briefActive;
    setTargets((prev) =>
      prev.map((t) => (t.id === activeTargetId ? { ...t, briefActive: next } : t))
    );
  };

  const handleSendBrief = async (text) => {
    if (!activeTarget) return;
    const trimmed = text.trim();
    setTargets((prev) =>
      prev.map((t) => (t.id === activeTargetId ? { ...t, briefActive: false } : t))
    );
    if (!trimmed) return;
    if (nudgeLockRef.current) return; // guard against double-fire
    nudgeLockRef.current = true;
    try {
      await sendNudge(activeTargetId, trimmed);
      toast.success('Nudge sent — applies to the next reply.');
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to send nudge.');
    } finally {
      nudgeLockRef.current = false;
    }
  };

  const handleSetObjective = async (text) => {
    if (!activeTarget) return;
    const trimmed = (text || '').trim();
    if (!trimmed) return;
    if (objectiveLockRef.current) return; // guard against double-fire
    objectiveLockRef.current = true;
    setTargets((prev) =>
      prev.map((t) => (t.id === activeTargetId ? { ...t, objective: trimmed } : t))
    );
    try {
      await setObjective(activeTargetId, trimmed);
      toast.success('Objective set.');
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to set objective.');
    } finally {
      objectiveLockRef.current = false;
    }
  };

  const handleClearObjective = async () => {
    if (!activeTarget) return;
    setTargets((prev) =>
      prev.map((t) => (t.id === activeTargetId ? { ...t, objective: '' } : t))
    );
    try {
      await clearObjective(activeTargetId);
      toast.success('Objective cleared.');
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to clear objective.');
    }
  };

  const currentDraft = drafts[activeTargetId] || { text: "", mode: "brief" };

  const handleDraftTextChange = (text) => {
    setDrafts(prev => ({ ...prev, [activeTargetId]: { ...prev[activeTargetId], text, mode: currentDraft.mode } }));
  };

  const handleDraftModeChange = (mode) => {
    setDrafts(prev => ({ ...prev, [activeTargetId]: { ...prev[activeTargetId], mode, text: currentDraft.text } }));
  };

  const handleUpdateBriefing = (text) => {
    setTargets((prev) =>
      prev.map((t) => {
        if (t.id === activeTargetId) {
          return { ...t, behavior: text };
        }
        return t;
      })
    );
    toast.success("Briefing updated locally.");
  };

  const handleSendMessage = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const textToSend = currentDraft.text.trim();
    if (!activeTargetId || !textToSend) return;
    if (sendLockRef.current) return; // guard against double-fire
    sendLockRef.current = true;

    setSending(true);
    handleDraftTextChange("");

    try {
      if (!activeTarget.paused) {
        await pauseSession(activeTargetId);
        setTargets((prev) =>
          prev.map((t) => (t.id === activeTargetId ? { ...t, paused: true, manual: true } : t))
        );
      }

      const sentMsg = await manualSend(activeTargetId, textToSend);
      if (sentMsg) {
        sentMsg.role = 'manual';
        const mapped = mapBackendMsg(sentMsg, 0);
        setTargets((prev) =>
          prev.map((t) => {
            if (t.id === activeTargetId) {
              // Skip if socket already delivered this message
              if (t.messages.some(m => m.id === mapped.id)) return t;
              return {
                ...t,
                messages: [...t.messages, mapped],
              };
            }
            return t;
          })
        );
      }
    } catch (err) {
      toast.error("Takeover message failed.");
      setManualText(textToSend);
    } finally {
      setSending(false);
      sendLockRef.current = false;
    }
  };

  const handleExportPDF = async () => {
    const element = document.getElementById("chat-feed-export-container");
    if (!element) return;

    try {
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).jsPDF;
      
      const originalContainerStyle = {
        overflow: element.style.overflow,
        height: element.style.height,
        maxHeight: element.style.maxHeight,
      };
      element.style.overflow = "visible";
      element.style.height = "max-content";
      element.style.maxHeight = "none";

      const messagesFeed = document.getElementById("chat-messages-feed");
      const originalFeedStyle = messagesFeed ? {
        overflow: messagesFeed.style.overflow,
        height: messagesFeed.style.height,
        maxHeight: messagesFeed.style.maxHeight,
      } : null;

      if (messagesFeed) {
        messagesFeed.style.overflow = "visible";
        messagesFeed.style.height = "max-content";
        messagesFeed.style.maxHeight = "none";
      }

      const canvas = await html2canvas(element, {
        backgroundColor: "#0E1621",
        scale: 2, // better resolution
        scrollY: -window.scrollY,
        useCORS: true,
        allowTaint: true,
      });
      
      // Restore original styles immediately
      element.style.overflow = originalContainerStyle.overflow;
      element.style.height = originalContainerStyle.height;
      element.style.maxHeight = originalContainerStyle.maxHeight;

      if (messagesFeed && originalFeedStyle) {
        messagesFeed.style.overflow = originalFeedStyle.overflow;
        messagesFeed.style.height = originalFeedStyle.height;
        messagesFeed.style.maxHeight = originalFeedStyle.maxHeight;
      }

      const imgData = canvas.toDataURL("image/png");
      const a4Width = 210;
      const pdfHeight = (canvas.height * a4Width) / canvas.width;
      
      const pdf = new jsPDF("p", "mm", [a4Width, Math.max(297, pdfHeight)]);
      pdf.addImage(imgData, "PNG", 0, 0, a4Width, pdfHeight);
      pdf.save(`decoy-report-${activeTarget?.username || "case"}.pdf`);
      toast.success("Intelligence Report Exported.");
    } catch (err) {
      toast.error("Export failure.");
    }
  };

  // ── DYNAMIC INTEL EXTRACTION FROM LIVE DIALOGUE ──────────────────
  const getExtractedIntel = () => {
    if (!activeTarget) return null;
    const messages = activeTarget.messages || [];
    
    // Gather all raw text from the chat logs
    const allTexts = messages.map(m => m.text || "").join(" ");
    
    // 1. Extract Crypto Wallets (BTC, ETH, XMR)
    const walletRegexes = [
      /\b(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}\b/gi,
      /\b0x[a-fA-F0-9]{40}\b/gi,
      /\b4[0-9a-fA-F]{94}\b/gi
    ];
    let foundWallets = [];
    walletRegexes.forEach(regex => {
      const matches = allTexts.match(regex);
      if (matches) foundWallets.push(...matches);
    });
    foundWallets = Array.from(new Set(foundWallets));

    // 2. Extract Exposed Emails / Onion Contacts
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi;
    let foundEmails = allTexts.match(emailRegex) || [];
    foundEmails = Array.from(new Set(foundEmails));

    // 3. Extract Onion Repositories / Leak Proof Links
    const linkRegex = /\bhttps?:\/\/[a-z2-7]{16,56}\.onion\b/gi;
    const generalLinkRegex = /\bhttps?:\/\/[^\s$.?#].[^\s]*\b/gi;
    let foundLinks = allTexts.match(linkRegex) || allTexts.match(generalLinkRegex) || [];
    foundLinks = Array.from(new Set(foundLinks));

    return {
      artifacts: {
        wallet: foundWallets[0] || "",
        email: foundEmails[0] || "",
        proof: foundLinks[0] || ""
      }
    };
  };

  const intel = getExtractedIntel();

  if (loading) {
    return (
      <div className="w-screen h-screen bg-[#00070D] flex flex-col justify-center items-center font-sans text-white">
        <Spinner className="size-10 text-[#00d1ff] mb-4" />
        <div className="text-sm font-semibold tracking-widest text-[#00d1ff] animate-pulse">
          LOADING SECURE DECOY CHANNELS...
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-[#00070D] flex flex-col overflow-hidden font-sans text-white antialiased select-none relative">
      
      {/* Ambient background glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,209,255,0.04)_0%,transparent_70%)] pointer-events-none" />

      {/* PREMIUM TOP HEADER BAR */}
      <header className="w-full h-16 shrink-0 bg-[#000B14] border-b border-[#126382]/30 flex items-center justify-between px-6 z-20 relative select-none">
        
        {/* Left Side: Logo & Subtext */}
        <div className="flex items-center gap-3">
          <img src={logoGen} alt="DARKMAP Logo" className="w-9 h-9 object-contain" />
          <div className="flex flex-col items-start gap-1">
            <img src={textLogo} alt="DARKMAP" className="h-[26px] w-auto object-contain object-left -ml-0.5" />
            <span className="text-[7.5px] font-bold text-gray-500 uppercase tracking-widest leading-none ml-1">
              AI decoy Agent
            </span>
          </div>
        </div>

        {/* Center: Dynamic Active Pills */}
        <div className="flex items-center gap-3">
          {/* AI AGENT Status Pill */}
          {paused ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/5 text-amber-500 text-[9px] font-bold uppercase tracking-wider leading-none shadow-[0_0_8px_rgba(245,158,11,0.08)]">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              AI AGENT PAUSED
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-[9px] font-bold uppercase tracking-wider leading-none shadow-[0_0_8px_rgba(16,185,129,0.08)]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              AI AGENT ACTIVE
            </div>
          )}



          {/* LIVE Pulsing Broadcast Pill */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-emerald-500/10 bg-emerald-500/5 text-emerald-400 text-[9px] font-bold uppercase tracking-wider leading-none">
            <svg className="w-3.5 h-3.5 text-emerald-400 animate-ping" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ animationDuration: '3s' }}>
              <circle cx="12" cy="12" r="2" />
            </svg>
            LIVE
          </div>
        </div>

        {/* Right Side: Refresh, Export, Notifications & Profile */}
        <div className="flex items-center gap-4">

          {/* Refresh Action */}
          <button 
            onClick={handleSync}
            disabled={isSyncing}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all duration-200 text-xs font-bold ${isSyncing ? 'border-[#00d1ff]/50 bg-[#126382]/20 text-[#00d1ff] opacity-80 cursor-wait' : 'border-[#126382]/20 hover:border-[#00d1ff]/50 bg-[#030911]/40 hover:bg-[#126382]/10 text-gray-300 hover:text-white active:scale-95'}`}
          >
            <svg className={`w-3.5 h-3.5 ${isSyncing ? 'text-[#00d1ff] animate-spin' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {isSyncing ? "Syncing..." : "Refresh"}
          </button>

          {/* Export Case Action */}
          <button 
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#126382]/20 hover:border-[#00d1ff]/50 bg-[#030911]/40 hover:bg-[#126382]/10 text-xs font-bold text-gray-300 hover:text-white transition-all active:scale-95 duration-200"
          >
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export Case
          </button>

          {/* Notification Bell */}
          <div className="relative" ref={notifPanelRef}>
            <button
              id="notification-bell-btn"
              onClick={() => setShowNotifPanel((v) => !v)}
              className="relative flex items-center justify-center w-9 h-9 rounded-lg border border-[#126382]/20 hover:border-[#00d1ff]/50 bg-[#030911]/40 hover:bg-[#126382]/10 text-gray-300 hover:text-white transition-all active:scale-95 duration-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {notifUnreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-1 text-[9px] font-bold text-white bg-red-500 rounded-full shadow-[0_0_6px_rgba(239,68,68,0.4)] animate-pulse">
                  {notifUnreadCount > 99 ? '99+' : notifUnreadCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown Panel */}
            {showNotifPanel && (
              <div className="absolute right-0 top-12 w-80 max-h-96 bg-[#000B14] border border-[#126382]/30 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden z-50 flex flex-col" style={{ backdropFilter: 'blur(12px)' }}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#126382]/20">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Notifications</span>
                  {notifUnreadCount > 0 && (
                    <button
                      onClick={handleMarkAllNotifRead}
                      className="text-[10px] font-semibold text-[#00d1ff] hover:text-white transition-colors uppercase tracking-wider"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                {/* Notification List */}
                <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#126382]/30">
                  {notifications.length === 0 ? (
                    <div className="flex items-center justify-center py-10 text-xs text-gray-600 tracking-wider uppercase">
                      No notifications
                    </div>
                  ) : (
                    notifications.map((notif) => (
                      <button
                        key={notif._id}
                        onClick={() => {
                          if (!notif.read) handleMarkNotifRead(notif._id);
                          // Navigate to the session if it exists in targets
                          const sid = notif.sessionId?._id || notif.sessionId;
                          if (sid && targets.some(t => t.id === sid)) {
                            setActiveTargetId(sid);
                            setShowNotifPanel(false);
                          }
                        }}
                        className={`w-full text-left px-4 py-3 border-b border-[#126382]/10 hover:bg-[#126382]/10 transition-colors flex items-start gap-3 group ${
                          !notif.read ? 'bg-[#00d1ff]/[0.03]' : ''
                        }`}
                      >
                        {/* Indicator dot */}
                        <div className="mt-1.5 shrink-0">
                          {!notif.read ? (
                            <span className="block w-2 h-2 rounded-full bg-[#00d1ff] shadow-[0_0_6px_rgba(0,209,255,0.4)]" />
                          ) : (
                            <span className="block w-2 h-2 rounded-full bg-gray-700" />
                          )}
                        </div>
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-[11px] font-bold truncate ${!notif.read ? 'text-white' : 'text-gray-400'}`}>
                              {notif.title}
                            </span>
                            {notif.type === 'new_message' && (
                              <span className={`shrink-0 text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                                notif.metadata?.direction === 'inbound'
                                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                                  : 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                              }`}>
                                {notif.metadata?.direction === 'inbound' ? 'IN' : 'OUT'}
                              </span>
                            )}
                            {notif.type === 'status_change' && (
                              <span className="shrink-0 text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                STATUS
                              </span>
                            )}
                            {notif.type === 'objective_update' && (
                              <span className="shrink-0 text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                OBJECTIVE
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-500 mt-0.5 truncate leading-relaxed">{notif.body}</p>
                          <span className="text-[9px] text-gray-600 mt-1 block">
                            {(() => {
                              try {
                                const d = new Date(notif.createdAt);
                                const diffMs = Date.now() - d.getTime();
                                const diffMin = Math.floor(diffMs / 60000);
                                if (diffMin < 1) return 'just now';
                                if (diffMin < 60) return `${diffMin}m ago`;
                                const diffH = Math.floor(diffMin / 60);
                                if (diffH < 24) return `${diffH}h ago`;
                                return `${Math.floor(diffH / 24)}d ago`;
                              } catch { return ''; }
                            })()}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>



        </div>

      </header>

      {/* VIEWPORT THREE-COLUMN CONTAINER */}
      <div className="grow w-full flex flex-row overflow-hidden relative z-10 pb-3">
        
        {/* COLUMN 1: LEFT SIDEBAR (TARGET LIST) */}
        <ChatSidebar
          targets={targets}
          drafts={drafts}
          activeTargetId={activeTargetId}
          onSelectTarget={(id) => {
            setActiveTargetId(id);
            markSessionRead(id);
            setTargets((prev) => prev.map(t => {
              if (t.id === id) {
                return { ...t, unseenCount: 0 };
              }
              return t;
            }));
          }}
          onAddTarget={() => setShowCreate(true)}
          onBack={() => navigate("/generic")}
          expanded={true}
        />

        {/* COLUMN 2: CENTER PANEL (ACTIVE CONVERSATION) */}
        <div className="grow flex flex-col bg-[#00070D] relative overflow-hidden p-3 gap-3 border-r border-[#126382]/30">
          {activeTarget ? (
            <div
              className={`grow flex flex-col rounded-2xl overflow-hidden transition-all duration-500 ${aiActive ? "gemini-galaxy-container" : ""}`}
              style={aiActive ? {
                minHeight: 0,
                padding: "3px"
              } : {
                border: "2px solid #126382",
                background: "#0E1621",
                minHeight: 0,
                boxShadow: "none",
              }}
            >
              <div
                className={`grow flex flex-col overflow-hidden ${aiActive ? "gemini-galaxy-inner rounded-[calc(1rem-3px)]" : ""}`}
                style={aiActive ? { background: "#0E1621" } : {}}
              >
                <ChatArea
                  selectedProfile={activeTarget.profile}
                  targetUsername={activeTarget.username}
                  messages={activeTarget.messages}
                  inputValue={currentDraft.text}
                  setInputValue={handleDraftTextChange}
                  inputMode={currentDraft.mode}
                  setInputMode={handleDraftModeChange}
                  onSubmitMessage={handleSendMessage}
                  isTyping={activeTarget.isTyping}
                  chatEndRef={chatEndRef}
                  paused={paused}
                  manual={manual}
                  briefActive={briefActive}
                  onPauseResume={handlePauseResume}
                  onBriefToggle={handleBriefToggle}
                  onSendBrief={handleSendBrief}
                  premium={true}
                  onExport={handleExportPDF}
                  onManualToggle={handleManualToggle}
                  onDelete={() => setShowDeleteConfirm(true)}
                  tag={activeTarget.tag}
                  elapsed={activeTarget.elapsed}
                />
              </div>
            </div>
          ) : (
            <div className="grow flex items-center justify-center text-center text-xs text-gray-600 tracking-wider uppercase">
              SELECT OR INITIALIZE A DECOY PROFILE FROM THE SIDEBAR
            </div>
          )}
        </div>

        {/* COLUMN 3: RIGHT PANEL (PROFILER & INTEL) */}
        <div className="w-[28%] shrink-0 flex flex-col bg-[#000B14] relative overflow-hidden">
          {activeTarget && intel ? (
            <IntelligencePanel
              selectedProfile={activeTarget.profile}
              targetUsername={activeTarget.username}
              purpose={activeTarget.purpose}
              behavior={activeTarget.behavior}
              paused={paused}
              onPausedChange={handlePauseResume}
              manual={manual}
              onManualChange={handleManualToggle}
              onExport={handleExportPDF}
              onUpdateBriefing={handleUpdateBriefing}
              onSync={handleSync}
              onCreate={handleCreateSession}
              artifacts={intel.artifacts}
              premium={true}
              messages={activeTarget.messages || []}
              tag={activeTarget.tag}
              elapsed={activeTarget.elapsed}
              objective={activeTarget.objective || ''}
              onSetObjective={handleSetObjective}
              onClearObjective={handleClearObjective}
              onSendNudge={handleSendBrief}
            />
          ) : (
            <div className="grow flex items-center justify-center text-center text-xs text-gray-600 tracking-wider uppercase p-4">
              NO ACTIVE PROFILE INTELLIGENCE
            </div>
          )}
        </div>

      </div>
      
      {showCreate && (
        <CreateSessionModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreateSession}
        />
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 font-sans antialiased">
          <div className="bg-[#000B14] border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-[0_0_20px_rgba(239,68,68,0.1)]">
            <div className="flex items-center gap-3 mb-4 text-red-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h2 className="font-bold text-lg tracking-wide uppercase">Confirm Deletion</h2>
            </div>
            <p className="text-sm text-gray-400 mb-6 leading-relaxed">
              Are you sure you want to permanently delete this intelligence session? This action cannot be undone and will destroy all associated logs.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 text-sm text-gray-400 border border-[#126382]/30 rounded-lg hover:bg-[#126382]/10 transition-colors font-semibold tracking-wider"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleDeleteTarget}
                disabled={isDeleting}
                className="flex-1 py-2 text-sm text-white bg-red-600/80 border border-red-500 rounded-lg hover:bg-red-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 font-semibold tracking-wider"
              >
                {isDeleting ? <Spinner className="size-4" /> : 'DELETE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
