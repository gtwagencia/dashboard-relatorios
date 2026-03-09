'use client';

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { formatCurrency, formatDate, formatPercent } from '@/lib/formatters';

interface CtrCpcDataPoint {
  date: string;
  ctr: number;
  cpc: number;
}

interface CtrCpcChartProps {
  data: CtrCpcDataPoint[];
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl text-xs space-y-1">
      <p className="text-gray-400 mb-1.5">{label ? formatDate(label) : ''}</p>
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-gray-300">{entry.name === 'ctr' ? 'CTR' : 'CPC'}:</span>
          <span className="text-white font-medium">
            {entry.name === 'ctr'
              ? formatPercent(entry.value)
              : formatCurrency(entry.value)}
          </span>
        </p>
      ))}
    </div>
  );
}

export default function CtrCpcChart({ data }: CtrCpcChartProps) {
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
      <ComposedChart data={formatted} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="dateLabel"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          yAxisId="cpc"
          orientation="left"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) =>
            new Intl.NumberFormat('pt-BR', {
              notation: 'compact',
              style: 'currency',
              currency: 'BRL',
              maximumFractionDigits: 2,
            }).format(v)
          }
          width={68}
        />
        <YAxis
          yAxisId="ctr"
          orientation="right"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v.toFixed(2)}%`}
          width={48}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(value) => (value === 'ctr' ? 'CTR (%)' : 'CPC (R$)')}
          wrapperStyle={{ fontSize: 12, color: '#6b7280' }}
        />
        <Bar
          yAxisId="cpc"
          dataKey="cpc"
          fill="#bfdbfe"
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
          name="cpc"
        />
        <Line
          yAxisId="ctr"
          type="monotone"
          dataKey="ctr"
          stroke="#7c3aed"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 5, fill: '#7c3aed', strokeWidth: 0 }}
          name="ctr"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
