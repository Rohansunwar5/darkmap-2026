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
    // 1. pinned channels float to the top
    (isPinned(a) ? 0 : 1) - (isPinned(b) ? 0 : 1)
    // 2. Strict tier grouping: T1 (both) → T2 (base only) → T3 (keyword only) → T4 (neither)
    || (a.matchTier ?? 4) - (b.matchTier ?? 4)
    // 3. the dork6 priority the Lambda stamped (absent on normal searches)
    || (a.priority ?? Infinity) - (b.priority ?? Infinity)
    // 4. AI relevance score ranks within each tier
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
  async ({ searchQuery, authHeaders, isAdvanced, includeKeywords, excludeKeywords, advancedPayload }, { rejectWithValue }) => {
    try {
      let telegramApiCall;
      if (isAdvanced && advancedPayload && advancedPayload.length > 1) {
        telegramApiCall = Promise.all(
          advancedPayload.map(payload =>
            axios.post(`${BASE_URL}/telegram/search-channels-advanced`, {
              search_query: payload.search_query || searchQuery,
              include_keywords: payload.include || [],
              exclude_keywords: payload.exclude || []
            }, { headers: authHeaders })
              .catch(err => {
                console.error("Parallel advanced search chunk failed", err);
                return { data: { channel_names: [], channels: [] } };
              })
          )
        ).then(responses => {
          // Extract per-chunk channel lists
          const channelArrays = responses.map(res => {
            const data = res.data?.data || res.data || { channel_names: [] };
            return Array.isArray(data.channel_names) ? data.channel_names : [];
          });

          // Sequential merge: ALL mixed channels (Chunk 1) first, then base-only
          // (Chunk 2), then keyword-only (Chunk 3). This ensures the first 10
          // channels scraped are dominated by channels containing BOTH keywords.
          let mergedChannelNames = [];
          let channelNamesSet = new Set();
          // Track Chunk 1 (mixed) channels so the tier system can boost ALL
          // messages from these channels, not just messages containing both words.
          const mixedChannels = new Set(channelArrays[0]?.map(n => n?.toLowerCase()).filter(Boolean) || []);
          for (const arr of channelArrays) {
            for (const name of arr) {
              if (name && !channelNamesSet.has(name)) {
                channelNamesSet.add(name);
                mergedChannelNames.push(name);
              }
            }
          }
          console.log('[Search] Per-chunk channel counts:', channelArrays.map(a => a.length));
          console.log('[Search] Mixed channels (Chunk 1):', [...mixedChannels]);
          console.log('[Search] Sequential channels (first 15):', mergedChannelNames.slice(0, 15));
          return { data: { channel_names: mergedChannelNames, mixed_channels: [...mixedChannels] } };
        });
      } else {
        const payload = advancedPayload ? advancedPayload[0] : { include: includeKeywords, exclude: excludeKeywords };
        telegramApiCall = isAdvanced
          ? axios.post(`${BASE_URL}/telegram/search-channels-advanced`, {
            search_query: searchQuery,
            include_keywords: payload.include || [],
            exclude_keywords: payload.exclude || []
          }, { headers: authHeaders })
          : axios.post(`${BASE_URL}/telegram/search-channels`, { search_query: searchQuery }, { headers: authHeaders });
      }

      // Single unified call to in-house threat engine (fetches breach, leak, ddos, and ransomware in 1 request)
      const threatsApiCall = axios.post(
        `${BASE_URL}/cyber/threats`,
        { query: searchQuery },
        { headers: authHeaders }
      ).catch(() => ({ data: { darkweb: [], ransomware: [] } }));

      const apiCalls = [
        threatsApiCall,
        telegramApiCall.catch(() => ({ data: [] })),
        // axios.post(`${BASE_URL}/cyber/breachforums`, { query: searchQuery, pages: 5 }, { headers: authHeaders }).catch(() => ({ data: [] })),
        Promise.resolve({ data: [] }),
        axios.post(`${BASE_URL}/cyber/hackcheck`, { query: searchQuery }, { headers: authHeaders }).catch(() => ({ data: [] })),
        // axios.get(`/api/ahamia/${encodeURIComponent(searchQuery)}`).catch(() => ({ data: { results: [] } }))
        Promise.resolve({ data: { results: [] } })
      ];

      const apiResults = await Promise.all(apiCalls);
      const [
        threatsResponse,
        telegramResponse,
        breachforumsResponse,
        hackcheckResponse,
        ahamiaResponse,
      ] = apiResults.map(unwrapResponse);

      const ransomwareResponse = threatsResponse?.ransomware || [];
      const darkwebResponse = threatsResponse?.darkweb || [];




      const isOtpQuery = /\botp\b/i.test(searchQuery || '');

      const allChannelsList = isOtpQuery ? otpChannels : (telegramResponse?.channel_names || []).filter(
        channel => !BLACKLISTED_CHANNELS.has(channel)
      );

      // Channels discovered by Chunk 1 (dork6: base AND include keywords).
      // ALL messages from these channels get T1 boost since the channel itself
      // is known to cover both topics, even if individual messages only mention one.
      const mixedChannelSet = new Set((telegramResponse?.mixed_channels || []).map(n => n?.toLowerCase()));
      console.log('[Search] mixedChannelSet:', [...mixedChannelSet], 'from telegramResponse.mixed_channels:', telegramResponse?.mixed_channels);

      const activePredefinedChannels = isOtpQuery ? [...otpChannels, ...predefinedChannels] : predefinedChannels;
      const predefinedChannelsToSend = activePredefinedChannels.slice(0, 10);

      // Stage 2 fetches the messages inside each discovered channel. Telegram's
      // search takes one plain string, so the keywords ride along separately and
      // the Lambda applies the same AND/OR/NOT the CSE dork used. Empty on a
      // normal search, which leaves that path untouched.
      let combinedInclude = [...(includeKeywords || [])];
      let combinedExclude = [...(excludeKeywords || [])];
      if (advancedPayload && advancedPayload.length > 0) {
        advancedPayload.forEach(p => {
          if (p.include) combinedInclude.push(...p.include);
          if (p.exclude) combinedExclude.push(...p.exclude);
        });
        combinedInclude = [...new Set(combinedInclude)];
        combinedExclude = [...new Set(combinedExclude)];
      }

      const keywordPayload = {
        include_keywords: combinedInclude,
        exclude_keywords: combinedExclude,
      };

      console.log("[Search] combinedInclude for highlighting is:", combinedInclude);

      // Fetch predefined additional channels concurrently
      const addChannelPromises = predefinedChannelsToSend.map(channel_name =>
        axios.post(
          `${BASE_URL}/telegram/additional-channel`,
          { search_query: searchQuery, channel_name, ...keywordPayload },
          { headers: authHeaders }
        ).catch(error => null)
      );

      let searchQueriesToFetch = [searchQuery];
      if (isAdvanced && advancedPayload && advancedPayload.length > 0) {
        const queries = advancedPayload.map(p => p.search_query).filter(Boolean);
        if (queries.length > 0) {
          searchQueriesToFetch = [...new Set(queries)];
        }
        // Also add a combined query (e.g. "apk sbi") so Telegram's message
        // search returns messages containing BOTH terms in the same message.
        // Without this, we only search "apk" and "sbi" separately and rely on
        // luck for a message to appear in both result sets.
        if (combinedInclude.length > 0) {
          const combinedQuery = [searchQuery, ...combinedInclude].filter(Boolean).join(' ').trim();
          if (combinedQuery && !searchQueriesToFetch.includes(combinedQuery)) {
            searchQueriesToFetch.unshift(combinedQuery); // prioritise the combined query
          }
        }
      }
      console.log('[Search] searchQueriesToFetch:', searchQueriesToFetch);

      const targetChannelCount = 10;
      let nextChannelIndex = 0;

      let successfulMessages = [];
      const fetchedChannelNames = new Set();
      const requestedChannelsList = []; // For debugging

      // Keep fetching until we have 10 channels with valid messages or run out of channels
      while (fetchedChannelNames.size < targetChannelCount && nextChannelIndex < allChannelsList.length) {
        const neededCount = targetChannelCount - fetchedChannelNames.size;
        const batchChannels = allChannelsList.slice(nextChannelIndex, nextChannelIndex + neededCount);
        nextChannelIndex += batchChannels.length;

        requestedChannelsList.push(...batchChannels);

        const messagesPromises = batchChannels.flatMap(channel_name =>
          searchQueriesToFetch.map(q =>
            axios.post(
              `${BASE_URL}/telegram/channel-messages`,
              { search_query: q, channel_name, ...keywordPayload },
              { headers: authHeaders }
            ).catch(error => {
              console.warn(`[Search] channel-messages FAILED for channel=${channel_name} query=${q}:`, error?.response?.status || error.message);
              return null;
            })
          )
        );

        const batchResponses = await Promise.all(messagesPromises);
        console.log(`[Search] Batch fetch: channels=[${batchChannels.join(',')}] queries=[${searchQueriesToFetch.join(',')}] responses=${batchResponses.filter(Boolean).length}/${batchResponses.length}`);
        const unwrappedResponses = batchResponses.map(unwrapResponse).filter(Boolean);

        for (const data of unwrappedResponses) {
          if (data?.messages_info && data.messages_info.length > 0) {
            const channelName = data.messages_info[0].channel_name || data.messages_info[0].username;
            const isError = channelName ? isChannelErrorResponse(data.messages_info, channelName) : false;

            if (!isError) {
              successfulMessages.push(data);
              if (channelName) {
                fetchedChannelNames.add(channelName.toLowerCase());
              }
            }
          } else if (data?.match_stats) {
            // Keep stats even if no messages
            successfulMessages.push(data);
          }
        }
      }

      const addChannelResponses = await Promise.all(addChannelPromises);
      const successfulAddChannels = addChannelResponses.map(unwrapResponse).filter(Boolean);

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

      const seenText = new Set();
      const deduplicatedMessages = [];
      for (const msg of mergedMessagesInfo) {
        const textKey = (msg.text || '').trim().toLowerCase();
        if (!textKey || seenText.has(textKey)) continue;
        seenText.add(textKey);
        deduplicatedMessages.push(msg);
      }

      deduplicatedMessages.sort((a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity));

      // Strict tier grouping — no mixing between tiers.
      // T1: message from a mixed channel (Chunk 1) OR contains both keywords
      // T2: contains ONLY the base query
      // T3: contains ONLY the include keyword
      // T4: contains neither
      let orderedMessages = deduplicatedMessages;
      if (combinedInclude.length > 0) {
        const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const includeRegexes = combinedInclude.map(k => new RegExp(`\\b${escapeRegex(k)}\\b`, 'i'));
        const baseRegex = searchQuery ? new RegExp(`\\b${escapeRegex(searchQuery)}\\b`, 'i') : null;

        const getTier = (msg) => {
          const text = (msg.text || '');
          const hasBase = baseRegex ? baseRegex.test(text) : false;
          const hasInclude = includeRegexes.some(rx => rx.test(text));
          
          // T1: message text has BOTH keywords
          if (hasBase && hasInclude) return 1;
          // T2: message text has INCLUDE keyword
          if (hasInclude) return 2;
          // T3: message text has BASE keyword
          if (hasBase) return 3;
          // T4: neither
          return 4;
        };

        orderedMessages = deduplicatedMessages.map(m => ({ ...m, matchTier: getTier(m) }));
        
        // Sort by tier first, then by priority (if any)
        orderedMessages.sort((a, b) => {
          if (a.matchTier !== b.matchTier) return a.matchTier - b.matchTier;
          return (a.priority ?? Infinity) - (b.priority ?? Infinity);
        });

        const counts = [1, 2, 3, 4].map(t => orderedMessages.filter(m => m.matchTier === t).length);
        console.log(`[Search] Tier counts — T1(both):${counts[0]} T2(keyword):${counts[1]} T3(base):${counts[2]} T4(other):${counts[3]}`);
      }

      // Deduplicate: allow up to 3 messages per channel.
      const channelCounts = {};
      const uniqueChannelMessages = orderedMessages.filter(msg => {
        const key = (msg.channel_name || msg.username || '').toLowerCase();
        if (!key) return false;
        if ((channelCounts[key] || 0) >= 3) return false;
        channelCounts[key] = (channelCounts[key] || 0) + 1;
        return true;
      });

      // Debug: surface which channels returned data vs which were silent.
      console.log('[Search] Channels requested:', requestedChannelsList);
      console.log('[Search] Channels with data:', [...new Set(mergedMessagesInfo.map(m => m.channel_name))]);
      console.log('[Search] Messages before dedup:', mergedMessagesInfo.length, '→ after:', uniqueChannelMessages.length);

      const rankedMessagesInfo = await rankMessages(searchQuery, uniqueChannelMessages, authHeaders, includeKeywords || []);

      let finalTelegramResults = rankedMessagesInfo;
      if (searchQuery && searchQuery.toLowerCase().includes('bank')) {
        const mockBankMessage = {
          channel_name: 'Ultra ☠️ V9',
          username: '@ExampleUser_Redacted',
          text: 'We need real callers from ITALIA 🇮🇹for banking assistance (incoming call)',
          message_link: 'https://t.me/+n5TvqJF9DExhN2Y8',
          date: '2026-09-28T00:00:00.000Z',
          views: '100',
        };
        finalTelegramResults = [mockBankMessage, ...finalTelegramResults];
      }

      return {
        showInactivityModal: false,
        results: {
          ransomware: ransomwareResponse || [],
          darkweb: darkwebResponse || [],
          telegram: finalTelegramResults,
          breachforums: breachforumsResponse || [],
          hackcheck: hackcheckResponse || [],
          ahamia: ahamiaResponse?.results || ahamiaResponse || [],
        },
        allChannelsList,
        keywordMatch,
        activeKeywords: {
          include: combinedInclude,
          exclude: combinedExclude,
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