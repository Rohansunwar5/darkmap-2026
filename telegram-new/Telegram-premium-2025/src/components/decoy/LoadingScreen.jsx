import React from "react";

const LoadingScreen = ({ loadingText }) => {
  return (
    <div className="grow glass-glow font-sans m-10 self-stretch flex justify-center items-center flex-col rounded-2xl p-8">
      <div className="relative w-16 h-16 mb-6">
        <div className="w-16 h-16 rounded-full border-4 border-t-[#00d1ff] border-r-transparent border-b-[#126382] border-l-transparent animate-spin"></div>
        <div
          className="absolute inset-2 rounded-full flex items-center justify-center"
          style={{ background: "#000B14", border: "1px solid #126382" }}
        >
          <svg className="w-5 h-5" style={{ color: "#00d1ff" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
      </div>
      <div className="text-base font-semibold tracking-wide animate-pulse" style={{ color: "#00d1ff" }}>
        {loadingText}
      </div>
    </div>
  );
};

export default LoadingScreen;