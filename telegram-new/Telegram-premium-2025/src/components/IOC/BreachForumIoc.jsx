import React from "react";

const BreachForumIoc = ({ selectedMessage }) => {
  if (!selectedMessage) {
    return (
      <div className="text-center">Select a message to view IOC details</div>
    );
  }

  // Extract time and content from description
  const extractTime = (description) => {
    const timePart = description.split(" ... ")[0];
    const contentPart = description.split(" ... ").slice(1).join(" ... ");
    return { timePart, contentPart };
  };

  const { timePart, contentPart } = extractTime(selectedMessage.description);

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
          Ioc - Tip
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
              Breach Forums
            </span>
          </div>

          <div>
            Posted Date:{" "}
            <span
              className="bg-[#0b2530] text-[#00d1ff] text-wrap rounded-md "
              style={{ padding: "2px " }}
            >
              {timePart || "N/A"}
            </span>
          </div>

          <div>
            Author:{" "}
            <span
              className="bg-[#0b2530] text-[#00d1ff] text-wrap rounded-md "
              style={{ padding: "2px " }}
            >
              {selectedMessage.author || "N/A"}
            </span>
          </div>

          <div>
            Content:{" "}
            <span
              className="bg-[#0b2530] text-[#00d1ff] text-wrap rounded-md "
              style={{ padding: "2px " }}
            >
              {contentPart || "No content available"}
            </span>
          </div>

          <div>
            Link:{" "}
            <a
              href={selectedMessage.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#00d1ff]"
            >
              {selectedMessage.link || "No link available"}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BreachForumIoc;
