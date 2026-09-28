import React, { useMemo } from "react";
import { Line } from "react-chartjs-2";
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Tooltip,
    Legend,
    Filler,
} from "chart.js";
import useDashboardStore from "../../temp";

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Tooltip,
    Legend,
    Filler
);

const MessageTimelineChart = () => {
    const { chatData } = useDashboardStore();

    const { labels, dataPoints } = useMemo(() => {
        if (!chatData || chatData.length === 0) {
            return { labels: [], dataPoints: [] };
        }

        // Sort messages by timestamp
        const sorted = [...chatData].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        const start = new Date(sorted[0].timestamp).getTime();
        const end = new Date(sorted[sorted.length - 1].timestamp).getTime();
        const diffMinutes = (end - start) / (1000 * 60);
        const diffHours = diffMinutes / 60;
        const diffDays = diffHours / 24;

        // Decide grouping granularity
        let granularity;
        if (diffHours <= 2) {
            granularity = "minute";
        } else if (diffHours <= 48) {
            granularity = "hour";
        } else if (diffDays <= 90) {
            granularity = "day";
        } else {
            granularity = "month";
        }

        const counts = {};

        sorted.forEach(({ timestamp }) => {
            const date = new Date(timestamp);
            let label = "";

            if (granularity === "minute") {
                label = date.toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "numeric",
                }).replace(/,/, ""); // e.g. "Sep 1 12:05"
            } else if (granularity === "hour") {
                label = date.toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                }).replace(/,/, ""); // e.g. "Sep 1 12 PM"
            } else if (granularity === "day") {
                label = date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                }); // e.g. "Sep 1"
            } else {
                label = date.toLocaleDateString("en-US", {
                    month: "short",
                    year: "2-digit",
                }); // e.g. "Sep '25"
            }

            counts[label] = (counts[label] || 0) + 1;
        });


        return {
            labels: Object.keys(counts),
            dataPoints: Object.values(counts),
        };
    }, [chatData]);

    const chartData = {
        labels,
        datasets: [
            {
                label: "Messages",
                data: dataPoints,
                borderColor: 'rgba(0, 90, 200, 1)', // darker line color
                pointBackgroundColor: 'rgba(0, 120, 255, 1)', // bright pointer color
                pointBorderColor: 'white', // optional for contrast
                pointRadius: 4, // size of the pointer dots
                pointHoverRadius: 6,
                tension: 0.4, // smooth line
                backgroundColor: (context) => {
                    if (!context.chart?.chartArea) return;
                    const {
                        ctx,
                        chartArea: { top, bottom },
                    } = context.chart;
                    const gradientBg = ctx.createLinearGradient(0, top, 0, bottom);
                    gradientBg.addColorStop(0, "rgba(0, 120, 255, 0.4)");
                    gradientBg.addColorStop(1, "rgba(0, 120, 255, 0)");
                    return gradientBg;
                },
                fill: true,
            },
        ],
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: "#1e293b",
                titleColor: "#fff",
                bodyColor: "#fff",
                borderColor: "#0ea5e9",
                borderWidth: 1,
            },
        },
        scales: {
            x: {
                ticks: {
                    color: "#475569",
                    font: { size: 12 },
                    maxRotation: 45,
                    minRotation: 0,
                    autoSkip: true,
                },
                grid: { color: "rgba(0,0,0,0.05)" },
            },
            y: {
                beginAtZero: true,
                ticks: { color: "#475569", stepSize: 1 },
                grid: { color: "rgba(0,0,0,0.05)" },
            },
        },
    };

    return (
        <div className="w-full h-80 p-4 rounded-2xl shadow-md">
            <Line data={chartData} options={chartOptions} />
        </div>
    );
};

export default MessageTimelineChart;
