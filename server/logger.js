// ========== PEP DELIVERY PLATFORM — LOGGER ==========
// Writes timestamped log entries to logs/YYYY-MM-DD.log
// Keeps last 30 days of logs, deletes older files automatically.
// Also exposes a /api/logs endpoint so you can read the log from the browser.

const fs   = require('fs');
const path = require('path');

const LOG_DIR       = path.join(__dirname, '..', 'logs');
const MAX_LOG_DAYS  = 30;
const LEVELS        = { INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR', DEBUG: 'DEBUG' };

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function _pad(n) { return String(n).padStart(2, '0'); }

function _timestamp() {
    const d = new Date();
    return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())} `
         + `${_pad(d.getHours())}:${_pad(d.getMinutes())}:${_pad(d.getSeconds())}`;
}

function _todayFile() {
    const d = new Date();
    return path.join(LOG_DIR, `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}.log`);
}

function _write(level, ...args) {
    const message = args.map(a => {
        if (a instanceof Error) return `${a.message}\n${a.stack || ''}`;
        if (typeof a === 'object') return JSON.stringify(a);
        return String(a);
    }).join(' ');

    const line = `[${_timestamp()}] [${level}] ${message}\n`;

    // Write to file (append, non-blocking)
    fs.appendFile(_todayFile(), line, () => {});

    // Also output to terminal with colour
    const colours = { INFO: '\x1b[36m', WARN: '\x1b[33m', ERROR: '\x1b[31m', DEBUG: '\x1b[90m' };
    process.stdout.write(`${colours[level] || ''}${line}\x1b[0m`);
}

// Purge log files older than MAX_LOG_DAYS
function _purgeOldLogs() {
    try {
        const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.log'));
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - MAX_LOG_DAYS);
        files.forEach(f => {
            const filePath = path.join(LOG_DIR, f);
            const stat = fs.statSync(filePath);
            if (stat.mtimeMs < cutoff.getTime()) {
                fs.unlinkSync(filePath);
                _write(LEVELS.INFO, `[logger] Removed old log: ${f}`);
            }
        });
    } catch (e) { /* ignore */ }
}

// Run purge once on startup, then daily at midnight
_purgeOldLogs();
setInterval(_purgeOldLogs, 24 * 60 * 60 * 1000);

// ── Public API ────────────────────────────────────────────────────────────────
const logger = {
    info:  (...a) => _write(LEVELS.INFO,  ...a),
    warn:  (...a) => _write(LEVELS.WARN,  ...a),
    error: (...a) => _write(LEVELS.ERROR, ...a),
    debug: (...a) => _write(LEVELS.DEBUG, ...a),

    // Call once after Express app is created to patch global console and attach routes
    attach(app) {
        // Patch console so existing console.log/warn/error calls go to the log file too
        const _origLog   = console.log.bind(console);
        const _origWarn  = console.warn.bind(console);
        const _origError = console.error.bind(console);

        console.log   = (...a) => _write(LEVELS.INFO,  ...a);
        console.warn  = (...a) => _write(LEVELS.WARN,  ...a);
        console.error = (...a) => _write(LEVELS.ERROR, ...a);

        // Catch unhandled promise rejections
        process.on('unhandledRejection', (reason) => {
            _write(LEVELS.ERROR, '[unhandledRejection]', reason instanceof Error ? reason : String(reason));
        });

        // Catch uncaught exceptions (log then exit so the process restarts cleanly)
        process.on('uncaughtException', (err) => {
            _write(LEVELS.ERROR, '[uncaughtException]', err);
            process.exit(1);
        });

        // HTTP request logger middleware (logs every request)
        app.use((req, res, next) => {
            const start = Date.now();
            res.on('finish', () => {
                const ms      = Date.now() - start;
                const level   = res.statusCode >= 500 ? LEVELS.ERROR
                              : res.statusCode >= 400 ? LEVELS.WARN
                              : LEVELS.INFO;
                _write(level, `[http] ${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`);
            });
            next();
        });

        // ── REST endpoint: GET /api/logs ──────────────────────────────────────
        // Returns list of available log files
        app.get('/api/logs', (req, res) => {
            try {
                const files = fs.readdirSync(LOG_DIR)
                    .filter(f => f.endsWith('.log'))
                    .sort()
                    .reverse()
                    .map(f => {
                        const stat = fs.statSync(path.join(LOG_DIR, f));
                        return { name: f, size: stat.size, modified: stat.mtime };
                    });
                res.json({ success: true, files });
            } catch (e) {
                res.json({ success: false, error: e.message });
            }
        });

        // GET /api/logs/:filename — read a specific log file
        // Optional query: ?level=ERROR&search=keyword&lines=200
        app.get('/api/logs/:filename', (req, res) => {
            try {
                const name = path.basename(req.params.filename); // prevent path traversal
                if (!/^\d{4}-\d{2}-\d{2}\.log$/.test(name)) {
                    return res.status(400).json({ success: false, error: 'Invalid filename' });
                }
                const filePath = path.join(LOG_DIR, name);
                if (!fs.existsSync(filePath)) {
                    return res.status(404).json({ success: false, error: 'Log file not found' });
                }

                let lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);

                // Filter by level
                if (req.query.level) {
                    const lvl = req.query.level.toUpperCase();
                    lines = lines.filter(l => l.includes(`[${lvl}]`));
                }

                // Filter by search term
                if (req.query.search) {
                    const term = req.query.search.toLowerCase();
                    lines = lines.filter(l => l.toLowerCase().includes(term));
                }

                // Limit to last N lines (default 500)
                const limit = parseInt(req.query.lines) || 500;
                if (lines.length > limit) lines = lines.slice(-limit);

                res.json({ success: true, file: name, lines, total: lines.length });
            } catch (e) {
                res.status(500).json({ success: false, error: e.message });
            }
        });

        // POST /api/logs/client — receive client-side JS errors
        app.post('/api/logs/client', (req, res) => {
            const { level = 'ERROR', message, source, stack, url } = req.body || {};
            _write(level.toUpperCase() === 'WARN' ? LEVELS.WARN : LEVELS.ERROR,
                `[client] ${message || '?'} | source: ${source || url || '?'} | ${stack || ''}`);
            res.json({ success: true });
        });

        logger.info('[logger] Logging started — writing to', LOG_DIR);
    }
};

module.exports = logger;
