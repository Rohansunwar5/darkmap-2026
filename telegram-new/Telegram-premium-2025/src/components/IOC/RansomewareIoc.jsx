import React from "react";

const RansomewareIoc = ({ selectedMessage }) => {
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
              Ransomware
            </span>
          </div>

          <div>
            Date:{" "}
            <span
              className="bg-[#0b2530] text-[#00d1ff] text-wrap rounded-md "
              style={{ padding: "2px " }}
            >
              {new Date(selectedMessage.discovered).toLocaleDateString()}
            </span>
          </div>

          <div>
            Criminal Group:{" "}
            <span
              className="bg-[#0b2530] text-[#00d1ff] text-wrap rounded-md "
              style={{ padding: "2px " }}
            >
              {selectedMessage.group_name || "N/A"}
            </span>
          </div>

          <div>
            Victim:{" "}
            <span
              className="bg-[#0b2530] text-[#00d1ff] text-wrap rounded-md "
              style={{ padding: "2px " }}
            >
              {selectedMessage.post_title || "N/A"}
            </span>
          </div>

          {/* <div>
            Description:{" "}
            <span
              className="bg-[#0b2530] text-[#00d1ff] text-wrap rounded-md "
              style={{ padding: "2px " }}
            >
              {selectedMessage.description || "No description available"}
            </span>
          </div> */}

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

export default RansomewareIoc;
