# LogVision — Grafana Setup

Dashboard Grafana que replica os painéis do LogVision (Heatmap, Requests by Hour, Top Pages) usando o mesmo banco PostgreSQL.

## Pré-requisitos

- Docker e Docker Compose instalados
- Acesso ao banco PostgreSQL do LogVision (mesmo `DATABASE_URL`)

## Como usar

### 1. Configure as variáveis de ambiente

Copie o arquivo de exemplo e preencha com os dados do seu banco:

```bash
cp .env.example .env
```

Edite `.env` com os dados do seu PostgreSQL. Se você estiver usando o Replit, os valores ficam na variável `DATABASE_URL` no formato:

```
postgresql://USUARIO:SENHA@HOST:PORTA/BANCO
```

Exemplo de `.env` preenchido:

```env
POSTGRES_HOST=ep-cool-darkness-123456.us-east-2.aws.neon.tech
POSTGRES_PORT=5432
POSTGRES_USER=neondb_owner
POSTGRES_DB=neondb
POSTGRES_PASSWORD=minhasenha123
```

### 2. Suba o Grafana

```bash
docker compose up -d
```

### 3. Acesse o Grafana

Abra: http://localhost:3000

- **Usuário:** `admin`
- **Senha:** `admin`

O dashboard **"LogVision — Apache Analytics"** já estará provisionado automaticamente.

---

## Painéis incluídos

| Painel | Descrição |
|---|---|
| **Heatmap Dia × Hora** | Grade 7×24 mostrando intensidade de requisições por dia da semana e hora |
| **Requests by Hour of Day** | Barras empilhadas por dia da semana para cada hora (0h–23h) |
| **Top Pages** | Tabela com páginas mais acessadas, IPs únicos, média de bytes, 2xx/4xx/5xx e hora pico |
| **Status Codes** | Donut com distribuição de status codes (2xx, 3xx, 4xx, 5xx) |
| **Stats** | Cards com total de requisições, IPs únicos, aplicações e páginas únicas |

## Filtros disponíveis

- **Aplicação** — filtra por app_name (ex: `api`, `shop`, `admin`)
- **Sessão de Log** — filtra por upload (sessão do LogVision)

## Estrutura dos arquivos

```
grafana/
├── docker-compose.yml                        # Sobe o Grafana
├── .env.example                              # Variáveis de ambiente (copie para .env)
├── provisioning/
│   ├── datasources/
│   │   └── postgres.yml                      # Configura a conexão com o PostgreSQL
│   └── dashboards/
│       ├── provider.yml                      # Diz ao Grafana onde buscar os dashboards
│       └── logvision.json                    # Dashboard completo (importado automaticamente)
```
