              import React from "react";
import DarwebForum from "../../assets/darweb-forum.png";

const parseContent = (content) => {
  const regex = /"([^"]+)":\s*"([^"]*)"/g;
  let match;
  const result = {};

  while ((match = regex.exec(content)) !== null) {
    result[match[1]] = match[2];
  }

  return result;
};

const DarwebForumsBox = ({ data, searchQuery, onSelectMessage }) => {
  // Ensure data is an array - either use the data prop directly or access the data property
  const items = Array.isArray(data) ? data : data?.data || [];
  
  const highlightQueryInText = (text, query) => {
    if (!query || !text) return truncateToFirst20Words(text);

    const queryIndex = text.toLowerCase().indexOf(query.toLowerCase());
    if (queryIndex === -1) {
      return truncateToFirst20Words(text);
    }

    const wordsBefore = text.slice(0, queryIndex).split(" ");
    const wordsAfter = text.slice(queryIndex + query.length).split(" ");

    const truncatedText =
      (wordsBefore.length > 10 ? "..." : "") +
      wordsBefore.slice(-10).join(" ") +
      " " +
      text.slice(queryIndex, queryIndex + query.length) +
      " " +
      wordsAfter.slice(0, 10).join(" ") +
      (wordsAfter.length > 10 ? "..." : "");

    const highlightedText = truncatedText.replace(
      new RegExp(`(${query})`, "gi"),
      `<span style="background-color: #00316B;">$1</span>`
    );

    return highlightedText;
  };

  const truncateToFirst20Words = (text) => {
    if (!text) return "No content available";
    const words = text.split(" ");
    return words.length > 20
      ? words.slice(0, 20).join(" ") + "..."
      : words.join(" ");
  };

  if (!items.length) {
    return <div className="text-white p-4"></div>;
  }

  return (
    <div>
      {items.map((item, index) => {
        const content = parseContent(item.content || "{}");
        return (
          <div
            key={index}
            className="w-[77%] bg-transparent shadow-[0_2px_11px_0_#3ac1ff] ml-[20%]"
            onClick={() => onSelectMessage(item)}
            style={{ border: "1.8px solid #3ac1ff", marginTop: "19px" }}
          >
            {/* Rest of your component remains the same */}
            <div className="p-1.5 bg-[#04121ae5]">
              <div className="flex items-center font-bebas-neue gap-0.5 text-white"
                style={{
                  paddingBottom: "0px",
                  fontSize: "28px",
                  margin: "0px 5px ",
                }}
              >
                Source
                <img src={DarwebForum} alt="" className="w-7 h-auto ml-1" />
                <span
                  className="font-[Aldrich] text-[#a0ddff] mx-1.5 mb-[1.5px]"
                  style={{ fontSize: "23px" }}
                >
                  Darkweb-Forums
                </span>
              </div>
              <div
                className="text-[#dfd5d5] font-[Aldrich] mt-0"
                style={{
                  fontSize: "13px",
                  marginLeft: "5px",
                  margin: "0px 5px",
                }}
              >
                Date:{" "}
                {new Date(
                  content["Detection Date"] || Date.now()
                ).toLocaleString()}
              </div>
              <div
                className="text-[#dfd5d5] font-[Aldrich]"
                style={{ margin: "2px 5px", fontSize: "12px" }}
              >
                <span
                  className="bg-[#ede4e4] rounded-md text-black"
                  style={{ padding: "0px 4px", marginRight: "4px" }}
                >
                  Source
                </span>
                <span className="text-[#ff0000]">
                  {" "}
                  {"hidden"}
                </span>{" "}
                |
                <span
                  className="bg-[#ede4e4] rounded-md text-black"
                  style={{
                    padding: "0px 4px",
                    marginRight: "4px",
                    marginLeft: "5px",
                  }}
                >
                  Author
                </span>
                <span className="text-[#ff0000]">
                  {" "}
                  {content.author || "N/A"}
                </span>
              </div>
              <div
                className="font-chakra text-white"
                style={{
                  margin: "25px 5px",
                  fontSize: "14px",
                  overflow: "hidden",
                }}
                dangerouslySetInnerHTML={{
                  __html: highlightQueryInText(
                    content.Content || "No content available",
                    searchQuery
                  ),
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DarwebForumsBox;
