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

## Endpoint Test Helper

Edit `SCRIPT_DEFAULTS` near the top of [scripts/test_generate_endpoint.py](/Users/danielthompson/Documents/03_code/swimsetgenerator/scripts/test_generate_endpoint.py) to keep your usual endpoint, token, preset, tags, and regen attempt in the file itself.

You can authenticate in either of these ways:

- Set `token` directly with a Supabase user access token.
- Leave `token` empty and set `supabase_url`, `supabase_anon_key`, `email`, and `password` so the script signs in first and fetches the token automatically.

Then run:

```bash
python3 scripts/test_generate_endpoint.py
```

CLI flags still override the in-file defaults when needed:

```bash
python3 scripts/test_generate_endpoint.py \
  --base-url http://localhost:3000 \
  --supabase-url <SUPABASE_URL> \
  --supabase-anon-key <SUPABASE_ANON_KEY> \
  --email <TEST_USER_EMAIL> \
  --password <TEST_USER_PASSWORD> \
  --preset speed \
  --duration 25 \
  --effort hard \
  --tag speed \
  --tag sprints \
  --regen-attempt 1
```

Environment variable shortcuts:

- `PLAN_API_BASE_URL`
- `PLAN_TEST_TOKEN` or `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `PLAN_TEST_EMAIL`
- `PLAN_TEST_PASSWORD`

The script also auto-loads these values from the repo `.env` file if present.

## Railway

See `RAILWAY_DEPLOY.md`.
