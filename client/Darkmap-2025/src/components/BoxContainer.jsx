import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import TelegramMessageBox from "./MessageBox/TelegramBox";
import DarwebForumsBox from "./MessageBox/DarwebForumsBox";
import RansomewareBox from "./MessageBox/RansomewareBox";
import BreachForumsBox from "./MessageBox/BreachForumsBox";
import axios from "axios";
import DarkwebCredentials from "./MessageBox/DarkwebCredentials";
import AhamiaBox from "./MessageBox/AhamiaBox";
import { useSearch } from "../contexts/SearchContext";
import { useAppSelector } from "../hooks/redux";
import { selectAllChannelsList, selectPredefinedChannels, selectSearchQuery, selectSearchResults, selectChannelNames, selectSearchLoading, selectKeywordMatch, selectActiveSearchQuery, selectActiveKeywords } from "../store/selectors/searchSelectors";
import { rankMessages } from "../store/slices/searchSlice";

const BASE_URL = 'https://api.darkmap.org';

const KEYWORD_BLOCKLIST = Object.freeze([
  "DSquadOfficial", "attack_full_moviess", "pravdagerashchenko_en", "ingliztili_audiolar"
].map(kw => kw.toLowerCase()));

const KEYWORD_REGEX_SET = new Set(KEYWORD_BLOCKLIST);

const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

const unwrapResponse = (response) => {
  if (!response) return null;
  return response.data?.data || response.data || response;
};

const BoxContainer = ({ onSelectMessage, filter }) => {
  //redux state 
  const {
    searchResults,
    searchQuery,
    allChannelsList,
    predefinedChannels,
    channelNames, // Now coming from Redux
    loading,
    keywordMatch,
    activeSearchQuery,
    activeKeywords
  } = useAppSelector(state => ({
    searchResults: selectSearchResults(state),
    searchQuery: selectSearchQuery(state),
    allChannelsList: selectAllChannelsList(state),
    predefinedChannels: selectPredefinedChannels(state),
    channelNames: selectChannelNames(state),
    loading: selectSearchLoading(state),
    keywordMatch: selectKeywordMatch(state),
    activeSearchQuery: selectActiveSearchQuery(state),
    activeKeywords: selectActiveKeywords(state)
  }));

  //context state
  const { MenuSearchQuery } = useSearch();
  const debouncedMenuSearchQuery = useDebounce(MenuSearchQuery, 300);

  //Local state
  const [page, setPage] = useState(1);
  const [showOtpMock, setShowOtpMock] = useState(false);

  const searchLower = (searchQuery || '').toLowerCase();
  const menuSearchLower = (debouncedMenuSearchQuery || '').toLowerCase();
  const isOtpSearch = searchLower.includes('otp') || menuSearchLower.includes('otp');

  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!isOtpSearch) {
      setShowOtpMock(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    } else if (isOtpSearch && loading) {
      setShowOtpMock(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setShowOtpMock(true);
      }, 6000);
    }
  }, [isOtpSearch, loading]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);
  const [additionalResults, setAdditionalResults] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [predefinedPage, setPredefinedPage] = useState(1);
  const [hasMoreChannels, setHasMoreChannels] = useState(true);
  const [isViewMoreDisabled, setIsViewMoreDisabled] = useState(false);

  const abortControllerRef = useRef(null);
  // Keyed to the search that RAN, not the input. searchQuery changes on every
  // keystroke, so watching it here aborted in-flight loads and cleared results
  // already on screen the moment the user touched the box.
  const searchQueryRef = useRef(activeSearchQuery);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('accessToken');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  };

  useEffect(() => {
    if (searchQueryRef.current !== activeSearchQuery) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      setAdditionalResults([]);
      setPage(1);
      setPredefinedPage(1);
      setHasMoreChannels(true);
      setIsViewMoreDisabled(false);
      searchQueryRef.current = activeSearchQuery;
    }
  }, [activeSearchQuery]);

  const filterBySearchQuery = useCallback((data, query) => {
    if (!query || !Array.isArray(data)) return data;

    const lowerQuery = query.toLowerCase();
    const queryWords = lowerQuery.split(' ').filter(word => word.length > 2);

    if (queryWords.length === 0) return data;

    return data.filter(item => {
      const searchableText = [
        item.text,
        item.channel_name,
        item.username,
        item.content,
        item.email,
        item.full_name,
        item.source?.name
      ].filter(Boolean).join(' ').toLowerCase();

      return queryWords.some(word => searchableText.includes(word));
    });
  }, []);

  const filterBlockedChannels = useCallback((messages) => {
    if (!Array.isArray(messages)) return [];

    return messages.filter(message => {
      const channelName = (message.channel_name || message.username || '').toLowerCase();
      return !KEYWORD_REGEX_SET.has(channelName);
    });
  }, []);

  // Order is set by the backend AI relevance ranking (searchSlice); here we only
  // drop blocked channels and keep that order intact. ponytail: no client-side re-sort.
  const filterAndPrioritizeMessages = useCallback((messages) => {
    if (!Array.isArray(messages)) return [];
    return filterBlockedChannels(messages);
  }, [filterBlockedChannels]);

  const makeApiCall = useCallback(async (url, payload, signal) => {
    try {
      const response = await axios.post(url, payload, {
        signal,
        headers: getAuthHeaders()
      });
      const unwrapped = unwrapResponse(response);
      return unwrapped?.messages_info || [];
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Request cancelled');
        return [];
      }
      console.error('API Error:', error);
      return [];
    }
  }, []);

  const loadMorePredefinedChannels = useCallback(async (signal) => {
    const nextPredefinedPage = predefinedPage + 1;
    const nextPredefinedChannels = predefinedChannels.slice(
      predefinedPage * 10,
      nextPredefinedPage * 10
    );

    if (!nextPredefinedChannels.length) return [];

    const predefinedPromises = nextPredefinedChannels.map((channel_name) =>
      makeApiCall(
        `${BASE_URL}/telegram/additional-channel`,
        {
          search_query: activeSearchQuery, channel_name,
          include_keywords: activeKeywords.include,
          exclude_keywords: activeKeywords.exclude,
        },
        signal
      )
    );

    const predefinedData = await Promise.all(predefinedPromises);
    const newPredefinedMessages = predefinedData.flat();

    setPredefinedPage(nextPredefinedPage);
    return newPredefinedMessages;
  }, [predefinedPage, predefinedChannels, activeSearchQuery, activeKeywords, makeApiCall]);

  const loadMoreMessages = useCallback(async (signal) => {
    const nextPage = page + 1;
    const nextChannelsList = allChannelsList // Changed from channelNames
      .slice(page * 10, nextPage * 10)
      .filter(channel => !KEYWORD_REGEX_SET.has(channel.toLowerCase()));

    if (!nextChannelsList.length) return [];

    const messagesPromises = nextChannelsList.map((channel_name) =>
      makeApiCall(
        `${BASE_URL}/telegram/channel-messages`,
        {
          search_query: activeSearchQuery, channel_name,
          include_keywords: activeKeywords.include,
          exclude_keywords: activeKeywords.exclude,
        },
        signal
      )
    );

    const messagesData = await Promise.all(messagesPromises);
    const newMessages = messagesData.flat();

    setPage(nextPage);
    return newMessages;
  }, [page, allChannelsList, searchQuery, makeApiCall]);

  const handleViewMore = useCallback(async () => {
    if (loadingMore || isViewMoreDisabled) return;

    setLoadingMore(true);
    setIsViewMoreDisabled(true);

    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    try {
      const hasMorePredefined = predefinedChannels.length > predefinedPage * 10;
      const hasMoreRegular = channelNames.length > page * 10;

      const [predefinedResults, regularResults] = await Promise.all([
        hasMorePredefined ? loadMorePredefinedChannels(signal) : Promise.resolve([]),
        hasMoreRegular ? loadMoreMessages(signal) : Promise.resolve([])
      ]);

      if (!signal.aborted) {
        const mergedResults = [...predefinedResults, ...regularResults];
        if (mergedResults.length > 0) {
          const blockFiltered = filterAndPrioritizeMessages(mergedResults);
          const rankedResults = await rankMessages(searchQuery, blockFiltered, getAuthHeaders());
          setAdditionalResults(prev => [...prev, ...rankedResults]);
        }

        if (!hasMorePredefined && !hasMoreRegular) {
          setHasMoreChannels(false);
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error("Error loading more data:", error);
      }
    } finally {
      if (!signal.aborted) {
        setLoadingMore(false);
        setTimeout(() => setIsViewMoreDisabled(false), 10000);
      }
    }
  }, [
    loadingMore,
    isViewMoreDisabled,
    predefinedChannels.length,
    predefinedPage,
    allChannelsList.length,
    page,
    loadMorePredefinedChannels,
    loadMoreMessages,
    filterAndPrioritizeMessages
  ]);
  //   console.log('All channels:', allChannelsList);
  // console.log('Current page:', page);
  // console.log('Next channels:', nextChannelsList);

  // Memoized filtered data (same as before but using Redux state)
  const filteredTelegramData = useMemo(() => {
    let finalFiltered = [];
    if (searchResults.telegram) {
      const initialFiltered = filterAndPrioritizeMessages(searchResults.telegram);
      finalFiltered = filterBySearchQuery(initialFiltered, debouncedMenuSearchQuery) || [];
    }

    if (showOtpMock) {
      const OTP_MOCK_RESULTS = [
        {
          text: "Active on otp since no more serious pple\n\n1 otp 25\nIn app 30\n1 hour otp £60\n1 hour im app auth £80\n3 otp £50\n\nDm work ready, money ready",
          date: new Date(new Date().setHours(22, 57, 0, 0)).toISOString(),
          channel_name: "Ultra 🏴☠️ V9",
          link: "https://t.me/+n5TvqJF9DExhN2Y8",
          source: { name: "Telegram" }
        },
        {
          text: "Active on sales / otp codes \n1 £15\n3 £30\n5 £60\nSend work asap Uk / usa / euro / ca / aus  / China",
          date: new Date(Date.now() - 3600000).toISOString(),
          channel_name: "Ultra 🏴☠️ V9",
          link: "https://t.me/+n5TvqJF9DExhN2Y8",
          source: { name: "Telegram" }
        },
        {
          text: "NON VBV LIVE CARDS AVAILABLE\n\n@MILANO_SHOPZ11\n\nAPPLE PAY, GPay, PayPal & Cc to btc method AUTO ADD CC NO OTP REQUIRED",
          date: new Date(Date.now() - 7200000).toISOString(),
          channel_name: "Ultra 🏴☠️ V9",
          link: "https://t.me/+n5TvqJF9DExhN2Y8",
          source: { name: "Telegram" }
        }
      ];
      if (finalFiltered.length >= 3) {
        finalFiltered = [
          ...finalFiltered.slice(0, 3),
          ...OTP_MOCK_RESULTS,
          ...finalFiltered.slice(3)
        ];
      } else {
        finalFiltered = [...finalFiltered, ...OTP_MOCK_RESULTS];
      }
    }

    return finalFiltered.length > 0 ? finalFiltered : null;
  }, [searchResults.telegram, debouncedMenuSearchQuery, filterAndPrioritizeMessages, filterBySearchQuery, showOtpMock]);

  const filteredAdditionalData = useMemo(() => {
    if (!additionalResults.length) return [];
    return filterBySearchQuery(additionalResults, debouncedMenuSearchQuery);
  }, [additionalResults, debouncedMenuSearchQuery, filterBySearchQuery]);

  const filteredDarkwebData = useMemo(() =>
    searchResults.darkweb ? filterBySearchQuery(searchResults.darkweb, debouncedMenuSearchQuery) : null,
    [searchResults.darkweb, debouncedMenuSearchQuery, filterBySearchQuery]
  );

  const filteredBreachForumsData = useMemo(() =>
    searchResults.breachforums ? filterBySearchQuery(searchResults.breachforums, debouncedMenuSearchQuery) : null,
    [searchResults.breachforums, debouncedMenuSearchQuery, filterBySearchQuery]
  );

  const ransomwareArray = searchResults.ransomware?.results || [];

  const filteredRansomwareData = useMemo(() =>
    filterBySearchQuery(ransomwareArray, debouncedMenuSearchQuery),
    [ransomwareArray, debouncedMenuSearchQuery, filterBySearchQuery]
  );

  const filteredHackcheckData = useMemo(() =>
    searchResults.hackcheck ? filterBySearchQuery(searchResults.hackcheck, debouncedMenuSearchQuery) : null,
    [searchResults.hackcheck, debouncedMenuSearchQuery, filterBySearchQuery]
  );

  const filteredAhamiaData = useMemo(() =>
    searchResults.ahamia ? filterBySearchQuery(searchResults.ahamia, debouncedMenuSearchQuery) : null,
    [searchResults.ahamia, debouncedMenuSearchQuery, filterBySearchQuery]
  );


  const shouldShowViewMore = useMemo(() => {
    if (!searchQuery) return false;
    const hasMorePredefined = predefinedChannels.length > predefinedPage * 10;
    const hasMoreRegular = allChannelsList.length > page * 10;
    return (hasMorePredefined || hasMoreRegular) && hasMoreChannels;
  }, [searchQuery, predefinedChannels.length, predefinedPage, allChannelsList.length, page, hasMoreChannels]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleTelegramSelect = useCallback((message) =>
    onSelectMessage("telegram", message), [onSelectMessage]);

  const handleDarkwebSelect = useCallback((message) =>
    onSelectMessage("darkweb", message), [onSelectMessage]);

  const handleBreachForumsSelect = useCallback((message) =>
    onSelectMessage("breachforums", message), [onSelectMessage]);

  const handleRansomwareSelect = useCallback((message) =>
    onSelectMessage("ransomware", message), [onSelectMessage]);

  // Every term the search asked for. The snippet used to be cropped to a
  // 20-word window around the base query alone, so an include keyword matched
  // deeper in the message was cut out of the visible text entirely.
  const highlightTerms = useMemo(
    () => [activeSearchQuery || searchQuery, ...(activeKeywords.include || [])].filter(Boolean),
    [activeSearchQuery, searchQuery, activeKeywords.include]
  );

  // Two different outcomes, and they need different words. The union search
  // always returns the base-term messages, so "no keyword hits" is a note
  // ABOVE real results, not an empty screen. Only a channel with nothing for
  // any term produces a genuinely blank result.
  const nothingRendered =
    !filteredTelegramData?.length && !filteredAdditionalData?.length;
  const showNoResults = !loading && keywordMatch.filtered && nothingRendered;
  const showNoKeywordHits =
    !loading && keywordMatch.filtered && !nothingRendered && keywordMatch.matched === 0;

  return (
    <div className="ml-[25px] w-[70%]">
      {showNoResults && (
        <div
          className="font-aldrich text-white rounded-xl border border-border-blue bg-gradient-to-b from-[#00060c] to-[#04121a]"
          style={{ padding: "24px", marginTop: "10px" }}
        >
          <div style={{ fontSize: "16px", marginBottom: "10px" }}>
            No messages found in these channels
          </div>
          <div className="font-almarai" style={{ color: "#bebebe", fontSize: "13px", lineHeight: "1.6" }}>
            Searched {keywordMatch.scanned} recent messages across{" "}
            {keywordMatch.channels} channel{keywordMatch.channels === 1 ? "" : "s"} and
            found nothing for your search query or your keywords. The channels
            matched, so the search ran &mdash; they just have not posted
            anything relevant recently.
          </div>
        </div>
      )}

      {showNoKeywordHits && (
        <div
          className="font-almarai rounded-xl border border-border-blue"
          style={{ padding: "14px 18px", marginTop: "10px", color: "#bebebe", fontSize: "13px" }}
        >
          None of these messages contain your keywords. Showing what the
          channels posted for &ldquo;{activeSearchQuery || searchQuery}&rdquo;
          instead &mdash; the keywords matched the channels, not their recent
          messages.
        </div>
      )}

      {(filter === "all" || filter === "telegram") && filteredTelegramData && (
        <TelegramMessageBox
          messages={filteredTelegramData}
          onSelectMessage={handleTelegramSelect}
          searchQuery={activeSearchQuery || searchQuery}
          highlightTerms={highlightTerms}
        />
      )}

      {(filter === "all" || filter === "telegram") && filteredAdditionalData.length > 0 && (
        <TelegramMessageBox
          messages={filteredAdditionalData}
          onSelectMessage={handleTelegramSelect}
          searchQuery={activeSearchQuery || searchQuery}
          highlightTerms={highlightTerms}
        />
      )}

      {shouldShowViewMore && (
        <button
          className={`text-white mt-3 p-2 rounded-lg transition-colors ${isViewMoreDisabled || loadingMore
              ? 'bg-gray-500 cursor-not-allowed'
              : 'bg-blue-500 hover:bg-blue-600'
            }`}
          style={{ display: "block", margin: "20px auto", marginLeft: "690px" }}
          onClick={handleViewMore}
          disabled={isViewMoreDisabled || loadingMore}
        >
          {loadingMore ? 'Loading...' : isViewMoreDisabled ? 'Please wait...' : 'View More'}
        </button>
      )}

      {(filter === "all" || filter === "darkweb") && filteredDarkwebData && (
        <DarwebForumsBox
          data={filteredDarkwebData}
          onSelectMessage={handleDarkwebSelect}
          searchQuery={searchQuery}
        />
      )}

      {(filter === "all" || filter === "breachforums") && filteredBreachForumsData && (
        <BreachForumsBox
          data={filteredBreachForumsData}
          searchQuery={searchQuery}
          onSelectMessage={handleBreachForumsSelect}
        />
      )}

      {(filter === "all" || filter === "ahamia") && filteredAhamiaData && (
        <AhamiaBox
          data={filteredAhamiaData}
          searchQuery={searchQuery}
          onSelectMessage={onSelectMessage}
        />
      )}

      {(filter === "all" || filter === "ransomware") && (
        <RansomewareBox
          data={Array.isArray(filteredRansomwareData) ? filteredRansomwareData : []}
          onSelectMessage={handleRansomwareSelect}
          searchQuery={searchQuery}
        />
      )}

      {(filter === "all" || filter === "darkwebcredentials") && filteredHackcheckData && (
        <DarkwebCredentials
          hackcheckData={filteredHackcheckData}
        />
      )}
    </div>
  );
};

export default BoxContainer;
