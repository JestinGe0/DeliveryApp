// ===== DIAGRAM VIEW =====
// Three view modes:
//   'arrows'   — top-down hierarchy with zone ellipses and arrows (default)
//   'boxes'    — nested containment boxes (van > zone > customers), no inner arrows
//   'pipeline' — left-to-right pipeline: Driver → Van → Zone → Customer
//
// Bidirectional interactions (all three views):
//   • Click customer node         → status popup → changes order status everywhere
//   • Drag customer → zone target → reassigns customer's zone (and van if different)
//   • Drag driver   → van         → assigns driver to that van/run

let cy = null;
let _diagramDayId   = null;
let _diagramVanId   = null;        // null = all vans
let _diagramViewMode = 'arrows';   // 'arrows' | 'boxes' | 'pipeline' | 'mindmap'

// ── Colour helpers ────────────────────────────────────────────────────────────

const DIAGRAM_STATUS_COLORS = {
    pending:             '#fca5a5',
    picking:             '#fde68a',
    ready_for_delivery:  '#fdba74',
    delivering:          '#86efac',
    delivered:           '#d1d5db',
    collected:           '#c4b5fd',
    cancelled:           '#fda4af'
};

const DIAGRAM_STATUS_LABELS = {
    pending:             'Pending',
    picking:             'Picking',
    ready_for_delivery:  'Ready',
    delivering:          'Delivering',
    delivered:           'Delivered',
    collected:           'Collected',
    cancelled:           'Cancelled'
};

const _ZONE_PALETTE = [
    '#6b7280','#0ea5e9','#f59e0b','#10b981','#8b5cf6',
    '#ec4899','#14b8a6','#f97316','#84cc16','#ef4444'
];

function _zoneColor(name) {
    if (typeof ZONES !== 'undefined' && ZONES[name] && ZONES[name].color) return ZONES[name].color;
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffff;
    return _ZONE_PALETTE[Math.abs(h) % _ZONE_PALETTE.length];
}

function _safeId(str) { return String(str).replace(/[^a-zA-Z0-9]/g, '_'); }

// ── Cytoscape stylesheet (covers all view types) ──────────────────────────────

const DIAGRAM_STYLES = [
    // ── shared ──
    { selector: 'node[type = "driver"]', style: {
        'background-color': '#ffffff', 'label': 'data(label)', 'shape': 'ellipse',
        'width': 124, 'height': 52, 'color': '#374151', 'font-size': 12,
        'text-valign': 'center', 'text-halign': 'center',
        'border-width': 2, 'border-color': '#374151', 'z-index': 20
    }},
    { selector: 'node[type = "picker"]', style: {
        'background-color': '#ede9fe', 'label': 'data(label)', 'shape': 'ellipse',
        'width': 110, 'height': 46, 'color': '#4c1d95', 'font-size': 11,
        'text-valign': 'center', 'text-halign': 'center',
        'border-width': 1.5, 'border-color': '#7c3aed', 'z-index': 20
    }},
    { selector: 'node[type = "customer"]', style: {
        'background-color': 'data(statusColor)', 'label': 'data(label)',
        'shape': 'roundrectangle', 'width': 150, 'height': 46,
        'color': '#1f2937', 'font-size': 11,
        'text-valign': 'center', 'text-halign': 'center',
        'border-width': 1.5, 'border-color': '#9ca3af',
        'text-wrap': 'ellipsis', 'text-max-width': '138px', 'z-index': 10
    }},

    // ── arrows view ──
    { selector: 'node[type = "van"]', style: {
        'background-color': 'data(color)', 'label': 'data(label)',
        'shape': 'roundrectangle', 'width': 140, 'height': 54,
        'color': '#fff', 'font-size': 14, 'font-weight': 'bold',
        'text-valign': 'center', 'text-halign': 'center',
        'border-width': 2, 'border-color': 'data(borderColor)', 'z-index': 15
    }},
    { selector: 'node[type = "zone"]', style: {
        'background-color': 'data(color)', 'background-opacity': 0.18,
        'label': 'data(label)', 'shape': 'ellipse', 'width': 164, 'height': 66,
        'color': '#1f2937', 'font-size': 13, 'font-weight': 'bold',
        'text-valign': 'center', 'text-halign': 'center',
        'border-width': 2.5, 'border-color': 'data(color)', 'z-index': 8
    }},

    // ── boxes view ──
    { selector: 'node[type = "van-bg"]', style: {
        'background-color': 'data(color)', 'background-opacity': 0.11,
        'label': 'data(label)', 'shape': 'roundrectangle',
        'width': 'data(boxWidth)', 'height': 'data(boxHeight)',
        'color': 'data(color)', 'font-size': 15, 'font-weight': 'bold',
        'text-valign': 'top', 'text-halign': 'center', 'text-margin-y': 14,
        'border-width': 2.5, 'border-color': 'data(color)',
        'events': 'no', 'z-index': 1
    }},
    { selector: 'node[type = "zone-bg"]', style: {
        'background-color': 'data(color)', 'background-opacity': 0.10,
        'label': 'data(label)', 'shape': 'roundrectangle',
        'width': 'data(boxWidth)', 'height': 'data(boxHeight)',
        'color': 'data(color)', 'font-size': 12, 'font-weight': '600',
        'text-valign': 'top', 'text-halign': 'center', 'text-margin-y': 10,
        'border-width': 1.5, 'border-color': 'data(color)',
        'events': 'no', 'z-index': 2
    }},

    // ── edges ──
    { selector: 'node[type = "run"]', style: {
        'background-color': 'data(color)', 'background-opacity': 0.15,
        'label': 'data(label)', 'shape': 'roundrectangle',
        'width': 130, 'height': 64,
        'color': 'data(color)', 'font-size': 11, 'font-weight': 'bold',
        'text-valign': 'center', 'text-halign': 'center',
        'text-wrap': 'wrap', 'text-max-width': '120px',
        'border-width': 2, 'border-color': 'data(color)', 'z-index': 12
    }},
    { selector: 'edge[type = "driver-van"]',    style: { 'line-color': '#6b7280',     'target-arrow-color': '#6b7280',    'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'width': 2 }},
    { selector: 'edge[type = "van-zone"]',       style: { 'line-color': 'data(color)', 'target-arrow-color': 'data(color)', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'width': 2, 'opacity': 0.75 }},
    { selector: 'edge[type = "van-run"]',        style: { 'line-color': 'data(color)', 'target-arrow-color': 'data(color)', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'width': 2, 'opacity': 0.85 }},
    { selector: 'edge[type = "run-zone"]',       style: { 'line-color': 'data(color)', 'target-arrow-color': 'data(color)', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'width': 1.5, 'opacity': 0.7 }},
    { selector: 'edge[type = "zone-customer"]',  style: { 'line-color': '#d1d5db',     'target-arrow-color': '#d1d5db',    'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'width': 1, 'opacity': 0.55 }},
    { selector: 'edge[type = "picker-customer"]',style: { 'line-color': '#7c3aed',     'target-arrow-color': '#7c3aed',    'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'width': 1.5, 'line-style': 'dashed' }},

    // ── tree/mindmap view ──
    { selector: 'node[type = "root"]', style: {
        'background-color': '#1e3a5f', 'label': 'data(label)', 'shape': 'roundrectangle',
        'width': 150, 'height': 60, 'color': '#ffffff', 'font-size': 14, 'font-weight': 'bold',
        'text-valign': 'center', 'text-halign': 'center', 'text-wrap': 'wrap', 'text-max-width': '140px',
        'border-width': 0, 'z-index': 20
    }},
    { selector: 'node[type = "van-pill"]', style: {
        'background-color': 'data(color)', 'label': 'data(label)', 'shape': 'roundrectangle',
        'width': 120, 'height': 38, 'color': '#ffffff', 'font-size': 13, 'font-weight': 'bold',
        'text-valign': 'center', 'text-halign': 'center', 'border-width': 0, 'z-index': 15
    }},
    { selector: 'node[type = "zone-label"]', style: {
        'background-color': 'data(bgColor)', 'background-opacity': 1,
        'label': 'data(label)', 'shape': 'roundrectangle',
        'width': 100, 'height': 28, 'color': '#ffffff', 'font-size': 11, 'font-weight': '600',
        'text-valign': 'center', 'text-halign': 'center',
        'border-width': 0, 'z-index': 8
    }},
    { selector: 'edge[type = "root-van"]',    style: { 'line-color': 'data(color)', 'target-arrow-shape': 'none', 'curve-style': 'taxi', 'width': 2.5 }},
    { selector: 'edge[type = "van-zone-mm"]', style: { 'line-color': 'data(color)', 'target-arrow-shape': 'none', 'curve-style': 'taxi', 'width': 1.8 }},
    { selector: 'edge[type = "zone-cust-mm"]',style: { 'line-color': 'data(color)', 'target-arrow-shape': 'none', 'curve-style': 'taxi', 'width': 1.5 }},

    // ── interaction states ──
    { selector: 'node:selected',   style: { 'border-width': 3, 'border-color': '#0ea5e9' }},
    { selector: 'node.drag-over',  style: { 'border-width': 3.5, 'border-color': '#16a34a', 'border-style': 'dashed' }}
];

// ════════════════════════════════════════════════════════════════════════════
// BUILD FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

// ── Shared: van filter ────────────────────────────────────────────────────────

function _activeVans(dayId) {
    return VANS.filter(v =>
        deliveryPlan[v.id]?.[dayId]?.length > 0 &&
        (_diagramVanId === null || v.id === _diagramVanId)
    );
}

// ── Shared: zone-group customer data ─────────────────────────────────────────

function _groupByZone(custIds) {
    const map = new Map();
    custIds.forEach(cid => {
        const c = customers.find(x => x.id === cid);
        if (!c) return;
        const z = c.zone || 'Local';
        if (!map.has(z)) map.set(z, []);
        map.get(z).push(cid);
    });
    return map;   // Map<zoneName, cid[]>
}

// ── Shared: pickers ───────────────────────────────────────────────────────────

function _addPickerElements(elements, activeVans, dayId, pickerX, pickerY) {
    const seen = new Map();
    let px = pickerX;
    activeVans.forEach(van => {
        (deliveryPlan[van.id][dayId] || []).forEach(cid => {
            const c = customers.find(x => x.id === cid);
            if (!c?.assignedStaff?.length) return;
            c.assignedStaff.forEach(staffId => {
                const p = staffMembers.find(s => s.id === staffId);
                if (!p) return;
                const pid = `picker_${staffId}`;
                if (!seen.has(staffId)) {
                    seen.set(staffId, px);
                    elements.push({ data: { id: pid, label: p.name, type: 'picker', staffId }, position: { x: px, y: pickerY } });
                    px += 140;
                }
                elements.push({ data: { id: `edge_pc_${staffId}_${cid}`, source: pid, target: `cust_${cid}`, type: 'picker-customer' } });
            });
        });
    });
}

// ── VIEW 1: Arrows (top-down hierarchy) ──────────────────────────────────────

const _A = {
    CUST_COL_W:  170, CUST_ROW_H:  72,
    ZONE_NODE_W: 164, ZONE_PAD:    28, VAN_PAD: 90, RUN_PAD: 36,
    Y_DRIVER: 32, Y_VAN: 150, Y_RUN: 262, Y_ZONE_MULTI: 390, Y_CUST_MULTI: 510,
    Y_ZONE_SINGLE: 292, Y_CUST_SINGLE: 408
};

function _buildArrowsElements(dayId) {
    const elements   = [];
    const activeVans = _activeVans(dayId);
    if (!activeVans.length) return elements;

    // Pre-compute runs and zone groups per van
    const vanInfos = activeVans.map(van => {
        const runs = (typeof computeDeliveryRuns === 'function')
            ? computeDeliveryRuns(van.id, dayId)
            : [{ run: 1, customers: (deliveryPlan[van.id][dayId] || []).map(id => customers.find(c => c.id === id)).filter(Boolean), driverId: null }];

        const runInfos = runs.map(run => {
            const zoneMap = _groupByZone(run.customers.map(c => c.id));
            const zones   = [];
            zoneMap.forEach((ids, name) => {
                const cols = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(ids.length))));
                const span = Math.max(_A.ZONE_NODE_W, cols * _A.CUST_COL_W);
                zones.push({ name, ids, cols, span });
            });
            const totalSpan = zones.reduce((s, z) => s + z.span, 0) + _A.ZONE_PAD * Math.max(0, zones.length - 1);
            return { run, zones, totalSpan };
        });

        const multiRun  = runs.length > 1;
        const vanSpan   = Math.max(150,
            runInfos.reduce((s, ri) => s + ri.totalSpan, 0)
            + _A.RUN_PAD * Math.max(0, runs.length - 1)
        );
        return { van, runInfos, multiRun, vanSpan };
    });

    // Assign van centre X values
    let curX = 100;
    vanInfos.forEach(vi => { vi.cx = curX + vi.vanSpan / 2; curX += vi.vanSpan + _A.VAN_PAD; });

    // Are any vans multi-run? If so, use deeper Y layout for everyone
    const anyMulti = vanInfos.some(vi => vi.multiRun);
    const Y_ZONE   = anyMulti ? _A.Y_ZONE_MULTI  : _A.Y_ZONE_SINGLE;
    const Y_CUST_0 = anyMulti ? _A.Y_CUST_MULTI  : _A.Y_CUST_SINGLE;

    vanInfos.forEach(({ van, runInfos, multiRun, cx }) => {
        // Van node
        elements.push({ data: { id: `van_${van.id}`, label: van.name, type: 'van', color: van.color, borderColor: van.color, vanId: van.id }, position: { x: cx, y: _A.Y_VAN } });

        // Driver nodes (one per run, positioned above van)
        runInfos.forEach(({ run }, ri) => {
            const staffId = run.driverId;
            const driver  = staffId ? staffMembers.find(s => s.id === staffId) : null;
            if (!driver) return;
            const dId = `driver_${van.id}_${ri}`;
            if (elements.find(e => e.data.id === dId)) return;
            const dx = cx + (ri - (runInfos.length - 1) / 2) * 140;
            elements.push({ data: { id: dId, label: driver.name, type: 'driver', staffId, vanId: van.id, runIdx: ri }, position: { x: dx, y: _A.Y_DRIVER } });
            elements.push({ data: { id: `edge_dv_${van.id}_${ri}`, source: dId, target: `van_${van.id}`, type: 'driver-van' } });
        });

        // Layout runs left-to-right under the van
        const totalRunSpan = runInfos.reduce((s, ri) => s + ri.totalSpan, 0) + _A.RUN_PAD * Math.max(0, runInfos.length - 1);
        let runStartX = cx - totalRunSpan / 2;

        runInfos.forEach(({ run, zones, totalSpan }, ri) => {
            const runCX   = runStartX + totalSpan / 2;
            const runId   = `run_${van.id}_${run.run}`;

            if (multiRun) {
                elements.push({ data: { id: runId, label: _runLabel(run), type: 'run', color: van.color, vanId: van.id, runIdx: ri }, position: { x: runCX, y: _A.Y_RUN } });
                elements.push({ data: { id: `edge_vr_${van.id}_${run.run}`, source: `van_${van.id}`, target: runId, type: 'van-run', color: van.color } });
            }

            // Zones under this run (or directly under van for single-run)
            let zoneStartX = runStartX;
            zones.forEach(({ name: zName, ids, cols, span }) => {
                const zcx    = zoneStartX + span / 2;
                // Include run index in zone ID to avoid clashes when same zone appears in multiple runs
                const zId    = multiRun ? `zone_${van.id}_r${run.run}_${_safeId(zName)}` : `zone_${van.id}_${_safeId(zName)}`;
                const zColor = _zoneColor(zName);
                const srcId  = multiRun ? runId : `van_${van.id}`;
                const eType  = multiRun ? 'run-zone' : 'van-zone';

                elements.push({ data: { id: zId, label: zName, type: 'zone', color: zColor, vanId: van.id, zoneName: zName }, position: { x: zcx, y: Y_ZONE } });
                elements.push({ data: { id: `edge_sz_${van.id}_${run.run}_${_safeId(zName)}`, source: srcId, target: zId, type: eType, color: van.color } });

                ids.forEach((cid, ci) => {
                    const c = customers.find(x => x.id === cid);
                    if (!c) return;
                    const col = ci % cols, row = Math.floor(ci / cols);
                    elements.push({
                        data: { id: `cust_${cid}`, label: c.name, type: 'customer',
                                statusColor: DIAGRAM_STATUS_COLORS[c.status] || '#e5e7eb',
                                status: c.status, customerId: cid, vanId: van.id, zoneName: zName, zoneNodeId: zId },
                        position: { x: zcx + (col - (cols - 1) / 2) * _A.CUST_COL_W, y: Y_CUST_0 + row * _A.CUST_ROW_H }
                    });
                    elements.push({ data: { id: `edge_zc_${van.id}_${_safeId(zName)}_${cid}`, source: zId, target: `cust_${cid}`, type: 'zone-customer', color: zColor } });
                });

                zoneStartX += span + _A.ZONE_PAD;
            });

            runStartX += totalSpan + _A.RUN_PAD;
        });
    });

    const maxY = Math.max(...elements.filter(e => e.data.type === 'customer' && e.position).map(e => e.position.y), Y_CUST_0);
    _addPickerElements(elements, activeVans, dayId, 100, maxY + 110);
    return elements;
}

// ── VIEW 2: Boxes (nested containment) ───────────────────────────────────────

const _B = {
    ZONE_PAD_X: 20, ZONE_PAD_Y_TOP: 34, ZONE_PAD_Y_BOT: 16,
    VAN_PAD_X:  30, VAN_PAD_Y_TOP:  48, VAN_PAD_Y_BOT:  22,
    CUST_W: 150, CUST_H: 46, CUST_HGAP: 12, CUST_VGAP: 10,
    ZONE_GAP: 18, VAN_GAP: 56,
    VAN_Y_TOP: 110, DRIVER_Y: 34
};

function _buildBoxesElements(dayId) {
    const elements  = [];
    const activeVans = _activeVans(dayId);
    if (!activeVans.length) return elements;

    let vanLeftX = 60;

    activeVans.forEach(van => {
        const zoneMap = _groupByZone(deliveryPlan[van.id][dayId]);

        // Compute zone sizes
        const zones = [];
        zoneMap.forEach((ids, name) => {
            const cols      = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(ids.length))));
            const rows      = Math.ceil(ids.length / cols);
            const contentW  = cols * _B.CUST_W + (cols - 1) * _B.CUST_HGAP;
            const contentH  = rows * _B.CUST_H + (rows - 1) * _B.CUST_VGAP;
            zones.push({ name, ids, cols, rows, contentW, contentH,
                boxW: _B.ZONE_PAD_X * 2 + contentW,
                boxH: _B.ZONE_PAD_Y_TOP + contentH + _B.ZONE_PAD_Y_BOT });
        });

        const maxZoneH   = Math.max(...zones.map(z => z.boxH));
        const totalZoneW = zones.reduce((s, z) => s + z.boxW, 0) + _B.ZONE_GAP * (zones.length - 1);
        const vanBoxW    = _B.VAN_PAD_X * 2 + totalZoneW;
        const vanBoxH    = _B.VAN_PAD_Y_TOP + maxZoneH + _B.VAN_PAD_Y_BOT;
        const vanCX      = vanLeftX + vanBoxW / 2;
        const vanCY      = _B.VAN_Y_TOP + vanBoxH / 2;

        // Van background box (large, events disabled)
        const vanBgId = `van_${van.id}`;
        elements.push({ data: { id: vanBgId, label: van.name, type: 'van-bg', color: van.color, boxWidth: vanBoxW, boxHeight: vanBoxH, vanId: van.id }, position: { x: vanCX, y: vanCY } });

        // Driver nodes above the van box
        _runDrivers(van.id, dayId).forEach((staffId, ri) => {
            const driver = staffMembers.find(s => s.id === staffId);
            if (!driver || elements.find(e => e.data.id === `driver_${van.id}_${ri}`)) return;
            const dx = vanCX + (ri - (_runDrivers(van.id, dayId).length - 1) / 2) * 140;
            elements.push({ data: { id: `driver_${van.id}_${ri}`, label: driver.name, type: 'driver', staffId, vanId: van.id, runIdx: ri }, position: { x: dx, y: _B.DRIVER_Y } });
            elements.push({ data: { id: `edge_dv_${van.id}_${ri}`, source: `driver_${van.id}_${ri}`, target: vanBgId, type: 'driver-van' } });
        });

        // Zone boxes and customers
        let zoneLeftX    = vanLeftX + _B.VAN_PAD_X;
        const zoneTop    = _B.VAN_Y_TOP + _B.VAN_PAD_Y_TOP;

        zones.forEach(zone => {
            const zId    = `zone_${van.id}_${_safeId(zone.name)}`;
            const zColor = _zoneColor(zone.name);
            const zoneCX = zoneLeftX + zone.boxW / 2;
            const zoneCY = zoneTop   + zone.boxH / 2;

            // Zone background box (events disabled)
            elements.push({ data: { id: zId, label: zone.name, type: 'zone-bg', color: zColor, boxWidth: zone.boxW, boxHeight: zone.boxH, vanId: van.id, zoneName: zone.name }, position: { x: zoneCX, y: zoneCY } });

            // Customer nodes inside zone box
            zone.ids.forEach((cid, ci) => {
                const c   = customers.find(x => x.id === cid);
                if (!c) return;
                const col = ci % zone.cols, row = Math.floor(ci / zone.cols);
                elements.push({
                    data: { id: `cust_${cid}`, label: c.name, type: 'customer',
                            statusColor: DIAGRAM_STATUS_COLORS[c.status] || '#e5e7eb',
                            status: c.status, customerId: cid, vanId: van.id, zoneName: zone.name, zoneNodeId: zId },
                    position: {
                        x: zoneLeftX + _B.ZONE_PAD_X + col * (_B.CUST_W + _B.CUST_HGAP) + _B.CUST_W / 2,
                        y: zoneTop  + _B.ZONE_PAD_Y_TOP + row * (_B.CUST_H + _B.CUST_VGAP) + _B.CUST_H / 2
                    }
                });
            });

            zoneLeftX += zone.boxW + _B.ZONE_GAP;
        });

        vanLeftX += vanBoxW + _B.VAN_GAP;
    });

    // Pickers below all van boxes
    const vanNodes  = elements.filter(e => e.data.type === 'van-bg' && e.position);
    const maxBottom = vanNodes.length
        ? Math.max(...vanNodes.map(e => e.position.y + e.data.boxHeight / 2))
        : 400;
    _addPickerElements(elements, activeVans, dayId, 60, maxBottom + 80);
    return elements;
}

// ── VIEW 3: Pipeline (left-to-right) ─────────────────────────────────────────

const _P = {
    X_DRIVER: 80, X_VAN: 260, X_RUN: 420, X_ZONE: 590, X_ZONE_SINGLE: 470, X_CUSTOMER_MULTI: 790, X_CUSTOMER: 680, X_PICKER: 980,
    CUST_H: 46, CUST_GAP: 16, ZONE_GAP: 30, RUN_GAP: 40, VAN_GAP: 50
};

function _buildPipelineElements(dayId) {
    const elements   = [];
    const activeVans = _activeVans(dayId);
    if (!activeVans.length) return elements;

    let currentY      = 50;
    const pickersSeen = new Map();
    const STEP        = _P.CUST_H + _P.CUST_GAP;

    activeVans.forEach(van => {
        const runs = (typeof computeDeliveryRuns === 'function')
            ? computeDeliveryRuns(van.id, dayId)
            : [{ run: 1, customers: (deliveryPlan[van.id][dayId] || []).map(id => customers.find(c => c.id === id)).filter(Boolean), driverId: null }];

        const multiRun   = runs.length > 1;
        const X_ZONE     = multiRun ? _P.X_ZONE         : _P.X_ZONE_SINGLE;
        const X_CUSTOMER = multiRun ? _P.X_CUSTOMER_MULTI : _P.X_CUSTOMER;
        const X_PICKER   = _P.X_PICKER;

        const vanStartY = currentY;
        const runData   = [];

        runs.forEach(run => {
            const runStartY = currentY;
            const zoneData  = [];

            const zoneMap = _groupByZone(run.customers.map(c => c.id));
            zoneMap.forEach((ids, name) => {
                const zId        = multiRun ? `zone_${van.id}_r${run.run}_${_safeId(name)}` : `zone_${van.id}_${_safeId(name)}`;
                const zColor     = _zoneColor(name);
                const zoneStartY = currentY;

                ids.forEach(cid => {
                    const c = customers.find(x => x.id === cid);
                    if (!c) return;
                    elements.push({
                        data: { id: `cust_${cid}`, label: c.name, type: 'customer',
                                statusColor: DIAGRAM_STATUS_COLORS[c.status] || '#e5e7eb',
                                status: c.status, customerId: cid, vanId: van.id, zoneName: name, zoneNodeId: zId },
                        position: { x: X_CUSTOMER, y: currentY }
                    });
                    currentY += STEP;
                });

                const zoneMidY = (zoneStartY + currentY - _P.CUST_GAP) / 2;
                elements.push({ data: { id: zId, label: name, type: 'zone', color: zColor, vanId: van.id, zoneName: name }, position: { x: X_ZONE, y: zoneMidY } });
                ids.forEach(cid => elements.push({ data: { id: `edge_zc_${van.id}_r${run.run}_${_safeId(name)}_${cid}`, source: zId, target: `cust_${cid}`, type: 'zone-customer', color: zColor } }));
                zoneData.push({ name, zoneMidY, zId });
                currentY += _P.ZONE_GAP;
            });

            const runMidY = (runStartY + currentY - _P.ZONE_GAP) / 2;

            if (multiRun) {
                const runId = `run_${van.id}_${run.run}`;
                elements.push({ data: { id: runId, label: _runLabel(run), type: 'run', color: van.color, vanId: van.id, runIdx: run.run - 1 }, position: { x: _P.X_RUN, y: runMidY } });
                zoneData.forEach(zd => elements.push({ data: { id: `edge_rz_${van.id}_${run.run}_${_safeId(zd.name)}`, source: runId, target: zd.zId, type: 'run-zone', color: van.color } }));
                runData.push({ runMidY, runId, driverId: run.driverId, runIdx: run.run - 1 });
            } else {
                zoneData.forEach(zd => elements.push({ data: { id: `edge_vz_${van.id}_${_safeId(zd.name)}`, source: `van_${van.id}`, target: zd.zId, type: 'van-zone', color: van.color } }));
            }

            currentY += _P.RUN_GAP;
        });

        const vanMidY = (vanStartY + currentY - _P.RUN_GAP) / 2;
        elements.push({ data: { id: `van_${van.id}`, label: van.name, type: 'van', color: van.color, borderColor: van.color, vanId: van.id }, position: { x: _P.X_VAN, y: vanMidY } });

        if (multiRun) {
            runData.forEach(rd => {
                elements.push({ data: { id: `edge_vr_${van.id}_${rd.runIdx}`, source: `van_${van.id}`, target: rd.runId, type: 'van-run', color: van.color } });
                const driver = rd.driverId ? staffMembers.find(s => s.id === rd.driverId) : null;
                if (driver) {
                    const dId = `driver_${van.id}_${rd.runIdx}`;
                    elements.push({ data: { id: dId, label: driver.name, type: 'driver', staffId: rd.driverId, vanId: van.id, runIdx: rd.runIdx }, position: { x: _P.X_DRIVER, y: rd.runMidY } });
                    elements.push({ data: { id: `edge_dv_${van.id}_${rd.runIdx}`, source: dId, target: `van_${van.id}`, type: 'driver-van' } });
                }
            });
        } else {
            _runDrivers(van.id, dayId).forEach((staffId, ri) => {
                const driver = staffMembers.find(s => s.id === staffId);
                if (!driver || elements.find(e => e.data.id === `driver_${van.id}_${ri}`)) return;
                const dy = vanMidY + (ri - (_runDrivers(van.id, dayId).length - 1) / 2) * 64;
                elements.push({ data: { id: `driver_${van.id}_${ri}`, label: driver.name, type: 'driver', staffId, vanId: van.id, runIdx: ri }, position: { x: _P.X_DRIVER, y: dy } });
                elements.push({ data: { id: `edge_dv_${van.id}_${ri}`, source: `driver_${van.id}_${ri}`, target: `van_${van.id}`, type: 'driver-van' } });
            });
        }

        currentY += _P.VAN_GAP;
    });

    // Pickers on right side aligned to their first assigned customer
    activeVans.forEach(van => {
        (deliveryPlan[van.id][dayId] || []).forEach(cid => {
            const c = customers.find(x => x.id === cid);
            if (!c?.assignedStaff?.length) return;
            c.assignedStaff.forEach(staffId => {
                const p = staffMembers.find(s => s.id === staffId);
                if (!p) return;
                const pid = `picker_${staffId}`;
                if (!pickersSeen.has(staffId)) {
                    const custEl = elements.find(e => e.data.id === `cust_${cid}`);
                    pickersSeen.set(staffId, custEl ? custEl.position.y : 50);
                    elements.push({ data: { id: pid, label: p.name, type: 'picker', staffId }, position: { x: _P.X_PICKER, y: pickersSeen.get(staffId) } });
                }
                elements.push({ data: { id: `edge_pc_${staffId}_${cid}`, source: pid, target: `cust_${cid}`, type: 'picker-customer' } });
            });
        });
    });

    return elements;
}

// ── Helper: get filtered run-driver ids ──────────────────────────────────────

function _runDrivers(vanId, dayId) {
    return ((window.deliveryRunDrivers || {})[`${vanId}-${dayId}`] || []).filter(Boolean);
}

// Returns multi-line run label: driver name, run number, bay(s)
function _runLabel(run) {
    const driver = run.driverId ? staffMembers.find(s => s.id === run.driverId) : null;
    let driverName = driver ? driver.name : null;
    // Fallback: check per-customer assignedDriver for run 1
    if (!driverName && run.run === 1) {
        for (const c of (run.customers || [])) {
            if (c && c.assignedDriver) {
                const d = staffMembers.find(s => s.id === c.assignedDriver);
                if (d) { driverName = d.name; break; }
            }
        }
    }

    // Bay info
    let bayPart = '';
    if (BAY_FEATURE_ENABLED) {
        if (BAY_ASSIGNMENT_MODE === 'order') {
            const bays = [];
            (run.customers || []).forEach(function(c) { if (c && c.bayNumber && bays.indexOf(c.bayNumber) === -1) bays.push(c.bayNumber); });
            bays.sort(function(a, b) { return parseInt(a) - parseInt(b); });
            if (bays.length) bayPart = 'Bay ' + bays.join(' & ');
        } else {
            const vanBay = run.customers && run.customers[0] ? getBayForVan(run.customers[0].assignedVan) : null;
            if (vanBay) bayPart = 'Bay ' + vanBay;
        }
    }

    const parts = [];
    if (driverName) parts.push(driverName);
    parts.push('Run ' + run.run);
    if (bayPart) parts.push(bayPart);
    return parts.join('\n');
}

// ── VIEW 4: Tree (org-chart, taxi connectors) ────────────────────────────────

const _T = {
    X_ROOT: 100, X_VAN: 320, X_RUN: 480, X_ZONE: 640, X_ZONE_SINGLE: 510, X_CUST: 830, X_CUST_SINGLE: 700,
    CUST_H: 46, CUST_GAP: 10, ZONE_GAP: 28, RUN_GAP: 36, VAN_GAP: 52
};

function _buildMindmapElements(dayId) {
    const elements   = [];
    const activeVans = _activeVans(dayId);
    if (!activeVans.length) return elements;

    // First pass: compute heights
    const vanInfos = activeVans.map(van => {
        const runs = (typeof computeDeliveryRuns === 'function')
            ? computeDeliveryRuns(van.id, dayId)
            : [{ run: 1, customers: (deliveryPlan[van.id][dayId] || []).map(id => customers.find(c => c.id === id)).filter(Boolean), driverId: null }];

        const multiRun = runs.length > 1;
        const runInfos = runs.map(run => {
            const zoneMap = _groupByZone(run.customers.map(c => c.id));
            const zones   = [];
            zoneMap.forEach((ids, name) => zones.push({ name, ids }));
            const totalCusts = zones.reduce((s, z) => s + z.ids.length, 0);
            const runH = totalCusts * (_T.CUST_H + _T.CUST_GAP) + Math.max(0, zones.length - 1) * _T.ZONE_GAP;
            return { run, zones, runH };
        });
        const vanH = runInfos.reduce((s, ri) => s + ri.runH, 0) + Math.max(0, runs.length - 1) * _T.RUN_GAP;
        return { van, runInfos, multiRun, vanH };
    });

    const totalHeight = vanInfos.reduce((s, vi) => s + vi.vanH, 0) + Math.max(0, activeVans.length - 1) * _T.VAN_GAP;
    const rootY = totalHeight / 2;

    elements.push({ data: { id: 'root', label: 'Deliveries', type: 'root' }, position: { x: _T.X_ROOT, y: rootY } });

    let currentY = 0;

    vanInfos.forEach(({ van, runInfos, multiRun, vanH }) => {
        const vanMidY   = currentY + vanH / 2;
        const vanNodeId = `van_mm_${van.id}`;
        const X_ZONE    = multiRun ? _T.X_ZONE        : _T.X_ZONE_SINGLE;
        const X_CUST    = multiRun ? _T.X_CUST        : _T.X_CUST_SINGLE;

        elements.push({ data: { id: vanNodeId, label: van.name, type: 'van-pill', color: van.color, vanId: van.id }, position: { x: _T.X_VAN, y: vanMidY } });
        elements.push({ data: { id: `edge_rv_${van.id}`, source: 'root', target: vanNodeId, type: 'root-van', color: van.color } });

        let runY = currentY;
        runInfos.forEach(({ run, zones, runH }) => {
            const runMidY = runY + runH / 2;
            const runId   = `run_mm_${van.id}_${run.run}`;

            if (multiRun) {
                elements.push({ data: { id: runId, label: _runLabel(run), type: 'run', color: van.color, vanId: van.id, runIdx: run.run - 1 }, position: { x: _T.X_RUN, y: runMidY } });
                elements.push({ data: { id: `edge_vr_mm_${van.id}_${run.run}`, source: vanNodeId, target: runId, type: 'van-zone-mm', color: van.color } });
            }

            let zoneY = runY;
            zones.forEach(({ name: zName, ids }) => {
                const zoneH   = ids.length * (_T.CUST_H + _T.CUST_GAP) - _T.CUST_GAP;
                const zoneMidY = zoneY + zoneH / 2;
                const zColor   = _zoneColor(zName);
                const zId      = multiRun ? `zone_mm_${van.id}_r${run.run}_${_safeId(zName)}` : `zone_mm_${van.id}_${_safeId(zName)}`;
                const srcId    = multiRun ? runId : vanNodeId;

                elements.push({ data: { id: zId, label: zName, type: 'zone-label', color: zColor, bgColor: zColor, vanId: van.id, zoneName: zName }, position: { x: X_ZONE, y: zoneMidY } });
                elements.push({ data: { id: `edge_vz_mm_${van.id}_r${run.run}_${_safeId(zName)}`, source: srcId, target: zId, type: 'van-zone-mm', color: van.color } });

                ids.forEach((cid, ci) => {
                    const c = customers.find(x => x.id === cid);
                    if (!c) return;
                    const cy_pos = zoneY + ci * (_T.CUST_H + _T.CUST_GAP) + _T.CUST_H / 2;
                    elements.push({
                        data: { id: `cust_${cid}`, label: c.name, type: 'customer',
                                statusColor: DIAGRAM_STATUS_COLORS[c.status] || '#e5e7eb',
                                status: c.status, customerId: cid, vanId: van.id,
                                zoneName: zName, zoneNodeId: zId },
                        position: { x: X_CUST, y: cy_pos }
                    });
                    elements.push({ data: { id: `edge_zc_mm_${van.id}_r${run.run}_${_safeId(zName)}_${cid}`, source: zId, target: `cust_${cid}`, type: 'zone-cust-mm', color: van.color } });
                });

                zoneY += zoneH + _T.ZONE_GAP;
            });

            runY += runH + _T.RUN_GAP;
        });

        currentY += vanH + _T.VAN_GAP;
    });

    return elements;
}

// ════════════════════════════════════════════════════════════════════════════
// INIT & REFRESH
// ════════════════════════════════════════════════════════════════════════════

function _buildDayButtons() {
    const container = document.getElementById('diagramDayBtns');
    if (!container || container.childElementCount > 0) return;
    (typeof DAYS !== 'undefined' ? DAYS : []).forEach(d => {
        const btn = document.createElement('button');
        btn.className = 'diagram-day-btn';
        btn.dataset.day = d.id;
        btn.textContent = d.short;
        btn.onclick = () => switchDiagramDay(d.id);
        container.appendChild(btn);
    });
}

function _buildVanButtons() {
    const container = document.getElementById('diagramVanBtns');
    if (!container) return;
    container.innerHTML = '';

    // "All" button
    const allBtn = document.createElement('button');
    allBtn.className = 'diagram-day-btn' + (_diagramVanId === null ? ' active' : '');
    allBtn.dataset.van = 'all';
    allBtn.textContent = 'All';
    allBtn.onclick = () => switchDiagramVan(null);
    container.appendChild(allBtn);

    (typeof VANS !== 'undefined' ? VANS : []).forEach(v => {
        const btn = document.createElement('button');
        btn.className = 'diagram-day-btn' + (_diagramVanId === v.id ? ' active' : '');
        btn.dataset.van = v.id;
        btn.textContent = v.name;
        btn.style.setProperty('--van-color', v.color);
        btn.onclick = () => switchDiagramVan(v.id);
        container.appendChild(btn);
    });
}

function switchDiagramVan(vanId) {
    _diagramVanId = vanId;
    closeDiagramStatusPopup();
    refreshDiagram();
}

function initDiagram() {
    if (cy) return;
    _buildDayButtons();
    _buildVanButtons();

    cy = cytoscape({
        container:           document.getElementById('cy'),
        elements:            [],
        style:               DIAGRAM_STYLES,
        layout:              { name: 'preset' },
        userZoomingEnabled:  true,
        userPanningEnabled:  true,
        boxSelectionEnabled: false
    });

    _setupDiagramInteractions();
}

function refreshDiagram() {
    const dayId = _diagramDayId !== null ? _diagramDayId : (currentDay || 1);
    _diagramDayId = dayId;

    // Sync day button highlights
    document.querySelectorAll('#diagramDayBtns .diagram-day-btn').forEach(btn =>
        btn.classList.toggle('active', parseInt(btn.dataset.day) === dayId)
    );

    // Sync van button highlights
    document.querySelectorAll('#diagramVanBtns .diagram-day-btn').forEach(btn => {
        const isAll = btn.dataset.van === 'all';
        btn.classList.toggle('active', isAll ? _diagramVanId === null : parseInt(btn.dataset.van) === _diagramVanId);
    });

    // Sync view button highlights
    document.querySelectorAll('.diagram-view-btn').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.view === _diagramViewMode)
    );

    if (!cy) initDiagram();

    // Pick the right build function
    const buildFn = _diagramViewMode === 'boxes'    ? _buildBoxesElements
                  : _diagramViewMode === 'pipeline' ? _buildPipelineElements
                  : _diagramViewMode === 'mindmap'  ? _buildMindmapElements
                  :                                   _buildArrowsElements;

    const elements = buildFn(dayId);
    cy.elements().remove();
    closeDiagramStatusPopup();

    const emptyEl = document.getElementById('diagram-empty');
    if (elements.length === 0) {
        if (emptyEl) emptyEl.style.display = 'flex';
        return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    cy.add(elements);
    cy.fit(cy.elements(), 60);
}

function switchDiagramDay(dayId) {
    _diagramDayId = parseInt(dayId);
    closeDiagramStatusPopup();
    refreshDiagram();
}

function switchDiagramView(mode) {
    _diagramViewMode = mode;
    refreshDiagram();
}

// ════════════════════════════════════════════════════════════════════════════
// INTERACTIONS
// ════════════════════════════════════════════════════════════════════════════

function _setupDiagramInteractions() {
    // Click customer → status popup
    cy.on('tap', 'node[type = "customer"]', evt => {
        evt.stopPropagation();
        showDiagramStatusPopup(evt.target);
    });

    // Click canvas → close popup
    cy.on('tap', evt => { if (evt.target === cy) closeDiagramStatusPopup(); });

    // Drag: highlight targets
    cy.on('drag', 'node', evt => {
        const node = evt.target, type = node.data('type'), pos = node.position();

        if (type === 'driver') {
            cy.nodes('[type = "van"], [type = "van-bg"]').forEach(vn =>
                vn.toggleClass('drag-over', _vanHit(vn, pos))
            );
        } else if (type === 'customer') {
            const curZone = node.data('zoneNodeId');
            if (_diagramViewMode === 'boxes') {
                cy.nodes('[type = "zone-bg"]').forEach(zn => {
                    if (zn.id() === curZone) { zn.removeClass('drag-over'); return; }
                    zn.toggleClass('drag-over', _boxContains(zn, pos));
                });
            } else if (_diagramViewMode === 'mindmap') {
                cy.nodes('[type = "zone-label"]').forEach(zn => {
                    if (zn.id() === curZone) { zn.removeClass('drag-over'); return; }
                    zn.toggleClass('drag-over', Math.hypot(zn.position().x - pos.x, zn.position().y - pos.y) < 120);
                });
            } else {
                cy.nodes('[type = "zone"]').forEach(zn => {
                    if (zn.id() === curZone) { zn.removeClass('drag-over'); return; }
                    zn.toggleClass('drag-over', Math.hypot(zn.position().x - pos.x, zn.position().y - pos.y) < 160);
                });
            }
        }
    });

    // Drop: apply
    cy.on('free', 'node', evt => {
        const node = evt.target, type = node.data('type'), pos = node.position();

        cy.nodes('[type = "van"], [type = "van-bg"]').removeClass('drag-over');
        cy.nodes('[type = "zone"], [type = "zone-bg"], [type = "zone-label"]').removeClass('drag-over');

        if (type === 'driver') {
            const target = cy.nodes('[type = "van"], [type = "van-bg"]').filter(vn => _vanHit(vn, pos));
            if (target.length) _assignDriverToVan(node.data('staffId'), target[0].data('vanId'), node.data('runIdx') || 0);

        } else if (type === 'customer') {
            let target = null;
            if (_diagramViewMode === 'boxes') {
                cy.nodes('[type = "zone-bg"]').forEach(zn => {
                    if (zn.id() === node.data('zoneNodeId')) return;
                    if (_boxContains(zn, pos)) target = zn;
                });
            } else if (_diagramViewMode === 'mindmap') {
                let best = 120;
                cy.nodes('[type = "zone-label"]').forEach(zn => {
                    if (zn.id() === node.data('zoneNodeId')) return;
                    const d = Math.hypot(zn.position().x - pos.x, zn.position().y - pos.y);
                    if (d < best) { best = d; target = zn; }
                });
            } else {
                let best = _diagramViewMode === 'pipeline' ? 220 : 160;
                cy.nodes('[type = "zone"]').forEach(zn => {
                    if (zn.id() === node.data('zoneNodeId')) return;
                    const d = Math.hypot(zn.position().x - pos.x, zn.position().y - pos.y);
                    if (d < best) { best = d; target = zn; }
                });
            }
            if (target) _reassignCustomerToZone(node.data('customerId'), target.data('zoneName'), target.data('vanId'));
        }
    });
}

// Check if pos is within a van node (works for both 'van' and 'van-bg')
function _vanHit(vanNode, pos) {
    if (vanNode.data('type') === 'van-bg') {
        return _boxContains(vanNode, pos);
    }
    const vp = vanNode.position();
    return Math.abs(vp.x - pos.x) < 100 && Math.abs(vp.y - pos.y) < 50;
}

// Check if a pos is inside the bounding box of a large background node
function _boxContains(node, pos) {
    try {
        const bb = node.boundingBox();
        return pos.x >= bb.x1 && pos.x <= bb.x2 && pos.y >= bb.y1 && pos.y <= bb.y2;
    } catch(_) { return false; }
}

// ── Data mutations ────────────────────────────────────────────────────────────

function _assignDriverToVan(staffId, vanId, runIdx) {
    if (typeof assignRunDriver !== 'function') return;
    const dayId = _diagramDayId !== null ? _diagramDayId : (currentDay || 1);
    assignRunDriver(vanId, dayId, runIdx, staffId);
    showNotification('Driver reassigned via diagram');
    refreshDiagram();
}

function _reassignCustomerToZone(customerId, newZoneName, newVanId) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;

    const oldVanId = customer.assignedVan;
    const dayId    = _diagramDayId !== null ? _diagramDayId : (currentDay || 1);

    if (customer.zone === newZoneName && oldVanId === newVanId) return;

    customer.zone = newZoneName;

    if (newVanId !== oldVanId) {
        if (oldVanId && deliveryPlan[oldVanId]?.[dayId]) {
            deliveryPlan[oldVanId][dayId] = deliveryPlan[oldVanId][dayId].filter(id => id !== customerId);
        }
        if (!deliveryPlan[newVanId])        deliveryPlan[newVanId] = {};
        if (!deliveryPlan[newVanId][dayId]) deliveryPlan[newVanId][dayId] = [];
        if (!deliveryPlan[newVanId][dayId].includes(customerId)) deliveryPlan[newVanId][dayId].push(customerId);
        customer.assignedVan = newVanId;
    }

    if (typeof updateAllDisplays === 'function')  updateAllDisplays();
    if (typeof quickSaveCustomer  === 'function')  quickSaveCustomer(customer);

    const vanName = (typeof VANS !== 'undefined' ? VANS.find(v => v.id === newVanId)?.name : null) || `Van ${newVanId}`;
    showNotification(`${customer.name} moved to ${newZoneName} (${vanName})`);
    refreshDiagram();
}

// ── Status popup ──────────────────────────────────────────────────────────────

function showDiagramStatusPopup(node) {
    const cid      = node.data('customerId');
    const customer = customers.find(c => c.id === cid);
    if (!customer) return;

    const popup  = document.getElementById('diagram-status-popup');
    document.getElementById('diagram-popup-name').textContent     = customer.name;
    const curEl  = document.getElementById('diagram-popup-current');
    curEl.textContent       = DIAGRAM_STATUS_LABELS[customer.status] || customer.status;
    curEl.style.background  = DIAGRAM_STATUS_COLORS[customer.status] || '#e5e7eb';

    document.getElementById('diagram-popup-statuses').innerHTML =
        Object.entries(DIAGRAM_STATUS_LABELS).map(([s, label]) =>
            `<button class="diagram-status-btn${s === customer.status ? ' active' : ''}"
                     style="background:${DIAGRAM_STATUS_COLORS[s]}"
                     onclick="setDiagramOrderStatus(${cid},'${s}')">${label}</button>`
        ).join('');

    const rendPos = node.renderedPosition();
    const cyRect  = document.getElementById('cy').getBoundingClientRect();
    const W = 240;
    let left = cyRect.left + rendPos.x + 16;
    let top  = cyRect.top  + rendPos.y - 60;
    if (left + W > window.innerWidth - 8) left = cyRect.left + rendPos.x - W - 16;
    if (top < 4) top = 4;

    popup.style.left    = left + 'px';
    popup.style.top     = top  + 'px';
    popup.style.display = 'block';
}

function closeDiagramStatusPopup() {
    const popup = document.getElementById('diagram-status-popup');
    if (popup) popup.style.display = 'none';
}

function setDiagramOrderStatus(customerId, newStatus) {
    if (typeof updateOrderStatus !== 'function') return;
    updateOrderStatus(customerId, newStatus);
    closeDiagramStatusPopup();
    if (cy) {
        const node = cy.$(`#cust_${customerId}`);
        if (node.length) {
            node.data('statusColor', DIAGRAM_STATUS_COLORS[newStatus] || '#e5e7eb');
            node.data('status', newStatus);
        }
    }
}

// ── Called by sync.js on remote data ─────────────────────────────────────────

function diagramSyncUpdate() {
    const screen = document.getElementById('screen-diagram');
    if (screen && screen.classList.contains('active') && cy) refreshDiagram();
}
