'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { subDays, format } from 'date-fns';
import { campaignsApi, aiApi } from '@/lib/api';
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatDate,
  getObjectiveLabel,
  getObjectiveColor,
  getStatusLabel,
  getStatusColor,
} from '@/lib/formatters';
import TopBar, { DateRangeValue } from '@/components/layout/TopBar';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import SpendLineChart from '@/components/charts/SpendLineChart';
import CtrCpcChart from '@/components/charts/CtrCpcChart';
import { Campaign, CampaignMetrics, AiInsight } from '@/types';
import toast from 'react-hot-toast';

function getDateRange(range: DateRangeValue): { from: string; to: string } {
  const to = new Date();
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const from = subDays(to, days);
  return { from: format(from, 'yyyy-MM-dd'), to: format(to, 'yyyy-MM-dd') };
}

interface MetricItemProps {
  label: string;
  value: string;
}

function MetricItem({ label, value }: MetricItemProps) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-800">{value}</p>
    </div>
  );
}

function getPriorityLabel(priority: string): string {
  const labels: Record<string, string> = {
    high: 'Alta',
    medium: 'Média',
    low: 'Baixa',
  };
  return labels[priority?.toLowerCase()] || priority;
}

function getPriorityVariant(priority: string): 'danger' | 'warning' | 'info' | 'default' {
  const variants: Record<string, 'danger' | 'warning' | 'info' | 'default'> = {
    high: 'danger',
    medium: 'warning',
    low: 'info',
  };
  return variants[priority?.toLowerCase()] || 'default';
}

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [dateRange, setDateRange] = useState<DateRangeValue>('30d');
  const [generatingInsight, setGeneratingInsight] = useState(false);
  const { from, to } = getDateRange(dateRange);

  const { data: campaign, isLoading: loadingCampaign } = useSWR<Campaign>(
    id ? ['campaign', id] : null,
    () => campaignsApi.get(id).then((r) => r.data.campaign)
  );

  const { data: metrics, isLoading: loadingMetrics } = useSWR<CampaignMetrics[]>(
    id ? ['campaign-metrics', id, from, to] : null,
    () => campaignsApi.getMetrics(id, from, to).then((r) => r.data.metrics)
  );

  const {
    data: insights,
    isLoading: loadingInsights,
    mutate: mutateInsights,
  } = useSWR<AiInsight[]>(
    id ? ['ai-insights', id] : null,
    () => aiApi.getInsights(id, 5).then((r) => r.data.insights)
  );

  const aggregated = metrics?.reduce(
    (acc, m) => ({
      spend: acc.spend + m.spend,
      impressions: acc.impressions + m.impressions,
      clicks: acc.clicks + m.clicks,
      leads: acc.leads + m.leads,
      conversions: acc.conversions + m.conversions,
      reach: acc.reach + m.reach,
    }),
    { spend: 0, impressions: 0, clicks: 0, leads: 0, conversions: 0, reach: 0 }
  );

  const avgCtr =
    metrics && metrics.length > 0
      ? metrics.reduce((a, m) => a + m.ctr, 0) / metrics.length
      : 0;
  const avgCpc =
    metrics && metrics.length > 0
      ? metrics.reduce((a, m) => a + m.cpc, 0) / metrics.length
      : 0;
  const avgCpm =
    metrics && metrics.length > 0
      ? metrics.reduce((a, m) => a + m.cpm, 0) / metrics.length
      : 0;
  const avgFreq =
    metrics && metrics.length > 0
      ? metrics.reduce((a, m) => a + m.frequency, 0) / metrics.length
      : 0;

  const spendData =
    metrics?.map((m) => ({ date: m.dateStart, spend: m.spend })) ?? [];
  const ctrCpcData =
    metrics?.map((m) => ({ date: m.dateStart, ctr: m.ctr, cpc: m.cpc })) ?? [];

  async function handleGenerateInsight() {
    setGeneratingInsight(true);
    try {
      await aiApi.generate(id, 'campaign');
      await mutateInsights();
      toast.success('Novo insight gerado com sucesso!');
    } catch {
      toast.error('Erro ao gerar insight. Tente novamente.');
    } finally {
      setGeneratingInsight(false);
    }
  }

  return (
    <div className="flex flex-col min-h-full">
      <TopBar
        title={loadingCampaign ? 'Carregando...' : campaign?.name ?? 'Campanha'}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        showDateRange
      />

      <div className="flex-1 p-6 space-y-6">
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Voltar às campanhas
        </button>

        {/* Campaign Header */}
        <Card>
          {loadingCampaign ? (
            <div className="animate-pulse space-y-3">
              <div className="h-6 bg-gray-200 rounded w-64" />
              <div className="h-4 bg-gray-100 rounded w-40" />
            </div>
          ) : campaign ? (
            <div className="flex flex-wrap items-start gap-4 justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-lg font-bold text-gray-900">{campaign.name}</h2>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getObjectiveColor(
                      campaign.objective
                    )}`}
                  >
                    {getObjectiveLabel(campaign.objective)}
                  </span>
                  <Badge
                    variant={
                      getStatusColor(campaign.status) as
                        | 'success'
                        | 'warning'
                        | 'danger'
                        | 'info'
                        | 'default'
                    }
                  >
                    {getStatusLabel(campaign.status)}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500">ID: {campaign.campaignId}</p>
                <div className="flex gap-4 mt-3 text-sm text-gray-600">
                  {campaign.dailyBudget > 0 && (
                    <span>
                      <span className="text-gray-400">Orçamento diário: </span>
                      <strong>{formatCurrency(campaign.dailyBudget)}</strong>
                    </span>
                  )}
                  {campaign.lifetimeBudget > 0 && (
                    <span>
                      <span className="text-gray-400">Orçamento total: </span>
                      <strong>{formatCurrency(campaign.lifetimeBudget)}</strong>
                    </span>
                  )}
                  {campaign.startTime && (
                    <span>
                      <span className="text-gray-400">Início: </span>
                      {formatDate(campaign.startTime)}
                    </span>
                  )}
                  {campaign.endTime && (
                    <span>
                      <span className="text-gray-400">Fim: </span>
                      {formatDate(campaign.endTime)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </Card>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {loadingMetrics ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-4 animate-pulse">
                <div className="h-3 bg-gray-200 rounded w-20 mb-2" />
                <div className="h-6 bg-gray-200 rounded w-24" />
              </div>
            ))
          ) : (
            <>
              <MetricItem label="Gasto Total" value={aggregated ? formatCurrency(aggregated.spend) : '-'} />
              <MetricItem label="Impressões" value={aggregated ? formatNumber(aggregated.impressions) : '-'} />
              <MetricItem label="Cliques" value={aggregated ? formatNumber(aggregated.clicks) : '-'} />
              <MetricItem label="Leads" value={aggregated ? formatNumber(aggregated.leads) : '-'} />
              <MetricItem label="CTR Médio" value={formatPercent(avgCtr)} />
              <MetricItem label="CPC Médio" value={formatCurrency(avgCpc)} />
              <MetricItem label="CPM Médio" value={formatCurrency(avgCpm)} />
              <MetricItem label="Frequência Média" value={avgFreq.toFixed(2)} />
            </>
          )}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="Investimento Diário">
            {loadingMetrics ? (
              <div className="h-60 bg-gray-50 rounded animate-pulse" />
            ) : (
              <SpendLineChart data={spendData} />
            )}
          </Card>
          <Card title="CTR e CPC ao Longo do Tempo">
            {loadingMetrics ? (
              <div className="h-60 bg-gray-50 rounded animate-pulse" />
            ) : (
              <CtrCpcChart data={ctrCpcData} />
            )}
          </Card>
        </div>

        {/* AI Insights */}
        <Card
          title="Insights de IA"
          subtitle="Análise automática gerada por inteligência artificial"
          action={
            <Button
              variant="primary"
              size="sm"
              loading={generatingInsight}
              onClick={handleGenerateInsight}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              }
            >
              Gerar Insight
            </Button>
          }
        >
          {loadingInsights ? (
            <div className="space-y-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="border border-gray-100 rounded-lg p-4 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-32 mb-3" />
                  <div className="space-y-2">
                    <div className="h-3 bg-gray-100 rounded" />
                    <div className="h-3 bg-gray-100 rounded w-4/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : insights && insights.length > 0 ? (
            <div className="space-y-4">
              {insights.map((insight) => (
                <div
                  key={insight.id}
                  className="border border-gray-100 rounded-lg p-4 hover:border-blue-100 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Badge variant={getPriorityVariant(insight.priority)}>
                      Prioridade {getPriorityLabel(insight.priority)}
                    </Badge>
                    <div className="flex items-center gap-2 ml-auto">
                      <span className="text-xs text-gray-500">Score:</span>
                      <div className="flex items-center gap-1">
                        <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${Math.min(100, insight.score)}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-gray-700">
                          {insight.score.toFixed(0)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ul className="space-y-1.5">
                    {insight.insights.map((text, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-blue-500 mt-0.5 shrink-0">•</span>
                        {text}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-gray-400 mt-3">
                    Gerado em {formatDate(insight.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-gray-400 text-sm mb-3">
                Nenhum insight gerado para esta campanha
              </p>
              <Button
                variant="secondary"
                size="sm"
                loading={generatingInsight}
                onClick={handleGenerateInsight}
              >
                Gerar primeiro insight
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
