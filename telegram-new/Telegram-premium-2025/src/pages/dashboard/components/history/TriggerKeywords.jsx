import useDashboardStore from "../../temp";

export function TriggerFrequency() {
    const { data } = useDashboardStore();
    console.log(data)
    return (
        <div className="p-4 rounded-xl space-y-2">
            <h2 className="text-lg font-semibold">Alert Keywords</h2>
            <div className="flex flex-wrap gap-3 overflow-y-auto">
                {Object.entries(data?.triggerFrequency || {}).map(([word, info]) => (
                    <div
                        key={word}
                        className="text-xs flex border gap-x-2 py-2 border-primary-500 rounded-full items-center px-4"
                    >
                        {word}: <span className="text-red-500">{info.count}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}