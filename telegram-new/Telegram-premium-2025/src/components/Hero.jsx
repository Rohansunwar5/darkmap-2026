import { useState, useEffect, useRef } from "react";
import { ToastContainer, toast } from 'react-toastify';
import { useNavigate } from "react-router-dom";
import SearchScreenNavbar from "./SearchScreenNavbar";
import { useSearch } from "../context/SearchContext";
import apiClient from "../lib/apiClient";

const Hero = () => {
  const { setSearchQuery, setTriggerSearch, setHeroQuery } = useSearch();
  const [termsSelected, setTermsSelected] = useState(false);
  const searchKeyRef = useRef();
  const [userCredits, setUserCredits] = useState(null);
  const [displayedTextIndex, setDisplayedTextIndex] = useState(0);
  const [navTextIndex, setNavTextIndex] = useState(0);
  const navbarRef = useRef();
  const [searchType, setSearchType] = useState("username"); // New state for search type
  const [showSearchTypeDropdown, setShowSearchTypeDropdown] = useState(false);
  
  const query_text = "Search for your query here...";
  const navTexts = ['Compromised Assets', 'Open Source Data', 'Intelligence', 'Better', 'Faster', 'Deeper'];
  const navigate = useNavigate();

  useEffect(() => {
    if (localStorage.getItem('accessToken')) {
      fetchUserCredits();
    }
  }, []);

  const fetchUserCredits = async () => {
    try {
      const response = await apiClient.get(
        `${import.meta.env.VITE_API_BASE_URL}/auth/profile`
      );
      setUserCredits(response.data?.data?.credits || 0);
    } catch (error) {
      console.error("Error fetching user credits:", error);
      if (error.response?.status === 401) {
        localStorage.removeItem('accessToken');
      }
    }
  };

  const handlePhoneNumberSearch = async (phoneNumber) => {
    try {
      const response = await apiClient.post(
        `${import.meta.env.VITE_API_BASE_URL}/telegram/check-phone`,
        { phoneNumber }
      );

      const data = response.data;

      if (!data.success || !data.userId) {
        throw new Error("No user ID found for this phone number");
      }

      return data.userId;
    } catch (error) {
      console.error("Error processing phone number:", error);
      toast.error(error.response?.data?.error || error.message || "Failed to fetch phone number details");
      throw error;
    }
  };

  const search = async (searchKey) => {
    if (searchKey === "" || termsSelected === false) {
      toast.error("Please enter a search query and accept the terms and conditions.");
      return;
    }

    const isLoggedIn = !!localStorage.getItem('accessToken');
    
    if (!isLoggedIn) {
      toast.error("Please log in to perform searches.");
      navigate('/login', { state: { from: 'search', query: searchKey } });
      return;
    }

    try {
      let finalSearchKey = searchKey.trim().replace(/^@+/, "");
      
      if (searchType === "phone") {
        finalSearchKey = await handlePhoneNumberSearch(searchKey);
      }

      setHeroQuery(finalSearchKey);
      setTriggerSearch(true);
      navigate('/generic');
    } catch (error) {
      console.error("Search failed:", error);
    }
  };

  // Typewriter effect
  useEffect(() => {
    const speed = 100;
    const interval = setInterval(() => {
      setDisplayedTextIndex((prev) => {
        if (prev >= query_text.length + (1000 / speed)) {
          return 0;
        }
        return prev + 1;
      });
    }, speed);
    return () => clearInterval(interval);
  }, []);

  // Nav text cycling effect
  useEffect(() => {
    const timer = setInterval(() => {
      setNavTextIndex((index) => (index + 1 >= navTexts.length ? 0 : index + 1));
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const toggleMenu = (open) => {
    navbarRef.current.classList.toggle('hidden', !open);
  };

  return (
    <div className="h-screen w-screen flex flex-col code-font" style={{ backgroundImage: 'url(/globe.jpeg)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <ToastContainer position="top-right" autoClose={5000} />
      <SearchScreenNavbar></SearchScreenNavbar>
      <div className='flex flex-grow flex-col justify-start items-center mt-[6rem]'>
        <div className='w-1/2 md:w-[20rem] z-10 mb-4'>
          <img src='logo.png' className='z-10 p-4 mb-10'></img>
          <img src='logo_text.png' style={{ backdropFilter: 'blur(2px)' }} className='w-full z-10 mb-2'></img>
        </div>

        <form className="mt-4 self-stretch">
          <div className="flex justify-center">
            {/* Updated dropdown button with original styling */}
            <div className="relative">
              <button
                id="dropdown-button"
                className="flex-shrink-0 z-10 inline-flex items-center py-3 px-4 text-sm font-medium text-center text-white bg-blue-700 rounded-s-lg hover:bg-blue-800 focus:outline-none "
                type="button"
                onClick={() => setShowSearchTypeDropdown(!showSearchTypeDropdown)}
                style={{
                  padding: '0.75rem 1rem',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                {searchType === "username" ? "Global" : "Phone"}
                <svg className="w-2.5 h-2.5 ms-2.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 10 6">
                  <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m1 1 4 4 4-4" />
                </svg>
              </button>
              {showSearchTypeDropdown && (
                <div className="absolute z-20 mt-1 w-full bg-white rounded-md shadow-lg border border-gray-200">
                  <button
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    onClick={() => {
                      setSearchType("username");
                      setShowSearchTypeDropdown(false);
                    }}
                  >
                    Global
                  </button>
                  <button
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 border-t border-gray-100"
                    onClick={() => {
                      setSearchType("phone");
                      setShowSearchTypeDropdown(false);
                    }}
                  >
                    Phone Number
                  </button>
                </div>
              )}
            </div>
            <div className="w-5/12 flex shadow-[0_20px_40px_-10px_#008fff]">
              <input 
                type="search" 
                ref={searchKeyRef} 
                id="search-dropdown" 
                className="block py-3 px-5 z-20 text-sm text-white bg-black flex-grow" 
                placeholder={
                  searchType === "username" 
                    ? query_text.substring(0, displayedTextIndex) 
                    : "Enter phone number (e.g., +919922398146)"
                } 
                required 
              />
            </div>
            <div 
              onClick={(e) => { search(searchKeyRef.current.value) }} 
              className="self-stretch text-center end-0 px-4 flex justify-center items-center text-sm font-medium text-white bg-blue-600 rounded-e-lg border border-blue-600 hover:bg-white focus:ring-4 focus:outline-none focus:ring-blue-300"
            >
              <svg className="size-3 text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20">
                <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z" />
              </svg>
              <span className="sr-only">Search</span>
            </div>
            <div className="bg-blue-600 flex justify-center items-center px-3 rounded-lg ms-2 text-white">
              {userCredits !== null ? (
                <>
                  <div className="pe-1">{userCredits}</div>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                  </svg>
                </>
              ) : (
                <span className="text-sm">No credits</span>
              )}
            </div>
          </div>
        </form>
        <div className="font-default-sans flex justify-center rounded-b-3xl text-gray-500 items-center pt-1 pb-2 border-t border-blue-900 px-6 bg-black shadow-[0_20px_40px_-10px_#008fff]">
          <input type="checkbox" className="size-4 me-2" value={termsSelected} onChange={(e) => { setTermsSelected(e.target.checked) }}></input>
          I accept the&nbsp;<span className="text-blue-900 underline">Terms and Conditions</span>
        </div>
      </div>
    </div>
  );
};

export default Hero;