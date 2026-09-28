import { createContext, useContext, useState } from 'react';

const SearchContext = createContext();

export const SearchProvider = ({ children }) => {
  const [triggerSearch, setTriggerSearch] = useState(false);
  const [heroQuery, setHeroQuery] = useState('');
  const [currentSearchId, setCurrentSearchId] = useState(null);

  return (
    <SearchContext.Provider value={{ 
      triggerSearch, setTriggerSearch,   
      heroQuery, setHeroQuery,
      currentSearchId, setCurrentSearchId
    }}>
      {children}
    </SearchContext.Provider>
  );
};

export const useSearch = () => {
  return useContext(SearchContext);
};

