import React from "react";

const TelegramIoc = ({ selectedMessage }) => {
  if (!selectedMessage) {
    return (
      <div className="text-center">Select a message to view IOC details</div>
    );
  }

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
              Telegram
            </span>
          </div>

          <div>
            Channel Name:{" "}
            <span
              className="bg-[#0b2530] text-[#00d1ff] text-wrap rounded-md "
              style={{ padding: "2px " }}
            >
              {selectedMessage.channel_name || "Hidden Channels"}
            </span>
          </div>

          <div>
            Date:{" "}
            <span
              className="bg-[#0b2530] text-[#00d1ff] text-wrap rounded-md "
              style={{ padding: "2px " }}
            >
              {new Date(selectedMessage.date).toLocaleDateString("en-GB")}
            </span>
          </div>

          <div>
            Message ID:{" "}
            <span
              className="bg-[#0b2530] text-[#00d1ff] text-wrap rounded-md "
              style={{ padding: "2px " }}
            >
              {selectedMessage.message_id || "N/A"}
            </span>
          </div>

          <div>
            Attached Url:{" "}
            <span
              className="bg-[#0b2530] text-[#00d1ff] text-wrap rounded-md "
              style={{ padding: "2px " }}
            >
              {selectedMessage.url || "N/A"}
            </span>
          </div>

          <div>
            Attached File:{" "}
            <span
              className="bg-[#0b2530] text-[#00d1ff] text-wrap rounded-md "
              style={{ padding: "2px " }}
            >
              {selectedMessage.file || "N/A"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TelegramIoc;
