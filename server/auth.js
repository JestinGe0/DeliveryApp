/**
 * auth.js — JWT authentication middleware and helpers
 *
 * Flow:
 *   POST /api/login  → verify bcrypt password → issue JWT in httpOnly cookie
 *   GET  /api/me     → verify cookie → return user info
 *   POST /api/logout → clear cookie
 *   All  /api/*      → requireAuth middleware checks cookie
 */

const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');

const SALT_ROUNDS = 10;
const COOKIE_NAME = 'pep_token';
const JWT_SECRET  = process.env.JWT_SECRET || 'pep-delivery-secret-change-in-production';
const JWT_EXPIRY  = '12h';

// ── Helpers ──────────────────────────────────────────────────────────────────

function signToken(user) {
    return jwt.sign(
        { id: user.id, username: user.username, role: user.role, staffType: user.staff_type, fullName: user.full_name },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
    );
}

function cookieOpts() {
    return {
        httpOnly: true,
        sameSite: 'lax',
        maxAge:   12 * 60 * 60 * 1000,   // 12 hours in ms
        secure:   process.env.HTTPS_ENABLED === 'true'
    };
}

async function hashPassword(plain) {
    return bcrypt.hash(plain, SALT_ROUNDS);
}

async function verifyPassword(plain, hash) {
    // Support plain-text passwords that haven't been migrated yet
    if (!hash.startsWith('$2')) return plain === hash;
    return bcrypt.compare(plain, hash);
}

// ── Middleware ────────────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
    const token = req.cookies && req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ success: false, message: 'Not authenticated' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.clearCookie(COOKIE_NAME);
        return res.status(401).json({ success: false, message: 'Session expired — please log in again' });
    }
}

function requireRole(...roles) {
    return [requireAuth, (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Insufficient permissions' });
        }
        next();
    }];
}

module.exports = { hashPassword, verifyPassword, signToken, cookieOpts, requireAuth, requireRole, COOKIE_NAME };
