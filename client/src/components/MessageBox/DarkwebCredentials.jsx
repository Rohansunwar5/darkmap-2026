import React from "react";
import Darkweb from "../../assets/darweb-forum.png";

const DarkwebCredentials = ({ hackcheckData }) => {
  const items = Array.isArray(hackcheckData)
    ? hackcheckData
    : hackcheckData?.results || [];

  if (!items.length) {
    return null;
  }

  return (
    <div>
      {items.map((result, index) => {
        const sourceDate = result.source?.date || result.date || "";
        const sourceName = result.source?.name || (typeof result.source === "string" ? result.source : "Darkweb-Credentials");

        return (
          <div
            key={index}
            className="w-[77%] bg-transparent shadow-[0_2px_11px_0_#3ac1ff] ml-[20%] mb-4"
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
                <img src={Darkweb} alt="" className="w-7 h-auto ml-1" />
                <span
                  className="font-[Aldrich] text-[#a0ddff] mx-1.5 mb-[1.5px] "
                  style={{ fontSize: "23px" }}
                >
                  Darkweb-Credentials
                </span>
              </div>
              {sourceDate && (
                <div
                  className="text-[#dfd5d5] font-[Aldrich] mt-0"
                  style={{
                    fontSize: "13px",
                    marginLeft: "5px",
                    margin: "0px 5px",
                  }}
                >
                  {sourceDate}
                </div>
              )}
              <div
                className="text-[#dfd5d5] font-[Aldrich] text-s"
                style={{ margin: "2x 5px ", fontSize: "12px" }}
              >
                <span
                  className={`text-xs rounded-sm text-black ${result.email ? "bg-[#ad0000]" : "bg-[#00d1ff]"
                    }`}
                  style={{ padding: "0px 4px", margin: "5px" }}
                >
                  Email
                </span>
                <span
                  className={`text-xs rounded-sm text-black ${result.password ? "bg-[#ad0000]" : "bg-[#00d1ff]"
                    }`}
                  style={{ padding: "0px 4px", margin: "5px" }}
                >
                  Password
                </span>
                <span
                  className={`text-xs rounded-sm text-black ${result.username ? "bg-[#ad0000]" : "bg-[#00d1ff]"
                    }`}
                  style={{ padding: "0px 4px", margin: "5px" }}
                >
                  Username
                </span>
                <span
                  className={`text-xs rounded-sm text-black ${result.ip_address ? "bg-[#ad0000]" : "bg-[#00d1ff]"
                    }`}
                  style={{ padding: "0px 4px", margin: "5px" }}
                >
                  IP
                </span>
                <span
                  className={`text-xs rounded-sm text-black ${result.phone_number ? "bg-[#ad0000]" : "bg-[#00d1ff]"
                    }`}
                  style={{ padding: "0px 4px", margin: "5px" }}
                >
                  Phone
                </span>
              </div>

              <div
                className="font-chakra text-white"
                style={{ margin: "25px 5px", fontSize: "14px" }}
              >
              <div className="font-bold text-primary-500">{result.source?.name}</div>
                {result.email && <div>Email: {result.email}</div>}
                {result.password && <div>Password: {result.password}</div>}
                {result.username && <div>Username: {result.username}</div>}
                {result.ip_address && (
                  <div>IP Address: {result.ip_address}</div>
                )}
                {result.phone_number && (
                  <div>Phone Number: {result.phone_number}</div>
                )}
                {result.hash && <div>Hash: {result.hash}</div>}
                {result.other_fields && (
                  <div>Other Fields: {JSON.stringify(result.other_fields)}</div>
                )}
                {result.sensitive_fields && (
                  <div>Sensitive Fields: {JSON.stringify(result.sensitive_fields)}</div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DarkwebCredentials;
