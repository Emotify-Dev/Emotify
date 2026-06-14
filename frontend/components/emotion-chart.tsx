'use client';

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts';

interface Emotion {
  tag: string;
  confidence: number;
}

interface EmotionChartProps {
  data: Emotion[];
}

export function EmotionChart({ data }: EmotionChartProps) {
  const chartData = data.slice(0, 5).map((item) => ({
    name: item.tag,
    value: Math.round(item.confidence * 100),
  }));

  const colors = ['#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#3b82f6'];

  const getDynamicStyles = (count: number) => {
    if (count <= 2) {
      return { barSize: 50, fontSize: 16 };
    }
    if (count <= 4) {
      return { barSize: 35, fontSize: 14 };
    }
    return { barSize: 20, fontSize: 12 };
  };

  const { barSize, fontSize } = getDynamicStyles(chartData.length);

  return (
    <div className="mt-4 h-[250px] w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 30, left: 40, bottom: 0 }}
        >
          <XAxis type="number" hide domain={[0, 100]} />
          <YAxis
            dataKey="name"
            type="category"
            width={100}
            tick={{ fill: '#64748b', fontSize: fontSize, fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'transparent' }}
            contentStyle={{
              borderRadius: '12px',
              border: 'none',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={barSize}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
