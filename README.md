# Meta Ads Dashboard

Painel completo para monitoramento de campanhas do Meta Ads (Facebook/Instagram) em tempo real.

## Funcionalidades

- **Dados em tempo real** — sincronização automática a cada 30 minutos com a API do Meta Ads
- **Dashboard por objetivo** — visualize leads, vendas, engajamento e alcance separadamente
- **Multi-cliente** — cada cliente faz login e vê apenas suas contas e campanhas
- **Relatórios automáticos** — diários (7h), semanais (segunda às 8h) e mensais (dia 1 às 9h)
- **Integração n8n** — dispara webhooks formatados para seu fluxo n8n enviar via WhatsApp/email
- **Sugestões de IA** — usa GPT-4o-mini para analisar métricas e sugerir otimizações em português
- **Métricas completas** — Investimento, CTR, CPC, CPM, Leads, Conversões, Alcance, Frequência

## Arquitetura

```
nginx (porta 80)
├── /api → backend (Node.js + Express, porta 3001)
│            ├── PostgreSQL (dados das campanhas)
│            └── Redis (cache de métricas e tokens IA)
└── /    → frontend (Next.js 14, porta 3000)
```

## Deploy no Portainer

### 1. Pré-requisitos

- Portainer instalado com acesso ao Docker Engine
- Domínio ou IP do servidor apontando para a máquina

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Edite o `.env` e preencha:

| Variável | Descrição | Como obter |
|----------|-----------|------------|
| `POSTGRES_PASSWORD` | Senha do banco | Gere uma senha forte |
| `REDIS_PASSWORD` | Senha do Redis | Gere uma senha forte |
| `JWT_SECRET` | Chave JWT | `openssl rand -hex 64` |
| `JWT_REFRESH_SECRET` | Chave JWT refresh | `openssl rand -hex 64` |
| `TOKEN_ENCRYPTION_KEY` | Chave AES-256 | `openssl rand -hex 32` |
| `META_APP_ID` | ID do App Meta | [developers.facebook.com](https://developers.facebook.com/apps/) |
| `META_APP_SECRET` | Secret do App Meta | Painel do App no Meta |
| `OPENAI_API_KEY` | Chave OpenAI | [platform.openai.com](https://platform.openai.com/api-keys) |
| `N8N_WEBHOOK_BASE_URL` | URL do seu n8n | Ex: `https://n8n.seudominio.com` |

### 3. Deploy via Portainer Stack

1. Acesse o Portainer → **Stacks** → **Add Stack**
2. Selecione **Upload** e faça upload do `docker-compose.yml`
3. Em **Environment variables**, adicione as variáveis do `.env`
4. Clique em **Deploy the stack**

Alternativamente, use **Git Repository** apontando para este repositório.

### 4. Criar usuário admin

Após o deploy, execute o script de setup:

```bash
docker exec ads-backend node scripts/setup-admin.js
```

Acesso inicial:
- **Email:** admin@dashboard.com
- **Senha:** Admin@123 ← **Altere imediatamente!**

### 5. Acessar o painel

Abra `http://SEU_IP` no navegador.

---

## Configuração do Meta Ads

### Obter Access Token

1. Acesse o [Meta for Developers](https://developers.facebook.com/apps/)
2. Crie um App → tipo **Business**
3. Adicione o produto **Marketing API**
4. No **Graph API Explorer**, gere um token com as permissões:
   - `ads_read`
   - `ads_management`
   - `business_management`
5. Para token de longa duração (60 dias), troque pelo token de longa duração:

```
GET https://graph.facebook.com/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id={META_APP_ID}
  &client_secret={META_APP_SECRET}
  &fb_exchange_token={TOKEN_CURTO}
```

### Adicionar conta no painel

1. Faça login no painel
2. Acesse **Configurações** → **Contas Meta**
3. Clique em **Adicionar Conta**
4. Insira:
   - **ID da Conta de Anúncios** (formato: `act_XXXXXXXX`)
   - **Access Token** (obtido acima)
   - **Nome da Empresa**

---

## Integração com n8n

### Configurar Webhook

1. No painel, acesse **Configurações** → **Webhooks (n8n)**
2. Clique em **Adicionar Webhook**
3. Configure:
   - **Tipo de Evento:** `report.daily`, `report.weekly` ou `report.monthly`
   - **URL:** URL do seu webhook no n8n
   - **Secret:** Chave HMAC para validação (opcional)

### Payload enviado ao n8n

```json
{
  "event": "report.daily",
  "generated_at": "2026-03-09T10:00:00Z",
  "client_id": "uuid",
  "client_name": "Nome do Cliente",
  "period": { "start": "2026-03-08", "end": "2026-03-08" },
  "objective_type": "leads",
  "summary": {
    "total_spend": 1250.00,
    "total_leads": 47,
    "cost_per_lead": 26.60,
    "total_reach": 18400,
    "avg_ctr": 2.34,
    "avg_cpm": 32.10,
    "total_conversions": 0,
    "cost_per_conversion": 0
  },
  "campaigns": [
    {
      "id": "camp_123",
      "name": "Campanha Leads Março",
      "objective": "leads",
      "spend": 600.00,
      "leads": 23,
      "conversions": 0,
      "ctr": 2.8,
      "cpc": 1.40,
      "cpm": 28.50,
      "reach": 9200
    }
  ],
  "ai_insight": "Sua campanha está performando 15% acima da média..."
}
```

No n8n, configure o node **Webhook** para receber esse payload e depois use um node **Send Message** (WhatsApp/Telegram/Email) para formatar e enviar ao cliente.

### Disparar relatório manualmente

Além dos relatórios automáticos, você pode disparar manualmente pelo painel:
- Acesse **Relatórios** → **Gerar Relatório**

Ou via API:
```bash
curl -X POST http://SEU_IP/api/reports/trigger \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "daily",
    "objective": "leads",
    "periodStart": "2026-03-08",
    "periodEnd": "2026-03-08"
  }'
```

---

## Agenda de Relatórios Automáticos

| Tipo | Horário | Período coberto |
|------|---------|-----------------|
| Diário | Todo dia às 7h (BRT) | Dia anterior |
| Semanal | Segunda-feira às 8h (BRT) | Semana anterior |
| Mensal | Dia 1 do mês às 9h (BRT) | Mês anterior |

---

## Desenvolvimento Local

```bash
# 1. Subir serviços de infra
docker-compose up postgres redis -d

# 2. Backend
cd backend
npm install
cp ../.env.example .env  # configure as variáveis
npm run dev

# 3. Frontend (outro terminal)
cd frontend
npm install
npm run dev
```

- Backend: http://localhost:3001
- Frontend: http://localhost:3000

---

## API Endpoints Principais

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/auth/login` | Login |
| GET | `/api/metrics/summary` | KPIs agregados |
| GET | `/api/metrics/by-objective` | Métricas por objetivo |
| GET | `/api/metrics/timeseries` | Série temporal de métricas |
| GET | `/api/campaigns` | Lista campanhas |
| GET | `/api/campaigns/:id/metrics` | Métricas de uma campanha |
| POST | `/api/reports/trigger` | Disparar relatório manualmente |
| POST | `/api/ai/generate` | Gerar insight de IA |
| GET | `/api/meta-accounts` | Contas Meta conectadas |
| POST | `/api/meta-accounts/:id/sync` | Sincronizar conta manualmente |
