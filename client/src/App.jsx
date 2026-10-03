import "./App.css";
import Hero from "./components/Hero";
import { Analytics } from "@vercel/analytics/react";
import { BackgroundBeamsDemo } from "./test";

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./components/Login";
import Genric from "./pages/Genric";
import PrivateRoute from "./components/PrivateRoute";
import "./styles/styles.css";
import { useState } from "react";
import SignUp from "./components/SignUp";
import Profile from "./components/Profile";
import Payment from "./components/Payment";
import AdminPrivateRoute from "./components/AdminPrivateRoute";
import AdminMe from "./pages/AdminMe";
import { SearchProvider } from "./contexts/SearchContext";
import { Provider } from "react-redux";
import { store } from "./store";

function App() {
  const [searchBarResults, setSearchBarResults] = useState(null);

  const handleSearch = (results, query) => {
    setSearchBarResults(results?.searchBarResults || null);
  };

  return (
    <>
      <Analytics />
      <Provider store={store}>
      <SearchProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Hero onSearch={handleSearch} />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/generic"
            element={
              <PrivateRoute>
                <Genric searchBarResults={searchBarResults} />
              </PrivateRoute>
            }
          />
          <Route path="/signup" element={<Navigate to="/login" replace />} />
          <Route path="/admin/me" element={<AdminPrivateRoute><AdminMe /></AdminPrivateRoute>} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/payment" element={<Payment />} />
        </Routes>
      </BrowserRouter>
      </SearchProvider>
      </Provider>
    </>
  );
}

export default App;
