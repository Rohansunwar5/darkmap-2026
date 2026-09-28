import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../hooks/redux";
import {  selectSearchQuery, selectIsSearchDisabled, selectIsAuthenticated, selectAuthHeaders, selectSearchLoading, } from "../store/selectors/searchSelectors";
import {  performGlobalSearch,
  setSearchQuery,
  setIsSearchDisabled,
  resetSearchResults, } from "../store/slices/searchSlice";

const SearchBar = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  //redux state
  const searchQuery = useAppSelector(selectSearchQuery);
  const isSearchDisabled = useAppSelector(selectIsSearchDisabled);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const authHeaders = useAppSelector(selectAuthHeaders);
  const loading = useAppSelector(selectSearchLoading);

  //local state
  const [termsSelected, setTermsSelected] = useState(false);
  const [showSearchTypeDropdown, setShowSearchTypeDropdown] = useState(false);
  const [showInactivityModal, setShowInactivityModal] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();

    if(!termsSelected) {
      alert('Please agree to the terms and conditions');
      return;
    }

    if(!isAuthenticated) {
      navigate('/login');
      return;
    }

    if(!searchQuery.trim()) {
      alert("Please enter a search query");
      return;
    }

    dispatch(resetSearchResults());
    dispatch(setIsSearchDisabled(true));

    try {
      const result = await dispatch(performGlobalSearch({
        searchQuery,
        authHeaders,
      })).unwrap();

      if(result.showInactivityModal) {
        dispatch(setShowInactivityModal(true));
        setShowInactivityModal(true);        
      } else  {
        navigate('/generic');
      }

    } catch (error) {
      console.error('Error fetching data: ',error);
      navigate('/generic');
    }

    setTimeout(() => {
      dispatch(setIsSearchDisabled(false));
    },  15000);
  }

  const handleSearchQueryChange = (e) => {
    dispatch(setSearchQuery(e.target.value));
  };

  const handleCloseInactivityModal = () => {
    dispatch(setShowInactivityModal(false));
    setShowInactivityModal(false);
  }

  const query_text = "Search for your query here...";
  const [displayedTextIndex, setDisplayedTextIndex] = useState(0);

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

  return (
    <>
      <form onSubmit={handleSearch} className="mt-4 self-stretch">
        <div className="flex justify-center">
          <div className="relative">
            <button
              id="dropdown-button"
              className="flex-shrink-0 z-10 inline-flex items-center py-3 px-4 text-sm font-medium text-center text-white bg-blue-700 rounded-s-lg hover:bg-blue-800 focus:outline-none"
              type="button"
              onClick={() => setShowSearchTypeDropdown(!showSearchTypeDropdown)}
              style={{
                padding: '0.75rem 1rem',
                height: '100%',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              Global
              <svg className="w-2.5 h-2.5 ms-2.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 10 6">
                <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m1 1 4 4 4-4" />
              </svg>
            </button>
            {showSearchTypeDropdown && (
              <div className="absolute z-20 mt-1 w-full bg-white rounded-md shadow-lg border border-gray-200">
                <button
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => {
                    setShowSearchTypeDropdown(false);
                  }}
                >
                  Global
                </button>
              </div>
            )}
          </div>
          <div className="w-5/12 flex shadow-[0_20px_40px_-10px_#008fff]">
            <input 
              type="search" 
              id="search-dropdown" 
              className="block py-3 px-5 z-20 text-sm text-white bg-black flex-grow" 
              placeholder={query_text.substring(0, displayedTextIndex)}
              value={searchQuery}
              onChange={handleSearchQueryChange}
              required 
            />
          </div>
          <button 
            type="submit"
            disabled={isSearchDisabled || loading}
            className="self-stretch text-center end-0 px-4 flex justify-center items-center text-sm font-medium text-white bg-blue-600 rounded-e-lg border border-blue-600 hover:bg-white focus:ring-4 focus:outline-none focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Searching...</span>
              </div>
            ) : (
              <>
                <svg className="size-3 text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20">
                  <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z" />
                </svg>
                <span className="sr-only">Search</span>
              </>
            )}
          </button>
        </div>
      </form>
      <div className="font-default-sans flex justify-center rounded-b-3xl text-gray-500 items-center pt-1 pb-2 border-t border-blue-900 px-6 bg-black shadow-[0_20px_40px_-10px_#008fff]">
        <input 
          type="checkbox" 
          className="size-4 me-2" 
          checked={termsSelected} 
          onChange={(e) => { setTermsSelected(e.target.checked) }}
        />
        I accept the&nbsp;<span className="text-blue-900 underline">Terms and Conditions</span>
      </div>
      
      {/* Inactivity Modal */}
      {showInactivityModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              No Results Found
            </h3>
            <p className="text-gray-600 mb-4">
              Your search didn't return any results. This might be due to inactivity or the search terms not matching any content.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={handleCloseInactivityModal}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SearchBar;