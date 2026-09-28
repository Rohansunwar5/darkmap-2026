import React, { useEffect, useState } from "react";
import GenericLayout from "../components/Genric/GenericLayout";
import Results from "../components/Results";
import UserName from "../components/UserName";
import Preview from "../components/Preview";
import useSearchResults from "../components/Genric/useSearchResults";
import image1 from "../assets/preloader/loader.gif"
import { useNavigate } from "react-router-dom";
import apiClient from "../lib/apiClient";
import NodeVisualizer from "../components/Visualizer/NodeVisualizer";

const Generic = ({ searchBarResults }) => {
  const [showLoader, setShowLoader] = useState(false);
  const [telegramMessages, setTelegramMessages] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [nearbyData, setNearbyData] = useState(null);
  const { searchResults, setSearchResults, getTotalResultsCount } = useSearchResults(searchBarResults);
  const [isVisualizerOpen, setIsVisualizerOpen] = useState(false);
  const [socialProfiles, setSocialProfiles] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        await apiClient.get(`${import.meta.env.VITE_API_BASE_URL}/auth/profile`);
      } catch (error) {
        if (error.response?.status === 401) {
          localStorage.removeItem('accessToken');
          navigate('/login');
        }
      }
    };

    checkAuth();
  }, [navigate]);
  // console.log("Generic.jsx - searchResults:", searchResults);
  
  useEffect(() => {
    // Reset nearbyData when a new search comes in
    setNearbyData(null);
  }, [searchResults]);

  const getTelegramTotalCount = () => {
    if (searchResults?.telegram?.result) {
      const groupsCount = searchResults.telegram.result.groups?.length || 0;
      const usernameHistoryCount = searchResults.telegram.result.username_history?.length || 0;
      return groupsCount + usernameHistoryCount;
    }
    return 0;
  };

  const handleSearch = (results, isLoading) => {
    setShowLoader(isLoading); // Show loader when isLoading is true
    if (isLoading) {
      setSearchResults({ telegram: [] });
    }
    if (results) {
      setSearchResults(results);
    }
  };

  return (
    <GenericLayout
      onSearch={handleSearch}
      selectedMessage={null}
      selectedType={null}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      telegramMessages={telegramMessages}
      setTelegramMessages={setTelegramMessages}
      setIsVisualizerOpen={setIsVisualizerOpen}
      searchResults={searchResults}
      socialProfiles={socialProfiles}
      setSocialProfiles={setSocialProfiles}
    >
      {showLoader && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-80 backdrop-filter backdrop-blur-sm">
          <img
            src={image1}
            alt="Loading..."
            className="w-64 h-50"
          />
        </div>
      )}

      <div className="flex flex-col flex-grow">
        <Results
          totalResultsCount={getTelegramTotalCount()}
          searchResults={searchResults}
          setNearbyData={setNearbyData}
          socialProfiles={socialProfiles}
          className="flex-shrink-0 overflow-auto"
        />
        
        <UserName
          searchResults={searchResults}
          nearbyData={nearbyData}
          className="flex-grow overflow-auto"
        />
      </div>



      <NodeVisualizer 
        isOpen={isVisualizerOpen}
        onClose={() => setIsVisualizerOpen(false)}
        data={searchResults}
      />
    </GenericLayout>
  );
};

export default Generic;