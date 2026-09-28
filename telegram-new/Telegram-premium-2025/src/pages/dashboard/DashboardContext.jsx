import React, { createContext, useContext, useEffect, useState } from "react";
import apiClient from "../../lib/apiClient";

// Create context
const BookmarkContext = createContext();

// Provider component
export const DashboardContext = ({ children }) => {
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchBookmarks = async () => {
    try {
      const response = await apiClient.get(`${import.meta.env.VITE_API_BASE_URL}/bookmark/bookmarks`);
      setBookmarks(response.data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookmarks();
  }, []);

  return (
    <BookmarkContext.Provider value={{ bookmarks, loading, error, fetchBookmarks }}>
      {children}
    </BookmarkContext.Provider>
  );
};

// Custom hook to use context
export const useBookmarks = () => {
  const context = useContext(BookmarkContext);
  if (!context) {
    throw new Error("useBookmarks must be used within a BookmarkProvider");
  }
  return context;
};
