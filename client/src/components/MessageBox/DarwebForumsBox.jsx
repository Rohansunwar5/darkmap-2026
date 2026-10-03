              import React, { useState } from "react";
import DarwebForum from "../../assets/darweb-forum.png";

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

const resolveAuthor = (content, item) => {
  const raw = item?.raw || item || {};

  // 1. Direct threat actor fields
  const actorCandidate =
    raw.threat_actors ||
    raw.threat_actor ||
    raw.threatActor ||
    item?.threat_actors ||
    item?.threat_actor;
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

  // 2. Author / user fields in raw or content
  const userCandidate =
    raw.author ||
    raw.user ||
    raw.username ||
    raw.poster ||
    raw.creator ||
    raw.sender ||
    content?.author ||
    content?.Author ||
    item?.author;
  if (typeof userCandidate === "string" && userCandidate.trim() && !isGenericActor(userCandidate)) {
    return userCandidate.trim();
  }

  // 3. Threat actor profile
  if (raw.threat_actor_profile?.name || raw.threat_actor_profile?.actor_name) {
    return raw.threat_actor_profile.name || raw.threat_actor_profile.actor_name;
  }

  // 4. Extract from title or content text
  const title = raw.title || item?.title || "";
  const body = content?.Content || content?.content || raw.description || raw.content || item?.description || "";
  const extracted = extractActorFromText(title) || extractActorFromText(body);
  if (extracted) {
    return extracted;
  }

  // 5. Fallback
  return userCandidate && !isGenericActor(userCandidate) ? userCandidate : "Threat Actor";
};

const resolveSource = (content, item) => {
  const raw = item?.raw || item || {};

  const urlCandidate =
    raw.published_url ||
    raw.source_url ||
    content?.Source ||
    content?.source ||
    raw.url ||
    item?.url;

  if (urlCandidate && typeof urlCandidate === "string" && urlCandidate.startsWith("http")) {
    try {
      const parsed = new URL(urlCandidate);
      const host = parsed.hostname.replace(/^www\./i, "");
      if (host) return host;
    } catch {
      const match = urlCandidate.match(/https?:\/\/(?:www\.)?([^\/\s]+)/i);
      if (match && match[1]) return match[1];
    }
  }

  const networkCandidate =
    raw.network ||
    raw.platform ||
    raw.forum ||
    (typeof item?.source === "string" ? item.source : item?.source?.name);

  if (networkCandidate && typeof networkCandidate === "string") {
    const cleaned = networkCandidate.replace(/darkwebsonar/gi, "Darknet").trim();
    if (cleaned && cleaned.toLowerCase() !== "hidden") return cleaned;
  }

  if (urlCandidate && typeof urlCandidate === "string" && !urlCandidate.toLowerCase().includes("darkwebsonar")) {
    return urlCandidate;
  }

  return "Darkweb-Forums";
};

const DarwebForumsBox = ({ data, searchQuery, onSelectMessage }) => {
  // Ensure data is an array - either use the data prop directly or access the data property
  const items = Array.isArray(data) ? data : data?.data || [];
  
  const highlightQueryInText = (text, query) => {
    if (!query || !text) return truncateToFirst20Words(text);

    const queryIndex = text.toLowerCase().indexOf(query.toLowerCase());
    if (queryIndex === -1) {
      return truncateToFirst20Words(text);
    }

    const wordsBefore = text.slice(0, queryIndex).split(" ");
    const wordsAfter = text.slice(queryIndex + query.length).split(" ");

    const truncatedText =
      (wordsBefore.length > 10 ? "..." : "") +
      wordsBefore.slice(-10).join(" ") +
      " " +
      text.slice(queryIndex, queryIndex + query.length) +
      " " +
      wordsAfter.slice(0, 10).join(" ") +
      (wordsAfter.length > 10 ? "..." : "");

    const highlightedText = truncatedText.replace(
      new RegExp(`(${query})`, "gi"),
      `<span style="background-color: #00316B;">$1</span>`
    );

    return highlightedText;
  };

  const truncateToFirst20Words = (text) => {
    if (!text) return "No content available";
    const words = text.split(" ");
    return words.length > 20
      ? words.slice(0, 20).join(" ") + "..."
      : words.join(" ");
  };

  if (!items.length) {
    return <div className="text-white p-4"></div>;
  }

  const [visibleCount, setVisibleCount] = useState(35);
  const [loadingMore, setLoadingMore] = useState(false);

  const handleViewMore = () => {
    if (loadingMore) return;
    setLoadingMore(true);
    setTimeout(() => {
      setVisibleCount((prev) => prev + 35);
      setLoadingMore(false);
    }, 3000);
  };

  return (
    <div>
      {items.slice(0, visibleCount).map((item, index) => {
        const content = parseContent(item.content || "{}");
        const raw = item?.raw || item || {};
        const authorDisplay = resolveAuthor(content, item);
        const sourceDisplay = resolveSource(content, item);
        const eventDate =
          content["Detection Date"] || raw.date || raw.timestamp || raw.created_at || Date.now();

        return (
          <div
            key={index}
            className="w-[77%] bg-transparent shadow-[0_2px_11px_0_#3ac1ff] ml-[20%] cursor-pointer hover:border-[#00ffff] transition-colors"
            onClick={() => onSelectMessage(item)}
            style={{ border: "1.8px solid #3ac1ff", marginTop: "19px" }}
          >
            {/* Rest of your component remains the same */}
            <div className="p-1.5 bg-[#04121ae5]">
              <div className="flex items-center font-bebas-neue gap-0.5 text-white"
                style={{
                  paddingBottom: "0px",
                  fontSize: "28px",
                  margin: "0px 5px ",
                }}
              >
                Source
                <img src={DarwebForum} alt="" className="w-7 h-auto ml-1" />
                <span
                  className="font-[Aldrich] text-[#a0ddff] mx-1.5 mb-[1.5px]"
                  style={{ fontSize: "23px" }}
                >
                  Darkweb-Forums
                </span>
              </div>
              <div
                className="text-[#dfd5d5] font-[Aldrich] mt-0"
                style={{
                  fontSize: "13px",
                  marginLeft: "5px",
                  margin: "0px 5px",
                }}
              >
                Date:{" "}
                {new Date(eventDate).toLocaleString()}
              </div>
              <div
                className="text-[#dfd5d5] font-[Aldrich]"
                style={{ margin: "2px 5px", fontSize: "12px" }}
              >
                <span
                  className="bg-[#ede4e4] rounded-md text-black"
                  style={{ padding: "0px 4px", marginRight: "4px" }}
                >
                  Source
                </span>
                <span className="text-[#00d1ff] font-medium">
                  {" "}
                  {sourceDisplay}
                </span>{" "}
                |
                <span
                  className="bg-[#ede4e4] rounded-md text-black"
                  style={{
                    padding: "0px 4px",
                    marginRight: "4px",
                    marginLeft: "5px",
                  }}
                >
                  Author
                </span>
                <span className="text-[#ff4d4d] font-semibold">
                  {" "}
                  {authorDisplay}
                </span>
              </div>
              <div
                className="font-chakra text-white"
                style={{
                  margin: "25px 5px",
                  fontSize: "14px",
                  overflow: "hidden",
                }}
                dangerouslySetInnerHTML={{
                  __html: highlightQueryInText(
                    content.Content || "No content available",
                    searchQuery
                  ),
                }}
              />
            </div>
          </div>
        );
      })}
      {visibleCount < items.length && (
        <button
          className="text-white mt-3 p-2 rounded-lg transition-colors bg-blue-500 hover:bg-blue-600 disabled:opacity-75 disabled:cursor-not-allowed"
          style={{ display: "block", margin: "20px auto", marginLeft: "690px" }}
          onClick={handleViewMore}
          disabled={loadingMore}
        >
          {loadingMore ? "Loading..." : "View More"}
        </button>
      )}
    </div>
  );
};

export default DarwebForumsBox;
