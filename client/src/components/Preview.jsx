"use client";
import React, { useState, useEffect } from "react";
import { MultiStepLoader as Loader } from "../components/ui/multi-step-loader";

const loadingStates = [
  {
    text: "Initializing services...",
  },
  {
    text: "Fetching configuration files...",
  },
  {
    text: "Connecting to the server...",
  },
  {
    text: "Fetching the latest updates...",
  },
  {
    text: "Loading modules..",
  },
  {
    text: "Starting core services...",
  },
  {
    text: "Syncing data...",
  },

];

export function Preview() {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const firstLoadTimestamp = localStorage.getItem('firstTimeLoadTimestamp');
    const currentTime = Date.now();

    const THREE_HOURS = 3 * 60 * 60 * 1000;

    if (!firstLoadTimestamp || (currentTime - parseInt(firstLoadTimestamp) > THREE_HOURS)) {
      localStorage.setItem('firstTimeLoadTimestamp', currentTime.toString());
      
      setLoading(true);

      const timer = setTimeout(() => {
        setLoading(false);
      }, 60000);

      return () => clearTimeout(timer);
    }
  }, []); 

  if (!loading) {
    return null;
  }

  return (
    <div className="w-full h-[60vh] flex items-center justify-center">
      <Loader loadingStates={loadingStates} loading={loading} duration={3000} />
    </div>
  );
}

export default Preview;