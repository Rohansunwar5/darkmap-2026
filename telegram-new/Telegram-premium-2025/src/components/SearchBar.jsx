import React, { useRef, useState } from "react";
import Down from "../assets/down.png";
import axios from "axios";

const SearchBar = ({ onSearch, predefinedChannels }) => {
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchDisabled, setIsSearchDisabled] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [label, setLabel] = useState("Global");
  const searchRequestIdRef = useRef(0);
  const disableTimeoutRef = useRef(null);

  const inputStyle = {
    width: "800px",
    backgroundColor: "black",
    color: "white",
    border: inputFocused ? "2px solid yellow" : "2px solid transparent",
    outline: "none",
  };

  const toggleDropdown = () => setDropdownOpen(!isDropdownOpen);

  const handleOptionClick = (option) => {
    setLabel(option);
    setDropdownOpen(false);
  };

  const handleSearch = async () => {
    if (onSearch) {
      const queryToSearch = searchQuery.trim().replace(/^@+/, "");
      if (!queryToSearch) {
        return;
      }

      const requestId = ++searchRequestIdRef.current;
      if (disableTimeoutRef.current) {
        clearTimeout(disableTimeoutRef.current);
        disableTimeoutRef.current = null;
      }

      const resetResults = {
        telegram: [],
        darkweb: [],
        ransomware: [],
        breachforums: [],
      };

      onSearch(resetResults, true); // Clear stale results and show the loader immediately
      setIsSearchDisabled(true);

      try {
        let apiCalls;

        if (label === "Username") {
          apiCalls = [
            axios.post("https://tgdev.darkmap.org/proxy", {
              query: queryToSearch,
            }),
          ];
        } else {
          apiCalls = [
            axios.get(
              `https://ransome.darkmap.org/api/cyberattacks?query=${queryToSearch}`
            ),
            axios.get(`https://db.darkmap.org/search?query=${queryToSearch}`),
            axios.post(
              "https://4phuyf7tlf.execute-api.us-east-1.amazonaws.com/prod/tg",
              { search_query: queryToSearch }
            ),
            axios.get(
              `https://breachf.darkmap.org/scrape?query=${queryToSearch}&pages=5`
            ),
          ];
        }

        const apiResults = await Promise.all(apiCalls);

        if (label === "Username") {
          const tgDevData = apiResults[0];
          if (requestId !== searchRequestIdRef.current) {
            return;
          }

          onSearch(
            {
              telegram: tgDevData.data,
              darkweb: [],
              ransomware: [],
              breachforums: [],
            },
            false
          );
        } else {
          const [ransomwareData, darkwebData, telegramData, breachforumsData] =
            apiResults;

          const allChannelsList = telegramData.data.channel_names || [];
          const channelsList =
            telegramData.data.channel_names.slice(0, 10) || [];
          const predefinedChannelsToSend = predefinedChannels.slice(0, 10);

          const addChannelPromises = predefinedChannelsToSend.map(
            (channel_name) =>
              axios.post(
                "https://4phuyf7tlf.execute-api.us-east-1.amazonaws.com/prod/add-ch",
                { search_query: queryToSearch, channel_name: channel_name }
              )
          );

          const messagesPromises = channelsList.map((channel_name) =>
            axios.post(
              "https://4phuyf7tlf.execute-api.us-east-1.amazonaws.com/prod/get_tg_msg",
              { search_query: queryToSearch, channel_name: channel_name }
            )
          );

          const [messagesData, addChannelData] = await Promise.all([
            Promise.all(messagesPromises),
            Promise.all(addChannelPromises),
          ]);

          const mergedMessagesInfo = [
            ...messagesData.flatMap((msg) => msg.data.messages_info),
            ...addChannelData.flatMap((msg) => msg.data.messages_info),
          ];

          if (requestId !== searchRequestIdRef.current) {
            return;
          }

          onSearch(
            {
              searchBarResults: {
                telegram: mergedMessagesInfo,
                ransomware: ransomwareData.data,
                darkweb: darkwebData.data,
                breachforums: breachforumsData.data,
              },
            },
            false,
            allChannelsList,
            queryToSearch,
            predefinedChannels
          );
        }
      } catch (error) {
        if (requestId !== searchRequestIdRef.current) {
          return;
        }

        console.error("Error fetching data:", error);
        onSearch(resetResults, false);
      }

      if (requestId !== searchRequestIdRef.current) {
        return;
      }

      disableTimeoutRef.current = setTimeout(() => {
        if (requestId === searchRequestIdRef.current) {
          setIsSearchDisabled(false);
        }
      }, 15000);
    }
  };

  return (
    <div
      className="bg-blue-900 p-4 flex justify-center items-center"
      style={{
        background: "url('/path-to-your-background-image.jpg')",
        backgroundSize: "cover",
        border: "none",
        boxShadow: "none",
      }}
    >
      <div
        className="relative flex border-2 rounded"
        style={{ border: "none" }}
      >
        <button
          className="text-black bg-blue-600 px-4 py-2 rounded-l flex items-center"
          style={{ border: "none", alignItems: "center" }}
          onClick={toggleDropdown}
        >
          {label}{" "}
          <img
            src={Down}
            alt="Dropdown Arrow"
            className="ml-2"
            style={{ width: "20px", height: "20px", verticalAlign: "middle" }}
          />
        </button>

        {isDropdownOpen && (
          <ul
            className="absolute top-full left-0 bg-black text-white shadow-lg rounded"
            style={{
              listStyle: "none",
              padding: "0",
              margin: "0",
              width: "200px",
              maxHeight: "200px",
              overflowY: "auto",
              zIndex: 1000,
            }}
          >
            <li
              className="px-3 py-1 hover:bg-white hover:text-black cursor-pointer rounded-lg transition-all duration-200 ease-in-out"
              onClick={() => handleOptionClick("Global")}
            >
              Global
            </li>
            <li
              className="px-3 py-1 hover:bg-white hover:text-black cursor-pointer rounded-lg transition-all duration-200 ease-in-out"
              onClick={() => handleOptionClick("Username")}
            >
              Username
            </li>
          </ul>
        )}
        <input
          type="text"
          className="px-4 py-2"
          style={inputStyle}
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isSearchDisabled) {
              handleSearch();
            }
          }}
        />
        <button
          className="px-4 text-black bg-blue-600 rounded-r"
          style={{ border: "none" }}
          onClick={handleSearch}
          disabled={isSearchDisabled}
        >
          {isSearchDisabled ? "Please Wait..." : "Search"}
        </button>
      </div>
    </div>
  );
};

export default SearchBar;
