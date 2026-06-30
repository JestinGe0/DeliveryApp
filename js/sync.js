// Upload customers to server if this is the first client
async function uploadCustomersToServer() {
    if (typeof customersJSON !== 'undefined' && customersJSON.length > 0) {
        try {
            const response = await fetch(`${SERVER_URL}/api/customers`);
            const data = await response.json();
            
            if (!data.customers || data.customers.length === 0) {
                console.log('Uploading customer data to server...');
                await fetch(`${SERVER_URL}/api/customers`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(customersJSON)
                });
                console.log('Customer data uploaded successfully');
            } else if (data.customers.length !== customersJSON.length) {
                console.log('Customer count mismatch - updating server...');
                await fetch(`${SERVER_URL}/api/customers`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(customersJSON)
                });
            }
        } catch (error) {
            console.log('Could not upload customers to server:', error);
        }
    }
}

// Request customers from server
async function requestCustomersFromServer() {
    try {
        const response = await fetch(`${SERVER_URL}/api/customers`);
        const data = await response.json();
        const serverCustomers = data.customers || [];

        // Cache base identity fields for offline use
        if (serverCustomers.length > 0) {
            try {
                const base = serverCustomers.map(c => ({
                    id:       c.id,
                    name:     c.name,
                    address:  c.address  || '',
                    postcode: c.postcode || '',
                    lat:      c.lat,
                    lng:      c.lng,
                    zone:     c.zone     || 'Local',
                    roadDistanceFromSite: c.roadDistanceFromSite || 0,
                    roadDurationFromSite: c.roadDurationFromSite || 0
                }));
                localStorage.setItem(CUSTOMERS_BASE_KEY, JSON.stringify({
                    customers: base,
                    savedAt: new Date().toISOString(),
                    count: base.length
                }));
                console.log(`[customers cache] Saved ${base.length} base records for offline use`);
            } catch(e) {
                console.warn('[customers cache] Could not save to localStorage:', e.message);
            }
        }

        return serverCustomers;
    } catch (error) {
        console.warn('[customers] Server unreachable — trying offline cache:', error.message);

        // Fall back to cached customer base
        try {
            const cached = localStorage.getItem(CUSTOMERS_BASE_KEY);
            if (cached) {
                const { customers: base, savedAt, count } = JSON.parse(cached);
                if (base && base.length > 0) {
                    showNotification(
                        `Offline mode — showing ${count} cached customers (last synced ${new Date(savedAt).toLocaleDateString()})`,
                        'warning'
                    );
                    console.log(`[customers cache] Loaded ${base.length} customers from offline cache`);
                    return base;
                }
            }
        } catch(e) {
            console.warn('[customers cache] Could not read offline cache:', e.message);
        }

        return [];
    }
}

// Initialize WebSocket connection
function initWebSocket() {
    try {
        console.log('Connecting to server:', SERVER_URL);
        
        socket = io(SERVER_URL, {
            // WebSocket first — faster on local network, falls back to polling if blocked
            transports: ['websocket', 'polling'],
            upgrade: true,
            reconnectionAttempts: 20,
            reconnectionDelay: 500,        // Retry faster (was 1000ms)
            reconnectionDelayMax: 3000,    // Cap at 3s (was 5s)
            timeout: 10000,               // Faster timeout detection (was 20s)
            forceNew: true
        });
        
        socket.on('connect', () => {
            console.log('Connected to server');
            showNotification('Connected to server', 'success');
            document.getElementById('saveStatus').textContent = 'Connected';
            document.getElementById('saveStatus').style.color = 'var(--success)';

            // Tell server our role so we receive only relevant broadcasts
            const role = (window.currentUser && window.currentUser.role) || 'staff';
            socket.emit('set-role', role);

            if (customers.length === 0) {
                socket.emit('request-customers');
            }
        });
        
        socket.on('connect_error', (error) => {
            console.log('❌ Connection error:', error);
            showNotification('Cannot connect to server - working offline', 'warning');
            document.getElementById('saveStatus').textContent = 'Offline';
            document.getElementById('saveStatus').style.color = 'var(--warning)';
        });
        
        socket.on('disconnect', (reason) => {
            console.log('Disconnected from server:', reason);
            showNotification('Disconnected from server - working offline', 'warning');
            document.getElementById('saveStatus').textContent = 'Offline';
            document.getElementById('saveStatus').style.color = 'var(--warning)';
        });
        
        socket.on('reconnect', (attemptNumber) => {
            console.log('Reconnected to server after', attemptNumber, 'attempts');
            showNotification('Reconnected to server', 'success');
            document.getElementById('saveStatus').textContent = 'Connected';
            document.getElementById('saveStatus').style.color = 'var(--success)';
            
            if (customers.length === 0) {
                socket.emit('request-customers');
            }
        });
        
        socket.on('reconnect_failed', () => {
            console.log('Failed to reconnect to server');
            showNotification('Failed to reconnect - working offline', 'warning');
        });
        
        socket.on('initial-data', (serverData) => {
            console.log('📦 Received initial data from server');
            mergeServerData(serverData);
        });
        
        socket.on('customers-data', (customersData) => {
            console.log('📦 Received customers data from server');
            if (customers.length === 0 && customersData && customersData.length > 0) {
                rebuildCustomersFromServerData(customersData);
                // Re-apply saved delivery data so zone overrides (e.g. Collection) survive
                try {
                    const saved = localStorage.getItem(STORAGE_KEY);
                    if (saved) {
                        const parsed = JSON.parse(saved);
                        if (parsed && parsed.customers) updateLocalDeliveryData(parsed);
                    }
                } catch(e) {}
            }
        });
        
        socket.on('customers-updated', (customersData) => {
            console.log('📦 Customers updated by another client');
            if (customersData && customersData.length > 0) {
                rebuildCustomersFromServerData(customersData);
            }
        });
        
        socket.on('delivery-data-updated', (data) => {
            console.log('[sync] Full delivery data received from another client');
            // Preserve this device's van/day selection — don't let sender override it
            var myVan = currentVan;
            var myDay = currentDay;
            updateLocalDeliveryData(data);
            currentVan = myVan;
            currentDay = myDay;
            showNotification('Live update received', 'info');
        });

        // Fast single-customer sync — applies immediately on other devices
        socket.on('customer-updated', (updatedCustomer) => {
            const customer = customers.find(c => c.id === updatedCustomer.id);
            if (!customer) return;

            const oldVan = customer.assignedVan;
            const oldDay = customer.assignedDay;

            if (updatedCustomer.status        !== undefined) customer.status        = updatedCustomer.status;
            if (updatedCustomer.assignedVan   !== undefined) customer.assignedVan   = updatedCustomer.assignedVan;
            if (updatedCustomer.assignedDay   !== undefined) customer.assignedDay   = updatedCustomer.assignedDay;
            if (updatedCustomer.assignedStaff !== undefined) customer.assignedStaff = updatedCustomer.assignedStaff;
            if (updatedCustomer.assignedDriver!== undefined) customer.assignedDriver= updatedCustomer.assignedDriver;
            if (updatedCustomer.passport      !== undefined) customer.passport      = updatedCustomer.passport;
            if (updatedCustomer.zone          !== undefined) customer.zone          = updatedCustomer.zone;
            if (updatedCustomer.deliveryOrder !== undefined) customer.deliveryOrder = updatedCustomer.deliveryOrder;
            if (updatedCustomer.bayNumber     !== undefined) customer.bayNumber     = updatedCustomer.bayNumber;
            if (updatedCustomer.bayOverflow   !== undefined) customer.bayOverflow   = updatedCustomer.bayOverflow;

            if (updatedCustomer.deliveryPlanPatch) {
                const { vanId, dayId, customerIds } = updatedCustomer.deliveryPlanPatch;
                if (vanId && dayId !== undefined) {
                    if (!deliveryPlan[vanId]) deliveryPlan[vanId] = {};
                    deliveryPlan[vanId][dayId] = customerIds;
                }
            }

            if (typeof invalidateRouteCache === 'function') {
                if (oldVan && oldDay) invalidateRouteCache(oldVan, oldDay);
                if (customer.assignedVan && customer.assignedDay)
                    invalidateRouteCache(customer.assignedVan, customer.assignedDay);
            }

            // Apply route cache from sender — avoids Valhalla call on this device
            if (updatedCustomer.routeCacheEntry && customer.assignedVan && customer.assignedDay) {
                if (typeof _routeCache !== 'undefined') {
                    var ck = customer.assignedVan + '-' + customer.assignedDay;
                    _routeCache[ck] = updatedCustomer.routeCacheEntry;
                    if (typeof _saveRouteCacheToStorage === 'function') _saveRouteCacheToStorage();
                    console.log('[live-sync] Route cache received for', ck);
                }
            }

            updateAllDisplays();
            if (typeof diagramSyncUpdate === 'function') diagramSyncUpdate();

            // Always refresh the map view — covers all cases:
            // - customer assigned to current van/day (appears on map)
            // - customer removed from current van/day (disappears from map)
            // - status/picker/driver change on a customer in current view
            if (typeof showVanDayRoute === 'function') {
                // Small delay to let updateAllDisplays settle first
                setTimeout(function() {
                    showVanDayRoute(currentVan, currentDay);
                }, 100);
            } else if (typeof updateMapMarkers === 'function') {
                // Fallback: just refresh markers if full route fn unavailable
                updateMapMarkers();
            }

            showNotification('Live: ' + customer.name + ' updated', 'info');
            console.log('[live-sync]', customer.name, 'van:', customer.assignedVan, 'day:', customer.assignedDay);
        });
        
        // Live temp zone moves from other devices
        socket.on('temp-zone-updated', (data) => {
            if (!data || typeof data.overrides === 'undefined') return;
            try {
                // Apply the full overrides map from sender
                window._tempZoneOverrides = data.overrides;
                localStorage.setItem('PEP_temp_zone_overrides', JSON.stringify(data.overrides));
                if (typeof updateOrdersGrid === 'function') updateOrdersGrid();
                if (typeof _updateClearTempBtn === 'function') _updateClearTempBtn();
                const count = Object.keys(data.overrides).length;
                if (count === 0) {
                    showNotification('Temp zone moves cleared by another device', 'info');
                } else {
                    showNotification('Live: zone layout updated', 'info');
                }
            } catch(e) { console.error('[temp-zone] Error applying:', e); }
        });

        socket.on('staff-data-updated', (data) => {
            console.log('🔄 Staff data updated by another client');
            updateLocalStaffData(data);
        });
        
        socket.on('card-states-updated', (data) => {
            console.log('🔄 Card states updated by another client');
            updateLocalCardStates(data);
        });
        
        socket.on('sync-data', (data) => {
            console.log('📦 Received sync data');
            mergeServerData(data);
            if (typeof diagramSyncUpdate === 'function') diagramSyncUpdate();
        });
        
        socket.on('error', (error) => {
            console.error('Socket error:', error);
        });
        socket.on('config-updated',function(cfg){applyCompanyConfig(cfg);});
        socket.on('analytics-history-updated', (historyData) => {
            console.log('📊 Analytics history updated by another client');
            if (historyData && historyData.length > 0) {
                analyticsHistory = historyData;
                saveAnalyticsHistory(); // Save locally
                showNotification('Analytics data synchronized', 'info');
            }
        });
        
    } catch (error) {
        console.error('Failed to initialize WebSocket:', error);
        showNotification('Offline mode - changes saved locally', 'warning');
    }
}

// Merge server data with local data
function mergeServerData(serverData) {
    let updated = false;
    
    if (serverData.delivery) {
        updateLocalDeliveryData(serverData.delivery);
        updated = true;
    }
    if (serverData.staff) {
        updateLocalStaffData(serverData.staff);
        updated = true;
    }
    if (serverData.cardStates) {
        updateLocalCardStates(serverData.cardStates);
        updated = true;
    }
    if (serverData.customers && serverData.customers.length > 0) {
        if (customers.length === 0) {
            rebuildCustomersFromServerData(serverData.customers);
            // Re-apply delivery data now that customers are populated — zones (e.g. Collection)
            // were not applied above because customers was empty at that point.
            if (serverData.delivery) updateLocalDeliveryData(serverData.delivery);
            updated = true;
        }
    }
    
    if (updated) {
        updateAllDisplays();
        showNotification('Data synchronized from server', 'info');
    }
}

// Rebuild customers array from server data
function rebuildCustomersFromServerData(serverCustomers) {
    if (!serverCustomers || serverCustomers.length === 0) {
        console.log('No server customers to rebuild');
        normalizeCollectionZones();
        return;
    }
    
    console.log('Rebuilding customers from server data...', serverCustomers.length);
    
    // Clear existing customers
    customers = [];
    
    // Recreate customers from server data
    serverCustomers.forEach((customerData, index) => {
        try {
            // Handle different possible field name variations
            const name = customerData.name || customerData.Name || customerData.customer_name || 'Unknown';
            const address = customerData.address || customerData.Address || '';
            const postcode = customerData.postcode || customerData.Pincode || customerData.postal_code || '';
            
            // Handle latitude - check all possible field names
            let lat = parseFloat(customerData.latitude || customerData.Latitude || 
                                customerData.lat || customerData.Lat);
            
            // Handle longitude - check all possible field names
            let lng = parseFloat(customerData.longitude || customerData.Longitude || 
                                customerData.lng || customerData.Lng || customerData.Long || customerData.lon);
            
            // If we have originalData, try to extract from there
            if (isNaN(lat) && customerData.originalData) {
                const orig = customerData.originalData;
                lat = parseFloat(orig.Latitude || orig.latitude || orig.Lat || orig.lat);
                lng = parseFloat(orig.Longitude || orig.longitude || orig.Lon || orig.lng || orig.Long || orig.lon);
            }
            
            if (name && !isNaN(lat) && !isNaN(lng)) {
                // Use server-stored zone if present (preserves Collection and manual overrides);
                // fall back to geographic determination for new/unset customers.
                const zone = customerData.zone || determineZone(lat, lng, name);
                
                const customer = {
                    id: customerData.id || customerData.customer_id || index + 1,
                    name: name,
                    address: address,
                    postcode: postcode,
                    lat: lat,
                    lng: lng,
                    zone: zone,
                    roadDistanceFromSite: customerData.roadDistanceFromSite || customerData.road_distance || 0,
                    roadDurationFromSite: customerData.roadDurationFromSite || customerData.road_duration || 0,
                    isEstimated: true,
                    assignedVan: customerData.assignedVan || customerData.assigned_van || null,
                    assignedDay: customerData.assignedDay || customerData.assigned_day || null,
                    deliveryOrder: customerData.deliveryOrder || customerData.delivery_order || 0,
                    status: customerData.status || ORDER_STATUSES.PENDING,
                    assignedStaff: customerData.assignedStaff || customerData.assigned_staff || [],
                    assignedDriver: customerData.assignedDriver || customerData.assigned_driver || null,
                    bayNumber: customerData.bayNumber || customerData.bay_number || null,
                    bayOverflow: customerData.bayOverflow || customerData.bay_overflow || null,
                    passport: customerData.passport || customerData.passport_data || null,
                    originalData: customerData.originalData || customerData
                };
                
                customers.push(customer);
            } else {
                console.log('Invalid customer data:', { name, lat, lng, customerData });
            }
        } catch (e) {
            console.error('Error processing customer:', e, customerData);
        }
    });
    
    console.log(`Rebuilt ${customers.length} customers from server`);
    
    // ── Distance cache: try localStorage first ─────────────────────────────
    // Skips Valhalla entirely if real distances are already stored locally.
    const cachedCount = (typeof loadDistanceCacheFromStorage === 'function')
        ? loadDistanceCacheFromStorage() : 0;

    if (cachedCount > 0) {
        customers.forEach(c => {
            const key = `${YOUR_SITE.lat},${YOUR_SITE.lng}|${c.lat},${c.lng}`;
            const hit = roadDistanceCache[key];
            if (hit && !hit.isEstimated) {
                c.roadDistanceFromSite = hit.distance;
                c.roadDurationFromSite = hit.duration;
                c.isEstimated = false;
            }
        });
        console.log(`[distance cache] Loaded ${cachedCount} entries — Valhalla warm skipped`);
        updateAllDisplays();
        return;
    }

    // ── No cached distances: warm from Valhalla with retry ───────────────
    async function warmWithRetry(attempt) {
        attempt = attempt || 1;
        try {
            const cfg = await fetch(`${SERVER_URL}/api/routing-config`).then(r => r.json()).catch(() => ({ backend: 'ors' }));
            window._routingBackend = cfg.backend || 'ors';

            if (window._routingBackend === 'valhalla') {
                try {
                    const health = await fetch(`${SERVER_URL}/api/road-matrix`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ locations: [[-0.105, 50.936], [-0.14, 51.50]] })
                    });
                    if (!health.ok) throw new Error('not ready');
                } catch (e) {
                    if (attempt <= 12) {
                        console.log(`[Valhalla] Not ready yet, retrying in 15s (attempt ${attempt}/12)...`);
                        setTimeout(() => warmWithRetry(attempt + 1), 15000);
                        return;
                    }
                    console.warn('[Valhalla] Gave up after 3 min — using haversine fallback');
                    window._routingBackend = 'ors';
                }
            }

            const warmed = await warmRoadDistanceCache(customers);
            if (warmed > 0) {
                console.log(`[${(window._routingBackend || 'routing').toUpperCase()}] Real road distances loaded for ${warmed} customers — saved to storage`);
            } else {
                console.log('Distances calculated via haversine fallback');
            }
            updateAllDisplays();
        } catch (err) {
            console.warn('[routing] Warm failed:', err.message);
            updateAllDisplays();
        }
    }
    warmWithRetry();
}

// Update local delivery data
function updateLocalDeliveryData(serverData) {
    if (!customers || !customers.length) return;
    
    if (serverData.customers) {
        serverData.customers.forEach(savedCustomer => {
            const customer = customers.find(c => c.id === savedCustomer.id);
            if (customer) {
                customer.assignedVan = savedCustomer.assignedVan !== undefined ? savedCustomer.assignedVan : customer.assignedVan;
                customer.assignedDay = savedCustomer.assignedDay !== undefined ? savedCustomer.assignedDay : customer.assignedDay;
                customer.deliveryOrder = savedCustomer.deliveryOrder || customer.deliveryOrder || 0;
                customer.status = savedCustomer.status || customer.status || ORDER_STATUSES.PENDING;
                customer.assignedStaff = savedCustomer.assignedStaff || customer.assignedStaff || [];
                customer.assignedDriver = savedCustomer.assignedDriver !== undefined ? savedCustomer.assignedDriver : customer.assignedDriver;
                customer.passport = savedCustomer.passport || customer.passport || null;
                if (savedCustomer.zone !== undefined) customer.zone = savedCustomer.zone;
                if (savedCustomer.bayNumber !== undefined) customer.bayNumber = savedCustomer.bayNumber;
                if (savedCustomer.bayOverflow !== undefined) customer.bayOverflow = savedCustomer.bayOverflow;
                
                // Update delivery plan if customer is assigned
                if (customer.assignedVan && customer.assignedDay) {
                    const vanId = customer.assignedVan;
                    const dayId = customer.assignedDay;
                    if (!deliveryPlan[vanId][dayId].includes(customer.id)) {
                        deliveryPlan[vanId][dayId].push(customer.id);
                    }
                }
            }
        });
    }
    
    if (serverData.deliveryRunDrivers) {
        window.deliveryRunDrivers = serverData.deliveryRunDrivers;
    }
    // Replace deliveryPlan entirely from server payload — this is the source of truth
    // and ensures unassigned customers are removed, not just added
    if (serverData.deliveryPlan) {
        deliveryPlan = serverData.deliveryPlan;
    }

    // Do NOT apply sender's currentVan/currentDay — each device keeps its own view
    // (handled by the caller if needed)
    normalizeDeliveryPlan(); // ensure plan has correct van/day structure after server update

    // Invalidate ALL route caches — data changed so polylines must be redrawn
    if (typeof _routeCache !== 'undefined') {
        window._routeCache = {};
        if (typeof _saveRouteCacheToStorage === 'function') _saveRouteCacheToStorage();
    }

    updateAllDisplays();

    // Refresh map for the currently selected van/day
    if (typeof showVanDayRoute === 'function') {
        setTimeout(function() {
            showVanDayRoute(currentVan, currentDay);
            // Update counters after route is drawn — plan is now fully populated
            if (typeof updateGlobalCounters === 'function') updateGlobalCounters();
        }, 150);
    } else if (typeof updateMapMarkers === 'function') {
        updateMapMarkers();
        if (typeof updateGlobalCounters === 'function') updateGlobalCounters();
    }
}

// Update local staff data
function updateLocalStaffData(serverData) {
    if (serverData.staffMembers) {
        staffMembers = serverData.staffMembers;
    }
    if (serverData.nextStaffId) {
        nextStaffId = serverData.nextStaffId;
    }
    renderStaffGrid();
}

// Update local card states
function updateLocalCardStates(serverData) {
    if (serverData.currentOrders) {
        cardExpandedStates.currentOrders = serverData.currentOrders;
    }
    if (serverData.weeklyPlan) {
        cardExpandedStates.weeklyPlan = serverData.weeklyPlan;
    }
    updateOrdersGrid();
    updateWeeklyPlanTable();
}

// Request manual sync
function requestSync() {
    if (socket && socket.connected) {
        socket.emit('request-sync');
        showNotification('Syncing data...', 'info');
    } else {
        showNotification('Cannot sync - offline mode', 'warning');
        fetch(`${SERVER_URL}/api/delivery-data`)
            .then(response => response.json())
            .then(data => {
                updateLocalDeliveryData(data);
                updateAllDisplays();
                showNotification('Data synced via REST API', 'success');
            })
            .catch(error => {
                console.error('REST sync failed:', error);
                showNotification('Sync failed', 'error');
            });
    }
}

// Add sync button to UI
function addSyncButton() {
    const footer = document.querySelector('.footer-info');
    if (footer && !document.getElementById('syncNowBtn')) {
        const syncBtn = document.createElement('span');
        syncBtn.id = 'syncNowBtn';
        syncBtn.innerHTML = '<i class="fas fa-sync"></i> <span onclick="requestSync()" style="cursor: pointer; text-decoration: underline;">Sync Now</span>';
        syncBtn.style.marginLeft = '15px';
        footer.appendChild(syncBtn);
    }
}


// ========== DATA PERSISTENCE ==========
const STORAGE_KEY           = 'PEP_delivery_data';
const CUSTOMERS_BASE_KEY    = 'PEP_customers_base';
const STAFF_STORAGE_KEY = 'PEP_staff_data';

function _saveCardStates() {
    try {
        const dataToSave = {
            currentOrders: cardExpandedStates.currentOrders,
            weeklyPlan: cardExpandedStates.weeklyPlan,
            timestamp: new Date().toISOString()
        };
        
        localStorage.setItem(CARD_STATES_KEY, JSON.stringify(cardExpandedStates));
        
        if (socket && socket.connected) {
            socket.emit('update-card-states', dataToSave);
        }
        
    } catch (error) {
        console.error('Error saving card states:', error);
    }
}
const saveCardStates = debounce(_saveCardStates, 300);

function loadCardStates() {
    try {
        const saved = localStorage.getItem(CARD_STATES_KEY);
        if (saved) { cardExpandedStates = JSON.parse(saved); }
    } catch (e) { console.error('Error loading card states:', e); }
}

// Send a fast single-customer update to the server and other devices.
// Much faster than saveData() which saves all 415 customers.
function quickSaveCustomer(customer) {
    if (!socket || !socket.connected) {
        // Fallback to full save if socket not connected
        saveData();
        return;
    }

    // Build delivery plan patch for this customer's van/day
    let deliveryPlanPatch = null;
    if (customer.assignedVan && customer.assignedDay) {
        deliveryPlanPatch = {
            vanId: customer.assignedVan,
            dayId: customer.assignedDay,
            customerIds: deliveryPlan[customer.assignedVan]?.[customer.assignedDay] || []
        };
    }

    // Only include passport when explicitly requested (e.g. after passport save)
    // Assignment-only changes don't need to carry 2KB of passport data
    // Include the current route cache for this van/day so receiving devices
    // don't need to call Valhalla — they get the polyline immediately
    var routeCacheEntry = null;
    if (customer.assignedVan && customer.assignedDay && typeof _routeCache !== 'undefined') {
        var ck = customer.assignedVan + '-' + customer.assignedDay;
        routeCacheEntry = _routeCache[ck] || null;
    }

    const payload = {
        id:             customer.id,
        zone:           customer.zone,
        status:         customer.status,
        assignedVan:    customer.assignedVan,
        assignedDay:    customer.assignedDay,
        deliveryOrder:  customer.deliveryOrder  || 0,
        assignedStaff:  customer.assignedStaff  || [],
        assignedDriver: customer.assignedDriver || null,
        bayNumber:      customer.bayNumber      || null,
        bayOverflow:    customer.bayOverflow    || null,
        deliveryPlanPatch,
        routeCacheEntry  // polyline coords for receiving devices
    };

    socket.emit('quick-customer-update', payload);

    // Update slim localStorage entry (no passport — DB is source of truth)
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        if (stored.customers) {
            const idx = stored.customers.findIndex(c => c.id === customer.id);
            const slim = {
                id:            customer.id,
                assignedVan:   customer.assignedVan,
                assignedDay:   customer.assignedDay,
                deliveryOrder: customer.deliveryOrder  || 0,
                status:        customer.status,
                assignedStaff: customer.assignedStaff  || [],
                assignedDriver:customer.assignedDriver || null,
                zone:          customer.zone
            };
            if (idx > -1) Object.assign(stored.customers[idx], slim);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
        }
    } catch(e) {}
}

// Call this after passport fields are updated — sends only the passport, not all assignments
function quickSavePassport(customer) {
    if (!socket || !socket.connected) { saveData(); return; }
    socket.emit('quick-customer-update', {
        id:      customer.id,
        passport: customer.passport || null
    });
    console.log('[quick-passport] Saved passport for', customer.name || customer.id);
}

function clearCustomersBaseCache() {
    localStorage.removeItem(CUSTOMERS_BASE_KEY);
    console.log('[customers cache] Cleared');
}

// Debounced saveData — batches rapid changes into one save after 400ms idle
// quickSaveCustomer() is still instant for live sync; this is the bulk fallback
var _saveDataTimer = null;
function saveData() {
    clearTimeout(_saveDataTimer);
    _saveDataTimer = setTimeout(_doSaveData, 400);
}
function _doSaveData() {
    try {
        // Slim payload — NO passport data. Passports live in the DB (customer_passports table).
        // localStorage is offline fallback only, so we keep it minimal (~50KB vs ~2MB before).
        const customersToSave = customers.map(c => ({
            id:            c.id,
            assignedVan:   c.assignedVan,
            assignedDay:   c.assignedDay,
            deliveryOrder: c.deliveryOrder  || 0,
            status:        c.status         || ORDER_STATUSES.PENDING,
            assignedStaff: c.assignedStaff  || [],
            assignedDriver:c.assignedDriver || null,
            zone:          c.zone,
            priority:      c.priority       || null,
            bayNumber:     c.bayNumber      || null,
            bayOverflow:   c.bayOverflow    || null
            // passport intentionally excluded — DB is source of truth
        }));

        // Socket payload also sends passport per-customer via quick-customer-update,
        // not here. The full save only carries assignment state.
        const dataToSave = {
            customers:          customersToSave,
            deliveryPlan:       deliveryPlan,
            deliveryRunDrivers: window.deliveryRunDrivers || {},
            currentVan:         currentVan,
            currentDay:         currentDay,
            timestamp:          new Date().toISOString()
        };

        // Write slim copy to localStorage for offline fallback
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));

        if (socket && socket.connected) {
            socket.emit('update-delivery-data', dataToSave);
            document.getElementById('saveStatus').textContent = 'Saved & Synced';
            document.getElementById('saveStatus').style.color = 'var(--success)';
        } else {
            document.getElementById('saveStatus').textContent = 'Saved (Offline)';
            document.getElementById('saveStatus').style.color = 'var(--warning)';
            
            fetch(`${SERVER_URL}/api/delivery-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataToSave)
            }).catch(err => console.log('REST fallback failed:', err));
        }
        
        setTimeout(() => {
            if (socket && socket.connected) {
                document.getElementById('saveStatus').textContent = 'Connected';
            } else {
                document.getElementById('saveStatus').textContent = 'Offline';
            }
        }, 2000);
        
    } catch (error) {
        console.error('Error saving data:', error);
        document.getElementById('saveStatus').textContent = 'Save failed';
        document.getElementById('saveStatus').style.color = 'var(--danger)';
    }

}

function saveStaffData() {
    try {
        const dataToSave = {
            staffMembers: staffMembers,
            nextStaffId: nextStaffId,
            timestamp: new Date().toISOString()
        };
        
        localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(staffMembers));
        
        if (socket && socket.connected) {
            socket.emit('update-staff-data', dataToSave);
        } else {
            fetch(`${SERVER_URL}/api/staff-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataToSave)
            }).catch(err => console.log('REST fallback failed:', err));
        }
        
    } catch (error) {
        console.error('Error saving staff data:', error);
    }
}

function loadStaffData() {
    try {
        const saved = localStorage.getItem(STAFF_STORAGE_KEY);
        if (saved) {
            staffMembers = JSON.parse(saved);
            if (staffMembers.length) nextStaffId = Math.max(...staffMembers.map(s => s.id)) + 1;
        } else { addSampleStaff(); }
    } catch (e) { addSampleStaff(); }
}

function addSampleStaff() {
    staffMembers = [
        { id:1, name:"John Smith",     email:"john.smith@PEP.com",  phone:"+44 7700 123456", role:"Senior Picker",  type:"picker", shift:"Morning",   notes:"Team leader for morning shift",                  activeOrders:0, totalPicks:145,          license:null },
        { id:2, name:"Sarah Johnson",  email:"sarah.j@PEP.com",     phone:"+44 7700 234567", role:"Picker",         type:"picker", shift:"Afternoon",  notes:"Specializes in fragile items",                   activeOrders:0, totalPicks:98,           license:null },
        { id:3, name:"Mike Wilson",    email:"mike.w@PEP.com",      phone:"+44 7700 345678", role:"Picker",         type:"picker", shift:"Morning",    notes:"Fast picker, good with bulk items",              activeOrders:0, totalPicks:156,          license:null },
        { id:4, name:"Emma Brown",     email:"emma.b@PEP.com",      phone:"+44 7700 456789", role:"Trainee Picker", type:"picker", shift:"Flexible",   notes:"In training, needs supervision",                 activeOrders:0, totalPicks:23,           license:null },
        { id:5, name:"David Miller",   email:"david.m@PEP.com",     phone:"+44 7700 567890", role:"Senior Driver",  type:"driver", shift:"Morning",    notes:"Class 1 license, 10 years experience",           activeOrders:0, totalDeliveries:1245,    license:"Class 1", vehiclePreference:"Van 1" },
        { id:6, name:"Lisa Thompson",  email:"lisa.t@PEP.com",      phone:"+44 7700 678901", role:"Driver",         type:"driver", shift:"Morning",    notes:"Class 2 license, specializes in urban deliveries",activeOrders:0, totalDeliveries:876,     license:"Class 2", vehiclePreference:"Van 2" },
        { id:7, name:"James Wilson",   email:"james.w@PEP.com",     phone:"+44 7700 789012", role:"Driver",         type:"driver", shift:"Afternoon",  notes:"Class 2 license, good with rural routes",        activeOrders:0, totalDeliveries:654,     license:"Class 2", vehiclePreference:"Van 3" },
        { id:8, name:"Sarah Chen",     email:"sarah.c@PEP.com",     phone:"+44 7700 890123", role:"Driver",         type:"driver", shift:"Morning",    notes:"Class 1 license, experienced with long distances",activeOrders:0, totalDeliveries:932,     license:"Class 1", vehiclePreference:"Van 1" }
    ];
    nextStaffId = 9;
    saveStaffData();
}

async function loadSavedData(serverLoaded) {
    try {
        if (socket && socket.connected) {
            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    console.log('Server load timeout, falling back to localStorage');
                    resolve(loadFromLocalStorage(serverLoaded));
                }, 3000);
                
                socket.once('initial-data', (data) => {
                    clearTimeout(timeout);
                    if (data.delivery) {
                        updateLocalDeliveryData(data.delivery);
                    }
                    resolve(true);
                });
            });
        } else {
            return loadFromLocalStorage(serverLoaded);
        }
    } catch (error) {
        console.error('Error loading from server:', error);
        return loadFromLocalStorage();
    }
}

// Ensure deliveryPlan always has valid keys for all vans and days.
// Guards against stale localStorage data with wrong/extra van IDs.
function normalizeDeliveryPlan() {
    if (typeof VANS === 'undefined' || typeof DAYS === 'undefined') return;
    VANS.forEach(function(van) {
        if (!deliveryPlan[van.id] || typeof deliveryPlan[van.id] !== 'object') {
            deliveryPlan[van.id] = {};
        }
        DAYS.forEach(function(day) {
            if (!Array.isArray(deliveryPlan[van.id][day.id])) {
                deliveryPlan[van.id][day.id] = [];
            }
        });
    });
    // Remove any van keys not in VANS (stale data)
    Object.keys(deliveryPlan).forEach(function(key) {
        if (!VANS.find(function(v) { return v.id == key; })) {
            delete deliveryPlan[key];
        }
    });
}
window.normalizeDeliveryPlan = normalizeDeliveryPlan;

function loadFromLocalStorage(serverLoaded) {
    // serverLoaded = true means rebuildCustomersFromServerData() already ran.
    // In that case the server is the source of truth — we must NOT overwrite
    // customer-level fields (assignedVan, assignedDay, status, etc.) from
    // stale localStorage. We only restore UI state (currentVan/Day) and
    // deliveryPlan (which the server also sends, but localStorage version is fine).
    try {
        const savedData = localStorage.getItem(STORAGE_KEY);
        if (!savedData) return false;
        
        const data = JSON.parse(savedData);
        
        if (data.customers && customers.length > 0) {
            data.customers.forEach(saved => {
                const c = customers.find(x => x.id === saved.id);
                if (!c) return;
                // Zone is always restored — it's user-managed state (e.g. Collection),
                // not derivable from geography, so localStorage is the source of truth.
                if (saved.zone) c.zone = saved.zone;
                if (serverLoaded) return; // server already applied all other fields
                c.assignedVan    = saved.assignedVan;
                c.assignedDay    = saved.assignedDay;
                c.deliveryOrder  = saved.deliveryOrder  || 0;
                c.status         = saved.status         || ORDER_STATUSES.PENDING;
                c.assignedStaff  = Array.isArray(saved.assignedStaff) ? saved.assignedStaff : (saved.assignedStaff ? [saved.assignedStaff] : []);
                c.assignedDriver = saved.assignedDriver || null;
                c.priority       = saved.priority       || null;
                c.bayNumber      = saved.bayNumber      || null;
            });
        }
        // Server-loaded path: customer assignments already correct from DB.
        // Only restore deliveryPlan and UI view state from localStorage.
        if (data.deliveryPlan) deliveryPlan = data.deliveryPlan;
        if (data.currentVan)  currentVan = data.currentVan;
        if (data.currentDay)  currentDay = data.currentDay;
        if (data.deliveryRunDrivers) window.deliveryRunDrivers = data.deliveryRunDrivers;
        normalizeDeliveryPlan(); // ensure all van/day keys are valid
        return true;
    } catch (e) {
        console.error('Error loading from localStorage:', e);
        return false;
    }
}

