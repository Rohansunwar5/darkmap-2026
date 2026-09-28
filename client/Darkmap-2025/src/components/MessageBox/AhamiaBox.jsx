import React, { useState } from "react";
import DarwebForum from "../../assets/darweb-forum.png";

const AhamiaBox = ({ data, searchQuery, onSelectMessage }) => {
  const [visibleCount, setVisibleCount] = useState(100);
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

  if (!data || !data.length) {
    return null;
  }

  return (
    <div>
      {data.slice(0, visibleCount).map((item, index) => {
        return (
          <div
            key={index}
            className="w-[77%] bg-transparent shadow-[0_2px_11px_0_#3ac1ff] ml-[20%] cursor-pointer"
            onClick={() => onSelectMessage && onSelectMessage("ahamia", item)}
            style={{ border: "1.8px solid #3ac1ff", marginTop: "19px" }}
          >
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
                  Darkweb Onion
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
                Last updated : {item.last_seen || "N/A"}
              </div>
              <div
                className="font-[Aldrich] flex items-center overflow-hidden"
                style={{ margin: "10px 5px" }}
              >
                <span style={{ fontSize: "14px", color: "#00d1ff", whiteSpace: "nowrap" }}>
                  {item.title}
                </span>
                <span style={{ color: "white", margin: "0 8px" }}> | </span>
                <span
                  className="font-chakra text-white text-sm"
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    display: "inline-block",
                    maxWidth: "70%"
                  }}
                  dangerouslySetInnerHTML={{
                    __html: highlightQueryInText(
                      item.desc || "No content available",
                      searchQuery
                    ),
                  }}
                />
              </div>
              <div
                className="text-[#dfd5d5] font-[Aldrich] mt-0"
                style={{
                  fontSize: "13px",
                  margin: "18px 5px 15px 5px",
                  wordBreak: "break-all"
                }}
              >
              {item.url || "N/A"}
              </div>
            </div>
          </div>
        );
      })}

      {visibleCount < data.length && (
        <button
          className="text-white mt-5 p-2 px-6 rounded-lg transition-colors bg-blue-500 hover:bg-blue-600"
          style={{ display: "block", margin: "20px auto" }}
          onClick={() => setVisibleCount((prev) => prev + 100)}
        >
          View More
        </button>
      )}
    </div>
  );
};

export default AhamiaBox;
