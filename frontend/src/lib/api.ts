import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import {
  AuthResponse,
  Campaign,
  CampaignMetrics,
  MetricsSummary,
  ObjectiveMetrics,
  TimeseriesPoint,
  Report,
  AiInsight,
  WebhookConfig,
  MetaAccount,
  PaginatedResponse,
} from '@/types';

const api: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach Bearer token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('access_token');
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { email, password }),

  logout: (refreshToken: string) =>
    api.post('/auth/logout', { refreshToken }),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
};

// Metrics API
export const metricsApi = {
  getSummary: (from: string, to: string, metaAccountId?: string) =>
    api.get<{ summary: MetricsSummary }>('/metrics/summary', {
      params: { dateFrom: from, dateTo: to, ...(metaAccountId ? { metaAccountId } : {}) },
    }),

  getByObjective: (from: string, to: string, metaAccountId?: string) =>
    api.get<{ byObjective: ObjectiveMetrics[] }>('/metrics/by-objective', {
      params: { dateFrom: from, dateTo: to, ...(metaAccountId ? { metaAccountId } : {}) },
    }),

  getTimeseries: (from: string, to: string, campaignId?: string, metaAccountId?: string) =>
    api.get<{ timeseries: TimeseriesPoint[] }>('/metrics/timeseries', {
      params: {
        dateFrom: from,
        dateTo: to,
        ...(campaignId ? { campaignId } : {}),
        ...(metaAccountId ? { metaAccountId } : {}),
      },
    }),
};

// Campaigns API
export const campaignsApi = {
  list: (params?: {
    objective?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) => api.get<PaginatedResponse<Campaign>>('/campaigns', { params }),

  get: (id: string) => api.get<{ campaign: Campaign }>(`/campaigns/${id}`),

  getMetrics: (id: string, from: string, to: string) =>
    api.get<{ metrics: CampaignMetrics[] }>(`/campaigns/${id}/metrics`, { params: { dateFrom: from, dateTo: to } }),
};

// Reports API
export const reportsApi = {
  list: (page?: number) =>
    api.get<PaginatedResponse<Report>>('/reports', { params: { page, limit: 10 } }),

  trigger: (data: {
    type: string;
    objective?: string;
    periodStart?: string;
    periodEnd?: string;
  }) => api.post<Report>('/reports/trigger', data),
};

// AI API
export const aiApi = {
  getInsights: (campaignId?: string, limit?: number) =>
    api.get<{ insights: AiInsight[] }>('/ai/insights', {
      params: {
        ...(campaignId ? { campaignId } : {}),
        ...(limit ? { limit } : {}),
      },
    }),

  generate: (campaignId: string | null, scope: 'campaign' | 'account') =>
    api.post<AiInsight>('/ai/generate', { campaignId, scope }),
};

// Webhooks API
export const webhooksApi = {
  list: () => api.get<{ webhooks: WebhookConfig[] }>('/webhooks'),

  create: (data: { eventType: string; url: string; secret?: string }) =>
    api.post<WebhookConfig>('/webhooks', data),

  test: (id: string) => api.post(`/webhooks/${id}/test`),

  delete: (id: string) => api.delete(`/webhooks/${id}`),

  toggleActive: (id: string, isActive: boolean) =>
    api.patch<WebhookConfig>(`/webhooks/${id}`, { isActive }),
};

// Meta Accounts API
export const metaApi = {
  list: () => api.get<{ accounts: MetaAccount[] }>('/meta-accounts'),

  // Admin only: add account for a specific client (no token required — uses global token)
  add: (data: { adAccountId: string; businessName: string; clientId: string; currency?: string }) =>
    api.post<{ account: MetaAccount }>('/meta-accounts', data),

  // Admin only: discover available ad accounts from the global token
  available: () => api.get<{ adAccounts: Array<{ id: string; name: string; currency: string }> }>('/meta-accounts/available'),

  sync: (id: string) => api.post(`/meta-accounts/${id}/sync`),

  delete: (id: string) => api.delete(`/meta-accounts/${id}`),
};

export const adminApi = {
  listClients: () => api.get<{ clients: Array<{ id: string; name: string; email: string; isActive: boolean; role: string }> }>('/admin/clients'),
  createClient: (data: { name: string; email: string; password: string; role?: string }) =>
    api.post('/admin/clients', data),
  updateClient: (id: string, data: { name?: string; email?: string; password?: string }) =>
    api.put(`/admin/clients/${id}`, data),
  toggleStatus: (id: string) => api.patch(`/admin/clients/${id}/toggle`),
  getClientMetaAccounts: (id: string) => api.get(`/admin/clients/${id}/meta-accounts`),
};

export default api;
