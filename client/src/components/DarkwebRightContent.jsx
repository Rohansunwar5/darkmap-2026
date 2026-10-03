import React, { useState } from "react";
import DarkwebIcon from "../assets/darweb-forum.png";
import Icon from "../assets/ss-icon.png";
import Box from "../assets/box1.png";
import ThreatIntelModal from "./ThreatIntelModal";
import "../styles/styles.css";

const parseContent = (content) => {
  if (!content) return {};
  if (typeof content === "object") return content;
  try {
    return JSON.parse(content);
  } catch (e) {
    const regex = /"([^"]+)":\s*"([^"]*)"/g;
    let match;
    const result = {};

    while ((match = regex.exec(content)) !== null) {
      result[match[1]] = match[2];
    }

    return result;
  }
};

const replaceLeakbaseDomains = (text) => {
  if (!text) return text;
  return text
    .replace(/leakbase\.io/g, 'leakbase.la')
    .replace(/leakbase\.cc/g, 'leakbase.la');
};

const isGenericActor = (val) => {
  if (!val) return true;
  const lower = String(val).toLowerCase().trim();
  return [
    "threat actor",
    "unknown threat actor",
    "unknown",
    "n/a",
    "none",
    "person",
    "hidden",
    "undisclosed",
    "unspecified",
  ].includes(lower);
};

const extractActorFromText = (text) => {
  if (!text || typeof text !== "string") return null;
  const patterns = [
    /\b(?:posted\s+by|published\s+by|authored\s+by|author\s*:|user\s*:|sender\s*:)\s*[:\-]?\s*([a-zA-Z0-9_\-\.\@]+(?:\s+[a-zA-Z0-9_\-\.\@]+)?)/i,
    /\bby\s+([a-zA-Z0-9_\-\.\@]+(?:\s+[a-zA-Z0-9_\-\.\@]+)?)(?:$|\s*[\(\[\,\.])/i,
  ];
  for (const regex of patterns) {
    const match = text.match(regex);
    if (match && match[1]) {
      const candidate = match[1].trim();
      if (!isGenericActor(candidate) && candidate.length >= 2 && candidate.length <= 40) {
        return candidate;
      }
    }
  }
  return null;
};

const resolveActor = (parsedContent, message) => {
  const raw = message?.raw || message || {};

  const actorCandidate =
    raw.threat_actors ||
    raw.threat_actor ||
    raw.threatActor ||
    message?.threat_actors ||
    message?.threat_actor;
  if (actorCandidate) {
    if (Array.isArray(actorCandidate) && actorCandidate.length > 0) {
      const joined = actorCandidate
        .map((a) => (typeof a === "object" ? a.name || JSON.stringify(a) : String(a)))
        .join(", ");
      if (!isGenericActor(joined)) return joined;
    } else if (typeof actorCandidate === "string" && !isGenericActor(actorCandidate)) {
      return actorCandidate.trim();
    }
  }

  const userCandidate =
    raw.author ||
    raw.user ||
    raw.username ||
    raw.poster ||
    raw.creator ||
    raw.sender ||
    parsedContent?.author ||
    parsedContent?.Author ||
    message?.author;
  if (typeof userCandidate === "string" && userCandidate.trim() && !isGenericActor(userCandidate)) {
    return userCandidate.trim();
  }

  if (raw.threat_actor_profile?.name || raw.threat_actor_profile?.actor_name) {
    return raw.threat_actor_profile.name || raw.threat_actor_profile.actor_name;
  }

  const title = raw.title || message?.title || "";
  const body =
    parsedContent?.Content ||
    parsedContent?.content ||
    raw.description ||
    raw.content ||
    message?.description ||
    "";
  const extracted = extractActorFromText(title) || extractActorFromText(body);
  if (extracted) {
    return extracted;
  }

  return userCandidate && !isGenericActor(userCandidate) ? userCandidate : "Threat Actor";
};

const resolveSourceUrl = (parsedContent, message) => {
  const raw = message?.raw || message || {};

  const urlCandidate =
    raw.published_url ||
    raw.source_url ||
    parsedContent?.Source ||
    parsedContent?.source ||
    raw.url ||
    message?.url;

  if (urlCandidate && typeof urlCandidate === "string" && !urlCandidate.toLowerCase().includes("darkwebsonar")) {
    return urlCandidate;
  }

  const networkCandidate =
    raw.network ||
    raw.platform ||
    raw.forum ||
    (typeof message?.source === "string" ? message.source : message?.source?.name);

  if (networkCandidate && typeof networkCandidate === "string") {
    const cleaned = networkCandidate.replace(/darkwebsonar/gi, "Darknet").trim();
    if (cleaned && cleaned.toLowerCase() !== "hidden") return cleaned;
  }

  return "Darkweb-Forums";
};

const DarkwebRightContent = ({ selectedMessage }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!selectedMessage) {
    return <div className="text-center">Select a message to view details</div>;
  }

  // Parse the content string into an object
  const parsedContent = parseContent(selectedMessage.content || "{}");

  // Resolve threat actor and source
  const resolvedAuthor = resolveActor(parsedContent, selectedMessage);
  const processedAuthor = replaceLeakbaseDomains(resolvedAuthor);

  const resolvedSource = resolveSourceUrl(parsedContent, selectedMessage);
  const processedSource = replaceLeakbaseDomains(resolvedSource);

  let sourceLabel = processedSource;
  if (processedSource && processedSource.startsWith("http")) {
    try {
      sourceLabel = new URL(processedSource).hostname.replace(/^www\./i, "");
    } catch {
      sourceLabel = processedSource;
    }
  }

  const rawScreenshot =
    parsedContent.screenshot ||
    parsedContent.screenshot_full ||
    parsedContent.screenshot_thumb ||
    selectedMessage.screenshot ||
    selectedMessage.screenshot_full ||
    selectedMessage.screenshot_thumb ||
    (selectedMessage.raw &&
      (selectedMessage.raw.screenshots_full ||
        selectedMessage.raw.screenshots_thumb ||
        selectedMessage.raw.screenshot));

  const screenshotUrl = rawScreenshot
    ? String(rawScreenshot).split(",")[0].trim()
    : null;

  return (
    <>
      <div
        style={{ marginTop: "10px", padding: "20px 10px" }}
        className="text-white text-justify font-sans"
      >
        {parsedContent ? (
          <>
            <div
              className="text-center font-[Aldrich]"
              style={{
                paddingBottom: "23px",
                fontSize: "15px",
                paddingTop: "10px",
              }}
            >
              <span className="text-[#00d1ff] font-bold">
                {processedAuthor}
              </span> sent a message on
              <span className="text-[#00d1ff] font-bold">
              {" "}
                {processedSource && processedSource.startsWith("http") ? (
                  <a href={processedSource} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {sourceLabel || processedSource}
                  </a>
                ) : (
                  <span>{processedSource || "Darkweb-Forums"}</span>
                )}
              </span>
            </div>
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
                  src={DarkwebIcon}
                  alt="Darkweb"
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
                  {parsedContent.Content || "No Content available"}
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
                {new Date(
                  parsedContent["Detection Date"] || Date.now()
                ).toLocaleString()}
              </div>
            </div>
            <div className="relative block w-full pb-6">
              <div className="absolute bottom-0 left-0 w-full h-0 border-b-2 border-dotted border-[#00c2ff42]"></div>
            </div>
            <div
              className="text-left"
              style={{
                padding: "45px",
                color: "#00d1ff",
                textAlign: "left",
              }}
            >
              <div
                className="font-anek text-left"
                style={{
                  fontSize: "1.2rem",
                  lineHeight: "1.7rem",
                  fontWeight: "100",
                  wordBreak: "break-all",
                }}
              >
                <span className="text-white">Source / URL:</span>{" "}
                {processedSource && processedSource.startsWith("http") ? (
                  <a href={processedSource} target="_blank" rel="noopener noreferrer" className="hover:underline break-all">
                    {processedSource}
                  </a>
                ) : (
                  <span className="break-all">{processedSource || "Darkweb-Forums"}</span>
                )}
              </div>
              <div
                className="font-anek font-thin cursor-pointer group"
                onClick={() => setIsModalOpen(true)}
                title="Click to view Threat Actor Profile"
                style={{
                  fontSize: "1.2rem",
                  lineHeight: "1.7rem",
                  fontWeight: " 100",
                }}
              >
                <span className="text-white">Threat Actor :</span>{" "}
                <span className="hover:underline text-[#00d1ff]">{processedAuthor}</span>
              </div>
              <div
                className="font-anek font-thin"
                style={{
                  fontSize: "1.2rem",
                  lineHeight: "1.7rem",
                  fontWeight: "100",
                }}
              >
                <span className="text-white">Date :</span>{" "}
                {new Date(
                  parsedContent["Detection Date"] || Date.now()
                ).toLocaleString()}
              </div>

              {/* Threat / Leak Screenshot Preview */}
              {screenshotUrl && (
                <div
                  className="relative bg-[#0094FF1C] flex rounded-2xl justify-center items-center overflow-hidden text-white shadow-md"
                  style={{
                    marginTop: "25px",
                    marginBottom: "20px",
                    height: "315px",
                    border: "1px solid #126382",
                    padding: "19px",
                    width: "100%",
                    boxShadow: "0 4px 8px rgba(0, 0, 0, 0.2)",
                  }}
                >
                  <div
                    className="absolute left-0 w-full text-center box-border font-[Aldrich] text-[#00d1ff]"
                    style={{ top: "1%", padding: "5px 0" }}
                  >
                    <img
                      src={Icon}
                      alt="evidence preview"
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
                    <span style={{ fontSize: "13px" }}>
                      Threat / Evidence Preview
                    </span>
                  </div>
                  <div className="w-full h-full flex items-center justify-center">
                    <img
                      src={screenshotUrl}
                      alt="Darkweb threat evidence screenshot"
                      className="max-w-full max-h-full object-contain"
                      style={{ marginTop: "20px", width: "90%", height: "90%" }}
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center">Select a message to view details</div>
        )}

        {/* Threat Intelligence Dossier Modal */}
        <ThreatIntelModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          data={selectedMessage}
          type="darkweb"
        />
      </div>
    </>
  );
};

export default DarkwebRightContent;