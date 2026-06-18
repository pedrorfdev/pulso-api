# Pulso API

API do Pulso — sistema de sincronização operacional para times de louvor. Backend em Fastify + TypeScript, banco PostgreSQL via Prisma ORM.

> "Tudo sincronizado." Pulso substitui mensagens perdidas, confirmações incertas e trocas de escala caóticas por clareza, ritmo e visibilidade em tempo real.

---

## Stack

| Camada         | Tecnologia                          |
|----------------|--------------------------------------|
| Runtime        | Node.js + TypeScript                 |
| Framework      | Fastify 5                            |
| ORM            | Prisma 7 (com adapter `@prisma/adapter-pg`) |
| Banco          | PostgreSQL (Neon em produção)        |
| Real-time      | Socket.io                            |
| Push           | Web Push API + VAPID                 |
| Testes         | Vitest + banco real de teste         |
| Jobs           | node-cron                            |
| Auth           | Google OAuth 2.0 + JWT               |
| Deploy         | Railway                              |

---

## Arquitetura

**Layered Architecture** com classes POO nos services. Sem Clean Architecture completa — o objetivo é manter o código simples e direto sem cerimônia desnecessária, adequado para um MVP com prazo apertado.

```
Route → Service → Prisma
```

A route valida o input com Zod, chama o método do service, e retorna a resposta. Toda a lógica de negócio vive no service. Não existem controllers separados — a route do Fastify já cumpre esse papel.

### Estrutura de pastas

```
src/
├── app.ts                      # monta o Fastify, registra plugins e rotas
├── server.ts                   # sobe o servidor na porta configurada
│
├── plugins/
│   ├── error-handler.ts        # error handler global
│   └── socket.ts                # Socket.io com auth JWT no handshake
│
├── lib/
│   ├── env.ts                  # validação de variáveis de ambiente (Zod)
│   ├── prisma.ts                # singleton do Prisma Client
│   └── push.ts                  # Web Push / VAPID
│
├── shared/
│   ├── errors/
│   │   └── app-error.ts        # AppError e subclasses (NotFoundError, etc)
│   ├── middleware/
│   │   ├── authenticate.ts     # decorator app.authenticate — valida JWT
│   │   └── require-role.ts     # decorator requireRole(minRole) — checa RBAC
│   └── utils/
│
├── modules/                    # domínios do negócio
│   ├── auth/                   # Google OAuth + JWT
│   ├── organization/           # orgs, membros, convites, notificações, stats
│   ├── schedule/                # eventos, slots, attendance
│   ├── swap/                    # trocas de escala com aprovação em cadeia
│   ├── song/                    # biblioteca de louvores
│   └── tech-check/              # checklist técnico pré-evento
│
└── jobs/
    ├── deadline.job.ts          # roda a cada hora — marca prazos vencidos
    └── stats.job.ts              # roda à meia-noite — recalcula reliability score
```

Cada módulo segue o padrão `nome.tipo.ts`:

```
schedule.routes.ts    # registra rotas, valida com Zod, chama o service
schedule.service.ts   # classe com a lógica de negócio, acessa o Prisma
schedule.schema.ts    # schemas Zod de input + tipos de response
```

---

## Modelo de dados

Multi-tenant com isolamento por `organization_id` em um único banco. RBAC com três papéis por organização: `ADMIN`, `LEADER`, `MEMBER` — o papel é por organização, não global (a mesma pessoa pode ser ADMIN numa org e MEMBER em outra).

### Principais entidades

```
User              → conta Google, dados pessoais
Organization      → workspace isolado (igreja, grupo)
OrganizationMember → vínculo user↔org com role e nickname
InviteLink         → links de convite com expiração e limite de usos

Event              → evento (culto, ensaio)
ScheduleSlot        → membro escalado com função (violão, baixo...)
Attendance          → confirmação de presença do slot

SwapRequest         → troca de escala (cadeia: target → líder)
Song                → biblioteca de louvores da org
EventSong            → louvor vinculado a um evento, com ordem

TechCheckItem        → item de checklist técnico do evento
TechCheckAssignment   → responsável por um item

MemberStats           → reliability score, faltas, confirmações
Notification           → log de notificações enviadas
```

Veja `prisma/schema.prisma` para o schema completo com todos os campos, índices e relações.

---

## Regras de negócio importantes

**Deadline de confirmação.** Cada organização define `confirmation_deadline_hours` (padrão: 48h antes do evento). Um cron job roda a cada hora e marca attendances `PENDING` vencidas como `DEADLINE_MISSED`, o que conta como ponto negativo na gamificação.

**Cadeia de aprovação de troca.** `PENDING_TARGET → PENDING_LEADER → APPROVED`. O membro alvo precisa aceitar primeiro; só depois o líder aprova. Se qualquer um recusar, vira `REJECTED_TARGET` ou `REJECTED_LEADER`. Quando aprovado, os `member_id` dos dois slots são trocados atomicamente.

**Faltas e justificativas.** As faltas (`absences`) são públicas por padrão (`organization.absences_public`). As justificativas só ficam visíveis se o líder habilitar `justifications_public` — protege a privacidade de motivos pessoais sem esconder o padrão de faltas.

**Reliability score.** Recalculado toda meia-noite. Fórmula: confirmações no prazo valem 1pt, confirmações tardias 0.5pt, faltas −0.5pt, prazos perdidos −1pt — normalizado numa escala de 0 a 100.

---

## Setup local

### Pré-requisitos
- Node.js 20+
- Docker (para os bancos PostgreSQL locais)

### Passos

```bash
# 1. instala dependências
npm install

# 2. sobe os bancos (dev na porta 5432, teste na 5433)
docker compose up -d

# 3. copia o .env de exemplo e preenche os valores
cp .env.example .env.dev
cp .env.example .env.test

# 4. gera o client do Prisma
npm run db:generate

# 5. roda as migrations
npm run db:migrate

# 6. popula com dados de desenvolvimento
npm run seed:dev

# 7. sobe o servidor
npm run dev
```

A API sobe em `http://localhost:3333`. Teste com `curl http://localhost:3333/health`.

### Variáveis de ambiente necessárias

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | string de conexão PostgreSQL |
| `JWT_SECRET` | segredo para assinar tokens (mín. 16 chars) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | credenciais OAuth do Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | URL de callback do OAuth |
| `FRONTEND_URL` | usado no CORS |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | gere com `npm run vapid:generate` |
| `VAPID_EMAIL` | formato `mailto:seu@email.com` (não é validado como email puro) |

---

## Testes

```bash
npm test              # roda uma vez
npm run test:watch    # modo watch
npm run test:coverage # com cobertura
```

Os testes rodam contra um banco PostgreSQL real (`pulso_test`, porta 5433) — **sem mock do Prisma**. Cada arquivo de teste limpa as tabelas relevantes no `beforeEach`, respeitando a ordem das foreign keys:

```
memberStats → techCheckAssignment → techCheckItem → eventSong → song
  → swapRequest → attendance → scheduleSlot → event
  → inviteLink → organizationMember → organization → user
```

Cobertura focada em services e lógica de jobs — não em routes (caro demais para o retorno) nem nos cron schedulers em si (testa-se a lógica que eles chamam).

---

## Seeds

Dois seeds, propositalmente isolados:

```bash
npm run seed:dev    # dados de desenvolvimento — org "Jovens Conexão"
npm run seed:demo   # dados de demonstração — org "Demo Pulso"
```

O seed de demo **nunca afeta outras organizações** — ele só limpa e recria dados com `organization_id` da org `demo-pulso`. Isso resolve o problema clássico de "rodar o seed de demo apaga o banco inteiro".

---

## Deploy (Railway + Neon)

**Build command:**
```bash
npm install && npx prisma generate && npm run build
```

**Start command:**
```bash
npx prisma migrate deploy && npm start
```

O banco fica no Neon (free tier, sem sleep) e a API no Railway. A `DATABASE_URL` do Neon vai direto nas variáveis de ambiente do Railway — o `prisma.config.ts` na raiz do projeto cuida da leitura em dev local, e o `datasource.url` no `schema.prisma` serve de fallback em produção.

---

## O que fica para depois do MVP

- Documentação automática com Swagger (`@fastify/swagger`)
- Google Calendar sync
- Autocomplete de Spotify/YouTube ao adicionar louvores
- Módulo financeiro (despesas por evento)
- App nativo (Play Store / App Store) — PWA valida primeiro
- Possível agente de IA para sorteio/sugestão automática de escalas