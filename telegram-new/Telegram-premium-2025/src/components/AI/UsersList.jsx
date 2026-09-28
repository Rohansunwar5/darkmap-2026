import { useState } from "react";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload } from '@fortawesome/free-solid-svg-icons';
import Tooltip from '../Common/Tooltip';
import { exportExcel } from '../Common/utils';
import { faTableList } from '@fortawesome/free-solid-svg-icons';

export function UserTableList({ responseText = {}, className = "" }) {

    const [exporting, setExporting] = useState(false);

    const defaultClip = 10;
    const [topUsersClip, setTopUsersClip] = useState(defaultClip);
    const users = (responseText.top50Users??Object.entries(responseText.frequencyUser).map(([username, count]) => ({ username, messageCount: count }))) || [];
    const showingAll = topUsersClip >= users.length;

    const downloadUsersExcel = () => {
        setExporting(true)
        const normalized = [];
        normalized.push(Object.keys(users))
        users.forEach((item) => { normalized.push(Object.values(item)) })
        exportExcel([normalized], `darkmap_${responseText.channel}_export`)
        setExporting(false);
    }

    const [isTableMode, setIsTableMode] = useState(false);

    const toggleClip = () => {
        console.log(showingAll ? defaultClip : users.length)
        setTopUsersClip(showingAll ? defaultClip : users.length);
    };

    const clippedUsers = users.slice(0, topUsersClip);

    return <>
        <div className='flex justify-between items-center mb-4'>
            <div className='text-dashboard-title text-xl'>Top Users</div>
            {users.length > defaultClip && (
                <button onClick={toggleClip} className="px-4 py-2 text-white text-xs hover:text-primary-500">
                    {`(${clippedUsers.length}/${users.length})`}&nbsp;
                    {showingAll ? 'View Less' : `View More`}
                </button>
            )}
            <div className='grow'></div>
            <Tooltip position='top' text={"Switch View"}>
                <button className="relative text-xs hover:bg-primary-950 p-1 ms-3 bg-transparent text-white border-none cursor-pointer flex items-center font-[Aldrich]" onClick={() => { setIsTableMode(mode => !mode) }}>
                    <i className='text-white'>
                        <FontAwesomeIcon className='size-4' icon={faTableList} />
                    </i>
                </button>
            </Tooltip>
            <Tooltip position='top' text={"Export"}>
                <button className="relative text-xs hover:bg-primary-950 p-1 ms-3 bg-transparent text-white border-none cursor-pointer flex items-center font-[Aldrich]" onClick={downloadUsersExcel}>
                    <i className='text-white'>
                        <FontAwesomeIcon className='size-4' icon={faDownload} />
                    </i>
                </button>
            </Tooltip>
        </div>
        <UsersList className={className} isTableMode={isTableMode} users={clippedUsers}></UsersList>
    </>
}

function UsersList({ isTableMode, users, className }) {

    if (isTableMode) {
        return (
            <div className={className}>
                <table className='text-white text-xs w-full'>
                    <thead>
                        <tr>
                            <th className='border border-gray-700 p-1'>Rank</th>
                            <th className='border border-gray-700 p-1'>Name</th>
                            <th className='border border-gray-700 p-1'>Username</th>
                            <th className='border border-gray-700 p-1'>Message Count</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(users).map((user, index) => {
                            return <tr key={index}>
                                <td className='w-10 border border-gray-700 p-1'>{index + 1}</td>
                                <td className='border border-gray-700 p-1'>{user.displayName ?? user.username ?? user.user}</td>
                                <td className='border border-gray-700 p-1'>{user.username ?? user.user}</td>
                                <td className='border border-gray-700 p-1'>{user.messageCount ?? user.count}</td>
                            </tr>
                        })}
                    </tbody>
                </table>
            </div>
        )
    }

    return <div className={`flex flex-wrap gap-3 ${className}`}>
        {(users).map((user, index) => {
            return <div className='text-xs flex border gap-x-2 py-2 border-primary-500 rounded-full items-center px-4' key={index} >
                <div className='text-white'>{user.username != 'No Username' ? user.username : user.displayName}</div>
                <div className='text-red-500 font-semibold'>{user.messageCount ?? user.count}</div>
            </div>
        })}
    </div>
}

