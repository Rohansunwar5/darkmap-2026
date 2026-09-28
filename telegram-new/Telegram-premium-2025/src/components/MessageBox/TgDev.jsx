import React, { useEffect, useState, useCallback } from "react";
import Telegram from "../../assets/teledark.png";
import UserCircle from "../../assets/user-circle.png";
import axios from "axios";
import apiClient from "../../lib/apiClient";
import "../../styles/tg.css";
import Image1 from '../../assets/tgdev.png';
import Image2 from '../../assets/tgDevMedia.png';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMessage, faLink } from '@fortawesome/free-solid-svg-icons';
import { useTelegramContext } from "../../context/TelegramContext";
import { useChannel } from "../../context/ChannelContext";
import { useSearch } from "../../context/SearchContext";

const API_ENDPOINT = "http://ddd:5000/proxy";

const formatDate = (dateValue) => {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (isNaN(date.getTime())) return String(dateValue);
  return [
    date.getDate().toString().padStart(2, "0"),
    (date.getMonth() + 1).toString().padStart(2, "0"),
    date.getFullYear()
  ].join("-");
};

const extractUsernameValue = (value) => {
  if (typeof value !== "string") return null;

  const usernameLabelMatch = value.match(/username\s*:\s*(@?[a-zA-Z0-9_]+)/i);
  if (usernameLabelMatch?.[1]) {
    const normalized = usernameLabelMatch[1].trim();
    return normalized.startsWith("@") ? normalized : `@${normalized}`;
  }

  const plainUsernameMatch = value.match(/^@?[a-zA-Z0-9_]+$/);
  if (plainUsernameMatch?.[0]) {
    const normalized = plainUsernameMatch[0].trim();
    return normalized.startsWith("@") ? normalized : `@${normalized}`;
  }

  return null;
};

const buildProfilePfpUrl = (usernameValue) => {
  const normalized = String(usernameValue || "").trim().replace(/^@+/, "");
  if (!normalized) return "/profile.png";
  return `https://tgpfp.darkmap.org/pfp?username=@${normalized}`;
};

const extractUsernameHandles = (value) => {
  if (typeof value !== "string") return [];

  const text = value.trim();
  if (!text) return [];

  const usernameSection = text.match(/username\s*:\s*([^\n]+)/i);
  const candidate = (usernameSection?.[1] || text).trim();
  const handles = Array.from(candidate.matchAll(/@([a-zA-Z0-9_]{3,})/g)).map((match) => `@${match[1]}`);

  if (handles.length > 0) {
    return Array.from(new Set(handles));
  }

  if (/^[a-zA-Z0-9_]{3,}$/.test(candidate)) {
    return [`@${candidate}`];
  }

  return [];
};

const convertTMeToTelegramMe = (url) => {
  if (typeof url !== "string") return url;
  return url.replace(/\bt\.me\b/gi, "telegram.me");
};

const TgDev = ({ searchResults, nearbyData }) => {
  const [telegramData, setTelegramData] = useState(null);
  const { setTelegramMessages } = useTelegramContext();
  const [disabledIcons, setDisabledIcons] = useState({});
  const [triesLeft, setTriesLeft] = useState(15);
  const [showInsufficientGroupsPopup, setShowInsufficientGroupsPopup] = useState(false);
  const isFallback = searchResults?.telegram?.source === "fallback";
  console.log("searchResults: ",searchResults);
  
  const numGroups = telegramData?.meta?.num_groups || 0;
  const hasInsufficientGroups = numGroups <= 3;
  
  const nearbyGroups = Array.isArray(nearbyData?.groups) ? nearbyData.groups : [];
  const connectedUsers = nearbyGroups
    .map((group) => {
      const username = String(group?.username || "").trim().replace(/^@+/, "");
      const rawTitle = String(group?.title || "").trim();
      const title = rawTitle && !/^group\s*\d+$/i.test(rawTitle)
        ? rawTitle
        : (username || "");
      const rawLink = String(group?.link || (username ? `https://t.me/${username}` : "")).trim();
      const link = convertTMeToTelegramMe(rawLink);

      return {
        id: group?.id,
        title,
        username,
        link,
      };
    })
    .filter((entry) => entry.username && entry.title);
  

  const handleIconClick = useCallback((idx) => {
    const newDisabledIcons = {};
    telegramData.groups.forEach((_, i) => {
      newDisabledIcons[i] = i !== idx;
    });
    setDisabledIcons(newDisabledIcons);

    const timer = setTimeout(() => {
      setDisabledIcons({});
    }, 10000);

    return () => clearTimeout(timer);
  }, [telegramData?.groups]);

  const fetchMessages = useCallback(async (channelName, userId) => {
    try {
      const cleanChannel = channelName.replace(/@/g, '');
      console.log("Fetching messages with:", { channelName: cleanChannel, userId });

      const response = await apiClient.post(
        `${import.meta.env.VITE_API_BASE_URL}/telegram/proxy/fetch-messages`,
        { channel_name: cleanChannel, user_id: String(userId) }
      );

      console.log("channel Name:", channelName);
      console.log("UserID:", userId);

      setTelegramMessages(response.data);
    } catch (error) {
      console.error('API Error:', error);
      alert(`Failed to fetch messages: ${error.message}`);
    }
  }, [setTelegramMessages]);

  useEffect(() => {
    if (searchResults?.telegram?.status === "ok") {
      setTelegramData(searchResults.telegram.result);
      setDisabledIcons({});
      setShowInsufficientGroupsPopup(false);
      return;
    }

    setTelegramData(null);
    setDisabledIcons({});
    setShowInsufficientGroupsPopup(false);
  }, [searchResults]);

  // Update triesLeft from nearbyData
  useEffect(() => {
    if (nearbyData?.triesLeft !== undefined) {
      setTriesLeft(nearbyData.triesLeft);
    }
  }, [nearbyData]);

  const handleConnectedUsersClick = () => {
    if (hasInsufficientGroups) {
      setShowInsufficientGroupsPopup(true);
    }
  };

  if (!telegramData) return null;

  return (
    <div className="overflow-x-hidden overflow-y-auto px-10">
      {/* Insufficient Groups Popup */}
      {showInsufficientGroupsPopup && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-80">
          <div style={{ backgroundColor: 'rgb(12,12,12)' }} className="p-6 rounded-lg shadow-xl max-w-2xl border border-gray-800">
            <div className="text-[#00D1FF] font-medium text-xl mb-2">
              Not Enough Groups to Show Related Data
            </div>
            <div className="text-gray-300 text-sm mb-4 font-default-sans">
              The user account has 3 or fewer groups. Connected users feature requires at least 4 groups to function properly.
            </div>
            <div className="border-t border-gray-800 my-4" />
            <div className="text-[#00D1FF] text-xs font-semibold mb-2">
              POSSIBLE REASONS INCLUDE:
            </div>
            <div className="space-y-2 mb-5 text-gray-300 text-sm font-default-sans">
              <div className="flex items-start gap-2">
                <span className="text-[#00D1FF] mt-0.5">&#8250;</span>
                <span>The user account is relatively new with limited group participation</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#00D1FF] mt-0.5">&#8250;</span>
                <span>The account has been inactive or groups have been removed</span>
              </div>
            </div>
            <div className="border-t border-gray-800 my-4" />
            <div className="text-[#00D1FF] text-xs font-semibold mb-2">
              REFERENCE DATA
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
              <div className="rounded-md border border-gray-700 p-2 bg-[#10131a]">
                <img
                  src="/tgermg2.jpeg"
                  alt="Group participation reference 1"
                  className="w-full h-auto rounded"
                />
              </div>
              <div className="rounded-md border border-gray-700 p-2 bg-[#10131a]">
                <img
                  src="/tgermg1.jpeg"
                  alt="Group participation reference 2"
                  className="w-full h-auto rounded"
                />
              </div>
            </div>
            <button
              onClick={() => setShowInsufficientGroupsPopup(false)}
              className="px-4 py-2 bg-[#00D1FF] text-white rounded hover:bg-gray-400"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* First Box */}
      <div className="bg-[#04121ae5] shadow-[0_2px_11px_0_#3ac1ff] overflow-x-hidden box-border"
      style={{
        border: "1.8px solid #3ac1ff",
        maxWidth: "100%",
        marginTop: "10px", 
        padding: "15px 20px",
      }}>
        {/* Header */}
        <div className="flex items-center">
          <img src={Telegram} alt="Telegram Logo" className="w-8 h-auto mr-3" />
          <span className="text-[#a0ddff] text-2xl">Person Found</span>
        </div>

        {/* User Info */}
        <div className="relative">
          <DottedLine position="top" />
          <div className="w-full py-7"> {/* Reduced from py-8 */}
            <div className="text-[#dfd5d5] space-y-1 pl-11">
              <div className="flex justify-between items-center">
                <div className="w-1/3">
                  Name: <span className="text-white">{isFallback ? (telegramData.user?.title || telegramData.user?.first_name || telegramData.user?.username) : telegramData.user?.first_name}</span>
                </div>
                <div className="w-1/3 text-center text-[#D40303]">
                  Telegram ID: {telegramData.user?.id}
                </div>
                <div className="w-1/3 text-right text-[#D40303] pr-11">
                  Last Seen: 10:51pm
                </div>
              </div>

              <div className="mt-2">
                <span className="bg-[#ede4e4] text-black px-1 py-0.5 rounded">
                  {telegramData.user?.username}
                </span>
              </div>

              {/* <div className="text-[#3ac1ff]">
                Bio: <span className="text-white">Malware & Research</span>
              </div> */}
            </div>
          </div>
          <DottedLine position="bottom" />
        </div>

        {/* Onion Icon at Top */}
        <div className="flex">
          <div className="flex-1"></div>
            <div className="ml-2" style={{ width: "60%", marginRight: "50px", display: "flex", justifyContent: "center" }}>
            <img src={Image1} alt="Onion Icon" className="animate-pulse" style={{
              marginBottom: "20px",
              width: "13%",
              maxWidth: "100%",
              display: "block",
              position: "relative",
              top: "10px",
            }} />
          </div>
        </div>

        {/* Username History (appears first) */}
        <UsernameHistory
          data={telegramData}
          image1={Image1}
          image2={Image2}
          isFallback={isFallback}
        />

        {/* Connected Users (appears after username history, only if > 3 groups) */}
        {!hasInsufficientGroups && connectedUsers.length > 0 && (
          <div className="animate-fade-in" style={{ marginTop: "30px" }}>
            <ConnectedUsersPanel
              data={telegramData}
              connectedUsers={connectedUsers}
              onMessageClick={fetchMessages}
              triesLeft={triesLeft}
              onInsufficientGroupsClick={handleConnectedUsersClick}
            />
          </div>
        )}
      </div>

      {/* Second Box */}
      <div className="bg-[#04121ae5] overflow-visible box-border"
           style={{
             border: "1.8px solid #3ac1ff",
             maxWidth: "100%",
             padding: "6px 20px",
             boxShadow: "0 6px 15px 0 #3ac1ff",
           }}>
        <div className="flex items-center mb-4">
          <img src={UserCircle} alt="Telegram Logo" className="w-12 h-auto mr-3" />
          <div className="text-white" style={{ paddingTop: "10px", paddingLeft: "2px", fontSize: "14px" }}>
            <div className="text-[#D40303]">Telegram ID: {telegramData.user.id}</div>
            <div className="mb-2 pl-4 text-[#dfd5d5]">
              Number of Groups: {telegramData.meta.num_groups}
            </div>
          </div>
        </div>

        <GroupList 
          groups={telegramData.groups} 
          disabledIcons={disabledIcons} 
          onIconClick={handleIconClick} 
          fetchMessages={fetchMessages} 
          telegramUsername={telegramData.user.username}
          telegramUserId={telegramData.user?.id}
          isFallback={isFallback}
        />
      </div>
    </div>
  );
};

// Helper Components
const DottedLine = ({ position }) => (
  <div style={{
    position: 'absolute',
    [position === "top" ? 'top' : 'bottom']: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    width: '92%',
    height: '1px',
    background: 'repeating-linear-gradient(to right, #126382, #126382 4px, transparent 4px, transparent 8px)'
  }} />
);

const UsernameHistory = ({ data, image1, image2, isFallback }) => {
  const displayUsername = String(data?.user?.username || "").trim();
  
  // 1. Extract handles with their associated dates
  const historyWithDates = Array.isArray(data?.username_history)
    ? data.username_history.flatMap((entry) => {
        const sourceText = [entry?.username, entry?.text, entry?.link]
          .filter((part) => typeof part === "string" && part.trim().length > 0)
          .join(" ");

        const handles = extractUsernameHandles(sourceText);
        return handles.map(handle => ({
          username: handle,
          date: entry.date || entry.date_updated || entry.updated_at
        }));
      })
    : [];

  const fallbackHandles = Array.isArray(data?.user?.usernames)
    ? data.user.usernames.flatMap((username) => extractUsernameHandles(String(username || "")))
    : [];

  // 2. Combine and de-duplicate
  const seen = new Set();
  const historyItems = [];

  // Process structured history first (favors items with dates)
  historyWithDates.forEach(item => {
    if (!seen.has(item.username)) {
      seen.add(item.username);
      historyItems.push(item);
    }
  });

  // If no structured history is available (Scenario B or Fallback), add fallbacks and display username
  if (historyItems.length === 0) {
    fallbackHandles.forEach(handle => {
      if (!seen.has(handle)) {
        seen.add(handle);
        historyItems.push({ username: handle, date: null });
      }
    });

    // Add display username as a final fallback
    if (displayUsername) {
      const handle = `@${displayUsername.replace(/^@+/, "")}`;
      if (!seen.has(handle)) {
        seen.add(handle);
        historyItems.push({ username: handle, date: null });
      }
    }
  }

  return <div className="text-[#dfd5d5] relative">
    <div className="" style={{ paddingLeft: "60px", fontSize: "13px", marginTop: "1px", position: "relative", top: "10px" }}>
      <img src={buildProfilePfpUrl(data.user?.username)} onError={(e) => {
    e.currentTarget.onerror = null;
    e.currentTarget.src = '/profile.png';
  }} alt="Decorative Symbol" className="absolute bottom-4 w-24 h-24 z-10 mb-3" style={{ left: "calc(7% - 8px)" }} />
      <div className="mt-2">Username History</div>
    </div>
    
    <div className="dotted-line-vertical" style={{ top: "40px", left: "calc(12% + 20px)" }} />
    <div className="dotted-line-horizontal" style={{ top: "90px", left: "calc(12% + 20px)", width: "calc(28% - 74px)", height: "2px" }} />

    <div className="flex">
      <div className="flex-1"></div>
      <div className="ml-2 border border-[#910000] p-6 rounded-md"
           style={{
             marginRight: "50px",
             position: "relative",
             bottom: "13px",
             width: "60%",
             maxWidth: "100%",
             overflow: "hidden",
             minHeight: "150px",
           }}>
        {historyItems.length > 0 ? (
          historyItems.map((item, idx) => (
            <div key={`${item.username}-${idx}`} className="flex justify-start text-white mb-2"
                 style={{
                   fontSize: "11px",
                   display: "flex",
                   justifyContent: "flex-start",
                   padding: "1px 0",
                   gap: "10px"
                 }}>
              {!isFallback && item.date && (
                <span className="text-[#dfd5d5] w-1/3 text-left">
                  Date: {formatDate(item.date)}
                </span>
              )}
              <span className={!isFallback && item.date ? "text-[#00D1FF] w-2/3 text-left" : "text-[#00D1FF]"}>
                {item.username}
              </span>
            </div>
          ))
        ) : (
          <div style={{ marginTop: "40px" }} className="text-white text-center text-xs">No username history available.</div>
        )}
      </div>
    </div>
  </div>
};

const ConnectedUsersPanel = ({ data, connectedUsers, onMessageClick, triesLeft, onInsufficientGroupsClick }) => {
  const { setChannelName } = useChannel();
  const userIdentifier = data?.user?.username || data?.user?.id || "";

  return <div className="text-[#dfd5d5] relative">
    <div className="" style={{ paddingLeft: "60px", fontSize: "13px", marginTop: "1px", position: "relative", top: "90px" }}>
      <FontAwesomeIcon
        icon={faLink}
        className="absolute left-[7%] bottom-4 w-24 h-24 z-10 mb-3 text-[#00D1FF]"
        style={{ fontSize: "60px" }}
      />
      <div className="mt-2">Connected Users</div>
      {triesLeft !== undefined && (
        <div className="text-[#00D1FF] text-xs mt-1">
          You have <span className="font-semibold">{triesLeft}</span> clicks left for this month
        </div>
      )}
    </div>

    <div className="dotted-line-vertical" style={{ top: "120px", left: "calc(12% + 20px)" }} />
    <div className="dotted-line-horizontal" style={{ top: "170px", left: "calc(12% + 20px)", width: "calc(28% - 74px)", height: "2px" }} />

    <div className="flex">
      <div className="flex-1"></div>
      <div className="ml-2 border border-[#910000] p-6 rounded-md"
        style={{
          marginRight: "50px",
          position: "relative",
          bottom: "13px",
          width: "60%",
          maxWidth: "100%",
          overflow: "hidden",
          minHeight: "150px",
          opacity: triesLeft === 0 ? 0.6 : 1,
          pointerEvents: triesLeft === 0 ? 'none' : 'auto',
        }}>
        {connectedUsers.length > 0 ? (
          connectedUsers.map((entry, idx) => (
            <div key={`${entry.id || entry.username}-${idx}`} className="flex justify-center text-white mb-2"
              style={{
                fontSize: "11px",
                display: "flex",
                justifyContent: "center",
                gap: "15px",
                padding: "5px 0",
                cursor: triesLeft === 0 ? 'not-allowed' : 'pointer',
              }}>
              <div className="w-1/2 truncate text-left">
                <span className="text-white">{entry.title}</span>
              </div>
              <div className="w-1/2 truncate text-left">
                <a 
                  href={entry.link} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-[#00D1FF]"
                  onClick={(e) => {
                    if (triesLeft === 0) {
                      e.preventDefault();
                    }
                  }}
                >
                  @{entry.username}
                </a>
              </div>
            </div>
          ))
        ) : (
          <div style={{ marginTop: "40px" }} className="text-white text-center text-xs">No connected users found.</div>
        )}
      </div>
    </div>
  </div>;
};

const GroupList = ({ groups, disabledIcons, onIconClick, fetchMessages, telegramUsername, telegramUserId, isFallback }) => (
  <div className="text-white mt-4 relative">
    <div className="dotted-line-vertical" style={{ top: "10px", left: "calc(12% + 20px)", height: "80px" }} />
    <div className="dotted-line-horizontal" style={{ top: "90px", left: "calc(12% + 20px)", width: "calc(28% - 74px)", height: "2px" }} />

    <div className="flex">
      <div className="flex-1"></div>
      <div className="ml-4 border border-[#910000] rounded-md"
           style={{
            padding:"15px 15px",
             marginRight: "50px",
             position: "relative",
             bottom: "45px",
             width: "60%",
             maxWidth: "100%",
             overflow: "hidden",
           }}>
        {groups.map((group, idx) => (
          <GroupItem 
            key={idx} 
            group={group} 
            idx={idx}
            disabled={disabledIcons[idx]}
            onClick={onIconClick}
            fetchMessages={fetchMessages}
            telegramUsername={telegramUsername}
            telegramUserId={telegramUserId}
            isFallback={isFallback}
          />
        ))}
      </div>
    </div>
  </div>
);

const GroupItem = ({ group, idx, disabled, onClick, fetchMessages, telegramUsername, telegramUserId, isFallback }) => {
  const { setChannelName } = useChannel();
  const { currentSearchId } = useSearch();
  const groupUsername = group?.username || "";

  const handleClick = async () => {
    onClick(idx);
    if (!groupUsername) return;
    setChannelName(groupUsername);    
    await fetchMessages(groupUsername, telegramUserId);
  };

  const handleDragStart = (e) => {
    const dragData = {
      group,
      idx,
      disabled,
      telegramUsername,
      parentSearchId: currentSearchId,
    };
    e.dataTransfer.setData("application/json", JSON.stringify(dragData));
  };

  return (
    <div className="flex justify-between items-center text-white mb-2 hover:bg-primary-950"
    draggable='true'
         style={{
           fontSize: "11px",
           display: "flex",
           justifyContent: "space-between",
           padding: "5px 10px",
           columnGap: "10px",
         }}
         onDragStart={handleDragStart}
         >
          
      {!isFallback && (
        <div className="w-1/4 text-[#dfd5d5]" style={{ paddingRight: "10px" }}>
          Date: <span className="text-white">{formatDate(group.date_updated)}</span>
        </div>
      )}
      <div className={isFallback ? "w-2/5" : "w-1/4"} style={{ paddingRight: "10px" }}>
        {groupUsername ? (
          <a href={`https://telegram.me/${groupUsername}`} target="_blank" rel="noopener noreferrer" className="text-[#00D1FF]">
            {group.title}
          </a>
        ) : (
          <span className="text-[#00D1FF]">{group.title}</span>
        )}
      </div>
      <div className={isFallback ? "w-2/5" : "w-1/4"}>
        {groupUsername ? (
          <a href={`https://telegram.me/${groupUsername}`} target="_blank" rel="noopener noreferrer" className="text-[#00D1FF]" onClick={() => setChannelName(groupUsername)} >
            {groupUsername}
          </a>
        ) : (
          <span className="text-[#7aa7bb]">N/A</span>
        )}
      </div>
      <div className="w-[80px] flex justify-center">
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled || !groupUsername}
          className="text-[#00D1FF] cursor-pointer disabled:cursor-not-allowed"
          style={{ opacity: disabled || !groupUsername ? 0.5 : 1, background: "transparent", border: "none", padding: 0 }}
        >
          <FontAwesomeIcon icon={faMessage} />
        </button>
      </div>
    </div>
  );
};

TgDev.searchTelegramMessages = async (searchQuery) => {
  try {
    const response = await axios.post(API_ENDPOINT, { search_query: searchQuery });
    return response.data.messages_info || [];
  } catch (error) {
    console.error("Error searching Telegram messages:", error);
    return [];
  }
};

export default TgDev;