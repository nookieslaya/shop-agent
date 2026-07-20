# Mikrus production deployment

Target: Ubuntu 24.04, 1 vCPU, 1 GiB RAM, application port `20137`. PostgreSQL is private to the Compose network and has no host port.

## First deployment

```bash
cd /opt/shop-agent
sh ops/production/bootstrap-env.sh
sh ops/production/deploy.sh
sh ops/production/create-owner.sh
sh ops/production/status.sh
```

The bootstrap prompts for the OpenAI key without echo, generates independent PostgreSQL and session secrets, writes `.env.production` with mode `600`, and refuses to overwrite an existing file.

## Update

```bash
cd /opt/shop-agent
sh ops/production/deploy.sh
```

Deployment stops on tracked local changes, performs only a fast-forward merge from `develop`, builds images, starts the private database, applies migrations before application writers, starts API/worker/backup and waits for `/ready`.

## Diagnostics

```bash
cd /opt/shop-agent
sh ops/production/status.sh
docker compose --env-file .env.production -f docker-compose.production.yml -p shop-agent logs --tail=100 api worker backup postgres
```

## Security and resource boundary

- Never expose PostgreSQL through a host port.
- Never commit, print or send `.env.production`.
- API is initially available as HTTP on the assigned Mikrus port. Do not embed it on a public HTTPS store until a trusted HTTPS endpoint is configured.
- Containers use bounded memory/CPU, rotated logs, dropped capabilities and `no-new-privileges`; application containers use a read-only filesystem.
- Database and backups use separate named volumes. Add encrypted off-host replication before commercial launch.
- With 1 GiB RAM, create swap before building if the host supports it and keep synchronization concurrency at `1`.
