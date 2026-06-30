// ========== SMART GROUPING PAGE FUNCTIONS =================================================================================================

let pageSelectedCustomers = [];
let pageSmartGroupingSuggestions = [];

// ── Test data helpers ─────────────────────────────────────────────────────────

function seedGroupingTestData() {
    const deliveryCustomers = customers.filter(c => c.zone !== 'Collection');
    if (deliveryCustomers.length === 0) {
        showNotification('No delivery customers to seed', 'warning');
        return;
    }

    function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

    const vanMax = (typeof MAX_TROLLEYS_PER_RUN !== 'undefined') ? MAX_TROLLEYS_PER_RUN : 17;
    const bays   = (typeof BAY_COUNT !== 'undefined' && BAY_COUNT > 0) ? BAY_COUNT : 3;
    const staffIds = (typeof staffMembers !== 'undefined' && staffMembers.length)
        ? staffMembers.map(s => s.id) : [];

    deliveryCustomers.forEach(c => {
        if (!c.passport) c.passport = {};
        // Random trolley count: 1 up to van max, weighted towards smaller loads
        const trolleys = rnd(1, Math.min(vanMax, 8));
        c.passport.trolleyCount = trolleys;

        // Random bay
        c.bayNumber = String(rnd(1, bays));

        // Random picker
        if (staffIds.length) {
            c.assignedStaff = [staffIds[rnd(0, staffIds.length - 1)]];
        }

        // Random heavy load flag (20% chance)
        c.passport.heavyLoad = Math.random() < 0.2;

        // Persist to DB
        if (typeof quickSavePassport === 'function') quickSavePassport(c);
    });

    // Persist bay + staff assignments
    if (typeof saveData === 'function') saveData();
    if (typeof renderPageCustomerSelectionList === 'function') renderPageCustomerSelectionList();
    if (typeof updateAllDisplays === 'function') updateAllDisplays();

    showNotification(
        `Test data seeded for ${deliveryCustomers.length} customers — random trolleys (1–${Math.min(vanMax, 8)}), bays, pickers`,
        'success'
    );
}

function flushGroupingTestData() {
    if (!confirm('Clear all test trolley counts, bays and picker assignments from every customer?')) return;

    customers.forEach(c => {
        if (!c.passport) c.passport = {};
        c.passport.trolleyCount = 0;
        c.passport.heavyLoad    = false;
        c.bayNumber             = null;
        c.assignedStaff         = [];
        if (typeof quickSavePassport === 'function') quickSavePassport(c);
    });

    if (typeof saveData === 'function') saveData();
    if (typeof renderPageCustomerSelectionList === 'function') renderPageCustomerSelectionList();
    if (typeof updateAllDisplays === 'function') updateAllDisplays();

    showNotification('Test data cleared — trolleys, bays and pickers reset for all customers', 'info');
}

window.seedGroupingTestData = seedGroupingTestData;
window.flushGroupingTestData = flushGroupingTestData;

// Returns the active delivery days array, falling back to all 7 if not configured.
// Always reflects the current ACTIVE_DAYS global (updated by Settings → Days).
function getActiveDays() {
    if (typeof ACTIVE_DAYS !== 'undefined' && Array.isArray(ACTIVE_DAYS) && ACTIVE_DAYS.length > 0) {
        return ACTIVE_DAYS;
    }
    return [1, 2, 3, 4, 5, 6, 7];
}
window.getActiveDays = getActiveDays;


// Refresh the smart grouping page
function refreshGroupingPage() {
    pageSelectedCustomers = [];
    pageSmartGroupingSuggestions = [];
    
    // Reset UI
    document.getElementById('pageStrategySection').style.display = 'none';
    document.getElementById('pageProceedBtn').style.display = 'inline-flex';
    document.getElementById('pageApplyGroupsBtn').style.display = 'none';
    document.getElementById('pageBackBtn').style.display = 'none';
    document.getElementById('pageAssignmentOptions').style.display = 'none';
    document.getElementById('pageProceedBtn').disabled = true;
    document.getElementById('pageGroupingSuggestions').innerHTML = '';
    
    // Clear filters
    const searchInput = document.getElementById('pageCustomerSearchInput');
    const zoneFilter = document.getElementById('pageZoneFilter');
    const statusFilter = document.getElementById('pageOrderStatusFilter');
    
    if (searchInput) searchInput.value = '';
    if (zoneFilter) zoneFilter.value = 'all';
    if (statusFilter) statusFilter.value = 'all';
    
    // Render customer list
    renderPageCustomerSelectionList();
    
    // Add event listeners
    setupPageEventListeners();
}

// Setup assignment options
function setupPageAssignmentOptions() {
    const radios = document.querySelectorAll('input[name="pageAssignmentDay"]');
    const specificSelect = document.getElementById('pageSpecificDaySelect');
    
    radios.forEach(radio => {
        radio.addEventListener('change', function() {
            if (specificSelect) {
                specificSelect.disabled = this.value !== 'specific';
            }
        });
    });
}
// Setup event listeners for the page
function setupPageEventListeners() {
    const searchInput = document.getElementById('pageCustomerSearchInput');
    const zoneFilter = document.getElementById('pageZoneFilter');
    const statusFilter = document.getElementById('pageOrderStatusFilter');
    const strategySelect = document.getElementById('pageGroupingStrategy');
    
    if (searchInput) {
        // Remove existing listeners to avoid duplicates
        searchInput.removeEventListener('input', debouncedRenderPageList);
        searchInput.addEventListener('input', debouncedRenderPageList);
    }
    
    if (zoneFilter) {
        zoneFilter.removeEventListener('change', renderPageCustomerSelectionList);
        zoneFilter.addEventListener('change', renderPageCustomerSelectionList);
    }
    
    if (statusFilter) {
        statusFilter.removeEventListener('change', renderPageCustomerSelectionList);
        statusFilter.addEventListener('change', renderPageCustomerSelectionList);
    }
    
    if (strategySelect) {
        strategySelect.removeEventListener('change', refreshPageGroupingSuggestions);
        strategySelect.addEventListener('change', refreshPageGroupingSuggestions);
    }
    
    // Setup assignment options
    setupPageAssignmentOptions();
}

// Debounced render function
const debouncedRenderPageList = debounce(renderPageCustomerSelectionList, 300);

// Render customer selection list
function renderPageCustomerSelectionList() {
    const searchInput = document.getElementById('pageCustomerSearchInput');
    const zoneFilter = document.getElementById('pageZoneFilter');
    const statusFilter = document.getElementById('pageOrderStatusFilter');
    
    const searchTerm = searchInput?.value?.toLowerCase() || '';
    const zoneFilterValue = zoneFilter?.value || 'all';
    const statusFilterValue = statusFilter?.value || 'all';
    
    // Get all customers
    let filteredCustomers = [...customers];
    
    // Apply search filter
    if (searchTerm) {
        filteredCustomers = filteredCustomers.filter(c => 
            c.name.toLowerCase().includes(searchTerm) ||
            (c.address && c.address.toLowerCase().includes(searchTerm)) ||
            (c.postcode && c.postcode.toLowerCase().includes(searchTerm))
        );
    }
    
    // Apply zone filter
    if (zoneFilterValue !== 'all') {
        filteredCustomers = filteredCustomers.filter(c => c.zone === zoneFilterValue);
    }
    
    // Apply status filter
    if (statusFilterValue === 'unassigned') {
        filteredCustomers = filteredCustomers.filter(c => !c.assignedVan);
    } else if (statusFilterValue === 'assigned') {
        filteredCustomers = filteredCustomers.filter(c => c.assignedVan);
    }
    
    // Sort by distance from depot (nearest first)
    filteredCustomers.sort((a, b) => {
        const da = a.roadDistanceFromSite || calculateStraightDistance(YOUR_SITE.lat, YOUR_SITE.lng, a.lat, a.lng) || 0;
        const db = b.roadDistanceFromSite || calculateStraightDistance(YOUR_SITE.lat, YOUR_SITE.lng, b.lat, b.lng) || 0;
        return da - db;
    });
    
    const container = document.getElementById('pageCustomerSelectionList');
    if (!container) return;
    
    if (filteredCustomers.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);">No customers found</div>';
        return;
    }
    
    container.innerHTML = filteredCustomers.map(customer => {
        const isSelected   = pageSelectedCustomers.some(c => c.id === customer.id);
        const trolleyCount = typeof getTotalTrolleyCount === 'function' ? getTotalTrolleyCount(customer) : (parseFloat(customer.passport?.trolleyCount) || 0);
        const heavyLoad    = customer.passport?.heavyLoad;

        return `
            <div class="customer-item ${isSelected ? 'selected' : ''}" onclick="pageToggleCustomerSelection(${customer.id})"
                 style="display:grid;grid-template-columns:24px 1fr auto 1fr;align-items:center;gap:8px;padding:8px 12px;">
                <input type="checkbox" class="customer-checkbox" ${isSelected ? 'checked' : ''}
                       onchange="pageToggleCustomerSelection(${customer.id})" onclick="event.stopPropagation()">
                <!-- Left: name + zone -->
                <div>
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                        <span class="customer-name" style="font-weight:600;">${customer.name}</span>
                        <span class="customer-zone-badge">${customer.zone || 'Local'}</span>
                        ${heavyLoad ? '<span style="background:#b45309;color:white;font-size:10px;padding:1px 6px;border-radius:8px;"><i class="fas fa-weight-hanging"></i> Heavy</span>' : ''}
                    </div>
                </div>
                <!-- Centre: trolley input -->
                <label style="display:flex;align-items:center;justify-content:center;gap:8px;cursor:default;" onclick="event.stopPropagation()">
                    <i class="fas fa-dolly" style="color:var(--primary);font-size:16px;"></i>
                    <input type="number" min="0" step="0.5"
                        value="${trolleyCount}"
                        onclick="event.stopPropagation()"
                        onchange="pageUpdateTrolleyCount(${customer.id}, this.value)"
                        style="width:72px;padding:6px 8px;border:2px solid var(--primary);border-radius:8px;font-size:18px;font-weight:800;text-align:center;background:var(--surface);color:var(--text);">
                    <span style="font-size:13px;color:var(--text-muted);">trolleys</span>
                </label>
                <!-- Right: distance + van -->
                <div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;font-size:12px;color:var(--text-muted);">
                    <span><i class="fas fa-road"></i> ${customer.roadDistanceFromSite?.toFixed(1) || 0} km</span>
                    ${customer.assignedVan ? `<span><i class="fas fa-truck"></i> Van ${customer.assignedVan}</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    updatePageSelectedCount();
}

// Inline trolley count edit from grouping list
function pageUpdateTrolleyCount(customerId, value) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    if (!customer.passport) customer.passport = {};
    customer.passport.trolleyCount = parseFloat(value) || 0;
    if (typeof quickSavePassport === 'function') quickSavePassport(customer);
    // Keep selected list in sync
    const sel = pageSelectedCustomers.find(c => c.id === customerId);
    if (sel) { if (!sel.passport) sel.passport = {}; sel.passport.trolleyCount = customer.passport.trolleyCount; }
}
window.pageUpdateTrolleyCount = pageUpdateTrolleyCount;

// Toggle customer selection
function pageToggleCustomerSelection(customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    
    const index = pageSelectedCustomers.findIndex(c => c.id === customerId);
    
    if (index === -1) {
        pageSelectedCustomers.push(customer);
    } else {
        pageSelectedCustomers.splice(index, 1);
    }
    
    renderPageCustomerSelectionList();
}

// Select all customers
function pageSelectAllCustomers() {
    pageSelectedCustomers = [...customers];
    renderPageCustomerSelectionList();
}


// Deselect all customers
function pageDeselectAllCustomers() {
    pageSelectedCustomers = [];
    renderPageCustomerSelectionList();
}

// Update selected count
function updatePageSelectedCount() {
    const countEl = document.getElementById('pageSelectedCount');
    const proceedBtn = document.getElementById('pageProceedBtn');
    
    if (countEl) countEl.textContent = pageSelectedCustomers.length;
    if (proceedBtn) proceedBtn.disabled = pageSelectedCustomers.length === 0;
}


// Proceed to grouping strategy
function pageProceedToGrouping() {
    if (pageSelectedCustomers.length === 0) {
        showNotification('Please select at least one customer', 'warning');
        return;
    }
    
    document.getElementById('pageStrategySection').style.display = 'block';
    document.getElementById('pageProceedBtn').style.display = 'none';
    document.getElementById('pageApplyGroupsBtn').style.display = 'inline-flex';
    document.getElementById('pageBackBtn').style.display = 'inline-flex';
    document.getElementById('pageAssignmentOptions').style.display = 'block';
    document.getElementById('pageApplyGroupsBtn').disabled = true;

    // Populate the specific-day dropdown with only active delivery days
    const activeDayIds = getActiveDays();
    const specificSelect = document.getElementById('pageSpecificDaySelect');
    if (specificSelect) {
        specificSelect.innerHTML = activeDayIds.map(function(dayId) {
            const day = DAYS.find(function(d) { return d.id === dayId; });
            return day ? '<option value="' + day.id + '">' + day.name + '</option>' : '';
        }).join('');
    }

    // Rebuild the Van Capacities panel from live VANS so it always reflects the
    // current van config (e.g. after a van is deleted in Settings).
    renderVanCapacitySummary();
    
    refreshPageGroupingSuggestions();
}

// Back to selection
function pageBackToSelection() {
    document.getElementById('pageStrategySection').style.display = 'none';
    document.getElementById('pageProceedBtn').style.display = 'inline-flex';
    document.getElementById('pageApplyGroupsBtn').style.display = 'none';
    document.getElementById('pageBackBtn').style.display = 'none';
    document.getElementById('pageAssignmentOptions').style.display = 'none';
    
    renderPageCustomerSelectionList();
}

// Render the Van Capacities summary panel from live VANS + VAN_CAPACITY.
// Called every time the strategy step opens so it always reflects current van config.
function renderVanCapacitySummary() {
    const container = document.getElementById('vanCapacitySummary');
    if (!container) return;

    if (!VANS || VANS.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);padding:10px;">No vans configured.</p>';
        return;
    }

    var strategy = document.getElementById('pageGroupingStrategy')?.value || 'mixed';
    var isPEP    = strategy === 'pep';
    var earlyStart = isPEP && (document.getElementById('pepEarlyStart')?.checked || false);

    container.innerHTML = '<h4><i class="fas fa-truck"></i> Van Capacities' +
        (isPEP ? ' <span style="font-size:11px;font-weight:400;color:var(--text-muted);">(PEP rules)</span>' : '') +
        '</h4><div class="van-cards">' +
        VANS.map(function(van) {
            var borderColor = van.color || 'var(--primary)';

            if (isPEP) {
                var p       = _pepProfile(van);
                var maxT    = p.maxTrolleys + (p.type === 'small' ? '/7*' : '');
                var maxD    = earlyStart ? p.maxDropsAllLocal : p.maxDropsNormal;
                var maxDAll = p.maxDropsAllLocal;
                var maxHrs  = earlyStart ? p.driveHrsEarly : p.driveHrsNormal;
                var typeTag = p.type === 'large'
                    ? '<span style="font-size:10px;background:#1d4ed8;color:white;padding:1px 5px;border-radius:4px;">Large</span>'
                    : '<span style="font-size:10px;background:#7c3aed;color:white;padding:1px 5px;border-radius:4px;">Small' + (p.multiRun ? ' · 2 runs' : '') + '</span>';
                return '<div class="van-capacity-card" style="border-top:3px solid ' + borderColor + ';">' +
                    '<div class="van-name" style="color:' + borderColor + ';display:flex;align-items:center;gap:6px;">' + van.name + ' ' + typeTag + '</div>' +
                    '<div class="van-stats">' +
                        '<span><i class="fas fa-dolly"></i> ' + maxT + ' trolleys</span>' +
                        '<span><i class="fas fa-map-pin"></i> ' + maxD + ' stops (' + maxDAll + ' if all local)</span>' +
                        '<span><i class="fas fa-hourglass-half"></i> ' + maxHrs + ' hrs max</span>' +
                        (p.maxSpeedKmh > 0 ? '<span style="color:#d97706;font-size:10px;"><i class="fas fa-tachometer-alt"></i> ' + Math.round(p.maxSpeedKmh / 1.60934) + 'mph limit</span>' : '') +
                    '</div>' +
                '</div>';
            }

            var cfg = (typeof VAN_CAPACITY !== 'undefined' && VAN_CAPACITY[van.id]) || {};
            var maxPlants   = cfg.maxPlants   || 500;
            var maxStops    = cfg.maxStops    || 15;
            var maxDistance = cfg.maxDistance || 200;
            return '<div class="van-capacity-card" style="border-top:3px solid ' + borderColor + ';">' +
                '<div class="van-name" style="color:' + borderColor + ';">' + van.name + '</div>' +
                '<div class="van-stats">' +
                    '<span><i class="fas fa-seedling"></i> ' + maxPlants + ' plants</span>' +
                    '<span><i class="fas fa-map-pin"></i> ' + maxStops + ' stops</span>' +
                    '<span><i class="fas fa-road"></i> ' + maxDistance + 'km</span>' +
                '</div>' +
            '</div>';
        }).join('') +
    '</div>';
}
window.renderVanCapacitySummary = renderVanCapacitySummary;

// Refresh grouping suggestions
function refreshPageGroupingSuggestions() {
    const strategySelect = document.getElementById('pageGroupingStrategy');
    if (!strategySelect) return;
    
    const strategy = strategySelect.value;
    
    if (pageSelectedCustomers.length === 0) {
        document.getElementById('pageGroupingSuggestions').innerHTML = `
            <div style="text-align: center; padding: 50px; color: var(--text-muted);">
                <i class="fas fa-users-slash fa-3x" style="margin-bottom: 15px;"></i>
                <h3>No Customers Selected</h3>
                <p>Please go back and select customers to group.</p>
            </div>
        `;
        return;
    }
    
    // Show/hide Early Start toggle for PEP only
    const earlyStartOpt = document.getElementById('pepEarlyStartOption');
    if (earlyStartOpt) earlyStartOpt.style.display = strategy === 'pep' ? 'flex' : 'none';

    // Update strategy description
    const descriptions = {
        'pep': 'PEP Route Optimisation — respects each van\'s real trolley cap, drive time limits, local vs long-haul rules and multi-run capability',
        'mixed': 'Balances distance, capacity, and zone preferences for optimal results',
        'proximity': 'Groups customers by geographic closeness - ideal for urban deliveries',
        'capacity': 'Optimizes van capacity usage - best for large orders',
        'zone': 'Groups by delivery zone - perfect for regional deliveries',
        'efficiency': 'Maximizes overall route efficiency - best for critical routes',
        'vrp': 'OR-Tools Vehicle Routing — mathematically optimal, respects van capacities and stop limits'
    };

    const descEl = document.getElementById('pageStrategyDescription');
    if (descEl) descEl.textContent = descriptions[strategy] || '';

    // VRP strategy is async — handle separately
    if (strategy === 'vrp') {
        runVRPOptimisation(pageSelectedCustomers);
        return;
    }

    // Generate groups (synchronous strategies)
    const groups = generatePageSmartGroupings(strategy, pageSelectedCustomers);
    displayPageGroupingSuggestions(groups);

    // Show "Refine with VRP" button only after PEP groups are generated
    const refineBar = document.getElementById('pepRefineVRPBar');
    if (refineBar) {
        const hasPEP = groups.some(g => g.strategy === 'pep');
        refineBar.style.display = hasPEP ? 'block' : 'none';
    }
}

// Async VRP optimisation — calls Node server → Python OR-Tools → road matrix
async function runVRPOptimisation(customersToGroup) {
    const container = document.getElementById('pageGroupingSuggestions');
    if (!container) return;

    // Exclude collection zones; must have coordinates
    const valid = customersToGroup.filter(c => c.zone !== 'Collection' && c.lat && c.lng);
    if (valid.length === 0) {
        showNotification('No valid customers to optimise', 'warning');
        return;
    }

    // Warn if already-assigned customers are in the selection
    const alreadyAssigned = valid.filter(c => c.assignedVan);
    if (alreadyAssigned.length > 0) {
        showNotification(
            `${alreadyAssigned.length} selected customer(s) are already assigned — VRP will re-evaluate them`,
            'info'
        );
    }

    // Show spinner
    container.innerHTML = `
        <div style="text-align:center; padding:60px; color:var(--text-muted);">
            <div class="spinner" style="margin:0 auto 20px;"></div>
            <h3>Running OR-Tools VRP optimisation…</h3>
            <p>Fetching real road distances and solving vehicle routing problem</p>
            <small>This takes 5–30 seconds for ${valid.length} stops</small>
        </div>`;

    // Check optimiser is available first
    let statusOk = false;
    try {
        const statusRes = await fetch(`${SERVER_URL}/api/optimiser-status`);
        const status = await statusRes.json();
        statusOk = status.available;
    } catch (e) { statusOk = false; }

    if (!statusOk) {
        container.innerHTML = `
            <div style="text-align:center; padding:40px; color:var(--text-muted);">
                <i class="fas fa-exclamation-triangle fa-3x" style="color:var(--warning); margin-bottom:15px;"></i>
                <h3>Python optimiser not running</h3>
                <p>Start it in a terminal:</p>
                <code style="background:var(--surface-2); padding:8px 16px; border-radius:6px; display:inline-block; margin:10px 0;">python optimise.py</code>
                <p>Then try again.</p>
            </div>`;
        return;
    }

    // Van configs — trolley cap from each van's capacity; stops/distance from van Settings
    const vanConfigs = VANS.map(v => ({
        id:          v.id,
        maxTrolleys: v.capacity || 17,
        maxStops:    (VAN_CAPACITY[v.id] && VAN_CAPACITY[v.id].maxStops)    || 15,
        maxDistance: (VAN_CAPACITY[v.id] && VAN_CAPACITY[v.id].maxDistance) || 200
    }));

    // ── Index-based IDs avoid float precision loss through Python JSON ────────
    // Customer IDs are 16-digit floats; Python serialisation can silently alter
    // the last digit(s). We send sequential integer indices instead and map
    // back by index on the return trip — no float IDs touch Python at all.
    const stops = valid.map((c, i) => ({
        id:       i,                          // integer index, not float customer id
        lat:      c.lat,
        lng:      c.lng,
        trolleys: getTotalTrolleyCount(c)     // primary + all additional orders
    }));

    try {
        const res = await fetch(`${SERVER_URL}/api/optimise-route`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ stops, vans: vanConfigs, depot: { lat: YOUR_SITE.lat, lng: YOUR_SITE.lng } })
        });

        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const result = await res.json();

        if (!result.success || !result.routes) {
            throw new Error(result.message || result.error || 'Optimisation failed');
        }

        // Build groups — look up customers by integer index (not float id)
        const groups = [];
        const assignedIndices = new Set();

        Object.entries(result.routes).forEach(([vanId, stopIndices]) => {
            const vanNum = parseInt(vanId);
            const grouped = stopIndices.map(idx => {
                const i = parseInt(idx);
                assignedIndices.add(i);
                return valid[i];
            }).filter(Boolean);
            if (grouped.length === 0) return;

            const van = VANS.find(v => v.id === vanNum);
            const totalTrolleys = grouped.reduce((s, c) => s + getTotalTrolleyCount(c), 0);

            groups.push({
                customers:    grouped,
                suggestedVan: vanNum,
                strategy:     'vrp',
                description:  `VRP optimal: ${grouped.length} stops, ${totalTrolleys} trolleys → ${van ? van.name : 'Van ' + vanNum}`,
                efficiency:   calculateGroupEfficiency(grouped, vanNum),
                totalPlants:  totalTrolleys,   // field name kept for display compatibility
                compactness:  calculateGroupCompactness(grouped)
            });
        });

        // Show dropped stops as a visible red "Unassigned" group
        const droppedCustomers = valid.filter((_, i) => !assignedIndices.has(i));
        if (droppedCustomers.length > 0) {
            groups.push({
                customers:   droppedCustomers,
                suggestedVan: null,
                strategy:    'unassigned',
                description: `⚠️ ${droppedCustomers.length} stop(s) couldn't fit within delivery window or trolley limits`,
                efficiency:  0,
                totalPlants: droppedCustomers.reduce((s, c) => s + getTotalTrolleyCount(c), 0),
                compactness: 0,
                isDropped:   true
            });
            showNotification(
                `${droppedCustomers.length} stop(s) couldn't be assigned — shown as Unassigned below`,
                'warning'
            );
        }

        pageSmartGroupingSuggestions = groups;
        displayPageGroupingSuggestions(groups);

        const assignedCount = valid.length - droppedCustomers.length;
        showNotification(
            `VRP: ${assignedCount}/${valid.length} stops assigned across ${groups.filter(g => !g.isDropped).length} van(s) — ${result.total_duration ? result.total_duration.toFixed(0) + ' min total drive' : ''}`,
            droppedCustomers.length === 0 ? 'success' : 'warning'
        );

    } catch (err) {
        console.error('[VRP] Error:', err);
        container.innerHTML = `
            <div style="text-align:center; padding:40px; color:var(--text-muted);">
                <i class="fas fa-times-circle fa-3x" style="color:var(--danger); margin-bottom:15px;"></i>
                <h3>Optimisation failed</h3>
                <p>${err.message}</p>
                <button class="btn-secondary" onclick="refreshPageGroupingSuggestions()" style="margin-top:10px;">
                    Try again
                </button>
            </div>`;
    }
}

// ── Refine PEP groups with OR-Tools VRP (stop-order only, groups unchanged) ──
async function refinePEPWithVRP() {
    const pepGroups = pageSmartGroupingSuggestions.filter(g => g.strategy === 'pep' && g.customers.length > 1);
    if (pepGroups.length === 0) {
        showNotification('No PEP groups to refine', 'warning');
        return;
    }

    // Check optimiser is available
    let statusOk = false;
    try {
        const s = await fetch(`${SERVER_URL}/api/optimiser-status`);
        statusOk = (await s.json()).available;
    } catch(e) { statusOk = false; }

    if (!statusOk) {
        showNotification('Python OR-Tools optimiser is not running — start it first', 'error');
        return;
    }

    const btn = document.getElementById('pepRefineVRPBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refining…'; }

    let refined = 0;
    let failed  = 0;

    for (const group of pepGroups) {
        const valid = group.customers.filter(c => c.lat && c.lng);
        if (valid.length < 2) continue;

        // Build integer-indexed stops (avoid float ID loss through Python)
        const stops = valid.map((c, i) => ({
            id:       i,
            lat:      c.lat,
            lng:      c.lng,
            trolleys: getTotalTrolleyCount(c)
        }));

        // One van, generous limits — we only want stop ORDER, not reassignment
        const van     = VANS.find(v => v.id === group.suggestedVan) || VANS[0];
        const profile = _pepProfile(van);
        const vanCfg  = [{
            id:          van.id,
            maxTrolleys: profile.maxTrolleys + 10,   // headroom so solver doesn't drop stops
            maxStops:    valid.length + 5,
            maxDistance: 9999
        }];

        try {
            const res = await fetch(`${SERVER_URL}/api/optimise-route`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    stops,
                    vans:  vanCfg,
                    depot: { lat: YOUR_SITE.lat, lng: YOUR_SITE.lng }
                })
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const result = await res.json();

            if (!result.success || !result.routes) throw new Error(result.message || 'No routes returned');

            // Get the optimised index order for this van
            const vanKey     = Object.keys(result.routes)[0];
            const indices    = result.routes[vanKey];
            if (!indices || indices.length === 0) throw new Error('Empty route');

            // Reorder customers by VRP-optimised index, preserve any skipped customers at end
            const optimisedCustomers = indices.map(i => valid[parseInt(i)]).filter(Boolean);
            const skipped = valid.filter((_, i) => !indices.map(Number).includes(i));
            group.customers = [...optimisedCustomers, ...skipped];

            // Recalculate drive time with the new order
            const earlyStart = document.getElementById('pepEarlyStart')?.checked || false;
            group.driveHrs   = Math.round(_pepEstimateDriveHours(group.customers, profile) * 10) / 10;

            refined++;
        } catch(err) {
            console.error('[refinePEPWithVRP] Group failed:', err.message);
            failed++;
        }
    }

    // Re-render with updated order
    displayPageGroupingSuggestions(pageSmartGroupingSuggestions);

    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Refined with VRP'; }

    if (failed === 0) {
        showNotification(`✅ Stop order refined for ${refined} group${refined !== 1 ? 's' : ''} using real road distances`, 'success');
    } else {
        showNotification(`Refined ${refined} group(s) — ${failed} failed (check optimiser logs)`, 'warning');
    }
}
window.refinePEPWithVRP = refinePEPWithVRP;

// Generate smart groupings for the page
function generatePageSmartGroupings(strategy = 'mixed', customersToGroup = null) {
    const customersToUse = customersToGroup || pageSelectedCustomers;
    
    // Filter out collection customers
    const validCustomers = customersToUse.filter(c => c.zone !== 'Collection');
    
    if (validCustomers.length === 0) {
        showNotification('No valid customers to group', 'warning');
        return [];
    }
    
    let groups = [];
    
    switch(strategy) {
        case 'pep':
            groups = groupByPEP(validCustomers);
            break;
        case 'proximity':
            groups = groupByProximity(validCustomers);
            break;
        case 'capacity':
            groups = groupByCapacity(validCustomers);
            break;
        case 'zone':
            groups = groupByZone(validCustomers);
            break;
        case 'efficiency':
            groups = groupByEfficiency(validCustomers);
            break;
        case 'mixed':
        default:
            groups = groupByMixed(validCustomers);
            break;
    }
    
    // Calculate efficiency scores — PEP groups keep their own pre-calculated values
    groups = groups.map(group => {
        if (group.strategy === 'pep' || group.strategy === 'unassigned') return group;
        const suggestedVan = findOptimalVanForGroup(group.customers);
        const efficiency = calculateGroupEfficiency(group.customers, suggestedVan || 1);
        return {
            ...group,
            suggestedVan,
            efficiency,
            totalPlants: calculateGroupPlants(group.customers),
            compactness: calculateGroupCompactness(group.customers)
        };
    });
    
    pageSmartGroupingSuggestions = groups;
    return groups;
}

// Display grouping suggestions
function displayPageGroupingSuggestions(groups) {
    const container = document.getElementById('pageGroupingSuggestions');
    if (!container) return;
    
    if (!groups || groups.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                <i class="fas fa-info-circle fa-3x" style="margin-bottom: 15px; opacity: 0.5;"></i>
                <h3>No Groups Found</h3>
                <p>Try a different strategy or select different customers.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = groups.map((group, index) => {
        const totalPlants = group.totalPlants;   // holds trolley count for VRP groups
        const suggestedVan = group.suggestedVan;
        const van = VANS.find(v => v.id === suggestedVan);
        const efficiency = group.efficiency || 0;
        const isVRP = group.strategy === 'vrp';
        const vanColor = van ? van.color : 'var(--primary)';

        // ── Dropped / unassigned group — red, no checkbox ─────────────────────
        if (group.isDropped) {
            return `
                <div class="suggestion-group" data-group-index="${index}" style="border:2px solid var(--danger);border-radius:var(--radius);margin-bottom:15px;overflow:hidden;">
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:15px;background:rgba(220,53,69,0.07);">
                        <div style="display:flex;align-items:center;gap:12px;">
                            <i class="fas fa-exclamation-triangle" style="color:var(--danger);font-size:18px;"></i>
                            <span style="padding:4px 10px;border-radius:20px;background:var(--danger);color:white;font-size:12px;">unassigned</span>
                            <span><strong>${group.customers.length} stop(s)</strong> couldn't fit within delivery window or trolley limits</span>
                        </div>
                        <span style="font-size:12px;color:var(--text-muted);">Increase maxStops in van Settings</span>
                    </div>
                    <div style="padding:10px 15px;background:var(--surface);border-top:1px solid var(--danger);">
                        <div style="font-size:12px;color:var(--danger);margin-bottom:6px;"><i class="fas fa-info-circle"></i> These customers were NOT grouped — they will not be assigned:</div>
                        ${group.customers.map(c => `
                            <div style="display:inline-block;background:rgba(220,53,69,0.1);border:1px solid var(--danger);padding:3px 8px;border-radius:12px;margin:2px;font-size:11px;color:var(--danger);">
                                ${c.name} (${getTotalTrolleyCount(c)} 🛒)
                            </div>
                        `).join('')}
                    </div>
                </div>`;
        }

        // ── Normal group card ─────────────────────────────────────────────────
        const isPEP = group.strategy === 'pep';
        // For VRP/PEP groups totalPlants holds trolley count; for others it's plants.
        const capacityLabel = (isVRP || isPEP)
            ? `${totalPlants} trolley${totalPlants !== 1 ? 's' : ''} <i class="fas fa-dolly" style="font-size:10px;"></i>`
            : `${totalPlants} plants`;

        // PEP-specific badges
        const pepBadges = isPEP ? [
            group.runIndex > 1  ? `<span style="background:#7c3aed;color:white;padding:2px 7px;border-radius:10px;font-size:10px;">Run ${group.runIndex}</span>` : '',
            group.allLocal      ? `<span style="background:#16a34a;color:white;padding:2px 7px;border-radius:10px;font-size:10px;"><i class="fas fa-map-marker-alt"></i> All local</span>` : '',
            group.earlyStart    ? `<span style="background:#d97706;color:white;padding:2px 7px;border-radius:10px;font-size:10px;"><i class="fas fa-clock"></i> Early start</span>` : '',
            group.consultWarn   ? `<span style="background:#dc2626;color:white;padding:2px 7px;border-radius:10px;font-size:10px;"><i class="fas fa-exclamation-triangle"></i> Consult driver</span>` : ''
        ].filter(Boolean).join(' ') : '';

        const pepDriveTime = isPEP && group.driveHrs
            ? `<span style="margin-left:10px;font-size:12px;color:var(--text-muted);"><i class="fas fa-hourglass-half"></i> ~${group.driveHrs} hrs drive</span>`
            : '';

        return `
            <div class="suggestion-group" data-group-index="${index}" style="border:2px solid ${vanColor};border-radius:var(--radius);margin-bottom:15px;overflow:hidden;">
                <div style="display:flex;align-items:center;justify-content:space-between;padding:15px;background:var(--surface-2);">
                    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                        <input type="checkbox" class="group-checkbox" onchange="updatePageGroupSelection()" id="pageCheck-${index}">
                        <span style="padding:4px 10px;border-radius:20px;background:${vanColor};color:white;font-size:12px;">${isPEP ? '🌿 PEP' : group.strategy}</span>
                        <span><strong>${group.customers.length} stops</strong> · ${capacityLabel}</span>
                        ${pepBadges}
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
                        <span><i class="fas fa-truck" style="color:${vanColor};"></i> ${van ? van.name : 'Auto-assign'}</span>
                        ${pepDriveTime}
                        ${!isPEP ? `<span><i class="fas fa-chart-line"></i> ${efficiency}% eff.</span>` : ''}
                    </div>
                </div>
                <div style="padding:10px 15px;background:var(--surface);border-top:1px solid var(--border);">
                    <div style="font-size:12px;color:var(--text-muted);margin-bottom:5px;">Customers in this group:</div>
                    ${group.customers.map(c => {
                        const trolleys = getTotalTrolleyCount(c);
                        return `<div style="display:inline-block;background:var(--surface-2);padding:3px 8px;border-radius:12px;margin:2px;font-size:11px;">
                            ${c.name}${trolleys > 0 ? ` <span style="color:var(--text-muted);font-size:10px;">(${trolleys}🛒)</span>` : ''}
                        </div>`;
                    }).join('')}
                </div>
            </div>
        `;
    }).join('');
    
    document.getElementById('pageApplyGroupsBtn').disabled = true;
}

// MAIN FUNCTION: Apply selected groups (FIXED VERSION)
function pageApplySelectedGroups() {
    // Get all checked checkboxes
    const checkboxes = document.querySelectorAll('#pageGroupingSuggestions .group-checkbox:checked');
    const selectedGroups = [];
    
    // Collect selected groups
    checkboxes.forEach(cb => {
        const groupDiv = cb.closest('.suggestion-group');
        if (groupDiv && groupDiv.dataset.groupIndex) {
            const index = parseInt(groupDiv.dataset.groupIndex);
            if (pageSmartGroupingSuggestions[index]) {
                selectedGroups.push(pageSmartGroupingSuggestions[index]);
            }
        }
    });
    
    if (selectedGroups.length === 0) {
        showNotification('Please select at least one group', 'warning');
        return;
    }
    
    // Get assignment preference
    const assignmentPreference = document.querySelector('input[name="pageAssignmentDay"]:checked')?.value || 'auto';
    let targetDay = null;
    
    if (assignmentPreference === 'specific') {
        const specificSelect = document.getElementById('pageSpecificDaySelect');
        targetDay = specificSelect ? parseInt(specificSelect.value) : null;
        if (!targetDay) {
            showNotification('Please select a specific day', 'warning');
            return;
        }
        // Guard: reject days that are not in the active delivery schedule
        if (!getActiveDays().includes(targetDay)) {
            const dayName = (DAYS.find(function(d) { return d.id === targetDay; }) || {}).name || ('Day ' + targetDay);
            showNotification(dayName + ' is not an active delivery day. Please choose an active day.', 'warning');
            return;
        }
    }
    
    let assignedCount = 0;
    let failedCount = 0;
    let assignmentDetails = [];
    
    // Process each selected group
    selectedGroups.forEach(group => {
        // Find the best van for this group
        const vanId = group.suggestedVan || findOptimalVanForGroup(group.customers);
        
        if (!vanId) {
            console.log('No suitable van found for group', group);
            failedCount += group.customers.length;
            return;
        }
        
        // Process each customer in the group
        group.customers.forEach(customer => {
            try {
                // Determine which day to assign to
                let dayId;
                
                if (targetDay) {
                    // Use specific day
                    dayId = targetDay;
                } else {
                    // Auto-assign to best available day
                    dayId = findPageBestDayForVan(vanId);
                }
                
                console.log(`Assigning ${customer.name} to Van ${vanId}, Day ${dayId}`);
                
                // STEP 1: Remove from any existing assignments
                if (customer.assignedVan && customer.assignedDay) {
                    const oldVanId = customer.assignedVan;
                    const oldDayId = customer.assignedDay;
                    
                    if (deliveryPlan[oldVanId] && deliveryPlan[oldVanId][oldDayId]) {
                        const index = deliveryPlan[oldVanId][oldDayId].indexOf(customer.id);
                        if (index > -1) {
                            deliveryPlan[oldVanId][oldDayId].splice(index, 1);
                        }
                    }
                }
                
                // STEP 2: Ensure delivery plan structure exists
                if (!deliveryPlan[vanId]) {
                    deliveryPlan[vanId] = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
                }
                if (!deliveryPlan[vanId][dayId]) {
                    deliveryPlan[vanId][dayId] = [];
                }
                
                // STEP 3: Add to new assignment
                deliveryPlan[vanId][dayId].push(customer.id);
                
                // STEP 4: Update customer object
                customer.assignedVan = vanId;
                customer.assignedDay = dayId;
                
                // STEP 5: Recalculate zone if it was collection
                if (customer.zone === 'Collection') {
                    customer.zone = determineZone(customer.lat, customer.lng);
                }
                
                assignedCount++;
                assignmentDetails.push({
                    customer: customer.name,
                    van: VANS.find(v => v.id === vanId)?.name || `Van ${vanId}`,
                    day: DAYS.find(d => d.id === dayId)?.name || `Day ${dayId}`
                });
                
            } catch (error) {
                console.error('Error assigning customer:', error);
                failedCount++;
            }
        });
    });
    
    // STEP 6: Save all changes
    saveData();
    
    // STEP 7: Update displays
    updateMapMarkers();
    updateAllDisplays();
    
    // STEP 8: Show the route for the first assigned van/day
    if (assignmentDetails.length > 0) {
        const first = assignmentDetails[0];
        const vanId = VANS.find(v => v.name === first.van)?.id || 1;
        const dayId = DAYS.find(d => d.name === first.day)?.id || 1;
        showVanDayRoute(vanId, dayId);
    }
    
    // STEP 9: Show result notification
    if (failedCount > 0) {
        showNotification(`✅ Assigned ${assignedCount} orders, ❌ ${failedCount} failed`, 'warning');
    } else {
        showNotification(`✅ Successfully assigned ${assignedCount} orders across ${selectedGroups.length} groups`, 'success');
        console.log('Assignment details:', assignmentDetails);
    }
    
    // STEP 10: Return to selection view
    pageBackToSelection();
}

// Find best day for van (page version) — only considers active delivery days
function findPageBestDayForVan(vanId) {
    // Restrict to admin-configured active days
    const activeDayIds = getActiveDays();
    const activeDayObjects = DAYS.filter(function(d) { return activeDayIds.includes(d.id); });

    if (activeDayObjects.length === 0) {
        console.warn('[grouping] No active days configured — falling back to day 1');
        return 1;
    }

    // Calculate current load for each active day
    const dayLoads = activeDayObjects.map(function(day) {
        const currentStops = (deliveryPlan[vanId] && deliveryPlan[vanId][day.id]) ? deliveryPlan[vanId][day.id].length : 0;
        const currentPlants = ((deliveryPlan[vanId] && deliveryPlan[vanId][day.id]) ? deliveryPlan[vanId][day.id] : [])
            .map(function(id) { return customers.find(function(c) { return c.id === id; }); })
            .filter(function(c) { return !!c; })
            .reduce(function(sum, c) { return sum + (parseInt(c.passport && c.passport.numberOfPlants) || 0); }, 0);
        
        const vanMaxPlants = (VAN_CAPACITY[vanId] && VAN_CAPACITY[vanId].maxPlants) ? VAN_CAPACITY[vanId].maxPlants : 500;
        const capacityPercentage = vanMaxPlants > 0 ? currentPlants / vanMaxPlants : 0;
        
        const score = (currentStops * 0.6) + (capacityPercentage * 0.4);
        
        return { day: day.id, dayName: day.name, stops: currentStops, score: score };
    });
    
    dayLoads.sort(function(a, b) { return a.score - b.score; });
    
    console.log('[grouping] Best day for van', vanId, ':', dayLoads[0].dayName, '(active days:', activeDayIds.join(',') + ')');
    return dayLoads[0].day;
}

// Update group selection
function updatePageGroupSelection() {
    const checkboxes = document.querySelectorAll('#pageGroupingSuggestions .group-checkbox');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    document.getElementById('pageApplyGroupsBtn').disabled = checkedCount === 0;
}

function refreshPageChallenges() {
    const grid = document.getElementById('pageChallengesGrid');
    if (!grid) return;
    
    // Safely calculate standings with error handling
    let speedStandings = [];
    let volumeStandings = [];
    let plantsStandings = [];
    let qualityStandings = [];
    let distanceStandings = [];
    
    try {
        speedStandings = calculateChallengeStandings('TEAM_SPEED') || [];
    } catch(e) { console.error('Error calculating speed standings:', e); }
    
    try {
        volumeStandings = calculateChallengeStandings('TEAM_VOLUME') || [];
    } catch(e) { console.error('Error calculating volume standings:', e); }
    
    try {
        plantsStandings = calculateChallengeStandings('TEAM_PLANTS') || [];
    } catch(e) { console.error('Error calculating plants standings:', e); }
    
    try {
        qualityStandings = calculateChallengeStandings('TEAM_QUALITY') || [];
    } catch(e) { console.error('Error calculating quality standings:', e); }
    
    try {
        distanceStandings = calculateChallengeStandings('DRIVER_DISTANCE') || [];
    } catch(e) { console.error('Error calculating distance standings:', e); }
    
    grid.innerHTML = `
        <div class="challenge-card">
            <div class="challenge-header" style="background: #f59e0b;">
                <i class="fas fa-gauge-high"></i>
                <h4>Team Speed Challenge</h4>
                <span class="challenge-badge">Weekly</span>
            </div>
            <div class="challenge-body">
                <p>Team with fastest average picking time</p>
                <div class="challenge-standings">
                    ${speedStandings.length > 0 ? speedStandings.map((team, i) => `
                        <div class="standing-item">
                            <span class="standing-rank">${i+1}</span>
                            <span class="standing-team">${team.vanName || 'Unknown'}</span>
                            <span class="standing-value">${team.value || 0} min</span>
                        </div>
                    `).join('') : '<div class="standing-item">No data available</div>'}
                </div>
            </div>
        </div>
        
        <div class="challenge-card">
            <div class="challenge-header" style="background: #10b981;">
                <i class="fas fa-boxes"></i>
                <h4>Team Volume Challenge</h4>
                <span class="challenge-badge">Weekly</span>
            </div>
            <div class="challenge-body">
                <p>Team with most orders picked</p>
                <div class="challenge-standings">
                    ${volumeStandings.length > 0 ? volumeStandings.map((team, i) => `
                        <div class="standing-item">
                            <span class="standing-rank">${i+1}</span>
                            <span class="standing-team">${team.vanName || 'Unknown'}</span>
                            <span class="standing-value">${team.value || 0} orders</span>
                        </div>
                    `).join('') : '<div class="standing-item">No data available</div>'}
                </div>
            </div>
        </div>
        
        <div class="challenge-card">
            <div class="challenge-header" style="background: #16a34a;">
                <i class="fas fa-seedling"></i>
                <h4>Team Plants Challenge</h4>
                <span class="challenge-badge">Weekly</span>
            </div>
            <div class="challenge-body">
                <p>Team with most plants picked</p>
                <div class="challenge-standings">
                    ${plantsStandings.length > 0 ? plantsStandings.map((team, i) => `
                        <div class="standing-item">
                            <span class="standing-rank">${i+1}</span>
                            <span class="standing-team">${team.vanName || 'Unknown'}</span>
                            <span class="standing-value">${team.value || 0} plants</span>
                        </div>
                    `).join('') : '<div class="standing-item">No data available</div>'}
                </div>
            </div>
        </div>
        
        <div class="challenge-card">
            <div class="challenge-header" style="background: #8b5cf6;">
                <i class="fas fa-medal"></i>
                <h4>Team Quality Challenge</h4>
                <span class="challenge-badge">Weekly</span>
            </div>
            <div class="challenge-body">
                <p>Team with highest quality score</p>
                <div class="challenge-standings">
                    ${qualityStandings.length > 0 ? qualityStandings.map((team, i) => `
                        <div class="standing-item">
                            <span class="standing-rank">${i+1}</span>
                            <span class="standing-team">${team.vanName || 'Unknown'}</span>
                            <span class="standing-value">${team.value || 0}%</span>
                        </div>
                    `).join('') : '<div class="standing-item">No data available</div>'}
                </div>
            </div>
        </div>
        
        <div class="challenge-card">
            <div class="challenge-header" style="background: #3b82f6;">
                <i class="fas fa-tachometer-alt"></i>
                <h4>Driver Distance Challenge</h4>
                <span class="challenge-badge">Monthly</span>
            </div>
            <div class="challenge-body">
                <p>Driver with most kilometers</p>
                <div class="challenge-standings">
                    ${distanceStandings.length > 0 ? distanceStandings.map((team, i) => `
                        <div class="standing-item">
                            <span class="standing-rank">${i+1}</span>
                            <span class="standing-team">${team.vanName || 'Unknown'}</span>
                            <span class="standing-value">${team.value || 0} km</span>
                        </div>
                    `).join('') : '<div class="standing-item">No data available</div>'}
                </div>
            </div>
        </div>
    `;
}


// ========== SMART GROUPING SYSTEM ==========

// Van capacity configuration (in plants)
var VAN_CAPACITY = {
    1: { // GK (Blue)
        maxPlants: 500,
        maxStops: 15,
        maxDistance: 200, // km per route
        preferredZones: ['North West', 'Local'],
        efficiency: 1.0
    },
    2: { // HF (Red)
        maxPlants: 450,
        maxStops: 12,
        maxDistance: 180,
        preferredZones: ['South West', 'Local'],
        efficiency: 0.95
    },
    3: { // LG (Green)
        maxPlants: 550,
        maxStops: 18,
        maxDistance: 220,
        preferredZones: ['London/North East', 'South East', 'Local'],
        efficiency: 1.05
    }
};

// Grouping strategies
const GROUPING_STRATEGIES = {
    PROXIMITY: 'proximity',      // Group by geographic closeness
    CAPACITY: 'capacity',         // Optimize van capacity usage
    ZONE: 'zone',                 // Group by delivery zone
    MIXED: 'mixed',               // Mixed strategy (balanced)
    EFFICIENCY: 'efficiency'      // Maximize efficiency score
};

// Customer proximity threshold (in km)
var PROXIMITY_THRESHOLD = 15; // Customers within 15km are considered "close"

// ========== SMART GROUPING FUNCTIONS ==========

// Calculate distance between two customers
function calculateCustomerDistance(customer1, customer2) {
    return calculateStraightDistance(
        customer1.lat, customer1.lng,
        customer2.lat, customer2.lng
    );
}

// Calculate total plants for a group of customers
function calculateGroupPlants(customers) {
    return customers.reduce((sum, c) => {
        return sum + (parseInt(c.passport?.numberOfPlants) || 0);
    }, 0);
}

// Calculate group center (centroid)
function calculateGroupCenter(customers) {
    if (customers.length === 0) return null;
    
    const sumLat = customers.reduce((sum, c) => sum + c.lat, 0);
    const sumLng = customers.reduce((sum, c) => sum + c.lng, 0);
    
    return {
        lat: sumLat / customers.length,
        lng: sumLng / customers.length
    };
}

// Calculate group compactness score (lower is better)
function calculateGroupCompactness(customers) {
    if (customers.length < 2) return 0;
    
    const center = calculateGroupCenter(customers);
    if (!center) return Infinity;
    
    const distances = customers.map(c => 
        calculateStraightDistance(center.lat, center.lng, c.lat, c.lng)
    );
    
    const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
    const maxDistance = Math.max(...distances);
    
    // Compactness score: lower average distance and lower max distance = better
    return (avgDistance * 0.6) + (maxDistance * 0.4);
}

// Calculate group efficiency score
function calculateGroupEfficiency(customers, vanId) {
    if (customers.length === 0) return 0;
    
    const totalPlants = calculateGroupPlants(customers);
    const vanCapacity = VAN_CAPACITY[vanId]?.maxPlants || 500;
    
    // Capacity utilization (ideal: 70-90%)
    const utilization = totalPlants / vanCapacity;
    const utilizationScore = utilization > 0.9 ? 60 : 
                            utilization > 0.7 ? 100 : 
                            utilization > 0.5 ? 80 : 50;
    
    // Compactness score
    const compactness = calculateGroupCompactness(customers);
    const compactnessScore = compactness < 10 ? 100 :
                            compactness < 20 ? 80 :
                            compactness < 30 ? 60 : 40;
    
    // Zone match score
    const vanPreferredZones = VAN_CAPACITY[vanId]?.preferredZones || [];
    const zoneMatchCount = customers.filter(c => 
        vanPreferredZones.includes(c.zone)
    ).length;
    const zoneScore = (zoneMatchCount / customers.length) * 100;
    
    // Weighted average
    return Math.round(
        (utilizationScore * 0.4) +
        (compactnessScore * 0.4) +
        (zoneScore * 0.2)
    );
}

// Find optimal van for customer group
function findOptimalVanForGroup(customers) {
    const totalPlants = calculateGroupPlants(customers);
    
    let bestVan = null;
    let bestScore = -1;
    
    VANS.forEach(van => {
        const vanConfig = VAN_CAPACITY[van.id];
        if (!vanConfig) return;
        
        // Check capacity
        if (totalPlants > vanConfig.maxPlants) return;
        
        // Calculate zone match
        const zoneMatch = customers.filter(c => 
            vanConfig.preferredZones.includes(c.zone)
        ).length / customers.length;
        
        // Calculate efficiency score
        const efficiency = calculateGroupEfficiency(customers, van.id);
        
        // Combine scores
        const totalScore = (zoneMatch * 30) + (efficiency * 0.7);
        
        if (totalScore > bestScore) {
            bestScore = totalScore;
            bestVan = van.id;
        }
    });
    
    return bestVan;
}

// Generate smart grouping suggestions
function generateSmartGroupings(strategy = GROUPING_STRATEGIES.MIXED, customersToGroup = null) {
    const customersToUse = customersToGroup || customers.filter(c => !c.assignedVan && c.zone !== 'Collection');
    
    if (customersToUse.length === 0) {
        showNotification('No unassigned customers to group', 'info');
        return [];
    }
    
    let groups = [];
    
    switch(strategy) {
        case GROUPING_STRATEGIES.PROXIMITY:
            groups = groupByProximity(customersToUse);
            break;
        case GROUPING_STRATEGIES.CAPACITY:
            groups = groupByCapacity(customersToUse);
            break;
        case GROUPING_STRATEGIES.ZONE:
            groups = groupByZone(customersToUse);
            break;
        case GROUPING_STRATEGIES.EFFICIENCY:
            groups = groupByEfficiency(customersToUse);
            break;
        case GROUPING_STRATEGIES.MIXED:
        default:
            groups = groupByMixed(customersToUse);
            break;
    }
    
    // Calculate efficiency scores for each group
    groups = groups.map(group => {
        const suggestedVan = findOptimalVanForGroup(group.customers);
        const efficiency = calculateGroupEfficiency(group.customers, suggestedVan || 1);
        const center = calculateGroupCenter(group.customers);
        
        return {
            ...group,
            suggestedVan,
            efficiency,
            center,
            totalPlants: calculateGroupPlants(group.customers),
            compactness: calculateGroupCompactness(group.customers)
        };
    });
    
    smartGroupingSuggestions = groups;
    return groups;
}

// Group by proximity (nearest neighbors)
function groupByProximity(customers, maxGroupSize = 10) {
    const groups = [];
    const ungrouped = [...customers];
    
    while (ungrouped.length > 0) {
        const start = ungrouped[0];
        const group = [start];
        ungrouped.splice(0, 1);
        
        // Find nearest neighbors
        while (group.length < maxGroupSize) {
            const lastCustomer = group[group.length - 1];
            
            // Find closest ungrouped customer
            let closestIndex = -1;
            let closestDistance = Infinity;
            
            ungrouped.forEach((c, index) => {
                const dist = calculateCustomerDistance(lastCustomer, c);
                if (dist < closestDistance) {
                    closestDistance = dist;
                    closestIndex = index;
                }
            });
            
            // Stop if no close customers or distance too large
            if (closestIndex === -1 || closestDistance > PROXIMITY_THRESHOLD * 2) {
                break;
            }
            
            group.push(ungrouped[closestIndex]);
            ungrouped.splice(closestIndex, 1);
        }
        
        groups.push({
            customers: group,
            strategy: 'proximity',
            description: `${group.length} stops, max spacing ${Math.round(calculateGroupCompactness(group))}km`
        });
    }
    
    return groups;
}

// Group by van capacity
function groupByCapacity(customers) {
    const groups = [];
    const sorted = [...customers].sort((a, b) => {
        const plantsA = parseInt(a.passport?.numberOfPlants) || 0;
        const plantsB = parseInt(b.passport?.numberOfPlants) || 0;
        return plantsB - plantsA; // Largest orders first
    });
    
    VANS.forEach(van => {
        const vanConfig = VAN_CAPACITY[van.id];
        // Skip vans that have no capacity config — this can happen briefly if
        // a van was just added or VAN_CAPACITY hasn't been synced yet.
        if (!vanConfig) {
            console.warn('[groupByCapacity] No VAN_CAPACITY entry for van', van.id, '— skipping');
            return;
        }
        let currentGroup = [];
        let currentPlants = 0;
        
        for (let i = 0; i < sorted.length; i++) {
            const customer = sorted[i];
            if (!customer) continue;
            
            const plantCount = parseInt(customer.passport?.numberOfPlants) || 0;
            
            if (currentPlants + plantCount <= vanConfig.maxPlants) {
                currentGroup.push(customer);
                currentPlants += plantCount;
                sorted[i] = null; // Mark as used
            }
        }
        
        if (currentGroup.length > 0) {
            groups.push({
                customers: currentGroup,
                suggestedVan: van.id,
                strategy: 'capacity',
                description: `${currentGroup.length} stops, ${currentPlants}/${vanConfig.maxPlants} plants`
            });
        }
    });
    
    // Add remaining customers as mixed groups
    const remaining = sorted.filter(c => c !== null);
    if (remaining.length > 0) {
        groups.push({
            customers: remaining,
            strategy: 'remaining',
            description: `${remaining.length} remaining stops`
        });
    }
    
    return groups;
}

// Group by zone
function groupByZone(customers) {
    const groups = [];
    const zoneMap = {};
    
    // Group by zone
    customers.forEach(customer => {
        if (!zoneMap[customer.zone]) {
            zoneMap[customer.zone] = [];
        }
        zoneMap[customer.zone].push(customer);
    });
    
    // Create groups for each zone
    Object.entries(zoneMap).forEach(([zone, zoneCustomers]) => {
        // Split large zones into multiple groups if needed
        const maxGroupSize = 12;
        for (let i = 0; i < zoneCustomers.length; i += maxGroupSize) {
            const group = zoneCustomers.slice(i, i + maxGroupSize);
            groups.push({
                customers: group,
                zone,
                strategy: 'zone',
                description: `${zone}: ${group.length} stops`
            });
        }
    });
    
    return groups;
}

// Group by efficiency (balance all factors)
function groupByEfficiency(customers) {
    // Start with proximity groups
    const proximityGroups = groupByProximity(customers, 8);
    
    // Optimize each group for efficiency
    return proximityGroups.map(group => {
        const optimized = optimizeGroup(group.customers);
        
        return {
            customers: optimized,
            strategy: 'efficiency',
            description: `${optimized.length} stops, optimized route`
        };
    });
}

// Mixed strategy (best of all)
function groupByMixed(customers) {
    const allGroups = [
        ...groupByProximity(customers, 5).map(g => ({ ...g, score: 0 })),
        ...groupByCapacity(customers).map(g => ({ ...g, score: 0 })),
        ...groupByZone(customers).map(g => ({ ...g, score: 0 }))
    ];
    
    // Score each group
    allGroups.forEach(group => {
        const totalPlants = calculateGroupPlants(group.customers);
        const compactness = calculateGroupCompactness(group.customers);
        
        group.score = (
            (group.customers.length * 10) +
            (totalPlants > 200 ? 30 : 20) -
            (compactness * 2)
        );
    });
    
    // Sort by score and remove duplicates
    const uniqueGroups = [];
    const seenCustomers = new Set();
    
    allGroups
        .sort((a, b) => b.score - a.score)
        .forEach(group => {
            const newCustomers = group.customers.filter(c => !seenCustomers.has(c.id));
            if (newCustomers.length > 0) {
                uniqueGroups.push({
                    customers: newCustomers,
                    strategy: group.strategy,
                    description: group.description
                });
                newCustomers.forEach(c => seenCustomers.add(c.id));
            }
        });
    
    return uniqueGroups;
}

// Optimize a group for best route order
function optimizeGroup(customers) {
    if (customers.length < 2) return customers;
    
    // Simple nearest neighbor optimization
    const optimized = [];
    let remaining = [...customers];
    let current = remaining[0];
    
    optimized.push(current);
    remaining = remaining.filter(c => c.id !== current.id);
    
    while (remaining.length > 0) {
        let nextIndex = 0;
        let minDistance = Infinity;
        
        remaining.forEach((c, index) => {
            const dist = calculateCustomerDistance(current, c);
            if (dist < minDistance) {
                minDistance = dist;
                nextIndex = index;
            }
        });
        
        current = remaining[nextIndex];
        optimized.push(current);
        remaining = remaining.filter(c => c.id !== current.id);
    }
    
    return optimized;
}

// Calculate potential fuel savings for a group
// Uses roadDistanceFromSite (warmed from Valhalla) for warehouse↔customer legs
// Uses straight-line for customer↔customer (acceptable for grouping estimates)
function calculateGroupFuelSavings(group) {
    if (group.customers.length < 2) return 0;
    
    // Separate delivery cost: each customer gets their own round trip from warehouse
    // roadDistanceFromSite is populated with real Valhalla data on startup
    let separateDistance = 0;
    group.customers.forEach(c => {
        separateDistance += (c.roadDistanceFromSite || getRoadDistanceDuration(
            YOUR_SITE.lat, YOUR_SITE.lng, c.lat, c.lng
        ).distance) * 2;
    });
    
    // Grouped route distance using cached real distances
    const groupedDistance = calculateRouteDistance(group.customers);
    
    const savings = separateDistance - groupedDistance;
    const fuelCost = savings * COST_CONFIG.fuelCostPerKm;
    
    return {
        distance: Math.round(savings * 10) / 10,
        fuel: Math.round(fuelCost * 100) / 100
    };
}

// Calculate total route distance for a group
// Uses roadDistanceFromSite (real Valhalla) for warehouse legs,
// haversine cache for customer↔customer legs (fast, good enough for grouping)
function calculateRouteDistance(customers) {
    if (customers.length === 0) return 0;
    
    let distance = 0;
    
    // Warehouse to first — use real cached distance if available
    const firstCached = customers[0].roadDistanceFromSite;
    distance += firstCached || getRoadDistanceDuration(
        YOUR_SITE.lat, YOUR_SITE.lng,
        customers[0].lat, customers[0].lng
    ).distance;
    
    // Between customers — haversine cache (acceptable for route comparison)
    for (let i = 0; i < customers.length - 1; i++) {
        distance += getRoadDistanceDuration(
            customers[i].lat, customers[i].lng,
            customers[i + 1].lat, customers[i + 1].lng
        ).distance;
    }
    
    // Last back to warehouse — use real cached distance if available
    const lastCustomer = customers[customers.length - 1];
    const lastCached = lastCustomer.roadDistanceFromSite;
    distance += lastCached || getRoadDistanceDuration(
        lastCustomer.lat, lastCustomer.lng,
        YOUR_SITE.lat, YOUR_SITE.lng
    ).distance;

    return distance;
}

// ========== PEP ROUTE OPTIMISATION STRATEGY ==========
// Rules from PEP delivery guidelines:
//   Large van (capacity >= 17 trolleys): max 17 trolleys, 5 drops normal / 6 if all local,
//     5.0 hrs drive normal / 5.5 hrs early start. 54 mph speed-limited (12% time penalty on legs > 30 km).
//   Small van (capacity <= 7 trolleys): max 6 trolleys (7 if heavy load flag not set),
//     5 drops normal / 6 if all local, 5.5 hrs drive normal / 6.5 hrs early start. Multi-run capable.

// Returns the PEP profile for a van based on its trolley capacity
function _pepProfile(van) {
    const cap = van.capacity || 0;
    // Read configured max speed from VAN_CAPACITY (set in Settings → Vans)
    const configuredMph = (typeof VAN_CAPACITY !== 'undefined' && VAN_CAPACITY[van.id] && VAN_CAPACITY[van.id].maxSpeedMph)
        ? parseFloat(VAN_CAPACITY[van.id].maxSpeedMph) : 0;
    const maxSpeedKmh = configuredMph > 0 ? configuredMph * 1.60934 : 0;

    if (cap >= 17) {
        return {
            type:              'large',
            maxTrolleys:       17,
            maxDropsNormal:    5,
            maxDropsAllLocal:  6,
            driveHrsNormal:    5.0,
            driveHrsEarly:     5.5,
            maxSpeedKmh,               // from Settings; 0 = no limit
            multiRun:          false
        };
    }
    return {
        type:              'small',
        maxTrolleys:       6,
        maxDropsNormal:    5,
        maxDropsAllLocal:  6,
        driveHrsNormal:    5.5,
        driveHrsEarly:     6.5,
        maxSpeedKmh,                   // from Settings; 0 = no limit
        multiRun:          true
    };
}

// Is a customer "local"? Uses localZoneRadius from companyConfig (Settings → Warehouse)
function _pepIsLocal(customer) {
    const radiusKm = (typeof companyConfig !== 'undefined' && companyConfig && companyConfig.localZoneRadius)
        ? parseFloat(companyConfig.localZoneRadius)
        : 20;
    const distKm = customer.roadDistanceFromSite
        || calculateStraightDistance(YOUR_SITE.lat, YOUR_SITE.lng, customer.lat, customer.lng);
    return distKm <= radiusKm;
}

// Estimate drive time (hours) for a route: depot → stops → depot
// Uses van's configured maxSpeedMph (from Settings) for speed-limited vans
function _pepEstimateDriveHours(stops, profile) {
    if (stops.length === 0) return 0;
    const AVG_SPEED_KMH = 80;    // Google Maps average assumption (no limit)
    const LONG_LEG_KM   = 30;    // only apply speed limit on longer legs
    const stopTimeHrs   = (typeof STOP_TIME_PER_DELIVERY !== 'undefined' ? STOP_TIME_PER_DELIVERY : 15) / 60;

    // Convert configured mph to km/h; 0 means no limit
    const limitKmh = profile.maxSpeedKmh || 0;

    function legTime(distKm) {
        if (limitKmh > 0 && distKm > LONG_LEG_KM) {
            return distKm / limitKmh;
        }
        return distKm / AVG_SPEED_KMH;
    }

    // Depot → first stop
    const firstDist = stops[0].roadDistanceFromSite
        || calculateStraightDistance(YOUR_SITE.lat, YOUR_SITE.lng, stops[0].lat, stops[0].lng);
    let totalHrs = legTime(firstDist);

    // Stop-to-stop
    for (let i = 0; i < stops.length - 1; i++) {
        const d = getRoadDistanceDuration(stops[i].lat, stops[i].lng, stops[i+1].lat, stops[i+1].lng).distance;
        totalHrs += legTime(d);
    }

    // Last stop → depot
    const last = stops[stops.length - 1];
    const lastDist = last.roadDistanceFromSite
        || calculateStraightDistance(last.lat, last.lng, YOUR_SITE.lat, YOUR_SITE.lng);
    totalHrs += legTime(lastDist);

    // Add stop time
    totalHrs += stops.length * stopTimeHrs;

    return totalHrs;
}

// Whether any stop in a list has the heavy load passport flag set
function _pepHasHeavyLoad(stops) {
    return stops.some(c => c.passport && c.passport.heavyLoad);
}

// Build a single run for one van, consuming from the `remaining` array (mutates it)
function _pepBuildRun(van, profile, remaining, earlyStart) {
    const maxHrs      = earlyStart ? profile.driveHrsEarly : profile.driveHrsNormal;
    // Small van: allow 7 trolleys if no heavy load in current selection (checked after building)
    const baseTrolley = profile.maxTrolleys;

    // Sort remaining by distance from depot (long-haul first — fill those slots before local)
    const sorted = [...remaining].sort((a, b) => {
        const da = a.roadDistanceFromSite || calculateStraightDistance(YOUR_SITE.lat, YOUR_SITE.lng, a.lat, a.lng);
        const db = b.roadDistanceFromSite || calculateStraightDistance(YOUR_SITE.lat, YOUR_SITE.lng, b.lat, b.lng);
        return db - da;
    });

    const run       = [];
    let trolleys    = 0;
    const usedIds   = new Set();

    for (const customer of sorted) {
        const cTrolleys = getTotalTrolleyCount(customer);

        // Trolley check — for small van, allow +1 if no heavy load yet
        const effectiveMax = (profile.type === 'small' && !_pepHasHeavyLoad(run))
            ? baseTrolley + 1
            : baseTrolley;
        if (trolleys + cTrolleys > effectiveMax) continue;

        // Stops check (tentative — check with this customer added)
        const candidate = [...run, customer];

        // All-local check: if every stop so far + this one is local → allow +1 drop
        const allLocal    = candidate.every(_pepIsLocal);
        const maxDrops    = allLocal ? profile.maxDropsAllLocal : profile.maxDropsNormal;
        if (candidate.length > maxDrops) continue;

        // Drive time check — sort candidate by nearest-neighbour for a realistic estimate
        const ordered    = optimizeGroup(candidate);
        const driveHrs   = _pepEstimateDriveHours(ordered, profile);
        if (driveHrs > maxHrs) continue;

        run.push(customer);
        trolleys += cTrolleys;
        usedIds.add(customer.id);
    }

    // Remove assigned from remaining
    for (let i = remaining.length - 1; i >= 0; i--) {
        if (usedIds.has(remaining[i].id)) remaining.splice(i, 1);
    }

    return run;
}

// Main PEP grouping function
function groupByPEP(customers) {
    const earlyStart = document.getElementById('pepEarlyStart')?.checked || false;
    const groups     = [];
    const remaining  = customers.filter(c => c.lat && c.lng);  // must have coords

    // Process vans in trolley-capacity order (largest first — fill big van before small)
    const sortedVans = [...VANS].sort((a, b) => (b.capacity || 0) - (a.capacity || 0));

    sortedVans.forEach(van => {
        const profile = _pepProfile(van);

        // First run
        const run1 = _pepBuildRun(van, profile, remaining, earlyStart);
        if (run1.length > 0) {
            const ordered      = optimizeGroup(run1);
            const driveHrs     = _pepEstimateDriveHours(ordered, profile);
            const allLocal     = run1.every(_pepIsLocal);
            const maxHrs       = earlyStart ? profile.driveHrsEarly : profile.driveHrsNormal;
            const consultWarn  = driveHrs > maxHrs * 0.85 || run1.some(c => !_pepIsLocal(c) && (c.roadDistanceFromSite || 0) > 80);
            const trolleyCount = run1.reduce((s, c) => s + getTotalTrolleyCount(c), 0);

            groups.push({
                customers:    ordered,
                suggestedVan: van.id,
                strategy:     'pep',
                driveHrs:     Math.round(driveHrs * 10) / 10,
                allLocal,
                earlyStart,
                consultWarn,
                runIndex:     1,
                totalPlants:  trolleyCount,
                efficiency:   calculateGroupEfficiency(ordered, van.id),
                compactness:  calculateGroupCompactness(ordered),
                description:  `${ordered.length} stops · ${trolleyCount} trolleys · ~${(driveHrs * 60).toFixed(0)} min drive` +
                              (allLocal ? ' · All local' : '') +
                              (earlyStart ? ' · Early start' : '') +
                              (consultWarn ? ' · ⚠️ Consult driver' : '')
            });
        }

        // Second run for small vans (multi-run capable) if stops remain
        if (profile.multiRun && remaining.length > 0) {
            const run2 = _pepBuildRun(van, profile, remaining, earlyStart);
            if (run2.length > 0) {
                const ordered2     = optimizeGroup(run2);
                const driveHrs2    = _pepEstimateDriveHours(ordered2, profile);
                const allLocal2    = run2.every(_pepIsLocal);
                const maxHrs2      = earlyStart ? profile.driveHrsEarly : profile.driveHrsNormal;
                const consultWarn2 = driveHrs2 > maxHrs2 * 0.85;
                const trolleys2    = run2.reduce((s, c) => s + getTotalTrolleyCount(c), 0);

                groups.push({
                    customers:    ordered2,
                    suggestedVan: van.id,
                    strategy:     'pep',
                    driveHrs:     Math.round(driveHrs2 * 10) / 10,
                    allLocal:     allLocal2,
                    earlyStart,
                    consultWarn:  consultWarn2,
                    runIndex:     2,
                    totalPlants:  trolleys2,
                    efficiency:   calculateGroupEfficiency(ordered2, van.id),
                    compactness:  calculateGroupCompactness(ordered2),
                    description:  `${ordered2.length} stops · ${trolleys2} trolleys · ~${(driveHrs2 * 60).toFixed(0)} min drive` +
                                  (allLocal2 ? ' · All local' : '') +
                                  ' · Run 2' +
                                  (consultWarn2 ? ' · ⚠️ Consult driver' : '')
                });
            }
        }
    });

    // Any stops still unassigned → dropped group
    if (remaining.length > 0) {
        groups.push({
            customers:    remaining,
            suggestedVan: null,
            strategy:     'unassigned',
            description:  `${remaining.length} stop(s) exceeded all van limits`,
            isDropped:    true,
            efficiency:   0,
            totalPlants:  remaining.reduce((s, c) => s + getTotalTrolleyCount(c), 0),
            compactness:  0
        });
    }

    return groups;
}

