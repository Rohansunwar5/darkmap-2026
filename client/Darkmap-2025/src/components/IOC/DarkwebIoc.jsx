import React from "react";

const DarkwebIoc = ({ selectedMessage }) => {
  if (!selectedMessage) {
    return (
      <div className="text-center">Select a message to view IOC details</div>
    );
  }

  // Parse the content field in case it's a JSON-like string
  const parseContent = (content) => {
    const regex = /"([^"]+)":\s*"([^"]*)"/g;
    let match;
    const result = {};

    while ((match = regex.exec(content)) !== null) {
      result[match[1]] = match[2];
    }

    return result;
  };

  const content = parseContent(selectedMessage.content || "{}");

  return (
    <div
      style={{ marginTop: "30px", padding: "20px 20px" }}
      className="text-white text-justify font-sans"
    >
      <div
        className="opacity-100 max-w-full"
        style={{
          boxShadow: "0px 2px 11px 0px #5bcbff2f",
          border: "1px solid #00adf0",
          padding: "30px 20px",
        }}
      >
        <span
          className="font-[Aldrich] text-[#00d1ff] bg-[#0b2530] rounded-sm text-justify text-xl"
          style={{ padding: "5px" }}
        >
          IOC - Tip
        </span>
        <div
          className="max-w-full flex flex-col gap-1.75 text-justify font-anek"
          style={{ marginTop: "30px", fontSize: "21px" }}
        >
          <div>
            Source:{" "}
            <span
              className="bg-[#0b2530] text-[#00d1ff] text-wrap rounded-md "
              style={{ padding: "2px " }}
            >
              Darkweb
            </span>
          </div>

          <div>
            Threat Actor:{" "}
            <span
              className="bg-[#0b2530] text-[#00d1ff] text-wrap rounded-md "
              style={{ padding: "2px " }}
            >
              {content.author || "N/A"}
            </span>
          </div>

          <div>
            Date:{" "}
            <span
              className="bg-[#0b2530] text-[#00d1ff] text-wrap rounded-md "
              style={{ padding: "2px " }}
            >
              {new Date(
                content["Detection Date"] || Date.now()
              ).toLocaleDateString()}
            </span>
          </div>

          <div>
            Source Name:{" "}
            <span
              className="bg-[#0b2530] text-[#00d1ff] text-wrap rounded-md "
              style={{ padding: "2px " }}
            >
              {content.Source || "Unknown"}
            </span>
          </div>

          <div>
            Attached Url:{" "}
            <span
              className="bg-[#0b2530] text-[#00d1ff] text-wrap rounded-md "
              style={{ padding: "2px " }}
            >
              {content.Url || "N/A"}
            </span>
          </div>

          <div>
            Attached File:{" "}
            <span
              className="bg-[#0b2530] text-[#00d1ff] text-wrap rounded-md "
              style={{ padding: "2px " }}
            >
              {content.File || "N/A"}
            </span>
          </div>

          {/* <div>
            Content:{" "}
            <span
              className="bg-[#0b2530] text-[#00d1ff] text-wrap rounded-md "
              style={{ padding: "2px " }}
            >
              {content.Content || "No content available"}
            </span>
          </div> */}
        </div>
      </div>
    </div>
  );
};

export default DarkwebIoc;
