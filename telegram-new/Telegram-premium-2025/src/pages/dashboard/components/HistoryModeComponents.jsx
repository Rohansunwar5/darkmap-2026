export function KeywordAnalysis({ chatData }) {
    const text = chatData.map(m => m.text).join(" ");
    const words = text
        .toLowerCase()
        .match(/\b[a-z]{3,}\b/g) || [];

    const freq = {};
    words.forEach(w => freq[w] = (freq[w] || 0) + 1);

    const topWords = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    return (
        <div className="p-4 rounded-xl shadow-md space-y-2">
            <h2 className="text-lg font-semibold mb-10">High occurance keywords</h2>
            <div className="flex flex-wrap gap-3">
                {topWords.map(([word, count]) => (
                    <div className="text-xs flex border gap-x-2 py-2 border-primary-500 rounded-full items-center px-4" key={word}>{word}: <span className="text-red-500">{count}</span></div>
                ))}
            </div>
        </div>
    );
}

import { useState, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch } from "@fortawesome/free-solid-svg-icons";
import useDashboardStore from "../temp";
export function ChatSearch() {
    const { chatData } = useDashboardStore();
    const [searchText, setSearchText] = useState("");

    // Filter chats based on search text
    const filteredChats = useMemo(() => {
        if (!chatData) return [];
        if (!searchText.trim()) return chatData;

        return chatData.filter(msg =>
            msg.text?.toLowerCase().includes(searchText.toLowerCase())
        );
    }, [chatData, searchText]);

    const highlightText = (text) => {
        if (!searchText.trim()) return text;

        const regex = new RegExp(`(${searchText})`, "gi");
        const parts = text.split(regex);

        return parts.map((part, i) =>
            regex.test(part) ? (
                <span key={i} className="bg-white text-black px-1 rounded">
                    {part}
                </span>
            ) : (
                part
            )
        );
    };

    const search = () => {};

    return (
        <>
            {/* Search Bar */}
            <div className="inline-flex bg-gray-950 rounded-full mt-2 overflow-clip border border-primary-500 self-center">
                <input
                    className="text-white bg-inherit px-4 py-2 focus:outline-none font-default-sans"
                    placeholder="Search messages..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && search()}
                />
                <FontAwesomeIcon
                    onClick={search}
                    icon={faSearch}
                    className="p-3 px-4 rounded-full text-white hover:bg-primary-900 cursor-pointer"
                />
            </div>

            {/* Chat Results */}
            <div className="w-full p-4 rounded-2xl shadow-md overflow-y-auto font-default-sans">
                {filteredChats.length === 0 && (
                    <p className="text-gray-400 text-center">No messages found.</p>
                )}

                {filteredChats.map((msg) => (
                    <div
                        key={msg.message_id}
                        className={`flex mb-4 ${
                            msg.sender === "You"
                                ? "justify-end"
                                : "justify-start"
                        }`}
                    >
                        <div
                            className={`p-3 max-w-xs rounded-2xl shadow-md ${
                                msg.sender === "You"
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
        </>
    );
}


