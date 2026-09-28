import { faSearch } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom';
import useDashboardStore from './dashboard/temp';
import { data } from './dashboard/data';
import Spinner from './dashboard/components/common/spinner';
import apiClient from '../lib/apiClient';
import { toast, ToastContainer } from 'react-toastify';

const re = /^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([^\/?#]+)(?:[\/?#].*)?$/i;

function getChannelId(url) {
  const m = url.match(re);
  return m ? m[1] : null;
}

function GroupSearchComponent() {

    const [searchText, setSearchText] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate()
    const setData = useDashboardStore(state => state.setData);

    async function search() {
        setLoading(true);

        const channelId = getChannelId(searchText);
        if(!channelId){
            toast.error("Please enter a valid link.")
            setLoading(false);
            return;
        }

        try {
            const response = await apiClient.post(
                `${import.meta.env.VITE_API_BASE_URL}/telegram/analyze-channel`,
                {
                    channel_username: channelId,
                    // language: localStorage.getItem('lang_pref')
                    analysis_type: 'comprehensive'
                }
            );
            console.log("Analysis response:", response.data);
            response.data.channelName = channelId;
            setData(response.data);
            navigate('/group/analysis')

        } catch (error) {
            console.error("Analysis failed:", error);
            let err_str = 'Failed to load analysis.';
            try{
                console.log(error.response?.data?.errors)
                if(error.response.data.message){
                    toast.error(error.response.data.message);
                }
            }
            catch(e){
                console.error(e)
            }
            setLoading(false);
        }
    }

    return (
        <div className='bg-black h-dvh flex'>
            <div className='flex grow justify-center items-center flex-col text-white'>
                <div className='text-5xl mb-10'>Darkmap OSINT</div>
                <div className='text-3xl text-gray-300'>Group Analysis</div>
                <div className='text text-gray-400 font-default-sans'>Generate details statistics with AI asissted analysis</div>
                {loading 
                ? <div className='font-default-sans inline-flex justify-center items-center gap-x-4 mt-10'>Searching for {searchText} <div><Spinner className='size-4'></Spinner></div></div> 
                : <div className='p-10'>
                    <label className='text-sm ms-3 mb-1 text-primary-600'>Search for a group</label>
                    <div>
                        <div className='inline-flex bg-gray-950 rounded-full mt-2 overflow-clip border border-primary-500'>
                            <input className='text-white bg-inherit px-4 py-2 w-96' value={searchText} onChange={(e)=>{setSearchText(e.target.value)}}></input>
                             <FontAwesomeIcon onClick={() => { search() }} icon={faSearch} className='p-3 px-4 rounded-full text-white hover:bg-primary-900'></FontAwesomeIcon>
                        </div>
                    </div>
                </div>
                }
            </div>
        </div>
    )
}

export default GroupSearchComponent