# Production observability and load readiness

The API stores privacy-safe request telemetry per store: request id, HTTP method, Fastify route pattern, status and latency. It never stores messages, request bodies, query strings, headers, cookies or IP addresses. Retention, successful-request sampling and alert thresholds are configured in **Quality & Analytics → Kondycja API**.

## Local verification (PowerShell)

```powershell
git switch develop
git pull --ff-only origin develop
docker compose build --no-cache migrate api worker app
docker compose up -d postgres migrate api worker
docker compose ps
Invoke-RestMethod http://localhost:3000/ready | ConvertTo-Json -Depth 6
docker compose run --rm app npm run load:test -- --target=health --url=http://api:3000 --requests=100 --concurrency=10
```

Chat mode can consume OpenAI quota and requires the store id twice:

```powershell
docker compose run --rm app npm run load:test -- --target=chat --url=http://api:3000 --store-id=nortberg --confirm=nortberg --requests=20 --concurrency=2 --message="Szukam okapu 60 cm"
```

Open `/admin`, select **Quality & Analytics → Kondycja API**, refresh and verify request volume, P95, routes and alerts.

## Production rules

- Start with 100% sampling during validation, then lower successful-request sampling if traffic volume demands it. Errors and chat requests remain recorded.
- Run load tests only against a controlled environment or maintenance window. Begin with concurrency 2–5.
- Alert evaluation starts only after the configured minimum request count.
- Treat sustained error-rate or P95 alerts as release blockers. Correlate the displayed request id with structured API logs.
- The worker purges telemetry hourly according to each store's retention policy.
