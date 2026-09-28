import * as XLSX from 'xlsx';

export const exportActivityToExcel = (activities, filename = 'activity_export.xlsx') => {
  // Filter activities into categories
  const groupSearches = activities.filter(a => a.actionType === 'GROUP_SEARCHED' || a.actionType === 'AI_ANALYSIS_RUN');
  const bookmarks = activities.filter(a => a.actionType && a.actionType.startsWith('BOOKMARK_'));
  const decoys = activities.filter(a => a.actionType && a.actionType.startsWith('DECOY_')); 
  const usage = activities.filter(a => a.actionType && (a.actionType.startsWith('LOGIN') || a.actionType.startsWith('SESSION_'))); 

  // Helper to safely format dates
  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString();
  };

  // 1. Group Search Worksheet
  // We'll structure this flatly so it's easy to read in Excel
  const groupData = groupSearches.map(item => {
    if (item.actionType === 'GROUP_SEARCHED') {
      return {
        Date: formatDate(item.createdAt),
        Action: 'Username Search',
        'Searched Query': item.metadata?.query || '',
        'Group/Channel': '',
        'Analysis Type': '',
        Language: '',
        'Search ID': item.metadata?.searchId || ''
      };
    } else {
      return {
        Date: formatDate(item.createdAt),
        Action: 'AI Analysis',
        'Searched Query': '',
        'Group/Channel': item.metadata?.channel_username || item.metadata?.channelUsername || item.metadata?.groupUsername || '',
        'Analysis Type': item.metadata?.analysis_type || 'comprehensive',
        Language: item.metadata?.language || '',
        'Search ID': item.metadata?.parentSearchId || ''
      };
    }
  });

  // 2. Bookmarks Worksheet
  const bookmarkData = bookmarks.map(item => {
    return {
      Date: formatDate(item.createdAt),
      Action: item.actionType.replace(/_/g, ' '),
      'Group Name': item.metadata?.channelName || '',
      'Group ID': item.metadata?.channelId || '',
      'New Messages': item.metadata?.newMessagesCount !== undefined ? item.metadata.newMessagesCount : '',
      Status: item.metadata?.isActive !== undefined ? (item.metadata.isActive ? 'Active' : 'Inactive') : ''
    };
  });

  // 3. Decoy Worksheet
  const decoyData = decoys.map(item => {
    return {
      Date: formatDate(item.createdAt),
      Action: item.actionType.replace(/_/g, ' '),
      'Target': item.metadata?.targetIdentifier || '',
      'Notification ID': item.metadata?.notificationId || '',
      Preview: item.metadata?.textPreview || ''
    };
  });

  // 4. Usage Worksheet
  const usageData = usage.map(item => {
    return {
      Date: formatDate(item.createdAt),
      Action: item.actionType.replace(/_/g, ' '),
      'Session ID': item.metadata?.sessionId || ''
    };
  });

  // Create Worksheets
  const wsGroups = XLSX.utils.json_to_sheet(groupData.length > 0 ? groupData : [{ Message: 'No data' }]);
  const wsBookmarks = XLSX.utils.json_to_sheet(bookmarkData.length > 0 ? bookmarkData : [{ Message: 'No data' }]);
  const wsDecoys = XLSX.utils.json_to_sheet(decoyData.length > 0 ? decoyData : [{ Message: 'No data' }]);
  const wsUsage = XLSX.utils.json_to_sheet(usageData.length > 0 ? usageData : [{ Message: 'No data' }]);

  // Set column widths for better readability (optional but nice)
  const setColWidths = (ws, numCols) => {
    ws['!cols'] = Array(numCols).fill({ wch: 20 });
    ws['!cols'][0] = { wch: 25 }; // Date usually needs more space
  };
  
  setColWidths(wsGroups, 7);
  setColWidths(wsBookmarks, 6);
  setColWidths(wsDecoys, 5);
  setColWidths(wsUsage, 3);

  // Create Workbook
  const wb = XLSX.utils.book_new();
  
  // Append Worksheets
  XLSX.utils.book_append_sheet(wb, wsGroups, "Group Search");
  XLSX.utils.book_append_sheet(wb, wsBookmarks, "Bookmarks");
  XLSX.utils.book_append_sheet(wb, wsDecoys, "Decoys");
  XLSX.utils.book_append_sheet(wb, wsUsage, "Usage");

  // Generate Excel file and trigger download
  XLSX.writeFile(wb, filename);
};
