import React from "react";
import TelegramIcon from "../assets/teledark.png";
import Icon from "../assets/ss-icon.png";
import Box from "../assets/box1.png";

const TelegramRightContent = ({
  selectedMessage,
  searchQuery,
  preloadedImageUrl,
  userRole,
}) => {
  if (!selectedMessage) {
    return <div className="text-center">Select a message to view details</div>;
  }

  // Function to check if channel name is empty or just whitespace
  const isChannelNameEmpty = (channelName) => {
    return !channelName || channelName.trim() === "";
  };

  // Function to generate fake channel names for premium content
  const generateFakeChannelName = () => {
    return "Ultra ☠️ V9";
  };

  const isPremiumContent = isChannelNameEmpty(selectedMessage.channel_name);
  const displayChannelName = isPremiumContent 
    ? generateFakeChannelName() 
    : selectedMessage.channel_name;

  const isUltraV9 = 
    (displayChannelName && displayChannelName.includes("Ultra")) ||
    (selectedMessage.link && selectedMessage.link.includes("Ultra")) ||
    (selectedMessage.message_link && selectedMessage.message_link.includes("Ultra"));

  const resolvedLink = (isPremiumContent || isUltraV9)
    ? "https://t.me/+n5TvqJF9DExhN2Y8" 
    : (selectedMessage.link || `https://t.me/${displayChannelName}`);
    
  const resolvedMessageLink = (isPremiumContent || isUltraV9)
    ? "https://t.me/+n5TvqJF9DExhN2Y8" 
    : (selectedMessage.message_link || selectedMessage.link || `https://t.me/${displayChannelName}`);

  // const searchIndex =
  //   selectedMessage.text && searchQuery
  //     ? selectedMessage.text.toLowerCase().indexOf(searchQuery.toLowerCase())
  //     : -1;
  let truncatedText = searchQuery;

  // if (searchIndex !== -1) {
  //   const words = selectedMessage.text.split(" ");
  //   const queryWords = searchQuery.split(" ");
  //   const queryStartIndex = words.findIndex((word) =>
  //     word.toLowerCase().includes(queryWords[0].toLowerCase())
  //   );
  //
  //   if (queryStartIndex !== -1 && queryStartIndex < words.length - 1) {
  //     truncatedText = words
  //       .slice(queryStartIndex, queryStartIndex + queryWords.length + 1)
  //       .join(" ");
  //   }
  // }

  let telegramPath = selectedMessage.channel_name;
  if (selectedMessage.message_id) {
    telegramPath = `${selectedMessage.channel_name}/${selectedMessage.message_id}`;
  } else if (selectedMessage.link && selectedMessage.link.includes("t.me/")) {
    const urlParts = selectedMessage.link.split("t.me/");
    if (urlParts.length > 1) {
      telegramPath = urlParts[1];
      if (telegramPath.startsWith("s/")) {
        telegramPath = telegramPath.substring(2);
      }
    }
  }

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
                paddingTop: "10px",
                paddingBottom: "33px",
                fontSize: "15px",
              }}
            >
              <span className="text-[#00d1ff] font-bold">person</span> sent a
              message on
              <span 
              className={
                userRole === "test" || isPremiumContent
                  ? "normal-class text-[#ff0000] font-bold" 
                  : "premium-class text-[#ff0000] font-bold"
              }
              style={{
                filter: isPremiumContent ? "blur(2px)" : "none",
                textShadow: isPremiumContent ? "0 0 3px #ff0000" : "none",
                opacity: isPremiumContent ? 0.8 : 1,
                marginLeft: "5px"
              }}
            >
              <a 
                href={resolvedLink} 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {displayChannelName}
              </a>
              {isPremiumContent && (
                <span 
                  className="ml-1 text-xs"
                  style={{ 
                    color: "#ff6b6b", 
                    filter: "none",
                    opacity: 1 
                  }}
                >
                  🔒
                </span>
              )}
            </span>
            </div>
            <div
              className="relative overflow-hidden cursor-pointer"
              style={{
                width: "85%",
                height: "340px",
                marginLeft: "35px",
              }}
              onClick={() => window.open(resolvedMessageLink, '_blank')}
            >
              <img
                src={Box}
                alt="Chat box"
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
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(resolvedMessageLink, '_blank');
                }}
              >
                <img
                  src={TelegramIcon}
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
                  {selectedMessage.text}
                </div>
              </div>
              <div
                className="absolute  text-[#00adf0] z-30 font-[Arimo]"
                style={{ bottom: "0px", right: "17px", fontSize: "11px" }}
              >
                {new Date(selectedMessage.date).toLocaleTimeString()}
              </div>
            </div>
            <div className="relative block w-full pb-6">
              <div className="absolute bottom-0 left-0 w-full h-0 border-b-2 border-dotted border-[#00c2ff42]"></div>
            </div>
            {/* Screenshot preview  */}
            <div
              className="relative bg-[#0094FF1C] flex rounded-2xl justify-center items-center overflow-hidden text-white shadow-md cursor-pointer"
              style={{
                marginLeft: "30px",
                marginTop: "20px",
                height: "315px",
                border: "1px solid #126382",
                padding: "19px",
                width: "89%",
                boxShadow: "0 4px 8px rgba(0, 0, 0, 0.2);",
              }}
              onClick={() => window.open(resolvedMessageLink, '_blank')}
            >
              <div
                className="absolute left-0 w-full text-center box-border font-[Aldrich] text-[#00d1ff]"
                style={{ top: "1%", padding: "5px 0" }}
              >
                <img
                  src={Icon}
                  alt="chat preview"
                  style={{
                    maxWidth: "100%",
                    maxHeight: "100%",
                    cursor: "pointer",
                    top: "45%",
                    left: "12px",
                    width: "18px",
                    height: "15px",
                  }}
                  className="absolute "
                />
                <span style={{ fontSize: "13px" }}>Chat Preview</span>
              </div>
              <img
                src={
                  preloadedImageUrl ||
                  `https://screenshot.darkmap.org/screenshot?url=https://t.me/s/${telegramPath}${truncatedText ? `?q=${truncatedText}` : ""}`
                }
                alt="Telegram screenshot"
                className="max-w-full max-h-full object-cover cursor-pointer"
                style={{ marginTop: "20px", width: "90%", height: "90%" }}
              />
            </div>
          </>
        ) : (
          <div className="text-center">Select a message to view details</div>
        )}
      </div>
    </>
  );
};

export default TelegramRightContent;