'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import { aiApi, campaignsApi } from '@/lib/api';
import { formatDate } from '@/lib/formatters';
import TopBar from '@/components/layout/TopBar';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { AiInsight, Campaign, PaginatedResponse } from '@/types';
import toast from 'react-hot-toast';

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

interface InsightCardProps {
  insight: AiInsight;
}

function InsightCard({ insight }: InsightCardProps) {
  return (
    <div className="border border-gray-100 rounded-xl p-5 hover:border-blue-100 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-3 mb-4">
        <Badge variant={getPriorityVariant(insight.priority)}>
          Prioridade {getPriorityLabel(insight.priority)}
        </Badge>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-500">Score de relevância:</span>
          <div className="flex items-center gap-1.5">
            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all"
                style={{ width: `${Math.min(100, Math.max(0, insight.score))}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-gray-700">
              {insight.score.toFixed(0)}
            </span>
          </div>
        </div>
      </div>

      <ul className="space-y-2">
        {insight.insights.map((text, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700 leading-relaxed">
            <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
              {i + 1}
            </span>
            {text}
          </li>
        ))}
      </ul>

      <div className="mt-4 pt-3 border-t border-gray-50 flex items-center gap-2 text-xs text-gray-400">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Gerado em {formatDate(insight.createdAt)}
      </div>
    </div>
  );
}

export default function AiInsightsPage() {
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [generatingAccount, setGeneratingAccount] = useState(false);
  const [generatingCampaign, setGeneratingCampaign] = useState(false);

  // Load campaigns for dropdown
  const { data: campaignData } = useSWR<PaginatedResponse<Campaign>>(
    'campaigns-list',
    () => campaignsApi.list({ limit: 100 }).then((r) => r.data)
  );
  const campaigns = campaignData?.data ?? [];

  // Account-level insights
  const {
    data: accountInsights,
    isLoading: loadingAccount,
    mutate: mutateAccount,
  } = useSWR<AiInsight[]>(
    'ai-insights-account',
    () => aiApi.getInsights(undefined, 10).then((r) => r.data.insights)
  );

  // Campaign-level insights
  const {
    data: campaignInsights,
    isLoading: loadingCampaign,
    mutate: mutateCampaign,
  } = useSWR<AiInsight[]>(
    selectedCampaignId ? ['ai-insights-campaign', selectedCampaignId] : null,
    () => aiApi.getInsights(selectedCampaignId, 10).then((r) => r.data.insights)
  );

  const handleRefresh = useCallback(async () => {
    await Promise.all([mutateAccount(), mutateCampaign()]);
  }, [mutateAccount, mutateCampaign]);

  async function handleGenerateAccount() {
    setGeneratingAccount(true);
    try {
      await aiApi.generate(null, 'account');
      await mutateAccount();
      toast.success('Insight da conta gerado com sucesso!');
    } catch {
      toast.error('Erro ao gerar insight. Tente novamente.');
    } finally {
      setGeneratingAccount(false);
    }
  }

  async function handleGenerateCampaign() {
    if (!selectedCampaignId) {
      toast.error('Selecione uma campanha primeiro.');
      return;
    }
    setGeneratingCampaign(true);
    try {
      await aiApi.generate(selectedCampaignId, 'campaign');
      await mutateCampaign();
      toast.success('Insight da campanha gerado com sucesso!');
    } catch {
      toast.error('Erro ao gerar insight. Tente novamente.');
    } finally {
      setGeneratingCampaign(false);
    }
  }

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Insights de IA" onRefresh={handleRefresh} showDateRange={false} />

      <div className="flex-1 p-6 space-y-6">
        {/* Info Banner */}
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl">
          <svg
            className="w-5 h-5 text-blue-500 shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          <div>
            <p className="text-sm font-medium text-blue-800">Análise com Inteligência Artificial</p>
            <p className="text-xs text-blue-600 mt-0.5">
              Os insights são gerados automaticamente analisando o desempenho das suas campanhas e identificando oportunidades de melhoria.
            </p>
          </div>
        </div>

        {/* Account-Level Insights */}
        <Card
          title="Insights da Conta"
          subtitle="Análise geral de todas as campanhas ativas"
          action={
            <Button
              variant="primary"
              size="sm"
              loading={generatingAccount}
              onClick={handleGenerateAccount}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              }
            >
              Gerar Novo
            </Button>
          }
        >
          {loadingAccount ? (
            <div className="space-y-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="border border-gray-100 rounded-xl p-5 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-24 mb-4" />
                  <div className="space-y-2">
                    <div className="h-3 bg-gray-100 rounded" />
                    <div className="h-3 bg-gray-100 rounded w-5/6" />
                    <div className="h-3 bg-gray-100 rounded w-4/6" />
                  </div>
                </div>
              ))}
            </div>
          ) : accountInsights && accountInsights.length > 0 ? (
            <div className="space-y-4">
              {accountInsights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} />
              ))}
            </div>
          ) : (
            <div className="py-10 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <p className="text-sm text-gray-400 mb-3">
                Nenhum insight gerado para a conta ainda
              </p>
              <Button
                variant="secondary"
                size="sm"
                loading={generatingAccount}
                onClick={handleGenerateAccount}
              >
                Gerar primeiro insight
              </Button>
            </div>
          )}
        </Card>

        {/* Campaign-Level Insights */}
        <Card
          title="Insights por Campanha"
          subtitle="Selecione uma campanha para ver ou gerar insights específicos"
        >
          {/* Campaign Selector */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1">
              <select
                value={selectedCampaignId}
                onChange={(e) => setSelectedCampaignId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700"
              >
                <option value="">Selecione uma campanha...</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="primary"
              size="sm"
              loading={generatingCampaign}
              onClick={handleGenerateCampaign}
              disabled={!selectedCampaignId}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              }
            >
              Gerar Insight
            </Button>
          </div>

          {/* Campaign Insights Display */}
          {!selectedCampaignId ? (
            <div className="py-8 text-center text-gray-400 text-sm border-2 border-dashed border-gray-100 rounded-xl">
              Selecione uma campanha acima para visualizar os insights
            </div>
          ) : loadingCampaign ? (
            <div className="space-y-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="border border-gray-100 rounded-xl p-5 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-24 mb-4" />
                  <div className="space-y-2">
                    <div className="h-3 bg-gray-100 rounded" />
                    <div className="h-3 bg-gray-100 rounded w-5/6" />
                  </div>
                </div>
              ))}
            </div>
          ) : campaignInsights && campaignInsights.length > 0 ? (
            <div className="space-y-4">
              {campaignInsights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} />
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-gray-400 text-sm border-2 border-dashed border-gray-100 rounded-xl">
              Nenhum insight para esta campanha. Clique em &ldquo;Gerar Insight&rdquo; para criar.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
