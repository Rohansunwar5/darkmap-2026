import React, { useState } from "react";
import TelegramRightContent from "./TelegramRightContent";
import DarkwebRightContent from "./DarkwebRightContent";
import RightIoc from "./RightIoc";
import RansomewareRightContent from "./RansomewareRightContent";
import BreachForumRightContent from "./BreachForumRightContainer";
import AhamiaRightContent from "./AhamiaRightContent";
import TelegramIoc from "./IOC/TelegramIoc";
import DarkwebIoc from "./IOC/DarkwebIoc";
import RansomewareIoc from "./IOC/RansomewareIoc";
import BreachForumIoc from "./IOC/BreachForumIoc";

const Sidebox = ({ selectedMessage, selectedType }) => {
  const [activeTab, setActiveTab] = useState("Content");

  const handleTabClick = (tab) => {
    setActiveTab(tab);
  };

  return (
    <div
      className="tall-box-right block h-full border-t-2 border-transparent border-cyan-process overflow-auto fixed right-0 bg-gradient-to-b from-deep-blue-lighter to-deep-blue-darker via-deep-blue"
      style={{
        width: "29%",
        top: "5%",
        height: "100%",
        borderTop: "2px solid #00c3ff",
        scrollbarWidth: "none",
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
          className={`transition-all duration-250 font-sans text-white hover:cursor-pointer hover:text-red-600 ${
            activeTab === "Content" ? "text-red-600" : ""
          }`}
          onClick={() => handleTabClick("Content")}
        >
          Content
        </div>
        <div
          className={`ioc content transition-all duration-250 font-sans text-white hover:cursor-pointer hover:text-red-600 ${
            activeTab === "IOC" ? "text-red-600" : ""
          }`}
          onClick={() => handleTabClick("IOC")}
        >
          IOC (Indicator of Compromise)
        </div>
      </div>
      {activeTab === "Content" && selectedType === "telegram" && (
        <TelegramRightContent selectedMessage={selectedMessage} />
      )}
      {activeTab === "Content" && selectedType === "darkweb" && (
        <DarkwebRightContent selectedMessage={selectedMessage} />
      )}
      {activeTab === "Content" && selectedType === "ransomware" && (
        <RansomewareRightContent selectedMessage={selectedMessage} />
      )}
      {activeTab === "Content" && selectedType === "breachforums" && (
        <BreachForumRightContent selectedMessage={selectedMessage} />
      )}
      {activeTab === "Content" && selectedType === "ahamia" && (
        <AhamiaRightContent selectedMessage={selectedMessage} />
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
    </div>
  );
};

export default Sidebox;
