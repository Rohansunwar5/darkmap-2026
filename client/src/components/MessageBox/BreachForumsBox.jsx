import React from "react";
import BreachForums from "../../assets/darweb-forum.png";

const BreachForumsBox = ({ data, searchQuery, onSelectMessage }) => {
  const items = Array.isArray(data) ? data : [];

  const extractTime = (description) => {
    const timePart = description.split(" ... ")[0];
    const contentPart = description.split(" ... ").slice(1).join(" ... ");
    return { timePart, contentPart };
  };

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
    if (!text) return "No content available"; // Handle undefined or empty text
    const words = text.split(" ");
    return words.length > 20
      ? words.slice(0, 20).join(" ") + "..."
      : words.join(" ");
  };

  return (
    <div>
      {items.map((item, index) => {
        const { timePart, contentPart } = extractTime(item.description);
        return (
          <div
            key={index}
            className="w-[77%] bg-transparent shadow-[0_2px_11px_0_#3ac1ff] ml-[20%]"
            onClick={() => onSelectMessage(item)}
            style={{ border: "1.8px solid #3ac1ff", marginTop: "19px" }}
          >
            <div className="p-1.5 bg-[#04121ae5]">
              <div
                className="flex items-center font-bebas-neue gap-0.5 text-white"
                style={{
                  paddingBottom: "0px",
                  fontSize: "28px",
                  margin: "0px 5px ",
                }}
              >
                Source
                <img src={BreachForums} alt="" className="w-7 h-auto ml-1" />
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
                Posted : {timePart}
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
                <span className="text-[#ff0000]"> Breach Forums</span> |
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
                <span className="text-[#ff4d4d] font-semibold"> {item.author || item.user || item.username || "Threat Actor"}</span>
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
                    contentPart || "No content available",
                    searchQuery
                  ),
                }}
              />
              <div
                className="font-chakra text-white"
                style={{ margin: "25px 5px", fontSize: "14px" }}
              >
                <a href={item.link} target="_blank" rel="noopener noreferrer">
                  {item.link}
                </a>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default BreachForumsBox;
