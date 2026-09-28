import { useState, useEffect } from 'react';

const useSearchResults = (searchBarResults) => {
  const [searchResults, setSearchResults] = useState({
    telegram: [],
  });

  useEffect(() => {
    if (searchBarResults) {
      setSearchResults({
        telegram: searchBarResults.telegram ?? [],
      });
      return;
    }

    setSearchResults({ telegram: [] });
  }, [searchBarResults]);

  const getTotalResultsCount = () => {
    const count = Object.values(searchResults).reduce((acc, curr) => {
      if (Array.isArray(curr)) {
        return acc + curr.length;
      } else if (curr?.results) {
        return acc + curr.results.length;
      }
      return acc;
    }, 0);
    
    return count > 0 ? count + 10000 : 0;
  };

  return {
    searchResults,
    setSearchResults, // Ensure this is returned
    getTotalResultsCount,
  };
};

export default useSearchResults;