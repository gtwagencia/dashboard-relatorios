'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { formatCurrency, formatDate } from '@/lib/formatters';

interface SpendDataPoint {
  date: string;
  spend: number;
}

interface SpendLineChartProps {
  data: SpendDataPoint[];
  currency?: string;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl text-xs">
      <p className="text-gray-400 mb-1.5">{label ? formatDate(label) : ''}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-white font-medium">
          {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
}

export default function SpendLineChart({
  data,
  currency = 'BRL',
}: SpendLineChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Sem dados para exibir
      </div>
    );
  }

  const formatted = data.map((d) => ({
    ...d,
    dateLabel: formatDate(d.date),
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={formatted} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="dateLabel"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) =>
            new Intl.NumberFormat('pt-BR', {
              notation: 'compact',
              style: 'currency',
              currency,
              maximumFractionDigits: 1,
            }).format(v)
          }
          width={72}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={() => 'Gasto Diário'}
          wrapperStyle={{ fontSize: 12, color: '#6b7280' }}
        />
        <Line
          type="monotone"
          dataKey="spend"
          stroke="#2563eb"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 5, fill: '#2563eb', strokeWidth: 0 }}
          name="spend"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
