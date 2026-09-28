import React, { useEffect, useState } from "react";
import axios from "axios";
import TelegramMessageBox from "./MessageBox/TelegramBox";
import { filterAndPrioritizeMessages } from "../utils/messageUtils";
import LoadingIndicator from "./BoxContainer/LoadingIndicator";
import LoadMoreButton from "./BoxContainer/LoadMoreButton";

const BoxContainer = ({
  searchResults,
  onSelectMessage,
  keywords,
  channelNames,
  predefinedChannels,
  searchQuery,
  filter,
}) => {
  const [page, setPage] = useState(1);
  const [additionalResults, setAdditionalResults] = useState([]);
  const [newResults, setNewResults] = useState([]);
  const [newPredefinedResults, setNewPredefinedResults] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [predefinedPage, setPredefinedPage] = useState(1);
  const [hasMoreChannels, setHasMoreChannels] = useState(true);
  const [isViewMoreDisabled, setIsViewMoreDisabled] = useState(false);

  // Reset state when searchQuery changes
  useEffect(() => {
    setAdditionalResults([]);
    setPage(1);
    setPredefinedPage(1);
    setHasMoreChannels(true);
  }, [searchQuery]);

  // Fetch more predefined channel messages
  const loadMorePredefinedChannels = async () => {
    const nextPredefinedPage = predefinedPage + 1;
    const nextPredefinedChannels = predefinedChannels.slice(
      predefinedPage * 10,
      (predefinedPage + 1) * 10
    );

    if (nextPredefinedChannels.length === 0) return;

    try {
      const predefinedPromises = nextPredefinedChannels.map((channel_name) =>
        axios.post(
          "https://4phuyf7tlf.execute-api.us-east-1.amazonaws.com/prod/add-ch",
          { search_query: searchQuery, channel_name: channel_name }
        )
      );

      const predefinedData = await Promise.all(predefinedPromises);
      const newPredefinedMessages = predefinedData.flatMap(
        (msg) => msg.data.messages_info
      );
      setNewPredefinedResults(newPredefinedMessages);
      setPredefinedPage(nextPredefinedPage);
    } catch (error) {
      console.error("Error fetching more predefined channel messages:", error);
    }
  };

  // Fetch more regular channel messages
  const loadMoreMessages = async () => {
    const nextPage = page + 1;
    const nextChannelsList = channelNames.slice(page * 10, (page + 1) * 10);

    if (nextChannelsList.length === 0) return;

    try {
      const messagesPromises = nextChannelsList.map((channel_name) =>
        axios.post(
          "https://4phuyf7tlf.execute-api.us-east-1.amazonaws.com/prod/get_tg_msg",
          { search_query: searchQuery, channel_name: channel_name }
        )
      );

      const messagesData = await Promise.all(messagesPromises);
      const newMessages = messagesData.flatMap((msg) => msg.data.messages_info);
      setNewResults(newMessages);
      setPage(nextPage);
    } catch (error) {
      console.error("Error fetching more telegram messages:", error);
    }
  };

  // Merge and filter new results
  useEffect(() => {
    if (newPredefinedResults.length > 0 || newResults.length > 0) {
      const mergedResults = [...newPredefinedResults, ...newResults];
      const filteredMergedResults = filterAndPrioritizeMessages(
        mergedResults,
        keywords
      );
      setAdditionalResults((prevResults) => [
        ...prevResults,
        ...filteredMergedResults,
      ]);

      setNewPredefinedResults([]);
      setNewResults([]);
    }
  }, [newPredefinedResults, newResults, keywords]);

  // Handle "View More" button click
  const handleViewMore = async () => {
    setLoadingMore(true);
    setIsViewMoreDisabled(true);

    const hasMorePredefined = predefinedChannels.length > predefinedPage * 10;
    if (hasMorePredefined) {
      await loadMorePredefinedChannels();
    }

    const hasMoreRegular = channelNames.length > page * 10;
    if (hasMoreRegular) {
      await loadMoreMessages();
    }

    if (!hasMorePredefined && !hasMoreRegular) {
      setHasMoreChannels(false);
    }

    setLoadingMore(false);

    setTimeout(() => {
      setIsViewMoreDisabled(false);
    }, 15000);
  };

  return (
    <div>
      {/* Render original Telegram results */}
      {(filter === "all" || filter === "telegram") &&
        searchResults.telegram && (
          <TelegramMessageBox
            messages={filterAndPrioritizeMessages(
              searchResults.telegram,
              keywords
            )}
            onSelectMessage={(message) => onSelectMessage("telegram", message)}
            searchQuery={searchQuery}
          />
        )}

      {/* Render additional results */}
      {(filter === "all" || filter === "telegram") &&
        additionalResults.length > 0 && (
          <TelegramMessageBox
            messages={additionalResults}
            onSelectMessage={(message) => onSelectMessage("telegram", message)}
            searchQuery={searchQuery}
          />
        )}

      {/* Render "View More" button */}
      {searchQuery && hasMoreChannels && !loadingMore && (
        <LoadMoreButton onClick={handleViewMore} disabled={isViewMoreDisabled} />
      )}

      {/* Render loading indicator */}
      {loadingMore && <LoadingIndicator />}
    </div>
  );
};

export default BoxContainer;