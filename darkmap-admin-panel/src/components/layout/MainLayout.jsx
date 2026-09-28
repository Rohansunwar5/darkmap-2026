import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { LayoutDashboard, LogOut, User, ShieldAlert, Cpu } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

const SidebarItem = ({ icon: Icon, label, active, onClick, danger }) => (
    <button
        onClick={onClick}
        className={twMerge(
            "w-full flex items-center gap-3 px-4 py-3 transition-colors duration-200 border-l-2",
            active
                ? "bg-gray-800 border-blue-500 text-blue-400"
                : "border-transparent text-gray-400 hover:text-white hover:bg-gray-800",
            danger && "text-red-400 hover:text-red-300 hover:bg-red-900/20"
        )}
    >
        <Icon size={18} />
        <span className="font-mono text-xs font-bold">{label}</span>
    </button>
);

const MainLayout = ({ children }) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    return (
        <div className="flex min-h-screen bg-black text-white overflow-hidden relative">

            {/* Sidebar */}
            <aside className="w-64 border-r border-gray-800 bg-gray-950 z-20 flex flex-col">
                <div className="p-6 border-b border-gray-800">
                    <h1 className="text-xl font-bold text-white tracking-wider">DARKMAP</h1>
                    <div className="flex items-center gap-2 mt-2">
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        <span className="text-[10px] text-green-500 font-mono tracking-widest">ONLINE</span>
                    </div>
                </div>

                <nav className="flex-1 py-6 space-y-1">
                    <SidebarItem
                        icon={LayoutDashboard}
                        label="DASHBOARD"
                        active={location.pathname === '/'}
                        onClick={() => navigate('/')}
                    />
                    <SidebarItem
                        icon={User}
                        label="PROFILE"
                        active={location.pathname === '/profile'}
                        onClick={() => navigate('/profile')}
                    />
                    <div className="my-4 border-t border-cyber-muted/20 mx-4"></div>
                    <SidebarItem
                        icon={Cpu}
                        label="INFRASTRUCTURE"
                        active={false}
                    />
                </nav>

                <div className="p-4 border-t border-cyber-muted/20">
                    <div className="mb-4">
                        <p className="text-xs text-cyber-muted font-mono">OPERATOR:</p>
                        <p className="text-sm text-cyber-primary truncate font-bold">{user?.name || user?.email || 'UNKNOWN'}</p>
                    </div>
                    <SidebarItem
                        icon={LogOut}
                        label="TERMINATE SESSION"
                        danger
                        onClick={logout}
                    />
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto relative z-10 p-8">
                <div className="max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default MainLayout;
