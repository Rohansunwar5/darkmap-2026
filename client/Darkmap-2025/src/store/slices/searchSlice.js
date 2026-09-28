import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { BLACKLISTED_CHANNELS, PINNED_CHANNELS, predefinedChannels, otpChannels } from '../../constants/channels';

const BASE_URL = 'https://api.darkmap.org';

const unwrapResponse = (response) => {
  if (!response) return null;
  return response.data?.data || response.data || response;
}

const isPinned = (m) =>
  PINNED_CHANNELS.has(String(m.channel_name || '').trim().toLowerCase());

/**
 * The single ordering for every message list, in three layers.
 *
 * The dork6 exception lives here. The Lambda stamps a `priority` on each
 * message of an advanced search - all terms and clean first, then all terms
 * carrying an excluded word, then the partial matches. Sorting by AI score
 * alone threw that away, which is why the requested order never showed up.
 *
 * A normal search (dorks 1-5) has no `priority`, so this degrades to
 * pinned-first then AI score - the old behaviour plus the pin.
 */
const orderMessages = (messages) => [...messages].sort(
  (a, b) =>
    // 1. pinned channels float to the top, ordered among themselves by the
    //    same rules as everything else
    (isPinned(a) ? 0 : 1) - (isPinned(b) ? 0 : 1)
    // 2. the dork6 priority the Lambda stamped (absent on normal searches)
    || (a.priority ?? Infinity) - (b.priority ?? Infinity)
    // 3. the AI relevance score breaks ties inside a group
    || (b._score ?? 0) - (a._score ?? 0)
);

// Rank telegram messages by cyber-threat relevance via the backend (OpenAI),
// then apply orderMessages. Fail-open: if the model errors the messages still
// come back in pin/priority order rather than unsorted.
export const rankMessages = async (searchQuery, messages, authHeaders, includeKeywords = []) => {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  try {
    const payload = {
      // Rank against the full intent. With only the base term the model scores
      // "apk" relevance and ignores the keywords the analyst actually asked for.
      search_query: [searchQuery, ...includeKeywords].filter(Boolean).join(' '),
      messages: messages.map((m, index) => ({ index, text: m.text || '' })),
    };
    const response = await axios.post(
      `${BASE_URL}/telegram/rank-messages`,
      payload,
      { headers: authHeaders }
    );
    const scores = unwrapResponse(response);
    // Fail open, but never lose the Lambda's ordering when the model is down.
    if (!Array.isArray(scores)) return orderMessages(messages);

    const scoreByIndex = new Map(scores.map(s => [s.index, s.score]));
    const scored = messages.map((m, index) => ({ ...m, _score: scoreByIndex.get(index) ?? 0 }));
    // One ordering for both paths: a normal search has no `priority`, so this
    // degrades to pinned-first then AI score, which is the old behaviour plus
    // the pin.
    return orderMessages(scored);
  } catch (error) {
    return orderMessages(messages);
  }
};

const isChannelErrorResponse = (messages, channel_name) => {
  if (!messages || !messages.length) {
    console.log(`[Retry Check] No messages for channel ${channel_name}`);
    return false;
  }

  const errorPatterns = [
    "can't be displayed because it was used to spread pornographic content",
    "can't be displayed because it violated",
    "cannot be displayed because it violated",
    "terms of service violation",
    "violated telegram's terms",
    "violated local laws"
  ];

  const hasError = messages.some(msg => {
    if (!msg.text) return false;
    const normalizedText = msg.text.toLowerCase()
      .replace(/['']/g, "'")
      .replace(/telegram's/gi, "telegram's");
    return errorPatterns.some(pattern =>
      normalizedText.includes(pattern.toLowerCase())
    );
  });

  if (hasError) {
    console.log(`[Retry Triggered] Channel "${channel_name}" matched error pattern`);
  }
  return hasError;
};

export const analyzeTelegramChannel = createAsyncThunk(
  'search/analyzeTelegramChannel',
  async ({ channel_username, authHeaders }, { rejectWithValue }) => {
    try {
      const response = await axios.post(
        `${BASE_URL}/telegram/analyze-channel`,
        { channel_username },
        { headers: authHeaders }
      );
      return unwrapResponse(response);
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);


export const performUsernameSearch = createAsyncThunk(
  'search/performUsernameSearch',
  async ({ searchQuery }, { rejectWithValue }) => {
    try {
      const response = await axios.post(
        "https://tgdev.darkmap.org/proxy",
        { query: searchQuery },
        { headers: { "Content-Type": "multipart/form-data" } }
      );

      const tgDevData = unwrapResponse(response);
      return {
        telegram: tgDevData || [],
        darkweb: [],
        ransomware: [],
        breachforums: [],
        hackcheck: [],
      };
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

export const performGlobalSearch = createAsyncThunk(
  'search/performGlobalSearch',
  async ({ searchQuery, authHeaders, isAdvanced, includeKeywords, excludeKeywords }, { rejectWithValue }) => {
    try {
      const telegramApiCall = isAdvanced
        ? axios.post(`${BASE_URL}/telegram/search-channels-advanced`, {
          search_query: searchQuery,
          include_keywords: includeKeywords || [],
          exclude_keywords: excludeKeywords || []
        }, { headers: authHeaders })
        : axios.post(`${BASE_URL}/telegram/search-channels`, { search_query: searchQuery }, { headers: authHeaders });

      const apiCalls = [
        // axios.post(`${BASE_URL}/cyber/ransomware`, { query: searchQuery }, { headers: authHeaders }).catch(() => ({ data: [] })),
        Promise.resolve({ data: [] }),
        // axios.post(`${BASE_URL}/cyber/darkweb`, { query: searchQuery }, { headers: authHeaders }).catch(() => ({ data: [] })),
        Promise.resolve({ data: [] }),
        telegramApiCall.catch(() => ({ data: [] })),
        // axios.post(`${BASE_URL}/cyber/breachforums`, { query: searchQuery, pages: 5 }, { headers: authHeaders }).catch(() => ({ data: [] })),
        Promise.resolve({ data: [] }),
        // axios.post(`${BASE_URL}/cyber/hackcheck`, { query: searchQuery }, { headers: authHeaders }).catch(() => ({ data: [] })),
        Promise.resolve({ data: [] }),
        // axios.get(`/api/ahamia/${encodeURIComponent(searchQuery)}`).catch(() => ({ data: { results: [] } }))
        Promise.resolve({ data: { results: [] } })
      ];

      const apiResults = await Promise.all(apiCalls);
      const [
        ransomwareResponse,
        darkwebResponse,
        telegramResponse,
        breachforumsResponse,
        hackcheckResponse,
        ahamiaResponse,
      ] = apiResults.map(unwrapResponse);




      const isOtpQuery = /\botp\b/i.test(searchQuery || '');

      const allChannelsList = isOtpQuery ? otpChannels : (telegramResponse?.channel_names || []).filter(
        channel => !BLACKLISTED_CHANNELS.has(channel)
      );

      const channelsList = allChannelsList.slice(0, 10);
      const activePredefinedChannels = isOtpQuery ? [...otpChannels, ...predefinedChannels] : predefinedChannels;
      const predefinedChannelsToSend = activePredefinedChannels.slice(0, 10);

      // Stage 2 fetches the messages inside each discovered channel. Telegram's
      // search takes one plain string, so the keywords ride along separately and
      // the Lambda applies the same AND/OR/NOT the CSE dork used. Empty on a
      // normal search, which leaves that path untouched.
      const keywordPayload = {
        include_keywords: includeKeywords || [],
        exclude_keywords: excludeKeywords || [],
      };

      const addChannelPromises = predefinedChannelsToSend.map(channel_name =>
        axios.post(
          `${BASE_URL}/telegram/additional-channel`,
          { search_query: searchQuery, channel_name, ...keywordPayload },
          { headers: authHeaders }
        ).catch(error => null)
      );

      const messagesPromises = channelsList.map(channel_name =>
        axios.post(
          `${BASE_URL}/telegram/channel-messages`,
          { search_query: searchQuery, channel_name, ...keywordPayload },
          { headers: authHeaders }
        ).catch(error => null)
      );

      let [messagesResponses, addChannelResponses] = await Promise.all([
        Promise.all(messagesPromises),
        Promise.all(addChannelPromises),
      ]);

      // Unwrap all responses
      messagesResponses = messagesResponses.map(unwrapResponse);
      addChannelResponses = addChannelResponses.map(unwrapResponse);

      // Filter and map channels needing retry
      const retryChannels = messagesResponses
        .filter(data => {
          if (!data?.messages_info) return false;
          const channelName = data.messages_info[0]?.channel_name;
          if (!channelName) return false;
          return isChannelErrorResponse(data.messages_info, channelName);
        })
        .map(data => data.messages_info[0].channel_name);

      if (retryChannels.length > 0) {
        const retryPromises = retryChannels.map(channel_name =>
          axios.post(
            `${BASE_URL}/telegram/additional-channel`,
            { search_query: searchQuery, channel_name, ...keywordPayload },
            { headers: authHeaders }
          ).catch(error => null)
        );

        const retryResponses = (await Promise.all(retryPromises)).map(unwrapResponse);

        messagesResponses = messagesResponses.map(data => {
          if (!data?.messages_info?.length) return data;
          const channelName = data.messages_info[0].channel_name;
          const retryResult = retryResponses.find(r =>
            r?.config && JSON.parse(r.config.data).channel_name === channelName);
          return retryResult || data;
        });
      }

      const successfulMessages = messagesResponses.filter(Boolean);
      const successfulAddChannels = addChannelResponses.filter(Boolean);

      // The Lambda reports how many messages it scanned per channel and how
      // many survived the keyword filter. Without this, a search whose
      // keywords matched nothing renders identically to one that errored.
      const keywordMatch = [...successfulMessages, ...successfulAddChannels]
        .map(r => r?.match_stats)
        .filter(st => st && st.filtered)
        .reduce((acc, st) => ({
          filtered: true,
          scanned: acc.scanned + (st.scanned || 0),
          matched: acc.matched + (st.matched || 0),
          returned: acc.returned + (st.returned || 0),
          channels: acc.channels + 1,
        }), { filtered: false, scanned: 0, matched: 0, returned: 0, channels: 0 });

      const mergedMessagesInfo = [
        ...successfulMessages.flatMap(msg => msg.messages_info || []),
        ...successfulAddChannels.flatMap(msg => msg.messages_info || []),
      ];

      const rankedMessagesInfo = await rankMessages(searchQuery, mergedMessagesInfo, authHeaders, includeKeywords || []);

      return {
        showInactivityModal: false,
        results: {
          ransomware: ransomwareResponse || [],
          darkweb: darkwebResponse || [],
          telegram: rankedMessagesInfo,
          breachforums: breachforumsResponse || [],
          hackcheck: hackcheckResponse || [],
          ahamia: ahamiaResponse?.results || ahamiaResponse || [],
        },
        allChannelsList,
        keywordMatch,
        activeKeywords: {
          include: includeKeywords || [],
          exclude: excludeKeywords || [],
        },
        searchQuery,
        predefinedChannels: activePredefinedChannels
      };
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

const initialState = {
  searchResults: {
    telegram: [],
    darkweb: [],
    ransomware: [],
    breachforums: [],
    hackcheck: [],
    ahamia: [],
  },
  loading: false,
  error: null,
  selectedOption: 'Global',
  searchQuery: '',
  isSearchDisabled: false,
  showInactivityModal: false,
  usernameSearchCount: 0,
  // searchQuery is bound to the input and changes on every keystroke. These
  // two hold the search that was actually RUN, so editing the box cannot
  // invalidate results already on screen.
  activeSearchQuery: '',
  activeKeywords: { include: [], exclude: [] },
  allChannelsList: [],
  keywordMatch: { filtered: false, scanned: 0, matched: 0, returned: 0, channels: 0 },
  channelNames: [],
  predefinedChannels: [],
  channelAnalysis: null,
  channelAnalysisLoading: false,
  channelAnalysisError: null,
};

const searchSlice = createSlice({
  name: 'search',
  initialState,
  reducers: {
    setSelectedOption: (state, action) => {
      state.selectedOption = action.payload;
    },
    setSearchQuery: (state, action) => {
      state.searchQuery = action.payload;
    },
    setIsSearchDisabled: (state, action) => {
      state.isSearchDisabled = action.payload;
    },
    setShowInactivityModal: (state, action) => {
      state.showInactivityModal = action.payload;
    },
    setUsernameSearchCount: (state, action) => {
      state.usernameSearchCount = action.payload;
    },
    resetSearchResults: (state) => {
      state.keywordMatch = initialState.keywordMatch;
      state.searchResults = {
        telegram: [],
        darkweb: [],
        ransomware: [],
        breachforums: [],
        hackcheck: [],
        ahamia: [],
      };
    },
    clearError: (state) => {
      state.error = null;
    },
    resetChannelAnalysis: (state) => {
      state.channelAnalysis = null;
      state.channelAnalysisError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Username search
      .addCase(performUsernameSearch.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(performUsernameSearch.fulfilled, (state, action) => {
        state.loading = false;
        state.searchResults = action.payload;
      })
      .addCase(performUsernameSearch.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        state.searchResults = {
          telegram: [],
          darkweb: [],
          ransomware: [],
          breachforums: [],
          hackcheck: [],
          ahamia: [],
        };
      })
      // Global search
      .addCase(performGlobalSearch.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(performGlobalSearch.fulfilled, (state, action) => {
        state.loading = false;
        state.searchResults = action.payload.results;
        state.showInactivityModal = action.payload.showInactivityModal;
        state.activeSearchQuery = action.payload.searchQuery || '';
        state.activeKeywords = action.payload.activeKeywords || { include: [], exclude: [] };
        state.allChannelsList = action.payload.allChannelsList || [];
        state.keywordMatch = action.payload.keywordMatch || initialState.keywordMatch;
        state.channelNames = action.payload.allChannelsList || [];
        state.predefinedChannels = action.payload.predefinedChannels || [];
      })
      .addCase(performGlobalSearch.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        state.searchResults = {
          telegram: [],
          darkweb: [],
          ransomware: [],
          breachforums: [],
          hackcheck: [],
          ahamia: [],
        };
      })
      .addCase(analyzeTelegramChannel.pending, (state) => {
        state.channelAnalysisLoading = true;
        state.channelAnalysisError = null;
      })
      .addCase(analyzeTelegramChannel.fulfilled, (state, action) => {
        state.channelAnalysisLoading = false;
        state.channelAnalysis = action.payload;
      })
      .addCase(analyzeTelegramChannel.rejected, (state, action) => {
        state.channelAnalysisLoading = false;
        state.channelAnalysisError = action.payload;
      });
  },
});

export const {
  setSelectedOption,
  setSearchQuery,
  setIsSearchDisabled,
  setShowInactivityModal,
  setUsernameSearchCount,
  resetSearchResults,
  clearError,
  resetChannelAnalysis
} = searchSlice.actions;

export default searchSlice.reducer;