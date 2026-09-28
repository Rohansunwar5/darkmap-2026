import { faDownload } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React from 'react'
import useDashboardStore from '../temp'

function GeneralCard() {

    const { data } = useDashboardStore();

    const totalMessages = data.totalMessages
    const firstDate = new Date(data.firstMessageEver);
    const lastDate = new Date(data.lastMessageEver);

    const diffMs = Math.abs(lastDate - firstDate);

    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    const avgMessagesPerDay = diffDays === 0 ? totalMessages : totalMessages / diffDays;

    // One week in ms
    const weekMs = 7 * 24 * 60 * 60 * 1000;

    // How many gaps fit into one week
    const stepsInWeek = weekMs / diffMs;

    return (
        <div className='flex justify-between grow'>
            <div className='p-3 flex flex-col justify-between'>
                <div>
                    <h1 className='text-2xl'>{avgMessagesPerDay.toFixed(2)}</h1>
                    <div className='text-gray-500 text-sm'>Messages per day</div>
                    <span className='text-xs text-gray-500'>(Estimate)</span>
                </div>
                <div>
                    <h1 className='text-2xl'>{stepsInWeek.toFixed(2)}</h1>
                    <div className='text-gray-500 text-sm'>Weekly credit cost</div>
                </div>
            </div>
            <div className='relative'>
                <img className='rounded-xl h-40' src={`https://tgpfp.darkmap.org/pfp?username=@${data.channelName}`}></img>
                {/* <div className='absolute bottom-0 right-0 m-1 me-2'><FontAwesomeIcon icon={faDownload} className=' p-2 bg-primary-900 rounded-full size-4'></FontAwesomeIcon></div> */}
            </div>
        </div>
    )
}

export default GeneralCard