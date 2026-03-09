import clsx from 'clsx';
import { ReactNode } from 'react';

interface KpiCardProps {
  label: string;
  value: string;
  icon: ReactNode;
  trend?: number;
  trendLabel?: string;
  accentColor?: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'cyan';
  loading?: boolean;
}

const colorMap = {
  blue: {
    bg: 'bg-blue-50',
    icon: 'text-blue-600',
    badge: 'bg-blue-50',
  },
  green: {
    bg: 'bg-green-50',
    icon: 'text-green-600',
    badge: 'bg-green-50',
  },
  purple: {
    bg: 'bg-purple-50',
    icon: 'text-purple-600',
    badge: 'bg-purple-50',
  },
  orange: {
    bg: 'bg-orange-50',
    icon: 'text-orange-600',
    badge: 'bg-orange-50',
  },
  red: {
    bg: 'bg-red-50',
    icon: 'text-red-600',
    badge: 'bg-red-50',
  },
  cyan: {
    bg: 'bg-cyan-50',
    icon: 'text-cyan-600',
    badge: 'bg-cyan-50',
  },
};

export default function KpiCard({
  label,
  value,
  icon,
  trend,
  trendLabel,
  accentColor = 'blue',
  loading = false,
}: KpiCardProps) {
  const colors = colorMap[accentColor];

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
        <div className="flex items-start gap-3">
          <div className={clsx('p-2.5 rounded-lg w-10 h-10', colors.bg)} />
          <div className="flex-1">
            <div className="h-3 bg-gray-200 rounded w-24 mb-2" />
            <div className="h-6 bg-gray-200 rounded w-28" />
          </div>
        </div>
        <div className="h-3 bg-gray-100 rounded w-20 mt-3" />
      </div>
    );
  }

  const isPositive = trend !== undefined && trend >= 0;
  const isNegative = trend !== undefined && trend < 0;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div
          className={clsx(
            'p-2.5 rounded-lg shrink-0',
            colors.bg
          )}
        >
          <span className={clsx('block w-5 h-5', colors.icon)}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-500 truncate">{label}</p>
          <p className="text-xl font-bold text-gray-900 mt-0.5 truncate">{value}</p>
        </div>
      </div>

      {trend !== undefined && (
        <div className="flex items-center gap-1.5 mt-3">
          {isPositive ? (
            <svg
              className="w-3.5 h-3.5 text-green-500 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"
              />
            </svg>
          ) : isNegative ? (
            <svg
              className="w-3.5 h-3.5 text-red-500 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 6L9 12.75l4.306-4.307a11.95 11.95 0 015.814 5.519l2.74 1.22m0 0l-5.94 2.28m5.94-2.28l-2.28-5.941"
              />
            </svg>
          ) : null}
          <span
            className={clsx(
              'text-xs font-medium',
              isPositive && 'text-green-600',
              isNegative && 'text-red-600',
              !isPositive && !isNegative && 'text-gray-500'
            )}
          >
            {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
          </span>
          {trendLabel && (
            <span className="text-xs text-gray-400">{trendLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
