import React, { useEffect, useState } from "react";
import Telegram from "../../assets/teledark.png";
import axios from "axios";
import "../../styles/tg.css";

const API_ENDPOINT = "http://52.87.196.222:5000/proxy";

const TgDev = ({ searchResults }) => {
  const [telegramData, setTelegramData] = useState(null);

  useEffect(() => {
    if (
      searchResults &&
      searchResults.telegram &&
      searchResults.telegram.status === "ok"
    ) {
      // console.log("Incoming searchResults data:", searchResults);
      setTelegramData(searchResults.telegram.result);
      // console.log("Setting telegramData:", searchResults.telegram.result);
    }
  }, [searchResults]);

  return (
    <div className="overflow-x-hidden overflow-y-auto">
      {telegramData && (
        <div>
          {/* First Box */}
          <div
            className="w-[77%] bg-[#04121ae5] shadow-[0_2px_11px_0_#3ac1ff] ml-[20%] overflow-x-hidden box-border"
            style={{
              border: "1.8px solid #3ac1ff",
              maxWidth: "100%",
              marginTop: "19px",
              padding: "15px",
            }}
          >
            <div className="flex items-center">
              <img
                src={Telegram}
                alt="Telegram Logo"
                className="w-8 h-auto mr-3"
              />
              <span className="text-[#a0ddff] text-2xl">Person Found</span>
            </div>

            <div
              className="text-[#dfd5d5] mb-3"
              style={{ paddingLeft: "45px", fontSize: "12px" }}
            >
              <span>{telegramData.user.first_name}</span>{" "}
              <span
                className="bg-[#ede4e4] rounded text-black"
                style={{ padding: "0px 0.6px 1px 0.6px", marginRight: "4px" }}
              >
                {telegramData.user.username}
              </span>
              <div className="text-[#ff0000]">
                Telegram ID: {telegramData.user.id}
              </div>
            </div>

            <div className="text-[#dfd5d5] mt-4 relative">
              <div
                className="mb-2"
                style={{
                  paddingLeft: "60px",
                  fontSize: "13px",
                  marginTop: "30px",
                }}
              >
                <span>Username History</span>
              </div>
              <div
                className="dotted-line-vertical"
                style={{ top: "30px", left: "12%" }}
              />

              <div
                className="dotted-line-horizontal"
                style={{ top: "90px", left: "12%", height: "2px" }}
              />

              <div className="flex">
                <div className="flex-1"></div>

                <div
                  className="ml-4 border border-[#910000] p-8 rounded-md"
                  style={{
                    marginRight: "50px",
                    position: "relative",
                    bottom: "60px",
                    width: "60%",
                    maxWidth: "100%",
                    overflow: "hidden",
                    minHeight: "150px",
                  }}
                >
                  {telegramData.username_history.length > 0 ? (
                    telegramData.username_history.map((entry, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between text-white mb-2"
                        style={{
                          fontSize: "11px",
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "5px 0",
                          columnGap: "15px",
                        }}
                      >
                        <div
                          className="w-1/3 text-[#dfd5d5]"
                          style={{ paddingRight: "10px" }}
                        >
                          Date:{" "}
                          <span className="text-white">
                            {new Date(entry.date)
                              .getDate()
                              .toString()
                              .padStart(2, "0") +
                              "-" +
                              (new Date(entry.date).getMonth() + 1)
                                .toString()
                                .padStart(2, "0") +
                              "-" +
                              new Date(entry.date).getFullYear()}
                          </span>
                        </div>
                        <div
                          className="w-1/3 truncate"
                          style={{ paddingRight: "10px" }}
                        >
                          <a
                            href={entry.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#00D1FF]"
                          >
                            {entry.username}
                          </a>
                        </div>
                        <div className="w-1/3 truncate">
                          <a
                            href={entry.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#00D1FF]"
                          >
                            {entry.link}
                          </a>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-white text-center text-xs">
                      No username history available.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Second Box */}
          <div
            className="w-[77%] bg-[#04121ae5] ml-[20%] overflow-visible box-border"
            style={{
              border: "1.8px solid #3ac1ff",
              maxWidth: "100%",
              padding: "19px",
              boxShadow: "0 6px 15px 0 #3ac1ff",
            }}
          >
            <div className="flex items-center mb-4">
              <img
                src={Telegram}
                alt="Telegram Logo"
                className="w-8 h-auto mr-3"
              />
              <span
                className="text-white"
                style={{
                  paddingTop: "10px",
                  paddingLeft: "10px",
                  fontSize: "14px",
                }}
              >
                <div className="text-[#ff0000]">
                  Telegram ID: {telegramData.user.id}
                </div>
                <div className="mb-2 pl-4 text-[#dfd5d5]">
                  <span>Number of Groups: {telegramData.meta.num_groups}</span>
                </div>
              </span>
            </div>

            <div className="text-white mt-4 relative">
              <div
                className="dotted-line-vertical"
                style={{ top: "10px", left: "12%", height: "80px" }}
              />

              <div
                className="dotted-line-horizontal"
                style={{ top: "90px", left: "12%", height: "2px" }}
              />

              <div className="flex">
                <div className="flex-1"></div>
                <div
                  className="ml-4 border border-[#910000] p-8 rounded-md"
                  style={{
                    marginRight: "50px",
                    position: "relative",
                    bottom: "35px",
                    width: "60%",
                    maxWidth: "100%",
                    overflow: "hidden",
                  }}
                >
                  {telegramData.groups.map((group, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between text-white mb-2"
                      style={{
                        fontSize: "11px",
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "5px 0",
                        columnGap: "15px",
                      }}
                    >
                      <div
                        className="w-1/3 text-[#dfd5d5]"
                        style={{ paddingRight: "10px" }}
                      >
                        Date:{" "}
                        <span className="text-white">
                          {new Date(group.date_updated)
                            .getDate()
                            .toString()
                            .padStart(2, "0") +
                            "-" +
                            (new Date(group.date_updated).getMonth() + 1)
                              .toString()
                              .padStart(2, "0") +
                            "-" +
                            new Date(group.date_updated).getFullYear()}
                        </span>
                      </div>
                      <div className="w-1/3" style={{ paddingRight: "10px" }}>
                        <a
                          href={`https://t.me/${group.username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#00D1FF]"
                        >
                          {group.title}
                        </a>
                      </div>
                      <div className="w-1/3">
                        <a
                          href={`https://t.me/${group.username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#00D1FF]"
                        >
                          {group.username}
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

TgDev.searchTelegramMessages = async (searchQuery) => {
  try {
    const response = await axios.post(API_ENDPOINT, {
      search_query: searchQuery,
    });
    return response.data.messages_info || [];
  } catch (error) {
    console.error("Error searching Telegram messages:", error);
    return [];
  }
};

export default TgDev;
