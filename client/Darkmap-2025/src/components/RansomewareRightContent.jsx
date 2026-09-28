import React from "react";
import RansomeFeedIcon from "../assets/ransomefeed.png";
import Box from "../assets/box1.png";
import "../styles/styles.css";

// Helper to normalize empty or missing fields to "N/A"
function naIfEmpty(val) {
  if (val === undefined || val === null) return "N/A";
  if (typeof val === "string" && val.trim() === "") return "N/A";
  return val;
}

function mapRansomwareMessage(item) {
  if (!item) return null;
  return {
    description: naIfEmpty(item.description),
    discovered: naIfEmpty(item.attackdate),
    group_name: naIfEmpty(item.group),
    website: naIfEmpty(item.victim),
    url: naIfEmpty(item.url),
    screenshot: naIfEmpty(item.screenshot),
    work_sector: naIfEmpty(item.work_sector),
  };
}

const RansomewareRightContent = ({ selectedMessage }) => {
  // If no message is selected
  if (!selectedMessage) {
    return <div className="text-center">Select a message to view details</div>;
  }

  // Map the ransomware API fields to the expected display fields
  const displayData = mapRansomwareMessage(selectedMessage);

  return (
    <>
      <div
        style={{ marginTop: "10px", padding: "20px 10px" }}
        className="text-white text-justify font-sans"
      >
        <div
          className="relative overflow-hidden"
          style={{
            width: "85%",
            height: "340px",
            marginLeft: "35px",
          }}
        >
          <img
            src={Box}
            alt="Chat Box"
            className="absolute w-full h-full z-10"
          />
          <div
            className="absolute z-20 flex flex-row items-start overflow-y-auto scrollbar-hidden"
            style={{
              top: "16px",
              left: "18px",
              right: "16px",
              bottom: "16px",
              overflowX: "hidden",
            }}
          >
            <img
              src={RansomeFeedIcon}
              alt="Ransome"
              className="align-start"
              style={{ width: "28px", height: "28px" }}
            />
            <div
              className="flex-1 font-[Arimo] font-thin text-white box-border overflow-wrap break-words normal-case"
              style={{
                marginLeft: "20px",
                marginTop: "-2px",
                paddingRight: "10px",
                fontSize: "16px",
              }}
            >
              {displayData.description}
            </div>
          </div>
          <div
            className="absolute  text-[#00adf0] z-30 font-[Arimo]"
            style={{ bottom: "0px", right: "17px", fontSize: "11px" }}
          >
            {displayData.discovered !== "N/A" && displayData.discovered !== ""
              ? new Date(displayData.discovered).toLocaleString()
              : "N/A"}
          </div>
        </div>
        <div className="relative block w-full pb-6">
          <div className="absolute bottom-0 left-0 w-full h-0 border-b-2 border-dotted border-[#00c2ff42]"></div>
        </div>
        {/* Lower content */}
        <div
          style={{
            padding: "45px",
            color: "#00d1ff",
          }}
        >
          <div
            className="font-anek "
            style={{
              fontSize: "1.2rem",
              lineHeight: "1.7rem",
              fontWeight: "100",
            }}
          >
            <span className="text-white">Criminal Group :</span>{" "}
            {displayData.group_name}
          </div>
          <div
            className="font-anek "
            style={{
              fontSize: "1.2rem",
              lineHeight: "1.7rem",
              fontWeight: "100",
            }}
          >
            <span className="text-white">Website :</span>{" "}
            {displayData.website}
          </div>
          <div
            className="font-anek "
            style={{
              fontSize: "1.2rem",
              lineHeight: "1.7rem",
              fontWeight: "100",
            }}
          >
            <span className="text-white">Post Url :</span>{" "}
            <span>{displayData.url}</span>
          </div>
          <div
            className="font-anek "
            style={{
              fontSize: "1.2rem",
              lineHeight: "1.7rem",
              fontWeight: "100",
            }}
          >
            <span className="text-white">Work Sector :</span>
            {displayData.work_sector}
          </div>
          <div
            className="font-anek "
            style={{
              fontSize: "1.2rem",
              lineHeight: "1.7rem",
              fontWeight: "100",
            }}
          >
            <span className="text-white">Date :</span>{" "}
            {displayData.discovered !== "N/A" && displayData.discovered !== ""
              ? new Date(displayData.discovered).toLocaleString()
              : "N/A"}
          </div>
        </div>
      </div>
    </>
  );
};

export default RansomewareRightContent;