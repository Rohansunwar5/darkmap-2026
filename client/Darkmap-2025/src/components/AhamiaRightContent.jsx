import React from "react";
import AhamiaIcon from "../assets/darweb-forum.png";
import Box from "../assets/box1.png";
import "../styles/styles.css";

const AhamiaRightContent = ({ selectedMessage }) => {
  if (!selectedMessage) {
    return <div className="text-center">Select a message to view details</div>;
  }

  return (
    <>
      <div
        style={{ marginTop: "10px", padding: "20px 10px" }}
        className="text-white text-justify font-sans"
      >
        <div
          className="text-center font-[Aldrich]"
          style={{
            paddingBottom: "23px",
            fontSize: "15px",
            paddingTop: "10px",
          }}
        >
          <span className="text-[#00d1ff] font-bold">
            Darkweb Onion
          </span> site details
        </div>
        
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
            className="absolute z-20 flex flex-col items-start overflow-y-auto scrollbar-hidden"
            style={{
              top: "16px",
              left: "18px",
              right: "16px",
              bottom: "16px",
              overflowX: "hidden",
              paddingRight: "10px",
            }}
          >
            <div className="flex flex-row items-center mb-4">
              <img
                src={AhamiaIcon}
                alt="Ahamia"
                style={{ width: "28px", height: "28px" }}
              />
              <div
                className="font-[Arimo] font-bold text-[#00d1ff]"
                style={{ marginLeft: "15px", fontSize: "16px" }}
              >
                {selectedMessage.title || "No Title"}
              </div>
            </div>
            
            <div
              className="flex-1 font-[Arimo] font-thin text-white box-border overflow-wrap break-words normal-case"
              style={{
                fontSize: "14px",
                lineHeight: "1.5",
              }}
            >
              {selectedMessage.desc || "No Content available"}
            </div>
          </div>
          <div
            className="absolute text-[#00adf0] z-30 font-[Arimo]"
            style={{ bottom: "5px", right: "17px", fontSize: "11px" }}
          >
            {selectedMessage.last_seen || "N/A"}
          </div>
        </div>
        
        <div className="relative block w-full pb-6 pt-4">
          <div className="absolute bottom-0 left-0 w-full h-0 border-b-2 border-dotted border-[#00c2ff42]"></div>
        </div>
        
        <div
          style={{
            padding: "30px 45px",
            color: "#00d1ff",
          }}
        >
          <div
            className="font-anek"
            style={{
              fontSize: "1.2rem",
              lineHeight: "1.7rem",
              fontWeight: "100",
              wordBreak: "break-all",
              marginBottom: "15px"
            }}
          >
            <span className="text-white block mb-1">Site URL:</span>
            <a 
              href={selectedMessage.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:underline text-[#00d1ff]"
            >
              {selectedMessage.url || "Unknown"}
            </a>
          </div>
          
          <div
            className="font-anek font-thin"
            style={{
              fontSize: "1.2rem",
              lineHeight: "1.7rem",
              fontWeight: "100",
            }}
          >
            <span className="text-white">Last Updated:</span>{" "}
            {selectedMessage.last_seen || "N/A"}
          </div>
        </div>
      </div>
    </>
  );
};

export default AhamiaRightContent;
