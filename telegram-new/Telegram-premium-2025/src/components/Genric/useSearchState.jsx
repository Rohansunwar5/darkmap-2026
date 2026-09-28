import { useState } from 'react';

const useSearchState = () => {
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [selectedType, setSelectedType] = useState("");
  const [loading, setLoading] = useState(false);
  const [channelNames, setChannelNames] = useState([]);
  const [predefinedChannels, setPredefinedChannels] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOption, setSelectedOption] = useState(null);
  const [selectedFilter, setSelectedFilter] = useState("all");

  const handleFilterChange = (filter) => {
    setSelectedFilter(filter);
  };

  const handleSearch = (
    results,
    isLoading,
    allChannels = [],
    query = "",
    predefinedChannels = []
  ) => {
    setLoading(isLoading);

    if (results) {
      setChannelNames(allChannels);
      setPredefinedChannels(predefinedChannels);
      setSearchQuery(query);
      setLoading(false);
      return results;
    }
  };

  const handleSelectMessage = (type, message) => {
    setSelectedMessage(message);
    setSelectedType(type);
  };

  return {
    selectedMessage,
    selectedType,
    loading,
    channelNames,
    predefinedChannels,
    searchQuery,
    selectedOption,
    selectedFilter,
    handleFilterChange,
    handleSearch,
    handleSelectMessage,
    setSelectedOption,
  };
};

export default useSearchState;