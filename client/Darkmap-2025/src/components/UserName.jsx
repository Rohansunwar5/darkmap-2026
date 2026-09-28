import React, { useEffect, useState } from "react";
import TgDev from "./MessageBox/TgDev";

const UserName = ({searchResults}) => {
  
  return (
    <div className="ml-[25px] w-[70%]">
      <TgDev searchResults={searchResults} />
    </div>
  );
};

export default UserName;
