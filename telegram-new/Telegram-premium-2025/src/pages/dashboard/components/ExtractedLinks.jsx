import React, { useState } from 'react'
import useDashboardStore from '../temp'
import { useOverlay } from './OverlaySystem';

function ExtractedLinks() {

    const { data } = useDashboardStore();

    const { showOverlay } = useOverlay();

    function openOverlay(item){
        const selectedMessage = data.important_messages[item.message_id] ?? {'sender': 'N/A', 'text':'Unavailable'}
        // showOverlay(<MessageComponent message={selectedMessage} links={item.links}></MessageComponent>, 'Chat Message')
    }

    return (
        <>
            <div className='bg-black p-2 text-sm sticky top-0 right-0 border-b border-gray-800 shadow-md w-full'>
                <h1 className='text-xl'>Extracted Links</h1>
            </div>
            <div className='grow block w-full justify-start overflow-auto'>
                {data.links.map((item, index)=>{
                    return <a target='_blank' className='p-2 text-xs cursor-pointer hover:text-primary-500 underline whitespace-nowrap block' key={index} href={item.links} onClick={()=>{openOverlay(item)}}>{item.links}</a>
                })}
            </div>
        </>
    )
}

export function MessageComponent({message, links=[]}) {
  return (
    <div className='mt-3 font-default-sans'>
        <div className='text-xs text-gray-500'>Sent by</div>
        <div className='mb-1 text-red-500'>{message.sender}</div>
        <div className='bg-primary-700 p-2 rounded-md'>{message.text}</div>
        <div className='text-sm text-gray-500 text-end mt-1'>Sent at <span className='text-gray-300'>{new Date(message.timestamp * 1000).toString()}</span></div>
        <div className='mt-4'>
            <h1 className=''>Extracted Links</h1>
            {links.map((link, index)=>{
                return <a key={index} href={link} className='text-blue-500 underline'>{link}</a>
            })}
        </div>
    </div>
  )
}


export default ExtractedLinks