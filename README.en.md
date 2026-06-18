# Pulso API

Pulso's backend — an operational synchronization system for worship teams. Built with Fastify + TypeScript, PostgreSQL via Prisma ORM.

> "Always in sync." Pulso replaces lost messages, uncertain confirmations, and chaotic schedule swaps with clarity, rhythm, and real-time visibility.

---

## Stack

| Layer          | Technology                          |
|----------------|--------------------------------------|
| Runtime        | Node.js + TypeScript                 |
| Framework      | Fastify 5                            |
| ORM            | Prisma 7 (with `@prisma/adapter-pg`) |
| Database       | PostgreSQL (Neon in production)      |
| Real-time      | Socket.io                            |
| Push           | Web Push API + VAPID                 |
| Testing        | Vitest + real test database          |
| Jobs           | node-cron                            |
| Auth           | Google OAuth 2.0 + JWT               |
| Deploy         | Railway                              |

---

## Architecture

**Layered Architecture** with OOP-style service classes. No full Clean Architecture — the goal is to keep the code simple and direct without unnecessary ceremony, suited for an MVP with a tight deadline.

```
Route → Service → Prisma
```

The route validates input with Zod, calls the service method, and returns the response. All business logic lives in the service layer. There are no separate controllers — the Fastify route already fills that role.

### Folder structure

```
src/
├── app.ts                      # builds Fastify, registers plugins and routes
├── server.ts                   # boots the server on the configured port
│
├── plugins/
│   ├── error-handler.ts        # global error handler
│   └── socket.ts                # Socket.io with JWT auth on handshake
│
├── lib/
│   ├── env.ts                  # environment variable validation (Zod)
│   ├── prisma.ts                # Prisma Client singleton
│   └── push.ts                  # Web Push / VAPID
│
├── shared/
│   ├── errors/
│   │   └── app-error.ts        # AppError and subclasses (NotFoundError, etc.)
│   ├── middleware/
│   │   ├── authenticate.ts     # app.authenticate decorator — validates JWT
│   │   └── require-role.ts     # requireRole(minRole) decorator — checks RBAC
│   └── utils/
│
├── modules/                    # business domains
│   ├── auth/                   # Google OAuth + JWT
│   ├── organization/           # orgs, members, invites, notifications, stats
│   ├── schedule/                # events, slots, attendance
│   ├── swap/                    # schedule swaps with chained approval
│   ├── song/                    # song/setlist library
│   └── tech-check/              # pre-event technical checklist
│
└── jobs/
    ├── deadline.job.ts          # runs hourly — flags missed deadlines
    └── stats.job.ts              # runs at midnight — recalculates reliability score
```

Each module follows the `name.type.ts` convention:

```
schedule.routes.ts    # registers routes, validates with Zod, calls the service
schedule.service.ts   # class with business logic, talks to Prisma
schedule.schema.ts    # Zod input schemas + response types
```

---

## Data model

Multi-tenant with `organization_id` isolation in a single database. RBAC with three roles per organization: `ADMIN`, `LEADER`, `MEMBER` — role is scoped per organization, not global (the same person can be ADMIN in one org and MEMBER in another).

### Core entities

```
User              → Google account, personal data
Organization      → isolated workspace (church, group)
OrganizationMember → user↔org link with role and nickname
InviteLink         → invite links with expiration and usage limits

Event              → an event (service, rehearsal)
ScheduleSlot        → a scheduled member with a role (guitar, bass...)
Attendance          → attendance confirmation for the slot

SwapRequest         → schedule swap (chain: target → leader)
Song                → org's song library
EventSong            → a song linked to an event, with ordering

TechCheckItem        → technical checklist item for the event
TechCheckAssignment   → person responsible for an item

MemberStats           → reliability score, absences, confirmations
Notification           → log of sent notifications
```

See `prisma/schema.prisma` for the full schema with all fields, indexes, and relations.

---

## Key business rules

**Confirmation deadline.** Each organization sets `confirmation_deadline_hours` (default: 48h before the event). A cron job runs hourly and flags expired `PENDING` attendances as `DEADLINE_MISSED`, which counts as a negative point in the gamification system.

**Swap approval chain.** `PENDING_TARGET → PENDING_LEADER → APPROVED`. The target member must accept first; only then does the leader approve. If either rejects, it becomes `REJECTED_TARGET` or `REJECTED_LEADER`. Once approved, the `member_id` of both slots is swapped atomically.

**Absences and justifications.** Absences (`absences`) are public by default (`organization.absences_public`). Justifications are only visible if the leader enables `justifications_public` — protects the privacy of personal reasons without hiding the absence pattern itself.

**Reliability score.** Recalculated every midnight. Formula: on-time confirmations are worth 1pt, late confirmations 0.5pt, absences −0.5pt, missed deadlines −1pt — normalized to a 0–100 scale.

---

## Local setup

### Prerequisites
- Node.js 20+
- Docker (for local PostgreSQL databases)

### Steps

```bash
# 1. install dependencies
npm install

# 2. start the databases (dev on port 5432, test on 5433)
docker compose up -d

# 3. copy the example env file and fill in the values
cp .env.example .env.dev
cp .env.example .env.test

# 4. generate the Prisma client
npm run db:generate

# 5. run migrations
npm run db:migrate

# 6. seed development data
npm run seed:dev

# 7. start the server
npm run dev
```

The API runs on `http://localhost:3333`. Test with `curl http://localhost:3333/health`.

### Required environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | secret for signing tokens (min. 16 chars) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth credentials from Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL |
| `FRONTEND_URL` | used in CORS |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | generate with `npm run vapid:generate` |
| `VAPID_EMAIL` | format `mailto:you@email.com` (not validated as a plain email) |

---

## Testing

```bash
npm test              # run once
npm run test:watch    # watch mode
npm run test:coverage # with coverage
```

Tests run against a real PostgreSQL database (`pulso_test`, port 5433) — **no Prisma mocking**. Each test file cleans up relevant tables in `beforeEach`, respecting foreign key order:

```
memberStats → techCheckAssignment → techCheckItem → eventSong → song
  → swapRequest → attendance → scheduleSlot → event
  → inviteLink → organizationMember → organization → user
```

Coverage is focused on services and job logic — not on routes (too expensive for the return) nor on the cron schedulers themselves (the logic they call is tested instead).

---

## Seeds

Two seeds, intentionally isolated:

```bash
npm run seed:dev    # development data — "Jovens Conexão" org
npm run seed:demo   # demo data — "Demo Pulso" org
```

The demo seed **never affects other organizations** — it only clears and recreates data scoped to the `demo-pulso` organization's `organization_id`. This solves the classic problem of "running the demo seed wipes the whole database."

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

The database lives on Neon (free tier, no sleep) and the API on Railway. Neon's `DATABASE_URL` goes directly into Railway's environment variables — `prisma.config.ts` at the project root handles local dev reading, and `datasource.url` in `schema.prisma` serves as a production fallback.

---

## Post-MVP roadmap

- Automatic API docs with Swagger (`@fastify/swagger`)
- Google Calendar sync
- Spotify/YouTube autocomplete when adding songs
- Finance module (per-event expenses)
- Native app (Play Store / App Store) — PWA validates first
- Possible AI agent for automatic schedule drafting/suggestions