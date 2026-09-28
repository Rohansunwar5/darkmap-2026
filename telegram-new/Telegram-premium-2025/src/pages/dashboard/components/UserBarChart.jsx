import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import useDashboardStore from '../temp';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { faInfo, faInfoCircle, faRefresh } from '@fortawesome/free-solid-svg-icons';
import TooltipComponent from '../../../components/Common/Tooltip';


ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function UserBarChart() {
  const { data } = useDashboardStore();
  const [excluded, setExcluded] = useState([]);

  const sortedEntries = Object.entries(data.frequencyUser).sort((a, b) => b[1] - a[1]);
  const filteredEntries = sortedEntries.filter(([user]) => !excluded.includes(user));

  const labels = filteredEntries.map(([key]) =>
    key.length > 10 ? key.slice(0, 10) + '…' : key
  );
  const values = filteredEntries.map(([_, value]) => value);

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Messages',
        data: values,
        borderRadius: 4,
        maxBarThickness: 10,
        backgroundColor: (context) => {
          const { ctx, chartArea } = context.chart;
          if (!chartArea) return;
          const gradientBg = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradientBg.addColorStop(0, 'rgba(0, 140, 255, 1)');
          gradientBg.addColorStop(0.5, 'rgba(0, 120, 255, 1)');
          gradientBg.addColorStop(1, 'rgba(0, 80, 80, 1)');
          return gradientBg;
        },
      },
    ],
  };

  const options = {
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => `${context.raw} messages`,
          title: (context) => {
            const index = context[0].dataIndex;
            return filteredEntries[index][0];
          },
        },
      },
    },
    onClick: (event, elements) => {
      if (elements.length > 0) {
        const index = elements[0].index;
        const user = filteredEntries[index][0];
        setExcluded((prev) => [...prev, user]);
      }
    },
    maintainAspectRatio: false,
    scales: {
      x: {
        ticks: {
          callback: function (value) {
            const label = this.getLabelForValue(value);
            return label.length > 10 ? label.slice(0, 10) + "…" : label;
          },
        },
      },
      y: { beginAtZero: true },
    },
  };

  return (
    <div className="flex flex-col my-3 w-full justify-center items-center h-full relative">
      <div className="p-2 absolute top-3 left-0 right-0 flex flex-col items-center gap-0.5 pointer-events-none">
        <span className="text-xs text-gray-400">
          Total messages: <span className="text-red-500 font-semibold">{Number(data.totalMessages || 0).toLocaleString()}</span>
        </span>
        <h1 className="text-lg font-semibold text-dashboard-title">User Activity</h1>
      </div>
      {excluded.length > 0 ? (
        <button onClick={() => setExcluded([])} className="mt-4 absolute right-0 top-0 px-4 py-2 me-4 text-white rounded-lg hover:text-gray-500">
          <FontAwesomeIcon icon={faRefresh} className='size-4'></FontAwesomeIcon>
        </button>
      ) : 
        <button className="mt-4 absolute right-0 top-0 px-4 py-2 me-4 text-white rounded-lg hover:text-gray-500">
          <TooltipComponent position='left' text="Click on a bar to see descriptive data.">
          <FontAwesomeIcon icon={faInfoCircle} className='size-4'></FontAwesomeIcon>
          </TooltipComponent>
        </button>}
      <div className="h-5/6 w-full">
        <Bar className="px-4" style={{ height: '200px', width: '100%' }} options={options} data={chartData} />
      </div>
    </div>
  );
}

export default UserBarChart;
