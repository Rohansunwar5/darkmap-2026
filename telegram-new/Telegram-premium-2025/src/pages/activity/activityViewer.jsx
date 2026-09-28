import React, { useState, useEffect, useMemo } from 'react';
import apiClient from '../../lib/apiClient';
import { toast } from 'react-toastify';
import { IconChevronRight, IconChevronDown, IconClock, IconActivity, IconDownload } from '@tabler/icons-react';
import { exportActivityToExcel } from '../../utils/exportUtils';

const ActivityViewer = ({ activeCategory, selectedUserId }) => {
  const [activities, setActivities] = useState([]);
  const [activeUsersCount, setActiveUsersCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    setActivities([]);
    setPage(1);
    setHasMore(true);
  }, [activeCategory, selectedUserId]);

  useEffect(() => {
    if (!selectedUserId) return;

    const fetchFeed = async () => {
      setLoading(true);
      try {
          let queryFilters = '';
          if (activeCategory === 'group') {
             queryFilters = '&actionTypes=GROUP_SEARCHED,AI_ANALYSIS_RUN';
          } else if (activeCategory === 'bookmark') {
             queryFilters = '&actionTypes=BOOKMARK_';
          } else if (activeCategory === 'decoy') {
             queryFilters = '&actionTypes=DECOY_';
          } else if (activeCategory === 'usage') {
             queryFilters = '&actionTypes=LOGIN';
          }

          const response = await apiClient.get(`${import.meta.env.VITE_API_BASE_URL}/activity?targetUserId=${selectedUserId}&page=${page}&limit=50${queryFilters}`);
          const resData = response?.data;
          
          if (resData && resData.data) {
            const payload = resData.data; // This contains the actual payload object from next()
            setActiveUsersCount(payload.activeUsersCount || 0);
            
            const fetchedItems = payload.data || [];

            if (page === 1) {
              setActivities(fetchedItems);
            } else {
              setActivities(prev => [...prev, ...fetchedItems]);
            }
            const pagination = payload.pagination;
            setHasMore(pagination ? pagination.page < pagination.totalPages : false);
          }
      } catch (error) {
        console.error("Failed to fetch activity feed:", error);
        toast.error("Failed to load activity feed.");
      } finally {
        setLoading(false);
      }
    };

    fetchFeed();
  }, [selectedUserId, activeCategory, page]);

  const processedActivities = useMemo(() => {
    if (activeCategory !== 'group') return activities;

    const searchMap = {};
    const finalRenderList = [];

    // First pass: index all GROUP_SEARCHED
    activities.forEach(item => {
      if (item.actionType === 'GROUP_SEARCHED') {
        const enrichedItem = { ...item, children: [] };
        if (item.metadata?.searchId) {
          searchMap[item.metadata.searchId] = enrichedItem;
        }
      }
    });

    // Second pass: assign AI_ANALYSIS_RUN to parents, or keep standalone if no match
    activities.forEach(item => {
      if (item.actionType === 'GROUP_SEARCHED') {
        // Handled in third pass
      } else if (item.actionType === 'AI_ANALYSIS_RUN') {
        const parentId = item.metadata?.parentSearchId;
        if (parentId && searchMap[parentId]) {
          searchMap[parentId].children.push(item);
        }
      } else {
        // Anything else (shouldn't happen in 'group', but just in case)
      }
    });

    // Third pass: reconstruct ordered array
    activities.forEach(item => {
      if (item.actionType === 'GROUP_SEARCHED') {
        finalRenderList.push(item.metadata?.searchId ? searchMap[item.metadata.searchId] : { ...item, children: [] });
      } else if (item.actionType === 'AI_ANALYSIS_RUN') {
        const parentId = item.metadata?.parentSearchId;
        if (!parentId || !searchMap[parentId]) {
          finalRenderList.push(item); // Standalone/legacy
        }
      } else {
        finalRenderList.push(item);
      }
    });

    return finalRenderList;
  }, [activities, activeCategory]);

  const handleDownload = async () => {
    console.log("Download button clicked!");
    console.log("selectedUserId:", selectedUserId);
    if (!selectedUserId) {
      toast.error("No user selected");
      return;
    }
    setIsDownloading(true);
    try {
      console.log("Fetching export data...");
      const response = await apiClient.get(
        `${import.meta.env.VITE_API_BASE_URL}/activity/export?targetUserId=${selectedUserId}`
      );
      console.log("Export data received:", response.data);
      const allActivities = response.data?.data?.data || response.data?.data || [];
      if (allActivities.length === 0) {
        toast.info("No activity data to export.");
        return;
      }
      console.log("Generating Excel file...");
      exportActivityToExcel(allActivities, `Activity_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success("Download complete!");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to download activities: " + (error.message || "Unknown error"));
    } finally {
      setIsDownloading(false);
    }
  };

  const toggleGroupExpand = (id) => {
    setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const renderGroupSearch = (item) => {
    const isExpanded = expandedGroups[item._id];
    const isSearchParent = item.actionType === 'GROUP_SEARCHED';
    const isAI = item.actionType === 'AI_ANALYSIS_RUN';
    const children = item.children || [];
    
    // For standalone AI Runs (legacy) vs Parent Searches
    const displayName = item.metadata?.query || item.metadata?.channel_username || item.metadata?.channelUsername || item.metadata?.groupUsername || 'Unknown';
    const hasChildren = children.length > 0;

    return (
      <div key={item._id} className="bg-[#0a111a] border border-gray-800 rounded-lg p-4 mb-3">
        <div 
          className={`flex items-center justify-between ${(isSearchParent && hasChildren) || isAI ? 'cursor-pointer' : ''}`}
          onClick={() => ((isSearchParent && hasChildren) || isAI) && toggleGroupExpand(item._id)}
        >
          <div className="flex flex-col gap-1">
            <span className={`text-xs font-semibold uppercase tracking-wider ${isSearchParent ? 'text-green-400' : 'text-blue-400'}`}>
              {isSearchParent ? 'Username Search' : 'AI Analysis Run'}
            </span>
            <div className="flex items-center gap-3">
              {(isSearchParent && hasChildren) && (
                <span className="text-gray-400">
                  {isExpanded ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
                </span>
              )}
              <span className="font-medium text-white text-lg">
                {displayName.startsWith('@') ? displayName : `@${displayName}`}
              </span>
              {isSearchParent && hasChildren && (
                 <span className="bg-gray-800 text-gray-300 text-xs px-2 py-0.5 rounded font-bold uppercase tracking-wide border border-gray-700">
                   {children.length} Analyzed
                 </span>
              )}
              {isAI && (
                <span className="bg-purple-600/20 text-purple-400 text-xs px-2 py-0.5 rounded font-bold uppercase tracking-wide border border-purple-500/30">
                  Legacy AI Run
                </span>
              )}
            </div>
          </div>
          <div className="text-sm text-gray-500 flex items-center gap-1">
            <IconClock size={14} /> {new Date(item.createdAt).toLocaleString()}
          </div>
        </div>
        
        {/* Render nested children for searches */}
        {isExpanded && isSearchParent && hasChildren && (
          <div className="mt-4 pt-4 border-t border-gray-800 flex flex-col gap-3">
            {children.map(child => (
               <div key={child._id} className="bg-[#0d1520] border border-gray-700/50 rounded p-3 flex justify-between items-center ml-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-medium">{child.metadata?.channel_username || 'Unknown Group'}</span>
                      <span className="bg-purple-600/20 text-purple-400 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide border border-purple-500/30">
                        AI Assessed
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 flex gap-4">
                      <span>Type: {child.metadata?.analysis_type || 'comprehensive'}</span>
                      {child.metadata?.language && <span>Language: {child.metadata.language}</span>}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(child.createdAt).toLocaleTimeString()}
                  </div>
               </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderBookmark = (item) => {
    const isScrape = item.actionType === 'BOOKMARK_SCRAPED';
    const actionLabel = item.actionType.replace('_', ' ');

    return (
      <div key={item._id} className="bg-[#0a111a] border border-gray-800 rounded-lg p-4 mb-3">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <span className={`text-xs font-semibold uppercase tracking-wider ${isScrape ? 'text-green-400' : 'text-blue-400'}`}>
              {actionLabel}
            </span>
            <div className="flex items-center gap-3">
              <span className="font-medium text-white text-lg">
                {item.metadata?.channelName || 'Unknown Group'}
              </span>
              {item.metadata?.newMessagesCount !== undefined && (
                <span className="bg-green-600/20 text-green-400 text-xs px-2 py-0.5 rounded font-bold uppercase tracking-wide border border-green-500/30">
                  {item.metadata.newMessagesCount} New Messages
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
              {item.metadata?.channelId && (
                <span>ID: {item.metadata.channelId}</span>
              )}
              {item.metadata?.isActive !== undefined && (
                <span className="flex items-center gap-1">
                  Status: <span className={item.metadata.isActive ? 'text-green-400' : 'text-red-400'}>
                    {item.metadata.isActive ? 'Active' : 'Inactive'}
                  </span>
                </span>
              )}
            </div>
          </div>
          <div className="text-sm text-gray-500 flex items-center gap-1">
            <IconClock size={14} /> {new Date(item.createdAt).toLocaleString()}
          </div>
        </div>
      </div>
    );
  };

  const renderDecoy = (item) => (
    <div key={item._id} className="bg-[#0a111a] border border-gray-800 rounded-lg p-4 mb-3 flex items-start justify-between">
      <div>
        <h4 className="font-medium text-green-400 mb-1">{item.actionType.replace(/_/g, ' ')}</h4>
        <p className="text-sm text-gray-400">
          {item.metadata?.targetIdentifier && `Target: ${item.metadata.targetIdentifier}`}
          {item.metadata?.textPreview && ` | "${item.metadata.textPreview}..."`}
          {item.metadata?.notificationId && `Notification ID: ${item.metadata.notificationId}`}
        </p>
      </div>
      <div className="text-sm text-gray-500 flex items-center gap-1">
        <IconClock size={14} /> {new Date(item.createdAt).toLocaleString()}
      </div>
    </div>
  );

  const renderUsage = (item) => (
    <div key={item._id} className="bg-[#0a111a] border border-gray-800 rounded-lg p-4 mb-3 flex items-start justify-between">
      <div>
        <h4 className="font-medium text-yellow-400 mb-1">Login Success</h4>
        <p className="text-sm text-gray-400">
          Session ID: {item.metadata?.sessionId || 'Unknown'}
        </p>
      </div>
      <div className="text-sm text-gray-500 flex items-center gap-1">
        <IconClock size={14} /> {new Date(item.createdAt).toLocaleString()}
      </div>
    </div>
  );

  return (
    <div className="flex-1 bg-[rgb(0_8_15)] h-full overflow-y-auto p-8 relative">
      <div className="max-w-4xl mx-auto pb-20">
        
        {activeCategory === 'usage' && (
          <div className="mb-8 bg-blue-600/10 border border-blue-500/20 rounded-lg p-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <IconActivity size={24} className="text-blue-400" /> Active Sessions Overview
              </h2>
              <p className="text-gray-400 text-sm mt-1">Number of active sessions for this account.</p>
            </div>
            <div className="text-4xl font-black text-blue-500">
              {activeUsersCount}
            </div>
          </div>
        )}

        <header className="mb-8 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2 capitalize">{activeCategory} Activity</h1>
            <p className="text-gray-400">Monitor live events from the selected account.</p>
          </div>
          <button 
            onClick={handleDownload}
            disabled={isDownloading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <IconDownload size={18} />
            {isDownloading ? 'Downloading...' : 'Download Excel'}
          </button>
        </header>

        <div>
          {processedActivities.map(item => {
            if (activeCategory === 'group') return renderGroupSearch(item);
            if (activeCategory === 'bookmark') return renderBookmark(item);
            if (activeCategory === 'decoy') return renderDecoy(item);
            if (activeCategory === 'usage') return renderUsage(item);
            return null;
          })}

          {loading && (
            <div className="text-center py-8 text-gray-500">Loading activity...</div>
          )}

          {!loading && activities.length === 0 && (
            <div className="text-center py-16 border border-dashed border-gray-800 rounded-lg text-gray-500">
              No activity found for this category.
            </div>
          )}

          {!loading && hasMore && (
            <div className="mt-8 text-center">
              <button 
                onClick={() => setPage(p => p + 1)}
                className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors font-medium"
              >
                Load More
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActivityViewer;
