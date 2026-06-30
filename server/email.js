const nodemailer = require('nodemailer');

let transporter = null;
let cfg = {};

function init(config) {
    cfg = config || {};
    if (!cfg.smtpHost || !cfg.smtpUser || !cfg.smtpPass) {
        transporter = null;
        return;
    }
    transporter = nodemailer.createTransport({
        host:   cfg.smtpHost,
        port:   parseInt(cfg.smtpPort) || 587,
        secure: parseInt(cfg.smtpPort) === 465,
        auth:   { user: cfg.smtpUser, pass: cfg.smtpPass },
        tls:    { rejectUnauthorized: false },
    });
}

function isReady() { return !!transporter; }

async function send(to, subject, html) {
    if (!transporter || !to) return { sent: false, reason: 'not configured' };
    try {
        await transporter.sendMail({
            from:    cfg.smtpFrom || cfg.smtpUser,
            to, subject, html,
        });
        return { sent: true };
    } catch (err) {
        console.error('[email]', err.message);
        return { sent: false, reason: err.message };
    }
}

// ── Templates ─────────────────────────────────────────────────────────────────
function tplOutForDelivery({ customerName, driverName, orderNumber, companyName }) {
    return {
        subject: `Your delivery is on the way — ${companyName || 'Delivery'}`,
        html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
            <h2 style="color:#16a34a;margin-bottom:4px;">Your delivery is on its way!</h2>
            <p style="color:#374151;font-size:15px;">Hi ${customerName},</p>
            <p style="color:#374151;font-size:15px;">
                Great news — your order${orderNumber ? ` <strong>#${orderNumber}</strong>` : ''} is out for delivery today.
                ${driverName ? `Your driver is <strong>${driverName}</strong>.` : ''}
            </p>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0;">
                <p style="margin:0;color:#166534;font-size:14px;">
                    Please make sure someone is available to receive your delivery.
                </p>
            </div>
            <p style="color:#6b7280;font-size:13px;">— ${companyName || 'The Delivery Team'}</p>
        </div>`
    };
}

function tplDelivered({ customerName, orderNumber, companyName }) {
    return {
        subject: `Delivery complete — ${companyName || 'Delivery'}`,
        html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
            <h2 style="color:#16a34a;margin-bottom:4px;">Your order has been delivered!</h2>
            <p style="color:#374151;font-size:15px;">Hi ${customerName},</p>
            <p style="color:#374151;font-size:15px;">
                Your order${orderNumber ? ` <strong>#${orderNumber}</strong>` : ''} has been successfully delivered.
            </p>
            <p style="color:#374151;font-size:15px;">Thank you for your order.</p>
            <p style="color:#6b7280;font-size:13px;">— ${companyName || 'The Delivery Team'}</p>
        </div>`
    };
}

function tplDriverAssigned({ customerName, driverName, orderNumber, companyName }) {
    return {
        subject: `Your driver has been assigned — ${companyName || 'Delivery'}`,
        html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
            <h2 style="color:#2563eb;margin-bottom:4px;">Driver assigned to your delivery</h2>
            <p style="color:#374151;font-size:15px;">Hi ${customerName},</p>
            <p style="color:#374151;font-size:15px;">
                Your order${orderNumber ? ` <strong>#${orderNumber}</strong>` : ''} has been assigned to
                driver <strong>${driverName}</strong>.
            </p>
            <p style="color:#6b7280;font-size:13px;">— ${companyName || 'The Delivery Team'}</p>
        </div>`
    };
}

module.exports = { init, isReady, send, tplOutForDelivery, tplDelivered, tplDriverAssigned };
