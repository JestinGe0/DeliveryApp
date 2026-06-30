require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { optimiseRoutes, checkPythonService } = require('./route-controller');
const { validateUser, validateCustomerCreate, validateCustomerUpdate, validateBulkCustomers, fail } = require('./validate');
const { hashPassword, verifyPassword, signToken, cookieOpts, requireAuth, requireRole, COOKIE_NAME } = require('./auth');
const emailService = require('./email');
const fetch = require('node-fetch')
const express = require('express');
const cookieParser = require('cookie-parser');
const http = require('http');
const https = require('https');
const socketIo = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const logger = require('./logger');

const app = express();

const HTTPS_ENABLED = process.env.HTTPS_ENABLED === 'true';
let server;
if (HTTPS_ENABLED) {
    const keyPath  = path.resolve(process.env.SSL_KEY_PATH  || path.join(__dirname, 'certs', 'server.key'));
    const certPath = path.resolve(process.env.SSL_CERT_PATH || path.join(__dirname, 'certs', 'server.cert'));
    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
        console.error('[HTTPS] Certificate files not found. Run generate-cert.bat first, then restart.');
        console.error('  Expected key:  ' + keyPath);
        console.error('  Expected cert: ' + certPath);
        process.exit(1);
    }
    server = https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, app);
    console.log('[HTTPS] Certificate loaded from ' + path.dirname(certPath));
} else {
    server = http.createServer(app);
}

// ========== CONSTANTS ==========
const ORDER_STATUSES = {
    PENDING: 'pending',
    PICKING: 'picking',
    READY_FOR_DELIVERY: 'ready_for_delivery',
    DELIVERING: 'delivering',
    DELIVERED: 'delivered',
    COLLECTED: 'collected',
    CANCELLED: 'cancelled'
};

const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        allowedHeaders: ["*"],
        credentials: true
    },
    // WebSocket first — skip the HTTP polling upgrade handshake
    // Cuts connection time from ~300ms to ~50ms on local network
    transports: ['websocket', 'polling'],
    // Tune keep-alive for local network (faster detection of dropped clients)
    pingTimeout: 10000,
    pingInterval: 5000,
    // Larger buffer so big payloads don't drop
    maxHttpBufferSize: 5e6
});

// Attach logger: patches console, registers /api/logs routes, logs all HTTP requests
logger.attach(app);

app.use(cookieParser());

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, '..')));
app.use(express.static(__dirname));

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'pep_database.sqlite');

// Create data directory if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// Initialize SQLite database
let db;

async function initializeDatabase() {
    db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
    });

    // SQLite performance settings — dramatically speeds up writes
    await db.run('PRAGMA journal_mode = WAL');       // Write-Ahead Log: concurrent reads+writes
    await db.run('PRAGMA synchronous = NORMAL');     // Faster than FULL, safe with WAL
    await db.run('PRAGMA cache_size = -32000');      // 32MB page cache
    await db.run('PRAGMA temp_store = MEMORY');      // Temp tables in RAM
    await db.run('PRAGMA mmap_size = 268435456');    // 256MB memory-mapped I/O

    // Create tables if they don't exist
    await db.exec(`
        -- Users / Auth table
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'staff',
            staff_type TEXT DEFAULT 'picker',
            full_name TEXT,
            active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Customers table
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            address TEXT,
            postcode TEXT,
            latitude REAL,
            longitude REAL,
            zone TEXT,
            road_distance REAL,
            road_duration REAL,
            original_data TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Customer passports table
        CREATE TABLE IF NOT EXISTS customer_passports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            passport_data TEXT NOT NULL,
            version INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (customer_id) REFERENCES customers(id),
            UNIQUE(customer_id)
        );

        -- Orders table
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            order_number TEXT,
            status TEXT,
            assigned_van INTEGER,
            assigned_day INTEGER,
            delivery_order INTEGER,
            assigned_staff TEXT,
            assigned_driver INTEGER,
            zone TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (customer_id) REFERENCES customers(id)
        );

        -- Staff table
        CREATE TABLE IF NOT EXISTS staff (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            staff_id INTEGER NOT NULL UNIQUE,
            name TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            role TEXT,
            type TEXT,
            shift TEXT,
            license TEXT,
            vehicle_preference TEXT,
            total_picks INTEGER DEFAULT 0,
            total_deliveries INTEGER DEFAULT 0,
            notes TEXT,
            active_orders INTEGER DEFAULT 0,
            staff_data TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Delivery plans table
        CREATE TABLE IF NOT EXISTS delivery_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            van_id INTEGER NOT NULL,
            day_id INTEGER NOT NULL,
            customer_ids TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(van_id, day_id)
        );

        -- Picking metrics table (for analytics)
        CREATE TABLE IF NOT EXISTS picking_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            customer_id INTEGER NOT NULL,
            time_to_first_picker INTEGER,
            picking_duration INTEGER,
            efficiency_score INTEGER,
            number_of_pickers INTEGER,
            picker_names TEXT,
            plants_per_hour REAL,
            plants_per_picker TEXT,
            timestamp_first_picker DATETIME,
            timestamp_picking_started DATETIME,
            timestamp_picking_completed DATETIME,
            timestamp_ready_for_delivery DATETIME,
            timestamp_delivered DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (order_id) REFERENCES orders(id),
            FOREIGN KEY (customer_id) REFERENCES customers(id)
        );

        -- Card states table
        CREATE TABLE IF NOT EXISTS card_states (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            card_type TEXT NOT NULL,
            card_id TEXT NOT NULL,
            is_expanded BOOLEAN DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(card_type, card_id)
        );

        -- System settings table
        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- API Connections table (external nursery software integrations)
        CREATE TABLE IF NOT EXISTS api_connections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            base_url TEXT NOT NULL,
            endpoint TEXT NOT NULL DEFAULT '/',
            auth_type TEXT NOT NULL DEFAULT 'none',
            auth_config TEXT,
            extra_headers TEXT,
            response_path TEXT,
            enabled INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- API Field Mappings (maps external JSON fields to internal fields)
        CREATE TABLE IF NOT EXISTS api_field_mappings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            connection_id INTEGER NOT NULL,
            external_field TEXT NOT NULL,
            internal_field TEXT NOT NULL,
            transform TEXT,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (connection_id) REFERENCES api_connections(id) ON DELETE CASCADE
        );

        -- API Import Staging (fetched records awaiting confirmation)
        CREATE TABLE IF NOT EXISTS api_import_staging (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            connection_id INTEGER NOT NULL,
            raw_data TEXT NOT NULL,
            mapped_data TEXT NOT NULL,
            assigned_day INTEGER,
            assigned_van INTEGER,
            assigned_driver INTEGER,
            is_collection INTEGER DEFAULT 0,
            passport_data TEXT,
            status TEXT DEFAULT 'staged',
            import_batch TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Create indexes for better performance
        CREATE INDEX IF NOT EXISTS idx_customers_customer_id ON customers(customer_id);
        CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
        CREATE INDEX IF NOT EXISTS idx_picking_metrics_customer_id ON picking_metrics(customer_id);
        CREATE INDEX IF NOT EXISTS idx_picking_metrics_timestamps ON picking_metrics(timestamp_ready_for_delivery);
        CREATE INDEX IF NOT EXISTS idx_api_field_mappings_conn ON api_field_mappings(connection_id);
        CREATE INDEX IF NOT EXISTS idx_api_staging_status ON api_import_staging(status);
    `);

    // Schema migrations — safe to run on existing databases
    try { await db.run(`ALTER TABLE orders ADD COLUMN bay_number TEXT`); } catch(e) {}
    try { await db.run(`ALTER TABLE orders ADD COLUMN bay_overflow TEXT`); } catch(e) {}
    await db.run(`CREATE TABLE IF NOT EXISTS audit_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP,
        username    TEXT,
        user_id     INTEGER,
        action      TEXT NOT NULL,
        entity_type TEXT,
        entity_id   TEXT,
        entity_name TEXT,
        details     TEXT,
        ip          TEXT
    )`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_audit_action    ON audit_log(action)`);
    try { await db.run(`ALTER TABLE customers ADD COLUMN email TEXT`); } catch(e) {}
    try { await db.run(`ALTER TABLE orders    ADD COLUMN email_sent TEXT`); } catch(e) {}

    // Seed default users if none exist
    const userCount = await db.get('SELECT COUNT(*) as count FROM users');
    if (userCount.count === 0) {
        await db.exec(`
            INSERT INTO users (username, password, role, staff_type, full_name) VALUES
            ('admin',    'admin123',   'admin',   NULL,     'Administrator'),
            ('manager1', 'manager123', 'manager', NULL,     'Site Manager'),
            ('picker1',  'picker123',  'staff',   'picker', 'Alice Picker'),
            ('driver1',  'driver123',  'staff',   'driver', 'Bob Driver'),
            ('staff1',   'staff123',   'staff',   'staff',  'Carol Staff');
        `);
        console.log('✅ Default users seeded');
    }

    console.log('✅ Database initialized successfully');
}

// Call database initialization
initializeDatabase().then(loadEmailConfig).catch(console.error);

async function getEmailNotifyConfig() {
    const rows = await db.all(`SELECT key, value FROM system_settings WHERE key IN (
        'config.emailNotifyOutForDelivery','config.emailNotifyDelivered','config.emailNotifyDriverAssigned')`);
    const m = {};
    rows.forEach(r => { m[r.key] = r.value; });
    return {
        notifyOutForDelivery:  m['config.emailNotifyOutForDelivery']  !== 'false',
        notifyDelivered:       m['config.emailNotifyDelivered']        !== 'false',
        notifyDriverAssigned:  m['config.emailNotifyDriverAssigned']   !== 'false',
    };
}

async function getCompanyName() {
    const row = await db.get(`SELECT value FROM system_settings WHERE key = 'config.companyName'`);
    return row?.value || 'Delivery';
}

async function loadEmailConfig() {
    if (!db) return;
    const keys = ['smtpHost','smtpPort','smtpUser','smtpPass','smtpFrom',
                  'emailNotifyOutForDelivery','emailNotifyDelivered','emailNotifyDriverAssigned'];
    const rows = await db.all(
        `SELECT key, value FROM system_settings WHERE key IN (${keys.map(() => '?').join(',')})`,
        keys.map(k => 'config.' + k)
    );
    const cfg = {};
    rows.forEach(r => { cfg[r.key.replace('config.', '')] = r.value; });
    emailService.init(cfg);
}

// ========== PLAN DEFINITIONS ==========
const PLANS = {
    free:       { name: 'Free',       maxCustomers:  10, maxUsers:  2, maxVans: 1 },
    starter:    { name: 'Starter',    maxCustomers:  50, maxUsers:  5, maxVans: 3 },
    pro:        { name: 'Pro',        maxCustomers: 200, maxUsers: 15, maxVans: 8 },
    enterprise: { name: 'Enterprise', maxCustomers: null, maxUsers: null, maxVans: null },
};

async function getActivePlan() {
    if (!db) return { key: 'free', ...PLANS.free };
    const row = await db.get("SELECT value FROM system_settings WHERE key = 'subscription_plan'");
    const key = (row?.value || 'free').toLowerCase();
    return { key, ...(PLANS[key] || PLANS.free) };
}

async function checkLimit(limitKey) {
    const plan = await getActivePlan();
    const max = plan[limitKey];
    if (max === null) return null; // unlimited
    let count = 0;
    if (limitKey === 'maxCustomers') {
        count = (await db.get('SELECT COUNT(*) as c FROM customers')).c;
    } else if (limitKey === 'maxUsers') {
        count = (await db.get('SELECT COUNT(*) as c FROM users WHERE active = 1')).c;
    } else if (limitKey === 'maxVans') {
        const row = await db.get("SELECT value FROM system_settings WHERE key = 'config.vans'");
        count = row ? JSON.parse(row.value).length : 1;
    }
    if (count >= max) return { exceeded: true, current: count, max, plan: plan.name };
    return null;
}

// ========== AUDIT LOGGING ==========
function audit(req, action, entityType, entityId, entityName, details) {
    if (!db) return;
    const username = req?.user?.username || 'system';
    const userId   = req?.user?.id       || null;
    const ip       = req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || null;
    const detailsStr = details ? JSON.stringify(details) : null;
    db.run(
        `INSERT INTO audit_log (username, user_id, action, entity_type, entity_id, entity_name, details, ip)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [username, userId, action, entityType || null, entityId ? String(entityId) : null, entityName || null, detailsStr, ip]
    ).catch(err => console.error('[audit]', err.message));
}

// ========== AUTH ENDPOINTS ==========

// POST /api/login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password required' });
        }
        const user = await db.get(
            'SELECT id, username, password, role, staff_type, full_name, active FROM users WHERE username = ?',
            [username.trim().toLowerCase()]
        );
        if (!user || !(await verifyPassword(password, user.password))) {
            // Log the failed attempt — attach username manually since req.user is not set
            req.user = { id: null, username: username.trim().toLowerCase() };
            audit(req, 'auth.login_failed', 'user', null, username.trim().toLowerCase(), { reason: 'bad credentials' });
            return res.status(401).json({ success: false, message: 'Invalid username or password' });
        }
        if (!user.active) {
            req.user = { id: user.id, username: user.username };
            audit(req, 'auth.login_failed', 'user', user.id, user.username, { reason: 'account disabled' });
            return res.status(403).json({ success: false, message: 'Account is disabled' });
        }
        // Migrate plain-text password to bcrypt on first successful login
        if (!user.password.startsWith('$2')) {
            const hashed = await hashPassword(password);
            await db.run('UPDATE users SET password = ? WHERE id = ?', [hashed, user.id]);
        }
        const token = signToken(user);
        res.cookie(COOKIE_NAME, token, cookieOpts());
        // Manually set req.user so audit() can read it before middleware runs
        req.user = { id: user.id, username: user.username };
        audit(req, 'auth.login', 'user', user.id, user.username);
        res.json({
            success: true,
            user: { id: user.id, username: user.username, role: user.role, staffType: user.staff_type, fullName: user.full_name }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/me — verify session, return current user (called on page load)
app.get('/api/me', requireAuth, (req, res) => {
    res.json({
        success: true,
        user: { id: req.user.id, username: req.user.username, role: req.user.role, staffType: req.user.staffType, fullName: req.user.fullName }
    });
});

// POST /api/logout
app.post('/api/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME);
    res.json({ success: true });
});

// ========== SETUP / ONBOARDING ENDPOINTS (no auth required) ==========

// GET /api/setup/status — is onboarding complete?
app.get('/api/setup/status', async (req, res) => {
    try {
        const row = await db.get("SELECT value FROM system_settings WHERE key = 'onboarding_complete'");
        res.json({ complete: !!(row && row.value === 'true') });
    } catch (err) {
        res.json({ complete: false });
    }
});

// POST /api/setup/complete — save company config + create first admin user
app.post('/api/setup/complete', async (req, res) => {
    try {
        // Block if already completed
        const done = await db.get("SELECT value FROM system_settings WHERE key = 'onboarding_complete'");
        if (done && done.value === 'true') {
            return res.status(403).json({ success: false, message: 'Setup already completed' });
        }

        const { company, admin } = req.body;

        // Validate
        if (!company?.name) return res.status(400).json({ success: false, message: 'Company name is required' });
        if (!admin?.username || !admin?.password) return res.status(400).json({ success: false, message: 'Admin username and password are required' });
        if (admin.password.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });

        // Save company config
        const configEntries = {
            companyName:      company.name,
            companyTagline:   company.tagline || 'Delivery Management',
            warehouseName:    company.warehouseName || company.name,
            warehouseAddress: company.warehouseAddress || '',
            warehouseLat:     company.lat || 51.5,
            warehouseLng:     company.lng || -0.1,
            mapDefaultLat:    company.lat || 51.5,
            mapDefaultLng:    company.lng || -0.1,
            mapDefaultZoom:   7,
            localZoneRadius:  20,
            mapStyle:         'streets',
            activeDays:       JSON.stringify([1,2,3,4,5,6,7]),
            timeFormat:       '24',
            stopTime:         15,
        };
        for (const [key, value] of Object.entries(configEntries)) {
            const dbVal = typeof value === 'string' ? value : JSON.stringify(value);
            await db.run(
                `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP`,
                ['config.' + key, dbVal, dbVal]
            );
        }

        // Save logo if provided
        if (company.logo) {
            await db.run(
                `INSERT INTO system_settings (key, value, updated_at) VALUES ('config.companyLogo', ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP`,
                [company.logo, company.logo]
            );
        }

        // Delete the seeded default users and create real admin
        await db.run("DELETE FROM users");
        const hashed = await hashPassword(admin.password);
        await db.run(
            'INSERT INTO users (username, password, role, full_name, active) VALUES (?, ?, ?, ?, 1)',
            [admin.username.trim().toLowerCase(), hashed, 'admin', admin.fullName || admin.username]
        );

        // Mark onboarding complete
        await db.run(
            `INSERT INTO system_settings (key, value, updated_at) VALUES ('onboarding_complete', 'true', CURRENT_TIMESTAMP)
             ON CONFLICT(key) DO UPDATE SET value = 'true', updated_at = CURRENT_TIMESTAMP`
        );

        res.json({ success: true });
    } catch (err) {
        console.error('Setup error:', err);
        res.status(500).json({ success: false, message: 'Server error during setup' });
    }
});

// POST /api/setup/import-csv — import customers during onboarding (no auth)
app.post('/api/setup/import-csv', async (req, res) => {
    try {
        const done = await db.get("SELECT value FROM system_settings WHERE key = 'onboarding_complete'");
        if (done && done.value === 'true') {
            return res.status(403).json({ success: false, message: 'Use the main import endpoint after setup' });
        }
        const { customers: rows } = req.body;
        if (!Array.isArray(rows) || rows.length === 0) {
            return res.json({ success: true, count: 0 });
        }
        let imported = 0;
        for (const row of rows) {
            if (!row.name) continue;
            await db.run(
                `INSERT INTO customers (customer_id, name, address, postcode, lat, lng, zone, assigned_day, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
                [
                    'C' + Date.now() + Math.random().toString(36).slice(2, 6),
                    row.name, row.address || '', row.postcode || '',
                    parseFloat(row.lat) || 0, parseFloat(row.lng) || 0,
                    row.zone || 'Local',
                    row.day ? parseInt(row.day) : null
                ]
            );
            imported++;
        }
        audit(req, 'customer.import_csv', 'customer', null, null, { imported, source: 'onboarding' });
        res.json({ success: true, count: imported });
    } catch (err) {
        console.error('CSV import error:', err);
        res.status(500).json({ success: false, message: 'Import failed' });
    }
});

// ── Vendor-only plan management (no JWT — protected by VENDOR_SECRET header) ──
const VENDOR_SECRET = process.env.VENDOR_SECRET || null;

app.put('/api/plan', async (req, res) => {
    const provided = req.headers['x-vendor-secret'];
    if (!VENDOR_SECRET) return res.status(503).json({ success: false, message: 'VENDOR_SECRET not configured on this server' });
    if (!provided || provided !== VENDOR_SECRET) return res.status(401).json({ success: false, message: 'Invalid vendor secret' });
    try {
        const { planKey } = req.body;
        if (!PLANS[planKey]) return res.status(400).json({ success: false, message: `Unknown plan. Valid: ${Object.keys(PLANS).join(', ')}` });
        await db.run(
            `INSERT INTO system_settings (key, value, updated_at) VALUES ('subscription_plan', ?, CURRENT_TIMESTAMP)
             ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP`,
            [planKey, planKey]
        );
        req.user = { id: null, username: 'vendor' };
        audit(req, 'config.update', 'system', null, 'Subscription Plan', { plan: planKey });
        res.json({ success: true, plan: { key: planKey, ...PLANS[planKey] } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── All routes below this line require a valid login ──────────────────────────
app.use('/api', requireAuth);

// GET /api/users  (admin only)
app.get('/api/users', async (req, res) => {
    try {
        const users = await db.all('SELECT id, username, role, staff_type, full_name, active FROM users ORDER BY role, username');
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/users  (create user)
app.post('/api/users', async (req, res) => {
    try {
        const { username, password, role, staffType, fullName } = req.body;
        const errs = validateUser(req.body, false);
        if (errs.length) return fail(res, errs);
        const userLimit = await checkLimit('maxUsers');
        if (userLimit) return res.status(403).json({ success: false, message: `User limit reached (${userLimit.current}/${userLimit.max} on ${userLimit.plan} plan)`, limitExceeded: 'maxUsers' });
        const hashed = await hashPassword(password);
        await db.run(
            'INSERT INTO users (username, password, role, staff_type, full_name) VALUES (?, ?, ?, ?, ?)',
            [username.trim().toLowerCase(), hashed, role, staffType || null, fullName || username]
        );
        audit(req, 'user.create', 'user', null, username.trim().toLowerCase(), { role, staffType, fullName });
        res.json({ success: true });
    } catch (err) {
        if (err.message && err.message.includes('UNIQUE')) {
            return res.status(409).json({ success: false, message: 'Username already exists' });
        }
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// PUT /api/users/:id  (update user)
app.put('/api/users/:id', async (req, res) => {
    try {
        const errs = validateUser(req.body, true);
        if (errs.length) return fail(res, errs);
        const { password, role, staffType, fullName, active } = req.body;
        const hashedPw = password ? await hashPassword(password) : null;
        await db.run(
            `UPDATE users SET
                password   = COALESCE(?, password),
                role       = COALESCE(?, role),
                staff_type = ?,
                full_name  = COALESCE(?, full_name),
                active     = COALESCE(?, active)
             WHERE id = ?`,
            [hashedPw, role || null, staffType ?? null, fullName || null, active ?? null, req.params.id]
        );
        const changes = {};
        if (password)      changes.password  = '(changed)';
        if (role)          changes.role      = role;
        if (fullName)      changes.fullName  = fullName;
        if (active != null) changes.active   = active;
        audit(req, 'user.update', 'user', req.params.id, fullName || req.params.id, changes);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// DELETE /api/users/:id
app.delete('/api/users/:id', async (req, res) => {
    try {
        const target = await db.get('SELECT username FROM users WHERE id = ?', [req.params.id]);
        await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
        audit(req, 'user.delete', 'user', req.params.id, target?.username);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Helper function to get current timestamp
function getCurrentTimestamp() {
    return new Date().toISOString();
}

// ========== DATABASE OPERATIONS ==========

// Save or update customer
async function saveCustomerToDB(customerData) {
    try {
        // Check if customer exists
        const existing = await db.get(
            'SELECT id FROM customers WHERE customer_id = ?',
            [customerData.id]
        );

        const customerJSON = JSON.stringify(customerData.originalData || {});

        if (existing) {
            // Update existing customer — COALESCE preserves existing values when
            // slim payloads (quickSaveCustomer) omit identity fields like name/address
            await db.run(
                'UPDATE customers SET' +
                '  name = COALESCE(?, name),' +
                '  address = COALESCE(?, address),' +
                '  postcode = COALESCE(?, postcode),' +
                '  latitude = COALESCE(?, latitude),' +
                '  longitude = COALESCE(?, longitude),' +
                '  zone = COALESCE(?, zone),' +
                '  road_distance = COALESCE(?, road_distance),' +
                '  road_duration = COALESCE(?, road_duration),' +
                '  original_data = COALESCE(?, original_data),' +
                '  updated_at = CURRENT_TIMESTAMP' +
                ' WHERE customer_id = ?',
                [
                    customerData.name        || null,
                    customerData.address     || null,
                    customerData.postcode    || null,
                    customerData.lat         != null ? customerData.lat : null,
                    customerData.lng         != null ? customerData.lng : null,
                    customerData.zone        || null,
                    customerData.roadDistanceFromSite != null ? customerData.roadDistanceFromSite : null,
                    customerData.roadDurationFromSite != null ? customerData.roadDurationFromSite : null,
                    (customerJSON && customerJSON !== '{}') ? customerJSON : null,
                    customerData.id
                ]
            );
        } else {
            // Insert new customer
            await db.run(`
                INSERT INTO customers 
                (customer_id, name, address, postcode, latitude, longitude, zone, 
                 road_distance, road_duration, original_data)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                customerData.id,
                customerData.name,
                customerData.address,
                customerData.postcode,
                customerData.lat,
                customerData.lng,
                customerData.zone,
                customerData.roadDistanceFromSite,
                customerData.roadDurationFromSite,
                customerJSON
            ]);
        }

        // Save passport data if exists
        if (customerData.passport) {
            await savePassportToDB(customerData.id, customerData.passport);
        }

        // Save order data
        await saveOrderToDB(customerData);

        return true;
    } catch (error) {
        console.error('Error saving customer to DB:', error);
        return false;
    }
}

// Save passport data
async function savePassportToDB(customerId, passportData) {
    try {
        const existing = await db.get(
            'SELECT id FROM customer_passports WHERE customer_id = ?',
            [customerId]
        );

        const passportJSON = JSON.stringify(passportData);

        if (existing) {
            await db.run(`
                UPDATE customer_passports
                SET passport_data = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
                WHERE customer_id = ?
            `, [passportJSON, customerId]);
        } else {
            await db.run(`
                INSERT INTO customer_passports (customer_id, passport_data)
                VALUES (?, ?)
            `, [customerId, passportJSON]);
        }

        return true;
    } catch (error) {
        console.error('Error saving passport to DB:', error);
        return false;
    }
}

// Save order data
async function saveOrderToDB(customerData) {
    try {
        const orderNumber = customerData.passport?.orderNumber || `ORD-${customerData.id}`;
        const assignedStaff = JSON.stringify(customerData.assignedStaff || []);
        
        const existing = await db.get(
            'SELECT id FROM orders WHERE customer_id = ?',
            [customerData.id]
        );

        const bayOverflowJSON = customerData.bayOverflow ? JSON.stringify(customerData.bayOverflow) : null;

        if (existing) {
            await db.run(`
                UPDATE orders
                SET order_number = ?, status = ?, assigned_van = ?, assigned_day = ?,
                    delivery_order = ?, assigned_staff = ?, assigned_driver = ?, zone = ?,
                    bay_number = ?, bay_overflow = ?, updated_at = CURRENT_TIMESTAMP
                WHERE customer_id = ?
            `, [
                orderNumber,
                customerData.status,
                customerData.assignedVan,
                customerData.assignedDay,
                customerData.deliveryOrder || 0,
                assignedStaff,
                customerData.assignedDriver,
                customerData.zone,
                customerData.bayNumber || null,
                bayOverflowJSON,
                customerData.id
            ]);
        } else {
            await db.run(`
                INSERT INTO orders
                (customer_id, order_number, status, assigned_van, assigned_day,
                 delivery_order, assigned_staff, assigned_driver, zone, bay_number, bay_overflow)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                customerData.id,
                orderNumber,
                customerData.status,
                customerData.assignedVan,
                customerData.assignedDay,
                customerData.deliveryOrder || 0,
                assignedStaff,
                customerData.assignedDriver,
                customerData.zone,
                customerData.bayNumber || null,
                bayOverflowJSON
            ]);
        }

        // Save picking metrics if available
        if (customerData.passport?.pickingMetrics) {
            await savePickingMetricsToDB(customerData);
        }

        return true;
    } catch (error) {
        console.error('Error saving order to DB:', error);
        return false;
    }
}

// Save picking metrics
// Save picking metrics
async function savePickingMetricsToDB(customerData) {
    try {
        const metrics = customerData.passport.pickingMetrics;
        const timestamps = customerData.passport.timestamps || {};

        // Get order ID
        const order = await db.get(
            'SELECT id FROM orders WHERE customer_id = ?',
            [customerData.id]
        );

        if (!order) return false;

        const existing = await db.get(
            'SELECT id FROM picking_metrics WHERE order_id = ?',
            [order.id]
        );

        const metricsData = [
            order.id,
            customerData.id,
            metrics.timeToFirstPicker || 0,
            metrics.pickingDuration || 0,
            metrics.efficiencyScore || 0,
            metrics.numberOfPickers || 0,
            JSON.stringify(metrics.pickerNames || []),
            metrics.plantsPerHour || 0,
            JSON.stringify(metrics.plantsPerPicker || {}),
            timestamps.firstPickerAssigned,
            timestamps.pickingStarted,
            timestamps.pickingCompleted,
            timestamps.readyForDelivery,
            timestamps.deliveredAt
        ];

        if (existing) {
            // Remove updated_at from the query since the column doesn't exist
            await db.run(`
                UPDATE picking_metrics 
                SET time_to_first_picker = ?, picking_duration = ?, efficiency_score = ?,
                    number_of_pickers = ?, picker_names = ?, plants_per_hour = ?,
                    plants_per_picker = ?, timestamp_first_picker = ?,
                    timestamp_picking_started = ?, timestamp_picking_completed = ?,
                    timestamp_ready_for_delivery = ?, timestamp_delivered = ?
                WHERE order_id = ?
            `, [...metricsData.slice(2), order.id]);
        } else {
            await db.run(`
                INSERT INTO picking_metrics 
                (order_id, customer_id, time_to_first_picker, picking_duration, 
                 efficiency_score, number_of_pickers, picker_names, plants_per_hour,
                 plants_per_picker, timestamp_first_picker, timestamp_picking_started,
                 timestamp_picking_completed, timestamp_ready_for_delivery, timestamp_delivered)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, metricsData);
        }

        return true;
    } catch (error) {
        console.error('Error saving picking metrics to DB:', error);
        return false;
    }
}

// Save staff member
async function saveStaffToDB(staffData) {
    try {
        const staffJSON = JSON.stringify(staffData);
        
        const existing = await db.get(
            'SELECT id FROM staff WHERE staff_id = ?',
            [staffData.id]
        );

        if (existing) {
            await db.run(`
                UPDATE staff 
                SET name = ?, email = ?, phone = ?, role = ?, type = ?, shift = ?,
                    license = ?, vehicle_preference = ?, total_picks = ?,
                    total_deliveries = ?, notes = ?, active_orders = ?, staff_data = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE staff_id = ?
            `, [
                staffData.name,
                staffData.email,
                staffData.phone || '',
                staffData.role || '',
                staffData.type || 'picker',
                staffData.shift || 'Morning',
                staffData.license || '',
                staffData.vehiclePreference || '',
                staffData.totalPicks || 0,
                staffData.totalDeliveries || 0,
                staffData.notes || '',
                staffData.activeOrders || 0,
                staffJSON,
                staffData.id
            ]);
        } else {
            await db.run(`
                INSERT INTO staff 
                (staff_id, name, email, phone, role, type, shift, license,
                 vehicle_preference, total_picks, total_deliveries, notes, 
                 active_orders, staff_data)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                staffData.id,
                staffData.name,
                staffData.email,
                staffData.phone || '',
                staffData.role || '',
                staffData.type || 'picker',
                staffData.shift || 'Morning',
                staffData.license || '',
                staffData.vehiclePreference || '',
                staffData.totalPicks || 0,
                staffData.totalDeliveries || 0,
                staffData.notes || '',
                staffData.activeOrders || 0,
                staffJSON
            ]);
        }

        return true;
    } catch (error) {
        console.error('Error saving staff to DB:', error);
        return false;
    }
}

// Save delivery plan
async function saveDeliveryPlanToDB(planData) {
    try {
        for (const [vanId, days] of Object.entries(planData)) {
            for (const [dayId, customerIds] of Object.entries(days)) {
                const existing = await db.get(
                    'SELECT id FROM delivery_plans WHERE van_id = ? AND day_id = ?',
                    [parseInt(vanId), parseInt(dayId)]
                );

                const customerIdsJSON = JSON.stringify(customerIds);

                if (existing) {
                    await db.run(`
                        UPDATE delivery_plans 
                        SET customer_ids = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE van_id = ? AND day_id = ?
                    `, [customerIdsJSON, parseInt(vanId), parseInt(dayId)]);
                } else {
                    await db.run(`
                        INSERT INTO delivery_plans (van_id, day_id, customer_ids)
                        VALUES (?, ?, ?)
                    `, [parseInt(vanId), parseInt(dayId), customerIdsJSON]);
                }
            }
        }
        return true;
    } catch (error) {
        console.error('Error saving delivery plan to DB:', error);
        return false;
    }
}

// Save card state
async function saveCardStateToDB(cardType, cardId, isExpanded) {
    try {
        await db.run(`
            INSERT INTO card_states (card_type, card_id, is_expanded, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(card_type, card_id) 
            DO UPDATE SET is_expanded = ?, updated_at = CURRENT_TIMESTAMP
        `, [cardType, cardId, isExpanded ? 1 : 0, isExpanded ? 1 : 0]);

        return true;
    } catch (error) {
        console.error('Error saving card state to DB:', error);
        return false;
    }
}

// Load all customers from DB
async function loadAllCustomersFromDB() {
    try {
        const customers = await db.all(`
            SELECT c.*, cp.passport_data, o.status, o.assigned_van, o.assigned_day,
                   o.delivery_order, o.assigned_staff, o.assigned_driver, o.bay_number,
                   o.bay_overflow, o.zone as order_zone
            FROM customers c
            LEFT JOIN customer_passports cp ON c.customer_id = cp.customer_id
            LEFT JOIN orders o ON c.customer_id = o.customer_id
            ORDER BY c.customer_id
        `);

        return customers.map(row => {
            const customer = {
                id: row.customer_id,
                name: row.name,
                address: row.address,
                postcode: row.postcode,
                lat: row.latitude,
                lng: row.longitude,
                roadDistanceFromSite: row.road_distance || 0,
                roadDurationFromSite: row.road_duration || 0,
                status: row.status || ORDER_STATUSES.PENDING,
                assignedVan: row.assigned_van,
                assignedDay: row.assigned_day,
                deliveryOrder: row.delivery_order || 0,
                assignedStaff: row.assigned_staff ? JSON.parse(row.assigned_staff) : [],
                assignedDriver: row.assigned_driver,
                bayNumber: row.bay_number || null,
                bayOverflow: row.bay_overflow ? JSON.parse(row.bay_overflow) : null,
                zone: row.order_zone || row.zone || 'Local',
                passport: row.passport_data ? JSON.parse(row.passport_data) : null,
                originalData: row.original_data ? JSON.parse(row.original_data) : {}
            };
            return customer;
        });
    } catch (error) {
        console.error('Error loading customers from DB:', error);
        return [];
    }
}

// Load all staff from DB
async function loadAllStaffFromDB() {
    try {
        const staff = await db.all(`
            SELECT * FROM staff ORDER BY staff_id
        `);

        return staff.map(row => ({
            id: row.staff_id,
            name: row.name,
            email: row.email,
            phone: row.phone,
            role: row.role,
            type: row.type,
            shift: row.shift,
            license: row.license,
            vehiclePreference: row.vehicle_preference,
            totalPicks: row.total_picks,
            totalDeliveries: row.total_deliveries,
            notes: row.notes,
            activeOrders: row.active_orders
        }));
    } catch (error) {
        console.error('Error loading staff from DB:', error);
        return [];
    }
}

// Load delivery plans from DB
async function loadDeliveryPlansFromDB() {
    try {
        const plans = await db.all('SELECT * FROM delivery_plans');

        // Load saved van IDs from config so custom vans are included
        const configRow = await db.get('SELECT value FROM system_settings WHERE key = ?', ['app_config']).catch(() => null);
        let vanIds = [1, 2, 3]; // default
        if (configRow && configRow.value) {
            try {
                const cfg = JSON.parse(configRow.value);
                if (cfg.vans && cfg.vans.length) {
                    vanIds = cfg.vans.map(v => v.id);
                }
            } catch(e) {}
        }

        // Also include any van IDs that exist in the plans table (belt-and-braces)
        plans.forEach(p => { if (!vanIds.includes(p.van_id)) vanIds.push(p.van_id); });

        // Build delivery plan with all known van IDs
        const deliveryPlan = {};
        vanIds.forEach(vid => {
            deliveryPlan[vid] = {}; [1,2,3,4,5,6,7].forEach(function(d) { deliveryPlan[vid][d] = []; });
        });

        plans.forEach(plan => {
            if (deliveryPlan[plan.van_id] && deliveryPlan[plan.van_id][plan.day_id] !== undefined) {
                try {
                    deliveryPlan[plan.van_id][plan.day_id] = JSON.parse(plan.customer_ids);
                } catch(e) {
                    deliveryPlan[plan.van_id][plan.day_id] = [];
                }
            }
        });

        return deliveryPlan;
    } catch (error) {
        console.error('Error loading delivery plans from DB:', error);
        return null;
    }
}

// Load card states from DB
async function loadCardStatesFromDB() {
    try {
        const states = await db.all(`
            SELECT * FROM card_states
        `);

        const cardStates = {
            currentOrders: {},
            weeklyPlan: {}
        };

        states.forEach(state => {
            if (state.card_type === 'currentOrders') {
                cardStates.currentOrders[state.card_id] = state.is_expanded === 1;
            } else if (state.card_type === 'weeklyPlan') {
                cardStates.weeklyPlan[state.card_id] = state.is_expanded === 1;
            }
        });

        return cardStates;
    } catch (error) {
        console.error('Error loading card states from DB:', error);
        return null;
    }
}

// Backup database to JSON file
async function backupDatabaseToJSON() {
    try {
        const backupDir = path.join(DATA_DIR, 'backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir);
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(backupDir, `backup-${timestamp}.json`);

        const customers = await loadAllCustomersFromDB();
        const staff = await loadAllStaffFromDB();
        const deliveryPlan = await loadDeliveryPlansFromDB();
        const cardStates = await loadCardStatesFromDB();

        const backupData = {
            timestamp: getCurrentTimestamp(),
            customers,
            staff,
            deliveryPlan,
            cardStates,
            version: '1.0'
        };

        fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
        console.log(`✅ Database backed up to ${backupFile}`);

        // Keep only last 10 backups
        const backups = fs.readdirSync(backupDir)
            .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
            .map(f => ({
                name: f,
                path: path.join(backupDir, f),
                time: fs.statSync(path.join(backupDir, f)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time);

        if (backups.length > 10) {
            backups.slice(10).forEach(backup => {
                fs.unlinkSync(backup.path);
                console.log(`Removed old backup: ${backup.name}`);
            });
        }

        return backupFile;
    } catch (error) {
        console.error('Error backing up database:', error);
        return null;
    }
}

// Store connected clients
let connectedClients = new Map();

// ========== SOCKET.IO CONNECTION HANDLING ==========

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id, 'from:', socket.handshake.address);
    
    connectedClients.set(socket.id, {
        id: socket.id,
        connectedAt: new Date().toISOString(),
        address: socket.handshake.address
    });
    
    // Send current data to new client
    (async () => {
        try {
            const customers = await loadAllCustomersFromDB();
            const staff = await loadAllStaffFromDB();
            const deliveryPlan = await loadDeliveryPlansFromDB();
            const cardStates = await loadCardStatesFromDB();
            
            socket.emit('initial-data', {
                delivery: {
                    customers: customers.map(c => ({
                        id: c.id,
                        name: c.name,
                        assignedVan: c.assignedVan,
                        assignedDay: c.assignedDay,
                        deliveryOrder: c.deliveryOrder,
                        status: c.status,
                        assignedStaff: c.assignedStaff,
                        assignedDriver: c.assignedDriver,
                        zone: c.zone,
                        bayNumber: c.bayNumber,
                        bayOverflow: c.bayOverflow,
                        passport: c.passport
                    })),
                    deliveryPlan: deliveryPlan || {
                        1: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] },
                        2: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] },
                        3: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] }
                    },
                    currentVan: 1,
                    currentDay: 1
                },
                staff: {
                    staffMembers: staff,
                    nextStaffId: staff.length > 0 ? Math.max(...staff.map(s => s.id), 0) + 1 : 1
                },
                cardStates: cardStates || { currentOrders: {}, weeklyPlan: {} },
                customers: customers
            });
            
            console.log(`Sent initial data to client ${socket.id}`);
        } catch (error) {
            console.error('Error sending initial data:', error);
            socket.emit('error', { message: 'Failed to load initial data' });
        }
    })();
    
    // Handle delivery data updates
    socket.on('update-delivery-data', async (data) => {
        try {
            data.timestamp = getCurrentTimestamp();

            // Snapshot previous order states for email change detection (before transaction)
            const prevOrderMap = {};
            if (data.customers && emailService.isReady()) {
                for (const customer of data.customers) {
                    const prev = await db.get('SELECT status, assigned_driver FROM orders WHERE customer_id = ?', [customer.id]);
                    if (prev) prevOrderMap[customer.id] = prev;
                }
            }

            // Wrap all writes in a single transaction — 10-50x faster than individual commits
            await db.run('BEGIN');
            try {
                if (data.customers) {
                    for (const customer of data.customers) {
                        // Only update the order state — name/address never change here
                        const bayOverflowJSON = customer.bayOverflow ? JSON.stringify(customer.bayOverflow) : null;
                        await db.run(
                            'UPDATE orders SET status=?, assigned_van=?, assigned_day=?, delivery_order=?, assigned_staff=?, assigned_driver=?, zone=?, bay_number=?, bay_overflow=?, updated_at=CURRENT_TIMESTAMP WHERE customer_id=?',
                            [
                                customer.status || 'pending',
                                customer.assignedVan || null,
                                customer.assignedDay || null,
                                customer.deliveryOrder || 0,
                                JSON.stringify(customer.assignedStaff || []),
                                customer.assignedDriver || null,
                                customer.zone || null,
                                customer.bayNumber || null,
                                bayOverflowJSON,
                                customer.id
                            ]
                        );
                    }
                }

                if (data.deliveryPlan) {
                    await saveDeliveryPlanToDB(data.deliveryPlan);
                }

                await db.run('COMMIT');
            } catch (txErr) {
                await db.run('ROLLBACK');
                throw txErr;
            }

            // Send email notifications for customers whose status/driver changed
            if (data.customers && emailService.isReady()) {
                const cfg = await getEmailNotifyConfig();
                const companyName = await getCompanyName();
                for (const customer of data.customers) {
                    const prev = prevOrderMap[customer.id];
                    if (!prev) continue;
                    const prevStatus = prev.status || null;
                    const prevDriver = prev.assigned_driver || null;
                    if (customer.status === prevStatus && customer.assignedDriver === prevDriver) continue;

                    const fullCustomer = await db.get('SELECT * FROM customers WHERE customer_id = ?', [customer.id]);
                    if (!fullCustomer) continue;
                    const passportRow = await db.get('SELECT passport_data FROM customer_passports WHERE customer_id = ?', [customer.id]);
                    const passportEmail = passportRow ? (JSON.parse(passportRow.passport_data || '{}')).customerEmail : null;
                    const origData = fullCustomer.original_data ? JSON.parse(fullCustomer.original_data) : {};
                    const custEmail = passportEmail || fullCustomer.email || origData.email || origData.Email;
                    if (!custEmail) continue;

                    const orderRow = await db.get('SELECT order_number FROM orders WHERE customer_id = ?', [customer.id]);
                    const tplData = { customerName: customer.name || fullCustomer.name, companyName, orderNumber: orderRow?.order_number, driverName: customer.assignedDriver };

                    if (cfg.notifyOutForDelivery && customer.status === 'delivering' && prevStatus !== 'delivering') {
                        const { subject, html } = emailService.tplOutForDelivery(tplData);
                        await emailService.send(custEmail, subject, html);
                    }
                    if (cfg.notifyDelivered && customer.status === 'delivered' && prevStatus !== 'delivered') {
                        const { subject, html } = emailService.tplDelivered(tplData);
                        await emailService.send(custEmail, subject, html);
                    }
                    if (cfg.notifyDriverAssigned && customer.assignedDriver && customer.assignedDriver !== prevDriver) {
                        const { subject, html } = emailService.tplDriverAssigned(tplData);
                        await emailService.send(custEmail, subject, html);
                    }
                }
            }
            
            // Backup periodically (every 10 updates)
            const updateCountResult = await db.get(
                'SELECT value FROM system_settings WHERE key = ?',
                ['update_count']
            );
            
            const updateCount = updateCountResult ? parseInt(updateCountResult.value) || 0 : 0;
            
            await db.run(`
                INSERT INTO system_settings (key, value, updated_at)
                VALUES ('update_count', ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
            `, [(updateCount + 1).toString(), (updateCount + 1).toString()]);
            
            if ((updateCount + 1) % 10 === 0) {
                backupDatabaseToJSON();
            }
            
            // Broadcast to ALL connected devices including sender
            io.emit('delivery-data-updated', data);
            console.log(`Delivery data updated by ${socket.id}`);
        } catch (error) {
            console.error('Error saving delivery data:', error);
            socket.emit('error', { message: 'Failed to save delivery data' });
        }
    });
    
    // ── Quick single-customer update ─────────────────────────────────────────
    // Fired when one customer changes (assign, status, picker, driver, trolley).
    // Saves only that one record and broadcasts immediately — no full-scan delay.
    // Track which room this socket belongs to based on role
    // Relay temp zone moves to all other clients instantly
    socket.on('temp-zone-update', (data) => {
        socket.broadcast.emit('temp-zone-updated', data);
    });

    socket.on('set-role', (role) => {
        socket.data.role = role;
        socket.join(role);  // 'admin', 'manager', 'staff' rooms
        socket.join('all');
        console.log(`[socket] ${socket.id} joined room: ${role}`);
    });

    socket.on('quick-customer-update', async (customer) => {
        try {
            const fullCustomer = await db.get(
                'SELECT * FROM customers WHERE customer_id = ?',
                [customer.id]
            );

            if (fullCustomer) {
                // Load existing order row so partial payloads (e.g. passport-only) don't wipe bay assignments
                const existingOrder = await db.get(
                    'SELECT * FROM orders WHERE customer_id = ?',
                    [customer.id]
                );

                const customerData = {
                    id: customer.id,
                    name: customer.name || fullCustomer.name,
                    address: fullCustomer.address,
                    postcode: fullCustomer.postcode,
                    lat: fullCustomer.latitude,
                    lng: fullCustomer.longitude,
                    zone: customer.zone || fullCustomer.zone,
                    roadDistanceFromSite: fullCustomer.road_distance,
                    roadDurationFromSite: fullCustomer.road_duration,
                    status: 'status' in customer ? customer.status : (existingOrder?.status || null),
                    assignedVan: 'assignedVan' in customer ? customer.assignedVan : (existingOrder?.assigned_van || null),
                    assignedDay: 'assignedDay' in customer ? customer.assignedDay : (existingOrder?.assigned_day || null),
                    deliveryOrder: 'deliveryOrder' in customer ? (customer.deliveryOrder || 0) : (existingOrder?.delivery_order || 0),
                    assignedStaff: 'assignedStaff' in customer ? (customer.assignedStaff || []) : (existingOrder?.assigned_staff ? JSON.parse(existingOrder.assigned_staff) : []),
                    assignedDriver: 'assignedDriver' in customer ? (customer.assignedDriver || null) : (existingOrder?.assigned_driver || null),
                    bayNumber: 'bayNumber' in customer ? (customer.bayNumber || null) : (existingOrder?.bay_number || null),
                    bayOverflow: 'bayOverflow' in customer ? (customer.bayOverflow || null) : (existingOrder?.bay_overflow ? JSON.parse(existingOrder.bay_overflow) : null),
                    passport: customer.passport || null,
                    originalData: fullCustomer.original_data ? JSON.parse(fullCustomer.original_data) : {}
                };
                await saveCustomerToDB(customerData);

                // Email notifications on status / driver change
                if (emailService.isReady()) {
                    const prevStatus = existingOrder?.status || null;
                    const prevDriver = existingOrder?.assigned_driver || null;

                    const passportRow = await db.get('SELECT passport_data FROM customer_passports WHERE customer_id = ?', [customer.id]);
                    const passportEmail = passportRow ? (JSON.parse(passportRow.passport_data || '{}')).customerEmail : null;
                    const origData = fullCustomer.original_data ? JSON.parse(fullCustomer.original_data) : {};
                    const custEmail = passportEmail || fullCustomer.email || origData.email || origData.Email;

                    if (custEmail) {
                        const cfg = await getEmailNotifyConfig();
                        const companyName = await getCompanyName();
                        const orderRow = await db.get('SELECT order_number FROM orders WHERE customer_id = ?', [customer.id]);
                        const tplData = { customerName: customerData.name, companyName, orderNumber: orderRow?.order_number, driverName: customerData.assignedDriver };

                        if (cfg.notifyOutForDelivery && customerData.status === 'delivering' && prevStatus !== 'delivering') {
                            const { subject, html } = emailService.tplOutForDelivery(tplData);
                            await emailService.send(custEmail, subject, html);
                        }
                        if (cfg.notifyDelivered && customerData.status === 'delivered' && prevStatus !== 'delivered') {
                            const { subject, html } = emailService.tplDelivered(tplData);
                            await emailService.send(custEmail, subject, html);
                        }
                        if (cfg.notifyDriverAssigned && customerData.assignedDriver && customerData.assignedDriver !== prevDriver) {
                            const { subject, html } = emailService.tplDriverAssigned(tplData);
                            await emailService.send(custEmail, subject, html);
                        }
                    }
                }
            }

            // Also update deliveryPlan if provided
            if (customer.deliveryPlanPatch) {
                const { vanId, dayId, customerIds } = customer.deliveryPlanPatch;
                if (vanId && dayId !== undefined) {
                    await db.run(`
                        INSERT INTO delivery_plans (van_id, day_id, customer_ids, updated_at)
                        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(van_id, day_id) DO UPDATE SET
                            customer_ids = ?, updated_at = CURRENT_TIMESTAMP
                    `, [vanId, dayId, JSON.stringify(customerIds), JSON.stringify(customerIds)]);
                }
            }

            // Send full payload to ALL devices including sender
            // This ensures the originating device also updates cleanly
            io.emit('customer-updated', customer);

            console.log(`[quick-update] Customer ${customer.id} synced to all devices`);
        } catch (err) {
            console.error('[quick-update] Error:', err.message);
        }
    });

    // Handle staff data updates
    socket.on('update-staff-data', async (data) => {
        try {
            data.timestamp = getCurrentTimestamp();
            
            if (data.staffMembers) {
                for (const staff of data.staffMembers) {
                    await saveStaffToDB(staff);
                }
            }
            
            socket.broadcast.emit('staff-data-updated', data);
            console.log(`Staff data updated by ${socket.id}`);
        } catch (error) {
            console.error('Error saving staff data:', error);
        }
    });
    
    // Handle card states updates
    socket.on('update-card-states', async (data) => {
        try {
            data.timestamp = getCurrentTimestamp();
            
            // Save current orders card states
            if (data.currentOrders) {
                for (const [cardId, isExpanded] of Object.entries(data.currentOrders)) {
                    await saveCardStateToDB('currentOrders', cardId, isExpanded);
                }
            }
            
            // Save weekly plan card states
            if (data.weeklyPlan) {
                for (const [cardId, isExpanded] of Object.entries(data.weeklyPlan)) {
                    await saveCardStateToDB('weeklyPlan', cardId, isExpanded);
                }
            }
            
            socket.broadcast.emit('card-states-updated', data);
            console.log(`Card states updated by ${socket.id}`);
        } catch (error) {
            console.error('Error saving card states:', error);
        }
    });
    
    // Handle customer data upload
    socket.on('upload-customers', async (data) => {
        try {
            for (const customerData of data) {
                const lat = parseFloat(customerData.Latitude || customerData.latitude || customerData.Lat || customerData.lat);
                const lng = parseFloat(customerData.Longitude || customerData.longitude || customerData.Lon || customerData.lng || customerData.Long);
                
                if (customerData.Name && !isNaN(lat) && !isNaN(lng)) {
                    const customer = {
                        id: customerData.id || Date.now() + Math.random(),
                        name: customerData.Name,
                        address: customerData.Address,
                        postcode: customerData.Pincode || '',
                        lat: lat,
                        lng: lng,
                        zone: 'Local',
                        roadDistanceFromSite: 0,
                        roadDurationFromSite: 0,
                        status: ORDER_STATUSES.PENDING,
                        assignedVan: null,
                        assignedDay: null,
                        deliveryOrder: 0,
                        assignedStaff: [],
                        assignedDriver: null,
                        passport: null,
                        originalData: customerData
                    };
                    
                    await saveCustomerToDB(customer);
                }
            }
            
            console.log(`Customer data uploaded by ${socket.id} (${data.length} customers)`);
            
            // Broadcast updated customer list
            const customers = await loadAllCustomersFromDB();
            socket.broadcast.emit('customers-updated', customers);
            
            // Send confirmation
            socket.emit('customers-uploaded', { success: true, count: data.length });
        } catch (error) {
            console.error('Error saving customer data:', error);
            socket.emit('error', { message: 'Failed to save customer data' });
        }
    });
    
    // Handle request for customer data
    socket.on('request-customers', async () => {
        try {
            const customers = await loadAllCustomersFromDB();
            socket.emit('customers-data', customers);
        } catch (error) {
            console.error('Error sending customer data:', error);
        }
    });
    
    // Handle sync request
    socket.on('request-sync', async () => {
        try {
            const customers = await loadAllCustomersFromDB();
            const staff = await loadAllStaffFromDB();
            const deliveryPlan = await loadDeliveryPlansFromDB();
            const cardStates = await loadCardStatesFromDB();
            
            socket.emit('sync-data', {
                delivery: {
                    customers: customers.map(c => ({
                        id: c.id,
                        name: c.name,
                        assignedVan: c.assignedVan,
                        assignedDay: c.assignedDay,
                        deliveryOrder: c.deliveryOrder,
                        status: c.status,
                        assignedStaff: c.assignedStaff,
                        assignedDriver: c.assignedDriver,
                        zone: c.zone,
                        bayNumber: c.bayNumber,
                        bayOverflow: c.bayOverflow,
                        passport: c.passport
                    })),
                    deliveryPlan: deliveryPlan || {
                        1: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] },
                        2: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] },
                        3: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] }
                    },
                    currentVan: 1,
                    currentDay: 1
                },
                staff: {
                    staffMembers: staff,
                    nextStaffId: staff.length > 0 ? Math.max(...staff.map(s => s.id), 0) + 1 : 1
                },
                cardStates: cardStates || { currentOrders: {}, weeklyPlan: {} },
                customers: customers
            });
        } catch (error) {
            console.error('Error syncing data:', error);
        }
    });
    
    // Handle backup request
    socket.on('request-backup', async () => {
        try {
            const backupFile = await backupDatabaseToJSON();
            socket.emit('backup-completed', { 
                success: true, 
                file: backupFile,
                timestamp: getCurrentTimestamp()
            });
        } catch (error) {
            console.error('Error creating backup:', error);
            socket.emit('backup-error', { message: 'Failed to create backup' });
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        connectedClients.delete(socket.id);
    });
});

// ========== REST API ENDPOINTS ==========

app.get('/api/delivery-data', async (req, res) => {
    try {
        const customers = await loadAllCustomersFromDB();
        const deliveryPlan = await loadDeliveryPlansFromDB();
        
        res.json({
            customers: customers.map(c => ({
                id: c.id,
                name: c.name,
                assignedVan: c.assignedVan,
                assignedDay: c.assignedDay,
                deliveryOrder: c.deliveryOrder,
                status: c.status,
                assignedStaff: c.assignedStaff,
                assignedDriver: c.assignedDriver,
                zone: c.zone,
                passport: c.passport
            })),
            deliveryPlan: deliveryPlan,
            currentVan: 1,
            currentDay: 1,
            timestamp: getCurrentTimestamp()
        });
    } catch (error) {
        console.error('Error reading data:', error);
        res.status(500).json({ error: 'Failed to read data' });
    }
});

app.post('/api/delivery-data', async (req, res) => {
    try {
        const data = req.body;
        data.timestamp = getCurrentTimestamp();
        
        if (data.customers) {
            for (const customer of data.customers) {
                const fullCustomer = await db.get(
                    'SELECT * FROM customers WHERE customer_id = ?',
                    [customer.id]
                );

                if (fullCustomer) {
                    // Capture previous state for email change detection
                    const prevOrder   = await db.get('SELECT status, assigned_driver, email_sent FROM orders WHERE customer_id = ?', [customer.id]);
                    const prevStatus  = prevOrder?.status        || null;
                    const prevDriver  = prevOrder?.assigned_driver || null;
                    const emailSent   = JSON.parse(prevOrder?.email_sent || '{}');

                    const customerData = {
                        id: customer.id,
                        name: customer.name,
                        address: fullCustomer.address,
                        postcode: fullCustomer.postcode,
                        lat: fullCustomer.latitude,
                        lng: fullCustomer.longitude,
                        zone: customer.zone,
                        roadDistanceFromSite: fullCustomer.road_distance,
                        roadDurationFromSite: fullCustomer.road_duration,
                        status: customer.status,
                        assignedVan: customer.assignedVan,
                        assignedDay: customer.assignedDay,
                        deliveryOrder: customer.deliveryOrder,
                        assignedStaff: customer.assignedStaff,
                        assignedDriver: customer.assignedDriver,
                        passport: customer.passport,
                        originalData: fullCustomer.original_data ? JSON.parse(fullCustomer.original_data) : {}
                    };

                    await saveCustomerToDB(customerData);

                    // Email notifications
                    if (emailService.isReady()) {
                        const passportRow = await db.get('SELECT passport_data FROM customer_passports WHERE customer_id = ?', [customer.id]);
                        const passportEmail = passportRow ? (JSON.parse(passportRow.passport_data || '{}')).customerEmail : null;
                        const custEmail = passportEmail || fullCustomer.email || customerData.originalData?.email || customerData.originalData?.Email;
                        if (custEmail) {
                            const cfg = await getEmailNotifyConfig();
                            const companyName = await getCompanyName();
                            const order = await db.get('SELECT order_number FROM orders WHERE customer_id = ?', [customer.id]);
                            const tplData = { customerName: customer.name, companyName, orderNumber: order?.order_number, driverName: customer.assignedDriver };

                            if (cfg.notifyOutForDelivery && customer.status === 'delivering' && prevStatus !== 'delivering' && !emailSent.outForDelivery) {
                                const { subject, html } = emailService.tplOutForDelivery(tplData);
                                const result = await emailService.send(custEmail, subject, html);
                                if (result.sent) await db.run('UPDATE orders SET email_sent = ? WHERE customer_id = ?', [JSON.stringify({ ...emailSent, outForDelivery: true }), customer.id]);
                            }
                            if (cfg.notifyDelivered && customer.status === 'delivered' && prevStatus !== 'delivered' && !emailSent.delivered) {
                                const { subject, html } = emailService.tplDelivered(tplData);
                                const result = await emailService.send(custEmail, subject, html);
                                if (result.sent) await db.run('UPDATE orders SET email_sent = ? WHERE customer_id = ?', [JSON.stringify({ ...emailSent, delivered: true }), customer.id]);
                            }
                            if (cfg.notifyDriverAssigned && customer.assignedDriver && customer.assignedDriver !== prevDriver && !emailSent.driverAssigned) {
                                const { subject, html } = emailService.tplDriverAssigned(tplData);
                                const result = await emailService.send(custEmail, subject, html);
                                if (result.sent) await db.run('UPDATE orders SET email_sent = ? WHERE customer_id = ?', [JSON.stringify({ ...emailSent, driverAssigned: true }), customer.id]);
                            }
                        }
                    }
                }
            }
        }
        
        if (data.deliveryPlan) {
            await saveDeliveryPlanToDB(data.deliveryPlan);
        }

        const savedCount = data.customers ? data.customers.length : 0;
        if (savedCount > 0) {
            audit(req, 'delivery.save', 'order', null, null, { customers: savedCount });
        }
        res.json({ success: true, timestamp: data.timestamp });
    } catch (error) {
        console.error('Error saving data:', error);
        res.status(500).json({ error: 'Failed to save data' });
    }
});

app.get('/api/staff-data', async (req, res) => {
    try {
        const staff = await loadAllStaffFromDB();
        res.json({
            staffMembers: staff,
            nextStaffId: staff.length > 0 ? Math.max(...staff.map(s => s.id), 0) + 1 : 1,
            timestamp: getCurrentTimestamp()
        });
    } catch (error) {
        console.error('Error reading staff data:', error);
        res.status(500).json({ error: 'Failed to read staff data' });
    }
});

app.post('/api/staff-data', async (req, res) => {
    try {
        const data = req.body;
        data.timestamp = getCurrentTimestamp();
        
        if (data.staffMembers) {
            for (const staff of data.staffMembers) {
                await saveStaffToDB(staff);
            }
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving staff data:', error);
        res.status(500).json({ error: 'Failed to save staff data' });
    }
});

app.get('/api/card-states', async (req, res) => {
    try {
        const cardStates = await loadCardStatesFromDB();
        res.json({
            currentOrders: cardStates.currentOrders,
            weeklyPlan: cardStates.weeklyPlan,
            timestamp: getCurrentTimestamp()
        });
    } catch (error) {
        console.error('Error reading card states:', error);
        res.status(500).json({ error: 'Failed to read card states' });
    }
});

app.post('/api/card-states', async (req, res) => {
    try {
        const data = req.body;
        data.timestamp = getCurrentTimestamp();
        
        if (data.currentOrders) {
            for (const [cardId, isExpanded] of Object.entries(data.currentOrders)) {
                await saveCardStateToDB('currentOrders', cardId, isExpanded);
            }
        }
        
        if (data.weeklyPlan) {
            for (const [cardId, isExpanded] of Object.entries(data.weeklyPlan)) {
                await saveCardStateToDB('weeklyPlan', cardId, isExpanded);
            }
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving card states:', error);
        res.status(500).json({ error: 'Failed to save card states' });
    }
});

// Debug endpoint — check what's in DB for a customer
app.get('/api/debug/customer/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const customer = await db.get('SELECT * FROM customers WHERE customer_id = ?', [id]);
        const order = await db.get('SELECT * FROM orders WHERE customer_id = ?', [id]);
        const passport = await db.get('SELECT * FROM customer_passports WHERE customer_id = ?', [id]);
        res.json({
            customer,
            order: order ? { ...order, assigned_staff: order.assigned_staff, bay_number: order.bay_number, bay_overflow: order.bay_overflow } : null,
            passport: passport ? { customer_id: passport.customer_id, passport_data: passport.passport_data ? JSON.parse(passport.passport_data) : null } : null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/customers', async (req, res) => {
    try {
        // Paginated mode: ?page=N&limit=50&search=text
        if (req.query.page || req.query.limit || req.query.search) {
            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(500, Math.max(1, parseInt(req.query.limit) || 50));
            const search = (req.query.search || '').trim();
            const offset = (page - 1) * limit;

            const whereClause = search
                ? `WHERE c.name LIKE ? OR c.address LIKE ? OR c.postcode LIKE ?`
                : '';
            const whereParams = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];

            const countRow = await db.get(
                `SELECT COUNT(*) as total FROM customers c ${whereClause}`,
                whereParams
            );
            const total = countRow ? countRow.total : 0;

            const rows = await db.all(
                `SELECT c.*, cp.passport_data, o.status, o.assigned_van, o.assigned_day,
                        o.delivery_order, o.assigned_staff, o.assigned_driver, o.bay_number,
                        o.bay_overflow
                 FROM customers c
                 LEFT JOIN customer_passports cp ON c.customer_id = cp.customer_id
                 LEFT JOIN orders o ON c.customer_id = o.customer_id
                 ${whereClause}
                 ORDER BY c.name LIMIT ? OFFSET ?`,
                [...whereParams, limit, offset]
            );

            const customers = rows.map(row => ({
                id: row.customer_id,
                name: row.name,
                address: row.address,
                postcode: row.postcode,
                lat: row.latitude,
                lng: row.longitude,
                zone: row.zone || 'Local',
                roadDistanceFromSite: row.road_distance || 0,
                roadDurationFromSite: row.road_duration || 0,
                status: row.status || ORDER_STATUSES.PENDING,
                assignedVan: row.assigned_van,
                assignedDay: row.assigned_day,
                deliveryOrder: row.delivery_order || 0,
                assignedStaff: row.assigned_staff ? JSON.parse(row.assigned_staff) : [],
                assignedDriver: row.assigned_driver,
                bayNumber: row.bay_number || null,
                bayOverflow: row.bay_overflow ? JSON.parse(row.bay_overflow) : null,
                passport: row.passport_data ? JSON.parse(row.passport_data) : null,
                originalData: row.original_data ? JSON.parse(row.original_data) : {}
            }));

            return res.json({ customers, total, page, limit, pages: Math.ceil(total / limit), timestamp: getCurrentTimestamp() });
        }

        // Default: return all customers (existing behaviour)
        const customers = await loadAllCustomersFromDB();
        res.json({ customers, timestamp: getCurrentTimestamp() });
    } catch (error) {
        console.error('Error reading customers:', error);
        res.status(500).json({ error: 'Failed to read customers' });
    }
});

app.post('/api/customers', async (req, res) => {
    try {
        const errs = validateBulkCustomers(req.body);
        if (errs.length) return fail(res, errs);
        const customers = req.body;
        const plan = await getActivePlan();
        if (plan.maxCustomers !== null) {
            const current = (await db.get('SELECT COUNT(*) as c FROM customers')).c;
            const remaining = plan.maxCustomers - current;
            if (remaining <= 0) return res.status(403).json({ success: false, message: `Customer limit reached (${current}/${plan.maxCustomers} on ${plan.name} plan)`, limitExceeded: 'maxCustomers' });
            if (customers.length > remaining) return res.status(403).json({ success: false, message: `Import would exceed customer limit. You can add ${remaining} more (${plan.name} plan allows ${plan.maxCustomers})`, limitExceeded: 'maxCustomers' });
        }

        for (const customerData of customers) {
            const lat = parseFloat(customerData.Latitude || customerData.latitude || customerData.Lat || customerData.lat);
            const lng = parseFloat(customerData.Longitude || customerData.longitude || customerData.Lon || customerData.lng || customerData.Long);
            
            if (customerData.Name && !isNaN(lat) && !isNaN(lng)) {
                const customer = {
                    id: customerData.id || Date.now() + Math.random(),
                    name: customerData.Name,
                    address: customerData.Address,
                    postcode: customerData.Pincode || '',
                    lat: lat,
                    lng: lng,
                    zone: 'Local',
                    roadDistanceFromSite: 0,
                    roadDurationFromSite: 0,
                    status: ORDER_STATUSES.PENDING,
                    assignedVan: null,
                    assignedDay: null,
                    deliveryOrder: 0,
                    assignedStaff: [],
                    assignedDriver: null,
                    passport: null,
                    originalData: customerData
                };
                
                await saveCustomerToDB(customer);
            }
        }
        
        audit(req, 'customer.import_csv', 'customer', null, null, { imported: customers.length, source: 'bulk upload' });
        res.json({ success: true, count: customers.length });
    } catch (error) {
        console.error('Error saving customers:', error);
        res.status(500).json({ error: 'Failed to save customers' });
    }
});


// ========== COMPANY CONFIG ENDPOINTS ==========

// GET /api/config
app.get('/api/config', async (req, res) => {
    try {
        const rows = await db.all("SELECT key, value FROM system_settings WHERE key LIKE 'config.%'");
        const config = {};
        rows.forEach(r => {
            const k = r.key.replace('config.', '');
            try { config[k] = JSON.parse(r.value); } catch { config[k] = r.value; }
        });
        res.json({ success: true, config });
    } catch (err) {
        console.error('Config read error:', err);
        res.status(500).json({ success: false, message: 'Failed to read config' });
    }
});

// POST /api/config
app.post('/api/config', async (req, res) => {
    try {
        const config = req.body;
        if (config.vans && Array.isArray(config.vans)) {
            const vanLimit = await checkLimit('maxVans');
            if (vanLimit && config.vans.length > vanLimit.max) {
                return res.status(403).json({ success: false, message: `Van limit reached (max ${vanLimit.max} on ${vanLimit.plan} plan)`, limitExceeded: 'maxVans' });
            }
        }
        for (const [key, value] of Object.entries(config)) {
            const dbKey = 'config.' + key;
            const dbVal = typeof value === 'string' ? value : JSON.stringify(value);
            await db.run(
                `INSERT INTO system_settings (key, value, updated_at)
                 VALUES (?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP`,
                [dbKey, dbVal, dbVal]
            );
        }
        io.emit('config-updated', config);
        const changedKeys = Object.keys(config).filter(k => !['logo'].includes(k));
        audit(req, 'config.update', 'system', null, 'Company Config', { keys: changedKeys });
        if (changedKeys.some(k => k.startsWith('smtp') || k.startsWith('email'))) await loadEmailConfig();
        res.json({ success: true });
    } catch (err) {
        console.error('Config save error:', err);
        res.status(500).json({ success: false, message: 'Failed to save config' });
    }
});

// ========== SINGLE CUSTOMER CRUD ==========

// POST /api/customer/single
app.post('/api/customer/single', async (req, res) => {
    try {
        const d = req.body;
        const errs = validateCustomerCreate(d);
        if (errs.length) return fail(res, errs);
        const custLimit = await checkLimit('maxCustomers');
        if (custLimit) return res.status(403).json({ success: false, message: `Customer limit reached (${custLimit.current}/${custLimit.max} on ${custLimit.plan} plan)`, limitExceeded: 'maxCustomers' });
        const customerId = d.id || (Date.now() % 1000000 + Math.floor(Math.random() * 1000));
        const customer = {
            id:                  customerId,
            name:                d.name.trim(),
            address:             d.address   || '',
            postcode:            d.postcode  || '',
            lat:                 parseFloat(d.lat),
            lng:                 parseFloat(d.lng),
            zone:                d.zone      || 'Local',
            roadDistanceFromSite: 0,
            roadDurationFromSite: 0,
            status:              'pending',
            assignedVan:         d.assignedVan  || null,
            assignedDay:         d.assignedDay  || null,
            deliveryOrder:       0,
            assignedStaff:       [],
            assignedDriver:      null,
            passport:            null,
            originalData:        d
        };
        await saveCustomerToDB(customer);
        io.emit('customer-added', customer);
        audit(req, 'customer.create', 'customer', customerId, customer.name, { zone: customer.zone, address: customer.address });
        res.json({ success: true, customer });
    } catch (err) {
        console.error('Error saving single customer:', err);
        res.status(500).json({ success: false, message: 'Failed to save customer' });
    }
});

// DELETE /api/customer/single/:id
app.delete('/api/customer/single/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const target = await db.get('SELECT name FROM customers WHERE customer_id = ?', [id]);
        await db.run('DELETE FROM customers WHERE customer_id = ?', [id]);
        await db.run('DELETE FROM orders WHERE customer_id = ?', [id]);
        io.emit('customer-deleted', { id });
        audit(req, 'customer.delete', 'customer', id, target?.name);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting customer:', err);
        res.status(500).json({ success: false, message: 'Failed to delete customer' });
    }
});

app.get('/api/analytics/picking-metrics', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        let query = `
            SELECT pm.*, c.name as customer_name, o.order_number
            FROM picking_metrics pm
            JOIN customers c ON pm.customer_id = c.customer_id
            JOIN orders o ON pm.order_id = o.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (startDate) {
            query += ` AND pm.timestamp_ready_for_delivery >= ?`;
            params.push(startDate);
        }
        
        if (endDate) {
            query += ` AND pm.timestamp_ready_for_delivery <= ?`;
            params.push(endDate);
        }
        
        query += ` ORDER BY pm.timestamp_ready_for_delivery DESC LIMIT 1000`;
        
        const metrics = await db.all(query, params);
        res.json(metrics);
    } catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({ error: 'Failed to fetch analytics data' });
    }
});

app.get('/api/analytics/picker-performance', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        const query = `
            SELECT 
                s.name as picker_name,
                COUNT(DISTINCT pm.order_id) as orders_picked,
                SUM(pm.number_of_pickers) as total_picker_assignments,
                AVG(pm.time_to_first_picker) as avg_time_to_first,
                AVG(pm.picking_duration) as avg_picking_duration,
                AVG(pm.efficiency_score) as avg_efficiency,
                SUM(CAST(JSON_EXTRACT(pm.plants_per_picker, '$."' || s.name || '"') AS INTEGER)) as total_plants,
                AVG(CAST(JSON_EXTRACT(pm.plants_per_picker, '$."' || s.name || '"') AS INTEGER)) as avg_plants_per_order,
                AVG(pm.plants_per_hour) as avg_plants_per_hour
            FROM staff s
            LEFT JOIN picking_metrics pm ON 1=1
            WHERE s.type = 'picker'
            GROUP BY s.id, s.name
            ORDER BY avg_plants_per_hour DESC
        `;
        
        const performance = await db.all(query);
        res.json(performance);
    } catch (error) {
        console.error('Error fetching picker performance:', error);
        res.status(500).json({ error: 'Failed to fetch picker performance' });
    }
});

app.get('/api/analytics/productivity-by-range', async (req, res) => {
    try {
        const query = `
            SELECT 
                CASE 
                    WHEN CAST(JSON_EXTRACT(passport_data, '$.numberOfPlants') AS INTEGER) <= 10 THEN '1-10'
                    WHEN CAST(JSON_EXTRACT(passport_data, '$.numberOfPlants') AS INTEGER) <= 25 THEN '11-25'
                    WHEN CAST(JSON_EXTRACT(passport_data, '$.numberOfPlants') AS INTEGER) <= 50 THEN '26-50'
                    WHEN CAST(JSON_EXTRACT(passport_data, '$.numberOfPlants') AS INTEGER) <= 100 THEN '51-100'
                    ELSE '100+'
                END as plant_range,
                COUNT(*) as order_count,
                AVG(CAST(JSON_EXTRACT(passport_data, '$.numberOfPlants') AS INTEGER)) as avg_plants,
                AVG(pm.picking_duration) as avg_picking_time,
                AVG(pm.plants_per_hour) as avg_plants_per_hour,
                SUM(CAST(JSON_EXTRACT(passport_data, '$.numberOfPlants') AS INTEGER)) as total_plants
            FROM customer_passports cp
            JOIN picking_metrics pm ON cp.customer_id = pm.customer_id
            WHERE cp.passport_data IS NOT NULL
            GROUP BY plant_range
            ORDER BY 
                CASE plant_range
                    WHEN '1-10' THEN 1
                    WHEN '11-25' THEN 2
                    WHEN '26-50' THEN 3
                    WHEN '51-100' THEN 4
                    WHEN '100+' THEN 5
                END
        `;
        
        const productivity = await db.all(query);
        res.json(productivity);
    } catch (error) {
        console.error('Error fetching productivity data:', error);
        res.status(500).json({ error: 'Failed to fetch productivity data' });
    }
});

app.post('/api/backup', async (req, res) => {
    try {
        const backupFile = await backupDatabaseToJSON();
        res.json({ success: true, file: backupFile });
    } catch (error) {
        console.error('Error creating backup:', error);
        res.status(500).json({ error: 'Failed to create backup' });
    }
});

app.get('/api/backups', (req, res) => {
    try {
        const backupDir = path.join(DATA_DIR, 'backups');
        if (!fs.existsSync(backupDir)) {
            return res.json({ backups: [] });
        }
        
        const backups = fs.readdirSync(backupDir)
            .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
            .map(f => ({
                filename: f,
                path: path.join(backupDir, f),
                size: fs.statSync(path.join(backupDir, f)).size,
                created: fs.statSync(path.join(backupDir, f)).mtime
            }))
            .sort((a, b) => b.created - a.created);
        
        res.json({ backups });
    } catch (error) {
        console.error('Error listing backups:', error);
        res.status(500).json({ error: 'Failed to list backups' });
    }
});

app.get('/api/restore/:filename', (req, res) => {
    try {
        const backupFile = path.join(DATA_DIR, 'backups', req.params.filename);
        
        if (!fs.existsSync(backupFile)) {
            return res.status(404).json({ error: 'Backup file not found' });
        }
        
        const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
        res.json(backupData);
    } catch (error) {
        console.error('Error reading backup:', error);
        res.status(500).json({ error: 'Failed to read backup' });
    }
});

app.get('/api/clients', (req, res) => {
    const clients = Array.from(connectedClients.entries()).map(([id, info]) => ({
        id,
        ...info
    }));
    res.json(clients);
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: getCurrentTimestamp(),
        database: db ? 'connected' : 'disconnected',
        clients: connectedClients.size
    });
});

app.put('/api/customer/single/:id', async (req, res) => {
    try {
        const errs = validateCustomerUpdate(req.body);
        if (errs.length) return fail(res, errs);
        const id = parseInt(req.params.id);
        const { name, address, postcode, lat, lng, zone, assignedDay } = req.body;
        if (!name || lat === undefined || lng === undefined) {
            return res.status(400).json({ success: false, message: 'name, lat, lng required' });
        }
        await db.run(`
            UPDATE customers
            SET name = ?, address = ?, postcode = ?, latitude = ?, longitude = ?, zone = ?
            WHERE customer_id = ?
        `, [name, address || '', postcode || '', lat, lng, zone || 'Local', id]);
        if (assignedDay !== undefined) {
            await db.run(`UPDATE orders SET assigned_day = ? WHERE customer_id = ?`, [assignedDay || null, id]);
        }
        audit(req, 'customer.update', 'customer', id, name, { zone, address });
        res.json({ success: true });
    } catch (err) {
        console.error('Update customer error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ========== PLAN & USAGE ==========
app.get('/api/plan', async (req, res) => {
    try {
        const plan = await getActivePlan();
        const [custRow, userRow, vanRow] = await Promise.all([
            db.get('SELECT COUNT(*) as c FROM customers'),
            db.get('SELECT COUNT(*) as c FROM users WHERE active = 1'),
            db.get("SELECT value FROM system_settings WHERE key = 'config.vans'"),
        ]);
        const usage = {
            customers: custRow.c,
            users:     userRow.c,
            vans:      vanRow ? JSON.parse(vanRow.value).length : 1,
        };
        res.json({ success: true, plan, usage, plans: PLANS });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Tell the browser which routing backend is active
app.get('/api/routing-config', (req, res) => {
    res.json({ backend: (process.env.ROUTING_BACKEND || 'ors').toLowerCase() });
});

// POST /api/email/test
app.post('/api/email/test', async (req, res) => {
    const { to } = req.body;
    if (!to) return res.status(400).json({ success: false, message: 'to address required' });
    if (!emailService.isReady()) return res.status(503).json({ success: false, message: 'Email not configured — add SMTP settings first' });
    const companyName = await getCompanyName();
    const result = await emailService.send(to, `Test email from ${companyName}`,
        `<div style="font-family:Arial,sans-serif;padding:24px;"><h2>Test email</h2><p>Your email notifications are working correctly.</p><p style="color:#6b7280;font-size:13px;">— ${companyName}</p></div>`);
    if (result.sent) res.json({ success: true });
    else res.status(500).json({ success: false, message: result.reason });
});

// ========== AUDIT LOG ==========
// GET /api/audit?limit=100&offset=0&action=user.create&username=admin&from=2024-01-01&to=2024-12-31
app.get('/api/audit', async (req, res) => {
    try {
        const limit    = Math.min(parseInt(req.query.limit)  || 100, 500);
        const offset   = parseInt(req.query.offset) || 0;
        const clauses  = [];
        const params   = [];
        if (req.query.action)   { clauses.push('action LIKE ?');    params.push('%' + req.query.action + '%'); }
        if (req.query.username) { clauses.push('username LIKE ?');  params.push('%' + req.query.username + '%'); }
        if (req.query.entity)   { clauses.push('entity_type = ?');  params.push(req.query.entity); }
        if (req.query.from)     { clauses.push('timestamp >= ?');   params.push(req.query.from); }
        if (req.query.to)       { clauses.push('timestamp <= ?');   params.push(req.query.to + ' 23:59:59'); }
        const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
        const [rows, countRow] = await Promise.all([
            db.all(`SELECT * FROM audit_log ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`, [...params, limit, offset]),
            db.get(`SELECT COUNT(*) as total FROM audit_log ${where}`, params)
        ]);
        res.json({ success: true, logs: rows, total: countRow.total, limit, offset });
    } catch (err) {
        console.error('Audit log error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ========== VRP OPTIMISE ROUTE ==========
app.post('/api/optimise-route', async (req, res) => {
    const { stops, vans, options, depot } = req.body;
    if (!stops || !vans || !Array.isArray(stops) || !Array.isArray(vans)) {
        return res.status(400).json({ success: false, error: 'stops[] and vans[] are required' });
    }
    try {
        const result = await optimiseRoutes(stops, vans, options || {}, depot);
        res.json(result);
    } catch (err) {
        console.error('[VRP] Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/optimiser-status', async (req, res) => {
    const alive = await checkPythonService();
    res.json({ available: alive, url: process.env.PYTHON_URL || 'http://localhost:8000' });
});

app.get('/api/routing-config', (req, res) => {
    res.json({ backend: (process.env.ROUTING_BACKEND || 'ors').toLowerCase() });
});

// ========== OSM TILE PROXY ==========
// Proxies OpenStreetMap tile requests through the local server.
// This makes tiles same-origin so canvas.toDataURL() works without CORS issues.
// Used by the PEP Delivery Sheet map capture (captureRouteToCanvas in driver.js).
app.get('/api/tile/:z/:x/:y', async (req, res) => {
    var z = parseInt(req.params.z), x = parseInt(req.params.x), y = parseInt(req.params.y);
    if (isNaN(z) || isNaN(x) || isNaN(y) || z < 0 || z > 19) {
        return res.status(400).end();
    }
    var sub = ['a','b','c'][(x + y) % 3];
    var url = 'https://' + sub + '.tile.openstreetmap.org/' + z + '/' + x + '/' + y + '.png';
    try {
        var tileRes = await fetch(url, {
            headers: {
                'User-Agent': 'PEPDeliveryApp/1.0 (delivery management system)',
                'Referer':    'https://www.openstreetmap.org/'
            }
        });
        if (!tileRes.ok) return res.status(tileRes.status).end();
        var buf = await tileRes.buffer();
        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=86400'); // cache tiles for 24h
        res.send(buf);
    } catch (err) {
        console.warn('[tile proxy]', z, x, y, err.message);
        res.status(500).end();
    }
});


// Set ROUTING_BACKEND in .env to switch:
//   ROUTING_BACKEND=ors       → OpenRouteService hosted API  (default, needs ORS_API_KEY)
//   ROUTING_BACKEND=valhalla  → Valhalla (hosted demo or self-hosted Docker)
//   ROUTING_BACKEND=osrm      → Self-hosted OSRM
//
// All three return the same normalised format: { distances: [[km]], durations: [[seconds]] }
// Nothing else in the codebase needs to change when you switch backend.

app.post('/api/road-matrix', async (req, res) => {
    const { locations } = req.body;
    if (!locations || locations.length < 2) {
        return res.status(400).json({ error: 'Provide at least 2 locations as [[lng,lat], ...]' });
    }

    const backend = (process.env.ROUTING_BACKEND || 'ors').toLowerCase();

    // ── VALHALLA ─────────────────────────────────────────────────────────────
    // Hosted demo:  https://valhalla1.openstreetmap.de  (free, no key, covers UK)
    // Self-hosted:  set VALHALLA_URL=http://localhost:8002
    if (backend === 'valhalla') {
        const VALHALLA_URL = (process.env.VALHALLA_URL || 'https://valhalla1.openstreetmap.de').replace(/\/$/, '');

        // Valhalla sources_to_targets uses {lat, lon} objects (note: lat/lon not lng/lat)
        const points = locations.map(([lng, lat]) => ({ lon: lng, lat }));

        try {
            const vRes = await fetch(`${VALHALLA_URL}/sources_to_targets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sources:  points,
                    targets:  points,
                    costing:  'auto',         // best available road routing
                    units:    'kilometers'
                })
            });

            if (!vRes.ok) {
                const errBody = await vRes.text();
                console.error(`[Valhalla] Error ${vRes.status}:`, errBody);
                return res.status(vRes.status).json({ error: errBody });
            }

            const data = await vRes.json();

            // Normalise Valhalla response → { distances: [[km]], durations: [[seconds]] }
            // data.sources_to_targets is array-of-arrays, each cell: { distance (km), time (sec) }
            const n = points.length;
            const distances = Array.from({ length: n }, () => Array(n).fill(0));
            const durations = Array.from({ length: n }, () => Array(n).fill(0));

            data.sources_to_targets.forEach((row, i) => {
                row.forEach(cell => {
                    const j = cell.to_index;
                    // Valhalla returns null for unreachable pairs — fall back to 0
                    distances[i][j] = cell.distance ?? 0;
                    durations[i][j] = cell.time     ?? 0;
                });
            });

            console.log(`[Valhalla] Matrix ${n}×${n} via ${VALHALLA_URL}`);
            res.json({ distances, durations });

        } catch (err) {
            const isConnErr = err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ECONNRESET';
            if (isConnErr) {
                console.warn('[Valhalla] Service unreachable at', VALHALLA_URL, '— is the Valhalla Docker container running?');
                return res.status(503).json({ error: 'Valhalla routing service is not running. Start it or switch ROUTING_BACKEND in .env.' });
            }
            console.error('[Valhalla] Proxy fetch error:', err.message);
            res.status(500).json({ error: err.message });
        }
        return;
    }

    // ── OSRM (self-hosted) ────────────────────────────────────────────────────
    if (backend === 'osrm') {
        const OSRM_URL = (process.env.OSRM_URL || 'http://localhost:5000').replace(/\/$/, '');
        const coords = locations.map(([lng, lat]) => `${lng},${lat}`).join(';');
        const url = `${OSRM_URL}/table/v1/driving/${coords}?annotations=duration,distance`;

        try {
            const osrmRes = await fetch(url);
            if (!osrmRes.ok) {
                const errBody = await osrmRes.text();
                console.error(`[OSRM] Error ${osrmRes.status}:`, errBody);
                return res.status(osrmRes.status).json({ error: errBody });
            }
            const data = await osrmRes.json();
            if (data.code !== 'Ok') {
                return res.status(500).json({ error: `OSRM: ${data.code} — ${data.message}` });
            }
            // OSRM distances are metres → convert to km
            res.json({
                durations: data.durations,
                distances: data.distances.map(row => row.map(m => m / 1000))
            });
        } catch (err) {
            const isConnErr = err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ECONNRESET';
            if (isConnErr) {
                console.warn('[OSRM] Service unreachable — is OSRM running?');
                return res.status(503).json({ error: 'OSRM routing service is not running.' });
            }
            console.error('[OSRM] Proxy fetch error:', err.message);
            res.status(500).json({ error: err.message });
        }
        return;
    }

    // ── ORS (default) ─────────────────────────────────────────────────────────
    const ORS_API_KEY = process.env.ORS_API_KEY;
    if (!ORS_API_KEY) {
        console.error('[ORS] ORS_API_KEY not set in .env — returning 503');
        return res.status(503).json({ error: 'ORS_API_KEY not configured on server' });
    }

    try {
        const orsRes = await fetch('https://api.openrouteservice.org/v2/matrix/driving-car', {
            method: 'POST',
            headers: {
                'Authorization': ORS_API_KEY,
                'Content-Type': 'application/json; charset=utf-8',
                'Accept': 'application/json, application/geo+json'
            },
            body: JSON.stringify({
                locations,
                metrics: ['distance', 'duration'],
                units: 'km'
            })
        });

        if (!orsRes.ok) {
            const errBody = await orsRes.text();
            console.error(`[ORS] API error ${orsRes.status}:`, errBody);
            return res.status(orsRes.status).json({ error: errBody });
        }

        const data = await orsRes.json();
        res.json(data);

    } catch (err) {
        console.error('[ORS] Proxy fetch error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ========== WEEKLY RESET ENDPOINT ==========
// Directly resets the DB — more reliable than relying on socket-based saveData()
app.post('/api/reset', async (req, res) => {
    try {
        const { clearVanDay } = req.body;

        if (clearVanDay) {
            // Full reset — clear all operational fields including van/day
            await db.run(`
                UPDATE orders SET
                    status        = 'pending',
                    assigned_van  = NULL,
                    assigned_day  = NULL,
                    assigned_staff  = '[]',
                    assigned_driver = NULL,
                    delivery_order  = 0,
                    updated_at    = CURRENT_TIMESTAMP
            `);
        } else {
            // Weekly reset — keep van/day, clear everything else
            await db.run(`
                UPDATE orders SET
                    status          = 'pending',
                    assigned_staff  = '[]',
                    assigned_driver = NULL,
                    delivery_order  = 0,
                    updated_at      = CURRENT_TIMESTAMP
            `);
        }

        // Reset passport data — keep only labelling fields
        const passports = await db.all('SELECT customer_id, passport_data FROM customer_passports');
        for (const row of passports) {
            try {
                const p = JSON.parse(row.passport_data || '{}');
                const fresh = {
                    // Preserve labelling
                    barcodedLabels:    p.barcodedLabels    || false,
                    prePricedLabels:   p.prePricedLabels   || false,
                    labelInstructions: p.labelInstructions || '',
                    // Preserve repeat tracking
                    isRepeatCustomer:   p.isRepeatCustomer   || false,
                    previousOrderCount: p.previousOrderCount || 0,
                    totalOrdersCount:   p.totalOrdersCount   || 0,
                    customerSince:      p.customerSince      || '',
                    // Preserve contact
                    customerContact: p.customerContact || '',
                    customerEmail:   p.customerEmail   || '',
                    // Reset timestamps and metrics
                    timestamps: { orderCreated:'', firstPickerAssigned:'', pickingStarted:'', pickingCompleted:'', readyForDelivery:'', deliveredAt:'' },
                    pickingMetrics: { timeToFirstPicker:0, pickingDuration:0, totalPickingTime:0, efficiencyScore:0, numberOfPickers:0, pickerNames:[], plantsPerHour:0, plantsPerPicker:{} },
                    orders: [],
                    lastUpdated: new Date().toISOString(),
                    updatedBy: 'System - Weekly Reset'
                };
                await db.run(
                    'UPDATE customer_passports SET passport_data = ?, updated_at = CURRENT_TIMESTAMP WHERE customer_id = ?',
                    [JSON.stringify(fresh), row.customer_id]
                );
            } catch(e) { /* skip malformed passport */ }
        }

        // Also clear the delivery_plan table if full reset
        if (clearVanDay) {
            try { await db.run("DELETE FROM delivery_plans"); } catch(e) {}
        }

        console.log(`[reset] ${clearVanDay ? 'Full' : 'Weekly'} reset completed on ${passports.length} passports`);
        res.json({ success: true, message: `Reset complete` });

    } catch (err) {
        console.error('[reset] Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ========== DIAGNOSTICS ENDPOINT ==========
app.get('/api/diagnostics', async (req, res) => {
    try {
        const result = {};

        // Table row counts
        const tables = ['customers','orders','customer_passports','picking_metrics','delivery_plans','staff','users','card_states','system_settings'];
        result.tableCounts = {};
        for (const t of tables) {
            try {
                const r = await db.get(`SELECT COUNT(*) as n FROM ${t}`);
                result.tableCounts[t] = r.n;
            } catch(e) { result.tableCounts[t] = 'ERROR: ' + e.message; }
        }

        // Sample assigned customer (with all related data)
        result.sampleAssigned = await db.all(`
            SELECT c.customer_id as id, c.name, c.zone as cust_zone,
                   c.road_distance, LENGTH(c.original_data) as original_data_bytes,
                   o.status, o.assigned_van, o.assigned_day,
                   o.assigned_staff, o.assigned_driver, o.zone as order_zone,
                   LENGTH(cp.passport_data) as passport_bytes,
                   (SELECT COUNT(*) FROM picking_metrics pm WHERE pm.customer_id = c.customer_id) as metric_rows
            FROM customers c
            LEFT JOIN orders o ON o.customer_id = c.customer_id
            LEFT JOIN customer_passports cp ON cp.customer_id = c.customer_id
            WHERE o.assigned_van IS NOT NULL
            LIMIT 3
        `);

        // Sample unassigned customer
        result.sampleUnassigned = await db.all(`
            SELECT c.customer_id as id, c.name, o.status, o.assigned_van
            FROM customers c
            LEFT JOIN orders o ON o.customer_id = c.customer_id
            WHERE o.assigned_van IS NULL
            LIMIT 2
        `);

        // Zone mismatch count (redundancy check)
        const zm = await db.get(`
            SELECT COUNT(*) as n FROM customers c
            JOIN orders o ON o.customer_id = c.customer_id
            WHERE c.zone IS NOT NULL AND o.zone IS NOT NULL
              AND c.zone != '' AND o.zone != ''
              AND c.zone != o.zone
        `);
        result.zoneMismatches = zm.n;

        // Delivery plan consistency
        const inOrders = await db.get(`SELECT COUNT(*) as n FROM orders WHERE assigned_van IS NOT NULL`);
        const planRows = await db.all(`SELECT van_id, day_id, customer_ids FROM delivery_plans`);
        let planTotal = 0;
        planRows.forEach(r => { try { planTotal += JSON.parse(r.customer_ids).length; } catch(e) {} });
        result.assignmentConsistency = {
            inOrdersTable: inOrders.n,
            inDeliveryPlansTable: planTotal,
            match: inOrders.n === planTotal
        };

        // Passport size stats
        const passportStats = await db.get(`
            SELECT COUNT(*) as total,
                   AVG(LENGTH(passport_data)) as avg_bytes,
                   MAX(LENGTH(passport_data)) as max_bytes,
                   SUM(LENGTH(passport_data)) as total_bytes
            FROM customer_passports
        `);
        result.passportStorage = {
            total: passportStats.total,
            avgBytes: Math.round(passportStats.avg_bytes || 0),
            maxBytes: passportStats.max_bytes || 0,
            totalKB: Math.round((passportStats.total_bytes || 0) / 1024)
        };

        // original_data column waste
        const origStats = await db.get(`
            SELECT SUM(LENGTH(original_data)) as total_bytes FROM customers
        `);
        result.originalDataWasteKB = Math.round((origStats.total_bytes || 0) / 1024);

        // picking_metrics vs passport overlap check
        result.pickingMetricsUsed = await db.get(
            `SELECT COUNT(*) as n FROM picking_metrics`
        );

        res.json({ success: true, ...result });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ========== VALHALLA OPTIMISED ROUTE ==========
// Uses Valhalla /optimized_route (TSP) to find best stop order.
// Returns the customer IDs reordered to minimise total drive time.
app.post('/api/optimised-route-valhalla', async (req, res) => {
    const { locations, customerIds } = req.body;
    if (!locations || !customerIds || locations.length < 3) {
        return res.status(400).json({ error: 'locations and customerIds required, minimum 3 points' });
    }

    const VALHALLA_URL = (process.env.VALHALLA_URL || 'http://localhost:8002').replace(/\/$/, '');

    try {
        const vRes = await fetch(`${VALHALLA_URL}/optimized_route`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                locations,           // [{lat, lon, type:'break'}, ...]
                costing: 'auto',
                units: 'kilometers'
            })
        });

        if (!vRes.ok) {
            const errText = await vRes.text();
            console.error('[Valhalla optimised] Error:', errText);
            return res.status(vRes.status).json({ error: errText });
        }

        const data = await vRes.json();

        // Valhalla returns legs in optimised order, each leg has maneuvers
        // The order of waypoints in the response matches the optimised visit sequence
        // We need to map back to customerIds (skip first/last which are warehouse)
        if (!data.trip || !data.trip.locations) {
            return res.status(500).json({ error: 'Unexpected Valhalla response structure' });
        }

        // Valhalla returns original_index on each location showing where it was in the input
        const optimisedLocations = data.trip.locations;
        // Slice off first (warehouse) and last (warehouse return), map original_index to customerIds
        // customerIds[0] = stop at locations[1], customerIds[1] = stop at locations[2], etc.
        const stopLocations = optimisedLocations.slice(1, -1);
        const optimisedOrder = stopLocations.map(loc => {
            const originalStopIndex = (loc.original_index || 0) - 1; // -1 because locations[0] is warehouse
            return customerIds[originalStopIndex];
        }).filter(Boolean);

        const totalDistance = data.trip.summary ? data.trip.summary.length : 0;
        const totalDuration = data.trip.summary ? data.trip.summary.time / 60 : 0;

        console.log(`[Valhalla optimised] ${optimisedOrder.length} stops, ${totalDistance.toFixed(1)}km, ${totalDuration.toFixed(0)}min`);
        res.json({
            success: true,
            optimisedOrder,
            totalDistance,
            totalDuration
        });
    } catch (err) {
        console.error('[Valhalla optimised] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ========== ROAD ROUTE GEOMETRY ==========
app.post('/api/road-route', async (req, res) => {
    const { locations, departureTime } = req.body;
    if (!locations || locations.length < 2) {
        return res.status(400).json({ error: 'Provide at least 2 locations as [[lng,lat], ...]' });
    }

    const backend = (process.env.ROUTING_BACKEND || 'ors').toLowerCase();

    if (backend === 'valhalla') {
        const VALHALLA_URL = (process.env.VALHALLA_URL || 'https://valhalla1.openstreetmap.de').replace(/\/$/, '');
        const waypoints = locations.map(([lng, lat]) => ({ lon: lng, lat }));

        // date_time type 1 = "depart at this time" — Valhalla uses traffic patterns for that time of day
        // Format: "2026-04-16T09:30" (local time, no timezone)
        const dateTimeObj = departureTime
            ? { date_time: { type: 1, value: departureTime } }
            : {};

        function decodePolyline6(encoded) {
            const coords = [];
            let index = 0, lat = 0, lng = 0;
            while (index < encoded.length) {
                let b, shift = 0, result = 0;
                do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
                lat += (result & 1) ? ~(result >> 1) : (result >> 1);
                shift = 0; result = 0;
                do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
                lng += (result & 1) ? ~(result >> 1) : (result >> 1);
                coords.push([lng / 1e6, lat / 1e6]);
            }
            return coords;
        }

        try {
            const vRes = await fetch(`${VALHALLA_URL}/route`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ locations: waypoints, costing: 'auto', units: 'kilometers', ...dateTimeObj })
            });
            if (!vRes.ok) {
                const errBody = await vRes.text();
                console.error(`[Valhalla route] Error ${vRes.status}:`, errBody);
                return res.status(vRes.status).json({ error: errBody });
            }
            const data = await vRes.json();
            const coords = (data.trip && data.trip.legs ? data.trip.legs : []).flatMap(leg =>
                leg.shape ? decodePolyline6(leg.shape) : []
            );
            const totalDistance = (data.trip && data.trip.summary) ? data.trip.summary.length || 0 : 0;
            const totalDuration = (data.trip && data.trip.summary) ? (data.trip.summary.time || 0) / 60 : 0;
            console.log(`[Valhalla route] ${coords.length} shape points, ${totalDistance.toFixed(1)}km, ${totalDuration.toFixed(0)}min${departureTime ? ' @ ' + departureTime : ' (no departure time)'}`);
            res.json({ coordinates: coords, distance: totalDistance, duration: totalDuration });
        } catch (err) {
            const isConnErr = err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ECONNRESET';
            if (isConnErr) {
                console.warn('[Valhalla route] Service unreachable — returning straight-line fallback');
                return res.json({ coordinates: [], distance: 0, duration: 0, straight: true });
            }
            console.error('[Valhalla route] Error:', err.message);
            res.status(500).json({ error: err.message });
        }
        return;
    }

    if (backend === 'osrm') {
        const OSRM_URL = (process.env.OSRM_URL || 'http://localhost:5000').replace(/\/$/, '');
        const coords = locations.map(([lng, lat]) => `${lng},${lat}`).join(';');
        try {
            const osrmRes = await fetch(`${OSRM_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson`);
            if (!osrmRes.ok) return res.status(osrmRes.status).json({ error: await osrmRes.text() });
            const data = await osrmRes.json();
            if (data.code !== 'Ok') return res.status(500).json({ error: data.message });
            const route = data.routes[0];
            res.json({ coordinates: route.geometry.coordinates, distance: route.distance / 1000, duration: route.duration / 60 });
        } catch (err) {
            const isConnErr = err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ECONNRESET';
            if (isConnErr) {
                console.warn('[OSRM route] Service unreachable — returning straight-line fallback');
                return res.json({ coordinates: [], distance: 0, duration: 0, straight: true });
            }
            res.status(500).json({ error: err.message });
        }
        return;
    }

    res.json({ coordinates: [], distance: 0, duration: 0, straight: true });
});

// ========== AI CHAT ENDPOINTS ==========

const PYTHON_URL = process.env.PYTHON_URL || 'http://localhost:8000';

app.get('/api/ai/status', async (req, res) => {
    try {
        const resp = await fetch(`${PYTHON_URL}/chat/status`);
        const data = await resp.json();
        res.json(data);
    } catch {
        res.json({ available: false, models: [], gemma_ready: false });
    }
});

app.post('/api/ai/chat', async (req, res) => {
    try {
        const { messages, context, vanId, dayId } = req.body;
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Invalid request' });
        }

        const ACTIVE = `('pending','picking','ready_for_delivery','delivering')`;

        // ── Live query logging ───────────────────────────────────────────────
        const lastUserMsg = messages.filter(m => m.role === 'user').pop();
        const t0 = Date.now();
        console.log('\n' + '─'.repeat(60));
        console.log(`[AI] User: "${lastUserMsg?.content || '?'}"`);
        console.log(`[AI] Context: vanId=${vanId ?? 'none'}, dayId=${dayId ?? 'none'}`);

        // ── Parallel DB queries ──────────────────────────────────────────────
        // Use the selected day for detail; fall back to day 1 if none selected
        const activeDay = dayId || 1;

        const [assigned, unassigned, drivers, todayStops, otherDays, vanDrivers, pickingStats, recentPicks, vanConfig, allStaff] = await Promise.all([

            // Orders on a route for the active day only
            db.get(`SELECT COUNT(*) as total,
                SUM(CASE WHEN status='pending'            THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status='picking'            THEN 1 ELSE 0 END) as picking,
                SUM(CASE WHEN status='ready_for_delivery' THEN 1 ELSE 0 END) as ready,
                SUM(CASE WHEN status='delivering'         THEN 1 ELSE 0 END) as delivering
                FROM orders WHERE status IN ${ACTIVE}
                AND assigned_van IS NOT NULL AND assigned_day = ?`, [activeDay]),

            // Pending orders not yet placed on any route
            db.get(`SELECT COUNT(*) as count FROM orders
                WHERE status = 'pending' AND assigned_van IS NULL`),

            // Driver roster
            db.all(`SELECT name, shift FROM staff WHERE type = 'driver' ORDER BY name LIMIT 20`),

            // Full stop detail for the selected day only (keeps context small)
            db.all(`SELECT o.assigned_van, o.assigned_day,
                COALESCE(o.delivery_order, 999) AS delivery_order,
                o.status, o.order_number, o.assigned_staff,
                c.name, c.address, c.postcode, c.zone, cp.passport_data,
                pm.picker_names, pm.number_of_pickers, pm.picking_duration, pm.efficiency_score
                FROM orders o
                JOIN customers c ON o.customer_id = c.customer_id
                LEFT JOIN customer_passports cp ON cp.customer_id = c.customer_id
                LEFT JOIN picking_metrics pm ON pm.order_id = o.id
                WHERE o.assigned_van IS NOT NULL AND o.status IN ${ACTIVE}
                AND o.assigned_day = ?
                ORDER BY o.assigned_van, COALESCE(o.delivery_order, 999), c.name`, [activeDay]),

            // Count-only summary for all other days (no individual stops)
            db.all(`SELECT o.assigned_van, o.assigned_day, COUNT(*) AS stops,
                SUM(CASE WHEN o.status='pending'            THEN 1 ELSE 0 END) AS pend,
                SUM(CASE WHEN o.status='ready_for_delivery' THEN 1 ELSE 0 END) AS rdy,
                SUM(CASE WHEN o.status='delivering'         THEN 1 ELSE 0 END) AS deliv
                FROM orders o
                WHERE o.assigned_van IS NOT NULL AND o.status IN ${ACTIVE}
                AND o.assigned_day != ?
                GROUP BY o.assigned_van, o.assigned_day
                ORDER BY o.assigned_van, o.assigned_day`, [activeDay]),

            // Van → driver mapping (no date filter — assignment timestamps vary)
            db.all(`SELECT o.assigned_van AS van, o.assigned_day AS day, s.name AS driver
                FROM orders o JOIN staff s ON s.staff_id = o.assigned_driver
                WHERE o.assigned_driver IS NOT NULL AND o.assigned_van IS NOT NULL
                GROUP BY o.assigned_van, o.assigned_day ORDER BY o.assigned_van, o.assigned_day`),

            // Picking performance — last 7 days
            db.get(`SELECT COUNT(*) AS n,
                ROUND(AVG(picking_duration), 1) AS avg_mins,
                ROUND(AVG(efficiency_score), 0) AS avg_eff,
                ROUND(AVG(plants_per_hour),  1) AS avg_pph
                FROM picking_metrics WHERE created_at >= datetime('now', '-7 days')`),

            // Last 5 completed deliveries
            db.all(`SELECT c.name AS cust, pm.picking_duration AS mins,
                pm.efficiency_score AS eff, pm.plants_per_hour AS pph, pm.picker_names AS pickers
                FROM picking_metrics pm
                JOIN customers c ON pm.customer_id = c.customer_id
                WHERE pm.timestamp_delivered IS NOT NULL
                ORDER BY pm.created_at DESC LIMIT 5`),

            // Van names from settings (e.g. id:1 → "GK (Blue)")
            db.get(`SELECT value FROM system_settings WHERE key = 'config.vans'`),

            // All staff — used to resolve picker IDs in orders.assigned_staff
            db.all(`SELECT staff_id, name, type FROM staff ORDER BY name`)
        ]);

        // ── Build van name map  (id → "GK (Blue)", etc.) ────────────────────
        const vanNameMap = {};
        const vanShortMap = {}; // id → short code e.g. "GK"
        try {
            const vans = JSON.parse(vanConfig?.value || '[]');
            vans.forEach(v => {
                vanNameMap[v.id]  = v.name;                          // 1 → "GK (Blue)"
                vanShortMap[v.id] = v.name.split(' ')[0].toUpperCase(); // 1 → "GK"
            });
        } catch { /* ignore */ }

        const vanLabel = (id) => vanNameMap[id] ? `Van ${vanNameMap[id]} (id:${id})` : `Van ${id}`;

        // ── Build staff ID → name map (for resolving picker IDs) ────────────
        const staffIdMap = {};
        (allStaff || []).forEach(s => { staffIdMap[s.staff_id] = s.name; });

        // ── Log query results ────────────────────────────────────────────────
        console.log(`[AI] Q1  orders on routes     → total:${assigned?.total ?? 0}  (pend:${assigned?.pending ?? 0} pick:${assigned?.picking ?? 0} ready:${assigned?.ready ?? 0} deliv:${assigned?.delivering ?? 0})`);
        console.log(`[AI] Q2  unassigned pending   → ${unassigned?.count ?? 0} orders`);
        console.log(`[AI] Q3  driver roster        → ${drivers?.length ?? 0} drivers: ${drivers?.map(d=>d.name).join(', ') || 'none'}`);
        console.log(`[AI] Q4  today stops (Day ${activeDay}) → ${todayStops?.length ?? 0} stops`);
        todayStops?.forEach(s => console.log(`         ${vanLabel(s.assigned_van)}: ${s.name} [${s.status}]${s.passport_data ? ' +pp' : ''}`));
        console.log(`[AI] Q4b other days summary   → ${otherDays?.length ?? 0} van/day combos`);
        console.log(`[AI] Q5  van→driver map       → ${vanDrivers?.length ?? 0} assignments`);
        vanDrivers?.forEach(vd => console.log(`         ${vanLabel(vd.van)} Day ${vd.day}: ${vd.driver}`));
        console.log(`[AI] Q6  picking stats        → ${pickingStats?.n ?? 0} orders last 7 days`);
        console.log(`[AI] Q7  recent picks         → ${recentPicks?.length ?? 0} records`);
        console.log(`[AI] Q8  van names config     → ${Object.entries(vanNameMap).map(([id,n])=>`${id}:${n}`).join(', ') || 'none'}`);
        console.log(`[AI] Q9  all staff            → ${allStaff?.length ?? 0} people: ${allStaff?.map(s=>`${s.name}(id:${s.staff_id})`).join(', ') || 'none'}`);

        // ── Build structured context ─────────────────────────────────────────
        let ctx = '=== LIVE DATA ===\n';

        // Van name reference (so AI can map "GK" → id 1, etc.)
        if (Object.keys(vanNameMap).length) {
            ctx += `Van names: ${Object.entries(vanNameMap).map(([id, name]) => `${name}=id${id}`).join(', ')}\n`;
        }

        // Order totals
        const totalOn  = assigned?.total  || 0;
        const totalOff = unassigned?.count || 0;
        if (totalOn === 0) {
            ctx += `Orders: none currently assigned to routes.`;
            if (totalOff) ctx += ` (${totalOff} pending, not yet scheduled)`;
            ctx += '\n';
        } else {
            ctx += `Orders on routes: ${totalOn} total — pending:${assigned.pending} picking:${assigned.picking} ready:${assigned.ready} delivering:${assigned.delivering}`;
            if (totalOff) ctx += ` | unassigned pending: ${totalOff}`;
            ctx += '\n';
        }

        // ── Routes context ───────────────────────────────────────────────────
        const driverMap = {};
        vanDrivers?.forEach(vd => { driverMap[`${vd.van}_${vd.day}`] = vd.driver; });

        const dayNames = { 1:'Monday', 2:'Tuesday', 3:'Wednesday', 4:'Thursday', 5:'Friday', 6:'Saturday', 7:'Sunday' };

        // ── Selected day: full stop detail ───────────────────────────────────
        if (todayStops?.length) {
            // Group by van
            const todayByVan = {};
            todayStops.forEach(s => {
                const k = String(s.assigned_van);
                if (!todayByVan[k]) todayByVan[k] = [];
                todayByVan[k].push(s);
            });
            ctx += `\n${dayNames[activeDay] || 'Day ' + activeDay} (Day ${activeDay}) routes — full detail:\n`;
            Object.entries(todayByVan).forEach(([vanId, stops]) => {
                const drv  = driverMap[`${vanId}_${activeDay}`] || 'no driver assigned';
                const pend = stops.filter(s => s.status === 'pending').length;
                const pick = stops.filter(s => s.status === 'picking').length;
                const rdy  = stops.filter(s => s.status === 'ready_for_delivery').length;
                const dlv  = stops.filter(s => s.status === 'delivering').length;
                ctx += `\n  ${vanLabel(vanId)} — ${stops.length} stops | driver: ${drv} | pend:${pend} pick:${pick} ready:${rdy} deliv:${dlv}\n`;
                stops.forEach((s, i) => {
                    let line = `    ${i + 1}. ${s.name}`;
                    if (s.order_number)  line += ` | #${s.order_number}`;
                    line += ` | ${s.address || '?'}${s.postcode ? ', ' + s.postcode : ''}`;
                    if (s.zone)          line += ` | ${s.zone}`;
                    line += ` | ${s.status}`;
                    if (s.passport_data) {
                        try {
                            const p = JSON.parse(s.passport_data);
                            if (p.trolleyCount)                  line += ` | ${p.trolleyCount} trolleys`;
                            if (p.numberOfPlants)                line += ` | ${p.numberOfPlants} plants`;
                            if (p.plantVariety)                  line += ` | ${p.plantVariety}`;
                            if (p.specialDeliveryInstructions)   line += ` | NOTE: ${p.specialDeliveryInstructions}`;
                            if (p.preferredTimeWindow)           line += ` | time: ${p.preferredTimeWindow}`;
                            if (p.siteAccessRestrictions && p.siteAccessTimes) line += ` | access: ${p.siteAccessTimes}`;
                            if (p.onsiteContactName)             line += ` | contact: ${p.onsiteContactName}${p.onsiteContactPhone ? ' ' + p.onsiteContactPhone : ''}`;
                            if (p.qualityGrade)                  line += ` | grade: ${p.qualityGrade}`;
                            if (p.qualityNotes)                  line += ` | ${p.qualityNotes}`;
                            if (p.isRepeatCustomer)              line += ` | repeat x${p.totalOrdersCount}`;
                            if (p.paymentTerms)                  line += ` | ${p.paymentTerms}`;
                            if (p.potsToReturn && p.numberOfPotsToReturn > 0) line += ` | collect ${p.numberOfPotsToReturn} pots`;
                            if (p.substitutionsMade && p.substitutionDetails) line += ` | sub: ${p.substitutionDetails}`;
                        } catch { /* skip */ }
                    }
                    // Picker info — prefer assigned_staff (IDs → names), fall back to picking_metrics
                    let pickerShown = false;
                    if (s.assigned_staff) {
                        try {
                            const ids = JSON.parse(s.assigned_staff);
                            if (Array.isArray(ids) && ids.length) {
                                const names = ids.map(id => staffIdMap[id] || `staff#${id}`);
                                line += ` | pickers: ${names.join(', ')}`;
                                pickerShown = true;
                            }
                        } catch { /* skip */ }
                    }
                    if (!pickerShown && s.picker_names) {
                        try {
                            const pickers = JSON.parse(s.picker_names);
                            if (pickers.length) { line += ` | pickers: ${pickers.join(', ')}`; pickerShown = true; }
                        } catch {
                            if (s.picker_names !== '[]') { line += ` | pickers: ${s.picker_names}`; pickerShown = true; }
                        }
                    }
                    if (s.number_of_pickers)  line += ` | picker count: ${s.number_of_pickers}`;
                    if (s.picking_duration)   line += ` | pick time: ${s.picking_duration} mins`;
                    if (s.efficiency_score)   line += ` | efficiency: ${s.efficiency_score}`;
                    ctx += line + '\n';
                });
            });
        } else {
            ctx += `\n${dayNames[activeDay] || 'Day ' + activeDay}: no active stops.\n`;
        }

        // ── Other days: count summary only (keeps context small) ─────────────
        if (otherDays?.length) {
            ctx += '\nOther days (summary):\n';
            otherDays.forEach(r => {
                const drv = driverMap[`${r.assigned_van}_${r.assigned_day}`] || 'no driver';
                ctx += `  ${vanLabel(r.assigned_van)} ${dayNames[r.assigned_day] || 'Day '+r.assigned_day}: ${r.stops} stops | driver: ${drv} | pend:${r.pend} ready:${r.rdy} deliv:${r.deliv}\n`;
            });
        }

        // Which van/day the dispatcher has open
        if (vanId && dayId) {
            ctx += `\nDispatcher currently viewing: ${vanLabel(vanId)} ${dayNames[dayId] || 'Day '+dayId}\n`;
        }

        // Driver roster
        if (drivers?.length) {
            ctx += `\nDrivers: ${drivers.map(d => d.name + (d.shift ? ` (${d.shift})` : '')).join(', ')}\n`;
        }

        // Picking performance
        if (pickingStats?.n > 0) {
            ctx += `\nPicking last 7 days (${pickingStats.n} orders): avg ${pickingStats.avg_mins} mins, efficiency ${pickingStats.avg_eff}, ${pickingStats.avg_pph} plants/hr\n`;
        }
        if (recentPicks?.length) {
            ctx += 'Recent completed orders:\n';
            recentPicks.forEach(p => {
                const pks = (() => { try { return JSON.parse(p.pickers || '[]').join(', '); } catch { return p.pickers || '—'; } })();
                ctx += `  ${p.cust}: ${p.mins ?? '?'} mins | eff ${p.eff ?? '?'} | ${p.pph ?? '?'} pph | pickers: ${pks}\n`;
            });
        }

        // Route detail is now included for ALL routes above (not just selected van/day)

        // ── Customer name lookup ─────────────────────────────────────────────
        // Only runs when the message contains at least one proper-noun-like word
        // (starts with a capital letter, not a common sentence-starter)
        {
            const lastMsg = messages.filter(m => m.role === 'user').pop();
            if (lastMsg) {
                const STOP = new Set([
                    'the','of','for','and','or','is','are','in','on','at','to','a','an',
                    'show','me','give','tell','what','which','how','does','do','has','have','can','could',
                    'order','orders','customer','details','about','from','with','this','that','these',
                    'today','now','current','all','any','many','much','just','get','list','please',
                    'status','assign','assigned','van','day','route','driver','delivery','stop','stops',
                    'pending','picking','ready','delivering','delivered','cancelled','summarise','summary',
                    'there','been','were','will','would','should','going','come','back','next','last',
                    'how','many','are','there','i','its','my','our','your','their','his','her',
                    'information','info','notes','note','monday','tuesday','wednesday','thursday',
                    'friday','saturday','sunday','week','date','time','address','postcode','zone',
                    'passport','contact','phone','email','name','number','count','total','number'
                ]);
                // Extract candidate words (3+ chars, not a number, not a stop word)
                const words = lastMsg.content
                    .replace(/[^a-zA-Z0-9 ]/g, ' ')
                    .split(/\s+/)
                    .filter(w => w.length >= 3 && !/^\d+$/.test(w) && !STOP.has(w.toLowerCase()));

                // Only query DB if at least one word looks like a proper noun
                // (starts uppercase and is not a common sentence-starting word)
                const commonStarters = new Set(['What','Which','How','When','Where','Who','Why','Does','Did','Is','Are','Can','Could','Show','Tell','Give','List','Please','Summary','Summarise']);
                const hasProperNoun  = words.some(w => /^[A-Z]/.test(w) && !commonStarters.has(w));

                console.log(`[AI] Q10 customer name search → words: [${words.join(', ')}] | hasProperNoun: ${hasProperNoun}`);

                if (hasProperNoun && words.length >= 1 && words.length <= 7) {
                    const where  = words.map(() => 'c.name LIKE ?').join(' OR ');
                    const params = words.map(w => `%${w}%`);
                    console.log(`[AI] Q10 running:  SELECT ... WHERE ${words.map(w=>`name LIKE '%${w}%'`).join(' OR ')}`);
                    const hits = await db.all(`
                        SELECT c.name, c.address, c.postcode, c.zone,
                               o.status, o.assigned_van, o.assigned_day, o.order_number,
                               cp.passport_data
                        FROM customers c
                        LEFT JOIN orders o ON o.customer_id = c.customer_id
                             AND o.status IN ${ACTIVE}
                        LEFT JOIN customer_passports cp ON cp.customer_id = c.customer_id
                        WHERE ${where} LIMIT 5
                    `, params);

                    console.log(`[AI] Q10 result            → ${hits?.length ?? 0} customer(s) found: ${hits?.map(h=>h.name).join(', ') || 'none'}`);
                    if (hits?.length) {
                        ctx += '\nCustomer lookup:\n';
                        hits.forEach(h => {
                            let line = `  ${h.name} | ${h.address || ''}${h.postcode ? ', ' + h.postcode : ''}`;
                            if (h.zone)   line += ` | ${h.zone}`;
                            if (h.status) {
                                line += ` | ${h.status}`;
                                if (h.assigned_van) line += ` | Van ${h.assigned_van} Day ${h.assigned_day}`;
                                if (h.order_number) line += ` | #${h.order_number}`;
                            } else {
                                line += ` | no active order`;
                            }
                            if (h.passport_data) {
                                try {
                                    const p = JSON.parse(h.passport_data);
                                    if (p.trolleyCount)                line += ` | ${p.trolleyCount} trolleys`;
                                    if (p.numberOfPlants)              line += ` | ${p.numberOfPlants} plants`;
                                    if (p.plantVariety)                line += ` | ${p.plantVariety}`;
                                    if (p.specialDeliveryInstructions) line += ` | NOTE: ${p.specialDeliveryInstructions}`;
                                    if (p.preferredTimeWindow)         line += ` | time: ${p.preferredTimeWindow}`;
                                    if (p.onsiteContactName)           line += ` | contact: ${p.onsiteContactName}${p.onsiteContactPhone ? ' ' + p.onsiteContactPhone : ''}`;
                                    if (p.qualityGrade)                line += ` | grade: ${p.qualityGrade}`;
                                    if (p.qualityNotes)                line += ` | ${p.qualityNotes}`;
                                    if (p.isRepeatCustomer)            line += ` | repeat x${p.totalOrdersCount}`;
                                    if (p.paymentTerms)                line += ` | ${p.paymentTerms}`;
                                    if (p.potsToReturn && p.numberOfPotsToReturn > 0) line += ` | collect ${p.numberOfPotsToReturn} pots`;
                                } catch { /* skip */ }
                            }
                            ctx += line + '\n';
                        });
                    }
                }
            }
        }

        ctx += '=== END DATA ===';

        const fullContext = [context, ctx].filter(Boolean).join('\n\n');
        console.log(`[AI] Context built: ${fullContext.length} chars | queries took ${Date.now()-t0}ms`);
        console.log(`[AI] Forwarding to Llama 3.2 via Ollama...`);
        console.log('─'.repeat(60));

        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Accel-Buffering', 'no');

        const resp = await fetch(`${PYTHON_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages, context: fullContext })
        });

        if (!resp.ok) throw new Error(`Python service returned ${resp.status}`);
        resp.body.pipe(res);

    } catch (err) {
        console.error('[AI Chat]', err.message);
        if (!res.headersSent) {
            res.status(500).json({ error: 'AI unavailable. Make sure Ollama is running: ollama serve' });
        }
    }
});

// ========== EXTERNAL API INTEGRATION ENDPOINTS ==========

// Helper: resolve a dot-notation path in an object
function resolvePath(obj, path) {
    return path.split('.').reduce((acc, k) => (acc != null ? acc[k] : undefined), obj);
}

// Helper: apply a simple transform to a value
function applyTransform(value, transform) {
    if (value == null) return value;
    const v = String(value);
    switch (transform) {
        case 'uppercase':   return v.toUpperCase();
        case 'lowercase':   return v.toLowerCase();
        case 'trim':        return v.trim();
        case 'capitalize':  return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
        default:            return v;
    }
}

// Helper: build headers object for an external API call
function buildExternalHeaders(conn) {
    const headers = { 'Content-Type': 'application/json' };
    const cfg = JSON.parse(conn.auth_config || '{}');
    const extra = JSON.parse(conn.extra_headers || '[]');

    if (conn.auth_type === 'bearer') {
        headers['Authorization'] = `Bearer ${cfg.token || ''}`;
    } else if (conn.auth_type === 'basic') {
        const encoded = Buffer.from(`${cfg.username || ''}:${cfg.password || ''}`).toString('base64');
        headers['Authorization'] = `Basic ${encoded}`;
    } else if (conn.auth_type === 'api_key' && cfg.placement === 'header') {
        headers[cfg.header_name || 'X-Api-Key'] = cfg.key || '';
    } else if (conn.auth_type === 'custom') {
        (cfg.headers || []).forEach(h => { if (h.key) headers[h.key] = h.value || ''; });
    }
    extra.forEach(h => { if (h.key) headers[h.key] = h.value || ''; });
    return headers;
}

// Helper: build full URL (inject api_key as query param if needed)
function buildExternalUrl(conn) {
    const cfg = JSON.parse(conn.auth_config || '{}');
    let url = (conn.base_url || '').replace(/\/$/, '') + '/' + (conn.endpoint || '').replace(/^\//, '');
    if (conn.auth_type === 'api_key' && cfg.placement === 'query') {
        const sep = url.includes('?') ? '&' : '?';
        url += `${sep}${cfg.param_name || 'api_key'}=${encodeURIComponent(cfg.key || '')}`;
    }
    return url;
}

// GET /api/external/connections
app.get('/api/external/connections', async (req, res) => {
    try {
        const rows = await db.all('SELECT * FROM api_connections ORDER BY name');
        res.json({ success: true, connections: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/external/connections
app.post('/api/external/connections', async (req, res) => {
    try {
        const { name, base_url, endpoint, auth_type, auth_config, extra_headers, response_path, enabled } = req.body;
        if (!name || !base_url) return res.status(400).json({ success: false, message: 'name and base_url are required' });
        const result = await db.run(
            `INSERT INTO api_connections (name, base_url, endpoint, auth_type, auth_config, extra_headers, response_path, enabled)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, base_url, endpoint || '/', auth_type || 'none',
             JSON.stringify(auth_config || {}), JSON.stringify(extra_headers || []),
             response_path || '', enabled !== false ? 1 : 0]
        );
        res.json({ success: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/external/connections/:id
app.put('/api/external/connections/:id', async (req, res) => {
    try {
        const { name, base_url, endpoint, auth_type, auth_config, extra_headers, response_path, enabled } = req.body;
        await db.run(
            `UPDATE api_connections SET name=?, base_url=?, endpoint=?, auth_type=?, auth_config=?,
             extra_headers=?, response_path=?, enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
            [name, base_url, endpoint || '/', auth_type || 'none',
             JSON.stringify(auth_config || {}), JSON.stringify(extra_headers || []),
             response_path || '', enabled !== false ? 1 : 0, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/external/connections/:id
app.delete('/api/external/connections/:id', async (req, res) => {
    try {
        await db.run('DELETE FROM api_connections WHERE id=?', [req.params.id]);
        await db.run('DELETE FROM api_field_mappings WHERE connection_id=?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/external/connections/:id/mappings
app.get('/api/external/connections/:id/mappings', async (req, res) => {
    try {
        const rows = await db.all(
            'SELECT * FROM api_field_mappings WHERE connection_id=? ORDER BY sort_order, id',
            [req.params.id]
        );
        res.json({ success: true, mappings: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/external/connections/:id/mappings  (full replace)
app.post('/api/external/connections/:id/mappings', async (req, res) => {
    try {
        const connId = req.params.id;
        const { mappings } = req.body;
        await db.run('DELETE FROM api_field_mappings WHERE connection_id=?', [connId]);
        if (Array.isArray(mappings)) {
            for (let i = 0; i < mappings.length; i++) {
                const m = mappings[i];
                if (m.external_field && m.internal_field) {
                    await db.run(
                        'INSERT INTO api_field_mappings (connection_id, external_field, internal_field, transform, sort_order) VALUES (?,?,?,?,?)',
                        [connId, m.external_field, m.internal_field, m.transform || null, i]
                    );
                }
            }
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/external/connections/:id/fetch  — call external API, map fields, store in staging
app.post('/api/external/connections/:id/fetch', async (req, res) => {
    try {
        const conn = await db.get('SELECT * FROM api_connections WHERE id=?', [req.params.id]);
        if (!conn) return res.status(404).json({ success: false, message: 'Connection not found' });
        if (!conn.enabled) return res.status(400).json({ success: false, message: 'Connection is disabled' });

        const mappings = await db.all(
            'SELECT * FROM api_field_mappings WHERE connection_id=? ORDER BY sort_order, id',
            [conn.id]
        );

        const url = buildExternalUrl(conn);
        const headers = buildExternalHeaders(conn);

        console.log(`[API Import] Fetching: ${url}`);
        const response = await fetch(url, { headers, timeout: 30000 });
        if (!response.ok) {
            return res.status(502).json({ success: false, message: `External API returned ${response.status}: ${response.statusText}` });
        }

        let data = await response.json();

        // Navigate into nested response if response_path is set (e.g. "data.orders")
        if (conn.response_path) {
            data = resolvePath(data, conn.response_path);
        }

        const records = Array.isArray(data) ? data : [data];
        const batch = new Date().toISOString();

        // Clear previous staged records for this connection
        await db.run("DELETE FROM api_import_staging WHERE connection_id=? AND status='staged'", [conn.id]);

        let inserted = 0;
        for (const record of records) {
            const mappedData = {};
            for (const m of mappings) {
                let val = resolvePath(record, m.external_field);
                if (m.transform) val = applyTransform(val, m.transform);
                mappedData[m.internal_field] = val != null ? val : null;
            }
            await db.run(
                `INSERT INTO api_import_staging (connection_id, raw_data, mapped_data, import_batch, status)
                 VALUES (?, ?, ?, ?, 'staged')`,
                [conn.id, JSON.stringify(record), JSON.stringify(mappedData), batch]
            );
            inserted++;
        }

        res.json({ success: true, count: inserted, batch });
    } catch (err) {
        console.error('[API Import fetch]', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/external/staging?connection_id=x
app.get('/api/external/staging', async (req, res) => {
    try {
        const { connection_id } = req.query;
        let rows;
        if (connection_id) {
            rows = await db.all(
                "SELECT * FROM api_import_staging WHERE connection_id=? AND status='staged' ORDER BY id",
                [connection_id]
            );
        } else {
            rows = await db.all("SELECT * FROM api_import_staging WHERE status='staged' ORDER BY id");
        }
        // Parse JSON fields
        rows = rows.map(r => ({
            ...r,
            raw_data: JSON.parse(r.raw_data || '{}'),
            mapped_data: JSON.parse(r.mapped_data || '{}'),
            passport_data: r.passport_data ? JSON.parse(r.passport_data) : {}
        }));
        res.json({ success: true, records: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/external/staging/:id  — update assignment fields on a staged record
app.put('/api/external/staging/:id', async (req, res) => {
    try {
        const { assigned_day, assigned_van, assigned_driver, is_collection, passport_data, mapped_data, status } = req.body;
        await db.run(
            `UPDATE api_import_staging SET
                assigned_day=COALESCE(?,assigned_day),
                assigned_van=COALESCE(?,assigned_van),
                assigned_driver=COALESCE(?,assigned_driver),
                is_collection=COALESCE(?,is_collection),
                passport_data=COALESCE(?,passport_data),
                mapped_data=COALESCE(?,mapped_data),
                status=COALESCE(?,status)
             WHERE id=?`,
            [
                assigned_day ?? null, assigned_van ?? null, assigned_driver ?? null,
                is_collection != null ? (is_collection ? 1 : 0) : null,
                passport_data != null ? JSON.stringify(passport_data) : null,
                mapped_data != null ? JSON.stringify(mapped_data) : null,
                status || null,
                req.params.id
            ]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/external/staging/:id
app.delete('/api/external/staging/:id', async (req, res) => {
    try {
        await db.run('DELETE FROM api_import_staging WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/external/staging/confirm  — confirm selected staged records → customers + orders
app.post('/api/external/staging/confirm', async (req, res) => {
    try {
        const { ids } = req.body; // array of staging ids to confirm
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'No records selected' });
        }

        const results = { created: 0, errors: [] };

        for (const stagingId of ids) {
            const record = await db.get('SELECT * FROM api_import_staging WHERE id=?', [stagingId]);
            if (!record || record.status !== 'staged') continue;

            const mapped = JSON.parse(record.mapped_data || '{}');
            const passport = record.passport_data ? JSON.parse(record.passport_data) : {};

            try {
                // Generate a unique customer_id if not mapped
                const existingMaxId = await db.get('SELECT MAX(customer_id) as m FROM customers');
                const newCustomerId = (existingMaxId.m || 1000) + 1 + results.created;

                const orderNumber = mapped.order_number || `IMP-${stagingId}-${Date.now()}`;
                const zone = record.is_collection ? 'Collection' : (mapped.zone || 'Local');

                // Insert customer
                await db.run(
                    `INSERT INTO customers (customer_id, name, address, postcode, latitude, longitude, zone, original_data)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        newCustomerId,
                        mapped.name || 'Unknown',
                        mapped.address || '',
                        mapped.postcode || '',
                        mapped.latitude ? parseFloat(mapped.latitude) : null,
                        mapped.longitude ? parseFloat(mapped.longitude) : null,
                        zone,
                        JSON.stringify(mapped)
                    ]
                );

                const customer = await db.get('SELECT id FROM customers WHERE customer_id=?', [newCustomerId]);

                // Insert passport if any passport data provided
                const passportPayload = {
                    numberOfPlants: mapped.number_of_plants || passport.numberOfPlants || null,
                    plantVariety: mapped.plant_variety || passport.plantVariety || null,
                    specialDeliveryInstructions: mapped.notes || passport.specialDeliveryInstructions || null,
                    onsiteContactName: mapped.contact_name || passport.onsiteContactName || null,
                    onsiteContactPhone: mapped.phone || passport.onsiteContactPhone || null,
                    ...passport
                };
                const hasPassport = Object.values(passportPayload).some(v => v != null && v !== '');
                if (hasPassport) {
                    await db.run(
                        `INSERT OR REPLACE INTO customer_passports (customer_id, passport_data) VALUES (?, ?)`,
                        [customer.id, JSON.stringify(passportPayload)]
                    );
                }

                // Insert order
                await db.run(
                    `INSERT INTO orders (customer_id, order_number, status, assigned_van, assigned_day, assigned_driver, zone)
                     VALUES (?, ?, 'pending', ?, ?, ?, ?)`,
                    [
                        customer.id, orderNumber,
                        record.assigned_van || null, record.assigned_day || null,
                        record.assigned_driver || null, zone
                    ]
                );

                // Mark staged record as confirmed
                await db.run("UPDATE api_import_staging SET status='confirmed' WHERE id=?", [stagingId]);
                results.created++;

            } catch (innerErr) {
                console.error(`[API Import confirm] record ${stagingId}:`, innerErr.message);
                results.errors.push({ id: stagingId, error: innerErr.message });
            }
        }

        // Broadcast update to all clients
        io.emit('delivery-data-updated', { source: 'api-import' });

        res.json({ success: true, created: results.created, errors: results.errors });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/external/connections/:id/test  — test connection without storing staging data
app.post('/api/external/connections/:id/test', async (req, res) => {
    try {
        const conn = await db.get('SELECT * FROM api_connections WHERE id=?', [req.params.id]);
        if (!conn) return res.status(404).json({ success: false, message: 'Connection not found' });

        const url = buildExternalUrl(conn);
        const headers = buildExternalHeaders(conn);

        const response = await fetch(url, { headers, timeout: 15000 });
        if (!response.ok) {
            return res.json({ success: false, status: response.status, message: `HTTP ${response.status}: ${response.statusText}` });
        }
        let data = await response.json();
        if (conn.response_path) data = resolvePath(data, conn.response_path);
        const count = Array.isArray(data) ? data.length : 1;
        const sample = Array.isArray(data) ? data[0] : data;
        res.json({ success: true, count, sample, keys: sample ? Object.keys(sample) : [] });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// For any other route, serve index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

const PORT       = parseInt(process.env.PORT       || 3000);
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || 3443);
const activePort = HTTPS_ENABLED ? HTTPS_PORT : PORT;
const protocol   = HTTPS_ENABLED ? 'https' : 'http';

server.listen(activePort, '0.0.0.0', () => {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    console.log(`[${HTTPS_ENABLED ? 'HTTPS' : 'HTTP'}] Server running on port ${activePort}`);
    console.log(`- Local:   ${protocol}://localhost:${activePort}`);
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`- Network: ${protocol}://${net.address}:${activePort}`);
            }
        }
    }
});

// When HTTPS is active, redirect plain HTTP requests to HTTPS
if (HTTPS_ENABLED) {
    const redirectServer = http.createServer((req, res) => {
        const host   = (req.headers.host || 'localhost').replace(/:\d+$/, '');
        const target = `https://${host}${HTTPS_PORT !== 443 ? ':' + HTTPS_PORT : ''}${req.url}`;
        res.writeHead(301, { Location: target });
        res.end();
    });
    redirectServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`[HTTP→HTTPS] Port ${PORT} already in use — stop any old server process and restart to enable the HTTP redirect.`);
        } else {
            console.error('[HTTP→HTTPS] Redirect server error:', err.message);
        }
    });
    redirectServer.listen(PORT, '0.0.0.0', () => {
        console.log(`[HTTP→HTTPS] Redirect active on port ${PORT} → ${HTTPS_PORT}`);
    });
}