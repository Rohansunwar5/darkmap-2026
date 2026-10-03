import { createContext, useState, useContext } from 'react';

const SearchContext = createContext();

export const SearchProvider = ({ children }) => {
  const [MenuSearchQuery, MenuSetSearchQuery] = useState('');

  return (
    <SearchContext.Provider value={{ MenuSearchQuery, MenuSetSearchQuery }}>
      {children}
    </SearchContext.Provider>
  );
};

export const useSearch = () => {
  return useContext(SearchContext);
};