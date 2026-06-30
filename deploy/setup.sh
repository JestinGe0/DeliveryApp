#!/bin/bash
# ============================================================
#  PEP Delivery Platform — VPS Setup Script
#  Run once on a fresh Ubuntu 22.04 VPS as root or sudo user.
#  Usage: bash setup.sh
# ============================================================

set -e   # stop on any error

echo ""
echo "============================================"
echo "  PEP Delivery Platform — Server Setup"
echo "============================================"
echo ""

# ── 1. System Update ─────────────────────────────────────────
echo "[1/8] Updating system packages..."
apt update -y && apt upgrade -y
apt install -y curl wget git unzip

# ── 2. Node.js 20 ────────────────────────────────────────────
echo "[2/8] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
echo "  Node: $(node --version)"
echo "  npm:  $(npm --version)"
npm install -g pm2

# ── 3. Python 3 ──────────────────────────────────────────────
echo "[3/8] Installing Python 3..."
apt install -y python3 python3-pip python3-venv
echo "  Python: $(python3 --version)"

# ── 4. Docker ────────────────────────────────────────────────
echo "[4/8] Installing Docker..."
apt install -y docker.io docker-compose
systemctl enable docker
systemctl start docker
usermod -aG docker "$SUDO_USER" 2>/dev/null || true
echo "  Docker: $(docker --version)"

# ── 5. Nginx + Certbot ───────────────────────────────────────
echo "[5/8] Installing Nginx and Certbot..."
apt install -y nginx certbot python3-certbot-nginx
systemctl enable nginx

# ── 6. App Directory ─────────────────────────────────────────
echo "[6/8] Creating app directories..."
mkdir -p /var/www/deliveryapp
mkdir -p /var/www/valhalla/custom_files
mkdir -p /var/backups/deliveryapp
echo "  Created: /var/www/deliveryapp"
echo "  Created: /var/www/valhalla/custom_files"
echo "  Created: /var/backups/deliveryapp"

# ── 7. Firewall ──────────────────────────────────────────────
echo "[7/8] Configuring firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw status

# ── 8. Backup Cron ───────────────────────────────────────────
echo "[8/8] Setting up daily database backup cron..."
(crontab -l 2>/dev/null; echo "0 2 * * * cp /var/www/deliveryapp/server/data/pep_database.sqlite /var/backups/deliveryapp/pep_\$(date +\%Y\%m\%d).sqlite") | crontab -
(crontab -l 2>/dev/null; echo "30 2 * * * find /var/backups/deliveryapp -name '*.sqlite' -mtime +30 -delete") | crontab -

echo ""
echo "============================================"
echo "  Setup complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Upload app files:       rsync -avP --exclude='server/node_modules' --exclude='server/data' --exclude='server/.env' <local_path>/ root@<vps_ip>:/var/www/deliveryapp/"
echo "  2. Upload Valhalla tiles:  rsync -avP <local_valhalla_tiles.tar> root@<vps_ip>:/var/www/valhalla/custom_files/"
echo "  3. Copy .env:              cp /var/www/deliveryapp/deploy/.env.production /var/www/deliveryapp/server/.env"
echo "     Then edit it:           nano /var/www/deliveryapp/server/.env"
echo "  4. Install Node deps:      cd /var/www/deliveryapp/server && npm install --production"
echo "  5. Install Python deps:    cd /var/www/deliveryapp && python3 -m venv venv && source venv/bin/activate && pip install fastapi uvicorn ortools"
echo "  6. Setup Nginx:            cp /var/www/deliveryapp/deploy/nginx.conf /etc/nginx/sites-available/deliveryapp"
echo "     Edit domain:            nano /etc/nginx/sites-available/deliveryapp"
echo "     Enable:                 ln -s /etc/nginx/sites-available/deliveryapp /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx"
echo "  7. SSL cert:               certbot --nginx -d yourdomain.com -d www.yourdomain.com"
echo "  8. Extract Valhalla tiles: cd /var/www/valhalla/custom_files && tar -xf valhalla_tiles.tar"
echo "  9. Start Valhalla:         cd /var/www/valhalla && docker-compose -f /var/www/deliveryapp/deploy/docker-compose.valhalla.yml up -d"
echo " 10. Start app:              cd /var/www/deliveryapp/server && pm2 start server.js --name deliveryapp && pm2 save && pm2 startup"
echo " 11. Start optimiser:        pm2 start 'source /var/www/deliveryapp/venv/bin/activate && python3 /var/www/deliveryapp/optimise.py' --name python-optimiser && pm2 save"
echo ""
echo "  See INSTALL.md for full details."
echo ""
