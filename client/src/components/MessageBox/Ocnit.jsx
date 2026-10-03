import React from "react";
import Telegram from "../../assets/teledark.png";
import OcintBox2 from "../../assets/OcintBox2.png";
import OcintBox1 from "../../assets/OcintBox1.png";
import "../../styles/tg.css";

const Ocnit = () => {
  // Static data to replace `searchResults` or dynamic fetching
  const telegramData = {
    user: {
      first_name: "John",
      username: "johndoe",
      id: "123456789",
    },
    username_history: [
      {
        date: "2023-01-01",
        username: "john_old",
        link: "https://t.me/john_old",
      },
      {
        date: "2023-06-15",
        username: "john_updated",
        link: "https://t.me/john_updated",
      },
    ],
    meta: {
      num_groups: 5,
    },
    groups: [
      { date_updated: "2023-07-01", title: "Group A", username: "group_a" },
      { date_updated: "2023-08-01", title: "Group B", username: "group_b" },
    ],
  };

  return (
    <div className="overflow-x-hidden overflow-y-auto mt-2">
      {telegramData && (
        <div>
          {/* First Box */}
          <div
            className="w-[73%] bg-[#04121ae5] ml-[22%] overflow-hidden box-border"
            style={{
              border: "1.8px solid #3ac1ff",
              maxWidth: "100%",
              padding: "19px",
              boxShadow: "2px 2px 12px 2px #3ac1ff",
              height: "240px",
            }}
          >
            <img
              src={OcintBox1}
              alt="Box Image"
              style={{
                width: "100%",
                height: "100%",
              }}
            />
          </div>

          {/* Second Box */}
          <div
            className="w-[73%] bg-[#04121ae5] ml-[22%] overflow-hidden box-border mt-9"
            style={{
              border: "1.8px solid #3ac1ff",
              maxWidth: "100%",
              padding: "19px",
              boxShadow: "2px 2px 15px 2px #3ac1ff",
              height: "320px",
            }}
          >
            <img
              src={OcintBox2}
              alt="Box Image"
              style={{
                width: "100%",
                height: "100%",
                // objectFit: "cover,
                // paddingLeft: "35px",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Ocnit;
