'use client';

import { useState, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { subDays, format } from 'date-fns';
import { campaignsApi, reportsApi, metaApi } from '@/lib/api';
import {
  formatCurrency,
  formatDate,
  getObjectiveLabel,
  getObjectiveColor,
  getStatusLabel,
  getStatusColor,
} from '@/lib/formatters';
import TopBar, { DateRangeValue } from '@/components/layout/TopBar';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import { Campaign, MetaAccount, PaginatedResponse } from '@/types';
import toast from 'react-hot-toast';

const OBJECTIVES = [
  { value: '', label: 'Todos os objetivos' },
  { value: 'leads', label: 'Leads' },
  { value: 'sales', label: 'Vendas' },
  { value: 'engagement', label: 'Engajamento' },
  { value: 'awareness', label: 'Alcance' },
  { value: 'traffic', label: 'Tráfego' },
];

const STATUSES = [
  { value: '', label: 'Todos os status' },
  { value: 'ACTIVE', label: 'Ativo' },
  { value: 'PAUSED', label: 'Pausado' },
  { value: 'ARCHIVED', label: 'Arquivado' },
];

export default function CampaignsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [objective, setObjective] = useState('');
  const [status, setStatus] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [page, setPage] = useState(1);
  const [dateRange, setDateRange] = useState<DateRangeValue>('30d');
  const [exporting, setExporting] = useState(false);

  // Compute dateFrom/dateTo from the selected range
  const { dateFrom, dateTo } = useMemo(() => {
    const to = new Date();
    const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
    const from = subDays(to, days);
    return {
      dateFrom: format(from, 'yyyy-MM-dd'),
      dateTo: format(to, 'yyyy-MM-dd'),
    };
  }, [dateRange]);

  const { data: accountsData } = useSWR<MetaAccount[]>(
    'meta-accounts-campaigns',
    () => metaApi.list().then((r) => r.data.accounts)
  );
  const accounts = accountsData ?? [];

  const { data, isLoading, mutate } = useSWR<PaginatedResponse<Campaign>>(
    ['campaigns', objective, status, search, page, selectedAccountId, dateFrom, dateTo],
    () =>
      campaignsApi
        .list({
          objective: objective || undefined,
          status: status || undefined,
          search: search || undefined,
          page,
          limit: 15,
          metaAccountId: selectedAccountId || undefined,
          dateFrom,
          dateTo,
        })
        .then((r) => r.data),
    { keepPreviousData: true }
  );

  const campaigns = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;

  const handleRefresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  async function handleExport() {
    setExporting(true);
    try {
      await reportsApi.trigger({
        type: 'custom',
        periodStart: dateFrom,
        periodEnd: dateTo,
      });
      toast.success('Relatório gerado com sucesso! Verifique a aba Relatórios.');
    } catch {
      toast.error('Erro ao gerar relatório.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col min-h-full">
      <TopBar
        title="Campanhas"
        onRefresh={handleRefresh}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        showDateRange
      />

      <div className="flex-1 p-6 space-y-5">
        {/* Filters */}
        <Card>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex-1 min-w-48">
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Buscar por nome..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {accounts.length > 1 && (
              <select
                value={selectedAccountId}
                onChange={(e) => { setSelectedAccountId(e.target.value); setPage(1); }}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700"
              >
                <option value="">Todas as contas</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.businessName || a.adAccountId}
                    {a.clientName ? ` (${a.clientName})` : ''}
                  </option>
                ))}
              </select>
            )}

            <select
              value={objective}
              onChange={(e) => { setObjective(e.target.value); setPage(1); }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700"
            >
              {OBJECTIVES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            <div className="ml-auto">
              <Button
                variant="secondary"
                size="sm"
                loading={exporting}
                onClick={handleExport}
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                }
              >
                Exportar
              </Button>
            </div>
          </div>
        </Card>

        {/* Table */}
        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="table-header pl-5">Nome</th>
                  <th className="table-header">Objetivo</th>
                  <th className="table-header">Status</th>
                  <th className="table-header text-right">Investimento</th>
                  <th className="table-header text-right">Leads</th>
                  <th className="table-header text-right">Cliques</th>
                  <th className="table-header text-right pr-5">Início</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="table-cell">
                          <div className="h-3 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-400">
                      Nenhuma campanha encontrada
                    </td>
                  </tr>
                ) : (
                  campaigns.map((campaign) => (
                    <tr
                      key={campaign.id}
                      onClick={() => router.push(`/campaigns/${campaign.id}`)}
                      className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                    >
                      <td className="table-cell pl-5 font-medium text-gray-800 max-w-[220px]">
                        <span className="block truncate">{campaign.name}</span>
                        <span className="text-xs text-gray-400">{campaign.campaignId}</span>
                      </td>
                      <td className="table-cell">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getObjectiveColor(
                            campaign.objective
                          )}`}
                        >
                          {getObjectiveLabel(campaign.objective)}
                        </span>
                      </td>
                      <td className="table-cell">
                        <Badge
                          variant={getStatusColor(campaign.status) as 'success' | 'warning' | 'danger' | 'info' | 'default'}
                        >
                          {getStatusLabel(campaign.status)}
                        </Badge>
                      </td>
                      <td className="table-cell text-right font-medium text-gray-800">
                        {(campaign as any).totalSpend != null
                          ? formatCurrency((campaign as any).totalSpend)
                          : '-'}
                      </td>
                      <td className="table-cell text-right">
                        {(campaign as any).totalLeads ?? '-'}
                      </td>
                      <td className="table-cell text-right">
                        {(campaign as any).totalClicks != null
                          ? Number((campaign as any).totalClicks).toLocaleString('pt-BR')
                          : '-'}
                      </td>
                      <td className="table-cell text-right pr-5 text-gray-500">
                        {campaign.startTime ? formatDate(campaign.startTime) : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                Página {page} de {totalPages} &mdash; {data?.total ?? 0} campanhas
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Anterior
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
