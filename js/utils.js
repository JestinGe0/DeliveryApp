// ========== HELPER FUNCTIONS ==========

// ── Distance cache persistence ────────────────────────────────────────────
// roadDistanceCache is warmed from Valhalla on startup (~415 calls).
// Persisting it means subsequent page loads skip Valhalla entirely.
var DISTANCE_CACHE_KEY = 'PEP_road_distance_cache';
var DISTANCE_CACHE_VERSION_KEY = 'PEP_road_distance_cache_version';

function loadDistanceCacheFromStorage() {
    try {
        // Version key = customer count — if customers change, cache is stale
        var savedVersion = localStorage.getItem(DISTANCE_CACHE_VERSION_KEY);
        var saved = localStorage.getItem(DISTANCE_CACHE_KEY);
        if (saved && savedVersion) {
            var parsed = JSON.parse(saved);
            var keys = Object.keys(parsed).length;
            if (keys > 0) {
                Object.assign(roadDistanceCache, parsed);
                console.log('[distance cache] Loaded', keys, 'entries from storage (version:', savedVersion + ')');
                return keys;
            }
        }
    } catch(e) { console.warn('[distance cache] Load failed:', e.message); }
    return 0;
}

function saveDistanceCacheToStorage(customerCount) {
    try {
        // Only save real (non-estimated) entries — haversine estimates aren't worth persisting
        var realEntries = {};
        Object.keys(roadDistanceCache).forEach(function(k) {
            if (!roadDistanceCache[k].isEstimated) realEntries[k] = roadDistanceCache[k];
        });
        localStorage.setItem(DISTANCE_CACHE_KEY, JSON.stringify(realEntries));
        localStorage.setItem(DISTANCE_CACHE_VERSION_KEY, String(customerCount || 0));
        console.log('[distance cache] Saved', Object.keys(realEntries).length, 'real distance entries');
    } catch(e) {
        console.warn('[distance cache] Save failed (storage full?):', e.message);
    }
}

function clearDistanceCacheStorage() {
    localStorage.removeItem(DISTANCE_CACHE_KEY);
    localStorage.removeItem(DISTANCE_CACHE_VERSION_KEY);
    roadDistanceCache = {};
    console.log('[distance cache] Cleared');
}

// Synchronous distance estimate (haversine × 1.4)
// Used as immediate fallback when ORS cache is cold or unavailable
function getRoadDistanceDuration(startLat, startLng, endLat, endLng) {
    const cacheKey = `${startLat},${startLng}|${endLat},${endLng}`;
    if (roadDistanceCache[cacheKey]) return roadDistanceCache[cacheKey];

    const R = 6371;
    const lat1 = startLat * Math.PI / 180;
    const lat2 = endLat   * Math.PI / 180;
    const dLat = (endLat - startLat) * Math.PI / 180;
    const dLon = (endLng - startLng) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const straightDistance = R * c;
    const roadDistance = straightDistance * 1.4;
    const duration = roadDistance * 1.5;
    const result = { distance: roadDistance, duration, isEstimated: true };
    roadDistanceCache[cacheKey] = result;
    return result;
}

// ========== REAL ROAD DISTANCES (OpenRouteService via Node proxy) ==========

// Batch-warms roadDistanceCache with real ORS distances for all customers.
// Makes one API call per 49 customers (ORS free tier: max 50 locations per call).
// Falls back silently to haversine for any batch that fails.
// Returns the number of customers successfully warmed with real distances.
async function warmRoadDistanceCache(customerList) {
    const valid = customerList.filter(c =>
        c.lat && c.lng && !isNaN(parseFloat(c.lat)) && !isNaN(parseFloat(c.lng))
    );
    if (!valid.length) return 0;

    // Batch size depends on backend:
    // ORS:      49 customers + 1 warehouse = 50 max per call
    // Valhalla: 10 customers per call — hosted demo times out on large matrices
    // OSRM:     49 is fine
    const backend = window._routingBackend || 'ors';
    const BATCH_SIZE = backend === 'valhalla' ? 10 : 49;

    let totalWarmed = 0;

    for (let i = 0; i < valid.length; i += BATCH_SIZE) {
        const batch = valid.slice(i, i + BATCH_SIZE);

        const locations = [
            [YOUR_SITE.lng, YOUR_SITE.lat],
            ...batch.map(c => [parseFloat(c.lng), parseFloat(c.lat)])
        ];

        try {
            const res = await fetch(`${SERVER_URL}/api/road-matrix`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ locations })
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Matrix proxy returned ${res.status}: ${errText}`);
            }

            const data = await res.json();
            if (!data.distances || !data.durations) {
                throw new Error('Invalid response — missing distances/durations');
            }

            batch.forEach((customer, j) => {
                const idx = j + 1;

                const dist = data.distances[0][idx];
                const dur  = data.durations[0][idx];

                // Skip unreachable pairs (Valhalla returns 0 for >400km pairs)
                // Fall back to haversine for those specific customers
                if (!dist || dist === 0) {
                    const rd = getRoadDistanceDuration(YOUR_SITE.lat, YOUR_SITE.lng, customer.lat, customer.lng);
                    customer.roadDistanceFromSite = rd.distance;
                    customer.roadDurationFromSite = rd.duration;
                    customer.isEstimated = true;
                    return;
                }

                // warehouse → customer
                const key1 = `${YOUR_SITE.lat},${YOUR_SITE.lng}|${customer.lat},${customer.lng}`;
                roadDistanceCache[key1] = {
                    distance: dist,
                    duration: dur / 60,   // seconds → minutes
                    isEstimated: false
                };

                // customer → warehouse (return leg)
                const key2 = `${customer.lat},${customer.lng}|${YOUR_SITE.lat},${YOUR_SITE.lng}`;
                roadDistanceCache[key2] = {
                    distance: data.distances[idx][0] || dist,
                    duration: (data.durations[idx][0] || dur) / 60,
                    isEstimated: false
                };

                customer.roadDistanceFromSite = dist;
                customer.roadDurationFromSite = dur / 60;
                customer.isEstimated = false;
                totalWarmed++;
            });

        } catch (err) {
            console.warn(`[routing] Batch ${i}–${i + batch.length} failed — haversine fallback:`, err.message);
            batch.forEach(customer => {
                const rd = getRoadDistanceDuration(YOUR_SITE.lat, YOUR_SITE.lng, customer.lat, customer.lng);
                customer.roadDistanceFromSite = rd.distance;
                customer.roadDurationFromSite = rd.duration;
            });
        }

        // Small delay between batches for Valhalla hosted demo to avoid rate limiting
        if (backend === 'valhalla' && i + BATCH_SIZE < valid.length) {
            await new Promise(r => setTimeout(r, 300));
        }
    }

    // Persist to localStorage so next page load skips Valhalla entirely
    if (totalWarmed > 0) saveDistanceCacheToStorage(valid.length);
    return totalWarmed;
}

// Async single-pair lookup — checks cache first, fetches from ORS if cold, haversine if ORS fails.
// Use this in new async code (e.g. route-controller.js in Phase 2).
// Existing synchronous callers keep using getRoadDistanceDuration which hits the warmed cache.
async function getRoadDistanceDurationAsync(startLat, startLng, endLat, endLng) {
    const cacheKey = `${startLat},${startLng}|${endLat},${endLng}`;
    if (roadDistanceCache[cacheKey]) return roadDistanceCache[cacheKey];

    try {
        const res = await fetch(`${SERVER_URL}/api/road-matrix`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                locations: [
                    [startLng, startLat], // ORS: [lng, lat]
                    [endLng,   endLat]
                ]
            })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const result = {
            distance: data.distances[0][1] || 0,
            duration: (data.durations[0][1] || 0) / 60,
            isEstimated: false
        };
        roadDistanceCache[cacheKey] = result;
        return result;
    } catch {
        return getRoadDistanceDuration(startLat, startLng, endLat, endLng);
    }
}

// ========== REMAINING HELPERS (unchanged) ==========

function calculateStraightDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function determineZone(lat, lng, customerName = null) {
    if (customerName) {
        const enhancedCustomer = enhancedCustomersData.find(c => c.Name === customerName);
        if (enhancedCustomer && enhancedCustomer.Zone && enhancedCustomer.Zone.trim() !== '') {
            const manualZone = enhancedCustomer.Zone.trim();
            const zoneMap = {
                'South / East': 'South East',
                'South East': 'South East',
                'South / West': 'South West',
                'South West': 'South West',
                'North / West': 'North West',
                'North West': 'North West',
                'LONDON / North East': 'London/North East',
                'London/North East': 'London/North East',
                'LOCAL': 'Local',
                'Local': 'Local',
                'collection': 'Collection',
                'Collection': 'Collection'
            };
            return zoneMap[manualZone] || manualZone;
        }
    }

    lat = parseFloat(lat);
    lng = parseFloat(lng);
    if (isNaN(lat) || isNaN(lng)) return 'Local';

    const distance = calculateStraightDistance(YOUR_SITE.lat, YOUR_SITE.lng, lat, lng);
    if (distance <= LOCAL_ZONE_RADIUS) return 'Local';
    if (lat >= 53.0 && lat <= 55.0 && lng >= -3.5 && lng <= -2.0) return 'North West';
    if (lat >= 50.0 && lat <= 52.0 && lng >= -5.0 && lng <= -2.5) return 'South West';
    if (lat >= 51.0 && lat <= 52.5 && lng >= -0.5 && lng <= 1.5) return 'London/North East';
    if (lat >= 50.5 && lat <= 51.5 && lng >= -1.0 && lng <= 1.0) return 'South East';
    return 'Local';
}

function getDayName(dayId) {
    const day = DAYS.find(d => d.id === dayId);
    return day ? day.name : 'Unknown';
}

function getStatusText(status) {
    if (!status) return 'Pending';
    switch (status) {
        case ORDER_STATUSES.PENDING:            return 'Pending';
        case ORDER_STATUSES.PICKING:            return 'Picking';
        case ORDER_STATUSES.READY_FOR_DELIVERY: return 'Ready for Delivery';
        case ORDER_STATUSES.DELIVERING:         return 'Delivering';
        case ORDER_STATUSES.DELIVERED:          return 'Delivered';
        case ORDER_STATUSES.COLLECTED:          return 'Collected';
        case ORDER_STATUSES.CANCELLED:          return 'Cancelled';
        default: return status.charAt(0).toUpperCase() + status.slice(1);
    }
}

function getStatusClass(status) {
    switch (status) {
        case ORDER_STATUSES.PENDING:            return 'status-pending';
        case ORDER_STATUSES.PICKING:            return 'status-picking';
        case ORDER_STATUSES.READY_FOR_DELIVERY: return 'status-ready';
        case ORDER_STATUSES.DELIVERING:         return 'status-delivering';
        case ORDER_STATUSES.DELIVERED:          return 'status-delivered';
        case ORDER_STATUSES.COLLECTED:          return 'status-collected';
        case ORDER_STATUSES.CANCELLED:          return 'status-cancelled';
        default: return 'status-pending';
    }
}

function getStatusBadgeColor(status) {
    switch (status) {
        case ORDER_STATUSES.PENDING:            return '#f44336';
        case ORDER_STATUSES.PICKING:            return '#ffc107';
        case ORDER_STATUSES.READY_FOR_DELIVERY: return '#f57c00';
        case ORDER_STATUSES.DELIVERING:         return '#4caf50';
        case ORDER_STATUSES.DELIVERED:          return '#9e9e9e';
        case ORDER_STATUSES.CANCELLED:          return '#d32f2f';
        case ORDER_STATUSES.COLLECTED:          return '#8b5cf6';
        default: return '#fb923c';
    }
}

function showNotification(message, type = 'success') {
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        container.style.cssText = `
            position: fixed; top: 20px; right: 20px;
            display: flex; flex-direction: column; gap: 8px;
            z-index: 3000; max-width: 320px;
        `;
        document.body.appendChild(container);
    }

    const bg = type === 'success' ? 'rgba(40,167,69,0.82)' : type === 'warning' ? 'rgba(255,193,7,0.82)' : 'rgba(220,53,69,0.82)';
    const icon = type === 'success' ? 'fa-check-circle' : type === 'warning' ? 'fa-exclamation-triangle' : 'fa-exclamation-circle';

    const notification = document.createElement('div');
    notification.style.cssText = `
        background: ${bg}; color: white; padding: 12px 18px; border-radius: 8px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2); backdrop-filter: blur(6px); font-size: 14px; font-weight: 500;
        display: flex; align-items: center; gap: 10px;
        opacity: 0; transform: translateX(40px);
        transition: opacity 0.25s ease, transform 0.25s ease;
    `;
    notification.innerHTML = `<i class="fas ${icon}" style="flex-shrink:0"></i><span>${message}</span>`;
    container.appendChild(notification);

    // Animate in
    requestAnimationFrame(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    });

    // Animate out then remove
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(40px)';
        setTimeout(() => {
            notification.remove();
            if (container.children.length === 0) container.remove();
        }, 260);
    }, 3000);
}

// ========== TIME FORMATTER ==========
// Single source of truth for HH:MM / h:MM AM/PM display.
// Reads companyConfig.timeFormat ('24' or '12'). Defaults to 24-hour.
function formatTime(date) {
    if (!date) return '--:--';
    var d = (date instanceof Date) ? date : new Date(date);
    if (isNaN(d)) return '--:--';
    var use12 = (typeof companyConfig !== 'undefined' && companyConfig && companyConfig.timeFormat === '12');
    if (use12) {
        var h = d.getHours();
        var m = d.getMinutes();
        var ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return h + ':' + m.toString().padStart(2, '0') + ' ' + ampm;
    }
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}
window.formatTime = formatTime;

// ========== VAN TROLLEY LIMIT HELPER ==========
// Returns the effective trolley-per-run limit for a given van.
// Uses van.capacity if it is set below the global MAX_TROLLEYS_PER_RUN,
// otherwise falls back to MAX_TROLLEYS_PER_RUN.
function getVanTrolleyLimit(vanId) {
    var MAX = (typeof MAX_TROLLEYS_PER_RUN !== 'undefined') ? MAX_TROLLEYS_PER_RUN : 17;
    var van = (typeof VANS !== 'undefined') ? VANS.find(function(v){ return v.id === vanId; }) : null;
    if (van && van.capacity && van.capacity > 0 && van.capacity < MAX) return van.capacity;
    return MAX;
}
window.getVanTrolleyLimit = getVanTrolleyLimit;

// ========== TROLLEY COUNT HELPER ==========
// Returns the SUM of primary passport trolleyCount + all additional orders
// Use this everywhere instead of reading passport.trolleyCount directly.
function getTotalTrolleyCount(customer) {
    if (!customer || !customer.passport) return 0;
    var primary = parseFloat(customer.passport.trolleyCount) || 0;
    var extra   = Array.isArray(customer.passport.orders)
        ? customer.passport.orders.reduce(function(sum, o) {
              return sum + (parseFloat(o.trolleyCount) || 0);
          }, 0)
        : 0;
    return primary + extra;
}
window.getTotalTrolleyCount = getTotalTrolleyCount;
