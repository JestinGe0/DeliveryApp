// ========== API IMPORT MODULE ==========

const INTERNAL_FIELDS = [
    { value: 'name',                  label: 'Customer Name' },
    { value: 'address',               label: 'Address' },
    { value: 'postcode',              label: 'Postcode' },
    { value: 'phone',                 label: 'Phone' },
    { value: 'email',                 label: 'Email' },
    { value: 'order_number',          label: 'Order Number' },
    { value: 'latitude',              label: 'Latitude' },
    { value: 'longitude',             label: 'Longitude' },
    { value: 'zone',                  label: 'Zone' },
    { value: 'notes',                 label: 'Notes' },
    { value: 'number_of_plants',      label: 'Number of Plants' },
    { value: 'plant_variety',         label: 'Plant Variety' },
    { value: 'contact_name',          label: 'Contact Name' },
    { value: 'special_instructions',  label: 'Special Instructions' },
];

const TRANSFORMS = ['', 'trim', 'uppercase', 'lowercase', 'capitalize'];

const DAY_NAMES  = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// State
let apiStagedRecords = [];
let apiCurrentConnectionId = null;
let apiMappingConnectionId = null;
let apiConnections = [];

// ─── Init ────────────────────────────────────────────────────────────────────

function initApiImport() {
    apiLoadConnections();
}

// Called when API Import tab becomes visible
function onApiImportScreenShow() {
    apiLoadConnections().then(() => {
        if (apiCurrentConnectionId) apiLoadStaging(apiCurrentConnectionId);
    });
}

// ─── Settings helpers ────────────────────────────────────────────────────────

function apiSettingsToggleEnabled(enabled) {
    // Immediate preview of nav tab — persisted when user clicks Save All Settings
    const tab = document.querySelector('.api-import-nav-tab');
    if (tab) tab.style.display = enabled ? 'flex' : 'none';
}

// ─── Connection CRUD ─────────────────────────────────────────────────────────

async function apiLoadConnections() {
    try {
        const r = await fetch(`${SERVER_URL}/api/external/connections`);
        const d = await r.json();
        if (!d.success) return;
        apiConnections = d.connections || [];
        apiRenderConnectionsList();
        apiPopulateConnSelect();
    } catch (e) {
        console.error('[API] load connections', e);
    }
}

function apiRenderConnectionsList() {
    const el = document.getElementById('apiConnectionsList');
    if (!el) return;
    if (!apiConnections.length) {
        el.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">No connections yet. Click <strong>Add Connection</strong> to create one.</p>';
        return;
    }
    el.innerHTML = apiConnections.map(c => `
        <div class="api-conn-row">
            <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
                <span class="api-conn-status ${c.enabled ? 'enabled' : 'disabled'}"></span>
                <div>
                    <div style="font-weight:600;font-size:14px;">${escHtml(c.name)}</div>
                    <div style="font-size:12px;color:var(--text-muted);word-break:break-all;">${escHtml(c.base_url)}${escHtml(c.endpoint || '')}</div>
                </div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
                <button class="action-btn btn-secondary" style="padding:5px 10px;font-size:11px;" onclick="apiSettingsEditConnection(${c.id})">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="action-btn btn-primary" style="padding:5px 10px;font-size:11px;" onclick="apiSettingsOpenMappings(${c.id}, '${escHtml(c.name)}')">
                    <i class="fas fa-arrows-left-right"></i> Map Fields
                </button>
                <button class="action-btn btn-danger" style="padding:5px 10px;font-size:11px;" onclick="apiSettingsDeleteConnection(${c.id}, '${escHtml(c.name)}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function apiPopulateConnSelect() {
    const sel = document.getElementById('apiImportConnSelect');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">— Select Connection —</option>' +
        apiConnections.filter(c => c.enabled).map(c =>
            `<option value="${c.id}" ${c.id == prev ? 'selected' : ''}>${escHtml(c.name)}</option>`
        ).join('');
    const btn = document.getElementById('apiImportFetchBtn');
    if (btn) btn.disabled = !sel.value;
}

function apiImportOnConnectionChange() {
    const sel = document.getElementById('apiImportConnSelect');
    apiCurrentConnectionId = sel.value || null;
    const btn = document.getElementById('apiImportFetchBtn');
    if (btn) btn.disabled = !apiCurrentConnectionId;
    if (apiCurrentConnectionId) {
        apiLoadStaging(apiCurrentConnectionId);
    } else {
        apiStagedRecords = [];
        apiRenderTable();
    }
}

function apiSettingsNewConnection() {
    document.getElementById('apiConnId').value = '';
    document.getElementById('apiConnEditorTitle').innerHTML = '<i class="fas fa-link"></i> New Connection';
    document.getElementById('apiConnName').value = '';
    document.getElementById('apiConnBaseUrl').value = '';
    document.getElementById('apiConnEndpoint').value = '';
    document.getElementById('apiConnResponsePath').value = '';
    document.getElementById('apiConnAuthType').value = 'none';
    document.getElementById('apiConnEnabled').value = '1';
    document.getElementById('apiConnApiKey').value = '';
    document.getElementById('apiConnApiKeyPlacement').value = 'header';
    document.getElementById('apiConnApiKeyName').value = '';
    document.getElementById('apiConnBearerToken').value = '';
    document.getElementById('apiConnBasicUser').value = '';
    document.getElementById('apiConnBasicPass').value = '';
    document.getElementById('apiCustomHeadersList').innerHTML = '';
    document.getElementById('apiConnTestResult').innerHTML = '';
    apiSettingsShowAuthFields();
    document.getElementById('apiConnectionEditor').style.display = '';
    document.getElementById('apiConnectionEditor').scrollIntoView({ behavior: 'smooth' });
}

async function apiSettingsEditConnection(id) {
    const conn = apiConnections.find(c => c.id === id);
    if (!conn) return;
    const cfg = JSON.parse(conn.auth_config || '{}');
    const extra = JSON.parse(conn.extra_headers || '[]');

    document.getElementById('apiConnId').value = conn.id;
    document.getElementById('apiConnEditorTitle').innerHTML = `<i class="fas fa-edit"></i> Edit — ${escHtml(conn.name)}`;
    document.getElementById('apiConnName').value = conn.name || '';
    document.getElementById('apiConnBaseUrl').value = conn.base_url || '';
    document.getElementById('apiConnEndpoint').value = conn.endpoint || '';
    document.getElementById('apiConnResponsePath').value = conn.response_path || '';
    document.getElementById('apiConnAuthType').value = conn.auth_type || 'none';
    document.getElementById('apiConnEnabled').value = conn.enabled ? '1' : '0';
    document.getElementById('apiConnApiKey').value = cfg.key || '';
    document.getElementById('apiConnApiKeyPlacement').value = cfg.placement || 'header';
    document.getElementById('apiConnApiKeyName').value = cfg.header_name || cfg.param_name || '';
    document.getElementById('apiConnBearerToken').value = cfg.token || '';
    document.getElementById('apiConnBasicUser').value = cfg.username || '';
    document.getElementById('apiConnBasicPass').value = cfg.password || '';

    // Rebuild custom headers
    const chList = document.getElementById('apiCustomHeadersList');
    chList.innerHTML = '';
    (cfg.headers || []).forEach(h => apiSettingsAddCustomHeader(h.key, h.value));

    document.getElementById('apiConnTestResult').innerHTML = '';
    apiSettingsShowAuthFields();
    document.getElementById('apiConnectionEditor').style.display = '';
    document.getElementById('apiConnectionEditor').scrollIntoView({ behavior: 'smooth' });
}

function apiSettingsShowAuthFields() {
    const type = document.getElementById('apiConnAuthType').value;
    ['api_key', 'bearer', 'basic', 'custom'].forEach(t => {
        const el = document.getElementById(`apiAuthFields-${t}`);
        if (el) el.style.display = (t === type) ? '' : 'none';
    });
}

function apiSettingsAddCustomHeader(key = '', value = '') {
    const list = document.getElementById('apiCustomHeadersList');
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;margin-bottom:6px;';
    row.innerHTML = `
        <input type="text" class="settings-input api-custom-hdr-key" placeholder="Header Name" value="${escHtml(key)}" style="flex:1">
        <input type="text" class="settings-input api-custom-hdr-val" placeholder="Value" value="${escHtml(value)}" style="flex:2">
        <button type="button" onclick="this.closest('div').remove()" style="background:var(--danger);color:white;border:none;border-radius:6px;padding:0 10px;cursor:pointer;">×</button>
    `;
    list.appendChild(row);
}

function apiSettingsBuildAuthConfig() {
    const type = document.getElementById('apiConnAuthType').value;
    if (type === 'api_key') {
        const placement = document.getElementById('apiConnApiKeyPlacement').value;
        return {
            key: document.getElementById('apiConnApiKey').value,
            placement,
            [placement === 'header' ? 'header_name' : 'param_name']: document.getElementById('apiConnApiKeyName').value
        };
    } else if (type === 'bearer') {
        return { token: document.getElementById('apiConnBearerToken').value };
    } else if (type === 'basic') {
        return { username: document.getElementById('apiConnBasicUser').value, password: document.getElementById('apiConnBasicPass').value };
    } else if (type === 'custom') {
        const headers = [];
        document.querySelectorAll('#apiCustomHeadersList > div').forEach(row => {
            const k = row.querySelector('.api-custom-hdr-key')?.value?.trim();
            const v = row.querySelector('.api-custom-hdr-val')?.value || '';
            if (k) headers.push({ key: k, value: v });
        });
        return { headers };
    }
    return {};
}

async function apiSettingsSaveConnection() {
    const name = document.getElementById('apiConnName').value.trim();
    const base_url = document.getElementById('apiConnBaseUrl').value.trim();
    if (!name || !base_url) { alert('Name and Base URL are required.'); return; }

    const id = document.getElementById('apiConnId').value;
    const payload = {
        name,
        base_url,
        endpoint: document.getElementById('apiConnEndpoint').value.trim(),
        response_path: document.getElementById('apiConnResponsePath').value.trim(),
        auth_type: document.getElementById('apiConnAuthType').value,
        auth_config: apiSettingsBuildAuthConfig(),
        extra_headers: [],
        enabled: document.getElementById('apiConnEnabled').value === '1'
    };

    const url = id ? `${SERVER_URL}/api/external/connections/${id}` : `${SERVER_URL}/api/external/connections`;
    const method = id ? 'PUT' : 'POST';
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const d = await r.json();
    if (d.success) {
        document.getElementById('apiConnectionEditor').style.display = 'none';
        await apiLoadConnections();
    } else {
        alert('Save failed: ' + d.message);
    }
}

async function apiSettingsTestConnection() {
    const id = document.getElementById('apiConnId').value;
    const resultEl = document.getElementById('apiConnTestResult');

    if (!id) {
        // Test with unsaved data — save first
        resultEl.innerHTML = '<span style="color:var(--warning)">Save the connection first, then test it.</span>';
        return;
    }
    resultEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing…';
    try {
        const r = await fetch(`${SERVER_URL}/api/external/connections/${id}/test`, { method: 'POST' });
        const d = await r.json();
        if (d.success) {
            resultEl.innerHTML = `<span style="color:var(--success)"><i class="fas fa-check-circle"></i> Connected! Found <strong>${d.count}</strong> record(s). Sample keys: <code>${(d.keys || []).join(', ')}</code></span>`;
        } else {
            resultEl.innerHTML = `<span style="color:var(--danger)"><i class="fas fa-times-circle"></i> ${escHtml(d.message)}</span>`;
        }
    } catch (e) {
        resultEl.innerHTML = `<span style="color:var(--danger)"><i class="fas fa-times-circle"></i> ${escHtml(e.message)}</span>`;
    }
}

async function apiSettingsDeleteConnection(id, name) {
    if (!confirm(`Delete connection "${name}"? This also removes all its field mappings.`)) return;
    await fetch(`${SERVER_URL}/api/external/connections/${id}`, { method: 'DELETE' });
    await apiLoadConnections();
}

// ─── Field Mapping ───────────────────────────────────────────────────────────

async function apiSettingsOpenMappings(connId, connName) {
    apiMappingConnectionId = connId;
    document.getElementById('apiMappingConnName').textContent = connName;

    const r = await fetch(`${SERVER_URL}/api/external/connections/${connId}/mappings`);
    const d = await r.json();
    const mappings = d.mappings || [];

    const tbody = document.getElementById('apiMappingRows');
    tbody.innerHTML = '';
    mappings.forEach(m => apiSettingsAddMappingRow(m.external_field, m.internal_field, m.transform));
    if (!mappings.length) apiSettingsAddMappingRow();

    document.getElementById('apiFieldMappingEditor').style.display = '';
    document.getElementById('apiFieldMappingEditor').scrollIntoView({ behavior: 'smooth' });
}

function apiSettingsAddMappingRow(extField = '', intField = '', transform = '') {
    const tbody = document.getElementById('apiMappingRows');
    const intOptions = INTERNAL_FIELDS.map(f =>
        `<option value="${f.value}" ${f.value === intField ? 'selected' : ''}>${f.label}</option>`
    ).join('');
    const transformOptions = TRANSFORMS.map(t =>
        `<option value="${t}" ${t === transform ? 'selected' : ''}>${t || '— none —'}</option>`
    ).join('');

    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td style="padding:6px;"><input type="text" class="settings-input api-map-ext" value="${escHtml(extField)}" placeholder="e.g. customer.name" style="width:100%"></td>
        <td style="padding:6px;"><select class="settings-input api-map-int" style="width:100%">${intOptions}</select></td>
        <td style="padding:6px;"><select class="settings-input api-map-transform" style="width:100%">${transformOptions}</select></td>
        <td style="padding:6px;"><button type="button" onclick="this.closest('tr').remove()" style="background:var(--danger);color:white;border:none;border-radius:6px;padding:3px 10px;cursor:pointer;">×</button></td>
    `;
    tbody.appendChild(tr);
}

async function apiSettingsSaveMappings() {
    const rows = document.querySelectorAll('#apiMappingRows tr');
    const mappings = [];
    rows.forEach(tr => {
        const ext = tr.querySelector('.api-map-ext')?.value?.trim();
        const int = tr.querySelector('.api-map-int')?.value;
        const transform = tr.querySelector('.api-map-transform')?.value;
        if (ext && int) mappings.push({ external_field: ext, internal_field: int, transform: transform || null });
    });

    const r = await fetch(`${SERVER_URL}/api/external/connections/${apiMappingConnectionId}/mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings })
    });
    const d = await r.json();
    if (d.success) {
        document.getElementById('apiFieldMappingEditor').style.display = 'none';
        showToast('Field mappings saved.', 'success');
    } else {
        alert('Save failed: ' + d.message);
    }
}

// ─── Import screen ───────────────────────────────────────────────────────────

async function apiImportFetch() {
    if (!apiCurrentConnectionId) return;
    const btn = document.getElementById('apiImportFetchBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Fetching…';
    apiSetStatus('Fetching data from external API…', 'info');

    try {
        const r = await fetch(`${SERVER_URL}/api/external/connections/${apiCurrentConnectionId}/fetch`, { method: 'POST' });
        const d = await r.json();
        if (d.success) {
            apiSetStatus(`Fetched <strong>${d.count}</strong> record(s). Review below and confirm the ones you want to import.`, 'success');
            await apiLoadStaging(apiCurrentConnectionId);
        } else {
            apiSetStatus('Fetch failed: ' + d.message, 'error');
        }
    } catch (e) {
        apiSetStatus('Error: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-download"></i> Fetch Orders';
    }
}

async function apiLoadStaging(connId) {
    try {
        const r = await fetch(`${SERVER_URL}/api/external/staging?connection_id=${connId}`);
        const d = await r.json();
        apiStagedRecords = d.records || [];
        apiRenderTable();
    } catch (e) {
        console.error('[API] load staging', e);
    }
}

function apiRenderTable() {
    const empty = document.getElementById('apiImportEmpty');
    const wrap  = document.getElementById('apiImportTableWrap');
    const confirmBtn = document.getElementById('apiImportConfirmBtn');
    const deleteBtn  = document.getElementById('apiImportDeleteBtn');

    if (!apiStagedRecords.length) {
        empty.style.display = '';
        wrap.style.display = 'none';
        if (confirmBtn) confirmBtn.style.display = 'none';
        if (deleteBtn)  deleteBtn.style.display  = 'none';
        document.getElementById('apiImportBadge').style.display = 'none';
        return;
    }

    empty.style.display = 'none';
    wrap.style.display  = '';
    if (confirmBtn) confirmBtn.style.display = '';
    if (deleteBtn)  deleteBtn.style.display  = '';

    // Badge
    const badge = document.getElementById('apiImportBadge');
    if (badge) { badge.style.display = ''; badge.textContent = apiStagedRecords.length; }

    document.getElementById('apiImportRecordCount').textContent = `${apiStagedRecords.length} record(s) in staging`;

    // Determine column keys from all mapped_data objects
    const allKeys = new Set();
    apiStagedRecords.forEach(r => Object.keys(r.mapped_data || {}).forEach(k => allKeys.add(k)));
    const cols = [...allKeys];

    // Get vans + drivers for dropdowns
    const vans = (typeof VANS !== 'undefined') ? VANS : [];
    const vanOptions = vans.map(v => `<option value="${v.id}">Van ${v.id}</option>`).join('');
    const driverOptions = apiGetDriverOptions();

    // Build header
    const thead = document.getElementById('apiImportThead');
    thead.innerHTML = `<tr>
        <th><input type="checkbox" id="apiSelectAllInner" onchange="apiImportToggleAll(this.checked)"></th>
        ${cols.map(k => `<th>${escHtml(k)}</th>`).join('')}
        <th>Delivery Day</th>
        <th>Van</th>
        <th>Driver</th>
        <th>Collection?</th>
        <th>Passport Notes</th>
        <th></th>
    </tr>`;

    // Build rows
    const tbody = document.getElementById('apiImportTbody');
    tbody.innerHTML = apiStagedRecords.map((rec, idx) => {
        const dayOptions = DAY_NAMES.map((d, i) => i === 0 ? '' : `<option value="${i}" ${rec.assigned_day == i ? 'selected' : ''}>${d}</option>`).join('');
        const vanOpts = `<option value="">—</option>` + vans.map(v => `<option value="${v.id}" ${rec.assigned_van == v.id ? 'selected' : ''}>Van ${v.id}</option>`).join('');
        const drvOpts = `<option value="">—</option>` + driverOptions;
        const passNotes = rec.passport_data?.specialDeliveryInstructions || '';
        return `<tr id="api-row-${rec.id}">
            <td><input type="checkbox" class="api-row-chk" data-id="${rec.id}" onchange="apiImportUpdateSelectedCount()"></td>
            ${cols.map(k => `<td class="api-cell-editable" title="${escHtml(String(rec.mapped_data[k] ?? ''))}" onclick="apiEditCell(this, ${rec.id}, '${k}')">${escHtml(String(rec.mapped_data[k] ?? ''))}</td>`).join('')}
            <td><select class="api-inline-select" onchange="apiUpdateStagingField(${rec.id}, 'assigned_day', this.value)"><option value="">—</option>${dayOptions}</select></td>
            <td><select class="api-inline-select" onchange="apiUpdateStagingField(${rec.id}, 'assigned_van', this.value)"><option value="">—</option>${vans.map(v => `<option value="${v.id}" ${rec.assigned_van == v.id ? 'selected' : ''}>Van ${v.id}</option>`).join('')}</select></td>
            <td><select class="api-inline-select" onchange="apiUpdateStagingField(${rec.id}, 'assigned_driver', this.value)">${drvOpts}</select></td>
            <td style="text-align:center"><input type="checkbox" ${rec.is_collection ? 'checked' : ''} onchange="apiUpdateStagingField(${rec.id}, 'is_collection', this.checked)"></td>
            <td><input type="text" class="api-inline-input" value="${escHtml(passNotes)}" placeholder="Delivery notes…" onchange="apiUpdatePassportNotes(${rec.id}, this.value)"></td>
            <td><button class="action-btn btn-danger" style="padding:4px 8px;font-size:11px;" onclick="apiImportDeleteRecord(${rec.id})"><i class="fas fa-trash"></i></button></td>
        </tr>`;
    }).join('');

    apiImportUpdateSelectedCount();
}

function apiGetDriverOptions() {
    // Pull drivers from global staff data if available
    if (typeof staffData !== 'undefined' && Array.isArray(staffData)) {
        return staffData
            .filter(s => s.type === 'driver' || s.role === 'driver')
            .map(s => `<option value="${s.staffId || s.staff_id || s.id}">${escHtml(s.name)}</option>`)
            .join('');
    }
    return '';
}

function apiImportToggleAll(checked) {
    document.querySelectorAll('.api-row-chk').forEach(cb => { cb.checked = checked; });
    const inner = document.getElementById('apiSelectAllInner');
    if (inner) inner.checked = checked;
    apiImportUpdateSelectedCount();
}

function apiImportUpdateSelectedCount() {
    const selected = document.querySelectorAll('.api-row-chk:checked').length;
    const countEl = document.getElementById('apiImportSelectedCount');
    if (countEl) countEl.textContent = selected;
    const confirmBtn = document.getElementById('apiImportConfirmBtn');
    const deleteBtn  = document.getElementById('apiImportDeleteBtn');
    if (confirmBtn) confirmBtn.style.display = selected > 0 ? '' : 'none';
    if (deleteBtn)  deleteBtn.style.display  = selected > 0 ? '' : 'none';
}

async function apiUpdateStagingField(id, field, value) {
    const body = {};
    if (field === 'is_collection') {
        body.is_collection = value ? 1 : 0;
    } else {
        body[field] = value || null;
    }
    await fetch(`${SERVER_URL}/api/external/staging/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    // Update local state
    const rec = apiStagedRecords.find(r => r.id === id);
    if (rec) Object.assign(rec, body);
}

async function apiUpdatePassportNotes(id, value) {
    const rec = apiStagedRecords.find(r => r.id === id);
    const passport = rec ? { ...(rec.passport_data || {}), specialDeliveryInstructions: value } : { specialDeliveryInstructions: value };
    await fetch(`${SERVER_URL}/api/external/staging/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passport_data: passport })
    });
    if (rec) rec.passport_data = passport;
}

// Inline cell editing for mapped_data fields
function apiEditCell(td, id, field) {
    if (td.querySelector('input')) return; // already editing
    const current = td.textContent;
    td.innerHTML = `<input type="text" class="api-inline-input" value="${escHtml(current)}" style="width:100%">`;
    const input = td.querySelector('input');
    input.focus();
    input.select();
    const save = async () => {
        const newVal = input.value;
        td.textContent = newVal;
        const rec = apiStagedRecords.find(r => r.id === id);
        if (rec) {
            rec.mapped_data[field] = newVal;
            await fetch(`${SERVER_URL}/api/external/staging/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mapped_data: rec.mapped_data })
            });
        }
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { td.textContent = current; } });
}

async function apiImportDeleteRecord(id) {
    await fetch(`${SERVER_URL}/api/external/staging/${id}`, { method: 'DELETE' });
    apiStagedRecords = apiStagedRecords.filter(r => r.id !== id);
    apiRenderTable();
}

async function apiImportDeleteSelected() {
    const ids = [...document.querySelectorAll('.api-row-chk:checked')].map(cb => parseInt(cb.dataset.id));
    if (!ids.length) return;
    if (!confirm(`Remove ${ids.length} record(s) from staging?`)) return;
    await Promise.all(ids.map(id => fetch(`${SERVER_URL}/api/external/staging/${id}`, { method: 'DELETE' })));
    apiStagedRecords = apiStagedRecords.filter(r => !ids.includes(r.id));
    apiRenderTable();
}

async function apiImportConfirmSelected() {
    const ids = [...document.querySelectorAll('.api-row-chk:checked')].map(cb => parseInt(cb.dataset.id));
    if (!ids.length) return;
    if (!confirm(`Import ${ids.length} order(s) into Current Orders? Status will be set to Pending.`)) return;

    apiSetStatus(`Importing ${ids.length} record(s)…`, 'info');
    try {
        const r = await fetch(`${SERVER_URL}/api/external/staging/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
        });
        const d = await r.json();
        if (d.success) {
            const msg = `<strong>${d.created}</strong> order(s) imported successfully.` +
                (d.errors.length ? ` ${d.errors.length} failed.` : '');
            apiSetStatus(msg, d.errors.length ? 'warning' : 'success');
            await apiLoadStaging(apiCurrentConnectionId);
        } else {
            apiSetStatus('Import failed: ' + d.message, 'error');
        }
    } catch (e) {
        apiSetStatus('Error: ' + e.message, 'error');
    }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function apiSetStatus(msg, type = 'info') {
    const el = document.getElementById('apiImportStatus');
    if (!el) return;
    const colors = { info: 'var(--primary)', success: 'var(--success)', error: 'var(--danger)', warning: 'var(--warning)' };
    const icons  = { info: 'fa-circle-info', success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-triangle-exclamation' };
    el.style.display = '';
    el.style.color = colors[type] || colors.info;
    el.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${msg}`;
}

function escHtml(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, type = 'success') {
    // Use existing toast if available, else fall back to alert
    if (typeof showNotification === 'function') {
        showNotification(msg, type);
    } else {
        alert(msg);
    }
}

// Expose init to global scope so settings.js switchSettingsTab can call it
window.initApiImport = initApiImport;
window.onApiImportScreenShow = onApiImportScreenShow;
window.apiSettingsToggleEnabled = apiSettingsToggleEnabled;
window.apiSettingsNewConnection = apiSettingsNewConnection;
window.apiSettingsEditConnection = apiSettingsEditConnection;
window.apiSettingsShowAuthFields = apiSettingsShowAuthFields;
window.apiSettingsAddCustomHeader = apiSettingsAddCustomHeader;
window.apiSettingsSaveConnection = apiSettingsSaveConnection;
window.apiSettingsTestConnection = apiSettingsTestConnection;
window.apiSettingsDeleteConnection = apiSettingsDeleteConnection;
window.apiSettingsOpenMappings = apiSettingsOpenMappings;
window.apiSettingsAddMappingRow = apiSettingsAddMappingRow;
window.apiSettingsSaveMappings = apiSettingsSaveMappings;
window.apiImportOnConnectionChange = apiImportOnConnectionChange;
window.apiImportFetch = apiImportFetch;
window.apiImportToggleAll = apiImportToggleAll;
window.apiImportUpdateSelectedCount = apiImportUpdateSelectedCount;
window.apiUpdateStagingField = apiUpdateStagingField;
window.apiUpdatePassportNotes = apiUpdatePassportNotes;
window.apiEditCell = apiEditCell;
window.apiImportDeleteRecord = apiImportDeleteRecord;
window.apiImportDeleteSelected = apiImportDeleteSelected;
window.apiImportConfirmSelected = apiImportConfirmSelected;
