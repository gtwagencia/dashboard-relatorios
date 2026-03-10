'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import { formatNumber } from '@/lib/formatters';

interface MetricsBarChartData {
  name: string;
  value: number;
  campaignId?: string;
}

interface MetricsBarChartProps {
  data: MetricsBarChartData[];
  metric: 'leads' | 'conversions' | 'clicks';
}

const metricConfig = {
  leads: { label: 'Leads', color: '#2563eb' },
  conversions: { label: 'Conversões', color: '#7c3aed' },
  clicks: { label: 'Cliques', color: '#059669' },
};

function CustomTooltip({
  active,
  payload,
  label,
  metric,
}: TooltipProps<ValueType, NameType> & { metric: string }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl text-xs max-w-[200px]">
      <p className="text-gray-400 mb-1 truncate">{label}</p>
      <p className="text-white font-medium">
        {metricConfig[metric as keyof typeof metricConfig]?.label}:{' '}
        <span className="text-blue-400">{formatNumber(Number(payload[0].value ?? 0))}</span>
      </p>
    </div>
  );
}

export default function MetricsBarChart({ data, metric }: MetricsBarChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Sem dados para exibir
      </div>
    );
  }

  const config = metricConfig[metric];
  const truncatedData = data.slice(0, 10).map((d) => ({
    ...d,
    shortName: d.name.length > 20 ? d.name.slice(0, 18) + '…' : d.name,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart
        data={truncatedData}
        margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
        layout="vertical"
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => formatNumber(v)}
        />
        <YAxis
          type="category"
          dataKey="shortName"
          tick={{ fontSize: 10, fill: '#6b7280' }}
          axisLine={false}
          tickLine={false}
          width={100}
        />
        <Tooltip
          content={(props) => (
            <CustomTooltip {...props} label={props.label} metric={metric} />
          )}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20} name={config.label}>
          {truncatedData.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={config.color}
              opacity={0.85 - index * 0.04}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
