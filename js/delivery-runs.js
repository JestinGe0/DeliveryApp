// ========== DELIVERY RUNS ==========
// A "run" is one van load of <= 17 trolleys.
// If a van/day has 23 trolleys, that's 2 runs: run 1 = 17 trolleys, run 2 = 6 trolleys.
// Each run can have its own driver.
// Run assignments are stored in localStorage via saveData().

var MAX_TROLLEYS_PER_RUN = 17;

// deliveryRunDrivers[vanId][dayId][runIndex] = staffId | null
// Stored persistently — drivers survive page refresh.
if (typeof window.deliveryRunDrivers === 'undefined') {
    window.deliveryRunDrivers = {};
}

// ── Selection state ──────────────────────────────────────────────────────────
var _drSelectMode = false;
var _drSelected   = new Set();

// ── Compute runs from current assignments ────────────────────────────────────
// Returns array of run objects: [{ run:1, customers:[], trolleys:0, driverId:null }]
function computeDeliveryRuns(vanId, dayId) {
    const ids = deliveryPlan[vanId]?.[dayId] || [];
    const assignedCustomers = ids.map(id => customers.find(c => c.id === id)).filter(Boolean);
    const VAN_MAX = getVanTrolleyLimit(vanId);

    const runs = [];
    let currentRun = [];
    let currentTrolleys = 0;

    assignedCustomers.forEach(customer => {
        const trolleys = getTotalTrolleyCount(customer);

        if (currentTrolleys + trolleys > VAN_MAX && currentRun.length > 0) {
            runs.push({ customers: currentRun, trolleys: currentTrolleys });
            currentRun = [];
            currentTrolleys = 0;
        }

        currentRun.push(customer);
        currentTrolleys += trolleys;
    });

    if (currentRun.length > 0) {
        runs.push({ customers: currentRun, trolleys: currentTrolleys });
    }

    const driverKey  = `${vanId}-${dayId}`;
    const savedDrivers = (window.deliveryRunDrivers[driverKey] || []);

    return runs.map((run, i) => ({
        run:      i + 1,
        customers: run.customers,
        trolleys:  run.trolleys,
        driverId:  savedDrivers[i] || null
    }));
}

// ── Compute runs from a raw ID array (no driver lookup) ──────────────────────
function _computeRunsFromIds(ids, vanId) {
    const VAN_MAX = vanId ? getVanTrolleyLimit(vanId) : ((typeof MAX_TROLLEYS_PER_RUN !== 'undefined') ? MAX_TROLLEYS_PER_RUN : 17);
    const cs = ids.map(id => customers.find(c => c.id === id)).filter(Boolean);
    const runs = [];
    let cur = [], curT = 0;
    cs.forEach(c => {
        const t = getTotalTrolleyCount(c);
        if (curT + t > VAN_MAX && cur.length > 0) {
            runs.push({ customers: cur, trolleys: curT });
            cur = []; curT = 0;
        }
        cur.push(c); curT += t;
    });
    if (cur.length > 0) runs.push({ customers: cur, trolleys: curT });
    return runs;
}

// ── Render the panel ─────────────────────────────────────────────────────────
function refreshDeliveryRunsPanel() {
    const content = document.getElementById('deliveryRunsContent');
    const badge   = document.getElementById('deliveryRunsBadge');
    if (!content || !badge) return;

    const runs = computeDeliveryRuns(currentVan, currentDay);
    const van  = VANS.find(v => v.id === currentVan);

    badge.textContent = runs.length === 0 ? '0 runs' : `${runs.length} run${runs.length > 1 ? 's' : ''}`;

    if (runs.length === 0) {
        _drSelectMode = false;
        _drSelected.clear();
        content.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px;">
            <i class="fas fa-truck" style="font-size:22px;opacity:0.2;display:block;margin-bottom:8px;"></i>
            No stops assigned yet
        </div>`;
        return;
    }

    const totalTrolleys = runs.reduce((s, r) => s + r.trolleys, 0);

    // ── Select / Move toolbar (hidden when feature disabled in settings) ──
    const moveEnabled = typeof DELIVERY_RUN_MOVE_ENABLED === 'undefined' || DELIVERY_RUN_MOVE_ENABLED;
    if (!moveEnabled) { _drSelectMode = false; _drSelected.clear(); }
    const selectBar = !moveEnabled ? '' : `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 2px 8px;gap:6px;">
        <button onclick="toggleDeliveryRunSelectMode()"
            style="padding:5px 12px;border:1px solid ${_drSelectMode ? '#7c3aed' : 'var(--border)'};border-radius:6px;
                   background:${_drSelectMode ? '#7c3aed' : 'var(--surface)'};
                   color:${_drSelectMode ? 'white' : 'var(--text)'};font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">
            <i class="fas fa-${_drSelectMode ? 'times' : 'check-square'}"></i>
            ${_drSelectMode ? 'Cancel' : 'Select & Move'}
        </button>
        ${_drSelectMode && _drSelected.size > 0 ? `
        <button onclick="openRunMoveModal()"
            style="padding:5px 12px;border:none;border-radius:6px;background:#7c3aed;color:white;
                   font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">
            <i class="fas fa-arrows-alt"></i> Move ${_drSelected.size} selected
        </button>` : (_drSelectMode ? `<span style="font-size:11px;color:var(--text-muted);">Tap customers below</span>` : '')}
    </div>`;

    // ── Run cards ──────────────────────────────────────────────────────────
    const runsHtml = runs.map(run => {
        const pct      = Math.round((run.trolleys / MAX_TROLLEYS_PER_RUN) * 100);
        const barColor = pct <= 70 ? '#16a34a' : pct <= 90 ? '#d97706' : '#dc2626';

        const driverOptions = staffMembers
            .filter(s => s.type === 'driver' || s.role === 'Driver' || s.type === 'both')
            .map(s => `<option value="${s.id}" ${run.driverId === s.id ? 'selected' : ''}>${s.name}</option>`)
            .join('');

        const customerList = run.customers.map(c => {
            const t       = getTotalTrolleyCount(c);
            const isSel   = _drSelected.has(c.id);
            const selBg   = isSel ? 'background:#ede9fe;' : '';
            const selBdr  = isSel ? 'border-left:3px solid #7c3aed;' : 'border-left:3px solid transparent;';
            const clickFn = _drSelectMode ? `onclick="toggleRunCustomerSelection(${c.id})"` : '';
            const cursor  = _drSelectMode ? 'cursor:pointer;' : '';
            return `<div ${clickFn}
                style="display:flex;align-items:center;gap:6px;padding:4px 4px;
                       border-bottom:1px solid var(--border);font-size:11px;
                       ${selBg}${selBdr}${cursor}transition:background 0.15s;">
                ${_drSelectMode
                    ? `<input type="checkbox" ${isSel ? 'checked' : ''}
                           style="pointer-events:none;accent-color:#7c3aed;flex-shrink:0;" onclick="return false;">`
                    : ''}
                <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text);">${c.name}</span>
                <span style="color:var(--primary);font-weight:700;flex-shrink:0;">🛒 ${t}</span>
            </div>`;
        }).join('');

        return `
        <div style="border:1.5px solid ${van ? van.color + '44' : '#e5e7eb'};border-radius:8px;margin-bottom:8px;overflow:hidden;">
            <!-- Run header -->
            <div style="background:${van ? van.color : '#6b7280'};padding:7px 10px;display:flex;align-items:center;justify-content:space-between;">
                <span style="color:white;font-weight:800;font-size:13px;">Run ${run.run}</span>
                <span style="background:rgba(255,255,255,0.25);color:white;font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px;">
                    ${run.customers.length} stops · ${run.trolleys}/${MAX_TROLLEYS_PER_RUN} 🛒
                </span>
            </div>

            <!-- Trolley bar -->
            <div style="padding:8px 10px 4px;">
                <div style="background:#f3f4f6;border-radius:20px;height:8px;overflow:hidden;">
                    <div style="background:${barColor};height:100%;border-radius:20px;width:${pct}%;transition:width 0.4s;"></div>
                </div>
                <div style="display:flex;justify-content:space-between;margin-top:3px;font-size:10px;color:var(--text-muted);">
                    <span>${pct}% full</span>
                    <span style="color:${barColor};font-weight:600;">${MAX_TROLLEYS_PER_RUN - run.trolleys} spare</span>
                </div>
            </div>

            <!-- Driver selector -->
            <div style="padding:4px 10px 6px;">
                <label style="font-size:10px;font-weight:700;color:var(--text-muted);display:block;margin-bottom:3px;">DRIVER FOR RUN ${run.run}</label>
                <select onchange="assignRunDriver(${currentVan},${currentDay},${run.run - 1},this.value)"
                    style="width:100%;padding:4px 6px;border:1px solid var(--border);border-radius:5px;font-size:12px;background:var(--surface);color:var(--text);">
                    <option value="">— Not assigned —</option>
                    ${driverOptions}
                </select>
            </div>

            <!-- Customer list (collapsible) -->
            <details ${_drSelectMode ? 'open' : ''} style="padding:0 10px 8px;">
                <summary style="font-size:11px;font-weight:600;color:var(--text-muted);cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px;">
                    <i class="fas fa-chevron-down" style="font-size:9px;"></i>
                    ${_drSelectMode ? 'Select stops' : 'Show stops'} (${run.customers.length})
                </summary>
                <div style="margin-top:6px;">${customerList}</div>
            </details>
        </div>`;
    }).join('');

    const summaryRow = `
        <div style="font-size:11px;color:var(--text-muted);text-align:center;padding:4px 0;border-top:1px solid var(--border);">
            Total: ${totalTrolleys} trolleys across ${runs.length} run${runs.length > 1 ? 's' : ''}
        </div>`;

    content.innerHTML = selectBar + runsHtml + summaryRow;

    // Keep the panel controls modal in sync if it's currently open
    const _pcModal = document.getElementById('panelControlsModal');
    if (_pcModal && _pcModal.style.display === 'flex') {
        const _mcEl = document.getElementById('modalDeliveryRunsContent');
        const _mbEl = document.getElementById('modalDeliveryRunsBadge');
        if (_mcEl) _mcEl.innerHTML = content.innerHTML;
        if (_mbEl) _mbEl.textContent = badge.textContent;
    }
}

// ── Toggle select mode ────────────────────────────────────────────────────────
function toggleDeliveryRunSelectMode() {
    _drSelectMode = !_drSelectMode;
    if (!_drSelectMode) _drSelected.clear();
    refreshDeliveryRunsPanel();
}

// ── Toggle a customer in/out of the bulk selection ───────────────────────────
function toggleRunCustomerSelection(customerId) {
    if (_drSelected.has(customerId)) {
        _drSelected.delete(customerId);
    } else {
        _drSelected.add(customerId);
    }
    refreshDeliveryRunsPanel();
}

// ── Open the move modal ──────────────────────────────────────────────────────
function openRunMoveModal() {
    if (_drSelected.size === 0) return;

    const selectedArr  = [..._drSelected];
    const selectedCust = selectedArr.map(id => customers.find(c => c.id === id)).filter(Boolean);
    const totalT       = selectedCust.reduce((s, c) => s + getTotalTrolleyCount(c), 0);

    window._runMoveSrcVan       = currentVan;
    window._runMoveSrcDay       = currentDay;
    window._runMoveTargetVan    = currentVan;
    window._runMoveTargetDay    = currentDay;
    window._runMoveTargetRunIdx = null;

    document.getElementById('runMoveModalTitle').textContent =
        `Move ${selectedArr.length} customer${selectedArr.length > 1 ? 's' : ''}`;

    document.getElementById('runMoveSelectionSummary').innerHTML =
        `<strong>${selectedArr.length} selected</strong> &nbsp;·&nbsp; <strong>${totalT} 🛒 trolleys</strong><br>
         <span style="opacity:0.75;font-size:11px;">${selectedCust.map(c => c.name).join(', ')}</span>`;

    // Van selector
    const vanSel = document.getElementById('runMoveVanSelect');
    vanSel.innerHTML = VANS.map(v =>
        `<option value="${v.id}" ${v.id === currentVan ? 'selected' : ''}>${v.name}</option>`
    ).join('');

    // Day selector
    const daySel = document.getElementById('runMoveDaySelect');
    daySel.innerHTML = DAYS.map(d =>
        `<option value="${d.id}" ${d.id === currentDay ? 'selected' : ''}>${d.name}</option>`
    ).join('');

    _renderRunMoveRunList(currentVan, currentDay);
    document.getElementById('runMoveModal').classList.add('active');
}

// ── Close modal ───────────────────────────────────────────────────────────────
function closeRunMoveModal() {
    document.getElementById('runMoveModal').classList.remove('active');
    window._runMoveTargetRunIdx = null;
}

// ── Handlers for van / day change inside modal ───────────────────────────────
function onRunMoveVanChange() {
    window._runMoveTargetVan    = parseInt(document.getElementById('runMoveVanSelect').value);
    window._runMoveTargetRunIdx = null;
    _renderRunMoveRunList(window._runMoveTargetVan, window._runMoveTargetDay);
}

function onRunMoveDayChange() {
    window._runMoveTargetDay    = parseInt(document.getElementById('runMoveDaySelect').value);
    window._runMoveTargetRunIdx = null;
    _renderRunMoveRunList(window._runMoveTargetVan, window._runMoveTargetDay);
}

// ── Render available runs in the modal with capacity preview ─────────────────
function _renderRunMoveRunList(tgtVan, tgtDay) {
    const listEl    = document.getElementById('runMoveRunList');
    const warnEl    = document.getElementById('runMoveWarning');
    const warnText  = document.getElementById('runMoveWarningText');
    const confirmEl = document.getElementById('runMoveConfirmBtn');

    const selectedArr  = [..._drSelected];
    const selectedCust = selectedArr.map(id => customers.find(c => c.id === id)).filter(Boolean);
    const selTrolleys  = selectedCust.reduce((s, c) => s + getTotalTrolleyCount(c), 0);

    // When computing existing runs for same slot, exclude the selected customers
    // so the capacity preview reflects what's left after removing them.
    const isSameSlot  = tgtVan === window._runMoveSrcVan && tgtDay === window._runMoveSrcDay;
    const rawIds      = (deliveryPlan[tgtVan]?.[tgtDay] || [])
                            .filter(id => !isSameSlot || !_drSelected.has(id));
    const existingRuns = _computeRunsFromIds(rawIds);

    const tgtVanObj = VANS.find(v => v.id === tgtVan);
    const vanColor  = tgtVanObj ? tgtVanObj.color : '#6b7280';

    let html = '';

    // ── Existing run cards ────────────────────────────────────────────────
    existingRuns.forEach((run, idx) => {
        const spare      = MAX_TROLLEYS_PER_RUN - run.trolleys;
        const fits       = selTrolleys <= spare;
        const pctNow     = Math.round((run.trolleys / MAX_TROLLEYS_PER_RUN) * 100);
        const pctAfter   = Math.min(100, Math.round(((run.trolleys + selTrolleys) / MAX_TROLLEYS_PER_RUN) * 100));
        const isSelected = window._runMoveTargetRunIdx === idx;

        const borderCol = isSelected ? '#7c3aed' : (fits ? '#d1d5db' : '#fca5a5');
        const bgCol     = isSelected ? '#f5f3ff' : (fits ? 'var(--surface)' : '#fff5f5');

        html += `
        <div onclick="${fits ? `selectRunMoveTarget(${idx})` : ''}"
            style="border:2px solid ${borderCol};border-radius:7px;padding:9px 12px;
                   background:${bgCol};cursor:${fits ? 'pointer' : 'not-allowed'};
                   opacity:${fits ? '1' : '0.55'};transition:border-color 0.15s,background 0.15s;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
                <span style="font-weight:700;font-size:12px;color:${vanColor};">Run ${idx + 1}</span>
                <span style="font-size:11px;font-weight:600;color:${fits ? '#16a34a' : '#dc2626'};">
                    ${fits
                        ? `<i class="fas fa-check-circle"></i> ${spare - selTrolleys} spare after move`
                        : `<i class="fas fa-times-circle"></i> Needs ${selTrolleys - spare} more space`}
                </span>
            </div>
            <!-- Stacked capacity bars: current (van colour) + added (purple) -->
            <div style="background:#e5e7eb;border-radius:20px;height:8px;overflow:hidden;position:relative;">
                <div style="position:absolute;left:0;top:0;height:100%;border-radius:20px;
                            background:${vanColor};width:${pctNow}%;"></div>
                ${fits ? `<div style="position:absolute;left:${pctNow}%;top:0;height:100%;border-radius:0 20px 20px 0;
                            background:#7c3aed;width:${pctAfter - pctNow}%;"></div>` : ''}
            </div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:3px;display:flex;justify-content:space-between;">
                <span>${run.trolleys}/${MAX_TROLLEYS_PER_RUN} now</span>
                ${fits ? `<span style="color:#7c3aed;font-weight:600;">${run.trolleys + selTrolleys}/${MAX_TROLLEYS_PER_RUN} after 🛒</span>` : ''}
            </div>
            ${isSelected ? `<div style="font-size:10px;color:#7c3aed;font-weight:700;margin-top:4px;"><i class="fas fa-check"></i> Selected</div>` : ''}
        </div>`;
    });

    // ── "New run" option — always shown ──────────────────────────────────
    const newRunSel = window._runMoveTargetRunIdx === -1;
    html += `
    <div onclick="selectRunMoveTarget(-1)"
        style="border:2px solid ${newRunSel ? '#7c3aed' : '#d1d5db'};border-radius:7px;padding:9px 12px;
               background:${newRunSel ? '#f5f3ff' : 'var(--surface)'};cursor:pointer;transition:border-color 0.15s,background 0.15s;">
        <div style="display:flex;align-items:center;gap:8px;">
            <i class="fas fa-plus-circle" style="color:#7c3aed;font-size:14px;"></i>
            <span style="font-weight:700;font-size:12px;color:var(--text);">New run (append at end)</span>
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:3px;">
            ${selTrolleys}/${MAX_TROLLEYS_PER_RUN} 🛒
            ${selTrolleys > MAX_TROLLEYS_PER_RUN ? ' · Will auto-split into multiple runs' : ''}
        </div>
        ${newRunSel ? `<div style="font-size:10px;color:#7c3aed;font-weight:700;margin-top:4px;"><i class="fas fa-check"></i> Selected</div>` : ''}
    </div>`;

    listEl.innerHTML = html;

    // Warn if the selection itself spans more than one run
    if (selTrolleys > MAX_TROLLEYS_PER_RUN) {
        warnEl.style.display = 'block';
        warnText.textContent =
            `Selected customers total ${selTrolleys} trolleys — they'll be automatically split across multiple runs.`;
    } else {
        warnEl.style.display = 'none';
    }

    // Enable/disable confirm button
    const ready = window._runMoveTargetRunIdx !== null;
    confirmEl.disabled      = !ready;
    confirmEl.style.opacity = ready ? '1' : '0.4';
    confirmEl.style.cursor  = ready ? 'pointer' : 'not-allowed';
}

// ── User clicks a run card in the modal ──────────────────────────────────────
function selectRunMoveTarget(runIdx) {
    window._runMoveTargetRunIdx = runIdx;
    _renderRunMoveRunList(window._runMoveTargetVan, window._runMoveTargetDay);
}

// ── Execute the move ─────────────────────────────────────────────────────────
async function confirmMoveRunCustomers() {
    if (window._runMoveTargetRunIdx === null) return;

    const selectedArr = [..._drSelected];
    const srcVan      = window._runMoveSrcVan;
    const srcDay      = window._runMoveSrcDay;
    const tgtVan      = window._runMoveTargetVan;
    const tgtDay      = window._runMoveTargetDay;
    const tgtRunIdx   = window._runMoveTargetRunIdx; // -1 = new run at end

    // ── 1. Remove selected customers from source slot ──────────────────────
    const srcPlan   = (deliveryPlan[srcVan]?.[srcDay] || []).slice();
    const remaining = srcPlan.filter(id => !_drSelected.has(id));
    deliveryPlan[srcVan][srcDay] = remaining;

    // ── 2. Update each customer's van/day assignment ───────────────────────
    selectedArr.forEach(id => {
        const c = customers.find(x => x.id === id);
        if (!c) return;
        c.assignedVan = tgtVan;
        c.assignedDay = tgtDay;
    });

    // ── 3. Insert into target slot at the correct position ─────────────────
    const isSameSlot = tgtVan === srcVan && tgtDay === srcDay;
    // For same-slot moves, work from the already-trimmed `remaining` array.
    const basePlan   = isSameSlot
        ? remaining.slice()
        : (deliveryPlan[tgtVan]?.[tgtDay] || []).slice();

    let insertAt;
    if (tgtRunIdx === -1) {
        insertAt = basePlan.length; // append → becomes a new run at end
    } else {
        // Insert after the last customer in the chosen run
        const tempRuns = _computeRunsFromIds(basePlan);
        insertAt = 0;
        for (let i = 0; i <= tgtRunIdx && i < tempRuns.length; i++) {
            insertAt += tempRuns[i].customers.length;
        }
    }

    const newPlan = [
        ...basePlan.slice(0, insertAt),
        ...selectedArr,
        ...basePlan.slice(insertAt)
    ];

    if (!deliveryPlan[tgtVan])        deliveryPlan[tgtVan]        = {};
    if (!deliveryPlan[tgtVan][tgtDay]) deliveryPlan[tgtVan][tgtDay] = [];
    deliveryPlan[tgtVan][tgtDay] = newPlan;

    // ── 4. Invalidate route caches for affected slots ──────────────────────
    invalidateRouteCache(srcVan, srcDay);
    if (tgtVan !== srcVan || tgtDay !== srcDay) {
        invalidateRouteCache(tgtVan, tgtDay);
    }

    // ── 5. Reset selection state and close modal ───────────────────────────
    _drSelectMode = false;
    _drSelected.clear();
    closeRunMoveModal();

    // ── 6. Persist all changes ─────────────────────────────────────────────
    saveData();

    // ── 7. Refresh map: markers (colour by van) + route for current view ───
    updateMapMarkers();
    updateAllDisplays();
    await showVanDayRoute(currentVan, currentDay);
    // Caches for other affected slots are already invalidated above —
    // they will recalculate when the user navigates to them.

    // ── 8. Notification ────────────────────────────────────────────────────
    const n          = selectedArr.length;
    const sameLoc    = tgtVan === srcVan && tgtDay === srcDay;
    const tgtVanObj  = VANS.find(v => v.id === tgtVan);
    const tgtDayObj  = DAYS.find(d => d.id === tgtDay);
    showNotification(
        sameLoc
            ? `${n} customer${n > 1 ? 's' : ''} moved to Run ${tgtRunIdx === -1 ? '(new)' : tgtRunIdx + 1}`
            : `${n} customer${n > 1 ? 's' : ''} moved to ${tgtVanObj?.name} · ${tgtDayObj?.name}`,
        'success'
    );
}

// ── Assign a driver to a specific run ────────────────────────────────────────
function assignRunDriver(vanId, dayId, runIndex, staffIdStr) {
    const key = `${vanId}-${dayId}`;
    if (!window.deliveryRunDrivers[key]) window.deliveryRunDrivers[key] = [];
    const staffId = staffIdStr ? parseInt(staffIdStr) : null;
    window.deliveryRunDrivers[key][runIndex] = staffId;

    // Propagate driver to every individual order in this run
    const runs = computeDeliveryRuns(vanId, dayId);
    const run = runs[runIndex];
    if (run) {
        run.customers.forEach(c => {
            c.assignedDriver = staffId;
        });
    }

    saveData();
    refreshDeliveryRunsPanel();
    const driver = staffId ? staffMembers.find(s => s.id === staffId) : null;
    if (driver) showNotification(`Run ${runIndex + 1}: ${driver.name} assigned`, 'success');
}

// ── Toggle panel visibility ───────────────────────────────────────────────────
function toggleDeliveryRunsPanel() {
    const el = document.getElementById('deliveryRunsContent');
    if (!el) return;
    el.style.display = el.style.display === 'none' ? '' : 'none';
}

// ── Invalidate driver assignments when route changes ──────────────────────────
function invalidateRunDrivers(vanId, dayId) {
    const key = `${vanId}-${dayId}`;
    delete window.deliveryRunDrivers[key];
}

// ── Panel Controls Modal ──────────────────────────────────────────────────────
function applyPanelControlsBtnSetting(enabled) {
    const wrapper = document.getElementById('panelControlsBtnWrapper');
    if (wrapper) wrapper.style.display = enabled ? 'block' : 'none';
}

function openPanelControlsModal() {
    const etaSrc    = document.getElementById('etaPanel');
    const runsSrc   = document.getElementById('deliveryRunsContent');
    const badge     = document.getElementById('deliveryRunsBadge');
    const modalEta  = document.getElementById('modalEtaPanel');
    const modalRuns = document.getElementById('modalDeliveryRunsContent');
    const modalBadge = document.getElementById('modalDeliveryRunsBadge');

    const emptyEta  = '<p style="color:var(--text-muted);font-size:13px;padding:8px 4px;">No ETA data — select a van and day first.</p>';
    const emptyRuns = '<p style="color:var(--text-muted);font-size:13px;padding:8px 4px;">No delivery runs yet.</p>';

    if (modalEta)   modalEta.innerHTML   = (etaSrc  && etaSrc.innerHTML.trim())  ? etaSrc.innerHTML  : emptyEta;
    if (modalRuns)  modalRuns.innerHTML  = (runsSrc && runsSrc.innerHTML.trim()) ? runsSrc.innerHTML : emptyRuns;
    if (badge && modalBadge) modalBadge.textContent = badge.textContent;

    const modal = document.getElementById('panelControlsModal');
    if (modal) modal.style.display = 'flex';
}

function closePanelControlsModal() {
    const modal = document.getElementById('panelControlsModal');
    if (modal) modal.style.display = 'none';
}
