import React from "react";
import DarkwebIcon from "../assets/darweb-forum.png";
import Box from "../assets/box1.png";
import "../styles/styles.css";

const parseContent = (content) => {
  const regex = /"([^"]+)":\s*"([^"]*)"/g;
  let match;
  const result = {};

  while ((match = regex.exec(content)) !== null) {
    result[match[1]] = match[2];
  }

  return result;
};

const replaceLeakbaseDomains = (text) => {
  if (!text) return text;
  return text
    .replace(/leakbase\.io/g, 'leakbase.la')
    .replace(/leakbase\.cc/g, 'leakbase.la');
};

const DarkwebRightContent = ({ selectedMessage }) => {
  if (!selectedMessage) {
    return <div className="text-center">Select a message to view details</div>;
  }

  // Parse the content string into an object
  const parsedContent = parseContent(selectedMessage.content || "{}");

  // Replace leakbase domains in author and source
  const processedAuthor = replaceLeakbaseDomains(parsedContent.author);
  const processedSource = replaceLeakbaseDomains(parsedContent.Source);

  return (
    <>
      <div
        style={{ marginTop: "10px", padding: "20px 10px" }}
        className="text-white text-justify font-sans"
      >
        {parsedContent ? (
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
                {processedAuthor || "Person"}
              </span> sent a message on
              <span className="text-[#00d1ff] font-bold">
              {" "}<a href={processedSource}>
                  {processedSource || "Unknown"}
                </a>
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
                  {parsedContent.Content || "No Content available"}
                </div>
              </div>
              <div
                className="absolute  text-[#00adf0] z-30 font-[Arimo]"
                style={{ bottom: "0px", right: "17px", fontSize: "11px" }}
              >
                {new Date(
                  parsedContent["Detection Date"] || Date.now()
                ).toLocaleString()}
              </div>
            </div>
            <div className="relative block w-full pb-6">
              <div className="absolute bottom-0 left-0 w-full h-0 border-b-2 border-dotted border-[#00c2ff42]"></div>
            </div>
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
                <span className="text-white">Channel Url:</span>{" "}
                <a href={processedSource}>
                  {processedSource || "Unknown"}
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
                {processedAuthor || "Person"}
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
                {new Date(
                  parsedContent["Detection Date"] || Date.now()
                ).toLocaleString()}
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

export default DarkwebRightContent;