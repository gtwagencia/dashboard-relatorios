import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function formatCurrency(value: number, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(date: string | Date): string {
  try {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return format(d, 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return '-';
  }
}

export function formatDateTime(date: string | Date): string {
  try {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return '-';
  }
}

export function formatDateRange(from: string | Date, to: string | Date): string {
  try {
    const fromDate = typeof from === 'string' ? parseISO(from) : from;
    const toDate = typeof to === 'string' ? parseISO(to) : to;
    return `${format(fromDate, 'dd/MM', { locale: ptBR })} → ${format(toDate, 'dd/MM/yyyy', { locale: ptBR })}`;
  } catch {
    return '-';
  }
}

export function getObjectiveLabel(objective: string): string {
  const labels: Record<string, string> = {
    LEAD_GENERATION: 'Leads',
    OUTCOME_LEADS: 'Leads',
    CONVERSIONS: 'Vendas',
    OUTCOME_SALES: 'Vendas',
    ENGAGEMENT: 'Engajamento',
    OUTCOME_ENGAGEMENT: 'Engajamento',
    REACH: 'Alcance',
    OUTCOME_AWARENESS: 'Alcance',
    TRAFFIC: 'Tráfego',
    OUTCOME_TRAFFIC: 'Tráfego',
    BRAND_AWARENESS: 'Consciência de Marca',
    APP_INSTALLS: 'Instalações de App',
    VIDEO_VIEWS: 'Visualizações de Vídeo',
    MESSAGES: 'Mensagens',
  };
  return labels[objective?.toUpperCase()] || objective || 'Desconhecido';
}

export function getObjectiveColor(objective: string): string {
  const colors: Record<string, string> = {
    LEAD_GENERATION: 'bg-blue-100 text-blue-800',
    OUTCOME_LEADS: 'bg-blue-100 text-blue-800',
    CONVERSIONS: 'bg-green-100 text-green-800',
    OUTCOME_SALES: 'bg-green-100 text-green-800',
    ENGAGEMENT: 'bg-purple-100 text-purple-800',
    OUTCOME_ENGAGEMENT: 'bg-purple-100 text-purple-800',
    REACH: 'bg-orange-100 text-orange-800',
    OUTCOME_AWARENESS: 'bg-orange-100 text-orange-800',
    TRAFFIC: 'bg-cyan-100 text-cyan-800',
    OUTCOME_TRAFFIC: 'bg-cyan-100 text-cyan-800',
    BRAND_AWARENESS: 'bg-yellow-100 text-yellow-800',
    APP_INSTALLS: 'bg-pink-100 text-pink-800',
    VIDEO_VIEWS: 'bg-red-100 text-red-800',
    MESSAGES: 'bg-indigo-100 text-indigo-800',
  };
  return colors[objective?.toUpperCase()] || 'bg-gray-100 text-gray-800';
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    ACTIVE: 'Ativo',
    PAUSED: 'Pausado',
    ARCHIVED: 'Arquivado',
    DELETED: 'Excluído',
    IN_PROCESS: 'Processando',
    WITH_ISSUES: 'Com Problemas',
  };
  return labels[status?.toUpperCase()] || status || '-';
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    ACTIVE: 'success',
    PAUSED: 'warning',
    ARCHIVED: 'default',
    DELETED: 'danger',
    IN_PROCESS: 'info',
    WITH_ISSUES: 'danger',
  };
  return colors[status?.toUpperCase()] || 'default';
}

export function formatCompact(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return formatNumber(value);
}
