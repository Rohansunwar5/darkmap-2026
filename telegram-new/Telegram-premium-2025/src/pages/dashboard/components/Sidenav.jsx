import { faAdd, faBookmark, faSearch, faRobot, faShieldHalved } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React from 'react'
import { useBookmarks } from '../DashboardContext'
import Tooltip from '../../../components/Common/Tooltip';
import { useNavigate } from 'react-router-dom';

function Sidenav() {

    const {bookmarks, loading} = useBookmarks();

    const navigate = useNavigate();

    return (
        <div className='flex flex-col bg-black p-3 text-white bg-gradient-to-b from-black to-black via-primary-950 shadow-sm shadow-primary-500 w-min'>
            <div className='flex items-center h-10'>
                {/* <img className='h-8' src='logo_text.png'></img> */}
                <img src='/logo.png' className='h-10 ms-2'></img>
            </div>
            <div className='mt-10 flex flex-col gap-y-6'>
                <MenuItem onClick={()=>{navigate('/group/bookmarks')}}><Tooltip text={'View Bookmarks'} position='right'><FontAwesomeIcon icon={faBookmark} ></FontAwesomeIcon></Tooltip></MenuItem>
                <MenuItem onClick={()=>{navigate('/group/search')}} ><Tooltip text={'Search Groups'} position='right'><FontAwesomeIcon icon={faSearch} ></FontAwesomeIcon></Tooltip></MenuItem>
                <MenuItem onClick={()=>{navigate('/group/decoy')}}><Tooltip text={'AI Decoy Bot'} position='right'><FontAwesomeIcon icon={faRobot} ></FontAwesomeIcon></Tooltip></MenuItem>
                <MenuItem onClick={()=>{navigate('/admin/decoy-accounts')}}><Tooltip text={'Account Pool'} position='right'><FontAwesomeIcon icon={faShieldHalved} ></FontAwesomeIcon></Tooltip></MenuItem>
            </div>
        </div>
    )
}

function MenuItem({children, onClick=()=>{}}){
    return <div className='flex justify-between items-center p-2 hover:text-primary-500 cursor-pointer px-4 transition-all' onClick={onClick}>
        {children}
    </div>
}

export default Sidenav