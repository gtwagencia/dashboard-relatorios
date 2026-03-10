'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import { subDays, format } from 'date-fns';
import { metricsApi } from '@/lib/api';
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  getObjectiveLabel,
  getObjectiveColor,
} from '@/lib/formatters';
import TopBar, { DateRangeValue } from '@/components/layout/TopBar';
import KpiCard from '@/components/dashboard/KpiCard';
import Card from '@/components/ui/Card';
import SpendLineChart from '@/components/charts/SpendLineChart';
import ObjectivePieChart from '@/components/charts/ObjectivePieChart';
import MetricsBarChart from '@/components/charts/MetricsBarChart';
import { MetricsSummary, ObjectiveMetrics, TimeseriesPoint } from '@/types';

function getDateRange(range: DateRangeValue): { from: string; to: string } {
  const to = new Date();
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const from = subDays(to, days);
  return {
    from: format(from, 'yyyy-MM-dd'),
    to: format(to, 'yyyy-MM-dd'),
  };
}

function fetchSummary(from: string, to: string) {
  return metricsApi.getSummary(from, to).then((r) => r.data.summary);
}

function fetchByObjective(from: string, to: string) {
  return metricsApi.getByObjective(from, to).then((r) => r.data.byObjective);
}

function fetchTimeseries(from: string, to: string) {
  return metricsApi.getTimeseries(from, to).then((r) => r.data.timeseries);
}

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState<DateRangeValue>('30d');
  const { from, to } = getDateRange(dateRange);

  const {
    data: summary,
    isLoading: loadingSummary,
    mutate: mutateSummary,
  } = useSWR<MetricsSummary>(
    ['metrics-summary', from, to],
    () => fetchSummary(from, to),
    { refreshInterval: 5 * 60 * 1000 }
  );

  const {
    data: byObjective,
    isLoading: loadingObjective,
    mutate: mutateObjective,
  } = useSWR<ObjectiveMetrics[]>(
    ['metrics-objective', from, to],
    () => fetchByObjective(from, to),
    { refreshInterval: 5 * 60 * 1000 }
  );

  const {
    data: timeseries,
    isLoading: loadingTimeseries,
    mutate: mutateTimeseries,
  } = useSWR<TimeseriesPoint[]>(
    ['metrics-timeseries', from, to],
    () => fetchTimeseries(from, to),
    { refreshInterval: 5 * 60 * 1000 }
  );

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([mutateSummary(), mutateObjective(), mutateTimeseries()]);
    setRefreshing(false);
  }, [mutateSummary, mutateObjective, mutateTimeseries]);

  const spendData =
    timeseries?.map((t) => ({ date: t.date, spend: t.spend })) ?? [];

  const pieData = (byObjective ?? []).map((o) => ({
    objective: o.objectiveType || o.objective,
    spend: o.spend,
  }));

  const barData = (byObjective ?? []).map((o) => ({
    name: getObjectiveLabel(o.objectiveType || o.objective),
    value: o.leads || o.conversions || 0,
    campaignId: o.objective,
  }));

  const loading = loadingSummary || loadingObjective || loadingTimeseries;

  return (
    <div className="flex flex-col min-h-full">
      <TopBar
        title="Dashboard"
        onRefresh={handleRefresh}
        refreshing={refreshing}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        showDateRange
      />

      <div className="flex-1 p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiCard
            label="Total Investido"
            value={summary ? formatCurrency(summary.totalSpend) : '-'}
            loading={loadingSummary}
            accentColor="blue"
            icon={
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <KpiCard
            label="Total de Leads"
            value={summary ? formatNumber(summary.totalLeads) : '-'}
            loading={loadingSummary}
            accentColor="green"
            icon={
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            }
          />
          <KpiCard
            label="Custo por Lead"
            value={
              summary && summary.totalLeads > 0
                ? formatCurrency(summary.totalSpend / summary.totalLeads)
                : '-'
            }
            loading={loadingSummary}
            accentColor="purple"
            icon={
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            }
          />
          <KpiCard
            label="Alcance Total"
            value={summary ? formatNumber(summary.totalReach) : '-'}
            loading={loadingSummary}
            accentColor="orange"
            icon={
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            }
          />
          <KpiCard
            label="CTR Médio"
            value={summary ? formatPercent(summary.avgCtr) : '-'}
            loading={loadingSummary}
            accentColor="cyan"
            icon={
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            }
          />
          <KpiCard
            label="CPM Médio"
            value={summary ? formatCurrency(summary.avgCpm) : '-'}
            loading={loadingSummary}
            accentColor="red"
            icon={
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
          />
        </div>

        {/* Spend Line Chart */}
        <Card title="Investimento ao Longo do Tempo">
          {loadingTimeseries ? (
            <div className="h-60 bg-gray-50 rounded-lg animate-pulse" />
          ) : (
            <SpendLineChart data={spendData} />
          )}
        </Card>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="Distribuição por Objetivo">
            {loadingObjective ? (
              <div className="h-60 bg-gray-50 rounded-lg animate-pulse" />
            ) : (
              <ObjectivePieChart data={pieData} />
            )}
          </Card>

          <Card title="Leads por Objetivo">
            {loadingObjective ? (
              <div className="h-60 bg-gray-50 rounded-lg animate-pulse" />
            ) : (
              <MetricsBarChart data={barData} metric="leads" />
            )}
          </Card>
        </div>

        {/* Objective Breakdown Table */}
        <Card title="Breakdown por Objetivo" noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="table-header text-left pl-5">Objetivo</th>
                  <th className="table-header text-right">Campanhas</th>
                  <th className="table-header text-right">Investido</th>
                  <th className="table-header text-right">Impressões</th>
                  <th className="table-header text-right">Cliques</th>
                  <th className="table-header text-right">Leads</th>
                  <th className="table-header text-right pr-5">CTR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loadingObjective ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="table-cell">
                          <div className="h-3 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : byObjective && byObjective.length > 0 ? (
                  byObjective.map((obj, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell pl-5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getObjectiveColor(
                            obj.objectiveType || obj.objective
                          )}`}
                        >
                          {getObjectiveLabel(obj.objectiveType || obj.objective)}
                        </span>
                      </td>
                      <td className="table-cell text-right">{obj.campaigns}</td>
                      <td className="table-cell text-right font-medium">
                        {formatCurrency(obj.spend)}
                      </td>
                      <td className="table-cell text-right">
                        {formatNumber(obj.impressions)}
                      </td>
                      <td className="table-cell text-right">
                        {formatNumber(obj.clicks)}
                      </td>
                      <td className="table-cell text-right">
                        {formatNumber(obj.leads)}
                      </td>
                      <td className="table-cell text-right pr-5">
                        {formatPercent(obj.ctr)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-10 text-center text-gray-400 text-sm"
                    >
                      Nenhum dado disponível para o período selecionado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
