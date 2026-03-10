'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import { subDays, format } from 'date-fns';
import { metricsApi, metaApi, campaignsApi } from '@/lib/api';
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
import MainTimeseriesChart from '@/components/charts/MainTimeseriesChart';
import ObjectivePieChart from '@/components/charts/ObjectivePieChart';
import MetricsBarChart from '@/components/charts/MetricsBarChart';
import { Campaign, MetaAccount, MetricsSummary, ObjectiveMetrics, TimeseriesPoint } from '@/types';

function getDateRange(range: DateRangeValue): { from: string; to: string } {
  const to = new Date();
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const from = subDays(to, days);
  return {
    from: format(from, 'yyyy-MM-dd'),
    to: format(to, 'yyyy-MM-dd'),
  };
}

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState<DateRangeValue>('30d');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const { from, to } = getDateRange(dateRange);

  const { data: accountsData } = useSWR<MetaAccount[]>(
    'meta-accounts-dashboard',
    () => metaApi.list().then((r) => r.data.accounts)
  );
  const accounts = accountsData ?? [];

  const { data: campaignsData } = useSWR<Campaign[]>(
    ['campaigns-dashboard', selectedAccountId],
    () => campaignsApi.list({ metaAccountId: selectedAccountId || undefined, limit: 200 })
      .then((r) => r.data.data)
  );
  const campaigns = campaignsData ?? [];

  const metaAccountId = selectedAccountId || undefined;
  const campaignId = selectedCampaignId || undefined;

  // Balance — only fetched when a specific account is selected
  const { data: balanceData, isLoading: loadingBalance } = useSWR(
    selectedAccountId ? ['account-balance', selectedAccountId] : null,
    () => metaApi.getBalance(selectedAccountId).then((r) => r.data.balance),
    { refreshInterval: 5 * 60 * 1000 }
  );

  const {
    data: summary,
    isLoading: loadingSummary,
    mutate: mutateSummary,
  } = useSWR<MetricsSummary>(
    ['metrics-summary', from, to, metaAccountId, campaignId],
    () => metricsApi.getSummary(from, to, metaAccountId, campaignId).then((r) => r.data.summary),
    { refreshInterval: 5 * 60 * 1000 }
  );

  const {
    data: byObjective,
    isLoading: loadingObjective,
    mutate: mutateObjective,
  } = useSWR<ObjectiveMetrics[]>(
    ['metrics-objective', from, to, metaAccountId, campaignId],
    () => metricsApi.getByObjective(from, to, metaAccountId, campaignId).then((r) => r.data.byObjective),
    { refreshInterval: 5 * 60 * 1000 }
  );

  const {
    data: timeseries,
    isLoading: loadingTimeseries,
    mutate: mutateTimeseries,
  } = useSWR<TimeseriesPoint[]>(
    ['metrics-timeseries', from, to, campaignId, metaAccountId],
    () => metricsApi.getTimeseries(from, to, campaignId, metaAccountId).then((r) => r.data.timeseries),
    { refreshInterval: 5 * 60 * 1000 }
  );

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([mutateSummary(), mutateObjective(), mutateTimeseries()]);
    setRefreshing(false);
  }, [mutateSummary, mutateObjective, mutateTimeseries]);

  const handleAccountChange = (accountId: string) => {
    setSelectedAccountId(accountId);
    setSelectedCampaignId('');
  };

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const currency = selectedAccount?.currency || 'BRL';

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
        {/* Account + Campaign Selectors */}
        <div className="flex flex-wrap items-center gap-4">
          {accounts.length > 1 && (
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-600 shrink-0">Conta:</label>
              <select
                value={selectedAccountId}
                onChange={(e) => handleAccountChange(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[200px]"
              >
                <option value="">Todas as contas</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.businessName || a.adAccountId}
                  </option>
                ))}
              </select>
            </div>
          )}

          {campaigns.length > 0 && (
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-600 shrink-0">Campanha:</label>
              <select
                value={selectedCampaignId}
                onChange={(e) => setSelectedCampaignId(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[240px] max-w-[400px]"
              >
                <option value="">Todas as campanhas</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Balance card — shown only when a specific account is selected */}
        {selectedAccountId && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-50 shrink-0">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">Saldo disponível</p>
                {loadingBalance ? (
                  <div className="h-5 w-20 bg-gray-200 rounded animate-pulse mt-0.5" />
                ) : (
                  <p className="text-lg font-bold text-gray-900">
                    {balanceData ? formatCurrency(balanceData.balance, balanceData.currency) : '-'}
                  </p>
                )}
              </div>
            </div>

            {balanceData && balanceData.spendCap > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500">Limite de gasto</p>
                <p className="text-sm font-semibold text-gray-700">
                  {formatCurrency(balanceData.spendCap, balanceData.currency)}
                </p>
              </div>
            )}

            {balanceData && balanceData.amountSpent > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500">Total gasto (histórico)</p>
                <p className="text-sm font-semibold text-gray-700">
                  {formatCurrency(balanceData.amountSpent, balanceData.currency)}
                </p>
              </div>
            )}

            <a
              href={`https://business.facebook.com/billing/payment_activity`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Adicionar crédito (PIX)
            </a>
          </div>
        )}

        {/* KPI Cards — 4 por linha */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
          <KpiCard
            label="Total de Vendas"
            value={summary ? formatNumber(summary.totalConversions) : '-'}
            loading={loadingSummary}
            accentColor="orange"
            icon={
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            }
          />
          <KpiCard
            label="Receita de Vendas"
            value={summary ? formatCurrency(summary.totalConversionsValue) : '-'}
            loading={loadingSummary}
            accentColor="green"
            icon={
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            }
          />
        </div>

        {/* Main Timeseries Chart */}
        <Card title="Evolução das Métricas" subtitle="Investimento, leads e receita de vendas por dia">
          {loadingTimeseries ? (
            <div className="h-72 bg-gray-50 rounded-lg animate-pulse" />
          ) : (
            <MainTimeseriesChart data={timeseries ?? []} currency={currency} />
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
