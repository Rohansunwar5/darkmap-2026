import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faCoins, faChevronDown, faTimes, faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import { useSearch } from "../../context/SearchContext";
import apiClient from "../../lib/apiClient";

const SearchBar = ({
  searchQuery,
  setSearchQuery,
  handleSearch,
  isSearchDisabled,
  userCredits,
}) => {
  const { heroQuery, setHeroQuery, triggerSearch, setTriggerSearch } = useSearch();
  const [searchType, setSearchType] = useState("username");
  const [showDropdown, setShowDropdown] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "error" });

  useEffect(() => {
    if (heroQuery) {
      setSearchQuery(heroQuery);
      setHeroQuery('');
    }
  }, [heroQuery, setSearchQuery, setHeroQuery]);

  useEffect(() => {
    if (triggerSearch && searchQuery && !isSearchDisabled) {
      handleModifiedSearch();
      setTriggerSearch(false);
    }
  }, [triggerSearch, searchQuery, isSearchDisabled, setTriggerSearch]);

  // Auto-hide toast after 5 seconds
  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(() => {
        setToast({ ...toast, show: false });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [toast.show]);

  const showToast = (message, type = "error") => {
    setToast({ show: true, message, type });
  };

  const hideToast = () => {
    setToast({ ...toast, show: false });
  };

  const handleModifiedSearch = async () => {
    if (searchType === "phone") {
      try {
        // Call the new phone number API endpoint
        const response = await apiClient.post(
          `${import.meta.env.VITE_API_BASE_URL}/telegram/check-phone`,
          { phoneNumber: searchQuery }
        );

        const data = response.data;

        if (!data.success || !data.userId) {
          showToast("No user ID found for this phone number", "error");
          return;
        }

        // Call the original handleSearch with the extracted ID
        handleSearch(data.userId);
        console.log("user data: ", data.userId);

      } catch (error) {
        const errorData = error.response?.data;
        if (errorData) {
          // Handle specific error cases
          if (errorData.error === "No user found for this phone number") {
            showToast("No user found for this phone number. Please check the number and try again.", "error");
          } else {
            showToast(errorData.error || "Failed to fetch phone number details", "error");
          }
        } else {
          console.error("Error processing phone number:", error);
          showToast("Network error occurred. Please try again.", "error");
        }
      }
    } else {
      // Normal username search
      handleSearch();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !isSearchDisabled) {
      handleModifiedSearch();
    }
  };

  const toggleSearchType = (type) => {
    setSearchType(type);
    setShowDropdown(false);
    setSearchQuery(''); // Clear search query when switching types
  };

  return (
    <>
      {/* Toast Notification */}
      {toast.show && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-fadeIn">
          <div className={`flex items-center p-4 rounded-lg shadow-lg max-w-md ${
            toast.type === "error" 
              ? "bg-red-50 border border-red-200 text-red-800" 
              : "bg-green-50 border border-green-200 text-green-800"
          }`}>
            <FontAwesomeIcon 
              icon={toast.type === "error" ? faExclamationTriangle : faSearch} 
              className={`mr-3 ${toast.type === "error" ? "text-red-500" : "text-green-500"}`} 
            />
            <span className="font-aldrich text-sm flex-1">{toast.message}</span>
            <button
              onClick={hideToast}
              className={`ml-3 p-1 rounded-full hover:bg-opacity-20 ${
                toast.type === "error" ? "hover:bg-red-500" : "hover:bg-green-500"
              }`}
            >
              <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center relative" style={{ marginTop: "30px", marginLeft: "80px", width: "80%" }}>
        <div className="relative">
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
            onClick={() => setShowDropdown(!showDropdown)}
          >
            <FontAwesomeIcon icon={faSearch} style={{ marginRight: "8px" }} />
            {searchType === "username" ? "Username" : "Phone Number"}
            <FontAwesomeIcon icon={faChevronDown} style={{ marginLeft: "8px", fontSize: "10px" }} />
          </button>
          
          {showDropdown && (
            <div className="absolute z-10 mt-1 w-full bg-white rounded-md shadow-lg">
              <button
                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 font-aldrich"
                onClick={() => toggleSearchType("username")}
              >
                Username
              </button>
              <button
                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 font-aldrich"
                onClick={() => toggleSearchType("phone")}
              >
                Phone Number
              </button>
            </div>
          )}
        </div>
        
        <input
          type="text"
          id="searchInput"
          placeholder={searchType === "username" ? "search username..." : "search phone number..."}
          className="flex-grow border-none rounded-md font-aldrich text-[14px] text-black"
          style={{ padding: "4px 4px 4px 10px", marginRight: "10px" }}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        
        <button
          id="searchButton"
          className="bg-custom-blue text-white border-none rounded-md cursor-pointer font-aldrich"
          type="button"
          style={{
            paddingBottom: "6px",
            paddingTop: "6px",
            paddingLeft: "15px",
            paddingRight: "15px",
            fontSize: "13px",
          }}
          onClick={handleModifiedSearch}
          disabled={isSearchDisabled}
        >
          {isSearchDisabled ? "Please Wait..." : "Search"}
        </button>
        
        <div
          style={{
            paddingBottom: "6px",
            paddingTop: "6px",
            paddingLeft: "15px",
            paddingRight: "15px",
            fontSize: "13px",
          }}
          className="bg-custom-blue text-white rounded-md ml-2 px-3 py-1 flex items-center"
        >
          <FontAwesomeIcon icon={faCoins} className="mr-2 text-yellow-400" />
          <span className="font-aldrich text-sm">{userCredits}</span>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px) translateX(-50%);
          }
          to {
            opacity: 1;
            transform: translateY(0) translateX(-50%);
          }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </>
  );
};

export default SearchBar;