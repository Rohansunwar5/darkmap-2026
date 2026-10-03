import React, { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import Sidebox from "../components/Sidebox";
import Sidebar from "../components/Sidebar";
import Results from "../components/Results";
import BoxContainer from "../components/BoxContainer";
import Preloader from "../components/Preloader";
import UserName from "../components/UserName";
import OcintSideBox from "../components/OcintSideBox";
import OcintContainer from "../components/OcintContainer";
import Preview from "../components/Preview";
import { useNavigate } from "react-router-dom";


const Genric = ({ searchBarResults }) => {
  const [searchResults, setSearchResults] = useState({
    telegram: [],
    darkweb: [],
    ransomware: [],
    breachforums: [],
  });
  const navigate = useNavigate();

  const [showLoader, setShowLoader] = useState(true);

  useEffect(() => {
    const loaderTimer = setTimeout(() => {
      setShowLoader(false);
    }, 60000);

    return () => clearTimeout(loaderTimer);
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        await axios.get('https://backend.darkmap.org/auth/profile', {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('accessToken')}`
          }
        });
      } catch (error) {
        if (error.response?.status === 401) {
          localStorage.removeItem('accessToken');
          navigate('/login');
        }
      }
    };

    checkAuth();
  }, [navigate]);

  useEffect(() => {
    if (searchBarResults) {
      setSearchResults((prevResults) => ({
        telegram: searchBarResults.telegram || prevResults.telegram,
        darkweb: searchBarResults.darkweb || prevResults.darkweb,
        ransomware: searchBarResults.ransomware || prevResults.ransomware,
        breachforums: searchBarResults.breachforums || prevResults.breachforums,
      }));
    }
  }, [searchBarResults]);

  const totalResultsCount = Object.values(searchResults).reduce((acc, curr) => {
    if (Array.isArray(curr)) {
      return acc + curr.length;
    } else if (curr?.results) {
      return acc + curr.results.length;
    }
    return acc;
  }, 0);

  const adjustedTotalResultsCount =
    totalResultsCount > 0 ? totalResultsCount + 10000 : 0;

  const [selectedMessage, setSelectedMessage] = useState(null);
  const [selectedType, setSelectedType] = useState("");
  const [loading, setLoading] = useState(false);
  const [channelNames, setChannelNames] = useState([]);
  const [predefinedChannels, setPredefinedChannels] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOption, setSelectedOption] = useState(null);
  const [selectedFilter, setSelectedFilter] = useState("all");

  const handleFilterChange = (filter) => {
    setSelectedFilter(filter);
  };

  const keywords = [
    "hack",
    "hacked",
    "leak",
    "leaked",
    "database leak",
    "DATABASE Leak",
    "breach",
    "database breach",
    "data breach",
    "malware",
    "c2",
    "trojan",
    "stealer",
    "CVE",
    "mega.nz",
    "Forums",
    "tor",
    "Leak data",
    "dos",
    "ddos",
    "anonfiles",
    "User Database",
    "sensitive",
    "internal",
    "steal",
    "drive.google.com",
    ".zip",
    "Threat",
    "Dump",
  ];

  const handleSearch = (
    results,
    isLoading,
    allChannels = [],
    query = "",
    predefinedChannels = []
  ) => {
    setLoading(isLoading);

    if (results) {
      setSearchResults(results);
      setChannelNames(allChannels);
      setPredefinedChannels(predefinedChannels);
      setSearchQuery(query);
      setLoading(false);
    }
  };
  const handleSelectMessage = (type, message) => {
    setSelectedMessage(message);
    setSelectedType(type);
  };

  return (
    <div className="flex flex-col bg-black min-h-screen w-full overflow-hidden">
       {showLoader && (
        <div className="fixed  z-[9999]">
          < Preview/>
        </div>
      )}
      
      <Navbar
        onSearch={handleSearch}
        selectedOption={selectedOption}
        setSelectedOption={setSelectedOption}
      />
      {loading && <Preloader />}
      <div className="flex flex-grow overflow-hidden">
        <Sidebar className="flex-shrink-0" />

        <div className="flex flex-col flex-grow overflow-auto">
          <Results
            searchResults={searchResults}
            totalResultsCount={adjustedTotalResultsCount}
            onFilterChange={handleFilterChange}
            className="flex-shrink-0 overflow-auto"
          />
          {selectedOption === "Email" ? (
            <OcintContainer />
          ) : selectedOption === "Username" ? (
            <UserName
              searchResults={searchResults}
              className="flex-grow overflow-auto"
            />
          ) : (
            <BoxContainer
              onSelectMessage={handleSelectMessage}
              keywords={keywords}
              filter={selectedFilter}
              className="flex-grow overflow-auto"
            />
          )}
        </div>
        {selectedOption === "Email" ? (
          <OcintSideBox className="flex-shrink-0" />
        ) : (
          <Sidebox
            selectedMessage={selectedMessage}
            selectedType={selectedType}
            className="flex-shrink-0"
          />
        )}
      </div>
    </div>
  );
};

export default Genric;
