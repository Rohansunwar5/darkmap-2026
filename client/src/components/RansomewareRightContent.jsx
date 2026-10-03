import React, { useState } from "react";
import RansomeFeedIcon from "../assets/ransomefeed.png";
import Icon from "../assets/ss-icon.png";
import Box from "../assets/box1.png";
import ThreatIntelModal from "./ThreatIntelModal";
import "../styles/styles.css";

// Helper to normalize empty or missing fields to "N/A"
function naIfEmpty(val) {
  if (val === undefined || val === null) return "N/A";
  if (typeof val === "string" && val.trim() === "") return "N/A";
  return val;
}

function mapRansomwareMessage(item) {
  if (!item) return null;
  const raw = item.raw || item;
  const rawActor =
    raw.threat_actors ||
    raw.threat_actor ||
    raw.threatActor ||
    item.threat_actors ||
    item.threat_actor ||
    item.group;

  let resolvedGroup = item.group;
  if (Array.isArray(rawActor) && rawActor.length > 0) {
    resolvedGroup = rawActor.map(a => typeof a === 'object' ? a.name || JSON.stringify(a) : String(a)).join(', ');
  } else if (typeof rawActor === 'string' && rawActor.trim()) {
    resolvedGroup = rawActor.trim();
  }

  const resolvedVictim =
    raw.victim_organization ||
    raw.victim_name ||
    raw.victim_site ||
    raw.victim ||
    raw.target ||
    item.victim;

  const resolvedUrl =
    raw.published_url ||
    raw.source_url ||
    raw.leak_url ||
    raw.url ||
    item.url;

  const rawScreenshot =
    item.screenshot ||
    item.screenshot_full ||
    item.screenshot_thumb ||
    item.screenshotUrl ||
    (raw && (raw.screenshots_full || raw.screenshots_thumb || raw.screenshot));

  return {
    description: naIfEmpty(item.description || raw.description || raw.summary || raw.title),
    discovered: naIfEmpty(item.attackdate || raw.date || raw.timestamp || raw.created_at),
    group_name: naIfEmpty(resolvedGroup),
    website: naIfEmpty(resolvedVictim),
    url: naIfEmpty(resolvedUrl),
    screenshot: rawScreenshot ? String(rawScreenshot).split(',')[0].trim() : "N/A",
    work_sector: naIfEmpty(item.work_sector || raw.victim_industry || raw.industry),
  };
}

const RansomewareRightContent = ({ selectedMessage }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // If no message is selected
  if (!selectedMessage) {
    return <div className="text-center">Select a message to view details</div>;
  }

  // Map the ransomware API fields to the expected display fields
  const displayData = mapRansomwareMessage(selectedMessage);

  return (
    <>
      <div
        style={{ marginTop: "10px", padding: "20px 10px" }}
        className="text-white text-justify font-sans"
      >
        <div
          className="relative overflow-hidden"
          style={{
            width: "85%",
            height: "340px",
            marginLeft: "35px",
          }}
        >
          <img
            src={Box}
            alt="Chat Box"
            className="absolute w-full h-full z-10"
          />
          <div
            className="absolute z-20 flex flex-row items-start overflow-y-auto scrollbar-hidden"
            style={{
              top: "16px",
              left: "18px",
              right: "16px",
              bottom: "16px",
              overflowX: "hidden",
            }}
          >
            <img
              src={RansomeFeedIcon}
              alt="Ransome"
              className="align-start"
              style={{ width: "28px", height: "28px" }}
            />
            <div
              className="flex-1 font-[Arimo] font-thin text-white box-border overflow-wrap break-words normal-case"
              style={{
                marginLeft: "20px",
                marginTop: "-2px",
                paddingRight: "10px",
                fontSize: "16px",
              }}
            >
              {displayData.description}
            </div>
          </div>
          {/* Below-left button to see Threat Actor details */}
          <button
            onClick={() => setIsModalOpen(true)}
            title="View Threat Actor Profile"
            className="absolute z-30 flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#00d1ff1c] hover:bg-[#00d1ff38] border border-[#00d1ff88] text-[#00d1ff] transition-all duration-200 cursor-pointer text-xs font-sans"
            style={{ bottom: "5px", left: "18px" }}
          >
            <svg
              className="w-4 h-4 text-[#00d1ff]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <circle cx="7" cy="12" r="3.2" strokeWidth="2" />
              <circle cx="17" cy="12" r="3.2" strokeWidth="2" />
              <path strokeWidth="2" strokeLinecap="round" d="M10.2 12h3.6" />
            </svg>
            <span>Threat Actor</span>
          </button>
          <div
            className="absolute  text-[#00adf0] z-30 font-[Arimo]"
            style={{ bottom: "0px", right: "17px", fontSize: "11px" }}
          >
            {displayData.discovered !== "N/A" && displayData.discovered !== ""
              ? new Date(displayData.discovered).toLocaleString()
              : "N/A"}
          </div>
        </div>
        <div className="relative block w-full pb-6">
          <div className="absolute bottom-0 left-0 w-full h-0 border-b-2 border-dotted border-[#00c2ff42]"></div>
        </div>
        {/* Lower content */}
        <div
          className="text-left"
          style={{
            padding: "45px",
            color: "#00d1ff",
            textAlign: "left",
          }}
        >
          <div
            className="font-anek text-left cursor-pointer group"
            onClick={() => setIsModalOpen(true)}
            title="Click to view Threat Actor Profile"
            style={{
              fontSize: "1.2rem",
              lineHeight: "1.7rem",
              fontWeight: "100",
            }}
          >
            <span className="text-white">Criminal Group :</span>{" "}
            <span className="hover:underline text-[#00d1ff]">{displayData.group_name}</span>
          </div>
          <div
            className="font-anek text-left"
            style={{
              fontSize: "1.2rem",
              lineHeight: "1.7rem",
              fontWeight: "100",
            }}
          >
            <span className="text-white">Website :</span>{" "}
            {displayData.website}
          </div>
          <div
            className="font-anek text-left"
            style={{
              fontSize: "1.2rem",
              lineHeight: "1.7rem",
              fontWeight: "100",
              wordBreak: "break-all",
            }}
          >
            <span className="text-white">Post Url :</span>{" "}
            {displayData.url && displayData.url !== "N/A" && displayData.url.startsWith("http") ? (
              <a
                href={displayData.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline text-[#00d1ff] break-all"
              >
                {displayData.url}
              </a>
            ) : (
              <span className="break-all">{displayData.url}</span>
            )}
          </div>
          <div
            className="font-anek text-left"
            style={{
              fontSize: "1.2rem",
              lineHeight: "1.7rem",
              fontWeight: "100",
            }}
          >
            <span className="text-white">Work Sector :</span>{" "}
            {displayData.work_sector}
          </div>
          <div
            className="font-anek text-left"
            style={{
              fontSize: "1.2rem",
              lineHeight: "1.7rem",
              fontWeight: "100",
            }}
          >
            <span className="text-white">Date :</span>{" "}
            {displayData.discovered !== "N/A" && displayData.discovered !== ""
              ? new Date(displayData.discovered).toLocaleString()
              : "N/A"}
          </div>
        </div>

        {/* Screenshot / Leak Preview */}
        {displayData.screenshot && displayData.screenshot !== "N/A" && (
          <div
            className="relative bg-[#0094FF1C] flex rounded-2xl justify-center items-center overflow-hidden text-white shadow-md"
            style={{
              marginLeft: "30px",
              marginTop: "10px",
              marginBottom: "30px",
              height: "315px",
              border: "1px solid #126382",
              padding: "19px",
              width: "85%",
              boxShadow: "0 4px 8px rgba(0, 0, 0, 0.2)",
            }}
          >
            <div
              className="absolute left-0 w-full text-center box-border font-[Aldrich] text-[#00d1ff]"
              style={{ top: "1%", padding: "5px 0" }}
            >
              <img
                src={Icon}
                alt="leak preview"
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  top: "45%",
                  left: "12px",
                  width: "18px",
                  height: "15px",
                }}
                className="absolute"
              />
              <span style={{ fontSize: "13px" }}>Leak / Evidence Preview</span>
            </div>
            <div className="w-full h-full flex items-center justify-center">
              <img
                src={displayData.screenshot}
                alt="Ransomware leak screenshot"
                className="max-w-full max-h-full object-contain"
                style={{ marginTop: "20px", width: "90%", height: "90%" }}
              />
            </div>
          </div>
        )}

        {/* Threat Intelligence Dossier Modal */}
        <ThreatIntelModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          data={selectedMessage}
          type="ransomware"
        />
      </div>
    </>
  );
};

export default RansomewareRightContent;