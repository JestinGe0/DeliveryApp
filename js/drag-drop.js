// ========== DRAG & DROP — ORDER CARDS WITH VAN/DAY SELECTION ==========
// Global drag state (read by orders.js handlers)
window._dndDraggedId  = null;
window._dndSourceZone = null;

// Called from orders.js for every rendered card
function attachCardDragListeners(card, customerId) {
    card.setAttribute('draggable', 'true');

    card.addEventListener('dragstart', function (e) {
        window._dndDraggedId  = customerId;
        const c = customers.find(x => x.id === customerId);
        window._dndSourceZone = c ? c.zone : null;

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(customerId));

        // Mark this card first so it's excluded from pointer-events: none
        card.classList.add('dnd-dragging');
        // Defer body class so browser has locked the drag before we kill pointer-events
        requestAnimationFrame(() => document.body.classList.add('dnd-active'));
    });

    card.addEventListener('dragend', function () {
        card.classList.remove('dnd-dragging');
        document.body.classList.remove('dnd-active');
        dndClear();
        window._dndDraggedId  = null;
        window._dndSourceZone = null;
    });
}

/// Highlight the zone-card containing a zone-orders element
function dndHighlight(zoneOrdersEl, zoneName) {
    dndClear();
    const zoneCard = zoneOrdersEl && zoneOrdersEl.closest
        ? zoneOrdersEl.closest('.zone-card')
        : null;
    if (!zoneCard) return;
    const isSame = (window._dndSourceZone === zoneName);
    zoneCard.classList.add(isSame ? 'dnd-over-same' : 'dnd-over');
}

function dndClear() {
    document.querySelectorAll('.zone-card.dnd-over, .zone-card.dnd-over-same')
        .forEach(el => el.classList.remove('dnd-over', 'dnd-over-same'));
}


// Called from zone-orders and card drop handlers
function dndOpenModal(zoneName, e) {
    const rawId = (e && e.dataTransfer)
        ? e.dataTransfer.getData('text/plain')
        : '';
    const cid = parseInt(rawId || window._dndDraggedId, 10);
    if (!cid || !zoneName) return;
    const customer = customers.find(c => c.id === cid);
    if (!customer) return;
    openZoneReassignModal(customer, zoneName);
}


// ========== REASSIGNMENT MODAL WITH VAN & DAY SELECTION ==========

function openZoneReassignModal(customer, targetZone) {
    const modal = document.getElementById('zoneReassignModal');
    if (!modal) return;

    // Store current values for cancel
    modal.dataset.originalZone = customer.zone || '';
    modal.dataset.originalVan = customer.assignedVan || '';
    modal.dataset.originalDay = customer.assignedDay || '';

    document.getElementById('zrm-customerName').textContent = customer.name;
    document.getElementById('zrm-customerAddress').textContent = customer.address || '—';
    document.getElementById('zrm-customerDistance').textContent = 
        customer.roadDistanceFromSite ? `${customer.roadDistanceFromSite.toFixed(1)} km` : '—';

    const fromEl = document.getElementById('zrm-fromZone');
    fromEl.textContent = customer.zone || '—';
    fromEl.style.color = (ZONES[customer.zone] || {}).color || '#374151';

    const toEl = document.getElementById('zrm-toZone');
    toEl.textContent = targetZone;
    toEl.style.color = (ZONES[targetZone] || {}).color || '#374151';

    const note = document.getElementById('zrm-sameZoneNote');
    if (note) note.style.display = customer.zone === targetZone ? 'block' : 'none';

    modal.dataset.customerId = customer.id;
    modal.dataset.targetZone = targetZone;

    // Van select - only show if not Collection zone
    const vanSelectGroup = document.getElementById('zrm-vanGroup');
    if (targetZone === 'Collection') {
        if (vanSelectGroup) vanSelectGroup.style.display = 'none';
    } else {
        if (vanSelectGroup) vanSelectGroup.style.display = 'block';
    }
    
    const vanSel = document.getElementById('zrm-vanSelect');
    vanSel.innerHTML = '<option value="">— No Van / Unassigned —</option>';
    VANS.forEach(v => {
        const o = document.createElement('option');
        o.value = v.id; 
        o.textContent = v.name; 
        o.style.color = v.color;
        if (customer.assignedVan === v.id) o.selected = true;
        vanSel.appendChild(o);
    });
    if (targetZone === 'Collection') vanSel.value = '';

    // Day select — restricted to admin-configured active delivery days
    const daySel = document.getElementById('zrm-daySelect');
    daySel.innerHTML = '<option value="">— Unscheduled —</option>';
    const _zrmActiveDayIds = (typeof ACTIVE_DAYS !== 'undefined' && ACTIVE_DAYS.length) ? ACTIVE_DAYS : DAYS.map(function(d){return d.id;});
    DAYS.filter(function(d) { return _zrmActiveDayIds.includes(d.id); }).forEach(function(d) {
        const o = document.createElement('option');
        o.value = d.id; 
        o.textContent = d.name;
        if (customer.assignedDay === d.id) o.selected = true;
        daySel.appendChild(o);
    });

    // Show/hide warning for unscheduled collections
    const unscheduledWarning = document.getElementById('zrm-unscheduledWarning');
    if (unscheduledWarning) {
        unscheduledWarning.style.display = (targetZone === 'Collection' && !customer.assignedDay) ? 'flex' : 'none';
    }

    modal.classList.add('active');
}


function confirmZoneReassign() {
    const modal      = document.getElementById('zoneReassignModal');
    const customerId = parseInt(modal.dataset.customerId);
    const targetZone = modal.dataset.targetZone;
    const customer   = customers.find(c => c.id === customerId);
    if (!customer) { closeZoneReassignModal(); return; }

    const newVanId = parseInt(document.getElementById('zrm-vanSelect').value) || null;
    const newDayId = parseInt(document.getElementById('zrm-daySelect').value) || null;

    // Get schedule note if provided
    const scheduleNote = document.getElementById('zrm-scheduleNote')?.value || '';

    // Capture state for undo BEFORE any mutation
    if (typeof historyCapture === 'function') historyCapture(customerId);

    // Store old values for analytics/notification
    const oldZone = customer.zone;
    const oldVan = customer.assignedVan;
    const oldDay = customer.assignedDay;

    // Remove from old van/day slot if assigned
    if (customer.assignedVan && customer.assignedDay) {
        const slot = deliveryPlan[customer.assignedVan]?.[customer.assignedDay];
        if (slot) { 
            const i = slot.indexOf(customerId); 
            if (i > -1) slot.splice(i, 1); 
        }
    }

    // Update customer
    customer.zone        = targetZone;
    customer.assignedVan = newVanId;
    customer.assignedDay = newDayId;
    
    // Clear driver if moving to Collection
    if (targetZone === 'Collection') {
        customer.assignedDriver = null;
    }

    // Add to new van/day slot
    if (newVanId && newDayId && targetZone !== 'Collection') {
        if (!deliveryPlan[newVanId])           deliveryPlan[newVanId]           = {};
        if (!deliveryPlan[newVanId][newDayId]) deliveryPlan[newVanId][newDayId] = [];
        if (!deliveryPlan[newVanId][newDayId].includes(customerId))
            deliveryPlan[newVanId][newDayId].push(customerId);
    }

    saveData();
    updateAllDisplays();

    // Build notification message
    let changes = [];
    if (oldZone !== targetZone) changes.push(`Zone: ${oldZone} → ${targetZone}`);
    if (oldVan !== newVanId) {
        const oldVanName = oldVan ? (VANS.find(v => v.id === oldVan)?.name || 'Unknown') : 'None';
        const newVanName = newVanId ? (VANS.find(v => v.id === newVanId)?.name || 'Unknown') : 'None';
        changes.push(`Van: ${oldVanName} → ${newVanName}`);
    }
    if (oldDay !== newDayId) {
        const oldDayName = oldDay ? getDayName(oldDay) : 'Unscheduled';
        const newDayName = newDayId ? getDayName(newDayId) : 'Unscheduled';
        changes.push(`Day: ${oldDayName} → ${newDayName}`);
    }
    
    const vanName = newVanId ? (VANS.find(v => v.id === newVanId)?.name || '?') : 'No Van';
    const dayName = newDayId ? getDayName(newDayId) : 'Unscheduled';
    
    let message = `✅ ${customer.name} reassigned to ${targetZone}`;
    if (changes.length > 1) message += `\n${changes.join(' · ')}`;
    else if (changes.length === 1) message += `\n${changes[0]}`;
    
    showNotification(message, 'success');
    
    // Add to activity log if schedule note provided
    if (scheduleNote) {
        console.log(`📝 Schedule note for ${customer.name}: ${scheduleNote}`);
        // Could store in customer.passport.scheduleNotes array
        if (!customer.passport) customer.passport = {};
        if (!customer.passport.scheduleNotes) customer.passport.scheduleNotes = [];
        customer.passport.scheduleNotes.push({
            date: new Date().toISOString(),
            note: scheduleNote,
            changes: changes
        });
        saveData();
    }
    
    closeZoneReassignModal();
}
function closeZoneReassignModal() {
    const m = document.getElementById('zoneReassignModal');
    if (m) m.classList.remove('active');
    
    // Clear any schedule note
    const noteInput = document.getElementById('zrm-scheduleNote');
    if (noteInput) noteInput.value = '';
}

// Helper function to toggle advanced options
function toggleZrmAdvanced() {
    const advanced = document.getElementById('zrm-advancedOptions');
    const icon = document.getElementById('zrm-advancedIcon');
    if (advanced.style.display === 'none') {
        advanced.style.display = 'block';
        if (icon) icon.className = 'fas fa-chevron-up';
    } else {
        advanced.style.display = 'none';
        if (icon) icon.className = 'fas fa-chevron-down';
    }
}

// Update van options based on selected day (optional - for capacity checking)
function updateVanOptionsForDay() {
    const dayId = parseInt(document.getElementById('zrm-daySelect').value);
    const vanSelect = document.getElementById('zrm-vanSelect');
    const currentValue = vanSelect.value;
    
    if (!dayId) {
        // Enable all vans
        Array.from(vanSelect.options).forEach(opt => {
            if (opt.value) opt.disabled = false;
        });
        return;
    }
    
    // Check van capacities for selected day
    Array.from(vanSelect.options).forEach(opt => {
        if (!opt.value) return;
        const vanId = parseInt(opt.value);
        const currentCount = deliveryPlan[vanId]?.[dayId]?.length || 0;
        const van = VANS.find(v => v.id === vanId);
        const capacity = van?.capacity || 20;
        
        if (currentCount >= capacity) {
            opt.disabled = true;
            opt.title = `Van full (${currentCount}/${capacity} orders)`;
        } else {
            opt.disabled = false;
            opt.title = `${capacity - currentCount} spots remaining`;
        }
    });
    
    // Restore selection if still valid
    if (vanSelect.querySelector(`option[value="${currentValue}"]:not(:disabled)`)) {
        vanSelect.value = currentValue;
    } else if (vanSelect.value) {
        vanSelect.value = '';
    }
}
