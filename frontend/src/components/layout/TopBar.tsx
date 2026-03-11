'use client';

import { useState } from 'react';
import { logout, getUser } from '@/lib/auth';
import Button from '@/components/ui/Button';
import clsx from 'clsx';

export type DateRangeValue = '7d' | '30d' | 'custom';

interface DateRangeOption {
  label: string;
  value: DateRangeValue;
}

const DATE_RANGES: DateRangeOption[] = [
  { label: '7 dias', value: '7d' },
  { label: '30 dias', value: '30d' },
  { label: 'Personalizado', value: 'custom' },
];

interface TopBarProps {
  title: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  dateRange?: DateRangeValue;
  /** Called when preset changes. For 'custom', also receives the selected from/to dates. */
  onDateRangeChange?: (range: DateRangeValue, customFrom?: string, customTo?: string) => void;
  showDateRange?: boolean;
}

export default function TopBar({
  title,
  onRefresh,
  refreshing = false,
  dateRange = '30d',
  onDateRangeChange,
  showDateRange = true,
}: TopBarProps) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [localFrom, setLocalFrom] = useState('');
  const [localTo, setLocalTo] = useState('');
  const user = getUser();

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      setLoggingOut(false);
    }
  }

  function handlePresetClick(range: DateRangeValue) {
    if (range !== 'custom') {
      onDateRangeChange?.(range);
    } else {
      // Switch to custom mode; wait for user to pick dates and click Aplicar
      onDateRangeChange?.('custom');
    }
  }

  function handleApplyCustom() {
    if (localFrom && localTo && localFrom <= localTo) {
      onDateRangeChange?.('custom', localFrom, localTo);
    }
  }

  const canApply = Boolean(localFrom && localTo && localFrom <= localTo);

  return (
    <header className="flex items-center gap-3 px-6 py-4 bg-white border-b border-gray-100 shrink-0 flex-wrap">
      {/* Title */}
      <h1 className="text-lg font-semibold text-gray-800 mr-auto">{title}</h1>

      {/* Date Range */}
      {showDateRange && onDateRangeChange && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {DATE_RANGES.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handlePresetClick(opt.value)}
                className={clsx(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap',
                  dateRange === opt.value
                    ? 'bg-white text-gray-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {dateRange === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={localFrom}
                onChange={(e) => setLocalFrom(e.target.value)}
                className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <span className="text-gray-400 text-xs">até</span>
              <input
                type="date"
                value={localTo}
                min={localFrom || undefined}
                onChange={(e) => setLocalTo(e.target.value)}
                className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={handleApplyCustom}
                disabled={!canApply}
              >
                Aplicar
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Refresh Button */}
      {onRefresh && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          loading={refreshing}
          icon={
            <svg
              className={clsx('w-4 h-4', refreshing && 'animate-spin')}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          }
        >
          Atualizar
        </Button>
      )}

      {/* User info + Logout */}
      <div className="flex items-center gap-3 pl-4 border-l border-gray-100">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 shrink-0">
          <span className="text-blue-700 font-semibold text-xs">
            {user?.name?.slice(0, 1)?.toUpperCase() || 'U'}
          </span>
        </div>
        <div className="hidden sm:block">
          <p className="text-sm font-medium text-gray-800 leading-tight">
            {user?.name || 'Usuário'}
          </p>
          <p className="text-xs text-gray-500 leading-tight">
            {user?.email || ''}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          loading={loggingOut}
          className="text-gray-500 hover:text-red-600 ml-1"
          icon={
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
          }
        >
          <span className="hidden sm:inline">Sair</span>
        </Button>
      </div>
    </header>
  );
}
