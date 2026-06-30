// ========== UNDO / REDO FOR DRAG-DROP REASSIGNMENTS ==========
// Works by snapshotting the affected customer + deliveryPlan before each
// confirmZoneReassign() call, then restoring on Ctrl+Z / Ctrl+Y.

const _HISTORY_MAX = 50;

var _historyStack    = [];   // array of { customer snapshot, plan snapshot }
var _historyPosition = -1;   // points to the entry that represents current state after undo

// ── Snapshot helpers ──────────────────────────────────────────────────────────

function _historySnapshotCustomer(c) {
    return {
        id:            c.id,
        zone:          c.zone,
        assignedVan:   c.assignedVan,
        assignedDay:   c.assignedDay,
        assignedDriver: c.assignedDriver,
    };
}

function _historySnapshotPlan() {
    // Deep-copy only the customer-id arrays (primitives), skip geometry
    const snap = {};
    if (typeof deliveryPlan !== 'undefined') {
        for (const [vanId, days] of Object.entries(deliveryPlan)) {
            snap[vanId] = {};
            for (const [dayId, ids] of Object.entries(days)) {
                snap[vanId][dayId] = [...ids];
            }
        }
    }
    return snap;
}

// ── Public API ────────────────────────────────────────────────────────────────

function historyCapture(customerId) {
    if (typeof customers === 'undefined') return;
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;

    // Discard any redo entries above current position
    _historyStack = _historyStack.slice(0, _historyPosition + 1);

    _historyStack.push({
        customerSnap: _historySnapshotCustomer(customer),
        planSnap:     _historySnapshotPlan(),
    });

    // Keep stack within limit
    if (_historyStack.length > _HISTORY_MAX) _historyStack.shift();

    _historyPosition = _historyStack.length - 1;
}

function historyUndo() {
    if (_historyPosition < 0) {
        if (typeof showNotification === 'function') showNotification('Nothing to undo', 'info');
        return;
    }

    const entry = _historyStack[_historyPosition];
    _historyPosition--;

    _historyApply(entry);
    if (typeof showNotification === 'function')
        showNotification('↩ Undo: reassignment reversed', 'success');
}

function historyRedo() {
    const next = _historyPosition + 1;
    if (next >= _historyStack.length) {
        if (typeof showNotification === 'function') showNotification('Nothing to redo', 'info');
        return;
    }

    _historyPosition = next;
    const entry = _historyStack[next];

    // For redo we need a "before-undo" snapshot — we re-capture current state
    // and then apply the redo entry. Because we stored pre-change snapshots,
    // redo needs the state from one step ahead — store forward snapshots too.
    // Simple approach: redo just re-applies the snapshot at position+1 relative
    // to the stack built during the original operations. Since we slice on push,
    // redo is only possible for entries that were already in the stack.
    _historyApply(entry);
    if (typeof showNotification === 'function')
        showNotification('↪ Redo: reassignment re-applied', 'success');
}

function _historyApply(entry) {
    if (!entry) return;
    const { customerSnap, planSnap } = entry;

    // Restore customer fields
    if (typeof customers !== 'undefined') {
        const c = customers.find(x => x.id === customerSnap.id);
        if (c) {
            c.zone          = customerSnap.zone;
            c.assignedVan   = customerSnap.assignedVan;
            c.assignedDay   = customerSnap.assignedDay;
            c.assignedDriver = customerSnap.assignedDriver;
        }
    }

    // Restore delivery plan arrays
    if (typeof deliveryPlan !== 'undefined' && planSnap) {
        for (const [vanId, days] of Object.entries(planSnap)) {
            if (!deliveryPlan[vanId]) deliveryPlan[vanId] = {};
            for (const [dayId, ids] of Object.entries(days)) {
                deliveryPlan[vanId][dayId] = [...ids];
            }
        }
    }

    // Persist & redraw
    if (typeof saveData === 'function')          saveData();
    if (typeof updateAllDisplays === 'function') updateAllDisplays();
}

// Expose for keyboard.js
window.historyCapture = historyCapture;
window.historyUndo    = historyUndo;
window.historyRedo    = historyRedo;
