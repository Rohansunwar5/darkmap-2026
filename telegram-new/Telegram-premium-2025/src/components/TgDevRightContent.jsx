import React, { useEffect, useState } from "react";
import TelegramIcon from "../assets/teledark.png";
import Box from "../assets/box1.png";
import socialMediaLinks from "../constants/SocialLinks";
import { useTelegramContext } from "../context/TelegramContext";
import social1 from '../assets/social-icons/google.png'
import social2 from '../assets/social-icons/x.png'
import social3 from '../assets/social-icons/fb.png'
import social4 from '../assets/social-icons/threads.png'
import social5 from '../assets/social-icons/ig.png'
import image1 from '../assets/preloader/loader.gif'
import { useChannel } from "../context/ChannelContext";
import MiniVisualizer from "./Visualizer/MiniVisualizer";

const TgDevRightContent = ({ selectedGroup, searchQuery, socialProfiles, setIsVisualizerOpen, searchResults }) => {

  const { channelName } = useChannel();
  const [isLoading, setIsLoading] = useState(false);
  const { telegramMessages } = useTelegramContext();
  console.log("text", telegramMessages);
  

  const dummyGroup = {
    username: searchQuery || "dummy_group",
    title: "Sample Group Title",
    date_updated: new Date().toISOString(),
  };

  useEffect(() => {
    // Only set loading when we have a searchQuery but no socialProfiles yet
    if (searchQuery && socialProfiles === null) {
      setIsLoading(true);
    }
  }, [searchQuery, socialProfiles]);

  
  useEffect(() => {
    // When socialProfiles updates (either data or empty array), hide loader
    if (socialProfiles !== null) {
      setIsLoading(false);
    }
  }, [socialProfiles]);

  // Use selectedGroup if available, otherwise fallback to dummyGroup
  const group = selectedGroup || dummyGroup;

  // Replace placeholders in social media links
  const updatedSocialMediaLinks = socialMediaLinks.map(link => ({
    ...link,
    url: link.url.replace("{}", searchQuery)
  }));

  

  return (
    <div style={{ marginTop: "10px", padding: "20px 10px", display: "flex", flexDirection: "column", height: "calc(100% - 10px)" }} className="text-white text-justify font-sans">
      {group ? (
        <>
          {/* Cross Platform Correlation Header */}
          <div className="text-center font-[Aldrich] text-[#00d1ff] mb-2" style={{ fontSize: "15px" }}>
            <span className="text-[#00D1FF] bg-[#0B2530] font-bold p-2">Cross Platform Correlation</span>
          </div>

          {/* Social Media Links Section */}
          <div
            className="relative bg-[#0002025E] flex flex-col rounded-md justify-center items-center overflow-hidden text-white shadow-md"
            style={{
              marginLeft: "30px",
              marginTop: "20px",
              height: "280px",
              border: "1px solid #126382",
              padding: "19px",
              width: "89%",
              boxShadow: "0 4px 8px rgba(0, 0, 0, 0.2)",
            }}
          >
            {isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                <img 
                  src={image1} 
                  alt="Loading social profiles..." 
                  className="w-25 h-16"
                />
              </div>
            ) : null}
            <div
              className="flex justify-center items-center space-x-4"
              style={{
                position: "absolute",
                top: "5%",
                left: "50%",
                transform: "translateX(-50%)",
                }}
            >
               <a href="https://instagram.com/3iindownacker333" target="_blank" rel="noopener noreferrer">
                     <img
                       src={social1} 
                       alt="Goggle"
                       className="w-5 h-6 hover:opacity-75" // Adjust size as needed
                     />
                   </a>
                   <a href="https://x.com/3iindownacker333" target="_blank" rel="noopener noreferrer">
                     <img
                       src={social2}
                       alt="Twitter"
                       className="w-6 h-6 hover:opacity-75" // Adjust size as needed
                     />
                   </a>
                   <a href="https://facebook.com/3iindownacker333" target="_blank" rel="noopener noreferrer">
                     <img
                       src={social3}
                       alt="Facebook"
                       className="w-10 h-6 hover:opacity-75" // Adjust size as needed
                     />
                   </a>
                   <a href="https://bandlab.com/3iindownacker333" target="_blank" rel="noopener noreferrer">
                     <img
                       src={social4}
                       alt="threads"
                       className="w-6 h-6 hover:opacity-75" // Adjust size as needed
                     />
                   </a>
                   <a href="https://discord.com/3iindownacker333" target="_blank" rel="noopener noreferrer">
                     <img
                       src={social5}
                       alt="Instagram"
                       className="w-6 h-5 hover:opacity-75" // Adjust size as needed
                     />
                   </a>

                </div>
                  {/* Social Media Links List */}
                    <div 
                    className="w-full mt-16 overflow-y-auto scrollbar-hidden font-sans"
                    style={{ height: "70%" }}
                  >
                    {socialProfiles === null ? (
                  <div className="flex items-center justify-center h-full">
                    {/* This will show nothing when loading (since we have the overlay loader) */}
                  </div>
                ) : socialProfiles.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    No social profiles found
                  </div>
                ) : (

                  <div className="grid grid-cols-2 gap-x-3 w-full">
                    {/* Column 1: Site Names */}
                    <div className="flex flex-col space-y-3 text-left pl-8 font-medium">
                      {socialProfiles.map((link, index) => (
                        <div key={`site-${index}`} className="text-white text-xs whitespace-nowrap">
                          {link.site}
                        </div>
                      ))}
                    </div>

                    {/* Column 2: URLs */}
                    <div className="flex flex-col space-y-3">
                      {socialProfiles.map((link, index) => {
                        const displayUrl = link.url.length > 20 
                          ? `${link.url.substring(0, 25)}...` 
                          : link.url;
                          
                        return (
                          <a
                            key={`url-${index}`}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#00C2FF] hover:text-[#ff0000] text-xs whitespace-nowrap overflow-hidden text-ellipsis"
                            title={link.url} 
                          >
                            {displayUrl}
                          </a>
                        );
                      })}
                    </div>
                    
              </div>
                )}
            </div>
          </div>

          {/* Divider */}
          <div className="relative block w-full pb-6">
            <div className="absolute bottom-0 left-0 w-full h-0 border-b-2 border-dotted border-[#00c2ff42]"></div>
          </div>

          {/* Messages Section Header */}
          <div
            className="text-center font-[Aldrich]"
            style={{ paddingTop: "25px", paddingBottom: "20px", fontSize: "15px" }}
          >
            <span className="text-[#00D1FF] bg-[#0B2530] font-bold p-2">Messages</span>
          </div>

          {/* Message Display Box */}
          <div className="relative" style={{ 
            width: "85%", 
            height: "80px", 
            marginLeft: "35px",
            marginBottom: "10px"
          }}>
            <div style={{
              width: "100%",
              height: "100%",
              border: "1px solid #126382",
              borderRadius: "16px 16px 16px 0",
              background: "linear-gradient(0deg, #000B14 0%, #001A2C 100%)",
              boxShadow: "0 4px 15px rgba(0, 0, 0, 0.4)",
              position: "relative",
              overflow: "hidden"
            }}>
              <div
                className="absolute z-20 flex flex-row items-start overflow-y-auto scrollbar-hidden"
                style={{ top: "16px", left: "18px", right: "16px", bottom: "16px", overflowX: "hidden" }}
              >
                <img src={TelegramIcon} className="align-start" style={{ width: "26px", height: "26px" }} />
                <div  className="flex-1 font-[Arimo] font-thin text-white box-border overflow-wrap break-words normal-case"
                  style={{ marginLeft: "20px", marginTop: "-2px", paddingRight: "10px", fontSize: "16px" }}>
                  {(() => {
                    const messagesList = Array.isArray(telegramMessages) 
                      ? telegramMessages 
                      : telegramMessages?.messages || telegramMessages?.messages_info || telegramMessages?.data || [];
                    
                    return messagesList.length > 0 ? (
                      messagesList.map((message, index) => (
                        <div key={index} className="message">
                          <p>{typeof message === 'string' ? message : (message.text || message.message || JSON.stringify(message))}</p>
                        </div>
                      ))
                    ) : (
                      <p>No messages available for {selectedGroup?.title || 'this group'}</p>
                    );
                  })()}
                </div>
              </div>
              <div
                className="absolute text-[#00adf0] z-30 font-[Arimo]"
                style={{ bottom: "0px", right: "17px", fontSize: "11px" }}
              >
                Last Updated: {(() => {
                  const messagesList = Array.isArray(telegramMessages) 
                    ? telegramMessages 
                    : telegramMessages?.messages || telegramMessages?.messages_info || telegramMessages?.data || [];
                  
                  return messagesList.length > 0 && messagesList[messagesList.length - 1]?.date
                    ? new Date(messagesList[messagesList.length - 1].date).toLocaleDateString()
                    : group.date_updated 
                      ? new Date(group.date_updated).toLocaleDateString()
                      : "N/A";
                })()}
              </div>
            </div>
            {/* Chat bubble tail */}
            <div style={{
              position: "absolute",
              bottom: "-8px",
              left: "0px",
              width: "0",
              height: "0",
              borderStyle: "solid",
              borderWidth: "10px 10px 0 0",
              borderColor: "#126382 transparent transparent transparent",
              zIndex: "10"
            }}></div>
            <div style={{
              position: "absolute",
              bottom: "-6px",
              left: "1px",
              width: "0",
              height: "0",
              borderStyle: "solid",
              borderWidth: "9px 9px 0 0",
              borderColor: "#000B14 transparent transparent transparent",
              zIndex: "11"
            }}></div>
          </div>

          {/* Mini Visualizer Section */}
          <div className="flex justify-center mt-6" style={{ width: "89%", marginLeft: "30px", flex: "1 1 300px", minHeight: "300px" }}>
            <MiniVisualizer 
              data={searchResults} 
              onExpand={() => setIsVisualizerOpen(true)} 
            />
          </div>

          {/* Telegram Group Link */}
          <div className="text-center font-[Aldrich] text-[#00C2FF] mt-5" style={{ fontSize: "13px" }}>
            Telegram Group :{" "}
            <a
              href={`https://telegram.me/${channelName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#D40303] hover:text-[#ff0000]"
            >
              https://telegram.me/{channelName}
            </a>
          </div>
        </>
      ) : (
        <div className="text-center">Select a group to view details</div>
      )}
    </div>
  );
};

export default TgDevRightContent;