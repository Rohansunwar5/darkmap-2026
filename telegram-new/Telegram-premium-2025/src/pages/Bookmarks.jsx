import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import AlertCreator from "./dashboard/components/AlertFrequencyBox";
import Spinner from "./dashboard/components/common/spinner";
import Sidenav from "./dashboard/components/Sidenav"
import { useBookmarks } from "./dashboard/DashboardContext";
import { faEye, faTrash } from "@fortawesome/free-solid-svg-icons";
import apiClient from "../lib/apiClient";
import { toast } from "react-toastify";
import LoadingButton from "./dashboard/components/common/button";
import { useNavigate } from "react-router-dom";

function ViewBookmarksComponent() {

    const { bookmarks, loading, error, fetchBookmarks } = useBookmarks();
    const navigate = useNavigate();

    if (loading) {
        return (
            <div className="flex justify-center items-center h-screen bg-gradient-to-br from-primary-950 to-primary-950 via-black">
                <Spinner className="w-6" />
            </div>
        );
    }

    if (error) {
        return <div className="flex justify-center items-center h-screen bg-gradient-to-br from-primary-950 to-primary-950 via-black flex-col text-white">
            <div className='text-white'>Failed to fetch data</div>
        </div>
    }

    async function deleteBookmark(bookmarkId) {
        try {
            const response = await apiClient.delete(`${import.meta.env.VITE_API_BASE_URL}/bookmark/${bookmarkId}`);
            await fetchBookmarks();
            return response.data;
        } catch (error) {
            // Safely handle possible errors
            const message =
                error.response?.data?.errors?.[0]?.message ||
                error.response?.data?.message ||
                error.message ||
                "Something went wrong";
            toast.error(message)
            throw new Error(message);
        }
    }

    return (
        <div>
            <div className="grid grid-cols-1 gap-5 m-5 xl:grid-cols-2">
                {
                    bookmarks.map((bookmark, index) => {
                        return <div className="font-default-sans border border-gray-600 rounded-2xl p-4 bg-gradient-to-bl from-primary-950/40 to-primary-950/40 via-black" key={index}>
                            <h3 className="text-xs text-gray-500">Channel Name</h3>
                            <h1 className="text-2xl">{bookmark.channelName}</h1>
                            <div className="flex">
                                <div className="flex flex-col justify-evenly">
                                    <div className="mt-5">
                                        <h1 className="text-xl text-primary-500">Overall Analytics</h1>
                                        <div className="mt-3 text-sm text-gray-400 space-y-1">
                                            <p>Total Messages: <span className="text-white font-medium">{bookmark.totalMessages}</span></p>
                                            <p>Unique Users: <span className="text-white font-medium">{bookmark.uniqueUsersTotal}</span></p>
                                            <p>Total Links: <span className="text-white font-medium">{bookmark.totalLinks}</span></p>
                                            <p>Total Scrapes: <span className="text-white font-medium">{bookmark.totalScrapes}</span></p>
                                            <p>First Message: <span className="text-white font-medium">
                                                {new Date(bookmark.firstMessageEver).toLocaleDateString()}
                                            </span></p>
                                            <p>Last Message: <span className="text-white font-medium">
                                                {new Date(bookmark.lastMessageEver).toLocaleDateString()}
                                            </span></p>
                                            <p>Most Active Day: <span className="text-white font-medium">
                                                {Object.entries(bookmark.frequencyWeekday)
                                                    .sort((a, b) => b[1] - a[1])[0][0]
                                                    .replace(/^\w/, c => c.toUpperCase())}
                                            </span></p>
                                        </div>
                                    </div>
                                    <div className="grow"></div>
                                    <div className="flex gap-4">
                                        <LoadingButton onClick={() => {navigate(`/group/analysis/${bookmark._id}`)}} className="bg-white text-black py-2">
                                            View
                                            <FontAwesomeIcon className="ms-3" icon={faEye} />
                                        </LoadingButton>
                                        <LoadingButton onClick={() => deleteBookmark(bookmark._id)} className="bg-red-500 text-white py-2">
                                            Delete
                                            <FontAwesomeIcon className="ms-3" icon={faTrash} />
                                        </LoadingButton>
                                    </div>
                                </div>
                                <div className="grow"></div>
                                <AlertCreator channelName={bookmark.channelName} prefill={bookmark}></AlertCreator>
                            </div>
                        </div>
                    })
                }
            </div>
        </div>
    )
}

export default ViewBookmarksComponent