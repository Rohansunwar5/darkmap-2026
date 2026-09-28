import React, { useEffect, useState } from "react";
import Preview from "../Preview";

const PreloaderWrapper = () => {
  const [showLoader, setShowLoader] = useState(true);

  useEffect(() => {
    const loaderTimer = setTimeout(() => {
      setShowLoader(false);
    }, 30000);

    return () => clearTimeout(loaderTimer);
  }, []);

  return showLoader ? (
    <div className="fixed z-[9999]">
      <Preview />
    </div>
  ) : null;
};

export default PreloaderWrapper;