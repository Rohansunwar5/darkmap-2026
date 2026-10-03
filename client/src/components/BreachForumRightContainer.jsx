import React from "react";
import DarkwebIcon from "../assets/darweb-forum.png";
import Box from "../assets/box1.png";
import "../styles/styles.css";

const BreachForumRightContent = ({ selectedMessage }) => {
  if (!selectedMessage) {
    return <div className="text-center">Select a message to view details</div>;
  }

  // Extract relevant parts of the message from the selectedMessage object
  const { description, link } = selectedMessage;
  const { timePart, contentPart } = description
    ? extractTime(description)
    : { timePart: "Unknown", contentPart: "No content available" };

  return (
    <>
      <div
        style={{ marginTop: "10px", padding: "20px 10px" }}
        className="text-white text-justify font-sans"
      >
        {selectedMessage ? (
          <>
            <div
              className="text-center font-[Aldrich]"
              style={{
                paddingBottom: "23px",
                fontSize: "15px",
                paddingTop: "10px",
              }}
            >
              <span className="text-[#00d1ff] font-bold">
                {selectedMessage.author || selectedMessage.user || "Threat Actor"}
              </span>{" "}
              sent a message on
              <span className="text-[#00d1ff] font-bold">
                {" "}
                {selectedMessage.source || "Darkweb-Forums"}
              </span>
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
                  src={DarkwebIcon}
                  alt="Darkweb"
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
                  {contentPart || "No Content available"}
                </div>
              </div>
              <div
                className="absolute text-[#00adf0] z-30 font-[Arimo]"
                style={{ bottom: "0px", right: "17px", fontSize: "11px" }}
              >
                {timePart || new Date(Date.now()).toLocaleString()}
              </div>
            </div>
            <div className="relative block w-full pb-6">
              <div className="absolute bottom-0 left-0 w-full h-0 border-b-2 border-dotted border-[#00c2ff42]"></div>
            </div>
            {/* Lower content */}
            <div
              className="text-left"
              style={{
                padding: "45px",
                color: "#00d1ff",
                textAlign: "left",
              }}
            >
              <div
                className="font-anek text-left"
                style={{
                  fontSize: "1.2rem",
                  lineHeight: "1.7rem",
                  fontWeight: "100",
                  wordBreak: "break-all",
                }}
              >
                <span className="text-white">Channel Url:</span>{" "}
                <a href={link} target="_blank" rel="noopener noreferrer" className="hover:underline break-all">
                  {link || "Unknown"}
                </a>
              </div>
              <div
                className="font-anek font-thin"
                style={{
                  fontSize: "1.2rem",
                  lineHeight: "1.7rem",
                  fontWeight: " 100",
                }}
              >
                <span className="text-white">Threat Actor :</span>{" "}
                {selectedMessage.author || selectedMessage.user || "Threat Actor"}
              </div>
              <div
                className="font-anek font-thin"
                style={{
                  fontSize: "1.2rem",
                  lineHeight: "1.7rem",
                  fontWeight: "100",
                }}
              >
                <span className="text-white">Date :</span>{" "}
                {timePart || new Date(Date.now()).toLocaleString()}
              </div>
            </div>
          </>
        ) : (
          <div className="text-center"> Select a message to view details</div>
        )}
      </div>
    </>
  );
};

// Helper function to extract time and content
const extractTime = (description) => {
  const timePart = description.split(" ... ")[0];
  const contentPart = description.split(" ... ").slice(1).join(" ... ");
  return { timePart, contentPart };
};

export default BreachForumRightContent;
