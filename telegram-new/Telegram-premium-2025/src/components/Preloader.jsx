import React from "react";
import preloaderGif from "../assets/preloader/loader.gif";

const Preloader = () => {
  return (
    <div className="preloader-container">
      <img src={preloaderGif} alt="Loading..." className="preloader" />
      <style>{`
        .preloader-container {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          backdrop-filter: blur(10px);
          background: rgba(0, 0, 0, 0.3);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }
        .preloader {
          width: 200px;
          height: auto;
        }
      `}</style>
    </div>
  );
};

export default Preloader;
