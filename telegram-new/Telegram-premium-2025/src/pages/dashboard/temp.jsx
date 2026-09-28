import { create } from 'zustand';
import { data } from './data';

const useDashboardStore = create((set) => ({
    data: null,
    historyData: null,
    bookmarkData: null,
    setData: (newData) => set({ data: newData }),
    setBookmarkData: (newData) => set({ bookmarkData: newData }),
    setHistoryData: (newData) => set({ historyData: newData }),
    chatData: null,
    setChatData: (newData) => set({ chatData: newData }),
    clearAll: () => set({ data: null, bookmarkData: null, historyData: null, chatData: null }),
}));


export default useDashboardStore;