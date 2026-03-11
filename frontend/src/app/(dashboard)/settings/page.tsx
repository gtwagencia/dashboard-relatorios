'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import { metaApi, adminApi, webhooksApi, authApi, settingsApi } from '@/lib/api';
import { formatDateTime } from '@/lib/formatters';
import { getUser, setToken } from '@/lib/auth';
import TopBar from '@/components/layout/TopBar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { MetaAccount, WebhookConfig } from '@/types';
import toast from 'react-hot-toast';
import clsx from 'clsx';

type SettingsTab = 'meta' | 'webhooks' | 'reports' | 'profile' | 'clients' | 'system';

// ============================================================
// Meta Accounts Tab
// ============================================================

function MetaAccountsTab() {
  const user = getUser();
  const isAdmin = user?.role === 'admin';

  const [adAccountId, setAdAccountId] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [adding, setAdding] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: accountsData, isLoading, mutate } = useSWR(
    'meta-accounts',
    () => metaApi.list().then((r) => r.data.accounts)
  );
  const accounts: MetaAccount[] = accountsData || [];

  // Admin: load client list to populate selector
  const { data: clientsData } = useSWR(
    isAdmin ? 'admin-clients' : null,
    () => adminApi.listClients().then((r) => r.data.clients)
  );
  const clients = clientsData || [];

  async function handleAdd() {
    if (!adAccountId.trim() || !businessName.trim()) {
      toast.error('Preencha o ID da conta e o nome do negócio.');
      return;
    }
    if (isAdmin && !selectedClientId) {
      toast.error('Selecione o cliente desta conta.');
      return;
    }
    setAdding(true);
    try {
      await metaApi.add({
        adAccountId: adAccountId.trim(),
        businessName: businessName.trim(),
        clientId: selectedClientId || user!.id,
      });
      await mutate();
      setAdAccountId('');
      setBusinessName('');
      setSelectedClientId('');
      setShowForm(false);
      toast.success('Conta Meta adicionada! Sincronização iniciada.');
    } catch {
      toast.error('Erro ao adicionar conta. Verifique o ID da conta.');
    } finally {
      setAdding(false);
    }
  }

  async function handleSync(id: string) {
    setSyncingId(id);
    try {
      await metaApi.sync(id);
      toast.success('Sincronização iniciada. Atualize a página em alguns minutos.');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (err as { message?: string })?.message ||
        'Erro ao sincronizar conta.';
      toast.error(msg);
    } finally {
      setSyncingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja remover esta conta?')) return;
    setDeletingId(id);
    try {
      await metaApi.delete(id);
      await mutate();
      toast.success('Conta removida.');
    } catch {
      toast.error('Erro ao remover conta.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <Card
        title="Contas Meta Ads Conectadas"
        subtitle="Contas de anúncio vinculadas a cada cliente"
        action={
          isAdmin ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowForm((v) => !v)}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              }
            >
              Adicionar Conta
            </Button>
          ) : undefined
        }
      >
        {/* Add Form — admin only */}
        {showForm && isAdmin && (
          <div className="mb-5 p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-3">
            <h4 className="text-sm font-semibold text-blue-800">Nova Conta Meta Ads</h4>
            <p className="text-xs text-blue-600">
              O token de acesso é configurado globalmente via variável de ambiente <code className="bg-blue-100 px-1 rounded">META_ACCESS_TOKEN</code>.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Cliente *
                </label>
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Selecione o cliente...</option>
                  {clients.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  ID da Conta de Anúncio *
                </label>
                <input
                  type="text"
                  placeholder="act_123456789"
                  value={adAccountId}
                  onChange={(e) => setAdAccountId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Nome do Negócio
                </label>
                <input
                  type="text"
                  placeholder="Minha Empresa Ltda"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="primary" size="sm" loading={adding} onClick={handleAdd}>
                Adicionar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)} disabled={adding}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
        {showForm && !isAdmin && (
          <div className="mb-5 p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-800">
            Apenas administradores podem adicionar contas Meta. Entre em contato com o suporte.
          </div>
        )}

        {/* Accounts List */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-16 bg-gray-50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : !accounts || accounts.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm border-2 border-dashed border-gray-100 rounded-xl">
            Nenhuma conta Meta Ads conectada. Adicione sua primeira conta acima.
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between p-4 border border-gray-100 rounded-xl hover:border-blue-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{account.businessName}</p>
                    <p className="text-xs text-gray-500">{account.adAccountId} • {account.currency}</p>
                    {account.clientName && (
                      <p className="text-xs text-blue-500 font-medium">Cliente: {account.clientName}</p>
                    )}
                    {account.syncedAt && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Última sync: {formatDateTime(account.syncedAt)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={syncingId === account.id}
                    onClick={() => handleSync(account.id)}
                    icon={
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    }
                  >
                    Sincronizar
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    loading={deletingId === account.id}
                    onClick={() => handleDelete(account.id)}
                    icon={
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    }
                  >
                    Remover
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================
// Webhooks Tab
// ============================================================

const EVENT_TYPES = [
  { value: 'daily', label: 'Relatório Diário' },
  { value: 'weekly', label: 'Relatório Semanal' },
  { value: 'monthly', label: 'Relatório Mensal' },
  { value: 'sync_complete', label: 'Sincronização Concluída' },
  { value: 'campaign_alert', label: 'Alerta de Campanha' },
];

function getEventTypeLabel(eventType: string): string {
  return EVENT_TYPES.find((e) => e.value === eventType)?.label || eventType;
}

function WebhooksTab() {
  const [url, setUrl] = useState('');
  const [eventType, setEventType] = useState('daily');
  const [secret, setSecret] = useState('');
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const { data: webhooks, isLoading, mutate } = useSWR<WebhookConfig[]>(
    'webhooks',
    () => webhooksApi.list().then((r) => r.data.webhooks)
  );

  async function handleAdd() {
    if (!url.trim()) {
      toast.error('Informe a URL do webhook.');
      return;
    }
    if (!url.startsWith('http')) {
      toast.error('A URL deve começar com http:// ou https://');
      return;
    }
    setAdding(true);
    try {
      await webhooksApi.create({
        eventType,
        url: url.trim(),
        ...(secret.trim() ? { secret: secret.trim() } : {}),
      });
      await mutate();
      setUrl('');
      setSecret('');
      setEventType('daily');
      setShowForm(false);
      toast.success('Webhook criado com sucesso!');
    } catch {
      toast.error('Erro ao criar webhook.');
    } finally {
      setAdding(false);
    }
  }

  async function handleTest(id: string) {
    setTestingId(id);
    try {
      await webhooksApi.test(id);
      toast.success('Webhook testado! Verifique o endpoint n8n.');
    } catch {
      toast.error('Falha no teste do webhook.');
    } finally {
      setTestingId(null);
    }
  }

  async function handleToggle(webhook: WebhookConfig) {
    setTogglingId(webhook.id);
    try {
      await webhooksApi.toggleActive(webhook.id, !webhook.isActive);
      await mutate();
      toast.success(`Webhook ${!webhook.isActive ? 'ativado' : 'desativado'}.`);
    } catch {
      toast.error('Erro ao atualizar webhook.');
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja excluir este webhook?')) return;
    setDeletingId(id);
    try {
      await webhooksApi.delete(id);
      await mutate();
      toast.success('Webhook excluído.');
    } catch {
      toast.error('Erro ao excluir webhook.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <Card
        title="Webhooks (n8n)"
        subtitle="Configure endpoints para receber notificações automáticas"
        action={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowForm((v) => !v)}
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            }
          >
            Adicionar Webhook
          </Button>
        }
      >
        {/* Add Form */}
        {showForm && (
          <div className="mb-5 p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-3">
            <h4 className="text-sm font-semibold text-blue-800">Novo Webhook</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Tipo de Evento
                </label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {EVENT_TYPES.map((e) => (
                    <option key={e.value} value={e.value}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  URL do Webhook (n8n)
                </label>
                <input
                  type="url"
                  placeholder="https://n8n.seudominio.com/webhook/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Secret (opcional)
                </label>
                <input
                  type="text"
                  placeholder="chave-secreta-opcional"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="primary" size="sm" loading={adding} onClick={handleAdd}>
                Criar Webhook
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)} disabled={adding}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* Webhooks List */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 bg-gray-50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : !webhooks || webhooks.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm border-2 border-dashed border-gray-100 rounded-xl">
            Nenhum webhook configurado. Adicione seu primeiro webhook acima.
          </div>
        ) : (
          <div className="space-y-3">
            {webhooks.map((webhook) => (
              <div
                key={webhook.id}
                className={clsx(
                  'flex items-center justify-between p-4 border rounded-xl transition-all',
                  webhook.isActive
                    ? 'border-gray-100 hover:border-green-100'
                    : 'border-gray-100 opacity-60'
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={clsx(
                      'w-2 h-2 rounded-full shrink-0',
                      webhook.isActive ? 'bg-green-500' : 'bg-gray-300'
                    )}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="info">{getEventTypeLabel(webhook.eventType)}</Badge>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 truncate max-w-[320px]">
                      {webhook.url}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  {/* Toggle */}
                  <button
                    onClick={() => handleToggle(webhook)}
                    disabled={togglingId === webhook.id}
                    className={clsx(
                      'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none',
                      webhook.isActive ? 'bg-green-500' : 'bg-gray-300'
                    )}
                    title={webhook.isActive ? 'Desativar' : 'Ativar'}
                  >
                    <span
                      className={clsx(
                        'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                        webhook.isActive ? 'translate-x-4' : 'translate-x-0.5'
                      )}
                    />
                  </button>

                  <Button
                    variant="secondary"
                    size="sm"
                    loading={testingId === webhook.id}
                    onClick={() => handleTest(webhook.id)}
                    disabled={!webhook.isActive}
                  >
                    Testar
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    loading={deletingId === webhook.id}
                    onClick={() => handleDelete(webhook.id)}
                    icon={
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================
// Auto Reports Tab
// ============================================================

function AutoReportsTab() {
  const schedules = [
    {
      icon: '📅',
      title: 'Relatório Diário',
      schedule: 'Todos os dias às 07:00',
      description:
        'Resumo com investimento total, leads gerados, CTR médio e CPC médio do dia anterior.',
      badge: 'Ativo',
    },
    {
      icon: '📊',
      title: 'Relatório Semanal',
      schedule: 'Toda segunda-feira às 08:00',
      description:
        'Análise da semana com comparativo versus semana anterior, breakdown por objetivo e melhores campanhas.',
      badge: 'Ativo',
    },
    {
      icon: '📈',
      title: 'Relatório Mensal',
      schedule: 'Todo dia 1º do mês às 09:00',
      description:
        'Relatório completo mensal com evolução histórica, análise de tendências e insights de IA.',
      badge: 'Ativo',
    },
  ];

  return (
    <div className="space-y-5">
      <Card
        title="Relatórios Automáticos"
        subtitle="Os relatórios são enviados automaticamente via webhook n8n conforme a agenda abaixo"
      >
        <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-start gap-2.5 text-sm text-blue-700">
          <svg className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            Para receber os relatórios, configure ao menos um webhook ativo na aba <strong>Webhooks (n8n)</strong>.
            Os relatórios são enviados como payload JSON para o endpoint configurado.
          </span>
        </div>

        <div className="space-y-4">
          {schedules.map((item, i) => (
            <div key={i} className="flex items-start gap-4 p-5 border border-gray-100 rounded-xl hover:border-blue-100 transition-colors">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-xl shrink-0">
                {item.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h4 className="text-sm font-semibold text-gray-800">{item.title}</h4>
                  <Badge variant="success">{item.badge}</Badge>
                </div>
                <p className="text-xs text-blue-600 font-medium mb-1.5">
                  ⏰ {item.schedule}
                </p>
                <p className="text-sm text-gray-500">{item.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 p-4 bg-gray-50 rounded-xl">
          <h4 className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
            Formato do Payload JSON
          </h4>
          <pre className="text-xs text-gray-600 bg-white border border-gray-200 rounded-lg p-3 overflow-x-auto">
{`{
  "type": "daily" | "weekly" | "monthly",
  "period": { "start": "2024-01-01", "end": "2024-01-07" },
  "summary": { "totalSpend": 1234.56, "totalLeads": 89, ... },
  "objectives": [ { "name": "Leads", "spend": 800, ... } ],
  "generatedAt": "2024-01-08T07:00:00Z"
}`}
          </pre>
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// Profile Tab (change password)
// ============================================================

function ProfileTab() {
  const [user, setUser] = useState(getUser());
  // Profile fields
  const [profileName, setProfileName] = useState(user?.name || '');
  const [profileEmail, setProfileEmail] = useState(user?.email || '');
  const [savingProfile, setSavingProfile] = useState(false);
  // Password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  async function handleSaveProfile() {
    if (!profileName.trim() && !profileEmail.trim()) {
      toast.error('Preencha nome ou e-mail.');
      return;
    }
    setSavingProfile(true);
    try {
      const res = await authApi.updateProfile({
        name: profileName.trim() || undefined,
        email: profileEmail.trim() || undefined,
      });
      // Save new token so getUser() returns updated name/email
      setToken(res.data.accessToken);
      setUser(getUser());
      toast.success('Perfil atualizado com sucesso!');
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Erro ao atualizar perfil.';
      toast.error(msg);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('Preencha todos os campos.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('A nova senha e a confirmação não coincidem.');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('A nova senha deve ter pelo menos 8 caracteres.');
      return;
    }
    setSavingPassword(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      toast.success('Senha alterada com sucesso!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Erro ao alterar senha.';
      toast.error(msg);
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card title="Meu Perfil" subtitle="Informações da sua conta">
        <div className="flex items-center gap-4 mb-6 p-4 bg-gray-50 rounded-xl">
          <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white text-lg font-bold shrink-0">
            {user?.name?.charAt(0).toUpperCase() || '?'}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">{user?.name}</p>
            <p className="text-xs text-gray-500">{user?.email}</p>
            <span className={clsx(
              'inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium',
              user?.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
            )}>
              {user?.role === 'admin' ? 'Administrador' : 'Cliente'}
            </span>
          </div>
        </div>

        <h4 className="text-sm font-semibold text-gray-700 mb-4">Editar Nome e E-mail</h4>
        <div className="space-y-3 max-w-sm mb-6">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome</label>
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Seu nome"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">E-mail</label>
            <input
              type="email"
              value={profileEmail}
              onChange={(e) => setProfileEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="seu@email.com"
            />
          </div>
          <div className="pt-1">
            <Button variant="primary" size="sm" loading={savingProfile} onClick={handleSaveProfile}>
              Salvar Alterações
            </Button>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-4">Alterar Senha</h4>
          <div className="space-y-3 max-w-sm">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Senha Atual *</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nova Senha *</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Mínimo 8 caracteres"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Confirmar Nova Senha *</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Repita a nova senha"
              />
            </div>
            <div className="pt-1">
              <Button variant="primary" size="sm" loading={savingPassword} onClick={handleChangePassword}>
                Salvar Nova Senha
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// Clients Tab (admin only)
// ============================================================

function ClientsTab() {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('client');
  const [adding, setAdding] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const { data: clientsData, isLoading, mutate } = useSWR(
    'admin-clients-tab',
    () => adminApi.listClients().then((r) => r.data.clients)
  );
  const clients = clientsData || [];

  async function handleCreate() {
    if (!name.trim() || !email.trim() || !password.trim()) {
      toast.error('Nome, e-mail e senha são obrigatórios.');
      return;
    }
    setAdding(true);
    try {
      await adminApi.createClient({ name: name.trim(), email: email.trim(), password, role });
      await mutate();
      setName(''); setEmail(''); setPassword(''); setRole('client');
      setShowForm(false);
      toast.success('Usuário criado com sucesso!');
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Erro ao criar usuário.';
      toast.error(msg);
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(id: string) {
    setTogglingId(id);
    try {
      await adminApi.toggleStatus(id);
      await mutate();
    } catch {
      toast.error('Erro ao atualizar status.');
    } finally {
      setTogglingId(null);
    }
  }

  async function handleResetPassword() {
    if (!resetPassword || resetPassword.length < 8) {
      toast.error('A senha deve ter pelo menos 8 caracteres.');
      return;
    }
    setResetting(true);
    try {
      await adminApi.updateClient(resetId!, { password: resetPassword });
      toast.success('Senha redefinida com sucesso!');
      setResetId(null);
      setResetPassword('');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erro ao redefinir senha.');
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card
        title="Gerenciar Usuários"
        subtitle="Crie e gerencie clientes e administradores"
        action={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowForm((v) => !v)}
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            }
          >
            Novo Usuário
          </Button>
        }
      >
        {showForm && (
          <div className="mb-5 p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-3">
            <h4 className="text-sm font-semibold text-blue-800">Novo Usuário</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nome *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome completo"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">E-mail *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@email.com"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Senha *</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Papel</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="client">Cliente</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="primary" size="sm" loading={adding} onClick={handleCreate}>
                Criar Usuário
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)} disabled={adding}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 bg-gray-50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : clients.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">
            Nenhum usuário encontrado.
          </div>
        ) : (
          <div className="space-y-2">
            {clients.map((c: any) => (
              <div key={c.id} className={clsx('border rounded-xl transition-all', c.isActive ? 'border-gray-100' : 'border-gray-100 opacity-60')}>
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-sm font-bold shrink-0">
                      {(c.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{c.name}</p>
                      <p className="text-xs text-gray-500">{c.email}</p>
                    </div>
                    <span className={clsx(
                      'ml-2 px-2 py-0.5 rounded-full text-xs font-medium',
                      c.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    )}>
                      {c.role === 'admin' ? 'Admin' : 'Cliente'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => { setResetId(resetId === c.id ? null : c.id); setResetPassword(''); }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      title="Redefinir senha"
                    >
                      Redefinir senha
                    </button>
                    <button
                      onClick={() => handleToggle(c.id)}
                      disabled={togglingId === c.id}
                      className={clsx(
                        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none',
                        c.isActive ? 'bg-green-500' : 'bg-gray-300'
                      )}
                      title={c.isActive ? 'Desativar' : 'Ativar'}
                    >
                      <span className={clsx('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', c.isActive ? 'translate-x-4' : 'translate-x-0.5')} />
                    </button>
                  </div>
                </div>
                {resetId === c.id && (
                  <div className="px-3 pb-3 flex items-center gap-2">
                    <input
                      type="password"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      placeholder="Nova senha (mín. 8 caracteres)"
                      className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <Button variant="primary" size="sm" loading={resetting} onClick={handleResetPassword}>
                      Salvar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setResetId(null); setResetPassword(''); }} disabled={resetting}>
                      Cancelar
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================
// System Settings Tab (admin only — Meta token, OpenAI key)
// ============================================================

function SystemSettingsTab() {
  const { data, isLoading, mutate } = useSWR(
    'system-settings',
    () => settingsApi.getAll().then((r) => r.data.settings)
  );

  const [metaToken, setMetaToken] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const [showOpenai, setShowOpenai] = useState(false);

  // Initialise fields when data loads
  const [initialised, setInitialised] = useState(false);
  if (data && !initialised) {
    setMetaToken(data['META_ACCESS_TOKEN'] || '');
    setOpenaiKey(data['OPENAI_API_KEY'] || '');
    setInitialised(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      if (metaToken.trim()) payload['META_ACCESS_TOKEN'] = metaToken.trim();
      if (openaiKey.trim()) payload['OPENAI_API_KEY'] = openaiKey.trim();
      if (Object.keys(payload).length === 0) {
        toast.error('Nenhum token para salvar.');
        return;
      }
      await settingsApi.update(payload);
      await mutate();
      toast.success('Tokens salvos com sucesso!');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erro ao salvar tokens.');
    } finally {
      setSaving(false);
    }
  }

  function mask(value: string) {
    if (!value) return '';
    const start = value.slice(0, 8);
    const end = value.slice(-4);
    return `${start}${'•'.repeat(Math.max(0, value.length - 12))}${end}`;
  }

  return (
    <div className="space-y-5">
      <Card
        title="Configurações do Sistema"
        subtitle="Tokens de API armazenados com segurança no banco de dados. Nunca expostos no código-fonte."
      >
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2.5 text-sm text-amber-800">
          <svg className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>
            Apenas administradores têm acesso a esta tela. Os tokens são salvos no banco de dados e nunca ficam visíveis no repositório Git.
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <div key={i} className="h-16 bg-gray-50 rounded-lg animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-4 max-w-lg">
            {/* Meta Access Token */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Meta Access Token
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Token de acesso da API do Meta Ads (Business token ou System User token com permissão de leitura de anúncios).
              </p>
              <div className="relative">
                <input
                  type={showMeta ? 'text' : 'password'}
                  value={metaToken}
                  onChange={(e) => setMetaToken(e.target.value)}
                  placeholder="EAAxxxxxxx..."
                  className="w-full px-3 py-2 pr-10 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowMeta((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showMeta ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {data?.['META_ACCESS_TOKEN'] && (
                <p className="text-xs text-gray-400 mt-1">Atual: <code className="font-mono">{mask(data['META_ACCESS_TOKEN'])}</code></p>
              )}
            </div>

            {/* OpenAI API Key */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                OpenAI API Key
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Chave da API do ChatGPT (OpenAI) usada para geração de insights com IA.
              </p>
              <div className="relative">
                <input
                  type={showOpenai ? 'text' : 'password'}
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="sk-proj-..."
                  className="w-full px-3 py-2 pr-10 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowOpenai((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showOpenai ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {data?.['OPENAI_API_KEY'] && (
                <p className="text-xs text-gray-400 mt-1">Atual: <code className="font-mono">{mask(data['OPENAI_API_KEY'])}</code></p>
              )}
            </div>

            <div className="pt-1">
              <Button variant="primary" loading={saving} onClick={handleSave}>
                Salvar Tokens
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================
// Main Settings Page
// ============================================================

export default function SettingsPage() {
  const user = getUser();
  const isAdmin = user?.role === 'admin';
  const [activeTab, setActiveTab] = useState<SettingsTab>('meta');

  const tabs: { key: SettingsTab; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
    {
      key: 'meta',
      label: 'Contas Meta',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      key: 'webhooks',
      label: 'Webhooks (n8n)',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      ),
    },
    {
      key: 'reports',
      label: 'Relatórios Automáticos',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      key: 'clients',
      label: 'Usuários',
      adminOnly: true,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      key: 'system',
      label: 'Tokens & API',
      adminOnly: true,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
      ),
    },
    {
      key: 'profile',
      label: 'Meu Perfil',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
  ];

  const visibleTabs = tabs.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Configurações" showDateRange={false} />

      <div className="flex-1 p-6 space-y-5">
        {/* Tab Bar */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 self-start w-fit flex-wrap">
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                activeTab === tab.key
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'meta' && <MetaAccountsTab />}
        {activeTab === 'webhooks' && <WebhooksTab />}
        {activeTab === 'reports' && <AutoReportsTab />}
        {activeTab === 'profile' && <ProfileTab />}
        {activeTab === 'clients' && isAdmin && <ClientsTab />}
        {activeTab === 'system' && isAdmin && <SystemSettingsTab />}
      </div>
    </div>
  );
}
