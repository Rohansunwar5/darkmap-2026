// TelegramContext.js
import { createContext, useContext, useState } from 'react';

const TelegramContext = createContext();

export const TelegramProvider = ({ children }) => {
  const [telegramMessages, setTelegramMessages] = useState(null);

  return (
    <TelegramContext.Provider value={{ telegramMessages, setTelegramMessages }}>
      {children}
    </TelegramContext.Provider>
  );
};

export const useTelegramContext = () => useContext(TelegramContext);