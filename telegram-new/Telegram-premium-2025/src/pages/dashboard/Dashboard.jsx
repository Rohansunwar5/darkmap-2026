import React from 'react'
import useSearchResults from '../../components/Genric/useSearchResults';
import { useEffect } from 'react';
import Sidenav from './components/Sidenav';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faAdd, faCheck, faCheckCircle, faDownload, faSearch } from '@fortawesome/free-solid-svg-icons';
import { useState } from 'react';
import clsx from 'clsx';
import HourlyBarChart from './components/HourlyActvity';
import useDashboardStore from './temp';
import UserPieChart from './components/UserPieChart';
import WeeklyBarChart from './components/WeeklyLineChart';
import ExtractedLinks from './components/ExtractedLinks';
import { useOverlay } from './components/OverlaySystem';
import Timeline from './components/Timeline';
import { UserTableList } from '../../components/AI/UsersList';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import apiClient from '../../lib/apiClient';
import UserBarChart from './components/UserBarChart';
import GeneralCard from './components/GeneralCard';
import AlertCreator, { KeywordInput } from './components/AlertFrequencyBox';
import Spinner from './components/common/spinner';
import { Link, useParams } from 'react-router-dom';
import AiSummary from './components/AiSummary';
import ScrapeTimeline from './components/ScrapeTimeline';
import LoadingButton from './components/common/button';
import { ChatSearch, KeywordAnalysis } from './components/HistoryModeComponents';
import ChatsByUser from './components/history/MessagesByUser';
import MessageTimelineChart from './components/history/Timeline';
import { TriggerFrequency } from './components/history/TriggerKeywords';
import { ScrapeSummary } from './components/history/Summary';


function Dashboard({ mode }) {
    const { data, setData, historyData, setHistoryData, bookmarkData, setBookmarkData, setChatData } = useDashboardStore();
    const { bookmark_id, scrape_id } = useParams();

    const [loading, setLoading] = useState(true);

    const { showOverlay } = useOverlay();

    function showTriggerModal() {
        if (!data) return;
        showOverlay(<AlertCreator channelName={data.channelName} channelId={data.channelId} stats={data} />, "Create Trigger");
    }

    async function fetchBookmarkAndHistory() {
        try {
            setLoading(true);

            let _bookmarkData;
            if (bookmark_id && bookmarkData?.bookmarkId != bookmark_id) {
                // Fetch bookmark dashboard stats
                const statsResponse = await apiClient.get(
                    `${import.meta.env.VITE_API_BASE_URL}/bookmark/${bookmark_id}/dashboard-stats`
                );

                const { statistics, ...rest } = statsResponse.data.data;
                _bookmarkData = { ...rest, ...(statistics ?? {}), isBookmark: true };
                setBookmarkData(_bookmarkData);
            }
            else {
                _bookmarkData = bookmarkData;
            }

            if (mode == 'bookmark') {
                setData(_bookmarkData);
            }

            let _historyData;
            if (bookmark_id && !_historyData) {

                // Fetch scrape history
                const historyResponse = await apiClient.get(
                    `${import.meta.env.VITE_API_BASE_URL}/bookmark/${bookmark_id}/scrape-data`
                );

                _historyData = historyResponse.data.data;
                setHistoryData(_historyData);
            }
            else {
                _historyData = historyData
            }

            // If history mode, pick the specific scrape
            if (mode === "history") {
                const scrapeData = _historyData.data.find((d) => d._id === scrape_id);
                const { analysis, ...rest } = scrapeData;
                const _scrapeData = { ..._bookmarkData, ...rest, ...(analysis ?? {}) };
                setData(_scrapeData ?? null);

                setChatData(null);
                const res = await fetch(`https://telegram-scraper-bucket-73640.s3.us-east-1.amazonaws.com/${_scrapeData.s3Key}`);
                const json = await res.json();
                setChatData(json);
            }
        } catch (error) {
            console.error("Failed to fetch dashboard stats:", error);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchBookmarkAndHistory();
    }, []);

    useEffect(() => {
        if (!bookmarkData) {
            return;
        }
        if (mode == 'bookmark') {
            setData(bookmarkData);
        }
        if (!historyData) {
            return;
        }
        if (mode == 'history') {
            const scrapeData = historyData.data.find((d) => d._id === scrape_id);
            const { analysis, ...rest } = scrapeData;
            const _scrapeData = { ...bookmarkData, ...rest, ...(analysis ?? {}) };
            setData(_scrapeData ?? null);
            setChatData(null);

            const loadMore = async () => {
                const res = await fetch(`https://telegram-scraper-bucket-73640.s3.us-east-1.amazonaws.com/${_scrapeData.s3Key}`)
                const json = await res.json()
                setChatData(json)
            }

            loadMore();
        }
    }, [bookmark_id, scrape_id, mode]);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-screen bg-gradient-to-br from-primary-950 to-primary-950 via-black">
                <Spinner className="w-6" />
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex justify-center items-center h-screen bg-gradient-to-br from-primary-950 to-primary-950 via-black flex-col text-white">
                <div className="text-white">Failed to fetch data</div>
                <div className="text-blue-500 font-default-sans underline">
                    <Link to={"/group/search"}>Go to search</Link>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="mx-4 mb-4 flex p-4 gap-4 items-end">
                <div>
                    <h1 className="text-2xl text-red-500">{data?.channelName}</h1>
                    <div className="text-sm text-primary-500 underline">t.me/{data?.channelName}</div>
                </div>
                <div className="grow mx-20">
                    <Timeline />
                </div>
                {mode != 'bookmark' && mode != 'history' && <div className="bg-[#033249] cursor-pointer hover:bg-primary-950 transition-colors rounded-full flex justify-center items-center px-4 py-2" onClick={showTriggerModal}>
                    <h1>
                        Add This Group <FontAwesomeIcon icon={faAdd} className="size-4" />
                    </h1>
                </div>}
            </div>
            <div className="px-4 grid lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:grid-rows-[300px_350px_350px_350px_350px_350px] xl:grid-rows-[300px_350px_350px_350px_350px_350px] mt-10 grid-flow-dense">
                {mode === "history" && <HistoryModeItems />}
                <DashboardItems mode={mode} />
                {data?.links && <ItemWrapper className={'overflow-auto flex-col'}><ExtractedLinks></ExtractedLinks></ItemWrapper>}
                {mode === "bookmark" && <BookmarkModeItems />}
            </div>
        </>
    );
}

function BookmarkModeItems() {
    return <>
        <ItemWrapper className={'col-span-3'} flex={false}>
            <ScrapeTimeline></ScrapeTimeline>
        </ItemWrapper>
    </>
}

function HistoryModeItems() {

    const { setChatData, chatData, data } = useDashboardStore();

    return <>
        <ScrapeSummary></ScrapeSummary>
        {/* {!chatData && <ItemWrapper flex={false} className={'justify-center items-center'}>
            <div className='w-full h-full flex justify-center items-center relative'>
                <FontAwesomeIcon className='size-1/2 text-gray-900' icon={faSearch}></FontAwesomeIcon>
                <LoadingButton className='bg-primary-500 text-white absolute' onClick={loadMore}>View Detailed</LoadingButton>
            </div>
        </ItemWrapper>
        } */}
        {
            chatData && (<>
                <ItemWrapper><KeywordAnalysis chatData={chatData}></KeywordAnalysis></ItemWrapper>
                <ItemWrapper className={'col-span-2 flex-col gap-4'}><ChatsByUser></ChatsByUser></ItemWrapper>
                <ItemWrapper className={'col-span-1 row-span-2 flex-col gap-4'}><ChatSearch></ChatSearch></ItemWrapper>
                <ItemWrapper><MessageTimelineChart></MessageTimelineChart></ItemWrapper>
            </>)
        }
    </>
}

function DashboardItems({ mode }) {

    const { data } = useDashboardStore();

    return <>
        <ItemWrapper className={`relative ${mode == 'history' && 'col-start-2 row-start-1'}`}>
            <GeneralCard></GeneralCard>
        </ItemWrapper>
        <ItemWrapper className={'col-span-2'}>
            <UserBarChart></UserBarChart>
        </ItemWrapper>
        {mode != 'history' &&
            <ItemWrapper className={'overflow-y-scroll p-3 px-7 reset-all prose row-span-2 font-default-sans'} flex={false}>
                <AiSummary mode={mode}></AiSummary>
            </ItemWrapper>
        }
        <ItemWrapper className={'overflow-y-auto p-3 font-default-sans font-semibold'} flex={false}>
            <div className='flex justify-between items-center mb-4'>
                <div className='text-xl text-dashboard-title'>Channel Statistics</div>
            </div>
            <div className='flex flex-wrap text-white gap-y-3 gap-x-2 mb-3'>
                {/* <div className='text-xs flex border gap-x-2 py-2 border-primary-500 rounded-full items-center px-4' >
                    <div className=''>Total Messages</div>
                    <div className='text-red-500 font-semibold'>{data.total_messages}</div>
                </div> */}
                <div className='text-xs flex border gap-x-2 py-2 border-primary-500 rounded-full items-center px-4' >
                    <div className=''>Unique Users</div>
                    <div className='text-red-500 font-semibold'>{data.uniqueUsersTotal}</div>
                </div>
                {/* <div className='text-xs flex border gap-x-2 py-2 border-primary-500 rounded-full items-center px-4' >
                    <div className=''>Messages / User</div>
                    <div className='text-red-500 font-semibold'>{data.messages_per_user}</div>
                </div> */}
            </div>
            <UserTableList className='w-full' responseText={data}></UserTableList>
        </ItemWrapper>
        {mode != 'history' &&
            <ItemWrapper>
                <HourlyBarChart></HourlyBarChart>
            </ItemWrapper>
        }
        <ItemWrapper>
            <UserPieChart></UserPieChart>
        </ItemWrapper>
        {mode != 'history' &&
            <ItemWrapper>
                <WeeklyBarChart></WeeklyBarChart>
            </ItemWrapper>
        }
        {/* <ItemWrapper>
            <ExtractedLinks></ExtractedLinks>
        </ItemWrapper> */}
    </>
}

export function ItemWrapper({ children, className, flex = true }) {
    return <div className={clsx('bg-gray-950 rounded-xl overflow-clip bg-gradient-to-br from-[#001824] via-gray-950 to-primary-950/60', className, flex && 'flex justify-center items-center')}>
        {children}
    </div>
}


export default Dashboard