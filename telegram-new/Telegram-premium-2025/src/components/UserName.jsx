import React from "react";
import TgDev from "./MessageBox/TgDev";

const UserName = ({ searchResults, nearbyData, setTelegramMessages, setSelectedGroup }) => {
  return (
    <div>
      <TgDev 
        searchResults={searchResults}
        nearbyData={nearbyData}
        setSelectedGroup={setSelectedGroup}
      />
    </div>
  );
};

export default UserName;