import { useEffect, useRef, useState } from "react";
import apiClient from "../../../lib/apiClient";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import useDashboardStore from "../temp";

export default function AiSummary({mode}) {
  const { bookmarkData, setBookmarkData, data } = useDashboardStore();
  const [analysis, setAnalysis] = useState(data.analysis || "");
  const [loading, setLoading] = useState(false);

  console.log(bookmarkData)

  useEffect(() => {
    const fetchAnalysis = async () => {
      if(loading) return;

      if (!bookmarkData?.isBookmark) return;

      if(mode != 'bookmark') return;

      if(bookmarkData.analysis) return;

      setLoading(true);
      try {
        const response = await apiClient.post(
          `${import.meta.env.VITE_API_BASE_URL}/bookmark/${bookmarkData.bookmarkId}/alert`,
          {}
        );

        // Extract analysis text
        const fetchedAnalysis = response.data?.data?.summary || "";
        console.log(fetchedAnalysis)
        setBookmarkData({...bookmarkData, analysis: fetchedAnalysis})
        setAnalysis(fetchedAnalysis);
      } catch (err) {
        console.error("Failed to fetch bookmark analysis:", err);
        setAnalysis("⚠️ Failed to fetch analysis.");
      } finally {
        setLoading(false);
      }
    };

    fetchAnalysis();
  }, [bookmarkData]);

  return loading ? (
    <div className="flex items-center justify-center py-6 text-gray-500">
      Loading
    </div>
  ) : (
    <Markdown remarkPlugins={[remarkGfm]}>{analysis}</Markdown>
  );
}