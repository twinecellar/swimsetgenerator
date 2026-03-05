# swimsetgenerator

Standalone Fastify API for swim plan generation and plan lifecycle endpoints.

## Endpoints

- `GET /healthz`
- `POST /v1/plans/generate`
- `POST /v1/plans/accept`
- `POST /v1/plans/:id/complete`

Compatibility aliases:

- `POST /api/mobile/plans/generate`
- `POST /api/plans/accept`
- `POST /api/plans/:id/complete`

## Environment

Copy `.env.example` to `.env` and set:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `ANTHROPIC_API_KEY`

Optional:

- `PORT` (default `3000`)
- `CORS_ORIGIN` (default `*`)
- `GENERATE_LIMIT_MAX` (default `20`)
- `GENERATE_LIMIT_WINDOW_MS` (default `60000`)

## Run

```bash
npm install
npm run dev
```

## Build + Start

```bash
npm run build
npm run start
```

## Tests

```bash
npm run test
npm run typecheck
```

## Railway

See `RAILWAY_DEPLOY.md`.
