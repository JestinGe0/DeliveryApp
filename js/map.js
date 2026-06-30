// Initialize map
var map = L.map('map', { zoomControl: false }).setView([54.5, -2.5], 6);
L.control.zoom({ position: 'topleft' }).addTo(map);

// No global bounds lock — region is controlled by Settings → Map View

currentMapLayer = L.tileLayer(mapStyles.streets, {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
}).addTo(map);

// ── Reliable map sizing ──────────────────────────────────────────
// 1. Invalidate once the DOM is fully painted
window.addEventListener('load', function () {
    map.invalidateSize();
});

// 2. ResizeObserver — fires whenever the #map container actually
//    changes dimensions (panel open/close, window resize, etc.)
(function () {
    var mapEl = document.getElementById('map');
    if (!mapEl || typeof ResizeObserver === 'undefined') return;
    var ro = new ResizeObserver(function () {
        map.invalidateSize();
    });
    ro.observe(mapEl);
})();

// 3. Belt-and-braces: staggered invalidations on startup to catch
//    any late-settling flex / transition layout passes
[100, 300, 600, 1000].forEach(function (ms) {
    setTimeout(function () { map.invalidateSize(); }, ms);
});

function changeMapStyle(style) {
    document.querySelectorAll('.layer-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    if (currentMapLayer) map.removeLayer(currentMapLayer);

    currentMapLayer = L.tileLayer(mapStyles[style], {
        attribution: '© Map data contributors',
        maxZoom: 19
    }).addTo(map);
}

// Programmatic version — used by Settings and applyCompanyConfig (no click event needed)
function applyMapStyle(style) {
    if (!mapStyles[style]) return;
    if (currentMapLayer) map.removeLayer(currentMapLayer);
    currentMapLayer = L.tileLayer(mapStyles[style], {
        attribution: '© Map data contributors',
        maxZoom: 19
    }).addTo(map);
    // Keep any on-screen layer buttons in sync
    document.querySelectorAll('.layer-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.style === style);
    });
}

L.control.scale({ imperial: false }).addTo(map);

let customers = [];
let markers        = L.layerGroup().addTo(map);
let deliveryMarkers = L.layerGroup().addTo(map);
let deliveryRoutes  = L.layerGroup().addTo(map);

let staffMembers = [];
let nextStaffId = 1;
let currentStaffFilter = 'all';

// Card expanded states storage
let cardExpandedStates = { currentOrders: {}, weeklyPlan: {} };
const CARD_STATES_KEY = 'PEP_card_states';


// ========== MAP FUNCTIONS ==========
// ── Local zone circle ──────────────────────────────────────────────────────
// Shows a faded green circle on the map indicating the local delivery zone radius.
// Redrawn whenever LOCAL_ZONE_RADIUS changes (via applyCompanyConfig).
var _localZoneCircle = null;
function drawLocalZoneCircle() {
    if (typeof map === 'undefined' || !map) return;
    var radius = (typeof LOCAL_ZONE_RADIUS !== 'undefined') ? LOCAL_ZONE_RADIUS : 20;
    // Remove existing circle
    if (_localZoneCircle) {
        map.removeLayer(_localZoneCircle);
        _localZoneCircle = null;
    }
    if (!radius || radius <= 0) return;
    _localZoneCircle = L.circle([YOUR_SITE.lat, YOUR_SITE.lng], {
        radius:      radius * 1000,  // km → metres
        color:       '#1302ff',      // green border
        fillColor:   '#22c55e',
        fillOpacity: 0.07,
        opacity:     0.35,
        weight:      4,
        dashArray:   '6 4',
        interactive: false           // don't intercept map clicks
    }).addTo(map);
    _localZoneCircle.bindTooltip(
        'Local zone: ' + radius + ' km radius',
        { permanent: false, direction: 'top', className: 'leaflet-tooltip-local' }
    );
    // Keep orders page label in sync
    updateLocalZoneLabel();
}
window.drawLocalZoneCircle = drawLocalZoneCircle;

// Update the "Local (within Xkm)" label in the orders page zone header
function updateLocalZoneLabel() {
    var radius = (typeof LOCAL_ZONE_RADIUS !== 'undefined') ? LOCAL_ZONE_RADIUS : 20;
    var el = document.getElementById('localZoneRadiusLabel');
    if (el) el.textContent = 'within ' + radius + 'km';
}
window.updateLocalZoneLabel = updateLocalZoneLabel;

function addWarehouseMarker() {
    const warehouseIcon = L.divIcon({
        className: 'warehouse-pin',
        html: `
            <div class="warehouse-pin-container">
                <div class="warehouse-pin-icon">
                    <svg width="32" height="42" viewBox="0 0 32 42" fill="none">
                        <path d="M16 0C7.16 0 0 7.16 0 16c0 9.84 16 26 16 26s16-16.16 16-26c0-8.84-7.16-16-16-16z"
                              fill="#fffb00" stroke="white" stroke-width="2"/>
                        <rect x="8" y="10" width="16" height="12" fill="white" stroke="#6f42c1" stroke-width="2"/>
                        <rect x="12" y="14" width="3" height="8" fill="#6f42c1"/>
                        <rect x="17" y="14" width="3" height="8" fill="#6f42c1"/>
                        <circle cx="16" cy="8" r="3" fill="white" stroke="#6f42c1" stroke-width="2"/>
                    </svg>
                </div>
                <div class="warehouse-pin-label">🏢</div>
            </div>`,
        iconSize: [32, 58], iconAnchor: [16, 58], popupAnchor: [0, -50]
    });

    const warehouseMarker = L.marker([YOUR_SITE.lat, YOUR_SITE.lng], {
        icon: warehouseIcon, title: YOUR_SITE.name, zIndexOffset: 1000
    }).addTo(markers);

    warehouseMarker.bindPopup(`
        <div style="max-width:250px;text-align:center;">
            <b style="color:#6f42c1;font-size:1.1em;">🏢 ${YOUR_SITE.name}</b><br>
            <small>${YOUR_SITE.address}</small>
            <hr style="margin:8px 0;">
            <p><i class="fas fa-map-pin"></i> Distribution Center</p>
            <p><i class="fas fa-truck"></i> All deliveries start from here</p>
        </div>`);

    // Draw the local zone radius circle (faded green)
    drawLocalZoneCircle();
}

function updateMapMarkers() {
    markers.clearLayers();
    deliveryMarkers.clearLayers();
    addWarehouseMarker();

    // Only show customers for the currently selected van + day
    customers.filter(c => c.assignedVan === currentVan && c.assignedDay === currentDay).forEach(customer => {
        const van = VANS.find(v => v.id === customer.assignedVan);
        if (!van) return;
        const color = van.color;
        const customerIcon = L.divIcon({
            className: 'customer-pin',
            html: `
                <div class="customer-pin-container">
                    <div class="customer-pin-icon">
                        <svg width="24" height="34" viewBox="0 0 24 34" fill="${color}">
                            <path d="M12 0C5.373 0 0 5.373 0 12c0 7.596 12 22 12 22s12-14.404 12-22c0-6.627-5.373-12-12-12z"/>
                            <circle cx="12" cy="10" r="4" fill="white"/>
                        </svg>
                    </div>
                    <div class="customer-pin-label">${customer.name.substring(0,12)}${customer.name.length>12?'...':''}</div>
                </div>`,
            iconSize: [24, 46], iconAnchor: [12, 46], popupAnchor: [0, -40]
        });

        const staffList = (customer.assignedStaff || []).map(id => staffMembers.find(s => s.id === id)).filter(Boolean);
        const driver    = customer.assignedDriver ? staffMembers.find(s => s.id === customer.assignedDriver) : null;

        L.marker([customer.lat, customer.lng], { icon: customerIcon, title: customer.name })
         .addTo(markers)
         .bindPopup(`
            <div style="min-width:300px;font-size:14px;">
                <b style="font-size:16px;">${customer.name}</b><br><span style="font-size:13px;color:#555;">${customer.postcode||''}</span>
                <hr style="margin:6px 0;">
                <div style="line-height:1.8;"><b>Zone:</b> ${customer.zone}<br>
                <b>Distance:</b> ${customer.roadDistanceFromSite.toFixed(1)} km<br>
                <b>Time:</b> ${customer.roadDurationFromSite.toFixed(0)} min<br>
                <b>Status:</b> ${getStatusText(customer.status)}<br>
                ${staffList.length ? `<b>Pickers:</b> ${staffList.map(s=>s.name).join(', ')}<br>` : ''}
                ${driver ? `<b>Driver:</b> ${driver.name}<br>` : ''}</div>
                <hr style="margin:8px 0;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                    ${VANS.map(van => `
    <button onclick="assignToVanDay(${customer.id},${van.id},${currentDay})"
            style="background:${van.color};color:white;border:none;padding:8px 6px;border-radius:4px;cursor:pointer;font-size:13px;margin:0;">
        ${van.name}
    </button>`).join('')}
<div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; grid-column:1/-1;">
    <button onclick="openCollectionDaySelector(${customer.id})"
            style="background:${ZONES.Collection.color};color:white;border:none;padding:8px 6px;border-radius:4px;cursor:pointer;font-size:13px;flex:1;">
        📦 Collection
    </button>
</div>
                </div>
            </div>`, {maxWidth: 320});
    });
}
// ========== COLLECTION DAY SELECTOR ==========
function openCollectionDaySelector(customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    
    // Create a simple modal for day selection
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'collectionDayModal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:400px;">
            <div class="modal-header" style="background:${ZONES.Collection.color};">
                <h3><i class="fas fa-calendar-alt"></i> Select Collection Day</h3>
                <button class="close-btn" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <p><strong>${customer.name}</strong></p>
                <p>Current status: ${customer.assignedDay ? `Scheduled for ${getDayName(customer.assignedDay)}` : 'Unscheduled'}</p>
                <p>Choose a day for this collection order:</p>
                <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin:20px 0;">
                    ${DAYS.filter(day => { var ad = (typeof ACTIVE_DAYS !== 'undefined' && ACTIVE_DAYS.length) ? ACTIVE_DAYS : DAYS.map(d=>d.id); return ad.includes(day.id); }).map(day => `
                        <button onclick="assignCollectionDay(${customer.id}, ${day.id})" 
                                style="background:${ZONES.Collection.color}; color:white; border:none; padding:12px; border-radius:8px; cursor:pointer; font-weight:600; opacity:${customer.assignedDay === day.id ? '1' : '0.8'}; border:${customer.assignedDay === day.id ? '3px solid white' : 'none'};">
                            ${day.name} ${customer.assignedDay === day.id ? '✓' : ''}
                        </button>
                    `).join('')}
                </div>
                <button onclick="assignCollectionDay(${customer.id}, null)" 
                        style="background:#6b7280; color:white; border:none; padding:8px; border-radius:5px; cursor:pointer; width:100%; margin-bottom:10px;">
                    <i class="fas fa-times"></i> Unscheduled (No specific day)
                </button>
                <button onclick="document.getElementById('collectionDayModal').remove()" 
                        style="background:transparent; color:#666; border:1px solid #ddd; padding:8px; border-radius:5px; cursor:pointer; width:100%;">
                    Cancel
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function assignCollectionDay(customerId, dayId) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    
    // Update the assigned day
    customer.assignedDay = dayId;
    
    // Make sure it's marked as collection
    if (customer.zone !== 'Collection') {
        customer.zone = 'Collection';
        customer.assignedVan = null;
    }
    
    // Remove the modal
    const modal = document.getElementById('collectionDayModal');
    if (modal) modal.remove();
    
    // Update displays
    updateMapMarkers();
    updateAllDisplays();
    if (typeof updateCollectionStats === 'function') updateCollectionStats();
    saveData();
    
    const dayName = dayId ? getDayName(dayId) : 'unscheduled';
    showNotification(`Collection scheduled for ${dayName}`);
}


function updateGlobalCounters() {
    if (!customers.length) return;
    const totalAssigned = customers.filter(c => c.assignedVan).length;
    const activeRoutes  = VANS.reduce((t, van) => t + DAYS.filter(day => (deliveryPlan[van.id] && deliveryPlan[van.id][day.id] && deliveryPlan[van.id][day.id].length > 0)).length, 0);
    document.getElementById('totalCustomers').textContent    = customers.length;
    document.getElementById('assignedCustomers').textContent = totalAssigned;
    document.getElementById('activeRoutes').textContent      = activeRoutes;
    const coverageEl = document.getElementById('coverageArea');
    if (coverageEl) {
        const routeIds = deliveryPlan[currentVan]?.[currentDay] || [];
        const rc = routeIds.map(id => customers.find(c => c.id === id)).filter(Boolean);
        if (rc.length > 1) {
            const lats=rc.map(c=>parseFloat(c.lat)).filter(v=>!isNaN(v)), lngs=rc.map(c=>parseFloat(c.lng)).filter(v=>!isNaN(v));
            const h=(Math.max(...lats)-Math.min(...lats))*111, midLat=(Math.max(...lats)+Math.min(...lats))/2;
            const w=(Math.max(...lngs)-Math.min(...lngs))*111*Math.cos(midLat*Math.PI/180);
            const a=Math.round(h*w); coverageEl.textContent=(a>0?a.toLocaleString():'<1')+' km²';
        } else { coverageEl.textContent = rc.length===1 ? '<1 km²' : '— km²'; }
    }
}

// ========== VAN/DAY SELECTOR FUNCTIONS ==========
function updateVanDaySelector() {
    const vanSelector = document.getElementById('vanSelector');
    const daySelector = document.getElementById('daySelector');

    if (vanSelector) {
        vanSelector.innerHTML = VANS.map(van => {
            const totalStops = DAYS.reduce((s, d) => s + (deliveryPlan[van.id]?.[d.id]?.length || 0), 0);
            const isActive = currentVan === van.id;
            return `
                <button onclick="selectVan(${van.id})" class="van-btn ${isActive ? 'active' : ''}"
                        style="background:${van.color}; ${isActive ? 'border:3px solid white;' : ''}">
                    ${van.name}<br><small>${totalStops} stops</small>
                </button>`;
        }).join('');
    }

    if (daySelector) {
        // Get the current van's color
        const currentVanObj = VANS.find(v => v.id === currentVan);
        const vanColor = currentVanObj ? currentVanObj.color : '#007bff';
        const activeDayIds = typeof ACTIVE_DAYS !== 'undefined' ? ACTIVE_DAYS : DAYS.map(d => d.id);
        daySelector.innerHTML = DAYS.filter(day => activeDayIds.includes(day.id)).map(day => {
            const dayStops = deliveryPlan[currentVan]?.[day.id]?.length || 0;
            const isActive = currentDay === day.id;
            return `
                <button onclick="selectDay(${day.id})" class="day-btn ${isActive ? 'active' : ''}"
                        style="background:${vanColor}; ${isActive ? 'border:3px solid white;' : ''}">
                    ${day.short}<br><small>${dayStops} stops</small>
                </button>`;
        }).join('');
    }
}

// New function to select van
// ── Zoom-responsive marker label scaling ─────────────────────────────────
// Leaflet divIcons are fixed pixel size. We compensate by adjusting font-size
// of name/eta labels based on current zoom level when the map zooms.
function _updateMarkerLabelScale() {
    var zoom = map.getZoom();
    // Scale: zoom 8 = tiny (8px), zoom 12 = normal (11px), zoom 15+ = large (14px)
    var fontSize = Math.max(8, Math.min(14, Math.round(zoom * 0.9)));
    var etaSize  = Math.max(7, Math.min(11, Math.round(zoom * 0.75)));
    var style = document.getElementById('_markerLabelStyle');
    if (!style) {
        style = document.createElement('style');
        style.id = '_markerLabelStyle';
        document.head.appendChild(style);
    }
    style.textContent =
        '.delivery-marker .marker-name { font-size:' + fontSize + 'px !important; }' +
        '.delivery-marker .marker-eta  { font-size:' + etaSize  + 'px !important; }';
}

if (typeof map !== 'undefined') {
    map.on('zoomend', _updateMarkerLabelScale);
    _updateMarkerLabelScale();
}

function selectVan(vanId) {
    currentVan = vanId;
    // Keep the same day or default to Monday (1)
    if (!deliveryPlan[currentVan]?.[currentDay]) {
        currentDay = 1; // Default to Monday
    }
    updateVanDaySelector();
    showVanDayRoute(currentVan, currentDay);
    saveData();
}

// New function to select day
function selectDay(dayId) {
    currentDay = dayId;
    updateVanDaySelector();
    showVanDayRoute(currentVan, currentDay);
    saveData();
}


// ========== ROUTE OPTIMISATION ==========
// ── Route display settings ───────────────────────────────────────────────────
var ROUTE_DRIVER_STYLE = false;  // when true: solid line = driver assigned, dotted = no driver

// ── OR-Tools optimiser settings (overridden by Settings page / applyCompanyConfig) ──
var ORTOOLS_MAX_STOPS     = 15;
var ORTOOLS_MAX_DISTANCE  = 200;
var ORTOOLS_DROP_PENALTY  = 10000000;
var ORTOOLS_TIME_LIMIT    = 30;
var ORTOOLS_COST_FUNCTION = 'minimize_time';

async function optimizeCurrentRoute() {
    const assignments = deliveryPlan[currentVan][currentDay];
    if (assignments.length < 2) { alert('Need at least 2 stops to optimize route'); return; }

    const engine = window.OPTIMISER_ENGINE || 'valhalla';
    showNotification('Optimising route with ' + (engine === 'valhalla' ? 'Valhalla' : 'OR-Tools') + '...', 'info');

    if (engine === 'valhalla') {
        await _optimiseWithValhalla();
    } else {
        await _optimiseWithORTools();
    }
}

async function _optimiseWithValhalla() {
    const assignments = deliveryPlan[currentVan][currentDay];
    const stops = assignments.map(id => customers.find(c => c.id === id)).filter(Boolean);

    // Build location list: warehouse first, all stops, warehouse last
    const locations = [
        { lat: YOUR_SITE.lat, lon: YOUR_SITE.lng, type: 'break' },
        ...stops.map(c => ({ lat: c.lat, lon: c.lng, type: 'break' })),
        { lat: YOUR_SITE.lat, lon: YOUR_SITE.lng, type: 'break' }
    ];

    try {
        const res = await fetch(SERVER_URL + '/api/optimised-route-valhalla', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ locations, customerIds: assignments })
        });

        if (!res.ok) throw new Error('Valhalla optimised route failed: ' + res.status);

        const data = await res.json();
        if (data.optimisedOrder && data.optimisedOrder.length) {
            deliveryPlan[currentVan][currentDay] = data.optimisedOrder;
            data.optimisedOrder.forEach((id, idx) => {
                const c = customers.find(x => x.id === id);
                if (c) c.deliveryOrder = idx + 1;
            });
            await showVanDayRoute(currentVan, currentDay);
            saveData();
            showNotification('Route optimised with Valhalla (' + data.optimisedOrder.length + ' stops)', 'success');
        }
    } catch(err) {
        console.error('[Valhalla optimise]', err.message);
        showNotification('Valhalla optimisation failed — falling back to nearest-neighbour', 'warning');
        _optimiseNearestNeighbour();
    }
}

async function _optimiseWithORTools() {
    const assignments = deliveryPlan[currentVan][currentDay];
    const stops = assignments.map(id => {
        const c = customers.find(x => x.id === id);
        if (!c) return null;
        const trolleys = (typeof getTotalTrolleyCount === 'function') ? (getTotalTrolleyCount(c) || 0) : 0;
        return { id: c.id, lat: c.lat, lng: c.lng, name: c.name, trolleys };
    }).filter(Boolean);

    // Van config — trolley cap from van's capacity; stops/distance from OR-Tools globals
    const vanDef = (typeof VANS !== 'undefined' && VANS.find(v => v.id === currentVan)) || {};
    const vanCap = (typeof VAN_CAPACITY !== 'undefined' && VAN_CAPACITY[currentVan]) || {};
    const vans = [{
        id:          currentVan,
        maxTrolleys: vanDef.capacity || 17,
        maxStops:    ORTOOLS_MAX_STOPS,
        maxDistance: ORTOOLS_MAX_DISTANCE
    }];

    const options = {
        costFunction: ORTOOLS_COST_FUNCTION,
        dropPenalty:  ORTOOLS_DROP_PENALTY,
        timeLimit:    ORTOOLS_TIME_LIMIT
    };

    try {
        const res = await fetch(SERVER_URL + '/api/optimise-route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stops, vans, options, depot: { lat: YOUR_SITE.lat, lng: YOUR_SITE.lng } })
        });

        if (!res.ok) throw new Error('OR-Tools failed: ' + res.status);

        const data = await res.json();
        console.log('[OR-Tools] response:', JSON.stringify(data).substring(0, 300));

        // Python returns routes as an object keyed by van ID: { "1": [id, id, ...] }
        // or sometimes as { routes: { "1": [id,...] } } depending on version
        let ordered = null;
        if (data.success && data.routes) {
            // Try object key by currentVan first, then first key found
            const key = String(currentVan);
            const routeData = data.routes[key] || data.routes[Object.keys(data.routes)[0]];
            if (routeData) {
                // Could be array of IDs directly, or array of {id, ...} objects
                ordered = routeData.map(s => typeof s === 'object' ? s.id : s);
            }
        }

        if (ordered && ordered.length > 0) {
            deliveryPlan[currentVan][currentDay] = ordered;
            ordered.forEach((id, idx) => {
                const c = customers.find(x => x.id === id);
                if (c) c.deliveryOrder = idx + 1;
            });
            await showVanDayRoute(currentVan, currentDay);
            saveData();
            showNotification('Route optimised with OR-Tools (' + ordered.length + ' stops)', 'success');
        } else {
            console.warn('[OR-Tools] Full response:', data);
            throw new Error(data.error || data.message || 'No route returned from OR-Tools');
        }
    } catch(err) {
        console.error('[OR-Tools optimise]', err.message);
        showNotification('OR-Tools failed — falling back to nearest-neighbour. Is Python running?', 'warning');
        _optimiseNearestNeighbour();
    }
}

function _optimiseNearestNeighbour() {
    // Simple fallback: greedy nearest-neighbour
    const assignments = deliveryPlan[currentVan][currentDay];
    let unvisited = assignments.map(id => customers.find(c => c.id === id)).filter(Boolean);
    let optimized = [], cLat = YOUR_SITE.lat, cLng = YOUR_SITE.lng;
    while (unvisited.length) {
        let ni = 0, nc = unvisited[0], nd = calculateStraightDistance(cLat, cLng, nc.lat, nc.lng);
        for (let i = 1; i < unvisited.length; i++) {
            const d = calculateStraightDistance(cLat, cLng, unvisited[i].lat, unvisited[i].lng);
            if (d < nd) { nd = d; ni = i; nc = unvisited[i]; }
        }
        optimized.push(nc); cLat = nc.lat; cLng = nc.lng; unvisited.splice(ni, 1);
    }
    deliveryPlan[currentVan][currentDay] = optimized.map(c => c.id);
    showVanDayRoute(currentVan, currentDay); saveData();
    showNotification('Route ordered (nearest-neighbour fallback)', 'info');
}

async function autoAssignCustomers() {
    if (!customers.length) return;

    // Only distribute across admin-configured active delivery days
    const _activeDayIds = (typeof ACTIVE_DAYS !== 'undefined' && ACTIVE_DAYS.length) ? ACTIVE_DAYS : DAYS.map(function(x){return x.id;});
    const activeDayObjs = DAYS.filter(function(d) { return _activeDayIds.includes(d.id); });
    if (!activeDayObjs.length) {
        showNotification('No active delivery days configured — check Settings → Days', 'warning');
        return;
    }

    customers.forEach(function(c) { if (c.zone !== 'Collection') { c.assignedVan = null; c.assignedDay = null; } });
    deliveryPlan = emptyDeliveryPlan();
    const sorted = [...customers.filter(function(c){return c.zone !== 'Collection';})].sort(function(a,b){return a.roadDistanceFromSite - b.roadDistanceFromSite;});
    const slots   = VANS.length * activeDayObjs.length;
    const perSlot = Math.ceil(sorted.length / slots);
    let slotIdx = 0;
    sorted.forEach(function(customer) {
        const vIdx = Math.floor(slotIdx / activeDayObjs.length);
        const dIdx = slotIdx % activeDayObjs.length;
        if (vIdx < VANS.length) {
            const vanId = VANS[vIdx].id;
            const dayId = activeDayObjs[dIdx].id;
            customer.assignedVan = vanId;
            customer.assignedDay = dayId;
            deliveryPlan[vanId][dayId].push(customer.id);
            if (deliveryPlan[vanId][dayId].length >= perSlot) slotIdx++;
        }
    });
    _seedTestPassportData(sorted);
    // Persist seeded passport data (trolleyCount etc.) to the DB so it survives refresh
    sorted.forEach(function(c) { if (typeof quickSavePassport === 'function') quickSavePassport(c); });
    updateMapMarkers(); updateAllDisplays();
    await showVanDayRoute(currentVan, currentDay);
    saveData();
    showNotification('Auto-assigned ' + sorted.length + ' customers across ' + activeDayObjs.length + ' active day(s) with random test data');
}

function _seedTestPassportData(customerList) {
    var vanMax       = (typeof MAX_TROLLEYS_PER_RUN !== 'undefined') ? MAX_TROLLEYS_PER_RUN : 17;
    var bays         = (typeof BAY_COUNT !== 'undefined' && BAY_COUNT > 0) ? BAY_COUNT : 3;
    var staffIds     = (typeof staffMembers !== 'undefined' && staffMembers.length)
                         ? staffMembers.map(function(s) { return s.id; }) : [];
    var flowerStages = ['Bud', 'Half Open', 'Full Flower', 'Fading'];
    var potSizes     = ['9cm', '10.5cm', '12cm', '13cm', '15cm', '17cm', '19cm', '23cm'];
    var potColors    = ['Terracotta', 'Black', 'White', 'Green', 'Grey', 'Recycled'];
    var grades       = ['A1', 'A2', 'B1', 'B2'];
    var accountTypes = ['Trade', 'Retail', 'Wholesale', 'Online'];
    var payTerms     = ['30 Days', '14 Days', 'COD', 'Prepaid'];

    function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
    function pick(arr)     { return arr[Math.floor(Math.random() * arr.length)]; }
    function randBool()    { return Math.random() > 0.5; }

    customerList.forEach(function(customer) {
        // Trolley count: 1 to vanMax — a single order cannot exceed one van load
        var trolleys = rnd(1, vanMax);

        // Bay: must be a valid configured bay number
        var bay = String(rnd(1, bays));

        // Picker: 1 staff member; none assigned if no staff exist
        var staff = staffIds.length ? [pick(staffIds)] : [];

        // Only one of barcoded / pre-priced can be true (mutually exclusive in practice)
        var labelType = rnd(0, 2); // 0=none, 1=barcoded, 2=pre-priced
        var barcoded  = labelType === 1;
        var prePriced = labelType === 2;

        if (!customer.passport) customer.passport = {};
        Object.assign(customer.passport, {
            trolleyCount:    trolleys,
            barcodedLabels:  barcoded,
            prePricedLabels: prePriced,
            flowerStage:     pick(flowerStages),
            potSize:         pick(potSizes),
            potColor:        pick(potColors),
            qualityGrade:    pick(grades),
            accountType:     pick(accountTypes),
            paymentTerms:    pick(payTerms),
            numberOfPlants:  String(rnd(10, 200)),
            orders:          customer.passport.orders || []
        });

        // bayNumber lives on the customer object (used by bay diagram)
        customer.bayNumber     = bay;
        customer.assignedStaff = staff;
    });
}

function focusOnCustomer(customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    map.setView([customer.lat, customer.lng], 15);
    let found = false;
    markers.eachLayer(layer => { if (layer.getLatLng().lat===customer.lat && layer.getLatLng().lng===customer.lng) { layer.openPopup(); found=true; } });
    if (!found && typeof deliveryMarkers!=='undefined') { deliveryMarkers.eachLayer(layer => { if (layer.getLatLng&&layer.getLatLng().lat===customer.lat&&layer.getLatLng().lng===customer.lng) { layer.openPopup(); found=true; } }); }
    if (!found) {
        if (window._tempFocusMarker) { map.removeLayer(window._tempFocusMarker); window._tempFocusMarker=null; }
        const color=(ZONES[customer.zone]&&ZONES[customer.zone].color)?ZONES[customer.zone].color:'#8b5cf6';
        const pinIcon=L.divIcon({className:'',html:`<div style="width:36px;height:36px;background:${color};border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 3px 10px rgba(0,0,0,0.5);animation:pepPinPulse 0.9s ease-in-out infinite alternate;"></div><style>@keyframes pepPinPulse{from{transform:rotate(-45deg) scale(1);}to{transform:rotate(-45deg) scale(1.2);}}</style>`,iconSize:[36,48],iconAnchor:[18,48],popupAnchor:[0,-50]});
        window._tempFocusMarker=L.marker([customer.lat,customer.lng],{icon:pinIcon}).addTo(map).bindPopup(`<div style="min-width:190px;"><b>${customer.name}</b><br><small>${customer.address||''}</small><hr style="margin:5px 0;"><small><b>Zone:</b> ${customer.zone}</small></div>`).openPopup();
        setTimeout(()=>{ if(window._tempFocusMarker){map.removeLayer(window._tempFocusMarker);window._tempFocusMarker=null;} },12000);
    }
}

function showDirectionsFromWarehouse() {
    const assignments = deliveryPlan[currentVan][currentDay];
    if (!assignments.length) { alert('No customers assigned to this route'); return; }
    const first = customers.find(c=>c.id===assignments[0]);
    if (first) map.fitBounds(L.latLngBounds([[YOUR_SITE.lat,YOUR_SITE.lng],[first.lat,first.lng]]),{padding:[50,50]});
}

function clearCurrentVanDay() {
    const van=VANS.find(v=>v.id===currentVan), day=DAYS.find(d=>d.id===currentDay);
    if (!van || !day) return;
    if (!confirm(`Clear all deliveries for ${van.name} on ${day.name}?`)) return;
    deliveryPlan[currentVan][currentDay].forEach(id => {
        const c=customers.find(x=>x.id===id); if (c) { c.assignedVan=null; c.assignedDay=null; }
    });
    deliveryPlan[currentVan][currentDay]=[];
    updateMapMarkers(); showVanDayRoute(currentVan,currentDay); updateAllDisplays(); saveData();
    showNotification('Route cleared');
}

function clearAllAssignments() {
    if (!confirm('Clear ALL delivery assignments?')) return;
    customers.forEach(c=>{
        c.assignedVan=null; c.assignedDay=null; c.deliveryOrder=0;
        c.status         = 'pending';
        c.assignedDriver = null;
        c.assignedStaff  = [];
        if (c.zone==='Collection') c.zone=determineZone(c.lat,c.lng,c.name);
        // Wipe test data seeded by auto-assign
        c.bayNumber      = null;
        if (c.passport) {
            c.passport.trolleyCount    = 0;
            c.passport.barcodedLabels  = false;
            c.passport.prePricedLabels = false;
            c.passport.flowerStage     = '';
            c.passport.potSize         = '';
            c.passport.potColor        = '';
            c.passport.qualityGrade    = '';
            c.passport.accountType     = '';
            c.passport.paymentTerms    = '';
            c.passport.numberOfPlants  = '';
        }
    });
    // Persist cleared passport data to DB so trolley counts don't come back on refresh
    customers.forEach(function(c) { if (typeof quickSavePassport === 'function') quickSavePassport(c); });
    deliveryPlan = emptyDeliveryPlan();
    window.deliveryRunDrivers = {};
    deliveryMarkers.clearLayers(); deliveryRoutes.clearLayers(); updateMapMarkers();
    currentVan=1; currentDay=1;
    updateAllDisplays();
    document.getElementById('currentVanDay').textContent='Van 1 - Monday';
    ['currentRouteStops','currentRouteDistance','currentRouteDriveTime','currentRouteTime'].forEach((id,i) =>
        document.getElementById(id).textContent=['0','0 km','0 min','0 min'][i]);
    saveData(); showNotification('All assignments cleared');
}


// ========== ROUTE PANEL TOGGLE ==========
function toggleRoutePanel() {
    const panel = document.getElementById('rightPanel');
    const btn   = document.getElementById('panelToggleBtn');
    const icon  = document.getElementById('panelToggleIcon');

    if (!panel) { console.error('Right panel not found'); return; }

    const isCollapsed = panel.classList.toggle('collapsed');

    // Move the fixed button: right:0 when collapsed, right:400px when open
    if (btn) btn.classList.toggle('panel-collapsed', isCollapsed);

    // Chevron direction: point left to collapse, point right to expand
    if (icon) {
        icon.className = isCollapsed ? 'fas fa-chevron-left' : 'fas fa-chevron-right';
    }

    // Force Leaflet map to recalculate size after the CSS transition
    setTimeout(function () {
        if (typeof map !== 'undefined' && map) {
            map.invalidateSize();
        }
    }, 350);
}

function initRightPanel() {
    const panel = document.getElementById('rightPanel');
    const btn   = document.getElementById('panelToggleBtn');
    const icon  = document.getElementById('panelToggleIcon');
    if (panel) {
        panel.classList.remove('collapsed');
        if (btn) {
            btn.classList.remove('panel-collapsed');
            // Do NOT set display here — navigation.js shows it only when map screen is active
        }
        if (icon) icon.className = 'fas fa-chevron-right';
    }
}


// Update repeat customer status when order is completed
function updateRepeatCustomerStatus(customer) {
    if (!customer.passport) return;
    
    // Get existing orders from analytics history
    const existingOrders = analyticsHistory.filter(record => record.customerId === customer.id);
    
    const orderCount = existingOrders.length + 1; // +1 for current order
    
    customer.passport.totalOrdersCount = orderCount;
    customer.passport.isRepeatCustomer = orderCount > 1;
    customer.passport.previousOrderCount = orderCount - 1;
    
    if (!customer.passport.customerSince) {
        customer.passport.customerSince = new Date().toISOString();
    }

    
    // Save to database
    saveData();
    
    return {
        isRepeat: orderCount > 1,
        orderCount: orderCount,
        previousOrders: orderCount - 1
    };
}

window.applyMapStyle = applyMapStyle;
window.changeMapStyle = changeMapStyle;
window.updateVanDaySelector = updateVanDaySelector;
window.selectVan = selectVan;
window.selectDay = selectDay;

// ========== WEEKLY TROLLEY SUMMARY MODAL ==========
function openWeeklyTrolleyModal() {
    var modal = document.getElementById('weeklyTrolleyModal');
    var body  = document.getElementById('weeklyTrolleyModalBody');
    if (!modal || !body) return;

    var assigned = customers.filter(function(c) { return c.assignedVan && c.assignedDay; });
    var total    = assigned.reduce(function(s, c) { return s + getTotalTrolleyCount(c); }, 0);

    // Zone-wise
    var zoneData = {};
    var zoneColors = {
        'North West':        '#3b82f6',
        'South West':        '#10b981',
        'London/North East': '#ef4444',
        'South East':        '#f59e0b',
        'Local':             '#6b7280',
        'Collection':        '#8b5cf6'
    };
    assigned.forEach(function(c) {
        var z = c.zone || 'Unknown';
        if (!zoneData[z]) zoneData[z] = { trolleys: 0, stops: 0 };
        zoneData[z].trolleys += getTotalTrolleyCount(c);
        zoneData[z].stops    += 1;
    });

    // Van-wise
    var vanData = {};
    VANS.forEach(function(v) { vanData[v.id] = { name: v.name, color: v.color, trolleys: 0, stops: 0 }; });
    assigned.forEach(function(c) {
        if (vanData[c.assignedVan]) {
            vanData[c.assignedVan].trolleys += getTotalTrolleyCount(c);
            vanData[c.assignedVan].stops    += 1;
        }
    });

    // Run-wise
    var runBreakdown = [];
    VANS.forEach(function(van) {
        DAYS.forEach(function(day) {
            var ids = (deliveryPlan[van.id] || {})[day.id] || [];
            if (!ids.length) return;
            var runs = computeDeliveryRuns(van.id, day.id);
            if (!runs.length) return;
            runBreakdown.push({ van: van, day: day, runs: runs });
        });
    });
    var totalRuns = runBreakdown.reduce(function(s, x) { return s + x.runs.length; }, 0);

    // Build zone rows
    var zoneRows = Object.entries(zoneData)
        .sort(function(a, b) { return b[1].trolleys - a[1].trolleys; })
        .map(function(entry) {
            var zone = entry[0], d = entry[1];
            var col  = zoneColors[zone] || '#6b7280';
            return '<tr style="border-top:1px solid var(--border);">'
                + '<td style="padding:8px 12px;"><span style="display:inline-flex;align-items:center;gap:7px;">'
                + '<span style="width:9px;height:9px;border-radius:50%;background:' + col + ';flex-shrink:0;display:inline-block;"></span>'
                + zone + '</span></td>'
                + '<td style="padding:8px 12px;text-align:center;color:var(--text-muted);">' + d.stops + '</td>'
                + '<td style="padding:8px 12px;text-align:center;font-weight:700;">' + d.trolleys + '</td>'
                + '</tr>';
        }).join('');

    // Build van rows
    var vanRows = Object.values(vanData)
        .filter(function(v) { return v.stops > 0; })
        .map(function(v) {
            return '<tr style="border-top:1px solid var(--border);">'
                + '<td style="padding:8px 12px;"><span style="display:inline-flex;align-items:center;gap:7px;">'
                + '<span style="width:9px;height:9px;border-radius:50%;background:' + v.color + ';flex-shrink:0;display:inline-block;"></span>'
                + v.name + '</span></td>'
                + '<td style="padding:8px 12px;text-align:center;color:var(--text-muted);">' + v.stops + '</td>'
                + '<td style="padding:8px 12px;text-align:center;font-weight:700;">' + v.trolleys + '</td>'
                + '</tr>';
        }).join('');

    // Build run rows
    var runRows = '';
    runBreakdown.forEach(function(item) {
        item.runs.forEach(function(run) {
            var pct      = Math.round((run.trolleys / MAX_TROLLEYS_PER_RUN) * 100);
            var barColor = pct <= 70 ? '#16a34a' : pct <= 90 ? '#d97706' : '#dc2626';
            runRows += '<tr style="border-top:1px solid var(--border);">'
                + '<td style="padding:8px 12px;"><span style="display:inline-flex;align-items:center;gap:7px;">'
                + '<span style="width:9px;height:9px;border-radius:50%;background:' + item.van.color + ';flex-shrink:0;display:inline-block;"></span>'
                + item.van.name + '</span></td>'
                + '<td style="padding:8px 12px;">' + item.day.name + '</td>'
                + '<td style="padding:8px 12px;text-align:center;">Run&nbsp;' + run.run + '</td>'
                + '<td style="padding:8px 12px;text-align:center;color:var(--text-muted);">' + run.customers.length + '</td>'
                + '<td style="padding:8px 12px;">'
                + '<div style="display:flex;align-items:center;gap:8px;">'
                + '<div style="flex:1;height:6px;background:#e5e7eb;border-radius:3px;min-width:60px;">'
                + '<div style="width:' + Math.min(pct, 100) + '%;height:100%;background:' + barColor + ';border-radius:3px;"></div>'
                + '</div>'
                + '<span style="font-weight:700;white-space:nowrap;">' + run.trolleys
                + '<span style="font-weight:400;color:#9ca3af;font-size:10px;">/' + MAX_TROLLEYS_PER_RUN + '</span></span>'
                + '</div></td>'
                + '</tr>';
        });
    });
    if (!runRows) {
        runRows = '<tr><td colspan="5" style="padding:16px;text-align:center;color:#9ca3af;font-style:italic;">No delivery runs this week</td></tr>';
    }

    var tableHead2 = '<thead><tr style="background:var(--surface-2,#f9fafb);">'
        + '<th style="padding:7px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--text-muted);">Zone</th>'
        + '<th style="padding:7px 12px;text-align:center;font-size:11px;font-weight:600;color:var(--text-muted);">Orders</th>'
        + '<th style="padding:7px 12px;text-align:center;font-size:11px;font-weight:600;color:var(--text-muted);">Trolleys</th>'
        + '</tr></thead>';

    var tableHead3 = '<thead><tr style="background:var(--surface-2,#f9fafb);">'
        + '<th style="padding:7px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--text-muted);">Van</th>'
        + '<th style="padding:7px 12px;text-align:center;font-size:11px;font-weight:600;color:var(--text-muted);">Orders</th>'
        + '<th style="padding:7px 12px;text-align:center;font-size:11px;font-weight:600;color:var(--text-muted);">Trolleys</th>'
        + '</tr></thead>';

    var tableHead4 = '<thead><tr style="background:var(--surface-2,#f9fafb);">'
        + '<th style="padding:7px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--text-muted);">Van</th>'
        + '<th style="padding:7px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--text-muted);">Day</th>'
        + '<th style="padding:7px 12px;text-align:center;font-size:11px;font-weight:600;color:var(--text-muted);">Run</th>'
        + '<th style="padding:7px 12px;text-align:center;font-size:11px;font-weight:600;color:var(--text-muted);">Stops</th>'
        + '<th style="padding:7px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--text-muted);">Trolleys</th>'
        + '</tr></thead>';

    body.innerHTML =
        // ── Stat cards ──
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">'
        + '<div style="background:linear-gradient(135deg,#0f766e,#14b8a6);border-radius:12px;padding:16px;color:white;text-align:center;">'
        + '<div style="font-size:30px;font-weight:800;line-height:1;">' + total + '</div>'
        + '<div style="font-size:10px;opacity:0.85;margin-top:6px;font-weight:600;letter-spacing:.5px;">TOTAL TROLLEYS</div>'
        + '</div>'
        + '<div style="background:linear-gradient(135deg,#1d4ed8,#3b82f6);border-radius:12px;padding:16px;color:white;text-align:center;">'
        + '<div style="font-size:30px;font-weight:800;line-height:1;">' + assigned.length + '</div>'
        + '<div style="font-size:10px;opacity:0.85;margin-top:6px;font-weight:600;letter-spacing:.5px;">ASSIGNED ORDERS</div>'
        + '</div>'
        + '<div style="background:linear-gradient(135deg,#7c3aed,#a78bfa);border-radius:12px;padding:16px;color:white;text-align:center;">'
        + '<div style="font-size:30px;font-weight:800;line-height:1;">' + totalRuns + '</div>'
        + '<div style="font-size:10px;opacity:0.85;margin-top:6px;font-weight:600;letter-spacing:.5px;">TOTAL RUNS</div>'
        + '</div>'
        + '</div>'

        // ── Zone + Van side by side ──
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;">'

        + '<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;">'
        + '<div style="padding:9px 14px;background:var(--header-bg,#1c1917);display:flex;align-items:center;gap:7px;">'
        + '<i class="fas fa-map-marked-alt" style="color:#60a5fa;font-size:12px;"></i>'
        + '<span style="color:var(--header-text,white);font-size:12px;font-weight:700;">By Zone</span>'
        + '</div>'
        + '<table style="width:100%;border-collapse:collapse;font-size:12px;">'
        + tableHead2
        + '<tbody>' + (zoneRows || '<tr><td colspan="3" style="padding:14px;text-align:center;color:#9ca3af;font-style:italic;">No data</td></tr>') + '</tbody>'
        + '</table></div>'

        + '<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;">'
        + '<div style="padding:9px 14px;background:var(--header-bg,#1c1917);display:flex;align-items:center;gap:7px;">'
        + '<i class="fas fa-truck" style="color:#60a5fa;font-size:12px;"></i>'
        + '<span style="color:var(--header-text,white);font-size:12px;font-weight:700;">By Van</span>'
        + '</div>'
        + '<table style="width:100%;border-collapse:collapse;font-size:12px;">'
        + tableHead3
        + '<tbody>' + (vanRows || '<tr><td colspan="3" style="padding:14px;text-align:center;color:#9ca3af;font-style:italic;">No data</td></tr>') + '</tbody>'
        + '</table></div>'

        + '</div>'

        // ── Run-wise ──
        + '<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;">'
        + '<div style="padding:9px 14px;background:var(--header-bg,#1c1917);display:flex;align-items:center;gap:7px;">'
        + '<i class="fas fa-truck-loading" style="color:#60a5fa;font-size:12px;"></i>'
        + '<span style="color:var(--header-text,white);font-size:12px;font-weight:700;">By Delivery Run</span>'
        + '</div>'
        + '<table style="width:100%;border-collapse:collapse;font-size:12px;">'
        + tableHead4
        + '<tbody>' + runRows + '</tbody>'
        + '</table></div>';

    modal.style.display = 'flex';
}

function closeWeeklyTrolleyModal() {
    var modal = document.getElementById('weeklyTrolleyModal');
    if (modal) modal.style.display = 'none';
}

window.openWeeklyTrolleyModal  = openWeeklyTrolleyModal;
window.closeWeeklyTrolleyModal = closeWeeklyTrolleyModal;
