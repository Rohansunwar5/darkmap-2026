import React from "react";

const WelcomeScreen = ({ onStart }) => {
  return (
    <div className="grow font-sans glass-glow m-10 self-stretch flex justify-center items-center flex-col rounded-2xl">
      <div className="text-2xl mb-2 animate-text bg-gradient-to-r from-teal-500 via-purple-500 to-orange-500 bg-clip-text text-transparent">
        Welcome to AI Decoy agent
      </div>
      <div className="text-sm text-gray-400 px-10 mb-8 text-center">
        A powerful personalized chatbot designed to simulate user conversations and
        gather data accurately. Start a conversation to monitor and
        analyze the user behavior.
      </div>
      <button 
        onClick={onStart}
        className="relative group p-[2px] rounded-xl overflow-hidden hover:shadow-[0_0_20px_rgba(168,85,247,0.25)] transition-all duration-300 active:scale-95"
      >
        <span className="absolute inset-[-1000%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,transparent_0%,transparent_25%,#14b8a6_50%,#a855f7_75%,#f97316_100%)]"></span>
        <div className="relative flex items-center justify-center gap-2 bg-[#0a0a0a] px-10 py-2.5 rounded-[10px] text-white font-semibold tracking-wide transition-colors duration-300 group-hover:bg-[#1a1a1a]">
          <span>Get Started</span>
          <div className="relative w-5 h-5 flex items-center justify-center transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1 drop-shadow-[0_0_3px_rgba(255,255,255,0.3)]">
            <svg 
              className="absolute w-4 h-4 animate-icon-1" 
              fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
            <svg 
              className="absolute w-5 h-5 text-[#00d1ff] animate-icon-2" 
              xmlns="http://www.w3.org/2000/svg" fill="currentColor" stroke="none" viewBox="0 0 48 48">
              <path d="M34.221 27.538c-9.955-2.248-11.497-3.79-13.745-13.745-.103-.455-.508-.779-.976-.779s-.873.324-.976.779c-2.249 9.955-3.79 11.497-13.745 13.745-.456.104-.78.508-.78.976s.324.872.78.976c9.955 2.249 11.496 3.791 13.745 13.745.103.455.508.779.976.779s.873-.324.976-.779c2.249-9.954 3.79-11.496 13.745-13.745.456-.104.779-.508.779-.976s-.324-.872-.779-.976Z"/>
              <path d="M43.221 12.039c-5.292-1.195-6.035-1.938-7.23-7.229-.104-.456-.508-.779-.976-.779s-.872.323-.976.779c-1.195 5.291-1.938 6.034-7.229 7.229-.456.104-.779.508-.779.976s.323.872.779.976c5.291 1.195 6.034 1.938 7.229 7.23.104.455.508.779.976.779s.872-.324.976-.779c1.195-5.292 1.938-6.035 7.23-7.23.455-.104.779-.508.779-.976s-.324-.872-.779-.976Z"/>
            </svg>
          </div>
        </div>
      </button>
    </div>
  );
};

export default WelcomeScreen;