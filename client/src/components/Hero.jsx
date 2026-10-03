import React, { useState } from "react";
import logo from "../assets/logo_gen.png";
import heroImage from "../assets/hero_gen.jpg";
import header from "../assets/textlogo.png";
import SearchBar from "./SearchBar";
import "@fortawesome/fontawesome-free/css/all.min.css";
import { FlipWords } from "./ui/flip-words";
import "../styles/home.css";
import { useNavigate } from "react-router-dom";
import SearchScreenNavbar from "./SearchScreenNavbar";

export function FlipWordsDemo() {
  const words = ["Open source data", "faster", "better", "Intelligence"];

  return (
    <div className="absolute top-0 right-0 p-4 ">
      <div
        className="text-4xl mx-auto font-normal text-white dark:text-neutral-400"
        style={{ fontFamily: "'Aldrich', sans-serif" }}
      >
        Darkmap Index
        <FlipWords words={words} /> <br />
      </div>
    </div>
  );
}

const Hero = ({ onSearch }) => {
  const navigate = useNavigate();

  const predefinedChannels = [
    "Owlsechacking",
    "hackplanete",
    "Spamtools_otpBOT",
    "baphchat",
    "pwn3rzs_chat",
    "+4atVullEWwsxYTA0",
    "+9ETFYLy5Tc1lNzBh",
    "DataRecordsShop",
    "DataBreachPremium",
    "SpamoArabo",
    "SkiddieSec",
    "vxunderground",
    "CryptoHackers_Market",
    "sixtysixchat",
    "ANONYMOUS_CHAT_VIP",
    // More channels...
  ];

 const handleSearch = (results, isLoading, allChannelsList, query, predefinedChannels) => {
  if (!isLoading) {
    onSearch({
      searchBarResults: results,
    }, query); // Pass results up to App.jsx
    navigate("/generic"); // Redirect to the generic route
  }
};

  return (
    <div className="h-screen w-screen flex flex-col code-font" style={{ backgroundImage: 'url(/globe.jpeg)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <SearchScreenNavbar></SearchScreenNavbar>
      <div className='flex flex-grow flex-col justify-start items-center mt-[6rem]'>
        <div className='w-1/2 md:w-[20rem] z-10 mb-4'>
          <img src='logo.png' className='z-10 p-4 mb-10'></img>
          <img src='logo_text.png' style={{ backdropFilter: 'blur(2px)' }} className='w-full z-10 mb-2'></img>
        </div>

        <SearchBar
        onSearch={handleSearch}
        predefinedChannels={predefinedChannels}
        ></SearchBar>
      </div>
    </div>
  );
};

export default Hero;
