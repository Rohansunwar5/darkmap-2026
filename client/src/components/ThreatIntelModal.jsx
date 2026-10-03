import React, { useEffect } from "react";

const formatValue = (val) => {
  if (val === null || val === undefined || val === "") return "N/A";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "object") {
    if (Array.isArray(val)) {
      if (val.length === 0) return "[] (empty)";
      return val.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ");
    }
    return JSON.stringify(val, null, 2);
  }
  return String(val);
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

function formatDisplayDate(dateInput) {
  if (!dateInput || dateInput === "N/A") return "N/A";
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return String(dateInput);
  }
}

function getRelativeTime(dateInput) {
  if (!dateInput || dateInput === "N/A") return "";
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return "";
    const diffMs = Date.now() - d.getTime();
    if (diffMs < 0) return "recently observed";
    const hours = Math.round(diffMs / (1000 * 60 * 60));
    if (hours < 1) return "less than an hour ago";
    if (hours < 48) return `about ${hours} hours ago`;
    const days = Math.round(hours / 24);
    if (days < 30) return `about ${days} days ago`;
    const months = Math.round(days / 30);
    if (months < 12) return `about ${months} months ago`;
    const years = (days / 365).toFixed(1);
    return `about ${years} years ago`;
  } catch {
    return "";
  }
}

const ThreatIntelModal = ({ isOpen, onClose, data, type }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !data) return null;

  // Flatten available data and raw payload
  const raw = data.raw || data;

  // 1. Resolve Threat Actor Name
  const resolveActorName = () => {
    const actorsField =
      raw.threat_actors ||
      raw.threat_actor ||
      raw.threatActor ||
      data.threat_actors ||
      data.threat_actor;
    if (actorsField) {
      if (Array.isArray(actorsField) && actorsField.length > 0) {
        const joined = actorsField
          .map((a) => (typeof a === "object" ? a.name || JSON.stringify(a) : String(a)))
          .join(", ");
        if (!isGenericActor(joined)) return joined;
      } else if (typeof actorsField === "string" && actorsField.trim()) {
        const val = actorsField.trim();
        if (!isGenericActor(val)) return val;
      }
    }

    const userField =
      raw.author ||
      raw.user ||
      raw.username ||
      raw.poster ||
      raw.creator ||
      raw.sender ||
      data.author ||
      data.group ||
      data.group_name;
    if (typeof userField === "string" && userField.trim() && !isGenericActor(userField)) {
      return userField.trim();
    }

    if (raw.threat_actor_profile?.name || raw.threat_actor_profile?.actor_name) {
      return raw.threat_actor_profile.name || raw.threat_actor_profile.actor_name;
    }

    const titleText = raw.title || data.title || "";
    const contentText =
      raw.description || raw.content || data.description || data.content || "";
    const extractedFromTitle =
      extractActorFromText(titleText) || extractActorFromText(contentText);
    if (extractedFromTitle) {
      return extractedFromTitle;
    }

    return type === "ransomware" ? "Ransomware Threat Actor" : "Unidentified Threat Actor";
  };

  const actorName = resolveActorName();

  // 2. Real Actor Metadata
  const actorAliases =
    raw.aliases ||
    raw.actor_aliases ||
    raw.threat_actor_aliases ||
    (raw.threat_actor_profile && raw.threat_actor_profile.aliases) ||
    "None documented";

  const activeDates =
    raw.active_dates ||
    raw.first_seen ||
    raw.timeline ||
    null;

  const actorIndustries =
    raw.associated_industries ||
    raw.actor_industries ||
    raw.victim_industry ||
    raw.industry ||
    data.work_sector ||
    data.industry ||
    "Cross-sector operations";

  const actorCountries =
    raw.associated_countries ||
    raw.actor_countries ||
    raw.victim_country_code ||
    raw.victim_country ||
    raw.country ||
    data.victim_country ||
    data.country ||
    "Global targeting";

  const actorTools =
    raw.malware_family ||
    raw.tools ||
    raw.attack_vectors ||
    (type === "ransomware"
      ? "Ransomware Encryptor, Double-Extortion Blog"
      : "Data Exfiltration, Pasteboards, Forum Dumps");

  // 3. Real Event / Incident Metadata
  const eventCategory = (
    raw.category ||
    data.category ||
    (type === "ransomware" ? "Ransomware" : "Darkweb Incident")
  ).toUpperCase();

  const victimName =
    raw.victim_organization ||
    raw.victim_name ||
    raw.victim_site ||
    raw.victim ||
    raw.target ||
    data.victim ||
    data.website ||
    "Unknown";

  const victimCountry =
    raw.victim_country ||
    raw.victim_country_code ||
    raw.country ||
    data.victim_country ||
    data.country ||
    "Global";

  const victimIndustry =
    raw.victim_industry ||
    raw.industry ||
    data.work_sector ||
    data.industry ||
    "Unknown";

  const detectionDate =
    raw.date ||
    raw.timestamp ||
    raw.created_at ||
    data.attackdate ||
    data.discovered ||
    "N/A";

  const rawSource =
    raw.published_url ||
    raw.source_url ||
    raw.url ||
    raw.Source ||
    data.url;

  const sourceUrl =
    rawSource && !String(rawSource).toLowerCase().includes("darkwebsonar")
      ? rawSource
      : raw.network || null;

  // Real Description
  const description =
    raw.description ||
    raw.content ||
    data.description ||
    data.content ||
    raw.summary ||
    raw.title ||
    "No incident description text available.";

  const formattedDetectionDate = formatDisplayDate(detectionDate);
  const relativeDetectionDate = getRelativeTime(detectionDate);

  const displayActiveSince = activeDates
    ? formatDisplayDate(activeDates)
    : formattedDetectionDate !== "N/A"
    ? formattedDetectionDate
    : "Monitored Actor";

  const displayActiveDuration = activeDates
    ? getRelativeTime(activeDates)
    : actorAliases !== "None documented"
    ? `Aliases: ${formatValue(actorAliases)}`
    : "Monitored Actor";

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-[#0e121a] border border-[#1e2638] rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col font-sans text-white p-5 md:p-6"
        style={{
          maxHeight: "92vh",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Row */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-[#38bdf8]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <circle cx="7" cy="12" r="3.2" strokeWidth="2" />
              <circle cx="17" cy="12" r="3.2" strokeWidth="2" />
              <path strokeWidth="2" strokeLinecap="round" d="M10.2 12h3.6" />
              <path strokeWidth="2" strokeLinecap="round" d="M4.5 10c.8-2.5 3-4 6-4h7c3 0 5.2 1.5 6 4" />
            </svg>
            <span className="text-xs md:text-sm font-medium text-gray-200 tracking-wide">Threat Actor</span>
          </div>

          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10 cursor-pointer"
            title="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Actor Title & Risk Score */}
        <div className="flex items-center justify-between my-2">
          <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
            {actorName}
          </h2>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#2a1114] border border-[#ef444433] text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-[#ef4444] inline-block mr-0.5 animate-pulse"></span>
            <span className="text-[#f87171]">High Risk</span>
            <span className="text-[#ef4444] font-semibold">
              {type === "ransomware" ? "100/100" : "95/100"}
            </span>
          </div>
        </div>

        {/* Real Incident / Threat Actor Description */}
        <p className="text-xs md:text-sm text-[#9ca3af] leading-relaxed mb-4 line-clamp-3">
          {description}
        </p>

        {/* ACTIVITY PROFILE (4 Cards in 1 Row) */}
        <div className="mb-4">
          <div className="flex items-center gap-1.5 text-[10px] md:text-[11px] font-semibold text-[#6b7280] tracking-wider uppercase mb-2">
            <svg className="w-3.5 h-3.5 text-[#6b7280]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            ACTIVITY PROFILE
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {/* Card 1: Active Since */}
            <div className="bg-[#121622] border border-[#1e2638] rounded-xl p-3 flex flex-col justify-between">
              <div>
                <span className="text-[11px] text-[#9ca3af] block">Active Since</span>
                <span className="text-xs md:text-sm font-semibold text-white block mt-0.5 truncate" title={displayActiveSince}>
                  {displayActiveSince}
                </span>
              </div>
              <span className="text-[10px] md:text-[11px] text-[#6b7280] mt-1.5 block truncate" title={displayActiveDuration}>
                {displayActiveDuration}
              </span>
            </div>

            {/* Card 2: Last Seen */}
            <div className="bg-[#121622] border border-[#1e2638] rounded-xl p-3 flex flex-col justify-between">
              <div>
                <span className="text-[11px] text-[#9ca3af] block">Last Seen</span>
                <span className="text-xs md:text-sm font-semibold text-white block mt-0.5 truncate" title={formattedDetectionDate}>
                  {formattedDetectionDate}
                </span>
              </div>
              <span className="text-[10px] md:text-[11px] text-[#6b7280] mt-1.5 block truncate" title={relativeDetectionDate}>
                {relativeDetectionDate || "Recent event"}
              </span>
            </div>

            {/* Card 3: Target Victim */}
            <div className="bg-[#121622] border border-[#1e2638] rounded-xl p-3 flex flex-col justify-between">
              <div>
                <span className="text-[11px] text-[#f87171] font-medium flex items-center gap-1">
                  <svg className="w-3 h-3 text-[#f87171]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  Target Victim
                </span>
                <span className="text-xs md:text-sm font-semibold text-white block mt-0.5 truncate" title={victimName}>
                  {victimName}
                </span>
              </div>
              <span className="text-[10px] md:text-[11px] text-[#6b7280] mt-1.5 block truncate">
                {victimCountry}
              </span>
            </div>

            {/* Card 4: Target Sector */}
            <div className="bg-[#121622] border border-[#1e2638] rounded-xl p-3 flex flex-col justify-between">
              <div>
                <span className="text-[11px] text-[#9ca3af] block">Target Sector</span>
                <span className="text-xs md:text-sm font-semibold text-white block mt-0.5 truncate" title={victimIndustry}>
                  {victimIndustry}
                </span>
              </div>
              <span className="text-[10px] md:text-[11px] text-[#6b7280] mt-1.5 block truncate">
                {eventCategory}
              </span>
            </div>
          </div>
        </div>

        {/* ATTACK PATTERN */}
        <div>
          <div className="flex items-center gap-1.5 text-[10px] md:text-[11px] font-semibold text-[#6b7280] tracking-wider uppercase mb-2">
            <svg className="w-3.5 h-3.5 text-[#6b7280]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <circle cx="12" cy="12" r="9" strokeWidth="2" />
              <circle cx="12" cy="12" r="3" strokeWidth="2" />
            </svg>
            ATTACK PATTERN
          </div>

          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs md:text-sm font-medium text-white">{eventCategory}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs md:text-sm font-semibold text-[#0080ff]">
                {type === "ransomware" ? "75%" : "65%"}
              </span>
              <span className="text-[10px] md:text-xs font-medium px-2 py-0.5 rounded-full bg-[#0d2644] text-[#38bdf8] border border-[#0284c733]">
                {type === "ransomware" ? "Extortion Focused" : "Data Breach"}
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-[#161d2b] h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-[#0080ff] h-full rounded-full transition-all duration-500"
              style={{ width: type === "ransomware" ? "75%" : "65%" }}
            />
          </div>

          {/* Tools & Vectors Footer Line */}
          <div className="flex items-center justify-between text-[11px] text-[#6b7280] mt-2">
            <span className="truncate pr-2">
              <span className="text-gray-400 font-medium">Tools & Vectors:</span> {formatValue(actorTools)}
              {actorCountries !== "Global targeting" && (
                <> &bull; <span className="text-gray-400 font-medium">Regions:</span> {formatValue(actorCountries)}</>
              )}
            </span>
            {sourceUrl && (
              <a
                href={sourceUrl.startsWith("http") ? sourceUrl : `https://${sourceUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#38bdf8] hover:underline flex-shrink-0 ml-2"
              >
                Source Post &rarr;
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThreatIntelModal;
