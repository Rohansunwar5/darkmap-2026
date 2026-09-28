import React from "react";

const LoadMoreButton = ({ onClick, disabled }) => (
  <button
    className="text-white bg-blue-500 mt-3 p-2 rounded-lg"
    style={{ display: "block", margin: "20px auto", marginLeft: "690px" }}
    onClick={onClick}
    disabled={disabled}
  >
    View More
  </button>
);

export default LoadMoreButton;