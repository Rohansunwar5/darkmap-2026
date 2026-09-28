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

function HourlyBarChart() {
  const { data } = useDashboardStore();

  const labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
  const chartData = {
    labels,
    datasets: [
      {
        label: 'Messages',
        data: data.frequencyHourly,
        borderColor: 'rgba(0, 90, 200, 1)', // darker line color
        pointBackgroundColor: 'rgba(0, 120, 255, 1)', // bright pointer color
        pointBorderColor: 'white', // optional for contrast
        pointRadius: 4, // size of the pointer dots
        pointHoverRadius: 6,
        backgroundColor: (context) => {
          if (!context.chart?.chartArea) return;
          const { ctx, chartArea: { top, bottom } } = context.chart;
          const gradientBg = ctx.createLinearGradient(0, top, 0, bottom);
          gradientBg.addColorStop(0, 'rgba(0, 120, 255, 0.4)');
          gradientBg.addColorStop(1, 'rgba(0, 120, 255, 0)');
          return gradientBg;
        },
        fill: true,
      },
    ],
  };


  const maxActivity = Math.max(...data.frequencyHourly);
  const maxActivityIndex = data.frequencyHourly.indexOf(maxActivity);

  return (
    <div className="flex flex-col my-3">
      <h1 className="p-2 text-lg font-semibold text-dashboard-title">Hourly Activity</h1>

      <Line options={options} data={chartData} />
      <span className='text-sm text-gray-500 mt-4'>The group shows most activity at <span className='text-red-500'>{maxActivityIndex}:00</span></span>
    </div>
  );
}

export default HourlyBarChart;
