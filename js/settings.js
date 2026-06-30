// ========== SETTINGS PAGE FUNCTIONS ==========

// Apply saved theme immediately on load to avoid flash of default theme
(function() {
    var t = localStorage.getItem('PEP_app_theme');
    if (t && t !== 'default') document.documentElement.setAttribute('data-theme', t);
})();

// Global variables for settings page
let settingsVans = [];
let settingsZones = [];
let settingsActiveDays = [1, 2, 3, 4, 5, 6, 7];
let settingsTimeFormat = '24';
let settingsMapStyle = 'streets';
let settingsChallenges = {};
let settingsMonthlyAwards = {};

// Switch between settings tabs
function switchSettingsTab(tabName) {
    const tabs = document.querySelectorAll('.settings-tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');
    
    const contents = document.querySelectorAll('.settings-tab-content');
    contents.forEach(content => content.classList.remove('active'));
    
    const selectedTab = document.getElementById(`settings-${tabName}-tab`);
    if (selectedTab) selectedTab.classList.add('active');
    
    // Refresh tab data
    if (tabName === 'vans') refreshSettingsVansList();
    else if (tabName === 'zones') refreshSettingsZonesList();
    else if (tabName === 'days') refreshSettingsDaysList();
    else if (tabName === 'gamification') refreshSettingsGamificationList();
    else if (tabName === 'customers') renderSettingsCustomerList();
    else if (tabName === 'users') adminLoadUsers();
    else if (tabName === 'map') refreshSettingsMapPicker();
    else if (tabName === 'api') apiLoadConnections();
    else if (tabName === 'audit') auditLoadLogs();
    else if (tabName === 'system') loadPlanUsage();
    else if (tabName === 'email') loadEmailSettings();
}

// ========== PLAN & USAGE ==========
function loadPlanUsage() {
    fetch(SERVER_URL + '/api/plan', { credentials: 'include' })
        .then(r => r.json())
        .then(d => {
            if (!d.success) return;
            renderPlanSelector(d.plan);
            renderUsageBars(d.usage, d.plan);
        })
        .catch(err => console.error('Plan load error', err));
}

function renderPlanSelector(activePlan) {
    const el = document.getElementById('plan-selector');
    if (!el) return;
    const COLORS = { free: '#6b7280', starter: '#2563eb', pro: '#7c3aed', enterprise: '#059669' };
    const color = COLORS[activePlan.key] || '#6b7280';
    const limitsText = [
        activePlan.maxCustomers === null ? 'Unlimited customers' : activePlan.maxCustomers + ' customers',
        activePlan.maxUsers     === null ? 'Unlimited users'     : activePlan.maxUsers     + ' users',
        activePlan.maxVans      === null ? 'Unlimited vans'      : activePlan.maxVans      + ' vans',
    ].join(' · ');
    el.innerHTML = `
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
            <span style="padding:8px 20px;border-radius:8px;font-size:15px;font-weight:800;
                background:${color};color:white;letter-spacing:0.3px;">
                ${activePlan.name}
            </span>
            <span style="font-size:13px;color:var(--text-muted);">${limitsText}</span>
            <span style="font-size:11px;color:var(--text-muted);font-style:italic;">
                Plan set by your software vendor
            </span>
        </div>`;
}

function renderUsageBars(usage, plan) {
    const items = [
        { id: 'usage-customers', label: 'Customers', key: 'maxCustomers', icon: 'fa-users',     current: usage.customers },
        { id: 'usage-users',     label: 'Users',     key: 'maxUsers',     icon: 'fa-user-cog',  current: usage.users },
        { id: 'usage-vans',      label: 'Vans',      key: 'maxVans',      icon: 'fa-truck',      current: usage.vans },
    ];
    items.forEach(item => {
        const el = document.getElementById(item.id);
        if (!el) return;
        const max = plan[item.key];
        const unlimited = max === null;
        const pct = unlimited ? 0 : Math.min(100, Math.round((item.current / max) * 100));
        const warn = !unlimited && pct >= 80;
        const over = !unlimited && item.current >= max;
        const barColor = over ? '#dc2626' : warn ? '#f59e0b' : '#16a34a';
        el.innerHTML = `
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">
                <i class="fas ${item.icon}" style="margin-right:5px;"></i>${item.label}
            </div>
            <div style="font-size:22px;font-weight:800;color:${over ? '#dc2626' : 'var(--text)'};">
                ${item.current}<span style="font-size:14px;font-weight:500;color:var(--text-muted);">/${unlimited ? '∞' : max}</span>
            </div>
            ${unlimited ? '<div style="font-size:12px;color:#16a34a;margin-top:4px;">Unlimited</div>' : `
            <div style="background:var(--border);border-radius:4px;height:6px;margin-top:8px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:${barColor};border-radius:4px;transition:width .4s;"></div>
            </div>
            <div style="font-size:11px;color:${barColor};margin-top:4px;">${over ? 'Limit reached' : warn ? `${max - item.current} remaining` : `${pct}% used`}</div>
            `}`;
    });
}


// ========== AUDIT LOG ==========
var _auditOffset = 0;
var _auditLimit  = 50;

function auditFormatDetails(action, detailsStr) {
    if (!detailsStr) return '—';
    var obj;
    try { obj = JSON.parse(detailsStr); } catch(e) { return detailsStr; }

    function camel(str) {
        return str.replace(/([A-Z])/g, ' $1').replace(/^./, function(c) { return c.toUpperCase(); }).trim();
    }

    if (action === 'config.update') {
        var keys = Array.isArray(obj.keys) ? obj.keys : (obj.keys ? String(obj.keys).split(',') : []);
        if (!keys.length) return '—';
        var readable = keys.map(camel);
        return '<span title="' + readable.join(', ') + '" style="cursor:default;">' +
               '<strong>' + keys.length + ' field' + (keys.length !== 1 ? 's' : '') + ' updated:</strong> ' +
               readable.slice(0, 4).join(', ') + (readable.length > 4 ? ' +' + (readable.length - 4) + ' more' : '') +
               '</span>';
    }
    if (action === 'auth.login_failed') {
        return obj.reason || 'Failed login attempt';
    }
    if (action === 'customer.import_csv') {
        var n = obj.imported || 0;
        return n + ' customer' + (n !== 1 ? 's' : '') + ' imported' + (obj.source ? ' (' + obj.source + ')' : '');
    }
    if (action === 'delivery.save') {
        var n = obj.customers || 0;
        return n + ' customer' + (n !== 1 ? 's' : '') + ' saved';
    }
    if (action === 'user.create' || action === 'user.update') {
        var parts = [];
        if (obj.role)              parts.push('Role: ' + obj.role);
        if (obj.fullName)          parts.push('Name: ' + obj.fullName);
        if (obj.staffType)         parts.push('Type: ' + obj.staffType);
        if (obj.password)          parts.push('Password changed');
        if (obj.active !== undefined) parts.push(obj.active ? 'Account enabled' : 'Account disabled');
        return parts.join(' &middot; ') || '—';
    }
    if (action === 'customer.create' || action === 'customer.update') {
        var parts = [];
        if (obj.zone)    parts.push('Zone: ' + obj.zone);
        if (obj.address) parts.push(obj.address);
        return parts.join(' &middot; ') || '—';
    }

    // fallback: generic key: value pairs
    var pairs = Object.entries(obj).map(function(e) { return camel(String(e[0])) + ': ' + e[1]; });
    return pairs.join(' &middot; ') || '—';
}

function auditLoadLogs(resetPage) {
    if (resetPage !== false) _auditOffset = 0;
    var user   = (document.getElementById('audit-q-user')?.value   || '').trim();
    var action = (document.getElementById('audit-q-action')?.value || '').trim();
    var from   = (document.getElementById('audit-q-from')?.value   || '').trim();
    var to     = (document.getElementById('audit-q-to')?.value     || '').trim();
    var qs = '?limit=' + _auditLimit + '&offset=' + _auditOffset;
    if (user)   qs += '&username=' + encodeURIComponent(user);
    if (action) qs += '&action='   + encodeURIComponent(action);
    if (from)   qs += '&from='     + encodeURIComponent(from);
    if (to)     qs += '&to='       + encodeURIComponent(to);

    var tbody = document.getElementById('audit-log-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="padding:32px;text-align:center;color:var(--text-muted);">Loading…</td></tr>';

    fetch(SERVER_URL + '/api/audit' + qs, { credentials: 'include' })
        .then(function(r) { return r.json(); })
        .then(function(d) {
            var tbody  = document.getElementById('audit-log-body');
            var total  = document.getElementById('audit-total');
            var label  = document.getElementById('audit-page-label');
            var prev   = document.getElementById('audit-prev');
            var next   = document.getElementById('audit-next');
            if (!d.success || !tbody) return;

            if (total) total.textContent = d.total + ' record' + (d.total !== 1 ? 's' : '');
            var from2 = d.total ? d.offset + 1 : 0;
            var to2   = Math.min(d.offset + d.limit, d.total);
            if (label) label.textContent = d.total ? from2 + '–' + to2 + ' of ' + d.total : 'No records';
            if (prev)  prev.disabled = d.offset === 0;
            if (next)  next.disabled = d.offset + d.limit >= d.total;

            var BADGE = {
                'auth.login':           'background:#dcfce7;color:#166534;',
                'auth.login_failed':    'background:#fee2e2;color:#991b1b;',
                'user.create':          'background:#dbeafe;color:#1e40af;',
                'user.update':          'background:#e0e7ff;color:#3730a3;',
                'user.delete':          'background:#fee2e2;color:#991b1b;',
                'customer.create':      'background:#dbeafe;color:#1e40af;',
                'customer.update':      'background:#e0e7ff;color:#3730a3;',
                'customer.delete':      'background:#fee2e2;color:#991b1b;',
                'customer.import_csv':  'background:#dbeafe;color:#1e40af;',
                'delivery.save':        'background:#fef9c3;color:#854d0e;',
                'config.update':        'background:#f3e8ff;color:#6b21a8;',
            };

            if (!d.logs.length) {
                tbody.innerHTML = '<tr><td colspan="6" style="padding:32px;text-align:center;color:var(--text-muted);">No records found.</td></tr>';
                return;
            }
            tbody.innerHTML = d.logs.map(function(row) {
                var ts = new Date(row.timestamp + (row.timestamp.endsWith('Z') ? '' : 'Z'));
                var timeStr = ts.toLocaleDateString() + ' ' + ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                var badgeStyle = BADGE[row.action] || 'background:var(--surface-2);color:var(--text);';
                var details = auditFormatDetails(row.action, row.details);
                return '<tr style="border-top:1px solid var(--border);">' +
                    '<td style="padding:9px 14px;white-space:nowrap;color:var(--text-muted);font-size:12px;">' + timeStr + '</td>' +
                    '<td style="padding:9px 14px;font-weight:600;color:var(--text);">' + (row.username || '—') + '</td>' +
                    '<td style="padding:9px 14px;"><span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;' + badgeStyle + '">' + row.action + '</span></td>' +
                    '<td style="padding:9px 14px;color:var(--text);">' + (row.entity_name || row.entity_type || '—') + '</td>' +
                    '<td style="padding:9px 14px;color:var(--text-muted);font-size:12px;">' + details + '</td>' +
                    '<td style="padding:9px 14px;color:var(--text-muted);font-size:12px;">' + (row.ip || '—') + '</td>' +
                '</tr>';
            }).join('');
        })
        .catch(function(err) {
            var tbody = document.getElementById('audit-log-body');
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="padding:32px;text-align:center;color:#dc2626;">Failed to load audit log.</td></tr>';
        });
}

function auditChangePage(dir) {
    _auditOffset = Math.max(0, _auditOffset + dir * _auditLimit);
    auditLoadLogs(false);
}

// Initialize settings page
function initSettingsPage() {
    const cfg = companyConfig || {};
    
    // Load values
    document.getElementById('cfg-companyName').value = cfg.companyName || 'PEP';
    document.getElementById('cfg-tagline').value = cfg.companyTagline || 'Delivery Management';
    document.getElementById('cfg-whName').value = cfg.warehouseName || YOUR_SITE.name;
    document.getElementById('cfg-whAddress').value = cfg.warehouseAddress || YOUR_SITE.address;
    document.getElementById('cfg-whLat').value = cfg.warehouseLat || YOUR_SITE.lat;
    document.getElementById('cfg-whLng').value = cfg.warehouseLng || YOUR_SITE.lng;
    document.getElementById('cfg-localRadius').value = cfg.localZoneRadius || 20;
    document.getElementById('cfg-mapLat').value = cfg.mapDefaultLat || YOUR_SITE.lat;
    document.getElementById('cfg-mapLng').value = cfg.mapDefaultLng || YOUR_SITE.lng;
    document.getElementById('cfg-mapZoom').value = cfg.mapDefaultZoom || 6;
    document.getElementById('cfg-marquee').value = cfg.marqueeThreshold || 30;
    document.getElementById('cfg-stopTime').value = cfg.stopTime || 15;
    var mtEl = document.getElementById('cfg-maxTrolleys'); if (mtEl) mtEl.value = cfg.maxTrolleysPerRun || 17;
    var sF = cfg.features || {}; var fD = {gamification:true,grouping:true,analytics:true,autoAssign:true,priority:true,diagram:true,aiChat:true};
    if (typeof FEATURES!=='undefined'){Object.assign(FEATURES,fD);Object.assign(FEATURES,sF);}
    Object.keys(fD).forEach(function(k){var el=document.getElementById('feat-'+k);if(el)el.checked=sF[k]!==undefined?sF[k]:fD[k];});
    if(typeof applyFeatureFlags==='function')applyFeatureFlags();
    document.getElementById('cfg-reconnect').value = cfg.reconnectInterval || 30;
    document.getElementById('cfg-proximityThreshold').value = cfg.proximityThreshold || 15;
    document.getElementById('cfg-optimiserEngine').value = cfg.optimiserEngine || 'valhalla';
    previewOptimiserStatus();
    var layoutEl = document.getElementById('cfg-ordersLayout');
    if (layoutEl) layoutEl.value = cfg.ordersLayout || localStorage.getItem('PEP_ordersLayout') || 'cards';
    var eodEl = document.getElementById('cfg-eodTime');
    if (eodEl) eodEl.value = cfg.eodTime || '17:00';
    var shiftEl = document.getElementById('cfg-etaShiftNextWindow');
    if (shiftEl) shiftEl.checked = cfg.etaShiftToNextWindow || false;
    var hideEl = document.getElementById('cfg-etaHideIfNotStarted');
    if (hideEl) hideEl.checked = cfg.etaHideIfNotStarted || false;
    var rdsEl = document.getElementById('cfg-routeDriverStyle');
    if (rdsEl) rdsEl.checked = cfg.routeDriverStyle || false;
    var drmEl = document.getElementById('cfg-deliveryRunMove');
    if (drmEl) drmEl.checked = cfg.deliveryRunMoveEnabled !== false;
    var bayEl = document.getElementById('cfg-bayFeature');
    if (bayEl) bayEl.checked = cfg.bayFeatureEnabled || false;
    var bayModeEl = document.getElementById('cfg-bayAssignmentMode');
    if (bayModeEl) bayModeEl.value = cfg.bayAssignmentMode || 'van';
    var bayModeSection = document.getElementById('bay-mode-section');
    if (bayModeSection) bayModeSection.style.display = (cfg.bayFeatureEnabled) ? 'block' : 'none';
    var bayCountEl = document.getElementById('cfg-bayCount');
    if (bayCountEl) bayCountEl.value = cfg.bayCount || 3;
    if (typeof renderBayTrolleyLimitInputs === 'function') renderBayTrolleyLimitInputs(cfg.bayTrolleyLimits || {});
    var pcbEl = document.getElementById('feat-panelControlsBtn');
    if (pcbEl) pcbEl.checked = cfg.panelControlsBtn || false;
    if (typeof applyPanelControlsBtnSetting === 'function') applyPanelControlsBtnSetting(cfg.panelControlsBtn || false);
    var _sv = function(id, v) { var el = document.getElementById(id); if (el) el.value = v; };
    _sv('cfg-ortoolsCostFunction', cfg.ortoolsCostFunction  || 'minimize_time');
    _sv('cfg-ortoolsMaxStops',     cfg.ortoolsMaxStops      || 15);
    _sv('cfg-ortoolsMaxDistance',  cfg.ortoolsMaxDistance   || 200);
    _sv('cfg-ortoolsDropPenalty',  cfg.ortoolsDropPenalty   || 10000000);
    _sv('cfg-ortoolsTimeLimit',    cfg.ortoolsTimeLimit     || 30);
    
    // API Integration toggle
    var apiEl = document.getElementById('cfg-apiEnabled');
    if (apiEl) {
        apiEl.checked = cfg.apiEnabled || false;
        var apiNavTab = document.querySelector('.api-import-nav-tab');
        if (apiNavTab) apiNavTab.style.display = cfg.apiEnabled ? '' : 'none';
    }

    // Time format
    const timeFormat = cfg.timeFormat || '24';
    document.querySelectorAll('input[name="timeFormatSetting"]').forEach(radio => {
        radio.checked = radio.value === timeFormat;
    });
    settingsTimeFormat = timeFormat;
    
    // Active days
    settingsActiveDays = cfg.activeDays || [1, 2, 3, 4, 5, 6, 7];
    
    // Map style
    settingsMapStyle = cfg.mapStyle || 'streets';
    
    // Vans and zones
    settingsVans = cfg.vans || VANS.map(v => ({
        id: v.id, name: v.name, color: v.color, capacity: v.capacity || 17,
        maxPlants: 500, maxStops: 15, maxDistance: 200, efficiency: 1.0, preferredZones: []
    }));
    settingsZones = cfg.zones || Object.entries(ZONES).filter(e => e[0] !== 'Collection').map(e => {
        const n = e[0], z = e[1];
        return {
            name: n, color: z.color,
            latMin: z.latRange?.[0] || '', latMax: z.latRange?.[1] || '',
            lngMin: z.lngRange?.[0] || '', lngMax: z.lngRange?.[1] || '',
            isLocal: n === 'Local'
        };
    });
    
    // Gamification
    settingsChallenges = cfg.challenges || {};
    settingsMonthlyAwards = cfg.monthlyAwards || {};
    
    // Refresh all lists
    refreshSettingsVansList();
    refreshSettingsZonesList();
    refreshSettingsDaysList();
    refreshSettingsGamificationList();
    refreshSettingsMapPicker();
    renderSettingsCustomerList();
    loadPlanUsage();

    // Email settings
    const _sv2 = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    _sv2('cfg-smtpHost', cfg.smtpHost);
    _sv2('cfg-smtpPort', cfg.smtpPort || '587');
    _sv2('cfg-smtpUser', cfg.smtpUser);
    _sv2('cfg-smtpPass', cfg.smtpPass);
    _sv2('cfg-smtpFrom', cfg.smtpFrom);
    const _sc = (id, v) => { const el = document.getElementById(id); if (el) el.checked = v !== false && v !== 'false'; };
    _sc('cfg-emailNotifyOutForDelivery', cfg.emailNotifyOutForDelivery);
    _sc('cfg-emailNotifyDelivered',      cfg.emailNotifyDelivered);
    _sc('cfg-emailNotifyDriverAssigned', cfg.emailNotifyDriverAssigned);
    updateEmailStatusBadge(cfg);
}

// Refresh vans list in settings
function refreshSettingsVansList() {
    const container = document.getElementById('cfg-vans-list-settings');
    if (!container) return;
    
    container.innerHTML = settingsVans.map((van, i) => `
        <div class="van-item">
            <input type="text" value="${van.name}" onchange="updateSettingsVan(${i}, 'name', this.value)" placeholder="Van Name">
            <input type="color" value="${van.color}" onchange="updateSettingsVan(${i}, 'color', this.value)">
            <span style="font-size:12px;font-weight:600;color:var(--text-muted);white-space:nowrap;display:flex;align-items:center;gap:5px;">
                <i class="fas fa-shopping-cart" style="font-size:11px;"></i> Max Trolleys
            </span>
            <input type="number" min="1" max="30" value="${van.capacity || 17}" onchange="updateSettingsVan(${i}, 'capacity', parseInt(this.value))" placeholder="17"
                style="text-align:center;font-weight:700;">
            <span style="font-size:12px;font-weight:600;color:var(--text-muted);white-space:nowrap;display:flex;align-items:center;gap:5px;">
                <i class="fas fa-tachometer-alt" style="font-size:11px;"></i> Max Speed (mph)
            </span>
            <input type="number" min="0" max="200" value="${van.maxSpeedMph || ''}" onchange="updateSettingsVan(${i}, 'maxSpeedMph', parseFloat(this.value) || 0)" placeholder="0 = no limit"
                style="text-align:center;font-weight:700;" title="Speed limit in mph. Leave 0 if no limit. e.g. 54 for the large van.">
            <button class="remove-btn" onclick="removeSettingsVan(${i})"><i class="fas fa-trash"></i></button>
        </div>
    `).join('');
}

function updateSettingsVan(index, field, value) {
    if (settingsVans[index]) settingsVans[index][field] = value;
}

function adminAddVanSettings() {
    const newId = settingsVans.length > 0 ? Math.max(...settingsVans.map(v => v.id)) + 1 : 4;
    settingsVans.push({ id: newId, name: `Van ${newId}`, color: '#6366f1', capacity: 17 });
    refreshSettingsVansList();
}

function removeSettingsVan(index) {
    if (settingsVans.length <= 1) {
        showNotification('Need at least 1 van', 'warning');
        return;
    }
    settingsVans.splice(index, 1);
    refreshSettingsVansList();
}

// Refresh zones list
function refreshSettingsZonesList() {
    const container = document.getElementById('cfg-zones-list-settings');
    if (!container) return;
    const total = settingsZones.length;
    container.innerHTML = settingsZones.map((zone, i) => `
        <div class="zone-item" style="margin-bottom:10px;border-left-color:${zone.color || 'var(--border)'};">
            <div class="zone-header">
                <div class="zone-reorder-btns">
                    <button class="zone-reorder-btn" title="Move up"
                        onclick="moveSettingsZone(${i},-1)"
                        ${i === 0 ? 'disabled' : ''}>
                        <i class="fas fa-chevron-up"></i>
                    </button>
                    <button class="zone-reorder-btn" title="Move down"
                        onclick="moveSettingsZone(${i},1)"
                        ${i === total - 1 ? 'disabled' : ''}>
                        <i class="fas fa-chevron-down"></i>
                    </button>
                </div>
                <input class="zone-name-input" type="text" value="${zone.name}"
                    onchange="updateSettingsZone(${i}, 'name', this.value)" placeholder="Zone Name">
                <input class="zone-color-input" type="color" value="${zone.color}"
                    onchange="updateSettingsZone(${i}, 'color', this.value);this.closest('.zone-item').style.borderLeftColor=this.value;">
                <button class="zone-delete-btn" title="Delete zone" onclick="removeSettingsZone(${i})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <label class="zone-checkbox">
                <input type="checkbox" ${zone.isLocal ? 'checked' : ''} onchange="updateSettingsZone(${i}, 'isLocal', this.checked)">
                Local zone (radius-based)
            </label>
            <div class="zone-geo" style="display:${zone.isLocal ? 'none' : 'grid'};">
                <input type="number" step="0.1" value="${zone.latMin}" onchange="updateSettingsZone(${i}, 'latMin', this.value)" placeholder="Lat min">
                <input type="number" step="0.1" value="${zone.latMax}" onchange="updateSettingsZone(${i}, 'latMax', this.value)" placeholder="Lat max">
                <input type="number" step="0.1" value="${zone.lngMin}" onchange="updateSettingsZone(${i}, 'lngMin', this.value)" placeholder="Lng min">
                <input type="number" step="0.1" value="${zone.lngMax}" onchange="updateSettingsZone(${i}, 'lngMax', this.value)" placeholder="Lng max">
            </div>
        </div>
    `).join('');
}

function moveSettingsZone(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= settingsZones.length) return;
    // Swap
    const tmp = settingsZones[index];
    settingsZones[index] = settingsZones[target];
    settingsZones[target] = tmp;
    refreshSettingsZonesList();
}

function updateSettingsZone(index, field, value) {
    if (settingsZones[index]) {
        settingsZones[index][field] = value;
        if (field === 'isLocal') refreshSettingsZonesList();
    }
}

function adminAddZoneSettings() {
    settingsZones.push({ name: 'New Zone', color: '#6366f1', latMin: '', latMax: '', lngMin: '', lngMax: '', isLocal: false });
    refreshSettingsZonesList();
}

function removeSettingsZone(index) {
    settingsZones.splice(index, 1);
    refreshSettingsZonesList();
}

// Refresh days list
function refreshSettingsDaysList() {
    const container = document.getElementById('daysToggleContainer');
    if (!container) return;
    
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    container.innerHTML = days.map((day, idx) => {
        const dayId = idx + 1;
        const isActive = settingsActiveDays.includes(dayId);
        return `
            <button class="day-toggle-btn ${isActive ? 'active' : ''}" data-day="${dayId}" onclick="toggleSettingsDay(${dayId})">
                <i class="fas fa-calendar-day"></i> ${day}
            </button>
        `;
    }).join('');
}

function toggleSettingsDay(dayId) {
    const index = settingsActiveDays.indexOf(dayId);
    if (index === -1) {
        settingsActiveDays.push(dayId);
        settingsActiveDays.sort((a, b) => a - b);
    } else {
        if (settingsActiveDays.length <= 1) {
            showNotification('At least one day must remain active', 'warning');
            return;
        }
        settingsActiveDays.splice(index, 1);
    }
    refreshSettingsDaysList();
}

// Refresh gamification list
function refreshSettingsGamificationList() {
    const challengesContainer = document.getElementById('cfg-challenges-list');
    const awardsContainer = document.getElementById('cfg-awards-list');
    
    if (challengesContainer && typeof CHALLENGES !== 'undefined') {
        challengesContainer.innerHTML = '<h4>Challenges</h4>';
        Object.entries(CHALLENGES).forEach(([key, ch]) => {
            const saved = settingsChallenges[key] || {};
            challengesContainer.innerHTML += `
                <div class="gamification-item">
                    <div class="gamification-header">
                        <i class="fas ${ch.icon}"></i>
                        <strong>${key}</strong>
                        <span>${ch.metric} · ${ch.duration}</span>
                    </div>
                    <div class="gamification-fields">
                        <input type="text" value="${saved.name || ch.name}" placeholder="Name" onchange="updateSettingsChallenge('${key}', 'name', this.value)">
                        <input type="text" value="${saved.description || ch.description || ''}" placeholder="Description" onchange="updateSettingsChallenge('${key}', 'description', this.value)">
                        <input type="color" value="${saved.color || ch.color}" onchange="updateSettingsChallenge('${key}', 'color', this.value)">
                    </div>
                </div>
            `;
        });
    }
    
    if (awardsContainer && typeof MONTHLY_AWARDS !== 'undefined') {
        awardsContainer.innerHTML = '<h4>Monthly Awards</h4>';
        Object.entries(MONTHLY_AWARDS).forEach(([key, aw]) => {
            const saved = settingsMonthlyAwards[key] || {};
            awardsContainer.innerHTML += `
                <div class="gamification-item">
                    <div class="gamification-header">
                        <i class="fas ${aw.icon}"></i>
                        <strong>${key}</strong>
                    </div>
                    <div class="gamification-fields">
                        <input type="text" value="${saved.name || aw.name}" placeholder="Name" onchange="updateSettingsAward('${key}', 'name', this.value)">
                        <input type="text" value="${saved.description || aw.description || ''}" placeholder="Description" onchange="updateSettingsAward('${key}', 'description', this.value)">
                        <input type="color" value="${saved.color || aw.color}" onchange="updateSettingsAward('${key}', 'color', this.value)">
                    </div>
                </div>
            `;
        });
    }
}

function updateSettingsChallenge(key, field, value) {
    if (!settingsChallenges[key]) settingsChallenges[key] = {};
    settingsChallenges[key][field] = value;
}

function updateSettingsAward(key, field, value) {
    if (!settingsMonthlyAwards[key]) settingsMonthlyAwards[key] = {};
    settingsMonthlyAwards[key][field] = value;
}

// Refresh map style picker
function refreshSettingsMapPicker() {
    const container = document.getElementById('mapStylePicker');
    if (!container) return;
    
    const styles = [
        ['streets', '🗺️ Streets'],
        ['humanitarian', '❤️ Humanitarian'],
        ['voyager', '🧭 Voyager'],
        ['light', '☀️ Light'],
        ['dark', '🌙 Dark'],
        ['light-nolabels', '☀️ Light (No Labels)'],
        ['dark-nolabels', '🌙 Dark (No Labels)'],
        ['alidade-smooth', '✨ Smooth'],
        ['alidade-smooth-dark', '🖤 Smooth Dark'],
        ['osm-bright', '🌟 OSM Bright'],
        ['esri-streets', '🏙️ Esri Streets'],
        ['esri-satellite', '🛰️ Satellite'],
        ['esri-topo', '🏔️ Esri Topo'],
        ['topo', '⛰️ Topo'],
    ];
    
    container.innerHTML = styles.map(([style, label]) => `
        <button class="map-style-btn ${settingsMapStyle === style ? 'active' : ''}" data-style="${style}" onclick="selectSettingsMapStyle('${style}')">
            ${label}
        </button>
    `).join('');
}

function selectSettingsMapStyle(style) {
    settingsMapStyle = style;
    refreshSettingsMapPicker();
    if (typeof applyMapStyle === 'function') applyMapStyle(style);
}

// Customer management in settings
function renderSettingsCustomerList() {
    const container = document.getElementById('cfg-customer-list-settings');
    if (!container) return;
    
    if (!customers.length) {
        container.innerHTML = '<p style="padding: 20px; text-align: center;">No customers yet.</p>';
        return;
    }
    
    container.innerHTML = `
        <table class="customers-table">
            <thead>
                <tr><th>Name</th><th>Address</th><th>Postcode</th><th>Zone</th><th>Actions</th></tr>
            </thead>
            <tbody>
                ${customers.slice(0, 200).map(c => {
                    const zoneColor = ZONES[c.zone]?.color || '#6b7280';
                    return `
                        <tr>
                            <td><strong>${escapeHtml(c.name)}</strong></td>
                            <td>${escapeHtml((c.address || '').substring(0, 35))}</td>
                            <td>${escapeHtml(c.postcode || '—')}</td>
                            <td><span style="background:${zoneColor}20;color:${zoneColor};padding:2px 8px;border-radius:20px;">${escapeHtml(c.zone)}</span></td>
                            <td>
                                <button onclick="adminEditCustomerSettings(${c.id})" class="action-btn btn-info" style="padding:4px 10px;"><i class="fas fa-edit"></i> Edit</button>
                                <button onclick="adminDeleteCustomerSettings(${c.id})" class="action-btn btn-danger" style="padding:4px 10px;"><i class="fas fa-trash"></i> Delete</button>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

function filterAdminCustomerListSettings(searchTerm) {
    const table = document.querySelector('#cfg-customer-list-settings .customers-table tbody');
    if (!table) return;
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = !searchTerm || text.includes(searchTerm.toLowerCase()) ? '' : 'none';
    });
}

function adminEditCustomerSettings(id) {
    const customer = customers.find(c => c.id === id);
    if (!customer) return;

    // Populate zone dropdown
    const zoneOptions = ['Collection','Local','South East','South West','London/North East','North West'];
    const zoneSelect = document.getElementById('editCustomerZone');
    zoneSelect.innerHTML = zoneOptions
        .map(z => `<option value="${z}" ${customer.zone === z ? 'selected' : ''}>${z}</option>`)
        .join('');

    // Populate day dropdown
    const dayNames = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    const daySelect = document.getElementById('editCustomerDay');
    daySelect.innerHTML = '<option value="">— Unscheduled —</option>' +
        dayNames.map((name, i) => {
            const dayId = i + 1;
            return `<option value="${dayId}" ${customer.assignedDay === dayId ? 'selected' : ''}>${name}</option>`;
        }).join('');

    document.getElementById('editCustomerId').value = customer.id;
    document.getElementById('editCustomerName').value = customer.name;
    document.getElementById('editCustomerAddress').value = customer.address || '';
    document.getElementById('editCustomerPostcode').value = customer.postcode || '';
    document.getElementById('editCustomerLat').value = customer.lat;
    document.getElementById('editCustomerLng').value = customer.lng;
    document.getElementById('editCustomerModal').classList.add('active');
}

async function adminDeleteCustomerSettings(id) {
    const customer = customers.find(c => c.id === id);
    if (!customer || !confirm(`Delete customer "${customer.name}"?`)) return;
    try {
        const res = await fetch(`${SERVER_URL}/api/customer/single/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            customers = customers.filter(c => c.id !== id);
            updateAllDisplays();
            showNotification('Customer deleted', 'success');
            renderSettingsCustomerList();
            renderAdminCustomerList();
        }
    } catch (err) {
        showNotification('Cannot reach server', 'error');
    }
}

async function adminSaveCustomerSettings() {
    const name = document.getElementById('cfg-cust-name-settings')?.value?.trim();
    const address = document.getElementById('cfg-cust-address-settings')?.value?.trim();
    const postcode = document.getElementById('cfg-cust-postcode-settings')?.value?.trim();
    const lat = parseFloat(document.getElementById('cfg-cust-lat-settings')?.value);
    const lng = parseFloat(document.getElementById('cfg-cust-lng-settings')?.value);
    const zone = document.getElementById('cfg-cust-zone-settings')?.value;
    const dayVal = document.getElementById('cfg-cust-day-settings')?.value;
    
    if (!name) { showNotification('Customer name is required', 'warning'); return; }
    if (isNaN(lat) || isNaN(lng)) { showNotification('Valid latitude and longitude are required', 'warning'); return; }
    
    const payload = { name, address, postcode, lat, lng, zone: zone || 'Local', assignedDay: dayVal ? parseInt(dayVal) : null };
    try {
        const res = await fetch(`${SERVER_URL}/api/customer/single`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            const c = data.customer;
            const rd = getRoadDistanceDuration(YOUR_SITE.lat, YOUR_SITE.lng, c.lat, c.lng);
            c.roadDistanceFromSite = rd.distance;
            c.roadDurationFromSite = rd.duration;
            c.status = 'pending';
            c.assignedStaff = [];
            c.deliveryOrder = 0;
            customers.push(c);
            updateAllDisplays();
            showNotification(`Customer "${name}" added ✓`, 'success');
            ['cfg-cust-name-settings', 'cfg-cust-address-settings', 'cfg-cust-postcode-settings', 'cfg-cust-lat-settings', 'cfg-cust-lng-settings'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            document.getElementById('cfg-cust-zone-settings').value = 'Local';
            document.getElementById('cfg-cust-day-settings').value = '';
            renderSettingsCustomerList();
            renderAdminCustomerList();
        }
    } catch (err) { showNotification('Cannot reach server', 'error'); }
}

// Save all settings
async function adminSaveAllSettings() {
    const cfg = {
        companyName: document.getElementById('cfg-companyName')?.value?.trim() || 'PEP',
        companyTagline: document.getElementById('cfg-tagline')?.value?.trim() || 'Delivery Management',
        warehouseName: document.getElementById('cfg-whName')?.value?.trim() || YOUR_SITE.name,
        warehouseAddress: document.getElementById('cfg-whAddress')?.value?.trim() || YOUR_SITE.address,
        warehouseLat: parseFloat(document.getElementById('cfg-whLat')?.value) || YOUR_SITE.lat,
        warehouseLng: parseFloat(document.getElementById('cfg-whLng')?.value) || YOUR_SITE.lng,
        localZoneRadius: parseFloat(document.getElementById('cfg-localRadius')?.value) || 20,
        mapDefaultLat: parseFloat(document.getElementById('cfg-mapLat')?.value) || YOUR_SITE.lat,
        mapDefaultLng: parseFloat(document.getElementById('cfg-mapLng')?.value) || YOUR_SITE.lng,
        mapDefaultZoom: parseInt(document.getElementById('cfg-mapZoom')?.value) || 6,
        mapStyle: settingsMapStyle,
        activeDays: settingsActiveDays,
        marqueeThreshold: parseInt(document.getElementById('cfg-marquee')?.value) || 30,
        timeFormat: document.querySelector('input[name="timeFormatSetting"]:checked')?.value || '24',
        stopTime: parseInt(document.getElementById('cfg-stopTime')?.value) || 15,
        reconnectInterval: parseInt(document.getElementById('cfg-reconnect')?.value) || 30,
        proximityThreshold: parseInt(document.getElementById('cfg-proximityThreshold')?.value) || 15,
        optimiserEngine: document.getElementById('cfg-optimiserEngine')?.value || 'valhalla',
        ordersLayout: document.getElementById('cfg-ordersLayout')?.value || 'cards',
        eodTime: document.getElementById('cfg-eodTime')?.value || '17:00',
        challenges: settingsChallenges,
        monthlyAwards: settingsMonthlyAwards,
        vans: settingsVans,
        zones: settingsZones,
        maxTrolleysPerRun: parseInt(document.getElementById('cfg-maxTrolleys')?.value) || 17,
        features: {
            gamification: document.getElementById('feat-gamification')?.checked !== false,
            grouping:     document.getElementById('feat-grouping')?.checked !== false,
            analytics:    document.getElementById('feat-analytics')?.checked !== false,
            autoAssign:   document.getElementById('feat-autoAssign')?.checked !== false,
            priority:     document.getElementById('feat-priority')?.checked !== false,
            diagram:      document.getElementById('feat-diagram')?.checked  !== false,
            aiChat:       document.getElementById('feat-aiChat')?.checked   !== false
        },
        etaStart:             document.getElementById('cfg-etaStart')?.value             || '07:45',
        etaEnd:               document.getElementById('cfg-etaEnd')?.value               || '16:45',
        etaLoadingTime:       parseInt(document.getElementById('cfg-etaLoading')?.value)  || 20,
        etaUnloadTime:        parseInt(document.getElementById('cfg-etaUnload')?.value)   || 10,
        etaPickMins:          parseInt(document.getElementById('cfg-etaPickMin')?.value)  || 60,
        etaBarcodeExtra:      parseInt(document.getElementById('cfg-etaBarcode')?.value)  || 15,
        etaPrepriceExtra:     parseInt(document.getElementById('cfg-etaPreprice')?.value) || 20,
        etaShiftToNextWindow: document.getElementById('cfg-etaShiftNextWindow')?.checked  || false,
        etaHideIfNotStarted:  document.getElementById('cfg-etaHideIfNotStarted')?.checked || false,
        ortoolsCostFunction:  document.getElementById('cfg-ortoolsCostFunction')?.value   || 'minimize_time',
        ortoolsMaxStops:      parseInt(document.getElementById('cfg-ortoolsMaxStops')?.value)      || 15,
        ortoolsMaxDistance:   parseInt(document.getElementById('cfg-ortoolsMaxDistance')?.value)   || 200,
        ortoolsDropPenalty:   parseInt(document.getElementById('cfg-ortoolsDropPenalty')?.value)   || 10000000,
        ortoolsTimeLimit:     parseInt(document.getElementById('cfg-ortoolsTimeLimit')?.value)     || 30,
        routeDriverStyle:          document.getElementById('cfg-routeDriverStyle')?.checked  || false,
        deliveryRunMoveEnabled:    document.getElementById('cfg-deliveryRunMove')?.checked   !== false,
        panelControlsBtn:          document.getElementById('feat-panelControlsBtn')?.checked  || false,
        apiEnabled:                document.getElementById('cfg-apiEnabled')?.checked         || false,
        vanBayAssignments:         (typeof vanBayAssignments !== 'undefined') ? Object.assign({}, vanBayAssignments) : {},
        bayFeatureEnabled:         document.getElementById('cfg-bayFeature')?.checked || false,
        bayAssignmentMode:         document.getElementById('cfg-bayAssignmentMode')?.value || 'van',
        bayCount:                  parseInt(document.getElementById('cfg-bayCount')?.value) || 3,
        bayTrolleyLimits:          (function() {
            var limits = {};
            var container = document.getElementById('bay-trolley-limits-container');
            if (container) container.querySelectorAll('input[data-bay]').forEach(function(el) {
                limits[el.dataset.bay] = parseInt(el.value) || 17;
            });
            return limits;
        })(),
        smtpHost:                   document.getElementById('cfg-smtpHost')?.value?.trim()  || '',
        smtpPort:                   document.getElementById('cfg-smtpPort')?.value?.trim()  || '587',
        smtpUser:                   document.getElementById('cfg-smtpUser')?.value?.trim()  || '',
        smtpPass:                   document.getElementById('cfg-smtpPass')?.value          || '',
        smtpFrom:                   document.getElementById('cfg-smtpFrom')?.value?.trim()  || '',
        emailNotifyOutForDelivery:  document.getElementById('cfg-emailNotifyOutForDelivery')?.checked ?? true,
        emailNotifyDelivered:       document.getElementById('cfg-emailNotifyDelivered')?.checked       ?? true,
        emailNotifyDriverAssigned:  document.getElementById('cfg-emailNotifyDriverAssigned')?.checked  ?? true,
    };

    await saveCompanyConfig(cfg);
    showNotification('All settings saved successfully ✓', 'success');
    
    // Update global variables
    if (typeof MARQUEE_THRESHOLD !== 'undefined') MARQUEE_THRESHOLD = cfg.marqueeThreshold;
    if (typeof STOP_TIME_PER_DELIVERY !== 'undefined') STOP_TIME_PER_DELIVERY = cfg.stopTime;
    if (typeof MAX_TROLLEYS_PER_RUN !== 'undefined') MAX_TROLLEYS_PER_RUN = cfg.maxTrolleysPerRun || 17;
    if (typeof BAY_COUNT !== 'undefined') BAY_COUNT = cfg.bayCount || 3;
    if (typeof BAY_TROLLEY_LIMITS !== 'undefined') Object.assign(BAY_TROLLEY_LIMITS, cfg.bayTrolleyLimits || {});
    if (typeof FEATURES!=='undefined'&&cfg.features) Object.assign(FEATURES,cfg.features);
    if (typeof applyFeatureFlags==='function') applyFeatureFlags();
    if (typeof RECONNECT_INTERVAL !== 'undefined') RECONNECT_INTERVAL = cfg.reconnectInterval;
    if (typeof PROXIMITY_THRESHOLD !== 'undefined') PROXIMITY_THRESHOLD = cfg.proximityThreshold;
    if (typeof window !== 'undefined') window.OPTIMISER_ENGINE = cfg.optimiserEngine || 'valhalla';
    if (cfg.ordersLayout && typeof applyOrdersLayout === 'function') applyOrdersLayout(cfg.ordersLayout);
    if (cfg.eodTime && typeof setEODResetTime === 'function') setEODResetTime(cfg.eodTime);
    if (typeof ACTIVE_DAYS !== 'undefined') ACTIVE_DAYS = cfg.activeDays;
    // ETA globals
    if (typeof ETA_DELIVERY_START         !== 'undefined') ETA_DELIVERY_START         = cfg.etaStart        || '07:45';
    if (typeof ETA_DELIVERY_END           !== 'undefined') ETA_DELIVERY_END           = cfg.etaEnd          || '16:45';
    if (typeof ETA_LOADING_TIME_PER_RUN   !== 'undefined') ETA_LOADING_TIME_PER_RUN   = cfg.etaLoadingTime  || 20;
    if (typeof ETA_UNLOAD_TIME_PER_STOP   !== 'undefined') ETA_UNLOAD_TIME_PER_STOP   = cfg.etaUnloadTime   || 10;
    if (typeof ETA_PICK_MINS_PER_TROLLEY  !== 'undefined') ETA_PICK_MINS_PER_TROLLEY  = cfg.etaPickMins     || 60;
    if (typeof ETA_PACK_BARCODE_EXTRA     !== 'undefined') ETA_PACK_BARCODE_EXTRA     = cfg.etaBarcodeExtra || 15;
    if (typeof ETA_PACK_PREPRICE_EXTRA    !== 'undefined') ETA_PACK_PREPRICE_EXTRA    = cfg.etaPrepriceExtra|| 20;
    if (typeof ETA_SHIFT_TO_NEXT_WINDOW   !== 'undefined') { ETA_SHIFT_TO_NEXT_WINDOW = !!cfg.etaShiftToNextWindow; window.ETA_SHIFT_TO_NEXT_WINDOW = ETA_SHIFT_TO_NEXT_WINDOW; }
    if (typeof ETA_HIDE_IF_NOT_STARTED    !== 'undefined') { ETA_HIDE_IF_NOT_STARTED  = !!cfg.etaHideIfNotStarted;  window.ETA_HIDE_IF_NOT_STARTED  = ETA_HIDE_IF_NOT_STARTED;  }
    if (typeof ORTOOLS_COST_FUNCTION      !== 'undefined') ORTOOLS_COST_FUNCTION  = cfg.ortoolsCostFunction  || 'minimize_time';
    if (typeof ORTOOLS_MAX_STOPS          !== 'undefined') ORTOOLS_MAX_STOPS       = cfg.ortoolsMaxStops      || 15;
    if (typeof ORTOOLS_MAX_DISTANCE       !== 'undefined') ORTOOLS_MAX_DISTANCE    = cfg.ortoolsMaxDistance   || 200;
    if (typeof ORTOOLS_DROP_PENALTY       !== 'undefined') ORTOOLS_DROP_PENALTY    = cfg.ortoolsDropPenalty   || 10000000;
    if (typeof ORTOOLS_TIME_LIMIT         !== 'undefined') ORTOOLS_TIME_LIMIT      = cfg.ortoolsTimeLimit     || 30;
    if (typeof ROUTE_DRIVER_STYLE         !== 'undefined') ROUTE_DRIVER_STYLE      = !!cfg.routeDriverStyle;
    if (typeof DELIVERY_RUN_MOVE_ENABLED  !== 'undefined') DELIVERY_RUN_MOVE_ENABLED = cfg.deliveryRunMoveEnabled !== false;
    if (typeof refreshDeliveryRunsPanel      === 'function') refreshDeliveryRunsPanel();
    if (typeof applyPanelControlsBtnSetting === 'function') applyPanelControlsBtnSetting(cfg.panelControlsBtn || false);
    var apiNavTab = document.querySelector('.api-import-nav-tab');
    if (apiNavTab) apiNavTab.style.display = cfg.apiEnabled ? '' : 'none';

    // Apply vans to global VANS array immediately — so map/orders update without reload
    if (settingsVans && settingsVans.length) {
        VANS.length = 0;
        settingsVans.forEach(function(v) {
            VANS.push({ id: v.id, name: v.name, color: v.color, iconColor: v.color, capacity: v.capacity || 50, driver: v.driver || '' });
        });
        // Ensure deliveryPlan has entries for all vans (including newly added ones)
        VANS.forEach(function(v) {
            if (!deliveryPlan[v.id]) {
                deliveryPlan[v.id] = {};
                DAYS.forEach(function(d) { deliveryPlan[v.id][d.id] = []; });
            }
        });
        if (typeof normalizeDeliveryPlan === 'function') normalizeDeliveryPlan();
        console.log('[settings] Applied ' + VANS.length + ' vans to global VANS:', VANS.map(v => v.name).join(', '));

        // Sync VAN_CAPACITY to match — prune deleted vans, update/add remaining ones.
        // This keeps smart grouping in step with VANS without requiring a page reload.
        if (typeof VAN_CAPACITY !== 'undefined') {
            var _validIds = settingsVans.map(function(v) { return v.id; });
            // Remove stale keys for deleted vans
            Object.keys(VAN_CAPACITY).forEach(function(k) {
                if (!_validIds.includes(parseInt(k))) {
                    delete VAN_CAPACITY[k];
                    console.log('[settings] Pruned VAN_CAPACITY entry for deleted van id:', k);
                }
            });
            // Update / add entries for current vans, preserving any fields not in settingsVans
            settingsVans.forEach(function(v) {
                var existing = VAN_CAPACITY[v.id] || {};
                VAN_CAPACITY[v.id] = {
                    maxPlants:     v.maxPlants     || existing.maxPlants     || 500,
                    maxStops:      v.maxStops      || existing.maxStops      || 15,
                    maxDistance:   v.maxDistance   || existing.maxDistance   || 200,
                    preferredZones: v.preferredZones || existing.preferredZones || [],
                    efficiency:    (v.efficiency != null) ? v.efficiency : (existing.efficiency != null ? existing.efficiency : 1.0),
                    maxSpeedMph:   v.maxSpeedMph   || existing.maxSpeedMph   || 0
                };
            });
            console.log('[settings] VAN_CAPACITY synced. Active van ids:', _validIds.join(', '));
        }

        // If the smart grouping page is currently visible, reset it so stale
        // van suggestions (from before the save) are never shown.
        if (typeof refreshGroupingPage === 'function') {
            var groupingSection = document.getElementById('groupingSection');
            if (groupingSection && groupingSection.style.display !== 'none') {
                refreshGroupingPage();
                console.log('[settings] Grouping page refreshed after van change.');
            }
        }
    }

    // Refresh displays
    if (typeof updateAllDisplays === 'function') updateAllDisplays();
    if (typeof updateVanDaySelector === 'function') updateVanDaySelector();
    if (typeof updateWeeklyPlanTable === 'function') updateWeeklyPlanTable();
}

function resetAllSettingsToDefault() {
    if (confirm('Reset all settings to default values?')) {
        // Default vans from config.js (not hardcoded here)
        settingsVans = VANS.map(function(v) { return { id: v.id, name: v.name, color: v.color, capacity: v.capacity || 50 }; });
        settingsVans = settingsVans.length ? settingsVans : [
            { id: 1, name: 'GK (Blue)', color: '#007bff', capacity: 50 },
            { id: 2, name: 'HF (Red)', color: '#dc3545', capacity: 50 },
            { id: 3, name: 'LG (Green)', color: '#28a745', capacity: 50 }
        ];
        settingsZones = [
            { name: 'North West', color: '#007bff', latMin: '53.0', latMax: '55.0', lngMin: '-3.5', lngMax: '-2.0', isLocal: false },
            { name: 'South West', color: '#28a745', latMin: '50.0', latMax: '52.0', lngMin: '-5.0', lngMax: '-2.5', isLocal: false },
            { name: 'London/North East', color: '#dc3545', latMin: '51.0', latMax: '52.5', lngMin: '-0.5', lngMax: '1.5', isLocal: false },
            { name: 'South East', color: '#ffc107', latMin: '50.5', latMax: '51.5', lngMin: '-1.0', lngMax: '1.0', isLocal: false },
            { name: 'Local', color: '#6b7280', isLocal: true }
        ];
        settingsActiveDays = [1, 2, 3, 4, 5, 6, 7];
        settingsTimeFormat = '24';
        settingsMapStyle = 'streets';
        settingsChallenges = {};
        settingsMonthlyAwards = {};
        
        refreshSettingsVansList();
        refreshSettingsZonesList();
        refreshSettingsDaysList();
        refreshSettingsGamificationList();
        refreshSettingsMapPicker();
        
        document.getElementById('cfg-companyName').value = 'PEP';
        document.getElementById('cfg-tagline').value = 'Delivery Management';
        document.getElementById('cfg-whName').value = YOUR_SITE.name;
        document.getElementById('cfg-whAddress').value = YOUR_SITE.address;
        document.getElementById('cfg-whLat').value = YOUR_SITE.lat;
        document.getElementById('cfg-whLng').value = YOUR_SITE.lng;
        document.getElementById('cfg-localRadius').value = '20';
        document.getElementById('cfg-mapLat').value = YOUR_SITE.lat;
        document.getElementById('cfg-mapLng').value = YOUR_SITE.lng;
        document.getElementById('cfg-mapZoom').value = '6';
        document.getElementById('cfg-marquee').value = '30';
        document.getElementById('cfg-stopTime').value = '15';
        document.getElementById('cfg-reconnect').value = '30';
        document.getElementById('cfg-proximityThreshold').value = '15';
        document.querySelector('input[name="timeFormatSetting"][value="24"]').checked = true;
        
        showNotification('Settings reset to default', 'success');
    }
}
// ========== USER MANAGEMENT ==========
async function adminLoadUsers() {
    const container = document.getElementById('usersListContainer');
    if (!container) return;
    try {
        const res = await fetch(`${SERVER_URL}/api/users`);
        const data = await res.json();
        const users = data.users || [];

        if (!users.length) {
            container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">No users found.</div>';
            return;
        }

        const roleColors = { admin:'#dc2626', manager:'#7c3aed', staff:'#059669' };
        const roleLabels = { admin:'Admin', manager:'Manager', staff:'Staff' };

        container.innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
                <tr style="background:var(--surface-secondary,#f9fafb);font-weight:700;font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">
                    <th style="padding:10px 12px;text-align:left;">Name</th>
                    <th style="padding:10px 12px;text-align:left;">Username</th>
                    <th style="padding:10px 12px;text-align:left;">Role</th>
                    <th style="padding:10px 12px;text-align:left;">Status</th>
                    <th style="padding:10px 12px;text-align:right;">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${users.map(u => `
                <tr style="border-bottom:1px solid var(--border);">
                    <td style="padding:10px 12px;font-weight:600;color:var(--text);">${u.full_name || '—'}</td>
                    <td style="padding:10px 12px;font-family:monospace;color:var(--text-muted);">${u.username}</td>
                    <td style="padding:10px 12px;">
                        <span style="background:${roleColors[u.role]||'#6b7280'}22;color:${roleColors[u.role]||'#6b7280'};padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;">
                            ${roleLabels[u.role]||u.role}
                        </span>
                    </td>
                    <td style="padding:10px 12px;">
                        <span style="background:${u.active?'#dcfce7':'#fee2e2'};color:${u.active?'#166534':'#991b1b'};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">
                            ${u.active?'Active':'Disabled'}
                        </span>
                    </td>
                    <td style="padding:10px 12px;text-align:right;display:flex;gap:6px;justify-content:flex-end;">
                        <button onclick="adminEditUser(${u.id},'${u.full_name}','${u.username}','${u.role}')" 
                            style="padding:4px 10px;background:#f59e0b22;color:#92400e;border:1px solid #f59e0b44;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button onclick="adminToggleUserActive(${u.id},${u.active})"
                            style="padding:4px 10px;background:${u.active?'#fee2e2':'#dcfce7'};color:${u.active?'#991b1b':'#166534'};border:1px solid ${u.active?'#fca5a5':'#86efac'};border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">
                            ${u.active?'<i class="fas fa-ban"></i> Disable':'<i class="fas fa-check"></i> Enable'}
                        </button>
                        ${u.username !== 'admin' ? `<button onclick="adminDeleteUser(${u.id},'${u.full_name}')"
                            style="padding:4px 10px;background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">
                            <i class="fas fa-trash"></i>
                        </button>` : ''}
                    </td>
                </tr>`).join('')}
            </tbody>
        </table>`;
    } catch(err) {
        container.innerHTML = `<div style="color:#dc2626;padding:16px;">Failed to load users: ${err.message}</div>`;
    }
}

function adminOpenAddUser() {
    document.getElementById('editUserId').value = '';
    document.getElementById('userFullName').value = '';
    document.getElementById('userUsername').value = '';
    document.getElementById('userPassword').value = '';
    document.getElementById('userRole').value = 'staff';
    document.getElementById('userFormTitle').innerHTML = '<i class="fas fa-user-plus"></i> Add User';
    document.getElementById('userFormCard').style.display = 'block';
    document.getElementById('userFormCard').scrollIntoView({ behavior:'smooth' });
}

function adminEditUser(id, fullName, username, role) {
    document.getElementById('editUserId').value = id;
    document.getElementById('userFullName').value = fullName;
    document.getElementById('userUsername').value = username;
    document.getElementById('userPassword').value = '';
    document.getElementById('userRole').value = role;
    document.getElementById('userFormTitle').innerHTML = '<i class="fas fa-user-edit"></i> Edit User';
    document.getElementById('userFormCard').style.display = 'block';
    document.getElementById('userFormCard').scrollIntoView({ behavior:'smooth' });
}

async function adminSaveUser() {
    const id       = document.getElementById('editUserId').value;
    const fullName = document.getElementById('userFullName').value.trim();
    const username = document.getElementById('userUsername').value.trim().toLowerCase();
    const password = document.getElementById('userPassword').value.trim();
    const role     = document.getElementById('userRole').value;

    if (!fullName || !username) { showNotification('Full name and username are required', 'warning'); return; }
    if (!id && !password) { showNotification('Password is required for new users', 'warning'); return; }

    try {
        const method = id ? 'PUT' : 'POST';
        const url    = id ? `${SERVER_URL}/api/users/${id}` : `${SERVER_URL}/api/users`;
        const body   = { fullName, username, role };
        if (password) body.password = password;

        const res  = await fetch(url, { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
        const data = await res.json();

        if (data.success) {
            showNotification(id ? 'User updated' : 'User created — they can now log in', 'success');
            document.getElementById('userFormCard').style.display = 'none';
            adminLoadUsers();
        } else {
            showNotification(data.message || 'Save failed', 'error');
        }
    } catch(err) {
        showNotification('Server error: ' + err.message, 'error');
    }
}

async function adminToggleUserActive(id, currentlyActive) {
    try {
        const res = await fetch(`${SERVER_URL}/api/users/${id}`, {
            method: 'PUT',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ active: !currentlyActive })
        });
        const data = await res.json();
        if (data.success) {
            showNotification(currentlyActive ? 'User disabled' : 'User enabled', 'success');
            adminLoadUsers();
        }
    } catch(err) { showNotification('Error: ' + err.message, 'error'); }
}

async function adminDeleteUser(id, name) {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    try {
        const res = await fetch(`${SERVER_URL}/api/users/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) { showNotification('User deleted', 'success'); adminLoadUsers(); }
        else showNotification(data.message || 'Delete failed', 'error');
    } catch(err) { showNotification('Error: ' + err.message, 'error'); }
}

// ========== WEEKLY RESET ==========

// Resets all order data but keeps customer identity + van/day assignment
function promptWeeklyReset() {
    const count = customers.length;
    const confirmed = confirm(
        'WEEKLY RESET — Are you sure?\n\n' +
        'This will reset ALL ' + count + ' customers to Pending:\n' +
        '• Status → Pending\n' +
        '• Pickers cleared\n' +
        '• Driver cleared\n' +
        '• Trolley count → 0\n' +
        '• All passport fields cleared (labelling kept)\n\n' +
        'KEPT: Name, Address, Zone, Van & Day assignment.\n\n' +
        'Type OK in the next prompt to confirm.'
    );
    if (!confirmed) return;
    const typed = prompt('Type RESET to confirm weekly reset:');
    if ((typed || '').trim().toUpperCase() !== 'RESET') {
        showNotification('Reset cancelled', 'warning');
        return;
    }
    _executeReset(false);
}

// Full reset — also clears van/day assignments
function promptFullReset() {
    const count = customers.length;
    const confirmed = confirm(
        'FULL RESET — Are you sure?\n\n' +
        'This will reset ALL ' + count + ' customers completely:\n' +
        '• Status → Pending\n' +
        '• Pickers cleared\n' +
        '• Driver cleared\n' +
        '• Trolley count → 0\n' +
        '• All passport fields cleared\n' +
        '• Van & Day assignments REMOVED\n\n' +
        'KEPT: Name, Address, Postcode, Lat/Lng, Zone.\n\n' +
        'Type FULLRESET to confirm.'
    );
    if (!confirmed) return;
    const typed = prompt('Type FULLRESET to confirm:');
    if ((typed || '').trim().toUpperCase() !== 'FULLRESET') {
        showNotification('Reset cancelled', 'warning');
        return;
    }
    _executeReset(true);
}

async function _executeReset(clearVanDay) {
    let resetCount = 0;

    customers.forEach(function(customer) {
        // Always reset operational data
        customer.status        = ORDER_STATUSES.PENDING;
        customer.assignedStaff  = [];
        customer.assignedDriver = null;
        customer.deliveryOrder  = 0;
        customer.bayNumber      = null;
        customer.bayOverflow    = null;

        // Reset passport — keep labelling fields only
        if (customer.passport) {
            const labelling = {
                barcodedLabels:    customer.passport.barcodedLabels    || false,
                prePricedLabels:   customer.passport.prePricedLabels   || false,
                labelInstructions: customer.passport.labelInstructions || ''
            };
            const repeat = {
                isRepeatCustomer:   customer.passport.isRepeatCustomer   || false,
                previousOrderCount: customer.passport.previousOrderCount || 0,
                totalOrdersCount:   customer.passport.totalOrdersCount   || 0,
                customerSince:      customer.passport.customerSince      || ''
            };
            const contact = {
                customerContact: customer.passport.customerContact || '',
                customerEmail:   customer.passport.customerEmail   || ''
            };

            // Wipe all passport fields then restore preserved ones
            Object.keys(customer.passport).forEach(function(k) {
                if (typeof customer.passport[k] === 'string')  customer.passport[k] = '';
                else if (typeof customer.passport[k] === 'number') customer.passport[k] = 0;
                else if (typeof customer.passport[k] === 'boolean') customer.passport[k] = false;
                else if (Array.isArray(customer.passport[k]))  customer.passport[k] = [];
                else if (typeof customer.passport[k] === 'object' && customer.passport[k] !== null) {
                    Object.keys(customer.passport[k]).forEach(function(kk) {
                        if (typeof customer.passport[k][kk] === 'string')  customer.passport[k][kk] = '';
                        else if (typeof customer.passport[k][kk] === 'number') customer.passport[k][kk] = 0;
                        else if (Array.isArray(customer.passport[k][kk])) customer.passport[k][kk] = [];
                    });
                }
            });

            Object.assign(customer.passport, labelling, repeat, contact, {
                lastUpdated: new Date().toISOString(),
                updatedBy: 'System - Weekly Reset'
            });
        }

        // Optional: also clear van/day assignment
        if (clearVanDay) {
            if (customer.assignedVan && customer.assignedDay) {
                var vId = customer.assignedVan, dId = customer.assignedDay;
                if (deliveryPlan[vId] && deliveryPlan[vId][dId]) {
                    var idx = deliveryPlan[vId][dId].indexOf(customer.id);
                    if (idx > -1) deliveryPlan[vId][dId].splice(idx, 1);
                }
                if (typeof invalidateRouteCache === 'function') invalidateRouteCache(vId, dId);
            }
            customer.assignedVan = null;
            customer.assignedDay = null;
        } else {
            // Invalidate route cache for the customer's van/day so polylines refresh
            if (customer.assignedVan && customer.assignedDay) {
                if (typeof invalidateRouteCache === 'function') {
                    invalidateRouteCache(customer.assignedVan, customer.assignedDay);
                }
            }
        }

        resetCount++;
    });

    // Clear delivery run drivers too
    window.deliveryRunDrivers = {};

    // Clear localStorage caches so refresh loads fresh data
    try {
        localStorage.removeItem('PEP_route_geometry_cache');
        localStorage.removeItem('PEP_road_distance_cache');
        localStorage.removeItem('PEP_road_distance_cache_version');
        localStorage.removeItem('PEP_delivery_data');
    } catch(e) {}

    // Push reset directly to server DB (most reliable — not dependent on socket timing)
    try {
        const res = await fetch(SERVER_URL + '/api/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clearVanDay: clearVanDay })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Server reset failed');
    } catch(err) {
        console.error('[reset] Server reset failed:', err.message);
        showNotification('Warning: server reset may not have saved — refresh to check', 'warning');
    }

    // Also push via normal saveData to keep socket in sync
    saveData();
    updateAllDisplays();

    // Clear all map layers immediately — markers, routes, and warehouse
    if (typeof markers !== 'undefined')         markers.clearLayers();
    if (typeof deliveryMarkers !== 'undefined')  deliveryMarkers.clearLayers();
    if (typeof deliveryRoutes !== 'undefined')   deliveryRoutes.clearLayers();

    // Re-add warehouse marker and reset route stats panel
    if (typeof addWarehouseMarker === 'function') addWarehouseMarker();
    ['currentRouteStops','currentRouteDistance','currentRouteDriveTime','currentRouteTime'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.textContent = id === 'currentRouteStops' ? '0' : '0 km';
        if (el && id.includes('Time')) el.textContent = '0 min';
    });
    document.getElementById('currentRouteStops') && (document.getElementById('currentRouteStops').textContent = '0');
    document.getElementById('currentRouteDistance') && (document.getElementById('currentRouteDistance').textContent = '0 km');
    document.getElementById('currentRouteDriveTime') && (document.getElementById('currentRouteDriveTime').textContent = '0 min');
    document.getElementById('currentRouteTime') && (document.getElementById('currentRouteTime').textContent = '0 min');

    // Refresh delivery runs panel
    if (typeof refreshDeliveryRunsPanel === 'function') refreshDeliveryRunsPanel();

    const msg = clearVanDay
        ? resetCount + ' customers fully reset — all assignments cleared'
        : resetCount + ' customers reset to Pending — van/day assignments kept';
    showNotification(msg, 'success');
    console.log('[reset]', msg);
}

// ========== OPTIMISER ENGINE STATUS ==========
async function previewOptimiserStatus() {
    var sel = document.getElementById('cfg-optimiserEngine');
    var statusEl = document.getElementById('cfg-optimiserStatus');
    if (!sel || !statusEl) return;

    var engine = sel.value;
    window.OPTIMISER_ENGINE = engine;

    if (engine === 'valhalla') {
        try {
            var r = await fetch(SERVER_URL + '/api/routing-config');
            var d = await r.json();
            if (d.backend === 'valhalla') {
                statusEl.textContent = 'Valhalla is active and ready.';
                statusEl.style.color = 'var(--success)';
            } else {
                statusEl.textContent = 'Note: routing backend is set to "' + d.backend + '" not Valhalla. Optimisation will still use Valhalla /optimized_route.';
                statusEl.style.color = 'var(--warning)';
            }
        } catch(e) {
            statusEl.textContent = 'Could not reach server to check Valhalla status.';
            statusEl.style.color = 'var(--danger)';
        }
    } else {
        try {
            var r2 = await fetch(SERVER_URL + '/api/optimiser-status');
            var d2 = await r2.json();
            if (d2.available) {
                statusEl.textContent = 'OR-Tools (Python FastAPI) is running at ' + d2.url + '.';
                statusEl.style.color = 'var(--success)';
            } else {
                statusEl.textContent = 'OR-Tools is NOT running at ' + d2.url + '. Start Python service or switch to Valhalla.';
                statusEl.style.color = 'var(--danger)';
            }
        } catch(e) {
            statusEl.textContent = 'Could not reach server.';
            statusEl.style.color = 'var(--danger)';
        }
    }
}
window.previewOptimiserStatus = previewOptimiserStatus;

// ========== EMAIL SETTINGS ==========

function updateEmailStatusBadge(cfg) {
    const badge = document.getElementById('email-status-badge');
    if (!badge) return;
    const configured = cfg && cfg.smtpHost && cfg.smtpUser && cfg.smtpPass;
    badge.textContent = configured ? 'Configured' : 'Not configured';
    badge.style.background = configured ? 'var(--success-bg, #f0fdf4)' : 'var(--surface-2)';
    badge.style.color = configured ? 'var(--success, #16a34a)' : 'var(--text-muted)';
    badge.style.border = configured ? '1px solid var(--success-border, #bbf7d0)' : '1px solid var(--border)';
}

function loadEmailSettings() {
    const cfg = companyConfig || {};
    const _sv = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    _sv('cfg-smtpHost', cfg.smtpHost);
    _sv('cfg-smtpPort', cfg.smtpPort || '587');
    _sv('cfg-smtpUser', cfg.smtpUser);
    _sv('cfg-smtpPass', cfg.smtpPass);
    _sv('cfg-smtpFrom', cfg.smtpFrom);
    const _sc = (id, v) => { const el = document.getElementById(id); if (el) el.checked = v !== false && v !== 'false'; };
    _sc('cfg-emailNotifyOutForDelivery', cfg.emailNotifyOutForDelivery !== undefined ? cfg.emailNotifyOutForDelivery : true);
    _sc('cfg-emailNotifyDelivered',      cfg.emailNotifyDelivered      !== undefined ? cfg.emailNotifyDelivered      : true);
    _sc('cfg-emailNotifyDriverAssigned', cfg.emailNotifyDriverAssigned !== undefined ? cfg.emailNotifyDriverAssigned : true);
    updateEmailStatusBadge(cfg);
}

async function emailSendTest() {
    const to = document.getElementById('email-test-to')?.value?.trim();
    if (!to) { showNotification('Enter a recipient email address first', 'error'); return; }
    try {
        const res = await fetch(`${SERVER_URL}/api/email/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to })
        });
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) {
            showNotification('Server not ready — please restart the server and try again', 'error');
            return;
        }
        const data = await res.json();
        if (data.success) showNotification(`Test email sent to ${to}`, 'success');
        else showNotification('Failed: ' + (data.message || 'Unknown error'), 'error');
    } catch(err) { showNotification('Error: ' + err.message, 'error'); }
}
