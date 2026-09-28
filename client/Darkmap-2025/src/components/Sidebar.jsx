import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTableCellsLarge,
  faUser,
  faHeadphones,
  faMagnifyingGlass,
  faDollarSign,
  faFile,
  faRightFromBracket,
} from "@fortawesome/free-solid-svg-icons";
import "../styles/styles.css";
import Darkmap from "../assets/textlogo.png";
import Logo from "../assets/logo_gen.png";
import image1 from '../assets/dmap.webp'

const Sidebar = () => {
  const [scrollY, setScrollY] = useState(0);
  const [sidebarTop, setSidebarTop] = useState("245px");

  const handleScroll = () => {
    const scrollPosition = window.scrollY;
    setScrollY(scrollPosition);
    const newTop = `${Math.max(0, 245 - scrollPosition)}px`;
    setSidebarTop(newTop);
  };

  useEffect(() => {
    const onScroll = () => {
      window.requestAnimationFrame(handleScroll);
    };

    window.addEventListener("scroll", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div className="flex">
      <div
        id="sidebar"
        className="fixed bg-black bg-opacity-0"
        style={{
          width: "13%",
          background:
            "linear-gradient(to right,rgb(9, 9, 9) 15%,rgba(0, 75, 98, 0.34) 50%,rgba(0, 59, 90, 0) 110%)",
          top: sidebarTop,
          paddingLeft: "10px",
          height: "100vh",
          transition: "top 0.1s ease-out",
        }}
      >
        {parseInt(sidebarTop) <= 117 && (
          <div
            className="border-b border-[#00c3ff33] flex w-full"
            style={{ paddingBottom: "12px" }}
          >
            <img src={Logo} className="w-[60px] h-[60px] mt-3 mr-0 ml-[2px]" />
            <img
              src={Darkmap} 
              alt="description" 
              className="object-contain w-[65%] h-[60px]"
              style={{ marginLeft: "8px", marginTop: "15px" }}
            />
          </div>
        )}
        <div
          style={{
            marginTop: "20px",
            height: "calc(100% - 40px)",
            paddingLeft: "0",
          }}
        >
          {[
            { icon: faTableCellsLarge, label: "Dashboard" },
            { icon: faMagnifyingGlass, label: "Search" },
            { icon: faDollarSign, label: "Pricing" },
            { icon: faUser, label: "Account" },
            { icon: faHeadphones, label: "Support" },
            { icon: faFile, label: "Document" },
          ].map((item, index) => (
            <div
              key={index}
              className="relative list-none"
              style={{
                marginBottom: "5px",
                marginTop: "5px",
                marginLeft: "5px",
                marginRight: "5px",
              }}
            >
              <div
                className="flex h-full w-full rounded-lg items-center transition-all duration-400 bg-transparent"
                style={{
                  paddingTop: "2px",
                  paddingBottom: "2px",
                  paddingLeft: "0px",
                  paddingRight: "0px",
                }}
              >
                <div
                  style={{
                    height: "50px",
                    minWidth: "50px",
                    fontSize: "16px",
                    color: "#00c2ff",
                    textAlign: "center",
                    lineHeight: "50px",
                  }}
                >
                  <FontAwesomeIcon icon={item.icon} />
                </div>
                <div
                  className="opacity-100 pointer-events-auto text-white whitespace-nowrap transition-all duration-300 font-[Aldrich]"
                  style={{
                    fontSize: "17px",
                    fontWeight: "400",
                    color: "#cccccc",
                  }}
                >
                  {item.label}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div
          className="fixed left-0 flex bg-transparent justify-between overflow-hidden transition-all duration-500 ease-in-out list-none"
          style={{
            width: "12%",
            margin: "8px 7px",
            bottom: "-8px",
            height: "60px",
            padding: "10px 14px",
          }}
        >
          <div className="flex items-center flex-nowrap">
            <img
              src={image1}
              alt="profileImg"
              style={{
                width: "35px",
                objectFit: "cover",
                borderRadius: "6px",
                marginRight: "10px",
              }}
            />
            <div
              className="text-white whitespace-nowrap "
              style={{ fontSize: "15px", fontWeight: "400" }}
            >
              AirBender
            </div>
            <div
              className="height-12 min-w-[50px] text-white text-lg leading-[50px] rounded-xl "
              style={{ width: "13%", marginLeft: "14px" }}
            >
              <FontAwesomeIcon icon={faRightFromBracket} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
