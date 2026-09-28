import "./App.css";
import Hero from "./components/Hero";

import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";

import Genric from "./pages/Genric";

import "./styles/styles.css";
import { useState } from "react";
import { LogInScreen } from "./components/Login";
import { SignUpScreen } from "./components/SignUp";
import PrivateRoute from "./components/PrivateRoute";
import PricingScreen from "./pages/Payments";
import { TelegramProvider } from "./context/TelegramContext";
import { ChannelProvider } from "./context/ChannelContext";
import { SearchProvider } from "./context/SearchContext";
import Dashboard from "./pages/dashboard/Dashboard";
import { OverlayProvider } from "./pages/dashboard/components/OverlaySystem";
import GroupSearchComponent from "./pages/GroupSearch";
import { AuthProvider } from "./context/AuthContext";
import { DashboardContext } from "./pages/dashboard/DashboardContext";
import ViewBookmarksComponent from "./pages/Bookmarks";
import Sidenav from "./pages/dashboard/components/Sidenav";
import { ToastContainer } from "react-toastify";
import { DecoyProvider } from "./context/DecoyContext";
import DecoyPage from "./pages/decoy/DecoyPage";
import DecoyChat from "./pages/decoy/DecoyChat";
import AdminAccountsPage from "./pages/decoy/AdminAccountsPage";
import GenericDecoyPage from "./pages/decoy/GenericDecoyPage";
import Account from "./pages/Account";
import Support from "./pages/Support";
import ActivityLayout from "./pages/activity/ActivityLayout";
import SuperAdminRoute from "./components/SuperAdminRoute";
import AdminDashboard from "./pages/admin/AdminDashboard";

function GroupLayout() {
  return (
    <DashboardContext>
      <ToastContainer/>
        <div className="h-dvh w-dvw flex bg-[rgb(0_8_15)] text-white">
          <Sidenav />
          <div className="grow overflow-scroll">
            <Outlet /> {/* <-- This is where nested routes render */}
          </div>
        </div>
    </DashboardContext>
  );
}


function App() {
  const [searchBarResults, setSearchBarResults] = useState(null);

  const handleSearch = (results, query) => {
    console.log("Search Results:::", results);
    setSearchBarResults(results?.searchBarResults ?? null);
  };

  return (
    <>
      <AuthProvider>
        <SearchProvider>
          <ChannelProvider>
            <TelegramProvider>
              <DecoyProvider>
                <BrowserRouter>
                  <Routes>
                  <Route path="/" element={<Hero onSearch={handleSearch} />} />
                  <Route path="/login" element={<LogInScreen />} />
                  <Route
                    path="/me"
                    element={
                      <PrivateRoute>
                        <Account />
                      </PrivateRoute>
                    }
                  />
                  <Route
                    path="/support"
                    element={
                      <PrivateRoute>
                        <Support />
                      </PrivateRoute>
                    }
                  />
                  <Route
                    path="/generic"
                    element={
                      <PrivateRoute>
                        <Genric searchBarResults={searchBarResults} />
                      </PrivateRoute>
                    }
                  />
                  <Route
                    path="/generic/decoy"
                    element={
                      <PrivateRoute>
                        <GenericDecoyPage />
                      </PrivateRoute>
                    }
                  />

                  <Route path="/group" element={
                    <PrivateRoute>
                      <OverlayProvider>
                        <GroupLayout />
                      </OverlayProvider>
                    </PrivateRoute>
                  }>
                    <Route path="search" element={<GroupSearchComponent />} />
                    <Route path="analysis" element={<Dashboard />} />
                    <Route path="analysis/:bookmark_id" element={<Dashboard mode={'bookmark'} />} />
                    <Route path="history/:bookmark_id/:scrape_id" element={<Dashboard mode={'history'} />} />
                    <Route path="bookmarks" element={<ViewBookmarksComponent />} />
                    {/* <Route path="decoy" element={<DecoyPage />} /> */}
                    {/* <Route path="decoy/:id" element={<DecoyChat />} /> */}
                  </Route>

                  <Route
                    path="/activity"
                    element={
                      <PrivateRoute>
                        <ActivityLayout />
                      </PrivateRoute>
                    }
                  />

                  {/* Super Admin Dashboard */}
                  <Route
                    path="/admin/me"
                    element={
                      <SuperAdminRoute>
                        <AdminDashboard />
                      </SuperAdminRoute>
                    }
                  />

                  {/* Admin portal — completely independent of user auth */}
                  <Route path="/admin/decoy-accounts" element={<AdminAccountsPage />} />
                  <Route path="/payment" element={<PricingScreen />} />
                  {/* <Route path="/signup" element={<SignUpScreen />} /> */}
                </Routes>
              </BrowserRouter>
              </DecoyProvider>
            </TelegramProvider>
          </ChannelProvider>
        </SearchProvider>
      </AuthProvider>
    </>
  );
}

export default App;
