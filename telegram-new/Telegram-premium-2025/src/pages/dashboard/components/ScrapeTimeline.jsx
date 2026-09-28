import React from 'react'
import useDashboardStore from '../temp'
import { formatDate } from './common/helper'
import Tooltip from '../../../components/Common/Tooltip';
import { useNavigate } from 'react-router-dom';

function ScrapeTimeline() {

    const { historyData, data, bookmarkData } = useDashboardStore()

    console.log(historyData, bookmarkData)
    const dateObj = new Date(data.nextScrapeAt);

    const navigate = useNavigate();

    return (
        <div className='overflow-x-auto flex justify-start items-start grow h-full pt-14'>
            <div className="relative whitespace-nowrap ms-10 rounded-2xl" style={{backgroundColor: 'rgb(223, 29, 29)'}}>
                <div className='absolute -top-6 text-sm text-gray-500 ps-2'>Next Scrape</div>
                <div className='px-4 py-2 '>
                    {dateObj.toLocaleDateString()} {dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
            </div>
            {historyData.data.map((scrape, index) => {

                const dateObj = new Date(scrape.scrapedAt)

                return (
                    <React.Fragment key={index}>
                        <div className='border-b flex-shrink-0 w-10 mt-5'></div>
                        <Tooltip text={'View Detailed'}>
                            <div className="whitespace-nowrap bg-[#033249] hover:bg-primary-950 cursor-pointer px-4 py-2 rounded-2xl" onClick={()=>{navigate(`/group/history/${data.bookmarkId}/${scrape._id}`)}}>
                                {dateObj.toLocaleDateString()} {dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </div>
                        </Tooltip>
                    </React.Fragment>
                );
            })}
        </div>
    )
}

export default ScrapeTimeline