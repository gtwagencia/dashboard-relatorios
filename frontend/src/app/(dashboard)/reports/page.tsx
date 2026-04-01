'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import { format, subDays } from 'date-fns';
import { reportsApi, metaApi } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/formatters';
import TopBar from '@/components/layout/TopBar';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Report, PaginatedResponse } from '@/types';
import toast from 'react-hot-toast';

const REPORT_TYPES = [
  { value: 'daily', label: 'Diário' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
];

const OBJECTIVES = [
  { value: 'all', label: 'Todos os objetivos' },
  { value: 'leads', label: 'Leads' },
  { value: 'sales', label: 'Vendas' },
  { value: 'engagement', label: 'Engajamento' },
];

function getReportStatusVariant(status: string): 'success' | 'warning' | 'danger' | 'info' | 'default' {
  const variants: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
    sent: 'success',
    pending: 'warning',
    failed: 'danger',
    processing: 'info',
  };
  return variants[status?.toLowerCase()] || 'default';
}

function getReportStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    sent: 'Enviado',
    pending: 'Pendente',
    failed: 'Falhou',
    processing: 'Processando',
  };
  return labels[status?.toLowerCase()] || status;
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    daily: 'Diário',
    weekly: 'Semanal',
    monthly: 'Mensal',
    custom: 'Personalizado',
  };
  return labels[type?.toLowerCase()] || type;
}

function getObjectiveLabel(objective: string): string {
  const labels: Record<string, string> = {
    all: 'Todos',
    leads: 'Leads',
    sales: 'Vendas',
    engagement: 'Engajamento',
  };
  return labels[objective?.toLowerCase()] || objective;
}

interface GenerateModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

function GenerateModal({ onClose, onSuccess }: GenerateModalProps) {
  const [type, setType] = useState('weekly');
  const [metaAccountId, setMetaAccountId] = useState('');
  const [periodStart, setPeriodStart] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [periodEnd, setPeriodEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);

  const { data: accountsData } = useSWR('meta-accounts-report-modal', () =>
    metaApi.list().then((r) => r.data.accounts)
  );
  const accounts = accountsData || [];

  async function handleSubmit() {
    if (!metaAccountId) { toast.error('Selecione uma conta de anúncios.'); return; }
    setLoading(true);
    try {
      await reportsApi.trigger({ type, metaAccountId, periodStart, periodEnd });
      toast.success('Relatório gerado com sucesso!');
      onSuccess();
      onClose();
    } catch {
      toast.error('Erro ao gerar relatório. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-800">Gerar Relatório</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Conta de Anúncios</label>
            <select
              value={metaAccountId}
              onChange={(e) => setMetaAccountId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Selecione uma conta...</option>
              {accounts.map((a: any) => (
                <option key={a.id} value={a.id}>{a.businessName || a.adAccountId}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipo de Relatório</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {REPORT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Data Início</label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Data Fim</label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={loading}>
            Gerar Relatório
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);

  const { data, isLoading, mutate } = useSWR<PaginatedResponse<Report>>(
    ['reports', page],
    () => reportsApi.list(page).then((r) => r.data),
    { keepPreviousData: true }
  );

  const reports = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;

  const handleRefresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Relatórios" onRefresh={handleRefresh} showDateRange={false} />

      <div className="flex-1 p-6 space-y-5">
        {/* Header Action */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {data ? `${data.total} relatórios no total` : ''}
          </p>
          <Button
            variant="primary"
            onClick={() => setShowModal(true)}
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            }
          >
            Gerar Relatório
          </Button>
        </div>

        {/* Table */}
        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="table-header pl-5">Tipo</th>
                  <th className="table-header">Objetivo</th>
                  <th className="table-header">Período</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Destino</th>
                  <th className="table-header">Criado em</th>
                  <th className="table-header pr-5">Enviado em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="table-cell">
                          <div className="h-3 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : reports.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-400">
                      Nenhum relatório gerado ainda
                    </td>
                  </tr>
                ) : (
                  reports.map((report) => (
                    <tr key={report.id} className="hover:bg-gray-50/50">
                      <td className="table-cell pl-5 font-medium text-gray-800">
                        {getTypeLabel(report.type)}
                      </td>
                      <td className="table-cell text-gray-600">
                        {getObjectiveLabel(report.objective)}
                      </td>
                      <td className="table-cell text-gray-600">
                        {report.periodStart && report.periodEnd
                          ? `${formatDate(report.periodStart)} – ${formatDate(report.periodEnd)}`
                          : '-'}
                      </td>
                      <td className="table-cell">
                        <Badge variant={getReportStatusVariant(report.status)}>
                          {getReportStatusLabel(report.status)}
                        </Badge>
                        {report.errorMsg && (
                          <p className="text-xs text-red-500 mt-0.5 max-w-[140px] truncate" title={report.errorMsg}>
                            {report.errorMsg}
                          </p>
                        )}
                      </td>
                      <td className="table-cell text-gray-500 max-w-[160px]">
                        {report.webhookUrl ? (
                          <span className="text-xs truncate block" title={report.webhookUrl}>
                            {report.webhookUrl.replace(/^https?:\/\//, '')}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="table-cell text-gray-500">
                        {report.createdAt ? formatDateTime(report.createdAt) : '-'}
                      </td>
                      <td className="table-cell pr-5 text-gray-500">
                        {report.sentAt ? formatDateTime(report.sentAt) : '—'}
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
                Página {page} de {totalPages}
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

      {showModal && (
        <GenerateModal
          onClose={() => setShowModal(false)}
          onSuccess={() => mutate()}
        />
      )}
    </div>
  );
}
