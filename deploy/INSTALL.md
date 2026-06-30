# PEP Delivery Platform — Installation Guide

Complete guide for deploying the PEP Delivery Management System on a fresh cloud VPS.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Requirements](#2-requirements)
3. [VPS Setup](#3-vps-setup)
4. [Upload Application Files](#4-upload-application-files)
5. [Node.js Backend Setup](#5-nodejs-backend-setup)
6. [Python Optimiser Setup](#6-python-optimiser-setup)
7. [Valhalla Routing Engine](#7-valhalla-routing-engine)
8. [Nginx Reverse Proxy](#8-nginx-reverse-proxy)
9. [SSL Certificate (HTTPS)](#9-ssl-certificate-https)
10. [Environment Configuration](#10-environment-configuration)
11. [Start All Services](#11-start-all-services)
12. [Backups](#12-backups)
13. [Firewall](#13-firewall)
14. [Updating the App](#14-updating-the-app)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Architecture Overview

```
Internet
    │
    ▼
Nginx (ports 80 / 443)   ← SSL via Let's Encrypt
    │
    ├── /                → Static files (HTML / CSS / JS)
    │
    └── /api  /socket.io → Node.js on port 3000  (PM2)
                                │
                                ├── SQLite database  (server/data/pep_database.sqlite)
                                │
                                ├── Valhalla Docker  (port 8002)  ← road routing
                                │
                                └── Python OR-Tools  (port 8000)  ← route optimiser
```

### Components

| Component | Technology | Port |
|---|---|---|
| Frontend | Static HTML / CSS / JS (Leaflet maps) | — |
| Backend API | Node.js + Express + Socket.io | 3000 |
| Database | SQLite (file-based, no server needed) | — |
| Route Optimiser | Python + FastAPI + OR-Tools | 8000 |
| Routing Engine | Valhalla (Docker) | 8002 |
| Reverse Proxy | Nginx | 80 / 443 |

---

## 2. Requirements

### VPS Specifications

| Resource | Minimum | Recommended |
|---|---|---|
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| RAM | 4 GB | 8 GB |
| CPU | 2 cores | 4 cores |
| Storage | 20 GB | 40 GB |
| Network | 1 Gbps | 1 Gbps |

> **Why 8 GB RAM?** Valhalla needs ~2–3 GB to serve routing tiles. The Node.js server, Python optimiser, and OS need the rest. On 4 GB you may hit swap under heavy optimisation jobs.

### Recommended VPS Providers

| Provider | Plan | Monthly Cost |
|---|---|---|
| Hetzner | CX32 (4 vCPU, 8 GB RAM) | ~€8 |
| DigitalOcean | Basic 8 GB | ~$48 |
| Vultr | Regular 8 GB | ~$40 |

### Domain Name
You need a domain pointed at your VPS IP before setting up SSL.

### Software (installed during setup)
- Node.js 20+
- npm
- PM2
- Python 3.10+
- pip
- Docker + docker-compose
- Nginx
- Certbot

---

## 3. VPS Setup

SSH into your VPS as root or a sudo user.

### 3.1 Update System
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git unzip
```

### 3.2 Install Node.js 20
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # should print v20.x.x
```

### 3.3 Install PM2 (process manager)
```bash
sudo npm install -g pm2
```

### 3.4 Install Python 3 + pip
```bash
sudo apt install -y python3 python3-pip python3-venv
python3 --version   # should print 3.10+
```

### 3.5 Install Docker
```bash
sudo apt install -y docker.io docker-compose
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER
newgrp docker   # apply group change without logout
docker --version
```

### 3.6 Install Nginx
```bash
sudo apt install -y nginx
sudo systemctl enable nginx
```

### 3.7 Install Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
```

---

## 4. Upload Application Files

Run these commands **from your local Windows machine** (Git Bash or PowerShell).

### 4.1 Create App Directory on VPS
```bash
ssh user@your-vps-ip "sudo mkdir -p /var/www/deliveryapp && sudo chown \$USER:\$USER /var/www/deliveryapp"
```

### 4.2 Upload App Files (excluding node_modules and .env)
```bash
rsync -avP \
  --exclude='server/node_modules' \
  --exclude='server/.env' \
  --exclude='server/data' \
  "C:/laragon/www/deliveryapp/new/" \
  user@your-vps-ip:/var/www/deliveryapp/
```

### 4.3 Upload Valhalla Tiles (from your local PC)
```bash
# Create Valhalla directory on VPS first
ssh user@your-vps-ip "mkdir -p /var/www/valhalla/custom_files"

# Upload pre-built tiles (2.5 GB — resumable with -P flag)
rsync -avP "C:/valhalla-data/valhalla_tiles.tar" user@your-vps-ip:/var/www/valhalla/custom_files/
rsync -avP "C:/valhalla-data/valhalla.json"      user@your-vps-ip:/var/www/valhalla/custom_files/
```

> **Tip:** `rsync -P` resumes automatically if the connection drops. Just re-run the same command.

---

## 5. Node.js Backend Setup

SSH into your VPS for the remaining steps.

### 5.1 Install Dependencies
```bash
cd /var/www/deliveryapp/server
npm install --production
```

### 5.2 Create Environment File
```bash
cp .env.example .env
nano .env
```

Fill in the values (see [Section 10](#10-environment-configuration) for full reference):
```env
PORT=3000
HTTPS_ENABLED=false
ROUTING_BACKEND=valhalla
VALHALLA_URL=http://localhost:8002
ORS_API_KEY=your_ors_api_key_here
PYTHON_URL=http://localhost:8000
```

### 5.3 Run Database Migration
```bash
cd /var/www/deliveryapp/server
node migrate.js
```

### 5.4 Start with PM2
```bash
cd /var/www/deliveryapp/server
pm2 start server.js --name deliveryapp
pm2 save
pm2 startup   # follow the printed command to enable auto-start on reboot
```

### 5.5 Verify Node is Running
```bash
pm2 status
curl http://localhost:3000/api/health
```

---

## 6. Python Optimiser Setup

The Python service powers the OR-Tools route optimisation (Step 2 in Smart Order Grouping).

### 6.1 Create a Virtual Environment
```bash
cd /var/www/deliveryapp
python3 -m venv venv
source venv/bin/activate
```

### 6.2 Install Dependencies
```bash
pip install fastapi uvicorn ortools
```

### 6.3 Test It Manually
```bash
python3 optimise.py
# Should print: Uvicorn running on http://0.0.0.0:8000
# Press Ctrl+C to stop
```

### 6.4 Run with PM2
```bash
pm2 start "source /var/www/deliveryapp/venv/bin/activate && python3 /var/www/deliveryapp/optimise.py" \
  --name python-optimiser \
  --interpreter none
pm2 save
```

### 6.5 Verify Python Service
```bash
curl http://localhost:8000/health
```

---

## 7. Valhalla Routing Engine

Valhalla provides fast, free, offline road routing using OpenStreetMap data.

### 7.1 Extract Uploaded Tiles
```bash
cd /var/www/valhalla/custom_files
tar -xf valhalla_tiles.tar
ls valhalla_tiles/   # should show folders: 0/ 1/ 2/ 3/
```

### 7.2 Create docker-compose.yml
```bash
nano /var/www/valhalla/docker-compose.yml
```

Paste:
```yaml
version: '3'
services:
  valhalla:
    image: ghcr.io/gis-ops/docker-valhalla/valhalla:latest
    container_name: valhalla
    ports:
      - "8002:8002"
    volumes:
      - ./custom_files:/custom_files
    environment:
      - use_tiles_ignore_pbf=True
      - force_rebuild=False
      - build_elevation=False
      - build_admins=True
      - build_time_zones=True
      - server_threads=2
    restart: unless-stopped
```

> `use_tiles_ignore_pbf=True` tells Valhalla to use your pre-built tiles and skip the 40-minute rebuild.

### 7.3 Start Valhalla
```bash
cd /var/www/valhalla
docker-compose up -d
```

### 7.4 Monitor Startup
```bash
docker logs -f valhalla
# Wait for: "Valhalla started" — takes about 30 seconds with pre-built tiles
```

### 7.5 Verify Valhalla
```bash
curl http://localhost:8002/status
# Returns: {"version":"x.x.x","tileset_last_modified":...}
```

### 7.6 Keeping Map Data Fresh (optional)

Geofabrik releases updated GB map data weekly. To rebuild tiles monthly:
```bash
crontab -e
```
Add:
```
0 3 1 * * cd /var/www/valhalla && wget -q -O custom_files/great-britain-latest.osm.pbf https://download.geofabrik.de/europe/great-britain-latest.osm.pbf && docker-compose restart
```

---

## 8. Nginx Reverse Proxy

Nginx sits in front of everything — serves static files directly and proxies API + WebSocket traffic to Node.

### 8.1 Create Site Config
```bash
sudo nano /etc/nginx/sites-available/deliveryapp
```

Paste:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Static frontend files
    root /var/www/deliveryapp;
    index index.html;

    # Increase upload limit (for bulk imports)
    client_max_body_size 50m;

    # API proxy → Node.js
    location /api/ {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    # Socket.io WebSocket proxy
    location /socket.io/ {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host       $host;
        proxy_read_timeout 300s;
    }

    # Serve frontend routes (SPA fallback)
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 8.2 Enable Site
```bash
sudo ln -s /etc/nginx/sites-available/deliveryapp /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default   # remove default placeholder
sudo nginx -t                                  # test config — must say "ok"
sudo systemctl reload nginx
```

---

## 9. SSL Certificate (HTTPS)

### 9.1 Point Your Domain to the VPS
In your domain registrar's DNS settings, add an **A record**:
```
Type: A
Name: @  (or yourdomain.com)
Value: <your VPS IP>
TTL: 300
```
Also add for www:
```
Type: A
Name: www
Value: <your VPS IP>
TTL: 300
```
Wait 5–15 minutes for DNS to propagate, then verify:
```bash
ping yourdomain.com   # should resolve to your VPS IP
```

### 9.2 Issue Certificate
```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```
Follow the prompts. Certbot automatically updates your Nginx config for HTTPS and sets up auto-renewal.

### 9.3 Verify Auto-Renewal
```bash
sudo certbot renew --dry-run   # should succeed without errors
```

---

## 10. Environment Configuration

Full reference for `server/.env`:

```env
# ── Ports ────────────────────────────────────────────────────
PORT=3000               # HTTP port Node listens on
HTTPS_PORT=3443         # HTTPS port (only if HTTPS_ENABLED=true)

# ── HTTPS ────────────────────────────────────────────────────
# On a VPS, set this to false — Nginx handles SSL instead
HTTPS_ENABLED=false

# ── Routing Backend ──────────────────────────────────────────
# "valhalla"  — local Docker container (free, fast, offline)
# "ors"       — OpenRouteService cloud API (requires ORS_API_KEY)
ROUTING_BACKEND=valhalla

# ── Valhalla ─────────────────────────────────────────────────
VALHALLA_URL=http://localhost:8002

# ── OpenRouteService (fallback / alternative) ────────────────
# Free key at: https://openrouteservice.org/dev/#/signup
ORS_API_KEY=your_ors_api_key_here

# ── Python OR-Tools Optimiser ────────────────────────────────
PYTHON_URL=http://localhost:8000

# ── Warehouse Location ───────────────────────────────────────
# Used as the depot for route optimisation
SITE_LAT=51.5
SITE_LNG=-0.1
```

---

## 11. Start All Services

### Summary of Services

| Service | Command | Auto-start |
|---|---|---|
| Node.js backend | `pm2 start deliveryapp` | PM2 (on reboot) |
| Python optimiser | `pm2 start python-optimiser` | PM2 (on reboot) |
| Valhalla | `docker-compose up -d` | Docker restart policy |
| Nginx | `systemctl start nginx` | systemd |

### Check Everything is Running
```bash
pm2 status                    # Node + Python should show "online"
docker ps                     # Valhalla should show "Up"
sudo systemctl status nginx   # should show "active (running)"
curl http://localhost:3000/api/health
curl http://localhost:8000/health
curl http://localhost:8002/status
```

### Full Restart (after reboot)
Everything should start automatically. If needed:
```bash
pm2 resurrect                 # restore PM2 processes
cd /var/www/valhalla && docker-compose up -d
sudo systemctl start nginx
```

---

## 12. Backups

### 12.1 Automated Daily Database Backup
```bash
sudo mkdir -p /var/backups/deliveryapp
crontab -e
```
Add:
```
# Daily backup at 2am — keeps 30 days of history
0 2 * * * cp /var/www/deliveryapp/server/data/pep_database.sqlite /var/backups/deliveryapp/pep_$(date +\%Y\%m\%d).sqlite

# Delete backups older than 30 days
30 2 * * * find /var/backups/deliveryapp -name "*.sqlite" -mtime +30 -delete
```

### 12.2 Manual Backup
```bash
cp /var/www/deliveryapp/server/data/pep_database.sqlite \
   /var/backups/deliveryapp/pep_manual_$(date +%Y%m%d_%H%M%S).sqlite
```

### 12.3 Download Backup to Local PC
Run from your Windows machine:
```bash
scp user@your-vps-ip:/var/www/deliveryapp/server/data/pep_database.sqlite \
    "C:/backups/pep_database_$(date +%Y%m%d).sqlite"
```

---

## 13. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'   # ports 80 and 443
sudo ufw enable
sudo ufw status
```

> Ports 3000, 8000, and 8002 are **not** opened publicly — they are only accessed internally by Nginx and Node. This is intentional.

---

## 14. Updating the App

### 14.1 Upload New Files
```bash
# From your local machine
rsync -avP \
  --exclude='server/node_modules' \
  --exclude='server/.env' \
  --exclude='server/data' \
  "C:/laragon/www/deliveryapp/new/" \
  user@your-vps-ip:/var/www/deliveryapp/
```

### 14.2 Restart Node
```bash
ssh user@your-vps-ip "cd /var/www/deliveryapp/server && npm install --production && pm2 restart deliveryapp"
```

### 14.3 Restart Python (if optimise.py changed)
```bash
ssh user@your-vps-ip "pm2 restart python-optimiser"
```

---

## 15. Troubleshooting

### Node.js won't start
```bash
pm2 logs deliveryapp --lines 50
# Check for missing .env values or port conflicts
```

### Valhalla returns 503
```bash
docker logs valhalla --tail 50
# If tiles are missing: re-extract valhalla_tiles.tar
# If container crashed: docker-compose restart
```

### Python optimiser not responding
```bash
pm2 logs python-optimiser --lines 30
# Check that ortools is installed: pip show ortools
```

### WebSocket not connecting
```bash
# Check Nginx socket.io proxy block is present
sudo nginx -T | grep socket.io
# Check Node is listening
ss -tlnp | grep 3000
```

### 502 Bad Gateway from Nginx
```bash
# Node is probably down
pm2 status
pm2 restart deliveryapp
```

### Check all logs at once
```bash
pm2 logs              # Node + Python
docker logs valhalla  # Valhalla
sudo tail -f /var/log/nginx/error.log   # Nginx
```

---

## Quick Reference

```bash
# Start everything
pm2 resurrect && cd /var/www/valhalla && docker-compose up -d && sudo systemctl start nginx

# Stop everything
pm2 stop all && docker-compose -f /var/www/valhalla/docker-compose.yml down && sudo systemctl stop nginx

# View live logs
pm2 logs

# Restart Node only
pm2 restart deliveryapp

# Restart Python only
pm2 restart python-optimiser

# Restart Valhalla only
cd /var/www/valhalla && docker-compose restart

# Check status
pm2 status && docker ps && sudo systemctl status nginx
```
