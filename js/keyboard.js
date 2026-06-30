// ========== KEYBOARD SHORTCUTS ==========

const _KB_SCREENS = [
    { key: '1', screen: 'map',          label: 'Map' },
    { key: '2', screen: 'orders',       label: 'Orders' },
    { key: '3', screen: 'plan',         label: 'Weekly Plan' },
    { key: '4', screen: 'staff',        label: 'Staff' },
    { key: '5', screen: 'gamification', label: 'Gamification' },
    { key: '6', screen: 'grouping',     label: 'Grouping' },
    { key: '7', screen: 'analytics',    label: 'Analytics' },
    { key: '8', screen: 'roi',          label: 'ROI' },
    { key: '9', screen: 'pickers',      label: 'Pickers' },
];

function _kbCurrentScreen() {
    const active = document.querySelector('.screen.active');
    return active ? active.id.replace('screen-', '') : null;
}

function _kbSwitchScreen(screenId) {
    if (typeof switchScreen === 'function') {
        // Fake the event so nav tab highlighting works
        const tab = document.querySelector(`.nav-tab[onclick*="${screenId}"]`);
        const fakeEvent = { target: tab || document.createElement('div') };
        const origEvent = window.event;
        Object.defineProperty(window, 'event', { value: fakeEvent, writable: true, configurable: true });
        switchScreen(screenId);
        Object.defineProperty(window, 'event', { value: origEvent, writable: true, configurable: true });
    }
}

function _kbFocusSearch() {
    // Focus the orders search if on that screen, else the modal search if open
    const ordersSearch = document.getElementById('ordersSearchInput');
    const modalSearch  = document.getElementById('modalSearchInput');
    const modalOpen    = document.getElementById('customerModal')?.classList.contains('active');

    if (modalOpen && modalSearch) {
        modalSearch.focus(); modalSearch.select();
    } else if (ordersSearch && _kbCurrentScreen() === 'orders') {
        ordersSearch.focus(); ordersSearch.select();
    }
}

function _kbCloseModals() {
    const modals = [
        { id: 'customerModal',      fn: () => typeof closeCustomerModal === 'function' && closeCustomerModal() },
        { id: 'zoneReassignModal',  fn: () => typeof closeZoneReassignModal === 'function' && closeZoneReassignModal() },
        { id: 'statusModal',        fn: () => { const m = document.getElementById('statusModal'); if (m) m.remove(); } },
        { id: 'pillDetailModal',    fn: () => typeof closePillDetail === 'function' && closePillDetail() },
        { id: 'runMoveModal',       fn: () => typeof closeRunMoveModal === 'function' && closeRunMoveModal() },
        { id: 'kbHelpOverlay',      fn: _kbHideHelp },
    ];
    let closed = false;
    for (const { id, fn } of modals) {
        const el = document.getElementById(id);
        if (el && (el.classList.contains('active') || el.style.display === 'flex')) {
            fn(); closed = true; break;
        }
    }
    // Exit bulk mode on Escape
    if (!closed && typeof exitBulkMode === 'function') exitBulkMode();
}

// ── Help overlay ──────────────────────────────────────────────────────────────

function _kbShowHelp() {
    if (document.getElementById('kbHelpOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'kbHelpOverlay';
    overlay.onclick = e => { if (e.target === overlay) _kbHideHelp(); };
    overlay.style.cssText = `position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.55);
        backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;`;

    const screenRows = _KB_SCREENS.map(s =>
        `<tr><td style="padding:4px 16px 4px 0;color:#94a3b8;font-size:13px;">Alt + ${s.key}</td>
             <td style="padding:4px 0;font-size:13px;">Go to ${s.label}</td></tr>`
    ).join('');

    overlay.innerHTML = `
        <div style="background:#1e293b;color:#f1f5f9;border-radius:16px;padding:32px 40px;
                    box-shadow:0 24px 64px rgba(0,0,0,0.5);max-width:500px;width:90%;max-height:90vh;overflow-y:auto;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
                <h2 style="margin:0;font-size:1.3rem;">Keyboard Shortcuts</h2>
                <button onclick="_kbHideHelp()" style="background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr><th colspan="2" style="text-align:left;padding:0 0 8px;color:#6366f1;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Navigation</th></tr>
                </thead>
                <tbody>${screenRows}</tbody>
            </table>
            <table style="width:100%;border-collapse:collapse;margin-top:20px;">
                <thead>
                    <tr><th colspan="2" style="text-align:left;padding:0 0 8px;color:#6366f1;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Actions</th></tr>
                </thead>
                <tbody>
                    <tr><td style="padding:4px 16px 4px 0;color:#94a3b8;font-size:13px;">Ctrl + F</td><td style="font-size:13px;">Focus search</td></tr>
                    <tr><td style="padding:4px 16px 4px 0;color:#94a3b8;font-size:13px;">Ctrl + Z</td><td style="font-size:13px;">Undo last reassignment</td></tr>
                    <tr><td style="padding:4px 16px 4px 0;color:#94a3b8;font-size:13px;">Ctrl + Y / Ctrl+Shift+Z</td><td style="font-size:13px;">Redo</td></tr>
                    <tr><td style="padding:4px 16px 4px 0;color:#94a3b8;font-size:13px;">Escape</td><td style="font-size:13px;">Close modal / exit mode</td></tr>
                    <tr><td style="padding:4px 16px 4px 0;color:#94a3b8;font-size:13px;">?</td><td style="font-size:13px;">Show this help</td></tr>
                </tbody>
            </table>
        </div>`;
    document.body.appendChild(overlay);
}

function _kbHideHelp() {
    const el = document.getElementById('kbHelpOverlay');
    if (el) el.remove();
}

// ── Main keydown handler ───────────────────────────────────────────────────────

document.addEventListener('keydown', function(e) {
    const tag = (e.target.tagName || '').toLowerCase();
    const inInput = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;

    // Escape — always works regardless of focus
    if (e.key === 'Escape') {
        _kbCloseModals();
        return;
    }

    // Ctrl+Z — undo
    if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
        if (!inInput) { e.preventDefault(); if (typeof historyUndo === 'function') historyUndo(); }
        return;
    }

    // Ctrl+Y or Ctrl+Shift+Z — redo
    if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
        if (!inInput) { e.preventDefault(); if (typeof historyRedo === 'function') historyRedo(); }
        return;
    }

    // Ctrl+F — focus search
    if (e.ctrlKey && e.key === 'f') {
        const ordersSearch = document.getElementById('ordersSearchInput');
        const modalOpen    = document.getElementById('customerModal')?.classList.contains('active');
        if (ordersSearch || modalOpen) {
            e.preventDefault();
            _kbFocusSearch();
        }
        return;
    }

    // Skip remaining shortcuts when typing in inputs
    if (inInput) return;

    // ? — help overlay
    if (e.key === '?') {
        _kbShowHelp();
        return;
    }

    // Alt+1–9 — screen switching
    if (e.altKey && !e.ctrlKey) {
        const match = _KB_SCREENS.find(s => s.key === e.key);
        if (match) {
            e.preventDefault();
            _kbSwitchScreen(match.screen);
        }
    }
});

window._kbShowHelp  = _kbShowHelp;
window._kbHideHelp  = _kbHideHelp;
