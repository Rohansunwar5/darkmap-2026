import { useState, Fragment } from 'react';
import apiClient from '../../lib/apiClient';
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Logo from "../../assets/logo_gen.png";
import { useEffect } from 'react';
import { useRef } from 'react';

function AIContainer() {
    const [loadingState, setLoadingState] = useState(0);
    const channelId = useRef(null)
    const [responseText, setResponseText] = useState({ analysis: 'Failed to load analysis.' });
    const [showManualInput, setShowManualInput] = useState(false);
    const [manualLink, setManualLink] = useState('');
    const [extraData, setExtraData] = useState(null);
    const [extraDataType, setExtraDataType] = useState(null);
    const [isLoadingExtra, setIsLoadingExtra] = useState(false);
    const [extraError, setExtraError] = useState(null);

    const extractUsername = (input) => {
        if (!input) return null;
        let str = input.trim();
        if (str.endsWith('/')) {
            str = str.slice(0, -1);
        }
        if (str.includes('t.me/')) {
            const parts = str.split('t.me/');
            str = parts[parts.length - 1];
        } else if (str.includes('telegram.me/')) {
            const parts = str.split('telegram.me/');
            str = parts[parts.length - 1];
        }
        if (str.startsWith('@')) {
            str = str.substring(1);
        }
        return str.split('?')[0];
    };

    const fetchExtraData = async (type) => {
        setIsLoadingExtra(true);
        setExtraError(null);
        setExtraDataType(type);
        setExtraData(null);
        try {
            const group = channelId.current.startsWith('@') ? channelId.current : `@${channelId.current}`;
            const response = await apiClient.post('/telegram/extract-admins', {
                action: type === 'admins' ? 'get_admins' : 'get_members',
                group: group
            });
            setExtraData(response.data);
        } catch (err) {
            setExtraError('Failed to fetch ' + type);
        } finally {
            setIsLoadingExtra(false);
        }
    };

    const handleManualSubmit = async (e) => {
        e.preventDefault();
        const username = extractUsername(manualLink);
        if (!username) return;
        
        channelId.current = username;
        await analyzeChannel(username);
    };

    const readDragData = (e) => {
        try {
            const data = e.dataTransfer.getData("application/json");
            return JSON.parse(data);
        } catch {
            return null;
        }
    };

    async function analyzeChannel(channelId, parentSearchId = null) {
        setLoadingState(1);
        setExtraData(null);
        setExtraDataType(null);
        setExtraError(null);
        try {
            const response = await apiClient.post(
                `${import.meta.env.VITE_API_BASE_URL}/telegram/analyze-channel`,
                {
                    channel_username: channelId,
                    language: localStorage.getItem('lang_pref'),
                    analysis_type: 'simple',
                    parent_search_id: parentSearchId
                }
            );
            console.log("Analysis response:", response.data);

            if (!response.data.success) {
                setLoadingState(3);
                setResponseText({ analysis: 'Failed to load analysis.' })
            }

            setResponseText(response.data);
            setLoadingState(2);
        } catch (error) {
            console.error("Analysis failed:", error);
            let err_str = 'Failed to load analysis.';
            try{
                console.log(error.response?.data?.errors)
                if(error.response?.data?.errors){
                    err_str = error.response?.data?.errors.map(err => err.message).join("\n")
                }
            }
            catch(e){
                console.error(e)
            }
            setResponseText({ analysis: err_str })
            setLoadingState(3);
        }

    }

    const handleDragOver = (e) => {
        e.preventDefault(); // Necessary to allow drop
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        const dragData = readDragData(e);

        if (!dragData?.group?.username) return;

        channelId.current = dragData.group.username;

        await analyzeChannel(dragData.group.username, dragData.parentSearchId)
    };

    if (loadingState === 0) {
        return (
            <div
                className='text-center grow text-white flex justify-center items-center'
                onDragOver={handleDragOver}
                onDrop={handleDrop}>
                <div className='grow border font-default-sans border-primary-500 border-dashed m-10 self-stretch flex justify-center items-center flex-col rounded-2xl'>
                    <div className='text-2xl mb-2 animate-text bg-gradient-to-r from-teal-500 via-purple-500 to-orange-500 bg-clip-text text-transparent'>Drag and drop a Telegram group</div>
                    <div className='text-sm text-gray-400 px-10 mb-2'>Darkmap's AI extracts and analyzes messages and conversations of a specified group. Giving you intel on Most Active Users and Their Messages, Alias Pivoting (Actor Enumeration), User-to-Alias Relationship Map, Textual Pattern Mining, Human Trafficking / Adult Scam Connections, Cryptocurrency Indicators and in-depth analysis of illicit Telegram Group without the need of joining group manually.</div>
                    
                    {!showManualInput ? (
                        <div className="text-sm text-gray-400 mb-6">
                            Or <span className="text-primary-500 cursor-pointer hover:underline font-semibold" onClick={() => setShowManualInput(true)}>enter</span> link manually
                        </div>
                    ) : (
                        <form onSubmit={handleManualSubmit} className="mt-2 mb-6 flex flex-col items-center gap-3">
                            <input
                                type="text"
                                placeholder="https://t.me/groupname or @groupname"
                                value={manualLink}
                                onChange={(e) => setManualLink(e.target.value)}
                                className="px-4 py-2 bg-[#00050A] border border-[#126382]/50 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500 min-w-[320px] shadow-inner"
                                autoFocus
                            />
                            <div className="flex gap-3">
                                <button type="submit" disabled={!manualLink.trim()} className="px-5 py-1.5 bg-[#00d1ff]/20 text-[#00d1ff] font-semibold border border-[#00d1ff]/50 rounded-lg hover:bg-[#00d1ff]/30 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                                    Analyze
                                </button>
                                <button type="button" onClick={() => setShowManualInput(false)} className="px-5 py-1.5 bg-gray-800/80 text-gray-300 font-semibold border border-gray-600 rounded-lg hover:bg-gray-700 transition-colors text-sm">
                                    Cancel
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className={`w-full grow p-5 overflow-clip ${loadingState === 1 ? 'glowing-border overflow-clip' : 'overflow-y-scroll'}`}>
            {loadingState === 1 && <div className="text-white p-4 flex flex-col justify-center items-center h-full">
                <div className='w-14 relative animate-pulse'>
                    <img src={Logo} className='w-full mb-1.5'></img>
                    <div className='absolute top-0 right-0 -mt-3 -mr-3 text-white'>
                        <svg className="size-6" xmlns="http://www.w3.org/2000/svg" fill="currentColor" stroke="black" strokeWidth="1" data-name="Layer 1" viewBox="0 0 48 48" x="0px" y="0px" >
                            <path className="cls-1" d="M34.221 27.538c-9.955-2.248-11.497-3.79-13.745-13.745-.103-.455-.508-.779-.976-.779s-.873.324-.976.779c-2.249 9.955-3.79 11.497-13.745 13.745-.456.104-.78.508-.78.976s.324.872.78.976c9.955 2.249 11.496 3.791 13.745 13.745.103.455.508.779.976.779s.873-.324.976-.779c2.249-9.954 3.79-11.496 13.745-13.745.456-.104.779-.508.779-.976s-.324-.872-.779-.976Z" />
                            <path className="cls-1" d="M43.221 12.039c-5.292-1.195-6.035-1.938-7.23-7.229-.104-.456-.508-.779-.976-.779s-.872.323-.976.779c-1.195 5.291-1.938 6.034-7.229 7.229-.456.104-.779.508-.779.976s.323.872.779.976c5.291 1.195 6.034 1.938 7.229 7.23.104.455.508.779.976.779s.872-.324.976-.779c1.195-5.292 1.938-6.035 7.23-7.23.455-.104.779-.508.779-.976s-.324-.872-.779-.976Z" />
                        </svg>
                    </div>
                </div>
                {/* <div className='text-sm'>Analyzing...</div> */}
            </div>}
            {loadingState === 2 && <div onDragOver={handleDragOver} onDrop={handleDrop}>
                <div className='flex justify-between items-center mb-4'>
                    <div className='text-xl text-primary-300'>Channel Statistics</div>
                    <LanguageSelect onChange={() => { if (channelId.current) { analyzeChannel(channelId.current) } }}></LanguageSelect>
                </div>
                <div className='flex flex-wrap text-white gap-y-3 gap-x-2 mb-3'>
                    <div className='text-xs flex border gap-x-2 py-2 border-primary-500 rounded-full items-center px-4' >
                        <div className=''>Total Messages</div>
                        <div className='text-red-500 font-semibold'>{responseText?.totalMessages}</div>
                    </div>
                    <div className='text-xs flex border gap-x-2 py-2 border-primary-500 rounded-full items-center px-4' >
                        <div className=''>Unique Users</div>
                        <div className='text-red-500 font-semibold'>{responseText?.uniqueUsersTotal}</div>
                    </div>
                    <div className='text-xs flex border gap-x-2 py-2 border-primary-500 rounded-full items-center px-4' >
                        <div className=''>Messages / User</div>
                        <div className='text-red-500 font-semibold'>{responseText?.messagesPerUser}</div>
                    </div>
                    <div 
                        className='text-xs flex border gap-x-2 py-2 border-[#00d1ff] rounded-full items-center px-4 cursor-pointer hover:bg-[#00d1ff]/20'
                        onClick={() => fetchExtraData('members')}
                    >
                        View Members
                    </div>
                    <div 
                        className='text-xs flex border gap-x-2 py-2 border-[#00d1ff] rounded-full items-center px-4 cursor-pointer hover:bg-[#00d1ff]/20'
                        onClick={() => fetchExtraData('admins')}
                    >
                        View Admins
                    </div>
                </div>

                {(isLoadingExtra || extraData || extraError) && (
                    <div className='mb-4 p-4 border border-gray-700 rounded-lg bg-gray-800/50 text-sm'>
                        {isLoadingExtra && <div className="text-gray-400 animate-pulse">Loading {extraDataType}...</div>}
                        {extraError && <div className="text-red-500">{extraError}</div>}
                        {extraData && (extraData.members || extraData.admins) && (
                            <div className="max-h-96 overflow-y-auto text-gray-300 scrollbar-thin rounded-lg border border-gray-700">
                                <table className="w-full text-left text-sm text-gray-400">
                                    <thead className="text-xs text-gray-400 uppercase bg-gray-700/50 sticky top-0">
                                        <tr>
                                            <th scope="col" className="px-4 py-3">Name</th>
                                            <th scope="col" className="px-4 py-3">Username</th>
                                            <th scope="col" className="px-4 py-3">Phone</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(extraData.members || extraData.admins).map((member) => (
                                            <tr key={member.id} className="border-b border-gray-700 hover:bg-gray-700/50 transition-colors">
                                                <td className="px-4 py-3 font-medium text-white flex items-center gap-2">
                                                    {member.name || member.first_name || '-'}
                                                    {member.is_bot && <span className="bg-primary-500/20 text-primary-500 text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold">Bot</span>}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {member.username ? <a href={`https://t.me/${member.username}`} target="_blank" rel="noreferrer" className="text-[#00d1ff] hover:underline">@{member.username}</a> : <span className="text-gray-500">-</span>}
                                                </td>
                                                <td className="px-4 py-3 text-xs">{member.phone ? `+${member.phone}` : <span className="text-gray-500">-</span>}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {extraData && !(extraData.members || extraData.admins) && (
                            <div className="max-h-60 overflow-y-auto text-gray-300 scrollbar-thin">
                                <pre className="whitespace-pre-wrap font-sans text-xs">{JSON.stringify(extraData, null, 2)}</pre>
                            </div>
                        )}
                    </div>
                )}

                <UserTableList responseText={responseText}></UserTableList>
                <div className='text-xl text-primary-300 mt-4'>Analysis Summary</div>
                <div className="reset-all font-normal px-3" style={{ color: 'white' }}>
                    <Markdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            h1: ({ children }) => <div className="text-xl text-primary-300 mt-4 mb-2">{children}</div>,
                            h2: ({ children }) => <div className="text-xl text-primary-300 mt-4 mb-2">{children}</div>,
                            h3: ({ children }) => <div className="text-xl text-primary-300 mt-4 mb-2">{children}</div>,
                            h4: ({ children }) => <div className="text-xl text-primary-300 mt-3 mb-1">{children}</div>,
                        }}
                    >
                        {responseText?.analysis}
                    </Markdown>
                </div>
            </div>}
            {loadingState == 3 && <div className='p-4 text-center text-white h-full' onDragOver={handleDragOver}
                onDrop={handleDrop}>{responseText.analysis}</div>}
        </div>
    );
}

export default AIContainer

const LANGUAGES = [
    { english: "English", native: "English" },
    { english: "Chinese", native: "中文"},
    { english: "Hindi", native: "हिन्दी" },
    { english: "Bengali", native: "বাংলা" },
    { english: "Telugu", native: "తెలుగు" },
    { english: "Marathi", native: "मराठी" },
    { english: "Tamil", native: "தமிழ்" },
    { english: "Gujarati", native: "ગુજરાતી" },
    { english: "Urdu", native: "اردو" },
    { english: "Kannada", native: "ಕನ್ನಡ" },
    { english: "Odia", native: "ଓଡ଼ିଆ" },
    { english: "Malayalam", native: "മലയാളം" },
    { english: "Punjabi", native: "ਪੰਜਾਬੀ" },
    { english: "Assamese", native: "অসমীয়া" },
    { english: "Maithili", native: "मैथिली" },
    { english: "Santali", native: "ᱥᱟᱱᱛᱟᱲᱤ" },
    { english: "Konkani", native: "कोंकणी" },
    { english: "Sindhi", native: "سنڌي" },
    { english: "Dogri", native: "डोगरी" },
    { english: "Kashmiri", native: "کٲشُر" },
    { english: "Sanskrit", native: "संस्कृतम्" },
    { english: "Nepali", native: "नेपाली" },
];

const LanguageSelect = ({ onChange }) => {
    return (
        <Dropdown
            items={LANGUAGES}
            getLabel={(lang) => `${lang.native} (${lang.english})`}
            getKey={(lang) => lang.english.toLowerCase()}
            onChange={onChange}
            placeholder="Select a language"
            localStorageKey="lang_pref"
        />
    );
};

import Dropdown from '../Common/dropdown';
import { UserTableList } from './UsersList';

