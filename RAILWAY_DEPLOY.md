# Railway Deploy

## 1) Deploy local repo (no branch push needed)

```bash
railway login
railway link
railway up -s <service-name>
```

## 2) Configure service

- Build command: `npm install && npm run build`
- Start command: `npm run start`

## 3) Environment variables

Required:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `ANTHROPIC_API_KEY`

Optional:

- `PORT`
- `CORS_ORIGIN`
- `GENERATE_LIMIT_MAX`
- `GENERATE_LIMIT_WINDOW_MS`

## 4) Smoke tests

```bash
curl https://<railway-domain>/healthz
```

```bash
curl -i -X POST https://<railway-domain>/api/mobile/plans/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <SUPABASE_ACCESS_TOKEN>" \
  -d '{"duration_minutes":30,"effort":"medium","requested_tags":["technique"]}'
```
