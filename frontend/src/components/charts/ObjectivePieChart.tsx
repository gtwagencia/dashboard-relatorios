'use client';

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts';
import { formatCurrency } from '@/lib/formatters';
import { getObjectiveLabel } from '@/lib/formatters';

interface ObjectiveDataPoint {
  objective: string;
  spend: number;
}

interface ObjectivePieChartProps {
  data: ObjectiveDataPoint[];
}

const COLORS = [
  '#2563eb',
  '#7c3aed',
  '#059669',
  '#d97706',
  '#dc2626',
  '#0891b2',
  '#c026d3',
];

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; percent: number }>;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl text-xs">
      <p className="text-gray-300 font-medium mb-1">
        {getObjectiveLabel(item.name)}
      </p>
      <p className="text-white">{formatCurrency(item.value)}</p>
      <p className="text-gray-400 mt-0.5">
        {(item.percent * 100).toFixed(1)}% do total
      </p>
    </div>
  );
}

function CustomLegend({
  payload,
}: {
  payload?: Array<{ value: string; color: string }>;
}) {
  if (!payload) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-2">
      {payload.map((entry, i) => (
        <li key={i} className="flex items-center gap-1.5 text-xs text-gray-600">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          {getObjectiveLabel(entry.value)}
        </li>
      ))}
    </ul>
  );
}

export default function ObjectivePieChart({ data }: ObjectivePieChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Sem dados para exibir
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          dataKey="spend"
          nameKey="objective"
          cx="50%"
          cy="45%"
          outerRadius={80}
          innerRadius={48}
          paddingAngle={3}
        >
          {data.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={COLORS[index % COLORS.length]}
              strokeWidth={0}
            />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend content={<CustomLegend />} />
      </PieChart>
    </ResponsiveContainer>
  );
}
