import React, { useEffect, useState } from 'react'
import useDashboardStore from '../temp';
import { formatDate } from './common/helper';

const GAP_COUNT = 3

function Timeline() {

    const { data } = useDashboardStore();
    const [parsedDate, setParsedDate] = useState({
        start: new Date(),
        end: new Date(),
    });

    useEffect(() => {
        const date_start = new Date(data.lastMessageEver);
        const date_end = new Date(data.firstMessageEver);

        setParsedDate({ start: date_start, end: date_end });

        const gap = (date_end - date_start) / (GAP_COUNT * 1000)


    }, [data])


    return (
        <div className='grid' style={{ gridTemplateColumns: `repeat(${GAP_COUNT + 2}, 1fr)` }}>
            <div className='border-e border-[rgb(0,99,147)]'></div>
            <div className='text-white px-3 py-1 bg-blue-500 rounded-full text-center text-xs mb-2 mx-3' style={{ gridColumn: `span ${GAP_COUNT}` }}></div>
            <div className='border-s border-[rgb(0,99,147)]'></div>
            {
                Array(GAP_COUNT + 2).fill(0).map((_, index) => {
                    return <div className='border border-[rgb(0,99,147)] bg-[rgb(0,12,17)] h-5 border-collapse relative' key={index}>
                        {index == 0 && <div className='text-xs absolute right-0 translate-x-1/2 mt-3 text-center translate-y-full whitespace-nowrap'>{formatDate(parsedDate.start)}</div>}
                        {index == (GAP_COUNT + 1) && <div className='text-xs absolute left-0 -translate-x-1/2 mt-3 text-center translate-y-full whitespace-nowrap'>{formatDate(parsedDate.end)}</div>}
                    </div>
                })
            }
            {
                Array(GAP_COUNT - 1).fill(0).map((_, index) => {
                    return <div key={index}></div>
                })
            }
        </div>
    )
}

function parseDate(date) {
    const timestamp = Date.parse(date);
    return new Date(timestamp);
}

export default Timeline