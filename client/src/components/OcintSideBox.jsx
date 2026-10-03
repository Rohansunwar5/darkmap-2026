import React from "react";
import Image1 from "../assets/Ocint/OcintSideBox1.png";
import Image2 from "../assets/Ocint/OcintSideBox2.png";
import Image3 from "../assets/Ocint/OcintSideBox3.png";
import Image4 from "../assets/Ocint/OcintSideBox4.png";

const OcintSideBox = () => {
  return (
    <div
      className="tall-box-right block h-full border-t-2 border-transparent border-cyan-process overflow-auto fixed right-0 bg-[#0d0d10]"
      style={{
        width: "29%",
        top: "5%",
        height: "100%",
        borderTop: "2px solid #00c3ff",
        scrollbarWidth: "none",
      }}
    >
      <style>
        {`
          .tall-box-right::-webkit-scrollbar {
            display: none; /* Hide scrollbar for Chrome, Safari, and Opera */
          }
        `}
      </style>
      <div className="flex flex-col items-center mt-5">
        <img
          src={Image1}
          alt="First Image"
          className=" mb-4"
          style={{ width: "90%" }}
        />
        <img
          src={Image2}
          alt="Second Image"
          className=" mb-4"
          style={{ width: "92%", paddingLeft: "5px", marginLeft: "2px" }}
        />
        <img
          src={Image3}
          alt="Third Image"
          className=" mb-4"
          style={{ width: "93%", paddingLeft: "5px", marginLeft: "2px" }}
        />
        <div
          className="mb-4"
          style={{
            width: "95%",
            border: "2px solid #00c3ff",
          }}
        >
          <img
            src={Image4}
            alt="Fourth Image"
            style={{ width: "100%", marginLeft: "10px" }}
          />
        </div>
      </div>
    </div>
  );
};

export default OcintSideBox;
