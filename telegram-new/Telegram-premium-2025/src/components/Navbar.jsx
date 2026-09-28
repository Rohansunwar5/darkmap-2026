import { useEffect, useState, useRef } from "react";
import "../styles/styles.css";
import axios from "axios";
import apiClient from "../lib/apiClient";
import LogoBrand from "./Navbar/LogoBrand";
import SearchBar from "./Navbar/SearchBar";
import { useNavigate } from "react-router-dom";
import { useSearch } from "../context/SearchContext";

const parseTelegramPayload = (rawPayload) => {
  if (typeof rawPayload === "string") {
    try {
      return JSON.parse(rawPayload);
    } catch {
      return null;
    }
  }

  if (rawPayload && typeof rawPayload === "object") {
    return rawPayload;
  }

  return null;
};

const Navbar = ({ onSearch, searchQuery, setSearchQuery, setSocialProfiles }) => {
  const { setCurrentSearchId } = useSearch();
  const [isSearchDisabled, setIsSearchDisabled] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null)
  const [userCredits, setUserCredits] = useState(0);
  const dropdownTimeoutRef = useRef(null);
  const searchRequestIdRef = useRef(0);
  const searchDisableTimeoutRef = useRef(null);
  const navigate = useNavigate();

  const fetchUserCredits = async () => {
    try {
      const response = await apiClient.get(
        `${import.meta.env.VITE_API_BASE_URL}/auth/profile`
      );
      setUserCredits(response.data?.data?.credits || 0);
    } catch (error) {
      console.error("Error fetching user credits:", error);
      if (error.response?.status === 401) {
        localStorage.removeItem('accessToken');
        navigate('/login');
      }
    }
  };


  useEffect(() => {
    fetchUserCredits();
  }, []);

  useEffect(() => {
    return () => {
      if (dropdownTimeoutRef.current) {
        clearTimeout(dropdownTimeoutRef.current);
      }
      if (searchDisableTimeoutRef.current) {
        clearTimeout(searchDisableTimeoutRef.current);
      }
    };
  }, []);

 const handleSearch = async (userId = null) => {  // Accept optional userId parameter
  if (onSearch) {
    const queryToSearch = String(userId || searchQuery || "").trim().replace(/^@+/, "");
    if (!queryToSearch) {
      return;
    }

    const requestId = ++searchRequestIdRef.current;
    if (searchDisableTimeoutRef.current) {
      clearTimeout(searchDisableTimeoutRef.current);
      searchDisableTimeoutRef.current = null;
    }

    setErrorMessage(null);
    onSearch({ telegram: [] }, true); // Clear stale UI before the request starts
    setIsSearchDisabled(true);
    setSocialProfiles(null);

    const newSearchId = crypto.randomUUID();
    setCurrentSearchId(newSearchId);

    try {
      // Create a minimum delay promise
      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

      // Start both API call and minimum delay
      const [telegramResponse] = await Promise.all([
        apiClient.post(
          `${import.meta.env.VITE_API_BASE_URL}/telegram/proxy`, 
          { query: queryToSearch, searchId: newSearchId },  // Use the resolved userId here
          {
            timeout: 60000,
          }
        ).catch(error => {
          if(error.response){
            return error.response;
          }
          throw error;
        }),
        delay(7000)
      ]);

      if (telegramResponse.data?.status === "error" && 
        telegramResponse.data?.result?.message === "User not found") {
        throw new Error(`Requested account does not provide accessible Telegram data`);
      }

      const normalizedPayload = String(
        typeof telegramResponse.data === "string"
          ? telegramResponse.data
          : JSON.stringify(telegramResponse.data || {})
      ).toLowerCase();
      const hasNoResultsResponse =
        normalizedPayload.includes("there are no results for this search") ||
        normalizedPayload.includes("no results for this search") ||
        normalizedPayload.includes("user not found") ||
        normalizedPayload.includes("failed to forward request via primary and fallback providers") ||
        normalizedPayload.includes("primary api returned blank proxy data");

      if (hasNoResultsResponse) {
        throw new Error(`Requested account does not provide accessible Telegram data`);
      }

      if (telegramResponse.data?.success === false) {
        throw new Error(
          telegramResponse.data?.message || 
          "An error occurred while searching Telegram"
        );
      }

      const parsedTelegramPayload = parseTelegramPayload(telegramResponse.data);
      if (!parsedTelegramPayload) {
        throw new Error("Invalid Telegram response payload");
      }

      if (requestId !== searchRequestIdRef.current) {
        return;
      }

      // Process Telegram response after the 7-second minimum delay completes.
      onSearch({ telegram: parsedTelegramPayload }, false);
      
      await fetchUserCredits();

      // Handle Social Profiles API separately (no delay) - wrapped in try-catch for silent error handling
      try {
        const socialResponse = await axios.post(
          "https://enola.darkmap.org/search_username/", 
          { username: queryToSearch },  
          {
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${localStorage.accessToken}`,
            },
          }
        );
        
        const socialData = Array.isArray(socialResponse?.data) ? socialResponse.data : [];
        setSocialProfiles(socialData);
      } catch (socialError) {
        // Silent error handling - just log and set empty array
        console.error("Social profiles API failed (handled silently):", socialError);
        setSocialProfiles([]);
      }

    } catch (error) {
      if (requestId !== searchRequestIdRef.current) {
        return;
      }

      console.error("Error:", error);
      const rawErrorMessage = (
        error.response?.data?.message ||
        error.message ||
        "An error occurred while searching"
      );
      const normalizedRawError = String(rawErrorMessage).toLowerCase();
      const shouldShowAccessibilityPopup =
        normalizedRawError.includes("requested account does not provide accessible") ||
        normalizedRawError.includes("user not found") ||
        normalizedRawError.includes("there are no results for this search") ||
        normalizedRawError.includes("no results for this search") ||
        normalizedRawError.includes("failed to forward request via primary and fallback providers") ||
        normalizedRawError.includes("primary api returned blank proxy data") ||
        normalizedRawError.includes("time exceeded") ||
        normalizedRawError.includes("timeout") ||
        normalizedRawError.includes("exceeded");

      setErrorMessage(
        shouldShowAccessibilityPopup
          ? "Requested account does not provide accessible Telegram data"
          : rawErrorMessage
      );
      onSearch({ telegram: [] }, false);
      setSocialProfiles([]);

      await fetchUserCredits();
    } finally {
      if (requestId !== searchRequestIdRef.current) {
        return;
      }

      searchDisableTimeoutRef.current = setTimeout(() => {
        if (requestId === searchRequestIdRef.current) {
          setIsSearchDisabled(false);
        }
      }, 15000);
    }
  }
};


  return (
    <div className="bg-custom-gray text-white" style={{ height: "815", padding: "23px" }}>
    <div className="justify-between items-center" style={{ maxWidth: "1000px", margin: "19px -10px" }}>
      <LogoBrand />
      <SearchBar
        userCredits={userCredits}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        handleSearch={handleSearch}
        isSearchDisabled={isSearchDisabled}
      />
      {errorMessage && (
      (() => {
        const normalizedErrorMessage = (errorMessage || "").toLowerCase();
        const hasAccessibilityError =
          normalizedErrorMessage.includes("requested account does not provide accessible") ||
          normalizedErrorMessage.includes("user not found") ||
          normalizedErrorMessage.includes("there are no results for this search") ||
          normalizedErrorMessage.includes("no results for this search") ||
          normalizedErrorMessage.includes("failed to forward request via primary and fallback providers") ||
          normalizedErrorMessage.includes("primary api returned blank proxy data") ||
          normalizedErrorMessage.includes("time exceeded") ||
          normalizedErrorMessage.includes("timeout") ||
          normalizedErrorMessage.includes("exceeded");
        const hasCreditError = normalizedErrorMessage.includes("credit");
        const accessibilityMessage = "Requested account does not provide accessible Telegram data";

        return (
      <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-80">
        <div style={{ backgroundColor: 'rgb(12,12,12)' }} className="p-6 rounded-lg shadow-xl max-w-2xl border border-gray-800">
          <div className="text-[#00D1FF] font-medium text-xl">
            {hasAccessibilityError ? accessibilityMessage : errorMessage}
          </div>

          {hasAccessibilityError && (
            <div className="mt-2 mb-4">
              <div className="text-gray-300 text-sm mb-4 font-default-sans">
                Group associations may exist but are not accessible by OSINT methods.
              </div>
              <div className="border-t border-gray-800 my-4" />
              <div className="text-[#00D1FF] text-xs font-semibold mb-2">
                POSSIBLE REASONS INCLUDE:
              </div>
              <div className="space-y-2 mb-5 text-gray-300 text-sm font-default-sans">
                <div className="flex items-start gap-2">
                  <span className="text-[#00D1FF] mt-0.5">&#8250;</span>
                  <span>Telegram privacy settings are enabled and turned to private</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[#00D1FF] mt-0.5">&#8250;</span>
                  <span>The profile information and associations are intentionally hidden or limited</span>
                </div>
              </div>
              <div className="border-t border-gray-800 my-4" />
              <div className="text-[#00D1FF] text-xs font-semibold mb-2">
                TELEGRAM PRIVACY SETTINGS
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
                <div className="rounded-md border border-gray-700 p-2 bg-[#10131a]">
                  <img
                    src="/tgermg2.jpeg"
                    alt="Telegram privacy settings reference panel 2"
                    className="w-full h-auto rounded"
                  />
                </div>
                <div className="rounded-md border border-gray-700 p-2 bg-[#10131a]">
                  <img
                    src="/tgermg1.jpeg"
                    alt="Telegram privacy settings reference panel 1"
                    className="w-full h-auto rounded"
                  />
                </div>
              </div>
              <div className="rounded-md border border-yellow-700/40 bg-yellow-950/30 px-4 py-3 text-sm text-yellow-200 font-default-sans flex items-center gap-2">
                <span aria-hidden="true">&#9888;</span>
                <span>Absence of data does not indicate absence of activity</span>
              </div>
            </div>
          )}

          {hasCreditError && (
            <button
              onClick={() => window.location.href = "/payment"}
              className="px-4 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700"
            >
              Recharge Now
            </button>
          )}
          <button
            onClick={() => setErrorMessage(null)}
            className="px-4 py-2 mt-2 bg-[#00D1FF] text-white rounded hover:bg-gray-400"
          >
            Close
          </button>
        </div>
      </div>
        );
      })()
      )}
    </div>
  </div>
  );
};

export default Navbar;