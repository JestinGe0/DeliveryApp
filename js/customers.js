// ========== CORE DELIVERY FUNCTIONS ==========
async function assignToVanDay(customerId, vanId, dayId) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;

    // ── ACTIVE DAY GUARD ──
    // Collection customers have their day set independently — skip the check for them.
    // For all other assignments, block any day not in the admin's active schedule.
    if (dayId && customer.zone !== 'Collection') {
        var _activeDayIds = (typeof ACTIVE_DAYS !== 'undefined' && ACTIVE_DAYS.length) ? ACTIVE_DAYS : DAYS.map(function(d){return d.id;});
        if (!_activeDayIds.includes(dayId)) {
            var _dayName = (DAYS.find(function(d){return d.id === dayId;}) || {}).name || ('Day ' + dayId);
            showNotification(
                '\u26d4 ' + _dayName + ' is not an active delivery day. Update active days in Settings \u2192 Days.',
                'warning'
            );
            return;
        }
    }

    // ── TROLLEY CAPACITY CHECK ──
    // Collection orders are exempt (they don't use the van)
    if (customer.zone !== 'Collection') {
        const MAX_TROLLEYS = getVanTrolleyLimit(vanId);

        const thisOrder = getTotalTrolleyCount(customer);

        // Simulate runs with existing orders (excluding this customer if reassigning)
        const existingIds = (deliveryPlan[vanId]?.[dayId] || []).filter(id => id !== customerId);
        const existingCustomers = existingIds.map(id => customers.find(x => x.id === id)).filter(Boolean);

        // Pack existing customers into runs greedily (same logic as computeDeliveryRuns)
        const runTotals = [];
        let currentRunTrolleys = 0;
        existingCustomers.forEach(c => {
            const t = getTotalTrolleyCount(c);
            if (currentRunTrolleys + t > MAX_TROLLEYS && currentRunTrolleys > 0) {
                runTotals.push(currentRunTrolleys);
                currentRunTrolleys = 0;
            }
            currentRunTrolleys += t;
        });
        if (currentRunTrolleys > 0 || runTotals.length === 0) runTotals.push(currentRunTrolleys);

        // Check if the new order fits in any existing run, or would start a valid new run
        const fitsInExistingRun = runTotals.some(t => t + thisOrder <= MAX_TROLLEYS);
        const fitsAsNewRun = thisOrder <= MAX_TROLLEYS;

        if (!fitsInExistingRun && !fitsAsNewRun) {
            const van = VANS.find(v => v.id === vanId);
            const day = DAYS.find(d => d.id === dayId);
            showNotification(
                `⛔ Cannot assign — this order needs ${thisOrder || '?'} trolleys, which exceeds the max trolley limit of ${MAX_TROLLEYS} for ${van?.name} on ${day?.name}.`,
                'warning'
            );
            return; // Block assignment
        }
    }

    // ── MULTI-RUN PICKER ──
    // If the current run is full, ask which run to append to (or start a new one).
    if (customer.zone !== 'Collection') {
        const MAX_TROLLEYS = getVanTrolleyLimit(vanId);
        const existingIds2 = (deliveryPlan[vanId]?.[dayId] || []).filter(id => id !== customerId);
        if (existingIds2.length > 0) {
            // Build run list same as computeDeliveryRuns
            const existingCusts2 = existingIds2.map(id => customers.find(x => x.id === id)).filter(Boolean);
            const runBuckets = [];
            let bucket = [], bucketTrolleys = 0;
            existingCusts2.forEach(c => {
                const t = getTotalTrolleyCount(c);
                if (bucketTrolleys + t > MAX_TROLLEYS && bucket.length > 0) {
                    runBuckets.push({ ids: bucket.map(x => x.id), trolleys: bucketTrolleys });
                    bucket = []; bucketTrolleys = 0;
                }
                bucket.push(c); bucketTrolleys += t;
            });
            if (bucket.length > 0) runBuckets.push({ ids: bucket.map(x => x.id), trolleys: bucketTrolleys });

            // Show run picker if adding this order would exceed the van's limit on any run,
            // or if there are already multiple runs.
            const thisOrder = getTotalTrolleyCount(customer);
            const lastBucket = runBuckets[runBuckets.length - 1];
            const wouldOverflow = lastBucket && (lastBucket.trolleys + thisOrder > MAX_TROLLEYS);
            if (runBuckets.length >= 2 || wouldOverflow) {
                _pendingRunAssignment = { customerId, vanId, dayId };
                _showSelectRunModal(runBuckets, MAX_TROLLEYS, thisOrder);
                return;
            }
        }
    }

    console.log(`Assigning customer ${customer.name} to Van ${vanId}, Day ${dayId}`);

    // Remove from current assignment if any
    if (customer.assignedVan && customer.assignedDay) {
        const oldVanId = customer.assignedVan;
        const oldDayId = customer.assignedDay;
        const oldIdx = deliveryPlan[oldVanId]?.[oldDayId]?.indexOf(customerId);
        if (oldIdx !== undefined && oldIdx > -1) {
            deliveryPlan[oldVanId][oldDayId].splice(oldIdx, 1);
        }
        invalidateRouteCache(oldVanId, oldDayId); // old route changed
    }
    invalidateRouteCache(vanId, dayId); // new route will change
    
    // Add to new assignment
    if (!deliveryPlan[vanId]) {
        deliveryPlan[vanId] = {}; DAYS.forEach(function(d) { deliveryPlan[vanId][d.id] = []; });
    }
    if (!deliveryPlan[vanId][dayId]) {
        deliveryPlan[vanId][dayId] = [];
    }
    
    deliveryPlan[vanId][dayId].push(customerId);
    
    // Update customer
    customer.assignedVan = vanId;
    customer.assignedDay = dayId;
    
    // Recalculate zone if it was collection
    if (customer.zone === 'Collection') {
        customer.zone = determineZone(customer.lat, customer.lng);
    }
    
    // Update displays
    updateMapMarkers();
    updateAllDisplays();
    
    // Show the route for this van and day
    await showVanDayRoute(vanId, dayId);
    
    // Quick save — only sends this one customer, not all 415
    quickSaveCustomer(customer);
    
    const van = VANS.find(v => v.id === vanId);
    const day = DAYS.find(d => d.id === dayId);
    showNotification(`Assigned to ${van.name} on ${day.name}`);
}

function unassignCustomer(customerId) {
    const customer = customers.find(c=>c.id===customerId);
    if (!customer||!customer.assignedVan||!customer.assignedDay) return;
    const { assignedVan:vanId, assignedDay:dayId } = customer;
    const idx = deliveryPlan[vanId][dayId].indexOf(customerId);
    if (idx>-1) deliveryPlan[vanId][dayId].splice(idx,1);
    customer.assignedVan=null; customer.assignedDay=null; customer.deliveryOrder=0;
    if (customer.zone!=='Collection') customer.zone=determineZone(customer.lat,customer.lng);
    invalidateRouteCache(vanId, dayId); // route changed
    if (typeof invalidateRunDrivers === 'function') invalidateRunDrivers(vanId, dayId);
    updateMapMarkers(); updateAllDisplays(); showVanDayRoute(currentVan,currentDay);
    quickSaveCustomer(customer);
    showNotification('Customer removed from route');
}

async function showVanDayRoute(vanId, dayId) {
    console.log(`Showing route for Van ${vanId}, Day ${dayId}`);

    currentVan = vanId;
    currentDay = dayId;

    // Clear ALL map layers — pins, numbered markers, polylines
    // so no stale markers from previous van/day remain visible
    if (typeof markers !== 'undefined')        markers.clearLayers();
    if (typeof deliveryMarkers !== 'undefined') deliveryMarkers.clearLayers();
    if (typeof deliveryRoutes !== 'undefined')  deliveryRoutes.clearLayers();

    // Re-add warehouse marker and current van/day customer pins
    if (typeof addWarehouseMarker === 'function') addWarehouseMarker();
    if (typeof updateMapMarkers === 'function')   updateMapMarkers();

    if (typeof refreshDeliveryRunsPanel === 'function') refreshDeliveryRunsPanel();
    if (typeof renderETAPanel === 'function') {
        setTimeout(function() { renderETAPanel(vanId, dayId); }, 200);
    }
    
    const van = VANS.find(v => v.id === vanId);
    const day = DAYS.find(d => d.id === dayId);
    
    if (!van || !day) {
        console.error('Invalid van or day:', vanId, dayId);
        return;
    }

    // Update the header
    const headerEl = document.getElementById('currentVanDay');
    if (headerEl) {
        headerEl.textContent = `${van.name} - ${day.name}`;
    }
    
    const modalVD = document.getElementById('modalCurrentVanDay');
    if (modalVD) {
        modalVD.textContent = `${van.name} - ${day.name}`;
    }

    // Get assignments for this van and day
    const assignments = deliveryPlan[vanId]?.[dayId] || [];
    console.log(`Assignments for ${van.name} on ${day.name}:`, assignments);

    if (!assignments.length) {
        // Clear the route stats
        document.getElementById('currentRouteStops').textContent = '0';
        document.getElementById('currentRouteDistance').textContent = '0 km';
        document.getElementById('currentRouteDriveTime').textContent = '0 min';
        document.getElementById('currentRouteTime').textContent = '0 min';
        return;
    }

    // Get the customer objects for these assignments
    const assignedCustomers = assignments
        .map(id => customers.find(c => c.id === id))
        .filter(c => c); // Remove any undefined customers

    console.log(`Found ${assignedCustomers.length} customers for this route`);

    // Pre-calculate ETAs so we can show them on markers
    if (typeof calculateAllETAs === 'function') {
        calculateAllETAs(vanId, dayId);
    }

    // Add markers for each customer
    assignedCustomers.forEach((customer, index) => {
        if (!customer) return;
        
        customer.deliveryOrder = index + 1;
        const staffList = (customer.assignedStaff || [])
            .map(id => staffMembers.find(s => s.id === id))
            .filter(Boolean);
        const driver = customer.assignedDriver ? 
            staffMembers.find(s => s.id === customer.assignedDriver) : null;

        // Get ETA for this customer
        const etaData  = typeof getCustomerETA === 'function' ? getCustomerETA(customer.id) : null;
        const etaLabel = etaData ? etaData.label : null;
        const etaColor = etaData
            ? (etaData.outsideWindow ? '#dc2626'
               : etaData.confidence === 'actual'    ? '#16a34a'
               : etaData.confidence === 'estimated' ? '#f59e0b'
               : '#94a3b8')
            : null;
        const isCollection = etaData && etaData.isCollection;

        // Truncate name cleanly for label
        const displayName = customer.name.length > 18
            ? customer.name.substring(0, 16) + '…'
            : customer.name;

        // Shared text-stroke style for legibility over any map background
        const textStroke = 'text-shadow: -1px -1px 0 rgba(0,0,0,0.9), 1px -1px 0 rgba(0,0,0,0.9), -1px 1px 0 rgba(0,0,0,0.9), 1px 1px 0 rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.7);';

        // Customer name label — Barlow Condensed: designed for map labels, legible at all sizes
        const nameLabel = `<div class="marker-name" style="
            position:absolute;
            bottom:${etaLabel ? 50 : 32}px;
            left:50%;
            transform:translateX(-50%);
            color:white;
            font-family:'Comfortaa', 'Arial Rounded MT Bold', sans-serif;
            font-size:11px;
            font-weight:700;
            letter-spacing:0.3px;
            white-space:nowrap;
            pointer-events:none;
            ${textStroke}
          ">${displayName}</div>`;

        // ETA chip — sits between name and the numbered circle
        const etaChip = etaLabel
            ? `<div class="marker-eta" style="
                position:absolute;
                bottom:30px;
                left:50%;
                transform:translateX(-50%);
                background:${etaColor};
                color:white;
                font-family:'Comfortaa', 'Arial Rounded MT Bold', sans-serif;
                font-size:10px;
                font-weight:700;
                padding:2px 6px;
                border-radius:4px;
                white-space:nowrap;
                box-shadow:0 1px 4px rgba(0,0,0,0.4);
                pointer-events:none;
              ">${isCollection ? '📦 ' : ''}${etaLabel}</div>`
            : '';

        // Total label stack height — name (16px) + eta chip (18px) + circle (28px) + gap
        const totalHeight = etaLabel ? 90 : 70;

        // Create marker
        const marker = L.marker([customer.lat, customer.lng], {
            icon: L.divIcon({
                className: 'delivery-marker',
                html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;width:100px;margin-left:-36px;">
                          ${nameLabel}
                          ${etaChip}
                          <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);background:${van.color}; width:28px; height:28px; border-radius:50%; border:3px solid white; box-shadow:0 2px 8px ${van.color}80; display:flex; align-items:center; justify-content:center; color:white; font-weight:bold; font-size:12px;">
                              ${index + 1}
                          </div>
                       </div>`,
                iconSize: [100, totalHeight],
                iconAnchor: [50, 28]
            })
        }).addTo(deliveryMarkers);

        // Bind popup
        const etaPopupLine = etaData
            ? `<div style="margin:6px 0;padding:5px 8px;border-radius:6px;background:${etaColor}18;border:1px solid ${etaColor}44;">
                 <span style="color:${etaColor};font-weight:700;font-size:12px;">
                   <i class="fas fa-clock"></i> ETA: ${etaLabel}
                 </span>
                 ${etaData.runDepart ? `<br><small style="color:#64748b;">Run ${etaData.runNumber}, Stop ${etaData.stopNumber}/${etaData.totalStops} · Departs ${formatTime(etaData.runDepart)}</small>` : ''}
                 ${etaData.outsideWindow ? '<br><small style="color:#dc2626;">⚠ Outside delivery window</small>' : ''}
               </div>`
            : '';
        marker.bindPopup(`
            <div style="max-width:260px;">
                <b>Stop ${index + 1}: ${customer.name}</b><br>
                ${customer.address}<br>
                <small><b>Status:</b> ${getStatusText(customer.status)}</small><br>
                ${staffList.length ? `<small><b>Pickers:</b> ${staffList.map(s => s.name).join(', ')}</small><br>` : ''}
                ${driver ? `<small><b>Driver:</b> ${driver.name}</small><br>` : ''}
                ${etaPopupLine}
                <hr style="margin:8px 0;">
                <div style="display:flex; flex-direction:column; gap:5px;">
                    <button onclick="unassignCustomer(${customer.id})" 
                            style="background:#dc3545; color:white; border:none; padding:5px; border-radius:3px; cursor:pointer;">
                        Remove from Route
                    </button>
                    <button onclick="openAssignStaffModal(${customer.id})" 
                            style="background:var(--staff); color:white; border:none; padding:5px; border-radius:3px; cursor:pointer;">
                        Manage Pickers
                    </button>
                    <button onclick="openAssignDriverModal(${customer.id})" 
                            style="background:#f59e0b; color:white; border:none; padding:5px; border-radius:3px; cursor:pointer;">
                        Assign Driver
                    </button>
                    <button onclick="showStatusUpdateModal(customers.find(c => c.id === ${customer.id}))" 
                            style="background:var(--primary); color:white; border:none; padding:5px; border-radius:3px; cursor:pointer;">
                        Update Status
                    </button>
                    <button onclick="openPassportModal(${customer.id})" 
                            style="background:#6f42c1; color:white; border:none; padding:5px; border-radius:3px; cursor:pointer;">
                        View Passport
                    </button>
                </div>
            </div>
        `);
    });

    // Calculate and draw the route
    if (typeof ROUTE_DRIVER_STYLE !== 'undefined' && ROUTE_DRIVER_STYLE) {
        await _drawPerRunDriverStyle(vanId, dayId, van, assignedCustomers);
    } else {
        await calculateRouteForVanDay(vanId, dayId, assignedCustomers);
    }
    
    // Update the van/day selector to reflect the current selection
    updateVanDaySelector();
}

// Route geometry cache — stores polyline coords + stats per van+day key.
// Persisted to localStorage so polylines survive page refresh without re-fetching Valhalla.
var ROUTE_CACHE_STORAGE_KEY = 'PEP_route_geometry_cache';
var _routeCache = {};

function _loadRouteCacheFromStorage() {
    try {
        var saved = localStorage.getItem(ROUTE_CACHE_STORAGE_KEY);
        if (saved) {
            _routeCache = JSON.parse(saved);
            var keys = Object.keys(_routeCache).length;
            if (keys > 0) console.log('[route cache] Loaded', keys, 'cached routes from storage');
        }
    } catch(e) { _routeCache = {}; }
}

function _saveRouteCacheToStorage() {
    try {
        localStorage.setItem(ROUTE_CACHE_STORAGE_KEY, JSON.stringify(_routeCache));
    } catch(e) {
        // localStorage full — clear oldest entries and retry
        console.warn('[route cache] Storage full, clearing oldest entries');
        var keys = Object.keys(_routeCache);
        if (keys.length > 0) {
            delete _routeCache[keys[0]];
            try { localStorage.setItem(ROUTE_CACHE_STORAGE_KEY, JSON.stringify(_routeCache)); } catch(e2) {}
        }
    }
}

function _routeCacheKey(vId, dId) { return vId + '-' + dId; }

function invalidateRouteCache(vId, dId) {
    var k = _routeCacheKey(vId, dId);
    if (_routeCache[k]) {
        delete _routeCache[k];
        _saveRouteCacheToStorage();
        console.log('[route cache] Invalidated', k);
    }
}

// Load persisted cache immediately
_loadRouteCacheFromStorage();

// ── Per-run driver-style polylines ───────────────────────────────────────────
// Called instead of calculateRouteForVanDay when ROUTE_DRIVER_STYLE is enabled.
// Solid line with real road geometry  = run has a driver assigned.
// Dotted straight line                = run has no driver assigned yet.
async function _drawPerRunDriverStyle(vanId, dayId, van, assignedCustomers) {
    var runs = (typeof computeDeliveryRuns === 'function') ? computeDeliveryRuns(vanId, dayId) : null;
    if (!runs || !runs.length) {
        await calculateRouteForVanDay(vanId, dayId, assignedCustomers);
        return;
    }

    var snapVan = vanId, snapDay = dayId;

    // ── Haversine stats for the full combined route ───────────────────────
    var totalDist = 0, totalDur = 0;
    if (assignedCustomers.length > 0) {
        var rd0 = getRoadDistanceDuration(YOUR_SITE.lat, YOUR_SITE.lng, assignedCustomers[0].lat, assignedCustomers[0].lng);
        totalDist += rd0.distance; totalDur += rd0.duration;
        for (var si = 0; si < assignedCustomers.length - 1; si++) {
            var rdL = getRoadDistanceDuration(assignedCustomers[si].lat, assignedCustomers[si].lng, assignedCustomers[si+1].lat, assignedCustomers[si+1].lng);
            totalDist += rdL.distance; totalDur += rdL.duration;
        }
        var rdN = getRoadDistanceDuration(assignedCustomers[assignedCustomers.length-1].lat, assignedCustomers[assignedCustomers.length-1].lng, YOUR_SITE.lat, YOUR_SITE.lng);
        totalDist += rdN.distance; totalDur += rdN.duration;
    }
    var stopTime  = (typeof STOP_TIME_PER_DELIVERY !== 'undefined') ? STOP_TIME_PER_DELIVERY : 10;
    var totalTime = totalDur + assignedCustomers.length * stopTime;
    var th = Math.floor(totalTime / 60), tm = Math.round(totalTime % 60);
    var _qs = function(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    _qs('currentRouteStops',    assignedCustomers.length);
    _qs('currentRouteDistance', totalDist.toFixed(1) + ' km');
    _qs('currentRouteDriveTime',totalDur.toFixed(0) + ' min');
    _qs('currentRouteTime',     th > 0 ? th + 'h ' + tm + 'm' : tm + 'm');

    // ── One polyline segment per run ──────────────────────────────────────
    var allBounds = [[YOUR_SITE.lat, YOUR_SITE.lng]];

    runs.forEach(function(run) {
        if (!run.customers.length) return;

        var pts = [[YOUR_SITE.lat, YOUR_SITE.lng]]
            .concat(run.customers.map(function(c) { return [c.lat, c.lng]; }))
            .concat([[YOUR_SITE.lat, YOUR_SITE.lng]]);

        run.customers.forEach(function(c) { allBounds.push([c.lat, c.lng]); });

        if (!run.driverId) {
            // No driver — dotted straight line, no road-route fetch needed
            L.polyline(pts, {
                color: van.color, weight: 3, opacity: 0.65, dashArray: '10, 8'
            }).addTo(deliveryRoutes);
        } else {
            // Driver assigned — straight preview, then replace with real road geometry
            var preview = L.polyline(pts, {
                color: van.color, weight: 4, opacity: 0.45
            }).addTo(deliveryRoutes);

            var locs = [[YOUR_SITE.lng, YOUR_SITE.lat]]
                .concat(run.customers.map(function(c) { return [parseFloat(c.lng), parseFloat(c.lat)]; }))
                .concat([[YOUR_SITE.lng, YOUR_SITE.lat]]);

            fetch(SERVER_URL + '/api/road-route', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ locations: locs })
            })
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(data) {
                if (currentVan !== snapVan || currentDay !== snapDay) return; // stale — user switched view
                deliveryRoutes.removeLayer(preview);
                if (data && data.coordinates && data.coordinates.length > 1) {
                    var latLngs = data.coordinates.map(function(p) { return [p[1], p[0]]; });
                    L.polyline(latLngs, { color: van.color, weight: 4, opacity: 0.85 }).addTo(deliveryRoutes);
                } else {
                    L.polyline(pts, { color: van.color, weight: 4, opacity: 0.85 }).addTo(deliveryRoutes);
                }
            })
            .catch(function() {
                deliveryRoutes.removeLayer(preview);
                L.polyline(pts, { color: van.color, weight: 4, opacity: 0.85 }).addTo(deliveryRoutes);
            });
        }
    });

    if (allBounds.length > 1) {
        map.fitBounds(L.latLngBounds(allBounds), { padding: [50, 50] });
    }
}

async function calculateRouteForVanDay(vanId, dayId, assignedCustomers) {
    if (!assignedCustomers || assignedCustomers.length === 0) return;
    const van = VANS.find(v => v.id === vanId);
    if (!van) return;

    const cacheKey = _routeCacheKey(vanId, dayId);

    const updateStats = (dist, dur) => {
        const totalTime = dur + (assignedCustomers.length * STOP_TIME_PER_DELIVERY);
        const h = Math.floor(totalTime / 60), m = Math.round(totalTime % 60);
        document.getElementById('currentRouteStops').textContent = assignedCustomers.length;
        document.getElementById('currentRouteDistance').textContent = dist.toFixed(1) + ' km';
        document.getElementById('currentRouteDriveTime').textContent = dur.toFixed(0) + ' min';
        document.getElementById('currentRouteTime').textContent = h > 0 ? h + 'h ' + m + 'm' : m + 'm';
    };

    // ── Cache hit: draw instantly, no API call ────────────────────────────
    if (_routeCache[cacheKey]) {
        const c = _routeCache[cacheKey];
        const latLngs = c.coords.map(function(p) { return [p[1], p[0]]; });
        L.polyline(latLngs, { color: van.color, weight: 4, opacity: 0.85 }).addTo(deliveryRoutes);
        map.fitBounds(L.latLngBounds(latLngs), { padding: [50, 50] });
        updateStats(c.distance, c.duration);
        console.log('[route cache] Hit for', cacheKey, '—', c.coords.length, 'points');
        return;
    }

    // ── Step 1: Dashed preview immediately ───────────────────────────────
    const fallbackPoints = [
        [YOUR_SITE.lat, YOUR_SITE.lng],
        ...assignedCustomers.map(c => [c.lat, c.lng]),
        [YOUR_SITE.lat, YOUR_SITE.lng]
    ];
    const previewLine = L.polyline(fallbackPoints, {
        color: van.color, weight: 3, opacity: 0.4, dashArray: '8, 8'
    }).addTo(deliveryRoutes);
    map.fitBounds(L.latLngBounds(fallbackPoints), { padding: [50, 50] });

    // Show haversine estimates immediately
    let totalDistance = 0, totalDuration = 0;
    const first = getRoadDistanceDuration(YOUR_SITE.lat, YOUR_SITE.lng, assignedCustomers[0].lat, assignedCustomers[0].lng);
    totalDistance += first.distance; totalDuration += first.duration;
    for (let i = 0; i < assignedCustomers.length - 1; i++) {
        const leg = getRoadDistanceDuration(assignedCustomers[i].lat, assignedCustomers[i].lng, assignedCustomers[i+1].lat, assignedCustomers[i+1].lng);
        totalDistance += leg.distance; totalDuration += leg.duration;
    }
    const lastLeg = getRoadDistanceDuration(assignedCustomers[assignedCustomers.length-1].lat, assignedCustomers[assignedCustomers.length-1].lng, YOUR_SITE.lat, YOUR_SITE.lng);
    totalDistance += lastLeg.distance; totalDuration += lastLeg.duration;
    updateStats(totalDistance, totalDuration);

    // ── Step 2: Fetch real geometry in parallel chunks ────────────────────
    const CHUNK_SIZE = 18;
    const allLocs = [
        [YOUR_SITE.lng, YOUR_SITE.lat],
        ...assignedCustomers.map(c => [parseFloat(c.lng), parseFloat(c.lat)]),
        [YOUR_SITE.lng, YOUR_SITE.lat]
    ];
    const chunks = [];
    for (let i = 0; i < allLocs.length - 1; i += CHUNK_SIZE) {
        chunks.push(allLocs.slice(i, Math.min(i + CHUNK_SIZE + 1, allLocs.length)));
    }

    // Snapshot the van/day at fetch time — if user switches before fetch completes,
    // discard the result to prevent stale polylines appearing on screen
    const fetchedForVan = vanId;
    const fetchedForDay = dayId;

    // Calculate estimated departure time for this run so Valhalla can use
    // time-of-day traffic patterns (Level 1 ETA improvement)
    var departureTimeISO = null;
    try {
        if (typeof calculateAllETAs === 'function') {
            var etas = calculateAllETAs(vanId, dayId);
            // Find the earliest run departure time
            var earliestDepart = null;
            Object.values(etas).forEach(function(e) {
                if (e.runDepart && (!earliestDepart || e.runDepart < earliestDepart)) {
                    earliestDepart = e.runDepart;
                }
            });
            if (earliestDepart) {
                // Format as "YYYY-MM-DDTHH:MM" local time — Valhalla expects this
                var d = earliestDepart;
                var pad = function(n) { return n.toString().padStart(2, '0'); };
                departureTimeISO = d.getFullYear() + '-'
                    + pad(d.getMonth()+1) + '-'
                    + pad(d.getDate()) + 'T'
                    + pad(d.getHours()) + ':'
                    + pad(d.getMinutes());
                console.log('[route] Using departure time:', departureTimeISO, '— Valhalla will apply time-of-day traffic');
            }
        }
    } catch(e) {
        console.warn('[route] Could not calculate departure time, using default routing:', e.message);
    }

    try {
        const results = await Promise.all(chunks.map(locs =>
            fetch(`${SERVER_URL}/api/road-route`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ locations: locs, departureTime: departureTimeISO })
            }).then(r => r.ok ? r.json() : Promise.reject(new Error(r.status)))
        ));

        // Guard: user may have switched van/day while fetch was in flight — discard stale result
        if (currentVan !== fetchedForVan || currentDay !== fetchedForDay) {
            console.log('[route] Discarding stale result for', fetchedForVan + '-' + fetchedForDay, '(now showing', currentVan + '-' + currentDay + ')');
            return;
        }

        let allCoords = [], realDist = 0, realDur = 0;
        results.forEach((data, i) => {
            if (data.coordinates && data.coordinates.length > 0) {
                allCoords = allCoords.concat(i === 0 ? data.coordinates : data.coordinates.slice(1));
                realDist += data.distance || 0;
                realDur  += data.duration || 0;
            }
        });

        if (allCoords.length > 1) {
            // Store in cache for instant reuse — also persisted to localStorage
            _routeCache[cacheKey] = { coords: allCoords, distance: realDist, duration: realDur };
            _saveRouteCacheToStorage();

            // Clear routes layer before drawing — removes any lingering lines
            deliveryRoutes.clearLayers();
            const latLngs = allCoords.map(function(p) { return [p[1], p[0]]; });
            L.polyline(latLngs, { color: van.color, weight: 4, opacity: 0.85 }).addTo(deliveryRoutes);
            map.fitBounds(L.latLngBounds(latLngs), { padding: [50, 50] });
            updateStats(realDist, realDur);
            console.log('[route cache] Stored', cacheKey, '—', allCoords.length, 'points,', realDist.toFixed(1) + 'km,', realDur.toFixed(0) + 'min');
        }
    } catch (err) {
        console.warn('[route] Road geometry failed, keeping preview:', err.message);
    }
}


// ========== CUSTOMER MODAL ==========
function openCustomerModal() {
    document.getElementById('customerModal').classList.add('active');
    renderModalCustomerList();
}

function closeCustomerModal() { document.getElementById('customerModal').classList.remove('active'); }

// Pagination state for customer modal
var _modalPage = 1;
const _modalPageSize = 30;

function renderModalCustomerList(resetPage) {
    if (resetPage) _modalPage = 1;
    const container = document.getElementById('modalCustomerList');
    if (!customers.length) {
        container.innerHTML=`<div style="text-align:center;padding:50px;color:#666;"><i class="fas fa-database fa-3x" style="margin-bottom:20px;color:#6f42c1;"></i><h3>No customers loaded</h3></div>`;
        return;
    }
    const searchTerm = (document.getElementById('modalSearchInput')?.value||'').toLowerCase().trim();
    let filtered = searchTerm
        ? customers.filter(c => c.name.toLowerCase().includes(searchTerm)||c.address.toLowerCase().includes(searchTerm)||c.postcode.toLowerCase().includes(searchTerm))
        : customers;

    if (currentCustomerFilter === 'assigned') {
        filtered = filtered.filter(c => c.assignedVan);
    } else if (currentCustomerFilter === 'unassigned') {
        filtered = filtered.filter(c => !c.assignedVan);
    }

    document.getElementById('modalTotalCustomers').textContent   = filtered.length;
    document.getElementById('modalAssignedCount').textContent    = filtered.filter(c=>c.assignedVan).length;
    document.getElementById('modalUnassignedCount').textContent  = filtered.filter(c=>!c.assignedVan).length;
    const modalVD = document.getElementById('modalCurrentVanDay');
    if (modalVD) modalVD.textContent=`${VANS.find(v=>v.id===currentVan).name} - ${DAYS.find(d=>d.id===currentDay).name}`;

    if (!filtered.length) {
        container.innerHTML='<div style="text-align:center;padding:50px;color:#666;"><i class="fas fa-search fa-3x" style="margin-bottom:20px;"></i><h3>No customers found</h3></div>';
        return;
    }

    // Paginate
    const totalPages = Math.max(1, Math.ceil(filtered.length / _modalPageSize));
    _modalPage = Math.min(_modalPage, totalPages);
    const pageStart = (_modalPage - 1) * _modalPageSize;
    const paginated = filtered.slice(pageStart, pageStart + _modalPageSize);

    const paginationHTML = totalPages > 1 ? `
        <div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:16px 0 8px;flex-shrink:0;">
            <button onclick="_modalGoPage(${_modalPage - 1})" ${_modalPage <= 1 ? 'disabled' : ''}
                style="padding:6px 14px;border:1px solid var(--border);border-radius:20px;background:var(--surface);cursor:pointer;font-size:13px;${_modalPage<=1?'opacity:0.4;':''}">
                <i class="fas fa-chevron-left"></i>
            </button>
            <span style="font-size:13px;font-weight:600;color:var(--text);">
                Page ${_modalPage} of ${totalPages} &nbsp;·&nbsp; ${pageStart+1}–${Math.min(pageStart+_modalPageSize,filtered.length)} of ${filtered.length}
            </span>
            <button onclick="_modalGoPage(${_modalPage + 1})" ${_modalPage >= totalPages ? 'disabled' : ''}
                style="padding:6px 14px;border:1px solid var(--border);border-radius:20px;background:var(--surface);cursor:pointer;font-size:13px;${_modalPage>=totalPages?'opacity:0.4;':''}">
                <i class="fas fa-chevron-right"></i>
            </button>
        </div>` : '';

    container.innerHTML = `<div class="customer-grid">${paginated.map(customer => {
        const zoneClass = customer.zone.toLowerCase().replace(/[\/\s]/g,'-');
        const van       = customer.assignedVan ? VANS.find(v=>v.id===customer.assignedVan) : null;
        const staffList = (customer.assignedStaff||[]).map(id=>staffMembers.find(s=>s.id===id)).filter(Boolean);
        const driver    = customer.assignedDriver ? staffMembers.find(s=>s.id===customer.assignedDriver) : null;
        
        const hasPassport = customer.passport && Object.keys(customer.passport).length > 0;
        const passportBadge = hasPassport 
            ? '<span class="passport-badge" title="Passport completed"><i class="fas fa-passport"></i></span>' 
            : '';

        const extraOrders = customer.passport?.orders?.length || 0;
        const totalOrders = 1 + extraOrders;
        const multiOrderBadge = totalOrders > 1
            ? `<span class="passport-multi-order-badge" title="${totalOrders} orders for this customer"><i class="fas fa-layer-group"></i> ${totalOrders}</span>`
            : '';
        
        return `
            <div class="customer-card ${zoneClass}" onclick="focusOnCustomerFromModal(${customer.id})">
                <div class="customer-card-header">
                    <span class="customer-name">${customer.name} ${passportBadge}${multiOrderBadge}</span>
                    <span class="customer-zone">${customer.zone}</span>
                </div>
                <div class="customer-address">${customer.address.substring(0,60)}${customer.address.length>60?'...':''}</div>
                <div class="customer-details">
                    <span class="customer-distance"><i class="fas fa-road"></i> ${customer.roadDistanceFromSite.toFixed(1)} km</span>
                    <span class="assignment-badge ${customer.assignedVan?'assigned':'unassigned'}">
                        <i class="fas ${customer.assignedVan?'fa-check-circle':'fa-clock'}"></i>
                        ${customer.assignedVan?'Assigned':'Unassigned'}
                    </span>
                    <span class="order-status ${getStatusClass(customer.status)}" style="font-size:0.75em;">${getStatusText(customer.status)}</span>
                </div>
                ${van ? `<div style="font-size:0.85em;margin-bottom:10px;padding:5px;background:#f8f9fa;border-radius:5px;">
                    <span style="color:${van.color}"><i class="fas fa-truck"></i> ${van.name}</span>
                    <span style="margin-left:10px"><i class="fas fa-calendar"></i> ${getDayName(customer.assignedDay)}</span></div>` : ''}
                ${staffList.length ? `<div style="font-size:0.85em;margin-bottom:5px;padding:5px;background:rgba(236,72,153,0.1);border-radius:5px;color:var(--staff);">
                    <i class="fas fa-users"></i> ${staffList.map(s=>s.name).join(', ')}</div>` : ''}
                ${driver ? `<div style="font-size:0.85em;margin-bottom:10px;padding:5px;background:rgba(245,158,11,0.1);border-radius:5px;color:#f59e0b;">
                    <i class="fas fa-truck"></i> Driver: ${driver.name}</div>` : ''}
                <div onclick="event.stopPropagation()" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:6px 8px;background:rgba(99,102,241,0.08);border-radius:6px;border:1px solid rgba(99,102,241,0.2);">
                    <i class="fas fa-shopping-cart" style="color:#6366f1;font-size:12px;flex-shrink:0;"></i>
                    <label style="font-size:11px;font-weight:600;color:#6366f1;white-space:nowrap;flex-shrink:0;">Trolleys:</label>
                    <input
                        type="number"
                        min="0"
                        max="17"
                        value="${parseFloat(customer.passport?.trolleyCount)||0}" step="any"
                        onclick="event.stopPropagation()"
                        onchange="updateTrolleyCount(${customer.id}, this.value, this)"
                        style="width:52px;padding:2px 6px;border:1px solid rgba(99,102,241,0.3);border-radius:4px;font-size:12px;font-weight:700;text-align:center;background:white;color:#6366f1;"
                    />
                    <span style="font-size:10px;color:var(--text-muted);">/ ${(typeof MAX_TROLLEYS_PER_RUN !== "undefined" ? MAX_TROLLEYS_PER_RUN : 17)}</span>
                </div>
                <div class="customer-actions" onclick="event.stopPropagation()">
                    <button class="btn-view" onclick="showStatusUpdateModal(customers.find(c=>c.id===${customer.id}))">
                        <i class="fas fa-edit"></i> Status
                    </button>
                    <button class="btn-passport" onclick="openPassportModal(${customer.id})">
                        <i class="fas fa-passport"></i> Passport
                    </button>
                    ${customer.status === ORDER_STATUSES.DELIVERED || customer.status === ORDER_STATUSES.COLLECTED || customer.status === ORDER_STATUSES.CANCELLED ? 
                        `<button class="btn-clear" onclick="event.stopPropagation();promptClearOrderData(${customer.id})">
                            <i class="fas fa-broom"></i> Clear
                        </button>` : ''
                    }
                </div>
            </div>`;
    }).join('')}</div>${paginationHTML}`;
}

function _modalGoPage(page) {
    _modalPage = page;
    renderModalCustomerList(false);
}

function updateTrolleyCount(customerId, value, inputEl) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;

    const count = Math.max(0, Math.min(17, parseInt(value) || 0));
    inputEl.value = count; // clamp visually

    if (!customer.passport) customer.passport = {};
    customer.passport.trolleyCount = parseFloat(count) || 0;

    // Check van capacity before saving
    if (customer.assignedVan && customer.assignedDay) {
        const MAX = (typeof MAX_TROLLEYS_PER_RUN !== 'undefined') ? MAX_TROLLEYS_PER_RUN : 17;
        const vanId = customer.assignedVan;
        const dayId = customer.assignedDay;
        const total = (deliveryPlan[vanId]?.[dayId] || []).reduce((sum, id) => {
            const c = customers.find(x => x.id === id);
            return sum + getTotalTrolleyCount(c);
        }, 0);
        if (total > MAX) {
            inputEl.style.borderColor = '#dc2626';
            inputEl.style.color = '#dc2626';
            showNotification(`⚠️ Total trolleys for this van/day is ${total}/${MAX} — over capacity!`, 'warning');
        } else {
            inputEl.style.borderColor = 'rgba(99,102,241,0.3)';
            inputEl.style.color = '#6366f1';
        }
    }

    quickSavePassport(customer);
}

function filterModalCustomers() { renderModalCustomerList(true); }
function resetModalFilters() { document.getElementById('modalSearchInput').value=''; renderModalCustomerList(true); }
function focusOnCustomerFromModal(customerId) { focusOnCustomer(customerId); }

function _updateAllDisplays() {
    updateVanDaySelector();
    updateGlobalCounters();
    updateOrdersGrid();
    updateWeeklyPlanTable();
    if (document.getElementById('customerModal').classList.contains('active')) renderModalCustomerList();
    if (document.getElementById('screen-staff').classList.contains('active')) renderStaffGrid();
    if (typeof refreshDeliveryRunsPanel === 'function') refreshDeliveryRunsPanel();
}
const updateAllDisplays = debounce(_updateAllDisplays, 50);


// ========== MAIN LOADING FUNCTION ==========
async function loadDataFromJSON() {
    try {
        const modalContainer = document.getElementById('modalCustomerList');
        if (modalContainer) modalContainer.innerHTML=`<div style="text-align:center;padding:50px;"><div class="spinner"></div><p style="color:var(--gray-500);margin-top:20px;">Loading customer data...</p></div>`;

        customers=[]; 
        markers.clearLayers(); 
        deliveryMarkers.clearLayers(); 
        deliveryRoutes.clearLayers();
        addWarehouseMarker();

        // ── Load vans config from server FIRST so custom vans are known ──────
        // Without this, a 4th van created in Settings reverts to 3 on refresh
        try {
            const cfg = await fetch(`${SERVER_URL}/api/config`).then(r => r.json()).catch(() => ({}));
            if (cfg.vans && cfg.vans.length) {
                // Rebuild global VANS array from saved config
                VANS.length = 0;
                cfg.vans.forEach(function(v) {
                    VANS.push({ id: v.id, name: v.name, color: v.color, iconColor: v.color || v.color, capacity: v.capacity || 50, driver: v.driver || '' });
                });
                console.log('[config] Loaded ' + VANS.length + ' vans from server config:', VANS.map(v => v.name).join(', '));
            }
            // Also apply other config values on startup
            if (cfg.eodTime && typeof setEODResetTime === 'function') setEODResetTime(cfg.eodTime);
            if (cfg.optimiserEngine) window.OPTIMISER_ENGINE = cfg.optimiserEngine;
            if (cfg.stopTime) STOP_TIME_PER_DELIVERY = cfg.stopTime;
        } catch(e) {
            console.warn('[config] Could not load config from server, using defaults:', e.message);
        }

        // Build deliveryPlan with correct van IDs (after vans are loaded)
        deliveryPlan = emptyDeliveryPlan();

        // Store the enhanced customer data for zone lookup
        enhancedCustomersData = customersJSON;

        const serverCustomers = await requestCustomersFromServer();
        
        if (serverCustomers && serverCustomers.length > 0) {
            console.log(`Loaded ${serverCustomers.length} customers from server`);
            rebuildCustomersFromServerData(serverCustomers);
            
            const hasSaved = loadSavedData(true); // server loaded — skip customer assignment overwrite
            loadCardStates();
            
            updateMapMarkers(); 
            map.setView([YOUR_SITE.lat,YOUR_SITE.lng],10);
            updateVanDaySelector(); 
            updateGlobalCounters();
            updateAllDisplays(); 
            normalizeCollectionZones()
            await showVanDayRoute(currentVan,currentDay);
            if (modalContainer) renderModalCustomerList();
            
            return;
        }
        
        if (typeof customersJSON==='undefined' || !customersJSON.length) {
            if (modalContainer) modalContainer.innerHTML=`<div style="text-align:center;padding:50px;color:#666;"><i class="fas fa-database fa-3x" style="margin-bottom:20px;color:var(--gray-400);"></i><h3>No Customer Data</h3><p>Please add your customer JSON data.</p></div>`;
            return;
        }

        let validCount=0, invalidCount=0;
        for (let i=0; i<customersJSON.length; i++) {
            const c   = customersJSON[i];
            const lat = parseFloat(c.Latitude||c.latitude||c.Lat||c.lat);
            const lng = parseFloat(c.Longitude||c.longitude||c.Lon||c.lng||c.Long);
            
            if (c.Name && !isNaN(lat) && !isNaN(lng)) {
                // Pass the customer name to determineZone to check for manual assignment
                const zone = determineZone(lat, lng, c.Name);
                
                // Store delivery day preference if available
                const deliveryDay = c["Delivery day"] || "";
                
                customers.push({ 
                    id: customers.length + 1, 
                    name: c.Name, 
                    address: c.Address + (c.Pincode ? ' ' + c.Pincode : ''), 
                    postcode: c.Pincode || '', 
                    lat, lng,
                    zone: zone,
                    // Store the delivery day preference (can be used for auto-assignment later)
                    preferredDeliveryDay: deliveryDay,
                    roadDistanceFromSite: 0, 
                    roadDurationFromSite: 0, 
                    isEstimated: true,
                    assignedVan: null, 
                    assignedDay: null, 
                    deliveryOrder: 0, 
                    status: ORDER_STATUSES.PENDING, 
                    assignedStaff: [], 
                    assignedDriver: null, 
                    passport: null, 
                    originalData: c 
                });
                validCount++;
            } else { 
                invalidCount++; 
            }
            if (i%50===0) await new Promise(r=>setTimeout(r,0));
        }

        console.log(`Loaded ${validCount} valid customers, ${invalidCount} invalid entries`);
        console.log('Zone assignment summary:');
        
        // Count customers by zone
        const zoneCounts = {};
        customers.forEach(c => {
            zoneCounts[c.zone] = (zoneCounts[c.zone] || 0) + 1;
        });
        console.log('Zone distribution:', zoneCounts);

        uploadCustomersToServer();

        const hasSaved = loadSavedData(false); // offline path — apply localStorage assignments
        loadCardStates();

        const immediate = Math.min(50, customers.length);
        for (let i=0; i<immediate; i++) {
            const rd = getRoadDistanceDuration(YOUR_SITE.lat,YOUR_SITE.lng,customers[i].lat,customers[i].lng);
            customers[i].roadDistanceFromSite=rd.distance; 
            customers[i].roadDurationFromSite=rd.duration;
        }

        updateMapMarkers(); 
        map.setView([YOUR_SITE.lat,YOUR_SITE.lng],10);
        updateVanDaySelector(); 
        updateGlobalCounters();
        updateAllDisplays(); 
        await showVanDayRoute(currentVan,currentDay);
        if (modalContainer) renderModalCustomerList();

        setTimeout(async () => {
            for (let i=immediate; i<customers.length; i++) {
                const rd = getRoadDistanceDuration(YOUR_SITE.lat,YOUR_SITE.lng,customers[i].lat,customers[i].lng);
                customers[i].roadDistanceFromSite=rd.distance; 
                customers[i].roadDurationFromSite=rd.duration;
                if (i%50===0) {
                    if (document.getElementById('customerModal').classList.contains('active')) renderModalCustomerList();
                    await new Promise(r=>setTimeout(r,0));
                }
            }
            updateAllDisplays();
            if (document.getElementById('customerModal').classList.contains('active')) renderModalCustomerList();
            
            // Log final zone assignment for verification
            console.log('Final zone assignments loaded');
            if (typeof checkZoneAssignments === 'function') checkZoneAssignments();
        }, 1000);

    } catch (error) {
        console.error('Error loading data from JSON:', error);
        const el = document.getElementById('modalCustomerList');
        if (el) el.innerHTML=`<div style="color:red;padding:20px;background:#ffebee;border-radius:5px;"><h3>Error loading data</h3><p>${error.message}</p></div>`;
    }
}

// ── Select-Run Modal ──────────────────────────────────────────────────────────
var _pendingRunAssignment = null; // { customerId, vanId, dayId }

function _showSelectRunModal(runBuckets, maxTrolleys, orderTrolleys) {
    const list = document.getElementById('selectRunList');
    if (!list) return;

    list.innerHTML = runBuckets.map((run, i) => {
        const spare = maxTrolleys - run.trolleys;
        const fits  = spare >= orderTrolleys;
        const pct   = Math.round((run.trolleys / maxTrolleys) * 100);
        const barColor = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e';
        return `
        <div onclick="${fits ? `confirmRunSelection(${i})` : ''}"
             style="border:2px solid ${fits ? '#6366f1' : '#e5e7eb'};border-radius:10px;padding:14px 16px;
                    cursor:${fits ? 'pointer' : 'not-allowed'};opacity:${fits ? '1' : '0.5'};
                    background:var(--surface);transition:border-color .15s;"
             onmouseover="${fits ? "this.style.borderColor='#4f46e5'" : ''}"
             onmouseout="${fits ? "this.style.borderColor='#6366f1'" : ''}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <span style="font-weight:700;font-size:14px;color:var(--text);">Run ${i + 1}</span>
                <span style="font-size:12px;color:${fits ? '#6366f1' : '#ef4444'};font-weight:600;">
                    ${fits ? `${spare} spare slot${spare !== 1 ? 's' : ''}` : 'No space for this order'}
                </span>
            </div>
            <div style="background:var(--border);border-radius:4px;height:8px;margin-bottom:6px;">
                <div style="width:${pct}%;height:100%;border-radius:4px;background:${barColor};transition:width .3s;"></div>
            </div>
            <div style="font-size:12px;color:var(--text-muted);">
                ${run.trolleys} / ${maxTrolleys} trolleys used &nbsp;·&nbsp; ${run.ids.length} stop${run.ids.length !== 1 ? 's' : ''}
            </div>
        </div>`;
    }).join('');

    // Option to start a new run
    const newRunFits = orderTrolleys <= maxTrolleys;
    list.innerHTML += `
        <div onclick="${newRunFits ? 'confirmRunSelection(-1)' : ''}"
             style="border:2px dashed ${newRunFits ? '#6366f1' : '#e5e7eb'};border-radius:10px;padding:14px 16px;
                    cursor:${newRunFits ? 'pointer' : 'not-allowed'};opacity:${newRunFits ? '1' : '0.5'};
                    background:transparent;text-align:center;"
             onmouseover="${newRunFits ? "this.style.borderColor='#4f46e5'" : ''}"
             onmouseout="${newRunFits ? "this.style.borderColor='#6366f1'" : ''}">
            <i class="fas fa-plus-circle" style="color:#6366f1;margin-right:6px;"></i>
            <span style="font-weight:600;font-size:13px;color:var(--text);">Start a new Run ${runBuckets.length + 1}</span>
        </div>`;

    document.getElementById('selectRunModal').style.display = 'flex';
}

function closeSelectRunModal() {
    document.getElementById('selectRunModal').style.display = 'none';
    _pendingRunAssignment = null;
}

async function confirmRunSelection(runIndex) {
    // runIndex = -1 means start a new run (just append)
    if (!_pendingRunAssignment) return;
    const { customerId, vanId, dayId } = _pendingRunAssignment;
    _pendingRunAssignment = null;
    closeSelectRunModal();

    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;

    const MAX_TROLLEYS = getVanTrolleyLimit(vanId);

    // Build current runs to find insertion point
    const existingIds = (deliveryPlan[vanId]?.[dayId] || []).filter(id => id !== customerId);
    const existingCusts = existingIds.map(id => customers.find(x => x.id === id)).filter(Boolean);

    const runBuckets = [];
    let bucket = [], bucketTrolleys = 0;
    existingCusts.forEach(c => {
        const t = getTotalTrolleyCount(c);
        if (bucketTrolleys + t > MAX_TROLLEYS && bucket.length > 0) {
            runBuckets.push(bucket.map(x => x.id));
            bucket = []; bucketTrolleys = 0;
        }
        bucket.push(c); bucketTrolleys += t;
    });
    if (bucket.length > 0) runBuckets.push(bucket.map(x => x.id));

    // Remove customer from old assignment if present
    if (customer.assignedVan && customer.assignedDay) {
        const oldIdx = deliveryPlan[customer.assignedVan]?.[customer.assignedDay]?.indexOf(customerId);
        if (oldIdx !== undefined && oldIdx > -1) {
            deliveryPlan[customer.assignedVan][customer.assignedDay].splice(oldIdx, 1);
        }
        invalidateRouteCache(customer.assignedVan, customer.assignedDay);
    }
    invalidateRouteCache(vanId, dayId);

    if (!deliveryPlan[vanId]) { deliveryPlan[vanId] = {}; DAYS.forEach(d => { deliveryPlan[vanId][d.id] = []; }); }
    if (!deliveryPlan[vanId][dayId]) deliveryPlan[vanId][dayId] = [];

    if (runIndex === -1 || runIndex >= runBuckets.length) {
        // Append to end (new run)
        deliveryPlan[vanId][dayId].push(customerId);
    } else {
        // Insert after the last customer of the chosen run
        const targetRunIds = runBuckets[runIndex];
        const lastId = targetRunIds[targetRunIds.length - 1];
        const insertAfter = deliveryPlan[vanId][dayId].indexOf(lastId);
        deliveryPlan[vanId][dayId].splice(insertAfter + 1, 0, customerId);
    }

    customer.assignedVan = vanId;
    customer.assignedDay = dayId;

    if (customer.zone === 'Collection') {
        customer.zone = determineZone(customer.lat, customer.lng);
    }

    updateMapMarkers();
    updateAllDisplays();
    await showVanDayRoute(vanId, dayId);
    quickSaveCustomer(customer);

    const van = VANS.find(v => v.id === vanId);
    const day = DAYS.find(d => d.id === dayId);
    showNotification(`Assigned to ${van?.name} on ${day?.name} — Run ${runIndex === -1 ? runBuckets.length + 1 : runIndex + 1}`);
}


// Debug function to check zone assignments
function checkZoneAssignments() {
    console.log('===== ZONE ASSIGNMENT CHECK =====');
    const manualCount = customers.filter(c => 
        enhancedCustomersData.some(ec => ec.Name === c.name && ec.Zone && ec.Zone.trim() !== '')
    ).length;
    
    console.log(`Total customers: ${customers.length}`);
    console.log(`Customers with manual zones: ${manualCount}`);
    console.log(`Customers using calculated zones: ${customers.length - manualCount}`);
    
    // Show a few examples
    const examples = customers.filter(c => 
        enhancedCustomersData.some(ec => ec.Name === c.name && ec.Zone && ec.Zone.trim() !== '')
    ).slice(0, 5);
    
    examples.forEach(c => {
        const original = enhancedCustomersData.find(ec => ec.Name === c.name);
        console.log(`${c.name}: Manual Zone = "${original.Zone}" → Assigned Zone = "${c.zone}"`);
    });
}



function adminEditCustomer(id) {
    const customer = customers.find(c => c.id === id);
    if (!customer) return;

    // Populate zone dropdown with your zone names
    const zoneOptions = [
        'Collection',
        'Local',
        'South East',
        'South West',
        'London/North East',
        'North West'
    ];
    const zoneSelect = document.getElementById('editCustomerZone');
    zoneSelect.innerHTML = zoneOptions
        .map(z => `<option value="${z}" ${customer.zone === z ? 'selected' : ''}>${z}</option>`)
        .join('');

    // Populate day dropdown with all days
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

function closeEditCustomerModal() {
    document.getElementById('editCustomerModal').classList.remove('active');
}

async function adminUpdateCustomer() {
    const id = parseFloat(document.getElementById('editCustomerId').value); // IDs are floats
    const name = document.getElementById('editCustomerName').value.trim();
    const address = document.getElementById('editCustomerAddress').value.trim();
    const postcode = document.getElementById('editCustomerPostcode').value.trim();
    const lat = parseFloat(document.getElementById('editCustomerLat').value);
    const lng = parseFloat(document.getElementById('editCustomerLng').value);
    const zone = document.getElementById('editCustomerZone').value;
    const assignedDay = document.getElementById('editCustomerDay').value ? parseInt(document.getElementById('editCustomerDay').value) : null;

    if (!name || isNaN(lat) || isNaN(lng)) {
        showNotification('Name, latitude and longitude are required', 'warning');
        return;
    }

    try {
        const res = await fetch(`${SERVER_URL}/api/customer/single/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, address, postcode, lat, lng, zone, assignedDay })
        });
        const data = await res.json();
        if (data.success) {
            // Update local customer object
            const customer = customers.find(c => c.id === id);
            if (customer) {
                customer.name = name;
                customer.address = address;
                customer.postcode = postcode;
                customer.lat = lat;
                customer.lng = lng;
                customer.zone = zone;
                customer.assignedDay = assignedDay;
                // Recalculate distance and zone
                const rd = getRoadDistanceDuration(YOUR_SITE.lat, YOUR_SITE.lng, lat, lng);
                customer.roadDistanceFromSite = rd.distance;
                customer.roadDurationFromSite = rd.duration;
                if (customer.assignedVan && assignedDay) {
                    // update delivery plan if needed
                }
                updateAllDisplays();
                showNotification('Customer updated', 'success');
                closeEditCustomerModal();
                renderAdminCustomerList(); // refresh the list in settings
            }
        } else {
            showNotification(data.message || 'Update failed', 'error');
        }
    } catch (err) {
        console.error(err);
        showNotification('Server error', 'error');
    }
}
