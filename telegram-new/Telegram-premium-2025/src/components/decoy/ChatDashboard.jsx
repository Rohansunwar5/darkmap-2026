import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import ChatSidebar from "./ChatSidebar";
import ChatArea from "./ChatArea";
import IntelligencePanel from "./IntelligencePanel";

const ChatDashboard = ({
  targets,
  activeTargetId,
  activeTarget,
  onSelectTarget,
  onAddTarget,
  onReset,
  inputValue,
  setInputValue,
  onSendMessage,
  onUpdateBriefing,
  onUpdateTargetState,
  onSync,
  chatEndRef,
}) => {
  const navigate = useNavigate();
  // Use per-target state to ensure isolation between tabs
  const paused = activeTarget?.paused || false;
  const manual = activeTarget?.manual || false;
  const briefActive = activeTarget?.briefActive || false;

  /* ── Pause / Resume toggle ──────────────────────────────── */
  const handlePauseResume = () => {
    const next = !paused;
    if (next) {
      // Pausing → also activate manual, turn off brief
      onUpdateTargetState(activeTargetId, { paused: true, manual: true, briefActive: false });
    } else {
      // Resuming → clear manual
      onUpdateTargetState(activeTargetId, { paused: false, manual: false });
    }
  };

  /* ── Manual toggle (from IntelligencePanel) ─────────────── */
  const handleManualToggle = () => {
    const next = !manual;
    if (next) {
      onUpdateTargetState(activeTargetId, { manual: true, paused: true, briefActive: false });
    } else {
      onUpdateTargetState(activeTargetId, { manual: false, paused: false });
    }
  };

  /* ── Brief toggle (from ChatArea) ───────────────────────── */
  const handleBriefToggle = () => {
    const next = !briefActive;
    onUpdateTargetState(activeTargetId, { briefActive: next });
    // Brief doesn't pause the AI — it just lets you edit the briefing
    // If turning on brief while paused/manual, leave those as-is
  };

  /* ── Submit a brief from the chat input ─────────────────── */
  const handleSendBrief = (text) => {
    if (text.trim() && onUpdateBriefing) {
      onUpdateBriefing(text.trim());
    }
    onUpdateTargetState(activeTargetId, { briefActive: false });
  };

  // AI is actively chatting when not paused and not manual
  const aiActive = !paused && !manual;

  // Export Chat to PDF
  const handleExportPDF = async () => {
    const element = document.getElementById("chat-feed-export-container");
    if (!element) return;
    
    try {
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).jsPDF;
      
      // Temporarily expand the container to its full scroll height
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
      
      // We calculate the required height to fit the full image in a single continuous page
      const a4Width = 210; // A4 width in mm
      const pdfHeight = (canvas.height * a4Width) / canvas.width;
      
      // Create a PDF with a custom height that perfectly fits the chat length
      const pdf = new jsPDF("p", "mm", [a4Width, Math.max(297, pdfHeight)]);
      
      pdf.addImage(imgData, "PNG", 0, 0, a4Width, pdfHeight);
      pdf.save(`decoy-chat-${activeTarget?.username || "export"}-${new Date().getTime()}.pdf`);
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  return (
    <div className="grow glass-glow font-sans m-3 md:m-5 self-stretch flex flex-row rounded-2xl overflow-hidden shadow-2xl">
      {/* Left Vertical Sidebar */}
      <ChatSidebar
        targets={targets}
        activeTargetId={activeTargetId}
        onSelectTarget={onSelectTarget}
        onAddTarget={onAddTarget}
        onBack={onReset}
      />

      {/* Right Main Panel */}
      <div className="grow flex flex-col h-full overflow-hidden p-3 md:p-4 gap-3" style={{ background: "#00070D" }}>
        {/* Main Header (Outside Chat Border) */}
        <div className="flex items-center shrink-0 select-none justify-between">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
               <div className="flex items-center gap-2">
                  <span className="text-[#00d1ff] bg-[#00d1ff]/10 p-1 rounded-md border border-[#00d1ff]/30">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </span>
                  <h2 className="text-sm font-bold text-white tracking-wider">AI Decoy Agent</h2>

                  {/* Dynamic LIVE / PAUSED badge */}
                  <span
                    className="px-1.5 py-[1px] rounded-full text-[8px] font-bold flex items-center gap-1 transition-all duration-300"
                    style={{
                      background: paused ? "rgba(245,158,11,0.18)" : "rgba(16,185,129,0.18)",
                      color:      paused ? "#FBBF24"               : "#34D399",
                      border:     `1px solid ${paused ? "rgba(245,158,11,0.45)" : "rgba(16,185,129,0.45)"}`,
                    }}
                  >
                    <span
                      className="w-1 h-1 rounded-full"
                      style={{
                        background: paused ? "#FBBF24" : "#34D399",
                        boxShadow:  paused ? "none" : "0 0 4px #34D399",
                        animation:  paused ? "none" : "pulse 1.4s infinite",
                      }}
                    />
                    {paused ? "PAUSED" : "ACTIVE"}
                  </span>
               </div>

            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button type="button" onClick={() => onSync && onSync(activeTargetId)} className="text-gray-400 hover:text-[#00d1ff] transition-colors flex items-center gap-1" title="Sync">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="text-[10px] font-semibold hidden md:inline-block uppercase tracking-wider">Sync</span>
            </button>
            <button type="button" onClick={handleExportPDF} className="text-gray-400 hover:text-[#00d1ff] transition-colors flex items-center gap-1 pl-2.5" title="Export Case">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-[10px] font-semibold hidden md:inline-block uppercase tracking-wider">Export</span>
            </button>
            <button
              type="button"
              onClick={() => navigate("/generic/decoy")}
              className="text-gray-400 hover:text-[#00d1ff] transition-colors pl-2.5 flex items-center gap-1 border-l border-gray-800"
              title="Full Screen View"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4M16 4h4v4M4 16v4h4M20 16v4h-4" />
              </svg>
            </button>
            <button type="button" className="text-gray-400 hover:text-[#00d1ff] transition-colors pl-2.5 relative" title="Notifications">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-pink-500 border border-[#000B14]"></span>
            </button>
          </div>
        </div>

        {/* Content Split */}
        <div className="grow flex flex-col h-full overflow-hidden gap-3 pb-1">
          {/* Top Chat Area — glow when AI is active */}
          <div
            className={`grow flex flex-col rounded-2xl overflow-hidden transition-all duration-500 ${aiActive ? "gemini-galaxy-container" : ""}`}
            style={aiActive ? {
              minHeight: 0,
            } : {
              border: "2px solid #126382",
              background: "#0E1621",
              minHeight: 0,
              boxShadow: "none",
            }}
          >
            {/* Inner wrapper needed for gemini-galaxy-container (it uses padding as the glow border) */}
            <div
              className={`grow flex flex-col overflow-hidden ${aiActive ? "gemini-galaxy-inner rounded-[calc(1rem-3px)]" : ""}`}
              style={aiActive ? { background: "#0E1621" } : {}}
            >
              <ChatArea
                selectedProfile={activeTarget.profile}
                targetUsername={activeTarget.username}
                messages={activeTarget.messages}
                inputValue={inputValue}
                setInputValue={setInputValue}
                onSubmitMessage={onSendMessage}
                isTyping={activeTarget.isTyping}
                chatEndRef={chatEndRef}
                paused={paused}
                manual={manual}
                briefActive={briefActive}
                onPauseResume={handlePauseResume}
                onBriefToggle={handleBriefToggle}
                onSendBrief={handleSendBrief}
              />
            </div>
          </div>

          {/* Bottom Intelligence Panel */}
          <div className="shrink-0 h-[38%] flex flex-col">
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
              onUpdateBriefing={onUpdateBriefing}
              onSync={() => onSync && onSync(activeTargetId)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatDashboard;