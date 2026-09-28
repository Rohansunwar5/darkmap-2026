import useDashboardStore from '../temp';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);


const options = {
  responsive: true,
  plugins: {
    legend: {
      position: 'top',
    },
    tooltip: {
      callbacks: {
        label: (context) => {
          const value = context.raw;
          const total = context.chart._metasets[0].total;
          const percentage = ((value / total) * 100).toFixed(1);
          return `${context.label}: ${value} (${percentage}%)`;
        },
      },
    },
  },
}

function UserPieChart() {
  const { data } = useDashboardStore();
  const freq = data.frequencyUser || {};

  // Convert object to sorted array
  const entries = Object.entries(freq).sort((a, b) => b[1] - a[1]);

  // Calculate total messages
  const total = entries.reduce((sum, [, value]) => sum + value, 0);

  // Threshold: show users >=5% individually, others grouped
  const threshold = 0.05;
  const labels = [];
  const values = [];
  let others = 0;

  const baseColor = { h: 220, s: 70, l: 50 }; // base blue

  entries.forEach(([user, count]) => {
    if (count / total >= threshold) {
      labels.push(user === 'null' ? 'Unknown' : user);
      values.push(count);
    } else {
      others += count;
    }
  });

  if (others > 0) {
    labels.push('Others');
    values.push(others);
  }

  const chartData = {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: labels.map((_, i) => {
          const lightness = Math.max(20, baseColor.l - i * 10); // clamp min lightness
          return `hsl(${baseColor.h}, ${baseColor.s}%, ${lightness}%)`;
        }),
        borderColor: 'transparent',
        borderWidth: 1,
      },
    ],
  };

  return (
    <div className="flex flex-col p-4">
      <h1 className="text-lg font-semibold text-dashboard-title">Messages by User</h1>
      <Doughnut data={chartData} options={options}></Doughnut>
    </div>
  );
}

export default UserPieChart;
