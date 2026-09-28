import useDashboardStore from '../temp';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  Filler,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import tailwindConfig from '../../../../tailwind.config';
import resolveConfig from 'tailwindcss/resolveConfig';

const fullConfig = resolveConfig(tailwindConfig);

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  Filler,
);

const options = {
  responsive: true,
  plugins: {
    legend: {
      display: false,
    },
    tooltip: {
      callbacks: {
        label: (context) => `${context.raw} messages`,
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        display: false
      },
    },
  },
};

function WeeklyBarChart() {
  const { data } = useDashboardStore();

  const weekdayOrder = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",];

  const labels = weekdayOrder.filter(day => day in data.frequencyWeekday);
  const values = labels.map(day => data.frequencyWeekday[day]);

  const chartData = {
    labels,
    datasets: [
      {
        label: "Messages",
        data: values,
        borderColor: fullConfig.theme.colors.blue[800],
        backgroundColor: (context) => {
          if (!context.chart?.chartArea) {
            return
          }
          const { ctx, data, chartArea: { top, bottom } } = context.chart;
          const gradientBg = ctx.createLinearGradient(0, top, 0, bottom)
          gradientBg.addColorStop(0, 'rgba(0, 120, 255, 0.4)');
          gradientBg.addColorStop(0.3, 'rgba(0, 120, 255, 0.6)');
          gradientBg.addColorStop(1, 'rgba(0, 120, 255, 0)');
          return gradientBg;
        },
        borderRadius: 4,
        tension: 0.4,
        fill: true,
      },
    ],
  };

  const maxIndex = values.indexOf(Math.max(...values));
  const mostActiveDay = labels[maxIndex];

  return (
    <div className="flex flex-col">
      <h1 className="p-2 text-lg font-semibold text-dashboard-title">Weekly Activity</h1>
      <Line options={options} data={chartData} />
      <span className='text-sm text-gray-500 mt-8'>The group shows most activity on <span className='text-red-500'>{mostActiveDay}s</span></span>
    </div>
  );
}

export default WeeklyBarChart;
