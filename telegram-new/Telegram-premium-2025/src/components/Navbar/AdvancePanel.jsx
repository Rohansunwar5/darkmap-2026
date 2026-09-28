import React from "react";
import Vec from "../../assets/advance_panel.png";
import PanelLogo from "../../assets/dmap.webp";

const AdvancePanel = ({ isOpen, togglePanel }) => {
  if (!isOpen) return null;

  return (
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
        <div className="flex items-center justify-between" style={{ height: "50px" }}>
          <img id="left-img" src={Vec} style={{ width: "40px" }} />
          <div
            className="font-almarai flex-grow text-left"
            style={{ color: "#bebebe", padding: "0 15px", fontSize: "13px" }}
          >
            "Add customized queries to maximize your potential output"
          </div>
          <div className="flex items-center justify-between mr-[-20px] w-[150px]">
            <div
              id="advance-panel-next-button"
              className="transistion-all duration-250 bg-gray-500 w-[70px] flex items-center justify-center rounded-md h-[30px] hover: cursor-not-allowed"
            >
              {">"}
            </div>
            <img src={PanelLogo} alt="" style={{ width: "40px" }} />
          </div>
        </div>
        <div
          className="flex w-full"
          style={{ height: "70%", borderRadius: "inherit", paddingTop: "30px", paddingRight: "20px" }}
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
                className="col-start-6 col-span-7 p-2 outline-none text-black"
                placeholder=""
                style={{
                  background: "#010a13",
                  border: "1px dotted #00d1ff",
                  borderRadius: "5px",
                }}
              />
            </div>
            {/* Repeat for other input fields */}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdvancePanel;