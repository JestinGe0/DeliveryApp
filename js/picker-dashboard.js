// ========== PICKER DASHBOARD ==========

function refreshPickerDashboard() {
    renderPickerLiveStrip();
    renderPickerDashboardGrid();
}

// ── Utility ─────────────────────────────────────────────────────────────────
function _elapsedMinutes(isoString) {
    if (!isoString) return 0;
    return Math.round((Date.now() - new Date(isoString).getTime()) / 60000);
}

function _formatDuration(minutes) {
    if (minutes < 1) return 'just now';
    if (minutes < 60) return minutes + 'min';
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return h + 'h ' + (m > 0 ? m + 'm' : '');
}

function _statusColor(status) {
    const map = {
        pending: '#9ca3af',
        picking: '#f59e0b',
        ready_for_delivery: '#3b82f6',
        delivering: '#8b5cf6',
        delivered: '#10b981',
        collected: '#10b981',
        cancelled: '#ef4444'
    };
    return map[status] || '#9ca3af';
}

function _getPickerOrders(staffId) {
    return customers.filter(c =>
        c.assignedStaff && c.assignedStaff.includes(staffId) &&
        c.assignedVan && c.status !== 'cancelled'
    );
}

function _getDayFilteredOrders() {
    const dayVal = document.getElementById('pickerDayFilter')?.value || 'all';
    if (dayVal === 'all') return customers;
    return customers.filter(c => String(c.assignedDay) === String(dayVal));
}

// ── Live Picking Strip ───────────────────────────────────────────────────────
// Shows who is currently picking, what they're picking, and elapsed time
function renderPickerLiveStrip() {
    const el = document.getElementById('pickerLiveStrip');
    if (!el) return;

    const dayOrders = _getDayFilteredOrders();
    const activelyPicking = dayOrders.filter(c => c.status === 'picking' && c.assignedStaff?.length > 0);

    if (!activelyPicking.length) {
        el.innerHTML = `<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 20px;display:flex;align-items:center;gap:10px;color:var(--text-muted);font-size:13px;">
            <span style="width:10px;height:10px;border-radius:50%;background:#9ca3af;flex-shrink:0;"></span>
            No active picking in progress
        </div>`;
        return;
    }

    const cards = activelyPicking.map(order => {
        const elapsed = _elapsedMinutes(order.passport?.timestamps?.pickingStarted);
        const plants = parseInt(order.passport?.numberOfPlants) || 0;
        const pickers = (order.assignedStaff || [])
            .map(id => staffMembers.find(s => s.id === id))
            .filter(Boolean);
        const urgency = elapsed > 60 ? '#ef4444' : elapsed > 30 ? '#f59e0b' : '#10b981';

        const pickerBubbles = pickers.map(p => {
            const ini = p.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            return `<span title="${p.name}" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:#ec4899;color:white;font-size:10px;font-weight:700;margin-left:-6px;border:2px solid white;">${ini}</span>`;
        }).join('');

        return `<div style="flex-shrink:0;background:var(--surface);border:2px solid ${urgency}44;border-radius:10px;padding:12px 14px;min-width:200px;max-width:240px;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                <span style="width:8px;height:8px;border-radius:50%;background:${urgency};animation:pulse 1.5s infinite;flex-shrink:0;"></span>
                <span style="font-size:12px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${order.name}</span>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">
                ${plants > 0 ? '🌱 ' + plants + ' plants · ' : ''}${order.zone}
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;">
                <div style="display:flex;">${pickerBubbles}</div>
                <span style="font-size:13px;font-weight:800;color:${urgency};">⏱ ${_formatDuration(elapsed)}</span>
            </div>
        </div>`;
    }).join('');

    el.innerHTML = `
        <style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}</style>
        <div style="background:linear-gradient(135deg,#fef3c7,#fff7ed);border:1px solid #f59e0b44;border-radius:10px;padding:12px 16px;margin-bottom:10px;">
            <div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
                <i class="fas fa-circle" style="color:#f59e0b;font-size:8px;animation:pulse 1.5s infinite;"></i>
                LIVE — ${activelyPicking.length} order${activelyPicking.length>1?'s':''} being picked now
            </div>
            <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;">${cards}</div>
        </div>`;
}

// ── Main Grid ────────────────────────────────────────────────────────────────
function renderPickerDashboardGrid() {
    const el = document.getElementById('pickerDashboardContent');
    if (!el) return;

    const pickers = staffMembers.filter(s => s.type === 'picker' || s.type === 'both');
    if (!pickers.length) {
        el.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-muted);"><i class="fas fa-users" style="font-size:40px;opacity:0.15;display:block;margin-bottom:16px;"></i><p>No pickers found. Add staff members with type "picker".</p></div>`;
        return;
    }

    const dayOrders = _getDayFilteredOrders();
    const dayVal = document.getElementById('pickerDayFilter')?.value || 'all';
    const dayLabel = dayVal === 'all' ? 'All Days' : (DAYS.find(d => d.id === parseInt(dayVal))?.name || '');

    // Stats summary bar
    const totalAssigned = dayOrders.filter(c => c.assignedStaff?.length > 0).length;
    const totalPicking = dayOrders.filter(c => c.status === 'picking').length;
    const totalDone = dayOrders.filter(c => ['ready_for_delivery','delivering','delivered','collected'].includes(c.status)).length;

    let html = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
        ${_summaryCard('fas fa-users','#6366f1',pickers.length,'Total Pickers')}
        ${_summaryCard('fas fa-boxes','#f59e0b',totalAssigned,'Orders Assigned')}
        ${_summaryCard('fas fa-spinner','#f59e0b',totalPicking,'Currently Picking')}
        ${_summaryCard('fas fa-check-circle','#10b981',totalDone,'Completed')}
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;">`;

    pickers.forEach(picker => {
        const pickerOrders = dayOrders.filter(c =>
            c.assignedStaff && c.assignedStaff.includes(picker.id)
        );

        const currentlyPicking = pickerOrders.filter(c => c.status === 'picking');
        const completed = pickerOrders.filter(c => ['ready_for_delivery','delivering','delivered','collected'].includes(c.status));
        const pending = pickerOrders.filter(c => c.status === 'pending');

        const ini = picker.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        const isActive = currentlyPicking.length > 0;
        const borderColor = isActive ? '#f59e0b' : completed.length > 0 ? '#10b981' : '#e5e7eb';
        const statusDot = isActive ? '#f59e0b' : completed.length === pickerOrders.length && pickerOrders.length > 0 ? '#10b981' : '#9ca3af';

        // Efficiency from completed orders
        const effScores = completed.map(c => c.passport?.pickingMetrics?.efficiencyScore || 0).filter(s => s > 0);
        const avgEff = effScores.length ? Math.round(effScores.reduce((a,b) => a+b, 0) / effScores.length) : 0;
        const totalPlantsPicked = completed.reduce((s,c) => s + (parseInt(c.passport?.numberOfPlants) || 0), 0);
        const totalPickingMins = completed.reduce((s,c) => s + (c.passport?.pickingMetrics?.pickingDuration || 0), 0);

        html += `
        <div style="background:var(--surface);border:2px solid ${borderColor};border-radius:12px;overflow:hidden;">
            <!-- Picker header -->
            <div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;">
                <div style="position:relative;flex-shrink:0;">
                    <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#ec4899,#8b5cf6);display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:14px;">${ini}</div>
                    <span style="position:absolute;bottom:0;right:0;width:12px;height:12px;border-radius:50%;background:${statusDot};border:2px solid white;"></span>
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:14px;font-weight:700;color:var(--text);">${picker.name}</div>
                    <div style="font-size:11px;color:var(--text-muted);">${picker.role || 'Picker'} · ${dayLabel}</div>
                </div>
                <div style="text-align:right;flex-shrink:0;">
                    <div style="font-size:20px;font-weight:800;color:var(--text);">${pickerOrders.length}</div>
                    <div style="font-size:10px;color:var(--text-muted);">orders</div>
                </div>
            </div>

            <!-- Progress bar -->
            ${_progressBar(pending.length, currentlyPicking.length, completed.length, pickerOrders.length)}

            <!-- Stats row -->
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0;border-bottom:1px solid var(--border);">
                ${_miniStat('Pending', pending.length, '#9ca3af')}
                ${_miniStat('Picking', currentlyPicking.length, '#f59e0b')}
                ${_miniStat('Done', completed.length, '#10b981')}
            </div>

            <!-- Currently picking -->
            ${currentlyPicking.length ? _currentlyPickingSection(currentlyPicking) : ''}

            <!-- Order list -->
            ${pickerOrders.length ? _orderList(pickerOrders, picker.id) : _emptyPicker()}

            <!-- Performance footer (if has completed work) -->
            ${completed.length > 0 ? _perfFooter(avgEff, totalPlantsPicked, totalPickingMins, completed.length) : ''}
        </div>`;
    });

    html += '</div>';
    el.innerHTML = html;
}

function _summaryCard(icon, color, value, label) {
    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px;display:flex;align-items:center;gap:12px;">
        <div style="width:40px;height:40px;border-radius:10px;background:${color}18;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i class="${icon}" style="color:${color};font-size:16px;"></i>
        </div>
        <div>
            <div style="font-size:22px;font-weight:800;color:var(--text);">${value}</div>
            <div style="font-size:11px;color:var(--text-muted);">${label}</div>
        </div>
    </div>`;
}

function _progressBar(pending, picking, done, total) {
    if (total === 0) return '';
    const doneW  = Math.round((done    / total) * 100);
    const pickW  = Math.round((picking / total) * 100);
    const pendW  = 100 - doneW - pickW;
    return `<div style="padding:10px 16px 8px;">
        <div style="display:flex;height:8px;border-radius:20px;overflow:hidden;gap:1px;">
            <div style="flex:${doneW};background:#10b981;border-radius:20px 0 0 20px;min-width:${doneW>0?4:0}px;transition:flex 0.5s;"></div>
            <div style="flex:${pickW};background:#f59e0b;min-width:${pickW>0?4:0}px;transition:flex 0.5s;"></div>
            <div style="flex:${pendW};background:#e5e7eb;border-radius:0 20px 20px 0;min-width:${pendW>0?4:0}px;transition:flex 0.5s;"></div>
        </div>
        <div style="display:flex;gap:10px;margin-top:5px;font-size:10px;color:var(--text-muted);">
            <span style="color:#10b981;">■ Done ${doneW}%</span>
            <span style="color:#f59e0b;">■ Picking ${pickW}%</span>
            <span style="color:#9ca3af;">■ Pending ${pendW}%</span>
        </div>
    </div>`;
}

function _miniStat(label, value, color) {
    return `<div style="padding:8px 12px;text-align:center;border-right:1px solid var(--border);">
        <div style="font-size:18px;font-weight:800;color:${color};">${value}</div>
        <div style="font-size:10px;color:var(--text-muted);">${label}</div>
    </div>`;
}

function _currentlyPickingSection(orders) {
    const items = orders.map(order => {
        const elapsed = _elapsedMinutes(order.passport?.timestamps?.pickingStarted);
        const urgency = elapsed > 60 ? '#ef4444' : elapsed > 30 ? '#f59e0b' : '#10b981';
        const plants = parseInt(order.passport?.numberOfPlants) || 0;
        return `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fef3c733;border-radius:8px;margin-bottom:4px;">
            <span style="width:8px;height:8px;border-radius:50%;background:#f59e0b;animation:pulse 1.5s infinite;flex-shrink:0;"></span>
            <div style="flex:1;min-width:0;">
                <div style="font-size:12px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${order.name}</div>
                ${plants > 0 ? `<div style="font-size:10px;color:var(--text-muted);">🌱 ${plants} plants</div>` : ''}
            </div>
            <span style="font-size:12px;font-weight:800;color:${urgency};white-space:nowrap;">⏱ ${_formatDuration(elapsed)}</span>
        </div>`;
    }).join('');

    return `<div style="padding:10px 14px;border-bottom:1px solid var(--border);">
        <div style="font-size:10px;font-weight:700;color:#92400e;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Currently Picking</div>
        ${items}
    </div>`;
}

function _orderList(orders, pickerId) {
    const sorted = [...orders].sort((a,b) => {
        const rank = { picking:0, pending:1, ready_for_delivery:2, delivering:3, delivered:4, collected:5, cancelled:6 };
        return (rank[a.status]||9) - (rank[b.status]||9);
    });

    const rows = sorted.map(order => {
        const color = _statusColor(order.status);
        const plants = parseInt(order.passport?.numberOfPlants) || 0;
        const duration = order.passport?.pickingMetrics?.pickingDuration;
        const van = order.assignedVan ? VANS.find(v => v.id === order.assignedVan) : null;
        const isPicking = order.status === 'picking';
        const elapsed = isPicking ? _elapsedMinutes(order.passport?.timestamps?.pickingStarted) : null;
        const urgency = isPicking && elapsed > 60 ? '#ef4444' : isPicking && elapsed > 30 ? '#f59e0b' : null;

        return `<div style="display:flex;align-items:center;gap:8px;padding:7px 14px;border-bottom:1px solid var(--border);${urgency ? 'background:'+urgency+'11;' : ''}">
            <span style="width:7px;height:7px;border-radius:50%;background:${color};flex-shrink:0;${isPicking?'animation:pulse 1.5s infinite;':''}"></span>
            <div style="flex:1;min-width:0;">
                <div style="font-size:11px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${order.name}</div>
                <div style="font-size:10px;color:var(--text-muted);">
                    ${van ? `<span style="color:${van.color};">■ ${van.name}</span> · ` : ''}
                    ${plants > 0 ? '🌱 ' + plants : ''}
                </div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
                <span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:10px;background:${color}22;color:${color};">${getStatusText(order.status)}</span>
                ${isPicking && elapsed !== null ? `<div style="font-size:10px;font-weight:700;color:${urgency||'#f59e0b'};margin-top:2px;">⏱ ${_formatDuration(elapsed)}</div>` : ''}
                ${duration > 0 && !isPicking ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">✓ ${_formatDuration(duration)}</div>` : ''}
            </div>
        </div>`;
    }).join('');

    return `<div style="max-height:220px;overflow-y:auto;">${rows}</div>`;
}

function _emptyPicker() {
    return `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:12px;">
        <i class="fas fa-inbox" style="font-size:20px;opacity:0.2;display:block;margin-bottom:6px;"></i>
        No orders assigned
    </div>`;
}

function _perfFooter(avgEff, plants, mins, count) {
    const effColor = avgEff >= 80 ? '#10b981' : avgEff >= 50 ? '#f59e0b' : '#ef4444';
    const pph = mins > 0 ? Math.round((plants / mins) * 60) : 0;
    return `<div style="padding:10px 14px;background:var(--surface-secondary, #f9fafb);border-top:1px solid var(--border);display:flex;justify-content:space-around;gap:8px;">
        <div style="text-align:center;">
            <div style="font-size:14px;font-weight:800;color:${effColor};">${avgEff > 0 ? avgEff + '%' : '—'}</div>
            <div style="font-size:9px;color:var(--text-muted);">Efficiency</div>
        </div>
        <div style="text-align:center;">
            <div style="font-size:14px;font-weight:800;color:var(--text);">${plants}</div>
            <div style="font-size:9px;color:var(--text-muted);">Plants picked</div>
        </div>
        <div style="text-align:center;">
            <div style="font-size:14px;font-weight:800;color:var(--text);">${pph > 0 ? pph : '—'}</div>
            <div style="font-size:9px;color:var(--text-muted);">Plants/hr</div>
        </div>
        <div style="text-align:center;">
            <div style="font-size:14px;font-weight:800;color:var(--text);">${_formatDuration(mins)}</div>
            <div style="font-size:9px;color:var(--text-muted);">Total time</div>
        </div>
    </div>`;
}
