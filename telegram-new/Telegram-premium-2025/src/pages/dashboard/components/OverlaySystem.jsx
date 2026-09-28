import { faClose } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { createContext, useContext, useState } from "react";

const OverlayContext = createContext();

export function OverlayProvider({ children }) {
    const [overlay, setOverlay] = useState(null);
    const [title, setTitle] = useState('Title');

    const showOverlay = (content, title = "Notification") => {setOverlay(() => content), setTitle(title)};
    const hideOverlay = () => setOverlay(null);

    return (
        <OverlayContext.Provider value={{ showOverlay, hideOverlay }}>
            {children}
            {overlay && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="relative bg-black border border-primary-600 shadow-lg shadow-gray-900 text-white p-4 rounded-xl min-w-[300px] max-w-screen-md">
                        <div className="flex justify-between items-center font-default-sans text-2xl font-semibold">
                            <h1>{title}</h1>
                            <button onClick={hideOverlay} className="text-gray-600 hover:text-white">
                                <FontAwesomeIcon icon={faClose} className="size-6"></FontAwesomeIcon>
                            </button>
                        </div>
                        {typeof overlay === "function" ? overlay({ hideOverlay }) : overlay}
                    </div>
                </div>
            )}
        </OverlayContext.Provider>
    );
}

export const useOverlay = () => useContext(OverlayContext);
