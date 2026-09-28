import React, { useState, useMemo } from "react";
import useDashboardStore from "../../temp";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import Tooltip from "../../../../components/Common/Tooltip";

const ChatsByUser = () => {
    const { chatData } = useDashboardStore();
    const [selectedUser, setSelectedUser] = useState(null);

    // Group chats by sender
    const groupedChats = useMemo(() => {
        return chatData.reduce((acc, msg) => {
            const sender = msg.sender || "Unknown";
            if (!acc[sender]) acc[sender] = [];
            acc[sender].push(msg);
            return acc;
        }, {});
    }, [chatData]);

    // Highlight text function placeholder
    const highlightText = (text) => text;

    const users = Object.keys(groupedChats);

    return (
        <>
        <div className="grid grid-cols-2 h-full">
            {/* User Chips */}
            <div className="overflow-auto">
                <div className="flex flex-wrap gap-2 p-2">
                    {users.map((user) => (
                        <div
                            key={user}
                            onClick={() => setSelectedUser(user)}
                            className={`text-xs flex border gap-x-2 py-2 px-4 rounded-full items-center cursor-pointer ${selectedUser === user
                                    ? "bg-primary-500 text-white border-primary-500"
                                    : "border-primary-500 text-primary-500 hover:bg-primary-100"
                                }`}
                        >
                            {user}
                        </div>
                    ))}
                </div>
            </div>

            {/* Chat Messages */}
            {selectedUser ? (
                <div className="mt-4 overflow-auto flex flex-wrap gap-4 px-4">
                    {groupedChats[selectedUser].map((msg) => (
                        <div
                            key={msg.message_id}
                            className={`flex font-default-sans ${msg.sender === "You"
                                    ? "justify-end"
                                    : "justify-start"
                                }`}
                        >
                            <div
                                className={`p-3 max-w-xs rounded-2xl shadow-md ${msg.sender === "You"
                                        ? "bg-primary-500 text-white rounded-br-none"
                                        : "bg-gray-800 text-gray-100 rounded-bl-none"
                                    }`}
                            >
                                <p className="text-sm font-semibold">
                                    {msg.sender || "Unknown"}
                                </p>
                                <p className="text-base break-words">
                                    {highlightText(msg.text || msg.content || "No content")}
                                </p>
                                <span className="text-xs text-gray-400 mt-1 block">
                                    {new Date(msg.timestamp_raw).toLocaleString()}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : <>
            <div className="h-full relative flex items-center">
                <div className="absolute top-0 right-0 p-4"><Tooltip position="left" text={"Select a user to view their messages"}><FontAwesomeIcon icon={faInfoCircle}></FontAwesomeIcon></Tooltip></div>
                <img className="w-14 mx-auto my-auto animate-pulse" src="/logo.png"></img>
            </div>

            </>}
        </div>
        </>
    );
};

export default ChatsByUser;
