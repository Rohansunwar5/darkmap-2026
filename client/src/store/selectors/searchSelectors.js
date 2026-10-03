import { createSelector } from '@reduxjs/toolkit';

export const selectSearchState = (state) => state.search;
export const selectAuthState = (state) => state.auth;

export const selectChannelNames = createSelector(
  [selectSearchState],
  (search) => search.channelNames || []
);

export const selectPredefinedChannels = createSelector(
  [selectSearchState],
  (search) => search.predefinedChannels || []
);

export const selectSearchResults = createSelector(
  [selectSearchState],
  (search) => search.searchResults
);

// The search that was actually run, as opposed to whatever is currently typed
// in the box. Anything that invalidates results must key off this.
export const selectActiveSearchQuery = createSelector(
  [selectSearchState],
  (search) => search.activeSearchQuery || ''
);

export const selectActiveKeywords = createSelector(
  [selectSearchState],
  (search) => search.activeKeywords || { include: [], exclude: [] }
);

// Why an advanced search came back empty: keywords matched nothing, versus
// nothing was searched at all.
export const selectKeywordMatch = createSelector(
  [selectSearchState],
  (search) => search.keywordMatch || { filtered: false, scanned: 0, matched: 0, returned: 0, channels: 0 }
);

export const selectSearchLoading = createSelector(
  [selectSearchState],
  (search) => search.loading
);

export const selectSearchError = createSelector(
  [selectSearchState],
  (search) => search.error
);

export const selectSelectedOption = createSelector(
  [selectSearchState],
  (search) => search.selectedOption
);

export const selectSearchQuery = createSelector(
  [selectSearchState],
  (search) => search.searchQuery
);

export const selectIsSearchDisabled = createSelector(
  [selectSearchState],
  (search) => search.isSearchDisabled
);

export const selectUsernameSearchCount = createSelector(
  [selectSearchState],
  (search) => search.usernameSearchCount
);

export const selectShowInactivityModal = createSelector(
  [selectSearchState],
  (search) => search.showInactivityModal
);

export const selectAllChannelsList = createSelector(
  [selectSearchState],
  (search) => search.allChannelsList
);

// Add these to your selectors
export const selectChannelAnalysis = createSelector(
  [selectSearchState],
  (search) => search.channelAnalysis
);

export const selectChannelAnalysisLoading = createSelector(
  [selectSearchState],
  (search) => search.channelAnalysisLoading
);

export const selectChannelAnalysisError = createSelector(
  [selectSearchState],
  (search) => search.channelAnalysisError
);

// Combined selectors
export const selectSearchStats = createSelector(
  [selectSearchResults],
  (results) => {
    const hackcheckLen = Array.isArray(results?.hackcheck)
      ? results.hackcheck.length
      : results?.hackcheck?.results?.length || 0;

    return {
      telegramCount: results?.telegram?.length || 0,
      darkwebCount: results?.darkweb?.length || 0,
      ransomwareCount: results?.ransomware?.length || 0,
      breachforumsCount: results?.breachforums?.length || 0,
      hackcheckCount: hackcheckLen,
      totalCount:
        (results?.telegram?.length || 0) +
        (results?.darkweb?.length || 0) +
        (results?.ransomware?.length || 0) +
        (results?.breachforums?.length || 0) +
        hackcheckLen,
    };
  }
);

export const selectHasSearchResults = createSelector(
  [selectSearchStats],
  (stats) => stats.totalCount > 0
);

export const selectCanSearch = createSelector(
  [selectIsSearchDisabled, selectSearchQuery, selectUsernameSearchCount, selectSelectedOption],
  (isDisabled, query, usernameCount, selectedOption) => {
    if (isDisabled || !query.trim()) return false;
    if (selectedOption === 'Username' && usernameCount >= 15) return false;
    return true;
  }
);

// Auth selectors
export const selectAccessToken = createSelector(
  [selectAuthState],
  (auth) => auth.accessToken
);

export const selectIsAuthenticated = createSelector(
  [selectAuthState],
  (auth) => auth.isAuthenticated
);

export const selectAuthHeaders = createSelector(
  [selectAccessToken],
  (token) => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  })
);