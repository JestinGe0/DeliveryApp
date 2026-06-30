# Docker Deployment Guide

## Requirements

- [Docker](https://docs.docker.com/get-docker/) installed on the server
- Ports **3000** and **3443** open in your firewall
- A GitHub access token supplied by your vendor

---

## First-time setup

### 1. Log in to the image registry

Your vendor will give you a **GitHub access token** (read-only). Run this on your server:

```bash
echo "VENDOR_PROVIDED_TOKEN" | docker login ghcr.io -u VENDOR_PROVIDED_USERNAME --password-stdin
```

You only need to do this once per server.

### 2. Get the deployment files

Your vendor provides a `docker/` folder. Copy it to your server — this is the only folder you need.

### 3. Create your `.env` file

```bash
cd docker
cp .env.example .env
nano .env
```

Fill in:

| Variable | What to put |
|---|---|
| `JWT_SECRET` | Run `openssl rand -hex 48` — paste the output |
| `VENDOR_SECRET` | Your vendor will supply this |
| `ORS_API_KEY` | Your OpenRouteService API key (free at openrouteservice.org) |

### 4. Start the app

```bash
docker compose up -d
```

This pulls the image, generates a TLS certificate, and starts the server.

### 5. Open the app

```
https://YOUR-SERVER-IP:3443
```

The browser warns about a self-signed certificate — click **Advanced → Proceed**. The connection is encrypted.

---

## Updating to a new version

```bash
cd docker
docker compose pull
docker compose up -d
```

Your database, certificates, and settings are never touched — they live in the host folders below.

---

## Day-to-day commands

| Task | Command |
|---|---|
| Start | `docker compose up -d` |
| Stop | `docker compose down` |
| View logs | `docker compose logs -f` |
| Restart | `docker compose restart` |
| **Update** | `docker compose pull && docker compose up -d` |

---

## Persistent data

Stored on the host machine, never inside the container:

| Host path | Contains |
|---|---|
| `./data/pep_database.sqlite` | All delivery data |
| `./data/backups/` | Automatic backups |
| `./certs/` | TLS certificate + key |
| `./logs/` | Server logs |

**Back up `./data/` regularly.**

---

## Using a real SSL certificate (optional)

If you have a domain and a Let's Encrypt certificate:

1. Place files at `./certs/server.key` and `./certs/server.cert`
2. Add to `.env`:
   ```
   HTTPS_ENABLED=true
   SSL_KEY_PATH=/app/server/certs/server.key
   SSL_CERT_PATH=/app/server/certs/server.cert
   ```
3. Restart: `docker compose restart`

---

## Troubleshooting

**`denied: permission_denied` on pull**
Your token has expired or is invalid. Ask your vendor for a new one and re-run the `docker login` command.

**Container won't start — certificate error**
Delete `./certs/` and restart. The app regenerates the certificate automatically.

**App loads but login fails**
Check `JWT_SECRET` is set in `.env`, then run `docker compose restart`.

**Port already in use**
Edit `docker-compose.yml` and change the host-side port numbers (left of `:`).
