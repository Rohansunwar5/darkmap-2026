// components/Navbar.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../hooks/redux";
import {
  performUsernameSearch,
  performGlobalSearch,
  setSelectedOption,
  setSearchQuery,
  setIsSearchDisabled,
  setShowInactivityModal,
  setUsernameSearchCount,
  resetSearchResults,
} from "../store/slices/searchSlice";
import BrandName from "../assets/dmap_name.png";
import Logo from "../assets/logo_gen.png";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch } from "@fortawesome/free-solid-svg-icons";
import "../styles/styles.css";
import Vec from "../assets/advance_panel.png";
import PanelLogo from "../assets/dmap.webp";
import InactivityModal from "./InactivityModal";
import Preloader from "./Preloader";

const MAX_USERNAME_SEARCHES = 15;

const QUICK_OPTIONS = {
  financial1: {
    include: [
      "bank logs", "bank cashout", "bank drop", "bank log to BTC", "fullz with mail"
    ],
    exclude: [
      "CyberDost", "cyberdosti4c", "news", "police", "awareness", "telegraph"
    ]
  },
  financial2: {
    include: [
      "wire check method", "OTP bot", "clone cards", "bank account required", "current account required"
    ],
    exclude: [
      "CyberDost", "cyberdosti4c", "news", "police", "awareness", "telegraph"
    ]
  },
  financial3: {
    include: [
      "account on rent", "account rental", "account for sale", "account available", "current account available", "saving account available"
    ],
    exclude: [
      "CyberDost", "cyberdosti4c"
    ]
  },
  crypto: {
    include: ["USDT", "tether", "crypto payout", "wallet address", "bank mule", "account on rent", "OTP work", "document required", "DM me", "WhatsApp +", "代付", "game fund", "mixed fund", "eth", "binance", "gift cards"],
    exclude: ["actress", "aunty", "sex", "mms", "videos", "video", "hot", "Tiktok", "OnlyFans", "bhabhi", "ashiqsirCA", "news"]
  }
};

const Navbar = ({ onSearch }) => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  // Redux state
  const {
    searchResults,
    loading,
    selectedOption,
    searchQuery,
    isSearchDisabled,
    showInactivityModal,
    usernameSearchCount,
    allChannelsList,
    predefinedChannels,
  } = useAppSelector((state) => state.search);

  const { accessToken } = useAppSelector((state) => state.auth);

  // Local state
  const [isOpen, setIsOpen] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showPreloader, setShowPreloader] = useState(false);

  // Advanced search local states
  const [advSearchQuery, setAdvSearchQuery] = useState("");
  const [includeKeyword1, setIncludeKeyword1] = useState("");
  const [includeKeyword2, setIncludeKeyword2] = useState("");
  const [excludeKeyword, setExcludeKeyword] = useState("");
  const [activeQuickOption, setActiveQuickOption] = useState(null);

  let dropdownTimeout;

  useEffect(() => {
    const storedSearchCount = localStorage.getItem('usernameSearchCount');
    const storedSearchTimestamp = localStorage.getItem('usernameSearchTimestamp');

    if (storedSearchTimestamp) {
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      if (new Date(parseInt(storedSearchTimestamp)) < oneDayAgo) {
        localStorage.removeItem('usernameSearchCount');
        localStorage.removeItem('usernameSearchTimestamp');
        dispatch(setUsernameSearchCount(0));
      } else {
        dispatch(setUsernameSearchCount(parseInt(storedSearchCount || '0')));
      }
    }
  }, [dispatch]);

  // Watch for search results changes and call onSearch callback
  useEffect(() => {
    if (onSearch) {
      onSearch(
        searchResults,
        loading,
        allChannelsList,
        searchQuery,
        predefinedChannels
      );
    }
  }, [searchResults, loading, allChannelsList, searchQuery, predefinedChannels, onSearch]);

  // Watch for inactivity modal changes
  useEffect(() => {
    // Handle inactivity modal display logic here if needed
  }, [showInactivityModal]);

  const handleMouseEnter = () => {
    clearTimeout(dropdownTimeout);
    setShowDropdown(true);
  };

  const handleMouseLeave = () => {
    dropdownTimeout = setTimeout(() => {
      setShowDropdown(false);
    }, 200);
  };

  const handleOptionClick = (option) => {
    dispatch(setSelectedOption(option));
    setShowDropdown(false);
  };

  const togglePanel = () => {
    setIsOpen(!isOpen);
  };

  const getAuthHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`
  });

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      alert("Please enter a search query");
      return;
    }

    if (selectedOption === "Username") {
      if (usernameSearchCount >= MAX_USERNAME_SEARCHES) {
        alert(`You have reached the maximum of ${MAX_USERNAME_SEARCHES} username searches per freemium account.`);
        return;
      }
    }

    // Reset results and set loading
    dispatch(resetSearchResults());
    dispatch(setIsSearchDisabled(true));
    setShowPreloader(true);

    try {
      if (selectedOption === "Username") {
        await dispatch(performUsernameSearch({ searchQuery })).unwrap();

        // Update search count
        const newSearchCount = usernameSearchCount + 1;
        dispatch(setUsernameSearchCount(newSearchCount));
        localStorage.setItem('usernameSearchCount', newSearchCount.toString());
        localStorage.setItem('usernameSearchTimestamp', Date.now().toString());
      } else {
        const result = await dispatch(performGlobalSearch({
          searchQuery,
          authHeaders: getAuthHeaders()
        })).unwrap();

        if (result.showInactivityModal) {
          dispatch(setShowInactivityModal(true));
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setShowPreloader(false);;
    }

    // Re-enable search after 15 seconds
    setTimeout(() => {
      dispatch(setIsSearchDisabled(false));
    }, 15000);
  };

  const handleAdvancedSearch = async () => {
    if (!advSearchQuery.trim()) {
      alert("Please enter a search query in the advanced panel");
      return;
    }

    let includeKeywords = [];
    let excludeKeywords = [];
    let advancedPayload = null;

    if (activeQuickOption === 'financial') {
      advancedPayload = [
        QUICK_OPTIONS.financial1,
        QUICK_OPTIONS.financial2,
        QUICK_OPTIONS.financial3
      ];
    } else if (activeQuickOption) {
      advancedPayload = [QUICK_OPTIONS[activeQuickOption]];
      includeKeywords = QUICK_OPTIONS[activeQuickOption].include;
      excludeKeywords = QUICK_OPTIONS[activeQuickOption].exclude;
    } else {
      includeKeywords = [includeKeyword1, includeKeyword2]
        .flatMap((k) => k.split(","))
        .map((k) => k.trim())
        .filter(Boolean);

      excludeKeywords = excludeKeyword
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

      if (includeKeywords.length > 0) {
        advancedPayload = [
          // Chunk 1 (Mixed): base query + include keywords via dork6's AND clause.
          // Do NOT concatenate keywords into search_query — dork6 wraps it in quotes,
          // making CSE look for an exact phrase like "apk sbi" which returns nothing.
          { search_query: advSearchQuery, include: includeKeywords, exclude: excludeKeywords },
          // Chunk 2 (Base only): just the base query through dorks 1-5 (no include = normal search)
          { search_query: advSearchQuery, include: [], exclude: excludeKeywords },
          // Chunk 3 (Keywords only): just the include keywords through dorks 1-5
          { search_query: includeKeywords.join(" ").trim(), include: [], exclude: excludeKeywords }
        ];
      } else {
        advancedPayload = [{ search_query: advSearchQuery, include: [], exclude: excludeKeywords }];
      }
    }

    dispatch(setSearchQuery(advSearchQuery));
    dispatch(resetSearchResults());
    dispatch(setIsSearchDisabled(true));
    setShowPreloader(true);
    setIsOpen(false); // Close the advance panel

    try {
      const result = await dispatch(
        performGlobalSearch({
          searchQuery: advSearchQuery,
          authHeaders: getAuthHeaders(),
          isAdvanced: true,
          includeKeywords,
          excludeKeywords,
          advancedPayload,
        })
      ).unwrap();

      if (result.showInactivityModal) {
        dispatch(setShowInactivityModal(true));
      }
    } catch (error) {
      console.error("Error fetching advanced data:", error);
    } finally {
      setShowPreloader(false);
    }

    setTimeout(() => {
      dispatch(setIsSearchDisabled(false));
    }, 15000);
  };

  const handleSearchQueryChange = (e) => {
    dispatch(setSearchQuery(e.target.value));
  };

  const handleCloseInactivityModal = () => {
    dispatch(setShowInactivityModal(false));
  };

  return (
    <div
      className="bg-custom-gray text-white"
      style={{ width: "70%", height: "815", padding: "23px" }}
    >
      {showPreloader && <Preloader />}
      <div
        className="justify-between items-center"
        style={{ maxWidth: "1000px", margin: "19px -10px" }}
      >
        {/* Logo and Brand Name */}
        <div className="flex items-center">
          <div className="flex items-center max-w-[100px]">
            <img
              src={Logo}
              alt="logo"
              className="h-[87px] w-auto"
              style={{
                marginRight: "7px",
                marginLeft: "12px",
                marginBottom: "6px",
              }}
            />
          </div>
          <div className="flex items-center">
            <img
              src={BrandName}
              alt="Brand name"
              className="h-[45px] w-auto"
              style={{ marginRight: "10px", marginLeft: "7px" }}
            />
          </div>
        </div>

        <div
          className="flex items-center relative"
          style={{ marginTop: "30px", marginLeft: "80px", width: "80%" }}
        >
          <div
            className="relative"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <button
              className="bg-custom-blue text-white border-none cursor-pointer flex items-center font-aldrich rounded-md"
              style={{
                marginRight: "10px",
                paddingBottom: "6px",
                paddingTop: "6px",
                paddingLeft: "15px",
                paddingRight: "15px",
                fontSize: "13px",
              }}
            >
              <FontAwesomeIcon icon={faSearch} style={{ marginRight: "8px" }} />
              {selectedOption}
            </button>
            {showDropdown && (
              <div
                className="absolute bg-white text-black rounded shadow-md mt-2"
                style={{ width: "90px", zIndex: "1000", fontSize: "13px" }}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              >
                {/* <div
                  className="cursor-pointer p-2 hover:bg-blue-200"
                  onClick={() => handleOptionClick("Username")}
                >
                  Username
                </div> */}
                <div
                  className="cursor-pointer p-2 hover:bg-blue-200"
                  onClick={() => handleOptionClick("Global")}
                >
                  Global
                </div>
                {/* <div
                  className="cursor-pointer p-2 hover:bg-blue-200"
                  onClick={() => handleOptionClick("Email")}
                >
                  Email
                </div> */}
              </div>
            )}
          </div>
          <input
            type="text"
            id="searchInput"
            placeholder="search..."
            className="flex-grow border-none rounded-md font-aldrich text-[14px] text-black"
            style={{ padding: "4px 4px 4px 10px", marginRight: "10px" }}
            value={searchQuery}
            onChange={handleSearchQueryChange}
            onKeyDown={(e) => {
              // While the Advance panel is open its own fields are the live
              // ones; running the plain search here silently drops the
              // keywords the user just typed.
              if (e.key === "Enter" && !isSearchDisabled && !isOpen) {
                handleSearch();
              }
            }}
          />
          <button
            id="searchButton"
            className={`bg-custom-blue text-white border-none rounded-md font-aldrich ${isOpen ? "cursor-not-allowed opacity-40" : "cursor-pointer"
              }`}
            type="button"
            style={{
              paddingBottom: "6px",
              paddingTop: "6px",
              paddingLeft: "15px",
              paddingRight: "15px",
              fontSize: "13px",
            }}
            onClick={handleSearch}
            disabled={isSearchDisabled || isOpen}
            title={isOpen ? "Use the > button inside the Advance panel" : undefined}
          >
            {isSearchDisabled ? "Please Wait..." : "Search"}
          </button>
          {selectedOption === "Username" && usernameSearchCount >= MAX_USERNAME_SEARCHES && (
            <div className="text-red-500 ml-2 text-sm">
              Limit reached: {usernameSearchCount}/{MAX_USERNAME_SEARCHES} searches
            </div>
          )}
          <button
            id="adv"
            className="relative bg-custom-blue text-white border-none rounded-md cursor-pointer font-aldrich"
            style={{
              marginLeft: "10px",
              paddingBottom: "6px",
              paddingTop: "6px",
              paddingLeft: "15px",
              paddingRight: "15px",
              fontSize: "13px",
            }}
            onClick={togglePanel}
          >
            Advance
          </button>
          {isOpen && (
            <div
              id="advance-panel"
              className="absolute right-0 top-[150%] z-[1000000] overflow-hidden rounded-xl border border-border-blue bg-gradient-to-b from-[#00060c] to-[#04121a] via-[#01111e]"
              style={{
                animation: "fade-in 500ms forwards",
                padding: "30px",
                width: "800px",
              }}
            >
              <div
                id="advance-panel-subcontainer"
                className="flex flex-col justify-between w-full py-2.5 px-8 pb-8 rounded-xl"
                style={{ border: "1px dotted #00d1ff" }}
              >
                <div
                  className="flex items-center justify-between"
                  style={{ height: "50px" }}
                >
                  <img id="left-img" src={Vec} style={{ width: "40px" }} />
                  <div
                    className="font-almarai flex-grow text-left"
                    style={{
                      color: "#bebebe",
                      padding: "0 15px",
                      fontSize: "13px",
                    }}
                  >
                    "Add customized queries to maximize your potential output"
                  </div>
                  <div className="flex items-center justify-between mr-[-20px] w-[150px]">
                    <button
                      id="advance-panel-next-button"
                      className="transition-all duration-250 bg-custom-blue hover:opacity-80 text-white w-[70px] flex items-center justify-center rounded-md h-[30px] cursor-pointer"
                      onClick={handleAdvancedSearch}
                      disabled={isSearchDisabled}
                      style={{ border: "none" }}
                    >
                      {">"}
                    </button>
                    <img src={PanelLogo} alt="" style={{ width: "40px" }} />
                  </div>
                </div>
                <div
                  className="flex w-full "
                  style={{
                    height: "70%",
                    borderRadius: "inherit",
                    paddingTop: "30px",
                    paddingRight: "20px",
                  }}
                >
                  <div className="grid gap-4">
                    <div className="grid grid-cols-12 items-center">
                      <label
                        className="text-white text-2xl col-span-4 whitespace-nowrap"
                        htmlFor="searchQuery"
                        style={{ paddingRight: "120px" }}
                      >
                        Search Query
                      </label>
                      <input
                        type="text"
                        id="searchQuery"
                        className="col-start-6 col-span-7 p-2 text-white outline-none"
                        placeholder=""
                        value={advSearchQuery}
                        onChange={(e) => setAdvSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !isSearchDisabled) {
                            handleAdvancedSearch();
                          }
                        }}
                        style={{
                          background: "#010a13",
                          border: "1px dotted #00d1ff",
                          borderRadius: "5px",
                        }}
                      />
                    </div>

                    <div className="grid grid-cols-12 items-center">
                      <label
                        className="text-white text-2xl col-span-4 whitespace-nowrap"
                        htmlFor="includeKeyword"
                        style={{ paddingRight: "120px" }}
                      >
                        Include Keyword
                      </label>
                      <input
                        type="text"
                        id="includeKeyword"
                        className="col-start-6 col-span-7 text-white p-2 outline-none"
                        placeholder=""
                        disabled={!!activeQuickOption}
                        value={includeKeyword1}
                        onChange={(e) => setIncludeKeyword1(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !isSearchDisabled) {
                            handleAdvancedSearch();
                          }
                        }}
                        style={{
                          background: "#010a13",
                          border: "1px dotted #00d1ff",
                          borderRadius: "5px",
                          opacity: activeQuickOption ? 0.3 : 1,
                          cursor: activeQuickOption ? "not-allowed" : "text",
                        }}
                      />
                    </div>

                    <div className="grid grid-cols-12 items-center">
                      <label
                        className="text-white text-2xl col-span-4 whitespace-nowrap "
                        htmlFor="includeSecondKeyword"
                        style={{ paddingRight: "120px" }}
                      >
                        Include Second Keyword
                      </label>
                      <input
                        type="text"
                        id="includeSecondKeyword"
                        className="col-start-6 col-span-7 text-white p-2 outline-none"
                        placeholder=""
                        disabled={!!activeQuickOption}
                        value={includeKeyword2}
                        onChange={(e) => setIncludeKeyword2(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !isSearchDisabled) {
                            handleAdvancedSearch();
                          }
                        }}
                        style={{
                          background: "#010a13",
                          border: "1px dotted #00d1ff",
                          borderRadius: "5px",
                          opacity: activeQuickOption ? 0.3 : 1,
                          cursor: activeQuickOption ? "not-allowed" : "text",
                        }}
                      />
                    </div>

                    <div className="grid grid-cols-12 items-center">
                      <label
                        className="text-white text-2xl col-span-4 whitespace-nowrap"
                        htmlFor="excludeKeyword"
                        style={{ paddingRight: "120px" }}
                      >
                        Exclude Keyword
                      </label>
                      <input
                        type="text"
                        id="excludeKeyword"
                        className="col-start-6 col-span-7 text-white p-2 outline-none"
                        placeholder=""
                        disabled={!!activeQuickOption}
                        value={excludeKeyword}
                        onChange={(e) => setExcludeKeyword(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !isSearchDisabled) {
                            handleAdvancedSearch();
                          }
                        }}
                        style={{
                          background: "#010a13",
                          border: "1px dotted #00d1ff",
                          borderRadius: "5px",
                          opacity: activeQuickOption ? 0.3 : 1,
                          cursor: activeQuickOption ? "not-allowed" : "text",
                        }}
                      />
                    </div>

                    <div className="flex gap-4 mt-2">
                      <button
                        className={`px-4 py-2 rounded-md border text-white transition-all cursor-pointer font-aldrich ${activeQuickOption === 'financial'
                          ? 'bg-[#00d1ff] bg-opacity-20 border-[#00d1ff]'
                          : 'border-gray-500 hover:border-[#00d1ff]'
                          }`}
                        style={{ fontSize: "14px", height: "40px" }}
                        onClick={() => setActiveQuickOption(activeQuickOption === 'financial' ? null : 'financial')}
                      >
                        Financial Mule Networks
                      </button>
                      <button
                        className={`px-4 py-2 rounded-md border text-white transition-all cursor-pointer font-aldrich ${activeQuickOption === 'crypto'
                          ? 'bg-[#00d1ff] bg-opacity-20 border-[#00d1ff]'
                          : 'border-gray-500 hover:border-[#00d1ff]'
                          }`}
                        style={{ fontSize: "14px", height: "40px" }}
                        onClick={() => setActiveQuickOption(activeQuickOption === 'crypto' ? null : 'crypto')}
                      >
                        Crypto
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {showInactivityModal && (
        <InactivityModal
          onClose={handleCloseInactivityModal}
        />
      )}
    </div>
  );
};

export default Navbar;