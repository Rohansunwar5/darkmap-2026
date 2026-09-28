import React from "react";
import Ransomware from "../../assets/ransomefeed.png";

const RansomewareBox = ({ data, searchQuery, onSelectMessage }) => {
  // Always work with an array
  const ransomwareData = Array.isArray(data) ? data : [];

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
    if (!text) return "";
    const words = text.split(" ");
    return words.length > 20
      ? words.slice(0, 20).join(" ") + "..."
      : words.join(" ");
  };

  return (
    <div>
      {ransomwareData.map((item, index) => (
        <div
          key={index}
          className="w-[77%] bg-transparent shadow-[0_2px_11px_0_#3ac1ff] ml-[20%] overflow-x-hidden"
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
              <img src={Ransomware} alt="" className="w-7 h-auto ml-1" />
              <span
                className="font-[Aldrich] text-[#a0ddff] mx-1.5 mb-[1.5px] "
                style={{ fontSize: "23px" }}
              >
                Ransomware
              </span>
            </div>
            <div
              className="text-[#dfd5d5] font-[Aldrich]  mt-0 "
              style={{
                fontSize: "13px",
                marginBottom: "5px",
                margin: "0px 5px",
              }}
            >
              Date: {item.attackdate ? new Date(item.attackdate).toLocaleString() : "Unknown"}
            </div>
            <div
              className="text-[#dfd5d5] font-[Aldrich]"
              style={{ margin: "2px 5px ", fontSize: "12px" }}
            >
              <span
                className="bg-[#ede4e4] rounded-md text-black"
                style={{ padding: "0px 4px", marginRight: "4px" }}
              >
                Criminal Group
              </span>
              <span className="text-[#ff0000]"> {item.group}</span> |
              <span
                className="bg-[#ede4e4] rounded-md text-black"
                style={{
                  padding: "0px 4px",
                  marginRight: "4px",
                  marginLeft: "5px",
                }}
              >
                Victim
              </span>
              <span className="text-[#ff0000]"> {item.victim}</span>
            </div>
            <div
              className="font-chakra text-white"
              style={{
                margin: "25px 5px",
                fontSize: "14px",
                overflow: "hidden",
              }}
              dangerouslySetInnerHTML={{
                __html: highlightQueryInText(item.description, searchQuery),
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export default RansomewareBox;