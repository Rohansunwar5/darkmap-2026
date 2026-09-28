import React, { useState, useEffect, useRef, useCallback } from "react";
import WelcomeScreen from "./WelcomeScreen";
import LoadingScreen from "./LoadingScreen";
import { CreateSessionModal } from "../../pages/decoy/DecoyPage";
import ChatDashboard from "./ChatDashboard";
import { useDecoy } from "../../context/DecoyContext";
import { useDecoySocket } from "../../hooks/useDecoySocket";
import { toast } from "react-toastify";
import "./decoy.css";

// Helper to map backend session to frontend target structure
const mapSessionToTarget = (session) => {
  return {
    id: session._id,
    username: session.targetIdentifier,
    profile: { name: session.targetName || "Target" },
    purpose: "General Assessment",
    behavior: session.targetContext || "",
    messages: [], // fetched asynchronously
    isTyping: false,
    paused: session.status === "paused" || session.status === "stopped",
    manual: false,
    briefActive: false,
  };
};

const mapBackendMsg = (msg, index) => {
  if (!msg) return null;
  const isOutgoing = msg.role === "ai" || msg.role === "manual";
  let formattedTime = "";
  try {
    const d = new Date(msg.timestamp || Date.now());
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
    mediaUrl: msg.mediaUrl || null,
    mediaKind: msg.mediaKind || null,
  };
};

const Chatbot = () => {
  const {
    fetchSessions,
    createSession,
    fetchMessages,
    pauseSession,
    resumeSession,
    manualSend,
  } = useDecoy();

  const [step, setStep] = useState("welcome"); // welcome, profiles, prompt, username_prompt, loading, chat
  const [targets, setTargets] = useState([]); // Array of formatted targets
  const [activeTargetId, setActiveTargetId] = useState(null);

  const [showCreate, setShowCreate] = useState(false);
  const [loadingText, setLoadingText] = useState("");

  const chatEndRef = useRef(null);

  // Find the active target object
  const activeTarget = targets.find((t) => t.id === activeTargetId);

  // Connect socket for the active session
  useDecoySocket({
    sessionId: activeTargetId,
    onMessage: (msg) => {
      setTargets((prev) =>
        prev.map((t) => {
          if (t.id === activeTargetId) {
            return {
              ...t,
              messages: [...t.messages, mapBackendMsg(msg, 0)],
              isTyping: false,
            };
          }
          return t;
        })
      );
    },
    onStatus: ({ status }) => {
      setTargets((prev) =>
        prev.map((t) => {
          if (t.id === activeTargetId) {
            return {
              ...t,
              paused: status === "paused" || status === "stopped",
            };
          }
          return t;
        })
      );
    },
  });

  // Load messages when the active target changes
  useEffect(() => {
    if (activeTargetId) {
      fetchMessages(activeTargetId)
        .then((msgs) => {
          setTargets((prev) =>
            prev.map((t) => {
              if (t.id === activeTargetId) {
                return { ...t, messages: msgs.map(mapBackendMsg) };
              }
              return t;
            })
          );
        })
        .catch(() => toast.error("Failed to load chat history."));
    }
  }, [activeTargetId, fetchMessages]);

  const handleSync = useCallback(async (targetId) => {
    const idToSync = targetId || activeTargetId;
    if (!idToSync) return;
    try {
      const msgs = await fetchMessages(idToSync);
      setTargets((prev) =>
        prev.map((t) => {
          if (t.id === idToSync) {
            return { 
              ...t, 
              messages: msgs.map(mapBackendMsg).filter(Boolean) 
            };
          }
          return t;
        })
      );
      toast.success("Messages synchronized.");
    } catch (err) {
      toast.error("Failed to sync messages.");
    }
  }, [activeTargetId, fetchMessages]);

  // Scroll to bottom when messages or typing status updates for the active target
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeTarget?.messages, activeTarget?.isTyping]);

  const handleStart = async () => {
    setLoadingText("Initializing Secure Link...");
    setStep("loading");
    
    try {
      const existingSessions = await fetchSessions();
      if (existingSessions && existingSessions.length > 0) {
        const newTargets = existingSessions.map(mapSessionToTarget);
        setTargets(newTargets);
        setActiveTargetId(newTargets[0].id);
        setStep("chat");
      } else {
        setShowCreate(true);
        setStep("welcome");
      }
    } catch (err) {
      toast.error("Failed to fetch sessions. Proceeding to new session setup.");
      setShowCreate(true);
      setStep("welcome");
    }
  };

  const handleAddTarget = () => {
    setShowCreate(true);
  };

  const handleCreateSession = async (formData) => {
    try {
      const session = await createSession(formData);
      const newTarget = mapSessionToTarget(session);
      setTargets((prev) => [...prev, newTarget]);
      setActiveTargetId(newTarget.id);
      setStep("chat");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to create session");
      throw err; // Re-throw to let the modal handle the loading state
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!activeTarget) return;

    const activeTargetInputValue = activeTarget.inputValue || "";
    if (!activeTargetInputValue.trim()) return;

    const text = activeTargetInputValue.trim();

    // Clear input immediately for better UX
    setTargets((prev) =>
      prev.map((t) => {
        if (t.id === activeTargetId) {
          return { ...t, inputValue: "" };
        }
        return t;
      })
    );

    try {
      // Auto-pause bot if sending manually and not already paused
      if (!activeTarget.paused) {
        await pauseSession(activeTargetId);
        setTargets((prev) =>
          prev.map((t) => (t.id === activeTargetId ? { ...t, paused: true } : t))
        );
      }

      const msg = await manualSend(activeTargetId, text);
      if (msg) {
        setTargets((prev) =>
          prev.map((t) => {
            if (t.id === activeTargetId) {
              return { ...t, messages: [...t.messages, mapBackendMsg(msg, 0)] };
            }
            return t;
          })
        );
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to send message");
      // Restore input text on failure
      setTargets((prev) =>
        prev.map((t) => (t.id === activeTargetId ? { ...t, inputValue: text } : t))
      );
    }
  };

  const handleInputValueChange = (value) => {
    setTargets((prev) =>
      prev.map((t) => {
        if (t.id === activeTargetId) {
          return { ...t, inputValue: value };
        }
        return t;
      })
    );
  };

  const handleUpdateBriefing = (text) => {
    // Note: Backend doesn't support updating context dynamically yet, 
    // but we can store it in UI state.
    setTargets((prev) =>
      prev.map((t) => {
        if (t.id === activeTargetId) {
          return { ...t, behavior: text };
        }
        return t;
      })
    );
  };

  const handleUpdateTargetState = async (id, updates) => {
    // If the UI attempts to toggle pause/resume via IntelligencePanel
    if (updates.paused !== undefined) {
      const target = targets.find((t) => t.id === id);
      if (target && target.paused !== updates.paused) {
        try {
          if (updates.paused) {
            await pauseSession(id);
          } else {
            await resumeSession(id);
          }
        } catch (err) {
          toast.error("Failed to update bot state");
          return; // Abort UI state update on failure
        }
      }
    }

    setTargets((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          return { ...t, ...updates };
        }
        return t;
      })
    );
  };

  const handleReset = () => {
    setStep("welcome");
    setTargets([]);
    setActiveTargetId(null);
    setShowCreate(false);
  };


  return (
    <div className="w-full h-full flex justify-center items-center overflow-hidden">
      {step === "welcome" && <WelcomeScreen onStart={handleStart} />}



      {step === "loading" && <LoadingScreen loadingText={loadingText} />}

      {step === "chat" && activeTarget && (
        <ChatDashboard
          targets={targets}
          activeTargetId={activeTargetId}
          activeTarget={activeTarget}
          onSelectTarget={(id) => setActiveTargetId(id)}
          onAddTarget={handleAddTarget}
          onReset={handleReset}
          inputValue={activeTarget.inputValue || ""}
          setInputValue={handleInputValueChange}
          onSendMessage={handleSendMessage}
          onUpdateBriefing={handleUpdateBriefing}
          onUpdateTargetState={handleUpdateTargetState}
          onSync={handleSync}
          chatEndRef={chatEndRef}
        />
      )}

      {showCreate && (
        <CreateSessionModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreateSession}
        />
      )}
    </div>
  );
};

export default Chatbot;
