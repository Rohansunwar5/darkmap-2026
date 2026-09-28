import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import GenericLayout from '../components/Genric/GenericLayout';

export default function Account() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    return (
        <GenericLayout hideNavbar={true} hideSidebox={true}>
            <div className="flex flex-col items-center justify-center h-full w-full p-6">
                <div className="w-full rounded-lg shadow border md:mt-0 sm:max-w-md xl:p-0 bg-gray-800 border-gray-700 relative">
                    <div className="p-6 space-y-4 md:space-y-6 sm:p-8">
                        <button 
                            onClick={() => navigate(-1)} 
                            className="absolute top-6 left-6 text-gray-400 hover:text-white transition-colors flex items-center gap-2 text-sm"
                        >
                            <FontAwesomeIcon icon={faArrowLeft} /> Back
                        </button>
                        <h1 className="text-xl font-bold leading-tight tracking-tight md:text-2xl text-white text-center mt-6">
                            Your Account
                        </h1>
                        <div className="space-y-4 text-gray-300">
                            <div className="flex justify-between border-b border-gray-700 pb-2">
                                <span className="font-medium text-gray-400">First Name</span>
                                <span>{user?.firstName || "N/A"}</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-700 pb-2">
                                <span className="font-medium text-gray-400">Last Name</span>
                                <span>{user?.lastName || "N/A"}</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-700 pb-2">
                                <span className="font-medium text-gray-400">Email Address</span>
                                <span>{user?.email || "N/A"}</span>
                            </div>
                        </div>
                        <button 
                            onClick={() => window.open('/activity', '_blank')}
                            className="w-full text-white focus:ring-4 focus:outline-none font-medium rounded-lg text-sm px-5 py-2.5 text-center bg-blue-600 hover:bg-blue-700 focus:ring-blue-800 mt-6"
                        >
                            View Activity
                        </button>
                        <button 
                            onClick={handleLogout}
                            className="w-full text-white focus:ring-4 focus:outline-none font-medium rounded-lg text-sm px-5 py-2.5 text-center bg-red-600 hover:bg-red-700 focus:ring-red-800 mt-4"
                        >
                            Log Out
                        </button>
                    </div>
                </div>
            </div>
        </GenericLayout>
    );
}
