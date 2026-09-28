import React, { useState } from "react";
import TgDevRightContent from "./TgDevRightContent"; // Import the TgDevRightContent component
import TelegramIoc from "./IOC/TelegramIoc";
import DarkwebIoc from "./IOC/DarkwebIoc";
import RansomewareIoc from "./IOC/RansomewareIoc";
import BreachForumIoc from "./IOC/BreachForumIoc";
import AIContainer from "./AI/AiContainer";
import Chatbot from "./decoy/Chatbot";

const Sidebox = ({ selectedMessage, selectedType, searchQuery, socialProfiles, setIsVisualizerOpen, searchResults }) => {
  console.log("Sidebox received socialProfiles:", socialProfiles);
  const [activeTab, setActiveTab] = useState("Content");

  const handleTabClick = (tab) => {
    setActiveTab(tab);
  };

  return (
    <div
      className="w-1/3 tall-box-right min-h-0 flex flex-col border-t-2 border-transparent border-cyan-process bg-gradient-to-b from-deep-blue-lighter to-deep-blue-darker via-deep-blue"
      style={{
        borderTop: "2px solid #00c3ff",
        scrollbarWidth: "none",
        overflowY: activeTab === "Chatbot" ? "hidden" : "auto",
      }}
    >
      <style>
        {`
          .tall-box-right::-webkit-scrollbar {
            display: none; /* Hide scrollbar for Chrome, Safari, and Opera */
          }
        `}
      </style>
      <div
        className="items-center font-sans text-white flex justify-between border-b-2 border-cyan"
        style={{
          height: "50px",
          paddingLeft: "17px",
          paddingRight: "17px",
          paddingTop: "10px",
          paddingBottom: "10px",
          borderBottom: "2px solid #00d1ff",
          fontSize: "14px",
        }}
      >
        <div
          className={`transition-all duration-250 font-sans text-white hover:cursor-pointer hover:text-red-600 ${activeTab === "Content" ? "text-red-600" : ""
            }`}
          onClick={() => handleTabClick("Content")}
        >
          Chat
        </div>
        <div
          className={`transition-all duration-250 font-sans text-white hover:cursor-pointer hover:text-primary-500 inline-flex ${activeTab === "Content" ? "text-primary-500" : ""
            }`}
          onClick={() => handleTabClick("Ai")}
        >
          AI<svg className="size-5 text-primary-500" xmlns="http://www.w3.org/2000/svg" fill="currentColor" stroke="black" strokeWidth="1" data-name="Layer 1" viewBox="0 0 48 48" x="0px" y="0px" >
            <path  className="cls-1"  d="M34.221 27.538c-9.955-2.248-11.497-3.79-13.745-13.745-.103-.455-.508-.779-.976-.779s-.873.324-.976.779c-2.249 9.955-3.79 11.497-13.745 13.745-.456.104-.78.508-.78.976s.324.872.78.976c9.955 2.249 11.496 3.791 13.745 13.745.103.455.508.779.976.779s.873-.324.976-.779c2.249-9.954 3.79-11.496 13.745-13.745.456-.104.779-.508.779-.976s-.324-.872-.779-.976Z"/>
            <path  className="cls-1"  d="M43.221 12.039c-5.292-1.195-6.035-1.938-7.23-7.229-.104-.456-.508-.779-.976-.779s-.872.323-.976.779c-1.195 5.291-1.938 6.034-7.229 7.229-.456.104-.779.508-.779.976s.323.872.779.976c5.291 1.195 6.034 1.938 7.229 7.23.104.455.508.779.976.779s.872-.324.976-.779c1.195-5.292 1.938-6.035 7.23-7.23.455-.104.779-.508.779-.976s-.324-.872-.779-.976Z"/>
          </svg>
        </div>
        <div
          className={`ioc content transition-all duration-250 font-sans text-white hover:cursor-pointer hover:text-red-600 ${activeTab === "IOC" ? "text-red-600" : ""
            }`}
          onClick={() => handleTabClick("IOC")}
        >
          IOC
        </div>
        <div
          className={`transition-all duration-250 font-sans text-white hover:cursor-pointer hover:text-red-600 ${activeTab === "Chatbot" ? "text-red-600" : ""
            }`}
          onClick={() => handleTabClick("Chatbot")}
        >
          Decoy Agent
        </div>
      </div>
      {activeTab === "Content" && (
        <TgDevRightContent 
          selectedMessage={selectedMessage} 
          socialProfiles={socialProfiles} 
          searchQuery={searchQuery} 
          setIsVisualizerOpen={setIsVisualizerOpen} 
          searchResults={searchResults}
        />
      )}
      {activeTab === "IOC" && selectedType === "telegram" && (
        <TelegramIoc selectedMessage={selectedMessage} />
      )}
      {activeTab === "IOC" && selectedType === "darkweb" && (
        <DarkwebIoc selectedMessage={selectedMessage} />
      )}
      {activeTab === "IOC" && selectedType === "ransomware" && (
        <RansomewareIoc selectedMessage={selectedMessage} />
      )}
      {activeTab === "IOC" && selectedType === "breachforums" && (
        <BreachForumIoc selectedMessage={selectedMessage} />
      )}
      {activeTab === "Ai" && (
        <AIContainer channel_username="channel"></AIContainer>
      )}
      <div 
        className="flex-1 min-h-0 flex flex-col overflow-hidden"
        style={{ display: activeTab === "Chatbot" ? "flex" : "none" }}
      >
        <Chatbot />
      </div>
    </div>
  );
};

export default Sidebox;