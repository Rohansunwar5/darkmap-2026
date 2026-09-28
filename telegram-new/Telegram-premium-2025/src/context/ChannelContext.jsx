import { createContext, useContext, useState } from 'react';

const ChannelContext = createContext();

export const ChannelProvider = ({ children }) => {
  const [channelName, setChannelName] = useState('noChannel'); 
  
  return (
    <ChannelContext.Provider value={{ channelName, setChannelName }}>
      {children}
    </ChannelContext.Provider>
  );
};

export const useChannel = () => useContext(ChannelContext);