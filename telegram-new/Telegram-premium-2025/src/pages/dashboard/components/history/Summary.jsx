import { ItemWrapper } from "../../Dashboard";
import useDashboardStore from "../../temp";
import { TriggerFrequency } from "./TriggerKeywords";

export function ScrapeSummary() {
    const { data } = useDashboardStore();

    const totalMessages = 100;

    const totalKeywords = Object.entries(data?.triggerFrequency || {})
        .reduce((sum, [, info]) => sum + (info.count || 0), 0);

        const totalLinks = data?.links?.length || 0;

    const keywordsPercent = totalMessages ? ((totalKeywords / totalMessages) * 100).toFixed(1) : 0;
    const linksPercent = totalMessages ? ((totalLinks / totalMessages) * 100).toFixed(1) : 0;

    return (
        <div>
            <div className="grid font-default-sans grid-cols-3 p-4 grid-rows-[80px_30px]">
                {/* Total Messages */}
                <div className="p-2 bg-primary-900">
                    <h2 className="text-sm">Total Messages</h2>
                    <div className="text-gray-300">{totalMessages}</div>
                </div>

                {/* Top Keywords */}
                <div className="p-2">
                    <h2 className="text-sm">Top Keywords</h2>
                    <div className="text-gray-500">{totalKeywords}</div>
                </div>

                {/* Links Extracted */}
                <div className="p-2">
                    <h2 className="text-sm">Links Extracted</h2>
                    <div className="text-gray-500">{totalLinks}</div>
                </div>

                {/* Progress Bars */}
                <div className="bg-primary-700 text-center">
                    <span className="text-white text-sm">100%</span>
                </div>

                <div className="bg-primary-800 text-center">
                    <span className="text-white text-sm">{keywordsPercent}%</span>
                </div>

                <div className="bg-primary-900 text-center">
                    <span className="text-white text-sm">{linksPercent}%</span>
                </div>
            </div>
            <div className='flex items-start'> 
                <ItemWrapper className='grow'><TriggerFrequency></TriggerFrequency></ItemWrapper>
            </div>
        </div>
    );
}
