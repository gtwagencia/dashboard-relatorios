'use client';

import { useState } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { TimeseriesPoint } from '@/types';
import clsx from 'clsx';

interface MainTimeseriesChartProps {
  data: TimeseriesPoint[];
  currency?: string;
}

type SeriesKey = 'spend' | 'leads' | 'conversions' | 'conversionsValue';

const SERIES_CONFIG: Record<SeriesKey, { label: string; color: string; axis: 'left' | 'right'; type: 'line' | 'bar' }> = {
  spend:            { label: 'Investimento',     color: '#2563eb', axis: 'left',  type: 'line' },
  leads:            { label: 'Leads',             color: '#8b5cf6', axis: 'right', type: 'bar'  },
  conversions:      { label: 'Conversões',        color: '#f59e0b', axis: 'right', type: 'bar'  },
  conversionsValue: { label: 'Receita de Vendas', color: '#10b981', axis: 'left',  type: 'line' },
};

function CustomTooltip({
  active,
  payload,
  label,
  currency = 'BRL',
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
  currency?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl text-xs min-w-[160px]">
      <p className="text-gray-400 mb-2 font-medium">{label ? formatDate(label) : ''}</p>
      {payload.map((entry, i) => {
        const isMonetary = entry.name === 'spend' || entry.name === 'conversionsValue';
        const cfg = SERIES_CONFIG[entry.name as SeriesKey];
        return (
          <div key={i} className="flex items-center justify-between gap-3 mb-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: entry.color }} />
              <span className="text-gray-400">{cfg?.label ?? entry.name}:</span>
            </div>
            <span className="text-white font-semibold">
              {isMonetary
                ? formatCurrency(entry.value, currency)
                : Number(entry.value).toLocaleString('pt-BR')}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function MainTimeseriesChart({ data, currency = 'BRL' }: MainTimeseriesChartProps) {
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
    spend: true,
    leads: true,
    conversions: false,
    conversionsValue: false,
  });

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-56 text-gray-400 text-sm">
        Sem dados para exibir
      </div>
    );
  }

  // Auto-show conversionsValue if there's actual revenue data
  const hasSalesValue = data.some((d) => (d.conversionsValue ?? 0) > 0);
  const hasConversions = data.some((d) => (d.conversions ?? 0) > 0);

  const formatted = data.map((d) => ({
    ...d,
    dateLabel: formatDate(d.date),
  }));

  // Decide which series to show
  const show = { ...visible };
  // Don't show salesValue toggle if there's no data
  if (!hasSalesValue) show.conversionsValue = false;
  if (!hasConversions) show.conversions = false;

  const toggle = (key: SeriesKey) =>
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }));

  const compactCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', {
      notation: 'compact',
      style: 'currency',
      currency,
      maximumFractionDigits: 1,
    }).format(v);

  const compactNumber = (v: number) =>
    new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(v);

  return (
    <div>
      {/* Toggle buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(Object.keys(SERIES_CONFIG) as SeriesKey[]).map((key) => {
          const cfg = SERIES_CONFIG[key];
          // Hide sales value toggle if no data
          if (key === 'conversionsValue' && !hasSalesValue) return null;
          if (key === 'conversions' && !hasConversions) return null;
          const isActive = visible[key];
          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all',
                isActive
                  ? 'text-white border-transparent'
                  : 'bg-transparent text-gray-400 border-gray-200 hover:border-gray-300'
              )}
              style={isActive ? { backgroundColor: cfg.color, borderColor: cfg.color } : {}}
            >
              <span
                className={clsx('w-2 h-2 rounded-full', cfg.type === 'bar' ? 'rounded-sm' : 'rounded-full')}
                style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.8)' : cfg.color }}
              />
              {cfg.label}
            </button>
          );
        })}
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={formatted} margin={{ top: 4, right: show.leads || show.conversions ? 48 : 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis
            dataKey="dateLabel"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          {/* Left Y axis: monetary (spend, conversionsValue) */}
          <YAxis
            yAxisId="left"
            orientation="left"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={compactCurrency}
            width={72}
          />
          {/* Right Y axis: counts (leads, conversions) */}
          {(show.leads || show.conversions) && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={compactNumber}
              width={44}
            />
          )}
          <Tooltip content={<CustomTooltip currency={currency} />} />

          {/* Bars first (so lines appear on top) */}
          {show.leads && (
            <Bar
              yAxisId="right"
              dataKey="leads"
              fill={SERIES_CONFIG.leads.color}
              opacity={0.7}
              radius={[3, 3, 0, 0]}
              maxBarSize={18}
              name="leads"
            />
          )}
          {show.conversions && (
            <Bar
              yAxisId="right"
              dataKey="conversions"
              fill={SERIES_CONFIG.conversions.color}
              opacity={0.7}
              radius={[3, 3, 0, 0]}
              maxBarSize={18}
              name="conversions"
            />
          )}

          {/* Lines on top */}
          {show.spend && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="spend"
              stroke={SERIES_CONFIG.spend.color}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, fill: SERIES_CONFIG.spend.color, strokeWidth: 0 }}
              name="spend"
            />
          )}
          {show.conversionsValue && hasSalesValue && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="conversionsValue"
              stroke={SERIES_CONFIG.conversionsValue.color}
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              activeDot={{ r: 5, fill: SERIES_CONFIG.conversionsValue.color, strokeWidth: 0 }}
              name="conversionsValue"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
