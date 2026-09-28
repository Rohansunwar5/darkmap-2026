import { useEffect, useState } from "react";
import Navbar from "../Navbar";
import Sidebar from "../Sidebar";
import Sidebox from "../Sidebox";

const GenericLayout = ({
  children,
  onSearch,
  selectedOption,
  setSelectedOption,
  selectedMessage,
  selectedType,
  searchQuery,
  setSearchQuery,
  setIsVisualizerOpen,
  searchResults,
  hideNavbar = false,
  hideSidebox = false,
  socialProfiles: propSocialProfiles,
  setSocialProfiles: propSetSocialProfiles
}) => {
  const [localSocialProfiles, setLocalSocialProfiles] = useState([]);
  const socialProfiles = propSocialProfiles !== undefined ? propSocialProfiles : localSocialProfiles;
  const setSocialProfiles = propSetSocialProfiles !== undefined ? propSetSocialProfiles : setLocalSocialProfiles;

  useEffect(() => {
    console.log("Current socialProfiles in GenericLayout:", socialProfiles);
  }, [socialProfiles]);

  return (
    <div className="flex bg-black h-dvh w-full">
      <div className={`flex flex-col ${hideSidebox ? 'w-full' : 'w-2/3'} overflow-y-auto hide-scrollbar`}>
        {!hideNavbar && (
          <Navbar
            onSearch={onSearch}
            selectedOption={selectedOption}
            setSelectedOption={setSelectedOption}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            setSocialProfiles={setSocialProfiles}
          />
        )}
        <div className="flex h-screen">
          <div
            id="sidebar"
            className="sticky top-0 bg-black bg-opacity-0 flex flex-col justify-between"
            style={{
              background:
                "linear-gradient(to right, rgb(9, 9, 9) 15%, rgba(0, 75, 98, 0.34) 50%, rgba(0, 59, 90, 0) 110%)",
              paddingLeft: "10px",
              height: "100vh", // Explicit height
            }}
          >
            <Sidebar />
          </div>
          <div className="flex-1 overflow-auto">{children}</div>
        </div>

      </div>
      {!hideSidebox && (
        <Sidebox
          selectedMessage={selectedMessage}
          selectedType={selectedType}
          className="flex-shrink-0"
          searchQuery={searchQuery}
          socialProfiles={socialProfiles}
          setIsVisualizerOpen={setIsVisualizerOpen}
          searchResults={searchResults}
        />
      )}
    </div>
  );
};

export default GenericLayout;