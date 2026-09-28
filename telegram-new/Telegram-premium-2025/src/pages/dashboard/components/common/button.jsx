import { useState } from "react";
import Spinner from "./spinner";

export default function LoadingButton({
  onClick,
  className = "",
  children,
}) {
  const [loading, setLoading] = useState(false);

  const handleClick = async (e) => {
    if (loading) return;

    try {
      const result = onClick?.(e);

      if (result instanceof Promise) {
        setLoading(true);
        await result;
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`inline-flex items-center justify-center rounded-2xl px-4 py-1 transition disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {loading && (
        <div className="me-2 flex items-center">
            <Spinner className="size-4" spinnerBg="text-white"></Spinner>
        </div>
      )}
      {children}
    </button>
  );
}
