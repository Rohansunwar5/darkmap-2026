import React, { useEffect, useState } from "react";
import Telegram from "../../assets/teledark.png";

import { auth, firestore } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";



const fetchUserRole = async (uid) => {
  try {
    const docRef = doc(firestore, "users", uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const userData = docSnap.data();
      console.log("User role:", userData.role);
      return userData.role;
    } else {
      console.log("No such user document!");
    }
  } catch (error) {
    console.error("Error fetching user role:", error.message);
  }
};

const TelegramMessageBox = ({
  messages = [],
  onSelectMessage,
  searchQuery,
}) => {
  const [preloadedImages, setPreloadedImages] = useState({});
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    const preloadImages = () => {
      const newPreloadedImages = {};
      messages.forEach((message) => {
        const imageUrl = `https://screenshot.darkmap.org/screenshot?url=https://t.me/s/${message.channel_name}?q=${searchQuery}`;
        const img = new Image();
        img.src = imageUrl;
        newPreloadedImages[message.channel_name] = imageUrl;
      });
      setPreloadedImages(newPreloadedImages);
    };

    preloadImages();
  }, [messages, searchQuery]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        const role = await fetchUserRole(user.uid);
        setUserRole(role);
        console.log("role", role);
      }
    });

    return () => unsubscribe();
  }, []);

  const highlightQueryInText = (text, query) => {
    if (!query || !text) return truncateToFirst20Words(text);

    const queryIndex = text.toLowerCase().indexOf(query.toLowerCase());
    if (queryIndex === -1) {
      return truncateToFirst20Words(text);
    }

    const wordsBefore = text.slice(0, queryIndex).split(" ");
    const wordsAfter = text.slice(queryIndex + query.length).split(" ");

    const truncatedText =
      (wordsBefore.length > 10 ? "..." : "") +
      wordsBefore.slice(-10).join(" ") +
      " " +
      text.slice(queryIndex, queryIndex + query.length) +
      " " +
      wordsAfter.slice(0, 10).join(" ") +
      (wordsAfter.length > 10 ? "..." : "");

    const highlightedText = truncatedText.replace(
      new RegExp(`(${query})`, "gi"),
      `<span style="background-color: #00316B;">$1</span>`
    );

    return highlightedText;
  };

  const truncateToFirst20Words = (text) => {
    const words = text.split(" ");
    return words.length > 20
      ? words.slice(0, 20).join(" ") + "..."
      : words.join(" ");
  };

  const truncateToFirst2Words = (text) => {
    const words = text.split(" ");
    return words.length > 0 ? words.slice(0, 2).join(" ") : words.join(" ");
  };

  return (
    <div className="overflow-x-hidden overflow-y-auto">
      {messages.map((message, index) => (
        <div
          key={index}
          className="w-[77%] bg-transparent shadow-[0_2px_11px_0_#3ac1ff] overflow-x-hidden box-border"
          style={{
            border: "1.8px solid #3ac1ff",
            maxWidth: "100%",
            marginTop: "19px",
          }}
          onClick={() =>
            onSelectMessage(
              message,
              preloadedImages[message.channel_name],
              searchQuery
            )
          }
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
              <img src={Telegram} alt="" className="w-7 h-auto ml-1" />
              <span
                className="font-[Aldrich] text-[#a0ddff] mx-1.5 mb-[1.5px]"
                style={{ fontSize: "23px" }}
              >
                Telegram
              </span>
            </div>
            <div
              className="text-[#dfd5d5] font-[Aldrich]"
              style={{
                fontSize: "12px",
                marginLeft: "5px",
                margin: "0px 5px",
              }}
            >
              Date : {new Date(message.date).toLocaleDateString("en-GB")} Time :{" "}
              {new Date(message.date).toLocaleTimeString()}
            </div>
            <div
              className="text-[#dfd5d5] font-[Aldrich] pt-[2px]"
              style={{ margin: "2px 5px", fontSize: "13px" }}
            >
              <span
                className="bg-[#ede4e4] rounded text-black"
                style={{ padding: "0px 0.6px 1px 0.6px", marginRight: "4px" }}
              >
                person
              </span>
              sent a message on
              <span
                className={userRole === "test" ? "normal-class " : "premium-class text-[#ff0000]"}
              >
                {message.channel_name}
              </span>
            </div>
            <div
              className="font-chakra text-white"
              style={{
                margin: "25px 5px",
                fontSize: "14px",
              }}
              dangerouslySetInnerHTML={{
                __html: highlightQueryInText(message.text, searchQuery),
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export default TelegramMessageBox;
