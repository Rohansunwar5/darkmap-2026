import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAuth } from '../context/AuthContext';
import {
  faTableCellsLarge,
  faUser,
  faHeadphones,
  faMagnifyingGlass,
  faFile,
  faRightFromBracket,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import "../styles/styles.css";
import Darkmap from "../assets/dmap_name.png";
import Logo from "../assets/dmap.webp";

const Sidebar = () => {
  const { user, logout } = useAuth();
  const [scrollY, setScrollY] = useState(0);

  const getDisplayName = () => {
    if (!user) return "Loading...";
    const first = user.firstName || "User";
    const last = user.lastName || "";
    const lastPrefix = last.substring(0, 2);
    return lastPrefix ? `${first} ${lastPrefix}....` : first;
  };
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

  const navigate = useNavigate();

  return (
    <>
      {parseInt(sidebarTop) <= 117 && (
        <div
          className="border-b border-[#00c3ff33] flex w-full"
          style={{ paddingBottom: "12px" }}
        >
          <img src={Logo} className="w-[60px] h-[60px] mt-3 mr-0 ml-[2px]" />
          <img
            src={Darkmap} // Replace with your image source
            alt="description" // Replace with your image description
            className="object-contain w-[65%] h-[60px]"
            style={{ marginLeft: "8px", marginTop: "15px" }}
          />
        </div>
      )}
      <div
        style={{
          marginTop: "20px",
          paddingLeft: "0",
        }}
      >
        {[
          { icon: faTableCellsLarge, label: "Dashboard", path: "/" },
          { icon: faMagnifyingGlass, label: "Group Analysis", path: "/group/search" },
          { icon: faTriangleExclamation, label: "Group Alerts", path: "/group/bookmarks" },
          { icon: faUser, label: "Account", path: "/me" },
          { icon: faHeadphones, label: "Support", path: "/support" },
          { icon: faFile, label: "Document", isExternal: true, path: "https://darkmap.org/privacy" },
        ].map((item, index) => (
          <div
            key={index}
            onClick={() => {
              if (item.isMailto) {
                window.location.href = item.path;
              } else if (item.path) {
                window.open(item.path, "_blank", "noopener,noreferrer");
              }
            }}
            className={`relative list-none ${item.path ? 'cursor-pointer hover:bg-gray-800' : ''} rounded-lg`}
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
        className="flex bg-transparent justify-between overflow-hidden transition-all duration-500 ease-in-out list-none fixed bottom-0"
        style={{
          margin: "8px 7px",
          padding: "10px 14px",
        }}
      >
        <div className="flex items-center flex-nowrap">
          <img
            src={Logo}
            alt="profileImg"
            style={{
              width: "35px",
              objectFit: "cover",
              borderRadius: "6px",
              marginRight: "10px",
            }}
          />
          <div
            className="text-white whitespace-nowrap overflow-hidden text-ellipsis"
            style={{ fontSize: "15px", fontWeight: "400", maxWidth: "120px" }}
          >
            {getDisplayName()}
          </div>
          <div
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="height-12 min-w-[50px] text-white text-lg leading-[50px] rounded-xl cursor-pointer hover:text-red-500 transition-colors"
            style={{ width: "13%", marginLeft: "14px" }}
          >
            <FontAwesomeIcon icon={faRightFromBracket} />
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
