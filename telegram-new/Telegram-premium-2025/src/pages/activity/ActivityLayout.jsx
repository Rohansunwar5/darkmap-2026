import React, { useState, useEffect } from 'react';
import ActivitySidebar from './ActivitySidebar';
import ActivityViewer from './activityViewer';
import apiClient from '../../lib/apiClient';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';

const ActivityLayout = () => {
  const [activeCategory, setActiveCategory] = useState('group'); // 'group', 'bookmark', 'decoy', 'usage'
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchTeam = async () => {
      try {
        const response = await apiClient.get(`${import.meta.env.VITE_API_BASE_URL}/activity/team`);
        const accounts = response?.data?.data?.accounts || response?.data?.accounts;
        if (accounts) {
          setTeamMembers(accounts);
          if (accounts.length > 0) {
            setSelectedUserId(accounts[0]._id);
          }
        }
      } catch (error) {
        console.error("Failed to fetch team members:", error);
        toast.error("Failed to load accounts.");
        // Redirect if unauthorized
        if (error?.response?.status === 401) {
          navigate('/login');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchTeam();
  }, [navigate]);

  return (
    <div className="h-dvh w-dvw flex bg-[rgb(0_8_15)] text-white overflow-hidden">
      <ActivitySidebar 
        activeCategory={activeCategory} 
        setActiveCategory={setActiveCategory}
        teamMembers={teamMembers}
        selectedUserId={selectedUserId}
        setSelectedUserId={setSelectedUserId}
        loading={loading}
      />
      <ActivityViewer 
        key={`${activeCategory}-${selectedUserId}`}
        activeCategory={activeCategory} 
        selectedUserId={selectedUserId}
      />
    </div>
  );
};

export default ActivityLayout;
