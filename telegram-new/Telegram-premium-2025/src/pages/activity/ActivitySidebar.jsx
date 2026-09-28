import React, { useState, useRef, useEffect } from 'react';
import { IconSearch, IconBookmark, IconMessageCircle, IconActivity, IconChevronDown, IconUser } from '@tabler/icons-react';

const ActivitySidebar = ({ activeCategory, setActiveCategory, teamMembers, selectedUserId, setSelectedUserId, loading }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navItems = [
    { id: 'group', label: 'Search History', icon: <IconSearch size={20} /> },
    { id: 'bookmark', label: 'Group Alerts', icon: <IconBookmark size={20} /> },
    { id: 'decoy', label: 'Decoy Activity', icon: <IconMessageCircle size={20} /> },
    { id: 'usage', label: 'Usage / Logins', icon: <IconActivity size={20} /> },
  ];

  const selectedMember = teamMembers.find(m => m._id === selectedUserId);

  return (
    <div className="w-72 bg-[#0a111a] border-r border-gray-800 h-full p-4 flex flex-col z-20 relative">
      <div className="mb-8" ref={dropdownRef}>
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Monitor Account</h2>
        <div className="relative">
          <button
            onClick={() => !loading && teamMembers.length > 0 && setDropdownOpen(!dropdownOpen)}
            className={`w-full flex items-center justify-between bg-[rgb(0_8_15)] border border-gray-700 text-white py-2.5 px-4 rounded-lg focus:outline-none transition-colors ${loading || teamMembers.length === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-500 cursor-pointer'}`}
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <IconUser size={16} className="text-blue-400 flex-shrink-0" />
              <span className="truncate">
                {loading ? 'Loading accounts...' : teamMembers.length === 0 ? 'No accounts found' : selectedMember?.email || 'Select Account'}
              </span>
            </div>
            <IconChevronDown size={16} className={`text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {dropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-[#0d1620] border border-gray-700 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
              {teamMembers.map(member => (
                <button
                  key={member._id}
                  onClick={() => {
                    setSelectedUserId(member._id);
                    setDropdownOpen(false);
                  }}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                    selectedUserId === member._id 
                      ? 'bg-blue-600/20 text-blue-400' 
                      : 'text-gray-300 hover:bg-gray-800/80 hover:text-white'
                  }`}
                >
                  <IconUser size={16} className={selectedUserId === member._id ? 'text-blue-400' : 'text-gray-500'} />
                  <span className="truncate">{member.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Activity Categories</h2>
      <nav className="flex flex-col gap-1.5">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => setActiveCategory(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all duration-200 ${
              activeCategory === item.id 
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' 
                : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200 border border-transparent'
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
};

export default ActivitySidebar;
