export interface Client {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

export interface MetaAccount {
  id: string;
  adAccountId: string;
  businessName: string;
  currency: string;
  syncedAt: string;
  clientName?: string;
}

export interface Campaign {
  id: string;
  campaignId: string;
  name: string;
  objective: string;
  status: string;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  startTime: string;
  endTime: string;
  businessName?: string;
  adAccountId?: string;
  currency?: string;
  totalSpend?: number;
  totalImpressions?: number;
  totalLeads?: number;
  totalClicks?: number;
  totalConversions?: number;
  totalConversionsValue?: number;
}

export interface CampaignMetrics {
  campaignId: string;
  dateStart: string;
  impressions: number;
  reach: number;
  clicks: number;
  spend: number;
  ctr: number;
  cpc: number;
  cpm: number;
  leads: number;
  conversions: number;
  costPerLead: number;
  frequency: number;
}

export interface MetricsSummary {
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalReach: number;
  totalLeads: number;
  totalConversions: number;
  totalConversionsValue: number;
  avgCtr: number;
  avgCpm: number;
  avgCpc: number;
  activeCampaigns: number;
}

export interface ObjectiveMetrics {
  objective: string;
  objectiveType: string;
  campaigns: number;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  conversions: number;
  ctr: number;
  costPerLead: number;
}

export interface TimeseriesPoint {
  date: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
  conversions: number;
  conversionsValue: number;
  ctr: number;
  cpc: number;
  cpm: number;
}

export interface Report {
  id: string;
  type: string;
  objective: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  createdAt: string;
  sentAt: string;
  webhookUrl?: string;
  errorMsg?: string;
}

export interface SystemSetting {
  key: string;
  value: string;
}

export interface AiInsight {
  id: string;
  campaignId: string;
  insights: string[];
  score: number;
  priority: string;
  createdAt: string;
}

export interface WebhookConfig {
  id: string;
  eventType: string;
  url: string;
  isActive: boolean;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  client: Client;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type DateRange = '7d' | '30d' | '90d' | 'custom';

export interface DateRangeOption {
  label: string;
  value: DateRange;
  days: number;
}

export interface MessageTemplate {
  id: string;
  objective: string;
  name: string;
  headerBlock: string;
  campaignBlock: string;
  adBlock: string;
  summaryBlock: string;
  isActive: boolean;
  updatedAt: string;
}

export interface Ad {
  id: string;
  adId: string;
  name: string;
  status: string;
  thumbnailUrl: string | null;
  creativeId: string | null;
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalLeads: number;
  totalConversions: number;
  totalConversionsValue: number;
  avgCtr: number;
  avgCpc: number;
  avgCpm: number;
}

export interface ClientWhatsAppConfig {
  whatsapp_number: string | null;
  whatsapp_enabled: boolean;
  whatsapp_api_url: string | null;
  whatsapp_api_key: string | null;
  whatsapp_instance: string | null;
  report_objective: string;
}
