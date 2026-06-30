// ========== ZONE GRID HELPERS ==========

// Convert a zone name to a safe DOM element ID suffix
function zoneToSlug(name) {
    return 'z-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function zoneOrdersId(name)  { return zoneToSlug(name) + '-orders'; }
function zoneCountId(name)   { return zoneToSlug(name) + '-count';  }

// Icons for well-known zones; fallback for custom zones
var ZONE_ICONS = {
    'North West':        'fa-mountain',
    'South West':        'fa-water',
    'London/North East': 'fa-city',
    'South East':        'fa-umbrella-beach',
    'Local':             'fa-store',
    'Collection':        'fa-boxes'
};

// Re-render the zone grid from the current ZONES object.
// Called by updateOrdersGrid() and after zone config changes.
function renderZoneGrid() {
    var grid = document.getElementById('zoneGrid');
    if (!grid) return;

    var zoneNames = Object.keys(ZONES);
    // No change needed if the rendered zones already match
    var existing = Array.from(grid.querySelectorAll('.zone-card')).map(function(c) {
        return c.getAttribute('data-zone');
    });
    if (existing.join('|') === zoneNames.join('|')) return;

    grid.innerHTML = zoneNames.map(function(name) {
        var slug      = zoneToSlug(name);
        var ordersId  = zoneOrdersId(name);
        var countId   = zoneCountId(name);
        var icon      = ZONE_ICONS[name] || 'fa-map-marker-alt';
        var zoneData  = ZONES[name] || {};
        var color     = zoneData.color || '#6b7280';
        var label     = name === 'Local'
            ? 'Local (within ' + (zoneData.radius || 20) + 'km)'
            : name;
        var escapedName = name.replace(/'/g, "\\'");

        return '<div class="zone-card" data-zone="' + name + '">' +
            '<div class="zone-header" style="background:' + color + ';color:#fff;">' +
                '<span><i class="fas ' + icon + '"></i> ' + label + '</span>' +
                '<span class="zone-count" id="' + countId + '">0</span>' +
            '</div>' +
            '<div class="zone-orders" id="' + ordersId + '" data-zone="' + name + '"' +
                ' ondragover="event.preventDefault();this.classList.add(\'zone-drag-over\')"' +
                ' ondragleave="this.classList.remove(\'zone-drag-over\')"' +
                ' ondrop="_onZoneDrop(event,\'' + escapedName + '\')">' +
            '</div>' +
        '</div>';
    }).join('');
}

// ========== DAY FILTER ==========
var _ordersDateFilter = null;

function toggleTodayNextDayFilter() {
    _ordersDateFilter = _ordersDateFilter === 'today-tomorrow' ? null : 'today-tomorrow';
    var btn   = document.getElementById('todayNextDayBtn');
    var label = document.getElementById('todayNextDayLabel');
    if (_ordersDateFilter === 'today-tomorrow') {
        var todayName = _getTodayDayName();
        var nextName  = _getNextDayName();
        if (label) label.textContent = todayName + ' & ' + nextName;
        if (btn)   { btn.style.background = '#065f46'; btn.style.boxShadow = '0 0 0 3px #6ee7b7'; }
    } else {
        if (label) label.textContent = 'Today & Tomorrow';
        if (btn)   { btn.style.background = '#0f766e'; btn.style.boxShadow = 'none'; }
    }
    updateOrdersGrid();
}

function _getTodayDayId() {
    var jsDay = new Date().getDay(); // 0=Sun, 1=Mon ... 6=Sat
    return jsDay === 0 ? 7 : jsDay; // DAYS: 1=Mon ... 7=Sun
}

function _getNextDayId() {
    var today = _getTodayDayId();
    return today === 7 ? 1 : today + 1;
}

function _getTodayDayName() {
    var id = _getTodayDayId();
    var d = typeof DAYS !== 'undefined' ? DAYS.find(function(x) { return x.id === id; }) : null;
    return d ? d.name : ['','Mon','Tue','Wed','Thu','Fri','Sat','Sun'][id] || 'Today';
}

function _getNextDayName() {
    var id = _getNextDayId();
    var d = typeof DAYS !== 'undefined' ? DAYS.find(function(x) { return x.id === id; }) : null;
    return d ? d.name : ['','Mon','Tue','Wed','Thu','Fri','Sat','Sun'][id] || 'Tomorrow';
}

window.toggleTodayNextDayFilter = toggleTodayNextDayFilter;

// ========== CLEAR ORDER DATA FUNCTIONS ==========
function clearOrderData(customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;

    console.log(`Resetting order for customer: ${customer.name} (ID: ${customerId})`);

    // 1. Reset status to Pending
    customer.status = ORDER_STATUSES.PENDING;

    // 2. Clear pickers and driver
    customer.assignedStaff = [];
    customer.assignedDriver = null;

    if (customer.passport) {
        // Preserve Labelling fields — these carry forward to the next order
        const labelling = {
            barcodedLabels:   customer.passport.barcodedLabels   || false,
            prePricedLabels:  customer.passport.prePricedLabels  || false,
            labelInstructions: customer.passport.labelInstructions || ''
        };

        // Preserve repeat customer tracking fields
        const repeatFields = {
            isRepeatCustomer:    customer.passport.isRepeatCustomer    || false,
            previousOrderCount:  customer.passport.previousOrderCount  || 0,
            totalOrdersCount:    customer.passport.totalOrdersCount    || 0,
            customerSince:       customer.passport.customerSince       || ''
        };

        // Preserve contact info
        const contact = {
            customerContact: customer.passport.customerContact || '',
            customerEmail:   customer.passport.customerEmail   || ''
        };

        // 3 & 4. Clear: Order Details, Plant & Quality, Delivery/Payment, Packing Check
        // 5. Clear order history (orders for this customer)
        Object.assign(customer.passport, {
            // Order Details — cleared
            trolleyCount: 0, orderNumber: '', orderDate: '', requiredByDate: '',
            takenBy: '', accountType: '', poNumber: '', invoiceDelivery: '', invoiceEmail: '',

            // Plant & Quality — cleared
            plantVariety: '', numberOfPlants: '', potSize: '', potColor: '',
            qualityGrade: '', coloursToAvoid: '', flowerStage: '', mixedColoursOk: false,
            preferredHeight: '', blemishTolerance: '', specificColours: '', additionalPlantNotes: '',

            // Pot return — cleared
            potsToReturn: false, numberOfPotsToReturn: 0, potReturnNotes: '',

            // Delivery & Payment — cleared
            fulfilmentMethod: '', preferredDeliveryDay: '', preferredTimeWindow: '',
            siteAccessRestrictions: false, siteAccessTimes: '', onsiteContactName: '',
            onsiteContactPhone: '', fullAddress: '', specialDeliveryInstructions: '',
            paymentTerms: '', paymentMethod: '', paymentReceived: false,
            amountPaid: 0,

            // Packing Check — cleared
            packedBy: '', datePacked: '', flowerStageConfirmed: '', qualityGradeMet: false,
            qualityNotes: '', labelsApplied: false, barcodeChecked: '', substitutionsMade: false,
            substitutionDetails: '', checkedBy: '', signOff: '',

            // Orders history — cleared
            orders: [],

            // Reset timestamps and metrics for fresh order
            timestamps: {
                orderCreated: '', firstPickerAssigned: '', pickingStarted: '',
                pickingCompleted: '', readyForDelivery: '', deliveredAt: ''
            },
            pickingMetrics: {
                timeToFirstPicker: 0, pickingDuration: 0, totalPickingTime: 0,
                efficiencyScore: 0, numberOfPickers: 0, pickerNames: [],
                plantsPerHour: 0, plantsPerPicker: {}
            },

            // Restore preserved fields
            ...labelling,
            ...repeatFields,
            ...contact,
            lastUpdated: new Date().toISOString(),
            updatedBy: 'System - Order reset'
        });
    }

    // Unassign from van/day so customer disappears from Current Orders,
    // Weekly Schedule and Map View. Customer record stays intact with
    // status Pending and labelling preserved — ready to be reassigned
    // for the next delivery cycle.
    if (customer.assignedVan && customer.assignedDay) {
        const vanId = customer.assignedVan;
        const dayId = customer.assignedDay;
        const idx = deliveryPlan[vanId]?.[dayId]?.indexOf(customerId);
        if (idx > -1) deliveryPlan[vanId][dayId].splice(idx, 1);
        invalidateRouteCache(vanId, dayId);
    }

    customer.assignedVan    = null;
    customer.assignedDay    = null;
    customer.deliveryOrder  = 0;
    customer.bayNumber      = null;
    customer.bayOverflow    = null;

    if (customer.zone === 'Collection') {
        customer.zone = determineZone(customer.lat, customer.lng);
    }

    saveData();
    updateAllDisplays();

    showNotification(`${customer.name} reset to Pending — removed from route, ready to reassign`, 'success');
}

function promptClearOrderData(customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    
    if (confirm(`Are you sure you want to clear ALL order data for ${customer.name}?\n\nThis will remove:\n- Assigned pickers\n- Assigned driver\n- All passport order details\n- Van/day assignments\n\nThis action cannot be undone.`)) {
        customer.status = ORDER_STATUSES.PENDING;
        clearOrderData(customerId);
        updateAllDisplays();
    }
}


// ========== ORDERS GRID ==========
function updateOrdersGrid() {
    // If in a non-zone view, refresh that view instead
    if (_ordersView === 'heatmap')   { renderHeatmap();   return; }
    if (_ordersView === 'swimlanes') { renderSwimlanes(); return; }

    // Build zone elements and counts dynamically from current ZONES object
    renderZoneGrid();
    const zoneElements = {};
    const counts = {};
    Object.keys(ZONES).forEach(function(zoneName) {
        var el = document.getElementById(zoneOrdersId(zoneName));
        zoneElements[zoneName] = el || null;
        counts[zoneName] = 0;
    });

    Object.values(zoneElements).forEach(el => { if (el) el.innerHTML = ''; });
    
    // Track scheduled vs unscheduled collections
    let scheduledCollections = 0;
    let unscheduledCollections = 0;
    
    // Filter customers to show:
    // 1. All assigned customers (with van/day)
    // 2. Collection customers ONLY if they have a passport with order data
    // Build day filter set if active
    var _filterDayIds = null;
    if (_ordersDateFilter === 'today-tomorrow') {
        _filterDayIds = new Set([_getTodayDayId(), _getNextDayId()]);
    }

    const ordersToShow = customers.filter(c => {
        // Always show assigned customers (subject to day filter)
        if (c.assignedVan && c.assignedDay) {
            if (_filterDayIds && !_filterDayIds.has(c.assignedDay)) return false;
            return true;
        }
        
        // Always show collection customers
        if (c.zone && c.zone.toLowerCase() === 'collection') {
            return true;
        }
        
        // Don't show unassigned non-collection customers
        return false;
    });
    
    // Apply search / status / van / priority filters
    const filteredOrders = _applyOrdersFilters(ordersToShow);
    // Sort: P1 → P2 → P3 → unprioritised (stable within each group)
    filteredOrders.sort((a, b) => (a.priority || 999) - (b.priority || 999));
    // Reassign so all downstream code sees the filtered + sorted list
    ordersToShow.length = 0;
    filteredOrders.forEach(c => ordersToShow.push(c));

    // ── Multi-order badge: detect customers with multiple orders on the same van+day drop ──
    // Also counts extra orders stored in passport.orders (same/different van/day).
    const dropGroupCount = {};
    ordersToShow.forEach(c => {
        if (c.assignedVan && c.assignedDay) {
            const key = `${c.name.trim().toLowerCase()}|${c.assignedVan}|${c.assignedDay}`;
            dropGroupCount[key] = (dropGroupCount[key] || 0) + 1;
        }
    });

    // Per-customer total order count (primary + additional passport orders)
    const customerOrderCount = {};
    ordersToShow.forEach(c => {
        const extra = (c.passport?.orders?.length) || 0;
        customerOrderCount[c.id] = 1 + extra;
    });

    // Pill grid mode: render compact 2-col grid per zone
    if (_ordersLayout === 'pills') {
        var pillsByZone = {};
        ordersToShow.forEach(function(customer) {
            var dz = (window._tempZoneOverrides && window._tempZoneOverrides[customer.id])
                ? window._tempZoneOverrides[customer.id] : customer.zone;
            if (!pillsByZone[dz]) pillsByZone[dz] = [];
            pillsByZone[dz].push(customer);
            counts[dz] = (counts[dz] || 0) + 1;
        });
        Object.keys(zoneElements).forEach(function(zone) {
            var el = zoneElements[zone];
            if (!el) return;
            var pills = pillsByZone[zone] || [];
            el.style.padding = '6px';
            var grid = document.createElement('div');
            grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px;';
            pills.forEach(function(customer) {
                var van = VANS.find(function(v) { return v.id === customer.assignedVan; });
                grid.innerHTML += renderPillCard(customer, van, staffMembers);
            });
            el.appendChild(grid);
        });
        // Update counts (dynamic — uses same ID scheme as renderZoneGrid)
        Object.keys(counts).forEach(function(zone) {
            var el = document.getElementById(zoneCountId(zone));
            if (el) el.textContent = counts[zone] || 0;
        });
        var total = ordersToShow.length;
        var totalEl = document.getElementById('totalOrdersCount');
        if (totalEl) totalEl.textContent = total;
        return; // skip standard card rendering
    }

    // Sort: active orders first, terminal (delivered/collected/cancelled) last
    const terminalSet = new Set(['delivered','collected','cancelled']);
    ordersToShow.sort(function(a, b) {
        var aT = terminalSet.has(a.status||'') ? 1 : 0;
        var bT = terminalSet.has(b.status||'') ? 1 : 0;
        return aT - bT;
    });

    ordersToShow.forEach(customer => {
        var isTerminal = terminalSet.has(customer.status || '');
        // Use temp override zone for display if set — real zone never changes
        const displayZone = (window._tempZoneOverrides && window._tempZoneOverrides[customer.id])
            ? window._tempZoneOverrides[customer.id]
            : customer.zone;
        const container = zoneElements[displayZone];
        if (container) {
            counts[displayZone] = (counts[displayZone] || 0) + 1;
            
            // Track collection scheduling stats
            if (displayZone && displayZone.toLowerCase() === 'collection') {
                if (customer.assignedDay) {
                    scheduledCollections++;
                } else {
                    unscheduledCollections++;
                }
            }
            
            const van = customer.assignedVan ? VANS.find(v => v.id === customer.assignedVan) : null;
            const dayName = customer.assignedDay ? getDayName(customer.assignedDay) : 
                           (displayZone && displayZone.toLowerCase() === 'collection' ? 'Unscheduled' : 'N/A');
            
            const staffArray = Array.isArray(customer.assignedStaff) ? customer.assignedStaff : 
                              (customer.assignedStaff ? [customer.assignedStaff] : []);
            const staffList = staffArray.map(id => staffMembers.find(s => s.id === id)).filter(s => s);
            
            const driver = customer.assignedDriver ? staffMembers.find(s => s.id === customer.assignedDriver) : null;
            
            let backgroundColor = '';
            let blinkingClass = '';
            
            if (customer.status === ORDER_STATUSES.PENDING) {
                if (staffList.length === 0) {
                    blinkingClass = 'blinking-red';
                    backgroundColor = '#ffebee';
                } else {
                    backgroundColor = '#ffebee';
                }
            } else if (customer.status === ORDER_STATUSES.PICKING) {
                backgroundColor = '#fff9c4';
            } else if (customer.status === ORDER_STATUSES.READY_FOR_DELIVERY) {
                backgroundColor = '#ffe0b2';
            } else if (customer.status === ORDER_STATUSES.DELIVERING) {
                backgroundColor = '#e8f5e9';
            } else if (customer.status === ORDER_STATUSES.DELIVERED) {
                backgroundColor = '#f5f5f5';
            } else if (customer.status === ORDER_STATUSES.CANCELLED) {
                backgroundColor = '#ffcdd2';
            } else if (customer.status === ORDER_STATUSES.COLLECTED) {
                backgroundColor = '#ffffff';
            }
            
            const card = document.createElement('div');
            card.className = `order-card ${blinkingClass}`;
            card.setAttribute('data-customer-id', customer.id);
            card.style.backgroundColor = backgroundColor;
            if (window._bulkSelectMode && window._bulkSelectedIds.has(customer.id)) {
                card.style.outline = '2px solid var(--primary)';
            }
            // Grey out and visually dim terminal status orders
            if (isTerminal) {
                card.style.opacity = '0.5';
                card.style.filter  = 'grayscale(60%)';
                card.style.borderStyle = 'dashed';
            }

            // Make draggable for temp zone moves
            card.draggable = true;
            card.style.cursor = 'grab';
            card.addEventListener('dragstart', function(e) {
                _draggedCustomerId = customer.id;
                card.style.opacity = '0.5';
                e.dataTransfer.effectAllowed = 'move';
            });
            card.addEventListener('dragend', function() {
                card.style.opacity = '1';
                _draggedCustomerId = null;
            });

            // Show amber indicator + badge if this card has been temp-moved
            const isTempMoved = _tempZoneOverrides[customer.id];
            if (isTempMoved) {
                card.style.borderLeft = '4px solid #f59e0b';
                card.title = 'Temporarily moved from ' + customer.zone + ' (actual zone unchanged)';
            } else if (customer.priority && (typeof FEATURES === 'undefined' || FEATURES.priority !== false)) {
                const pBorderColors = { 1: '#dc2626', 2: '#d97706', 3: '#2563eb' };
                card.style.borderLeft = `4px solid ${pBorderColors[customer.priority] || '#6b7280'}`;
            }
            
            const isExpanded = cardExpandedStates.currentOrders[customer.id] || false;
            card.setAttribute('data-expanded', isExpanded ? 'true' : 'false');
            
            const needsMarquee = customer.name.length > MARQUEE_THRESHOLD;
            
            // Build repeat customer badge (historical repeat customer flag)
            let repeatBadge = '';
            if (customer.passport && customer.passport.isRepeatCustomer && customer.passport.totalOrdersCount > 1) {
                repeatBadge = `<span class="repeat-badge" title="Repeat customer - ${customer.passport.totalOrdersCount} total orders">
                                    <i class="fas fa-star"></i> ${customer.passport.totalOrdersCount}x
                               </span>`;
            }

            // Multi-order badge: same customer has >1 order on this van+day drop OR has additional passport orders
            let multiOrderBadge = '';
            const totalOrders = customerOrderCount[customer.id] || 1;
            if (customer.assignedVan && customer.assignedDay) {
                const dropKey = `${customer.name.trim().toLowerCase()}|${customer.assignedVan}|${customer.assignedDay}`;
                const dropCount = dropGroupCount[dropKey] || 1;
                const displayCount = Math.max(dropCount, totalOrders);
                if (displayCount > 1) {
                    multiOrderBadge = `<span class="multi-order-badge" title="${customer.name} has ${displayCount} orders">
                        <i class="fas fa-layer-group"></i> ${displayCount} orders
                    </span>`;
                }
            } else if (totalOrders > 1) {
                multiOrderBadge = `<span class="multi-order-badge" title="${customer.name} has ${totalOrders} orders">
                    <i class="fas fa-layer-group"></i> ${totalOrders} orders
                </span>`;
            }
            
            // Bulk select checkbox (shown only in bulk mode)
            if (window._bulkSelectMode) {
                const cbWrap = document.createElement('div');
                cbWrap.style.cssText = 'position:absolute;top:8px;right:8px;z-index:2;';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.dataset.bulkCb = customer.id;
                cb.checked = window._bulkSelectedIds.has(customer.id);
                cb.style.cssText = 'width:18px;height:18px;cursor:pointer;accent-color:var(--primary);';
                cb.addEventListener('change', e => { e.stopPropagation(); toggleBulkSelect(customer.id); });
                cbWrap.appendChild(cb);
                card.style.position = 'relative';
                card.appendChild(cbWrap);
                card.addEventListener('click', e => {
                    if (e.target === cb) return;
                    toggleBulkSelect(customer.id);
                });
            }

            // Priority badge
            let priorityBadge = '';
            if (customer.priority && (typeof FEATURES === 'undefined' || FEATURES.priority !== false)) {
                const pLabels = { 1: '⚡ P1', 2: '🔶 P2', 3: '🔷 P3' };
                priorityBadge = `<span class="priority-badge priority-${customer.priority}">${pLabels[customer.priority] || 'P' + customer.priority}</span>`;
            }

            // Build collapsed view
            let collapsedHTML = `
                <div class="collapsed-view" style="${isExpanded ? 'display: none;' : 'display: block;'}">
                    <div class="collapsed-content">
                        ${priorityBadge}
            `;
            
            if (needsMarquee) {
                collapsedHTML += `
                    <div class="marquee-wrapper">
                        <i class="fas ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} expand-icon-inline" style="flex-shrink:0;"></i>
                        <div class="marquee-container">
                            <div class="marquee-text">${customer.name} ${repeatBadge}</div>
                        </div>
                        <div class="marquee-status">
                            <span class="status-badge-collapsed" style="background: ${getStatusBadgeColor(customer.status)}">${getStatusText(customer.status)}</span>
                            <span class="day-collapsed"><i class="fas fa-calendar"></i> ${dayName}</span>
                `;
                
                // Add quick schedule button for unscheduled collections
                if (customer.zone && customer.zone.toLowerCase() === 'collection' && !customer.assignedDay) {
                    collapsedHTML += `
                        <button class="quick-schedule-btn" onclick="event.stopPropagation(); openCollectionDaySelector(${customer.id})" 
                            style="background:${ZONES.Collection.color}; color:white; border:none; padding:2px 8px; border-radius:12px; font-size:10px; margin-left:5px; cursor:pointer;">
                            <i class="fas fa-calendar-plus"></i> Schedule
                        </button>
                    `;
                }
                
                collapsedHTML += `
                        </div>
                    </div>
                `;
            } else {
                collapsedHTML += `
                    <span class="customer-name-collapsed"><i class="fas ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} expand-icon-inline"></i> ${customer.name} ${repeatBadge}${multiOrderBadge}</span>
                    <span class="status-badge-collapsed" style="background: ${getStatusBadgeColor(customer.status)}">${getStatusText(customer.status)}</span>
                    <span class="day-collapsed"><i class="fas fa-calendar"></i> ${dayName}</span>
                `;
                
                if (customer.zone && customer.zone.toLowerCase() === 'collection') {
                    collapsedHTML += `
                        <span class="collection-badge" style="background:${ZONES.Collection.color}; color:white; padding:2px 8px; border-radius:12px; font-size:10px;">
                            <i class="fas fa-boxes"></i> Collection
                        </span>
                    `;
                    
                    // Add quick schedule button for unscheduled collections in non-marquee mode
                    if (!customer.assignedDay) {
                        collapsedHTML += `
                            <button class="quick-schedule-btn" onclick="event.stopPropagation(); openCollectionDaySelector(${customer.id})" 
                                style="background:${ZONES.Collection.color}; color:white; border:none; padding:2px 8px; border-radius:12px; font-size:10px; margin-left:5px; cursor:pointer;">
                                <i class="fas fa-calendar-plus"></i> Schedule
                            </button>
                        `;
                    }
                } else {
                    collapsedHTML += `
                        <span class="van-collapsed" style="color: ${van ? van.color : '#2563eb'};">
                            <i class="fas fa-truck"></i> ${van ? van.name : 'Unassigned'}
                        </span>
                    `;
                }
            }
            
            collapsedHTML += `
                    </div>
                </div>
            `;
            
            // Build pot return badge
            let potReturnBadge = '';
            if (customer.passport && customer.passport.potsToReturn && customer.passport.numberOfPotsToReturn > 0) {
                potReturnBadge = `<span class="pot-return-badge" title="Collect ${customer.passport.numberOfPotsToReturn} used pots">
                                    <i class="fas fa-recycle"></i> Return Pots (${customer.passport.numberOfPotsToReturn})
                                  </span>`;
            }
            
            // Build expanded view
            let expandedHTML = `
                <div class="expanded-view" style="${isExpanded ? 'display: block;' : 'display: none;'}">
                    <div class="top-row">
                        <div class="time">🕐 ${formatTime(new Date())}</div>
                        <div class="meta-right">
                            📅 ${dayName}
                            ${customer.zone && customer.zone.toLowerCase() === 'collection' ? 
                                `<span class="collection-badge" style="background:${ZONES.Collection.color};">📦 Collection</span>` : 
                                `<span class="van" style="background: ${van ? van.color : '#2563eb'};">🚐 ${van ? van.name : 'Unassigned'}</span>`
                            }
                        </div>
                    </div>
                    
                    <div class="company-name">${customer.name} ${multiOrderBadge}</div>
                    
                    <div class="address-row">
                        📍 ${customer.address}
                    </div>
                    ${potReturnBadge ? `<div class="pot-return-row">${potReturnBadge}</div>` : ''}
            `;
            
            // Show collection day prominently for collection orders
            if (customer.zone && customer.zone.toLowerCase() === 'collection') {
                if (customer.assignedDay) {
                    expandedHTML += `<div class="collection-day-info" style="background:${ZONES.Collection.color}20; padding:8px; border-radius:5px; margin:10px 0; border-left:4px solid ${ZONES.Collection.color};">
                        <i class="fas fa-calendar-check"></i> <strong>Scheduled Collection Day:</strong> ${getDayName(customer.assignedDay)}
                        <button onclick="openCollectionDaySelector(${customer.id})" style="background:${ZONES.Collection.color}; color:white; border:none; padding:2px 10px; border-radius:15px; margin-left:10px; font-size:11px; cursor:pointer;">
                            <i class="fas fa-edit"></i> Change
                        </button>
                    </div>`;
                } else {
                    expandedHTML += `<div class="collection-day-info" style="background:#f5f5f5; padding:8px; border-radius:5px; margin:10px 0; border-left:4px solid #9ca3af;">
                        <i class="fas fa-calendar-times"></i> <strong>Unscheduled Collection</strong> - 
                        <button onclick="openCollectionDaySelector(${customer.id})" style="background:${ZONES.Collection.color}; color:white; border:none; padding:4px 12px; border-radius:20px; cursor:pointer; margin-left:5px;">
                            <i class="fas fa-calendar-plus"></i> Schedule Day
                        </button>
                    </div>`;
                }
            }
            
            if (driver) {
                expandedHTML += `<div class="driver-info"><i class="fas fa-truck"></i> Driver: ${driver.name}</div>`;
            } else if (customer.status === ORDER_STATUSES.READY_FOR_DELIVERY && (!customer.zone || customer.zone.toLowerCase() !== 'collection')) {
                expandedHTML += `<div class="driver-warning"><i class="fas fa-exclamation-triangle"></i> READY FOR DELIVERY - ASSIGN DRIVER</div>`;
            }
            
            if (staffList.length > 0) {
                expandedHTML += `<div class="pickers-info"><i class="fas fa-users"></i> ${staffList.map(s => s.name).join(', ')}</div>`;
            }
            
            expandedHTML += getPassportDisplayHTML(customer);
            
            expandedHTML += `
                    <div class="bottom-row">
                        <div class="left-info">
                            <span class="badge-picking">${getStatusText(customer.status)}</span>
                        </div>
                        <div class="actions" style="display: flex; gap: 5px; flex-wrap: wrap;">
            `;
            
            const isCollectionCustomer = customer.zone && customer.zone.toLowerCase() === 'collection';

            if (isCollectionCustomer) {
                expandedHTML += `
                    <button class="btn btn-collection" onclick="event.stopPropagation(); openCollectionDaySelector(${customer.id})" 
                            style="background: ${ZONES.Collection.color}; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
                        <i class="fas fa-calendar-alt"></i> Schedule Day
                    </button>
                `;
            } else {
                expandedHTML += `
                    <button class="btn btn-collection" onclick="event.stopPropagation(); assignToCollection(${customer.id})" 
                            style="background: ${ZONES.Collection.color}; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
                        <i class="fas fa-boxes"></i> Collection
                    </button>
                `;
            }
            
            expandedHTML += `
                <button class="btn btn-pickers" onclick="event.stopPropagation(); openAssignStaffModal(${customer.id})" 
                        style="background: #ec4899; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
                    <i class="fas fa-users"></i> Pickers
                </button>
                <button class="btn btn-driver" onclick="event.stopPropagation(); openAssignDriverModal(${customer.id})" 
                        style="background: #f59e0b; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
                    <i class="fas fa-truck"></i> Driver
                </button>
                <button class="btn btn-update" onclick="event.stopPropagation(); showStatusUpdateModal(customers.find(c => c.id === ${customer.id}));" 
                        style="background: #3b82f6; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
                    <i class="fas fa-edit"></i> Update
                </button>
            `;
            
            expandedHTML += `
                        </div>
                    </div>
                </div>
            `;
            
            card.innerHTML = collapsedHTML + expandedHTML;
            
            card.addEventListener('click', function(e) {
                if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                    return;
                }
                toggleCard(this);
            });
            
            container.appendChild(card);
        }
    });
    
    // Update zone counts dynamically
    Object.keys(counts).forEach(function(zone) {
        var el = document.getElementById(zoneCountId(zone));
        if (!el) return;
        el.textContent = counts[zone] || 0;
        if (zone === 'Collection') {
            el.title = `${scheduledCollections} scheduled · ${unscheduledCollections} unscheduled`;
        }
    });
    
    const totalOrders = ordersToShow.length;
    document.getElementById('totalOrdersCount').textContent = totalOrders;
    
    setTimeout(updateCollectionStats, 50);
}

// Normalize collection zones to ensure consistent capitalization
function normalizeCollectionZones() {
    console.log('Normalizing collection zones...');
    let fixed = 0;
    
    customers.forEach(c => {
        // Check if zone is some variation of "collection" but not exactly "Collection"
        if (c.zone && c.zone.toLowerCase() === 'collection' && c.zone !== 'Collection') {
            console.log(`  Fixing ${c.name}: "${c.zone}" → "Collection"`);
            c.zone = 'Collection';
            fixed++;
        }
    });
    
    console.log(`Fixed ${fixed} customers with inconsistent collection zone capitalization`);
    return fixed;
}



// ========== TOGGLE FUNCTIONS ==========
function toggleCard(card) {
    const customerId  = card.getAttribute('data-customer-id');
    const collapsed   = card.querySelector('.collapsed-view');
    const expanded    = card.querySelector('.expanded-view');
    const icon        = card.querySelector('.expand-icon-inline');
    const isExpanded  = card.getAttribute('data-expanded') === 'true';

    if (isExpanded) {
        expanded.style.display = 'none';
        collapsed.style.display = 'block';
        if (icon) icon.className = 'fas fa-chevron-down expand-icon-inline';
        card.setAttribute('data-expanded', 'false');
        cardExpandedStates.currentOrders[customerId] = false;
    } else {
        expanded.style.display = 'block';
        collapsed.style.display = 'none';
        if (icon) icon.className = 'fas fa-chevron-up expand-icon-inline';
        card.setAttribute('data-expanded', 'true');
        cardExpandedStates.currentOrders[customerId] = true;
    }
    saveCardStates();
}

function toggleWeeklyCard(card) {
    const customerId    = card.getAttribute('data-customer-id');
    const day           = card.getAttribute('data-day');
    const weeklyCardKey = `${customerId}_${day}`;
    const collapsed     = card.querySelector('.weekly-collapsed-view');
    const expanded      = card.querySelector('.weekly-expanded-view');
    const icon          = card.querySelector('.weekly-expand-icon-inline');
    const isExpanded    = card.getAttribute('data-expanded') === 'true';

    if (isExpanded) {
        expanded.style.display = 'none';
        collapsed.style.display = 'block';
        if (icon) icon.className = `fas fa-chevron-down weekly-expand-icon-inline`;
        card.setAttribute('data-expanded', 'false');
        cardExpandedStates.weeklyPlan[weeklyCardKey] = false;
    } else {
        expanded.style.display = 'block';
        collapsed.style.display = 'none';
        if (icon) icon.className = `fas fa-chevron-up weekly-expand-icon-inline`;
        card.setAttribute('data-expanded', 'true');
        cardExpandedStates.weeklyPlan[weeklyCardKey] = true;
    }
    saveCardStates();
}


// ========== STATUS UPDATE MODAL ==========
function showStatusUpdateModal(customer) {
    const modal   = document.getElementById('orderModal');
    const details = document.getElementById('orderDetails');
    const van     = VANS.find(v=>v.id===customer.assignedVan);
    const zoneColor = ZONES[customer.zone]?.color||'#6b7280';
    const staffList = (customer.assignedStaff||[]).map(id=>staffMembers.find(s=>s.id===id)).filter(Boolean);
    const driver    = customer.assignedDriver ? staffMembers.find(s=>s.id===customer.assignedDriver) : null;

    const bayStatuses = ['ready_for_delivery'];
    const statusButtons = Object.values(ORDER_STATUSES).map(s => {
        const needsBayPrompt = BAY_FEATURE_ENABLED && BAY_ASSIGNMENT_MODE === 'order' && bayStatuses.includes(s);
        const onclick = needsBayPrompt
            ? `promptBayAndUpdateStatus(${customer.id},'${s}')`
            : `updateOrderStatus(${customer.id},'${s}');closeOrderModal();`;
        return `<button class="order-action-btn" onclick="${onclick}"
                style="background:${s===customer.status?'var(--primary)':'var(--gray-100)'};color:${s===customer.status?'white':'var(--gray-700)'};padding:8px 12px;border:none;border-radius:var(--radius);cursor:pointer;font-weight:600;">
            ${getStatusText(s)}
        </button>`;
    }).join('');

    details.innerHTML = `
        <div style="padding:10px;">
            <h4 style="margin-bottom:15px;color:${zoneColor};">${customer.name}</h4>
            <p><strong><i class="fas fa-map-marker-alt"></i> Address:</strong><br>${customer.address}</p>
            <p><strong><i class="fas fa-map-pin"></i> Zone:</strong> ${customer.zone}</p>
            <p><strong><i class="fas fa-tag"></i> Current Status:</strong>
                <span class="order-status ${getStatusClass(customer.status)}">${getStatusText(customer.status)}</span></p>
            ${staffList.length ? `<p><strong><i class="fas fa-users" style="color:var(--staff);"></i> Assigned Pickers:</strong></p>
                <div class="staff-tags">${staffList.map(s=>`<span class="staff-tag"><i class="fas fa-user"></i> ${s.name}</span>`).join('')}</div>` : ''}
            ${driver ? `<p><strong><i class="fas fa-truck" style="color:#f59e0b;"></i> Driver:</strong> ${driver.name}</p>` : ''}
            ${customer.assignedVan ? `<p><strong><i class="fas fa-truck"></i> Van:</strong> <span style="color:${van.color}">${van.name}</span></p>
                <p><strong><i class="fas fa-calendar"></i> Day:</strong> ${getDayName(customer.assignedDay)}</p>` : ''}
            ${BAY_FEATURE_ENABLED && BAY_ASSIGNMENT_MODE === 'order' ? `<p><strong><i class="fas fa-warehouse"></i> Bay:</strong> ${customer.bayNumber ? `<span style="font-weight:700;color:var(--primary);">Bay ${customer.bayNumber}</span>` : '<span style="color:var(--text-muted);">Not assigned</span>'} <button onclick="promptBayAndUpdateStatus(${customer.id}, null)" style="margin-left:8px;background:none;border:1px solid var(--border);border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px;color:var(--text-muted);">Edit</button></p>` : ''}
            <p><strong><i class="fas fa-road"></i> Distance:</strong> ${customer.roadDistanceFromSite.toFixed(1)} km (${customer.roadDurationFromSite.toFixed(0)} min)</p>
            <div style="margin-top:20px;">
                <h5 style="margin-bottom:10px;">Update Status:</h5>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;">${statusButtons}</div>
            </div>
            <div style="display:flex;gap:10px;margin-top:20px;border-top:1px solid var(--gray-200);padding-top:20px;flex-wrap:wrap;">
            <button style="background:var(--primary);color:white;border:none;padding:8px 14px;border-radius:var(--radius);cursor:pointer;font-weight:600;" onclick="assignToCollection(${customer.id});closeOrderModal();">
                           <i class="fas fa-boxes"></i> Collection
                       </button>
                <button class="btn-primary" style="background:var(--primary);color:white;border:none;padding:8px 14px;border-radius:var(--radius);cursor:pointer;font-weight:600;" onclick="closeOrderModal();switchScreen('map');setTimeout(()=>focusOnCustomer(${customer.id}),250);">
                    <i class="fas fa-map-marker-alt"></i> View on Map
                </button>
                <button style="background:var(--staff);color:white;border:none;padding:8px 14px;border-radius:var(--radius);cursor:pointer;font-weight:600;" onclick="openAssignStaffModal(${customer.id});closeOrderModal();">
                    <i class="fas fa-users"></i> Manage Pickers
                </button>
                <button style="background:#f59e0b;color:white;border:none;padding:8px 14px;border-radius:var(--radius);cursor:pointer;font-weight:600;" onclick="openAssignDriverModal(${customer.id});closeOrderModal();">
                    <i class="fas fa-truck"></i> Assign Driver
                </button>
                <button style="background:#6f42c1;color:white;border:none;padding:8px 14px;border-radius:var(--radius);cursor:pointer;font-weight:600;" onclick="openPassportModal(${customer.id});closeOrderModal();">
                    <i class="fas fa-passport"></i> View Passport
                </button>
                ${!customer.assignedVan
                    ? `<button style="background:var(--success);color:white;border:none;padding:8px 14px;border-radius:var(--radius);cursor:pointer;font-weight:600;" onclick="assignToVanDay(${customer.id},${currentVan},${currentDay});closeOrderModal();">
                           <i class="fas fa-plus"></i> Assign to Van
                       </button>
                       `
                    : `<button style="background:var(--danger);color:white;border:none;padding:8px 14px;border-radius:var(--radius);cursor:pointer;font-weight:600;" onclick="unassignCustomer(${customer.id});closeOrderModal();">
                           <i class="fas fa-times"></i> Remove from Route
                       </button>`}
                ${customer.status === ORDER_STATUSES.DELIVERED || customer.status === ORDER_STATUSES.COLLECTED || customer.status === ORDER_STATUSES.CANCELLED ? 
                    `<button style="background:#dc3545;color:white;border:none;padding:8px 14px;border-radius:var(--radius);cursor:pointer;font-weight:600;" onclick="promptClearOrderData(${customer.id});closeOrderModal();">
                        <i class="fas fa-broom"></i> Clear Order Data
                    </button>` : ''
                }
            </div>
        </div>`;
    modal.classList.add('active');
}

function selectBayBtn(n) {
    document.getElementById('bay-number-input').value = n;
    for (var i = 1; i <= 10; i++) {
        var btn = document.getElementById('bay-btn-' + i);
        if (!btn) continue;
        var sel = i === n;
        btn.style.border    = '3px solid ' + (sel ? 'var(--primary)' : 'var(--border)');
        btn.style.background = sel ? 'var(--primary)' : 'var(--surface)';
        btn.style.color      = sel ? 'white' : 'var(--text)';
    }
}

function promptBayAndUpdateStatus(customerId, newStatus) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;

    const existing = customer.bayNumber || '';
    const modal = document.getElementById('orderModal');
    const details = document.getElementById('orderDetails');

    const prevHTML = details.innerHTML;

    const bayButtons = Array.from({length: (typeof BAY_COUNT !== 'undefined' ? BAY_COUNT : 3)}, (_, i) => {
        const n = i + 1;
        const selected = String(existing) === String(n);
        return `<button id="bay-btn-${n}" onclick="selectBayBtn(${n})"
            style="flex:1;padding:18px 10px;font-size:20px;font-weight:800;border-radius:10px;cursor:pointer;border:3px solid ${selected ? 'var(--primary)' : 'var(--border)'};background:${selected ? 'var(--primary)' : 'var(--surface)'};color:${selected ? 'white' : 'var(--text)'};transition:all 0.15s;display:flex;flex-direction:column;align-items:center;gap:4px;">
            <i class="fas fa-warehouse" style="font-size:22px;"></i>
            Bay ${n}
        </button>`;
    }).join('');

    details.innerHTML = `
        <div style="padding:20px;">
            <h4 style="margin-bottom:6px;">Assign Bay Number</h4>
            <p style="color:var(--text-muted);font-size:13px;margin-bottom:18px;">
                Select the bay where you left the trolley for <strong>${customer.name}</strong>.
            </p>
            <div style="display:flex;gap:10px;margin-bottom:24px;">${bayButtons}</div>
            <input type="hidden" id="bay-number-input" value="${existing}">
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <button onclick="confirmBayAssignment(${customerId}, ${newStatus ? `'${newStatus}'` : 'null'})"
                    style="background:var(--primary);color:white;border:none;padding:10px 20px;border-radius:var(--radius);cursor:pointer;font-weight:700;font-size:14px;">
                    <i class="fas fa-check"></i> ${newStatus ? 'Set Bay & Update Status' : 'Save Bay'}
                </button>
                <button onclick="closeOrderModal()"
                    style="background:var(--gray-100);color:var(--gray-700);border:none;padding:10px 20px;border-radius:var(--radius);cursor:pointer;font-weight:600;">
                    Cancel
                </button>
            </div>
        </div>`;

    modal.classList.add('active');
}

function confirmBayAssignment(customerId, newStatus) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    const inp = document.getElementById('bay-number-input');
    const val = inp ? inp.value.trim() : '';
    const num = parseInt(val);
    customer.bayNumber = (!isNaN(num) && num >= 1) ? String(num) : null;
    customer.bayOverflow = null;

    if (customer.bayNumber) {
        const primaryBay = customer.bayNumber;
        const limits = (typeof companyConfig !== 'undefined' && companyConfig.bayTrolleyLimits) ||
                       (typeof BAY_TROLLEY_LIMITS !== 'undefined' ? BAY_TROLLEY_LIMITS : {});
        const limit = parseInt(limits[primaryBay] || limits[String(primaryBay)]) || 17;
        const totalInBay = _getBayTrolleyTotal(primaryBay);
        const overflow = totalInBay - limit;
        if (overflow > 0) {
            saveData();
            _showBayOverflowDialog(customer, primaryBay, overflow, newStatus);
            return;
        }
    }
    _finalizeBayAssignment(customerId, newStatus);
}

function _getBayTrolleyTotal(bayNum) {
    var total = 0;
    (typeof customers !== 'undefined' ? customers : []).forEach(function(c) {
        var bn = String(c.bayNumber || '');
        var oc = c.bayOverflow ? (parseInt(c.bayOverflow.count) || 0) : 0;
        var ob = c.bayOverflow ? String(c.bayOverflow.bay || '') : '';
        var t = getTotalTrolleyCount(c) || 1;
        if (bn === String(bayNum)) total += t - oc;
        if (ob === String(bayNum) && oc > 0) total += oc;
    });
    return total;
}

function _showBayOverflowDialog(customer, primaryBay, overflowCount, newStatus) {
    const customerId = customer.id;
    const bayCount = (typeof BAY_COUNT !== 'undefined') ? BAY_COUNT : 3;
    const limits = (typeof companyConfig !== 'undefined' && companyConfig.bayTrolleyLimits) ||
                   (typeof BAY_TROLLEY_LIMITS !== 'undefined' ? BAY_TROLLEY_LIMITS : {});
    const details = document.getElementById('orderDetails');

    const bayButtons = Array.from({length: bayCount}, (_, i) => i + 1)
        .filter(n => String(n) !== String(primaryBay))
        .map(n => {
            const lim = parseInt(limits[n] || limits[String(n)]) || 17;
            const cur = _getBayTrolleyTotal(n);
            const free = Math.max(0, lim - cur);
            const freeColor = free >= overflowCount ? '#16a34a' : free > 0 ? '#d97706' : '#dc2626';
            return `<button id="ovf-bay-btn-${n}" onclick="selectOverflowBayBtn(${n})"
                style="flex:1;min-width:80px;padding:12px 8px;font-size:14px;font-weight:800;border-radius:10px;
                       cursor:pointer;border:2.5px solid var(--border);background:var(--surface);
                       color:var(--text);transition:all 0.15s;display:flex;flex-direction:column;align-items:center;gap:4px;">
                <i class="fas fa-warehouse" style="font-size:16px;"></i>
                Bay ${n}
                <span style="font-size:10px;font-weight:700;color:${freeColor};">${free} free</span>
            </button>`;
        }).join('');

    details.innerHTML = `
        <div style="padding:20px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <i class="fas fa-exclamation-triangle" style="color:#dc2626;font-size:18px;"></i>
                <h4 style="margin:0;color:#dc2626;">Bay ${primaryBay} Over Capacity</h4>
            </div>
            <p style="color:var(--text-muted);font-size:13px;margin-bottom:18px;">
                <strong>${overflowCount} trolley${overflowCount > 1 ? 's' : ''}</strong> for
                <strong>${customer.name}</strong> won't fit in Bay ${primaryBay}.
                Select a bay to move the excess trolleys to, or keep all in Bay ${primaryBay}.
            </p>
            <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;">${bayButtons}</div>
            <input type="hidden" id="overflow-bay-input" value="">
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <button onclick="confirmOverflowBay(${customerId}, ${overflowCount}, ${newStatus ? `'${newStatus}'` : 'null'})"
                    style="background:var(--primary);color:white;border:none;padding:10px 20px;
                           border-radius:var(--radius);cursor:pointer;font-weight:700;font-size:14px;">
                    <i class="fas fa-arrow-right"></i> Move Overflow
                </button>
                <button onclick="skipOverflowBay(${customerId}, ${newStatus ? `'${newStatus}'` : 'null'})"
                    style="background:var(--gray-100);color:var(--gray-700);border:none;padding:10px 20px;
                           border-radius:var(--radius);cursor:pointer;font-weight:600;">
                    Keep All in Bay ${primaryBay}
                </button>
            </div>
        </div>`;
    document.getElementById('orderModal').classList.add('active');
}

function selectOverflowBayBtn(n) {
    document.getElementById('overflow-bay-input').value = n;
    for (var i = 1; i <= 20; i++) {
        var btn = document.getElementById('ovf-bay-btn-' + i);
        if (!btn) continue;
        var sel = String(i) === String(n);
        btn.style.border     = sel ? '2.5px solid var(--primary)' : '2.5px solid var(--border)';
        btn.style.background = sel ? 'var(--primary)' : 'var(--surface)';
        btn.style.color      = sel ? 'white' : 'var(--text)';
    }
}

function confirmOverflowBay(customerId, overflowCount, newStatus) {
    const inp = document.getElementById('overflow-bay-input');
    const val = inp ? inp.value.trim() : '';
    const overflowBay = parseInt(val);
    if (!isNaN(overflowBay) && overflowBay >= 1) {
        const customer = customers.find(c => c.id === customerId);
        if (customer) customer.bayOverflow = { bay: String(overflowBay), count: overflowCount };
    }
    saveData();
    _finalizeBayAssignment(customerId, newStatus);
}

function skipOverflowBay(customerId, newStatus) {
    _finalizeBayAssignment(customerId, newStatus);
}

function _finalizeBayAssignment(customerId, newStatus) {
    saveData();
    if (newStatus) {
        updateOrderStatus(customerId, newStatus);
    } else {
        updateAllDisplays();
    }
    closeOrderModal();
    if (typeof refreshDriverView === 'function') refreshDriverView();
}

function updateOrderStatus(customerId, newStatus) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    
    const oldStatus = customer.status;
    
    if (!customer.passport) customer.passport = { ...PASSPORT_FIELDS };
    if (!customer.passport.timestamps) customer.passport.timestamps = {};
    if (!customer.passport.pickingMetrics) customer.passport.pickingMetrics = {};
    
    if (newStatus === ORDER_STATUSES.PICKING && oldStatus !== ORDER_STATUSES.PICKING) {
        if (!customer.passport.timestamps.pickingStarted) {
            customer.passport.timestamps.pickingStarted = new Date().toISOString();
        }
    }
    
    if (newStatus === ORDER_STATUSES.READY_FOR_DELIVERY) {
        if (!customer.passport.timestamps.pickingCompleted) {
            customer.passport.timestamps.pickingCompleted = new Date().toISOString();
        }
        if (!customer.passport.timestamps.readyForDelivery) {
            customer.passport.timestamps.readyForDelivery = new Date().toISOString();
        }
        
        if (customer.passport.timestamps.pickingStarted) {
            const started = new Date(customer.passport.timestamps.pickingStarted);
            const completed = new Date(customer.passport.timestamps.pickingCompleted);
            customer.passport.pickingMetrics.pickingDuration = Math.round((completed - started) / (1000 * 60));
        }
        
        const plantCount = parseInt(customer.passport.numberOfPlants) || 0;
        const pickingDuration = customer.passport.pickingMetrics.pickingDuration || 0;
        if (plantCount > 0 && pickingDuration > 0) {
            customer.passport.pickingMetrics.plantsPerHour = Math.round((plantCount / pickingDuration) * 60);
        }
    }
    
    if (newStatus === ORDER_STATUSES.DELIVERED || newStatus === ORDER_STATUSES.COLLECTED) {
        if (!customer.passport.timestamps.deliveredAt) {
            customer.passport.timestamps.deliveredAt = new Date().toISOString();
        }
        
        const timeToFirst = customer.passport.pickingMetrics.timeToFirstPicker || 0;
        const pickingDuration = customer.passport.pickingMetrics.pickingDuration || 0;
        const numberOfPickers = customer.passport.pickingMetrics.numberOfPickers || 1;
        const plantCount = parseInt(customer.passport.numberOfPlants) || 0;
        
        const expectedTimePerPlant = 2;
        const expectedTotalTime = plantCount * expectedTimePerPlant / numberOfPickers;
        const actualTotalTime = timeToFirst + pickingDuration;
        
        let efficiency = 100;
        if (actualTotalTime > 0 && expectedTotalTime > 0) {
            efficiency = Math.min(100, Math.round((expectedTotalTime / actualTotalTime) * 100));
        }
        
        customer.passport.pickingMetrics.efficiencyScore = efficiency;
        
        // Update repeat customer status
        const repeatStatus = updateRepeatCustomerStatus(customer);
        if (repeatStatus && repeatStatus.isRepeat) {
            showNotification(`🏆 Repeat customer! This is order #${repeatStatus.orderCount} for ${customer.name}`, 'info');
        }
        
        // Add to analytics history before potentially clearing
        addAnalyticsRecord(customer);
        updateStaffMetrics(customer);
    }
    
    customer.status = newStatus;

    // Free up bay space when order leaves the staging area
    const bayReleaseStatuses = [ORDER_STATUSES.DELIVERING, ORDER_STATUSES.DELIVERED, ORDER_STATUSES.COLLECTED, ORDER_STATUSES.CANCELLED];
    if (bayReleaseStatuses.includes(newStatus)) {
        customer.bayNumber   = null;
        customer.bayOverflow = null;
        if (typeof refreshDriverView === 'function') refreshDriverView();
    }

    const terminalStates = [ORDER_STATUSES.DELIVERED, ORDER_STATUSES.COLLECTED, ORDER_STATUSES.CANCELLED];

    if (terminalStates.includes(newStatus)) {
        // Record timestamp
        if (customer.passport && customer.passport.timestamps) {
            if (newStatus === ORDER_STATUSES.DELIVERED && !customer.passport.timestamps.deliveredAt) {
                customer.passport.timestamps.deliveredAt = new Date().toISOString();
            }
        }
        // Keep order visible — greyed out in zone/heatmap, struck through in swimlanes
        // Staff can click "Reset for next order" in the modal when ready to clear
        updateAllDisplays();
        quickSaveCustomer(customer);
        showNotification('Order marked as ' + getStatusText(newStatus) + '. It stays visible greyed out — click Reset when ready to clear.');
        return;
    }

    updateAllDisplays();
    saveData();
    showNotification('Order status updated to ' + getStatusText(newStatus));
}

function closeOrderModal() { document.getElementById('orderModal').classList.remove('active'); }

function assignToCollection(customerId, dayId = null) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    
    // Remove from any existing van assignment
    if (customer.assignedVan && customer.assignedDay) {
        const idx = deliveryPlan[customer.assignedVan][customer.assignedDay].indexOf(customerId);
        if (idx > -1) deliveryPlan[customer.assignedVan][customer.assignedDay].splice(idx, 1);
    }
    
    // Set as collection
    customer.assignedVan = null;
    customer.zone = 'Collection';
    
    // Set the collection day if provided
    if (dayId !== undefined) {
        customer.assignedDay = dayId;
    }
    // If no day provided but customer already has a day, keep it
    // If no day provided and no existing day, leave as null (unscheduled)
    
    customer.status = ORDER_STATUSES.PENDING;
    customer.assignedDriver = null;
    
    updateMapMarkers(); 
    updateAllDisplays(); 
    if (typeof updateCollectionStats === 'function') updateCollectionStats();
    saveData();
    
    const dayName = dayId ? getDayName(dayId) : (customer.assignedDay ? getDayName(customer.assignedDay) : 'unscheduled');
    showNotification(`Customer marked for collection on ${dayName}`);
}

function unassignFromCollection(customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer || customer.zone !== 'Collection') return;
    
    customer.zone = determineZone(customer.lat, customer.lng, customer.name);
    customer.status = ORDER_STATUSES.PENDING;
    // Keep the assigned day if they had one
    // Don't clear assignedDay automatically
    
    updateMapMarkers(); 
    updateAllDisplays(); 
    if (typeof updateCollectionStats === 'function') updateCollectionStats();
    saveData();
    showNotification('Customer removed from collection');
}



// ========== TIMELINE INDICATOR FUNCTIONS ==========

// Update the timeline marker position based on current day
function updateTimelineMarker() {
    const marker = document.getElementById('todayMarker');
    if (!marker) return;

    // Update the week date label to always show the current Mon–Sun range
    const weekLabel = document.getElementById('weekDateLabel');
    if (weekLabel) {
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0=Sun,1=Mon,...
        const diffToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
        const monday = new Date(now);
        monday.setDate(now.getDate() + diffToMonday);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        const fmt = (d) => d.toLocaleDateString('en-GB', { month: 'long', day: 'numeric', year: 'numeric' });
        weekLabel.textContent = `Week of ${fmt(monday)} – ${fmt(sunday)}`;
    }
    
    // Get current day (0 = Sunday, 1 = Monday, etc.)
    const today = new Date().getDay();
    
    // Convert to our day indices (0 = Monday for our display)
    let dayIndex;
    switch(today) {
        case 1: dayIndex = 0; break; // Monday
        case 2: dayIndex = 1; break; // Tuesday
        case 3: dayIndex = 2; break; // Wednesday
        case 4: dayIndex = 3; break; // Thursday
        case 5: dayIndex = 4; break; // Friday
        case 6: dayIndex = 5; break; // Saturday
        case 0: dayIndex = 6; break; // Sunday
        default: dayIndex = -1; // Hide marker on invalid days
    }
    
    if (dayIndex === -1) {
        marker.style.display = 'none';
        return;
    }
    
    marker.style.display = 'flex';
    
    // Get all timeline day elements
    const timelineDays = document.querySelectorAll('.timeline-day');
    if (timelineDays.length === 0) return;
    
    // Get the position of the current day using offsetLeft so scroll position doesn't affect it
    const currentDayElement = timelineDays[dayIndex];
    const track = document.querySelector('.timeline-track');
    const leftPosition = currentDayElement.offsetLeft + (currentDayElement.offsetWidth / 2);
    const trackWidth = track ? track.offsetWidth : 0;

    // Clamp so the marker never escapes the track bounds
    const clamped = Math.max(0, Math.min(leftPosition, trackWidth));

    // Set marker position
    marker.style.left = `${clamped}px`;
    
    // Highlight the corresponding day column
    const dayColumns = document.querySelectorAll('.day-column');
    dayColumns.forEach((col, index) => {
        col.classList.remove('today');
        if (index === dayIndex) {
            col.classList.add('today');
        }
    });
    
    // Update table header highlighting
    const tableHeaders = document.querySelectorAll('.plan-table thead th');
    tableHeaders.forEach((th, index) => {
        th.classList.remove('today');
        if (index === dayIndex) {
            th.classList.add('today');
        }
    });
}

// Call this function when the weekly plan screen is loaded
function initializeTimeline() {
    updateTimelineMarker();
    
    // Update marker every minute to account for day changes
    setInterval(updateTimelineMarker, 60000);
}


// ========== ZONE DRAG AND DROP ==========
var _draggedCustomerId = null;

function _onZoneDrop(event, targetZone) {
    event.preventDefault();
    event.currentTarget.classList.remove('zone-drag-over');
    if (!_draggedCustomerId) return;

    const id = parseFloat(_draggedCustomerId);
    const customer = customers.find(c => c.id === id);
    if (!customer) return;

    const fromZone = getTempZone(customer);
    if (fromZone === targetZone) return;  // dropped on same zone

    setTempZone(id, targetZone);

    // Show/hide the clear button based on whether any overrides exist
    const btn = document.getElementById('clearTempMovesBtn');
    if (btn) {
        const hasOverrides = Object.keys(_tempZoneOverrides).length > 0;
        btn.style.display = hasOverrides ? 'inline-flex' : 'none';
    }

    showNotification(
        customer.name + ' temporarily moved to ' + targetZone +
        ' (real zone unchanged)',
        'info'
    );
    _draggedCustomerId = null;
}

// ========== TEMP ZONE HELPER FUNCTIONS ==========
// Persisted in localStorage — survives page refresh, cleared only by user

const TEMP_ZONE_KEY = 'PEP_temp_zone_overrides';

var _tempZoneOverrides = (function() {
    try {
        const saved = localStorage.getItem(TEMP_ZONE_KEY);
        return saved ? JSON.parse(saved) : {};
    } catch(e) { return {}; }
})();
window._tempZoneOverrides = _tempZoneOverrides;

function _saveTempZones() {
    try {
        localStorage.setItem(TEMP_ZONE_KEY, JSON.stringify(_tempZoneOverrides));
        window._tempZoneOverrides = _tempZoneOverrides;
    } catch(e) {}
}

function getTempZone(customer) {
    return _tempZoneOverrides[customer.id] || customer.zone;
}

function setTempZone(customerId, zoneName) {
    const id = parseFloat(customerId);
    const customer = customers.find(c => c.id === id);
    if (!customer) return;

    if (zoneName === customer.zone) {
        delete _tempZoneOverrides[id];
    } else {
        _tempZoneOverrides[id] = zoneName;
    }
    _saveTempZones();
    updateOrdersGrid();
    _updateClearTempBtn();

    // Broadcast to all other clients
    if (typeof socket !== 'undefined' && socket && socket.connected) {
        socket.emit('temp-zone-update', {
            customerId: id,
            zoneName: zoneName,
            overrides: _tempZoneOverrides
        });
    }
}

function clearTempZone(customerId) {
    delete _tempZoneOverrides[parseFloat(customerId)];
    _saveTempZones();
    updateOrdersGrid();
    _updateClearTempBtn();
}

function clearAllTempZones() {
    const count = Object.keys(_tempZoneOverrides).length;
    _tempZoneOverrides = {};
    window._tempZoneOverrides = _tempZoneOverrides;
    try { localStorage.removeItem(TEMP_ZONE_KEY); } catch(e) {}
    updateOrdersGrid();
    _updateClearTempBtn();
    if (count > 0) showNotification('All ' + count + ' temporary moves cleared', 'info');

    // Broadcast clear to all clients
    if (typeof socket !== 'undefined' && socket && socket.connected) {
        socket.emit('temp-zone-update', { overrides: {} });
    }
}

// Alias so both button names work
function clearAllTempZoneOverrides() { clearAllTempZones(); }

function _updateClearTempBtn() {
    const btn = document.getElementById('clearTempMovesBtn');
    if (!btn) return;
    const hasOverrides = Object.keys(_tempZoneOverrides).length > 0;
    btn.style.opacity = hasOverrides ? '1' : '0';
    btn.style.pointerEvents = hasOverrides ? 'auto' : 'none';
}

// Run on page load to restore button state from saved overrides
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _updateClearTempBtn);
} else {
    setTimeout(_updateClearTempBtn, 500); // after all scripts load
}

// Export zone DnD functions to global scope
window._onZoneDrop               = _onZoneDrop;
window.clearAllTempZoneOverrides  = clearAllTempZoneOverrides;
window.setTempZone                = setTempZone;
window.getTempZone                = getTempZone;

// ── ETA badge on order cards ──────────────────────────────────────────────
// Called after calculateAllETAs() runs — injects ETA badge into visible cards
function refreshETABadges() {
    if (typeof calculateAllETAs !== 'function') return;
    calculateAllETAs(currentVan, currentDay);
    document.querySelectorAll('.order-card[data-customer-id]').forEach(function(card) {
        var id = parseFloat(card.getAttribute('data-customer-id'));
        var existing = card.querySelector('.eta-badge');
        if (existing) existing.remove();

        var badge = formatETABadge(id);
        if (!badge) return;

        var nameEl = card.querySelector('.order-customer-name, .customer-name, h4, strong');
        if (nameEl) {
            var span = document.createElement('span');
            span.className = 'eta-badge';
            span.innerHTML = ' ' + badge;
            nameEl.parentNode.insertBefore(span, nameEl.nextSibling);
        }
    });
}
window.refreshETABadges = refreshETABadges;

// ========== PILL GRID LAYOUT ==========
var _ordersLayout = localStorage.getItem('PEP_ordersLayout') || 'cards';
// Apply layout once DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { applyOrdersLayout(_ordersLayout); });
} else { setTimeout(function() { applyOrdersLayout(_ordersLayout); }, 300); }
var _activePillCustomerId = null;

function applyOrdersLayout(layout) {
    _ordersLayout = layout;
    localStorage.setItem('PEP_ordersLayout', layout);
    // Update zone-orders containers
    document.querySelectorAll('.zone-orders').forEach(function(el) {
        el.style.padding = layout === 'pills' ? '6px' : '10px';
    });
    closePillDetail();
    updateOrdersGrid();
}

function _statusColor(status) {
    return status === 'picking'            ? '#3b82f6'
         : status === 'ready_for_delivery' ? '#16a34a'
         : status === 'delivered'          ? '#6b7280'
         : status === 'delivering'         ? '#7c3aed'
         : '#f59e0b';
}

function renderPillCard(customer, van, staffMembers) {
    var p        = customer.passport || {};
    var status   = customer.status || 'pending';
    var dot      = _statusColor(status);
    var vanColor = van ? van.color : '#6b7280';
    var vanName  = van ? van.name.split(' ')[0] : '?';
    var dayNames = ['','Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    var dayShort = dayNames[customer.assignedDay] || '';
    var trolleys = getTotalTrolleyCount(customer);
    var tempMoved = window._tempZoneOverrides && window._tempZoneOverrides[customer.id];
    var extraOrders = Array.isArray(p.orders) ? p.orders.length : 0;
    var totalOrders = 1 + extraOrders;

    var multiBadge = totalOrders > 1
        ? '<span style="position:absolute;top:-5px;right:-5px;background:#dc2626;color:white;'
          + 'font-size:8px;font-weight:800;width:15px;height:15px;border-radius:50%;'
          + 'display:flex;align-items:center;justify-content:center;border:1.5px solid white;">'
          + totalOrders + '</span>'
        : '';

    var tags = '';
    if (p.barcodedLabels)  tags += '<span style="font-size:7px;background:#dbeafe;color:#1e40af;border-radius:3px;padding:0 3px;margin-left:2px;">BC</span>';
    if (p.prePricedLabels) tags += '<span style="font-size:7px;background:#ede9fe;color:#6d28d9;border-radius:3px;padding:0 3px;margin-left:2px;">PP</span>';

    var priorityEnabled = typeof FEATURES === 'undefined' || FEATURES.priority !== false;
    var pillPriorityColors = { 1: '#dc2626', 2: '#d97706', 3: '#2563eb' };
    var pillPriorityLabels = { 1: '⚡P1', 2: '🔶P2', 3: '🔷P3' };
    var priorityTag = (customer.priority && priorityEnabled)
        ? '<span style="font-size:7px;font-weight:800;color:white;background:' + (pillPriorityColors[customer.priority] || '#6b7280')
          + ';border-radius:3px;padding:0 3px;margin-left:2px;">' + (pillPriorityLabels[customer.priority] || 'P' + customer.priority) + '</span>'
        : '';

    var pBorderColors = { 1: '#dc2626', 2: '#d97706', 3: '#2563eb' };
    var borderLeft = tempMoved
        ? 'border-left:3px solid #f59e0b;'
        : (customer.priority && priorityEnabled)
            ? 'border-left:3px solid ' + (pBorderColors[customer.priority] || '#6b7280') + ';'
            : 'border-left:3px solid ' + vanColor + ';';

    return '<div class="pill-item" data-id="' + customer.id + '" '
        + 'onclick="showPillDetail(' + customer.id + ')" '
        + 'style="background:var(--surface);border:1px solid var(--border);border-radius:7px;'
        + 'padding:5px 8px;cursor:pointer;transition:all 0.12s;position:relative;' + borderLeft + '">'
        + multiBadge
        + '<div style="font-size:10px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text);display:flex;align-items:center;gap:3px;">'
        + '<span style="width:7px;height:7px;border-radius:50%;flex-shrink:0;background:' + dot + ';"></span>'
        + customer.name + tags + priorityTag
        + '</div>'
        + '<div style="font-size:9px;color:var(--gray-500);margin-top:2px;display:flex;gap:6px;">'
        + '<span>' + vanName + ' ' + dayShort + '</span>'
        + (trolleys ? '<span style="color:#374151;">' + (+trolleys).toFixed(2).replace(/\.?0+$/,'') + 'T</span>' : '')
        + (p.orderNumber ? '<span style="color:#9ca3af;">#' + p.orderNumber.slice(-4) + '</span>' : '')
        + '</div>'
        + '</div>';
}

function showPillDetail(customerId) {
    var customer = customers.find(function(c) { return c.id === customerId; });
    if (!customer) return;
    _activePillCustomerId = customerId;

    document.querySelectorAll('.pill-item').forEach(function(el) {
        var isActive = el.dataset.id == customerId;
        el.style.borderColor = isActive ? 'var(--primary)' : 'var(--border)';
        el.style.boxShadow   = isActive ? '0 0 0 2px var(--primary)' : 'none';
    });

    var p         = customer.passport || {};
    var van       = VANS.find(function(v) { return v.id === customer.assignedVan; });
    var dayObj    = DAYS.find(function(d) { return d.id === customer.assignedDay; });
    var staffList = (customer.assignedStaff || [])
        .map(function(id) { return staffMembers.find(function(s) { return s.id === id; }); })
        .filter(Boolean).map(function(s) { return s.name; });
    var sLabel    = typeof getStatusText === 'function' ? getStatusText(customer.status) : customer.status;
    var sColor    = _statusColor(customer.status);
    var extraOrders = Array.isArray(p.orders) ? p.orders : [];
    var totalOrders = 1 + extraOrders.length;
    var driver    = customer.assignedDriver ? staffMembers.find(function(s){return s.id===customer.assignedDriver;}) : null;

    var html = '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">'
        + '<div><div style="font-size:18px;font-weight:800;color:var(--text);">' + customer.name + '</div>'
        + '<div style="font-size:12px;color:var(--gray-500);margin-top:2px;">'
        + (van ? van.name : '') + ' &middot; ' + (dayObj ? dayObj.name : '') + ' &middot; Zone: ' + customer.zone + '</div></div>'
        + '<button onclick="closePillDetail()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--gray-400);">&times;</button>'
        + '</div>';

    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">'
        + '<span style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:20px;font-size:12px;font-weight:700;background:' + sColor + '18;color:' + sColor + ';">'
        + '<span style="width:8px;height:8px;border-radius:50%;background:' + sColor + ';"></span>' + sLabel + '</span>';
    if (p.barcodedLabels)  html += '<span style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;background:#dbeafe;color:#1e40af;">Barcoded Labels +15min</span>';
    if (p.prePricedLabels) html += '<span style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;background:#ede9fe;color:#6d28d9;">Pre-Priced Labels +20min</span>';
    html += '</div>';

    var fields = [
        ['Order #',    p.orderNumber || '—'],
        ['Trolleys',   getTotalTrolleyCount(customer).toFixed(2).replace(/\.?0+$/,'') + ' trolleys'],
        ['Plants',     p.plantVariety || '—'],
        ['Quantity',   p.numberOfPlants || '—'],
        ['Pot size',   p.potSize || '—'],
        ['Required by',p.requiredByDate || '—'],
        ['Pickers',    staffList.length ? staffList.join(', ') : '—'],
        ['Driver',     driver ? driver.name : '—'],
    ];
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;margin-bottom:14px;">';
    fields.forEach(function(f) {
        html += '<div style="border-bottom:1px solid var(--border);padding:5px 0;">'
            + '<div style="font-size:10px;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.4px;">' + f[0] + '</div>'
            + '<div style="font-size:13px;font-weight:700;color:var(--text);">' + f[1] + '</div></div>';
    });
    html += '</div>';

    if (totalOrders > 1) {
        html += '<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:10px 12px;margin-bottom:14px;">'
            + '<div style="font-size:11px;font-weight:800;color:#92400e;margin-bottom:6px;">&#9888; ' + totalOrders + ' orders for this customer</div>';
        html += '<div style="font-size:11px;color:#78350f;padding:3px 0;border-bottom:1px solid #fde68a;">'
            + '<strong>1 (primary):</strong> ' + (p.plantVariety||'Plants') + ' &middot; ' + (p.trolleyCount||0) + 'T &middot; '
            + (van ? van.name : '') + ' ' + (dayObj ? dayObj.name : '') + '</div>';
        extraOrders.forEach(function(ord, i) {
            var ov = VANS.find(function(v){return v.id===ord.assignedVan;});
            var od = DAYS.find(function(d){return d.id===ord.assignedDay;});
            html += '<div style="font-size:11px;color:#78350f;padding:3px 0;border-bottom:1px solid #fde68a80;">'
                + '<strong>' + (i+2) + ':</strong> ' + (ord.plantVariety||'Plants') + ' &middot; ' + (ord.trolleyCount||0) + 'T &middot; '
                + (ov?ov.name:'?') + ' ' + (od?od.name:'?') + '</div>';
        });
        html += '</div>';
    }

    if (p.specialDeliveryInstructions) {
        html += '<div style="background:#f0fdf4;border-left:3px solid #16a34a;border-radius:0 6px 6px 0;padding:8px 12px;margin-bottom:14px;font-size:11px;color:#166534;">'
            + '<strong>Delivery note:</strong> ' + p.specialDeliveryInstructions + '</div>';
    }

    html += '<div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap;">'
        + '<button onclick="closePillDetail();window._pillPassport(' + customerId + ')" '
        + 'style="flex:1;min-width:120px;padding:11px;background:var(--primary);color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">'
        + 'Open Passport</button>'
        + '<button onclick="closePillDetail();window._pillStatus(' + customerId + ')" '
        + 'style="flex:1;min-width:120px;padding:11px;background:#0f766e;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">'
        + 'Update Status</button>'
        + '</div>';

    var mb = document.getElementById('pillModalBody');
    if (mb) mb.innerHTML = html;
    var modal = document.getElementById('pillDetailModal');
    if (modal) modal.style.display = 'flex';
}

function closePillDetail() {
    _activePillCustomerId = null;
    var modal = document.getElementById('pillDetailModal');
    if (modal) modal.style.display = 'none';
    document.querySelectorAll('.pill-item').forEach(function(el) {
        el.style.borderColor = 'var(--border)';
        el.style.boxShadow   = 'none';
    });
}

window._pillPassport = function(id) { if(typeof openPassportModal==='function') openPassportModal(id); };
window._pillStatus   = function(id) { var c=customers.find(function(x){return x.id===id;}); if(c&&typeof showStatusUpdateModal==='function') showStatusUpdateModal(c); };
window.applyOrdersLayout  = applyOrdersLayout;
window.showPillDetail      = showPillDetail;
window.closePillDetail     = closePillDetail;

// ========== VIEW MODES: HEATMAP + SWIMLANES ==========
var _ordersView = 'zones'; // 'zones' | 'heatmap' | 'swimlanes'

function setOrdersView(view) {
    _ordersView = view;

    // Update button styles
    ['zones','heatmap','swimlanes'].forEach(function(v) {
        var btn = document.getElementById('viewBtn' + v.charAt(0).toUpperCase() + v.slice(1));
        if (!btn) return;
        btn.style.background = v === view ? 'var(--primary)' : 'transparent';
        btn.style.color      = v === view ? 'white' : 'var(--gray-600)';
    });

    // Show/hide panels
    var zoneGrid   = document.querySelector('.zone-grid');
    var heatmap    = document.getElementById('ordersHeatmapView');
    var swimlane   = document.getElementById('ordersSwimlaneView');
    if (zoneGrid)  zoneGrid.style.display  = view === 'zones'     ? '' : 'none';
    if (heatmap)   heatmap.style.display   = view === 'heatmap'   ? 'block' : 'none';
    if (swimlane)  swimlane.style.display  = view === 'swimlanes' ? 'block' : 'none';

    if (view === 'heatmap')   renderHeatmap();
    if (view === 'swimlanes') renderSwimlanes();
    if (view === 'zones')     updateOrdersGrid();
}

// ── Shared: get all orders to show (respects day filter) ───────────────────
function _getAllOrdersForView() {
    var filterDayIds = null;
    if (_ordersDateFilter === 'today-tomorrow') {
        filterDayIds = new Set([_getTodayDayId(), _getNextDayId()]);
    }
    return customers.filter(function(c) {
        if (c.assignedVan && c.assignedDay) {
            if (filterDayIds && !filterDayIds.has(c.assignedDay)) return false;
            return true;
        }
        if (c.zone && c.zone.toLowerCase() === 'collection' && c.passport) {
            var p = c.passport;
            return (p.orderNumber && p.orderNumber.trim()) ||
                   (p.plantVariety && p.plantVariety.trim()) ||
                   (parseInt(p.numberOfPlants) > 0);
        }
        return false;
    });
}

// ── HEATMAP ────────────────────────────────────────────────────────────────
function renderHeatmap() {
    var grid = document.getElementById('heatmapGrid');
    if (!grid) return;

    var orders = _getAllOrdersForView();
    // Sort by trolley count descending — biggest orders first
    orders.sort(function(a, b) {
        return getTotalTrolleyCount(b) - getTotalTrolleyCount(a);
    });

    var maxTrolleys = orders.reduce(function(max, c) {
        return Math.max(max, getTotalTrolleyCount(c));
    }, 1);

    grid.innerHTML = orders.map(function(customer) {
        var p        = customer.passport || {};
        var trolleys = getTotalTrolleyCount(customer);
        var ratio    = trolleys / maxTrolleys; // 0–1
        var van      = VANS.find(function(v) { return v.id === customer.assignedVan; });
        var dayNames = ['','Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
        var day      = dayNames[customer.assignedDay] || '';
        var status   = customer.status || 'pending';

        // Cell size scales with trolley count: min 80px, max 200px
        var size = Math.round(80 + ratio * 120);

        // Colour intensity based on trolleys
        var intensity = Math.round(80 + ratio * 175); // 80–255
        var r = Math.round(67  + ratio * (124 - 67));
        var g = Math.round(56  + ratio * (30  - 56));
        var b = Math.round(202 + ratio * (105 - 202));
        var bg = 'rgb(' + r + ',' + g + ',' + b + ')';
        var textColor = ratio > 0.4 ? 'white' : '#3730a3';

        // Status dot
        var statusDot = _statusColor(status);

        // Multi-order badge
        var extraOrders = Array.isArray(p.orders) ? p.orders.length : 0;
        var multiBadge = (1 + extraOrders) > 1
            ? '<span style="position:absolute;top:4px;right:4px;background:#ef4444;color:white;'
              + 'font-size:8px;font-weight:900;width:14px;height:14px;border-radius:50%;'
              + 'display:flex;align-items:center;justify-content:center;">'
              + (1 + extraOrders) + '</span>' : '';

        // Label badges
        var labels = '';
        if (p.barcodedLabels)  labels += '<span style="font-size:7px;background:rgba(255,255,255,0.25);color:white;border-radius:3px;padding:0 3px;">BC</span> ';
        if (p.prePricedLabels) labels += '<span style="font-size:7px;background:rgba(255,255,255,0.25);color:white;border-radius:3px;padding:0 3px;">PP</span>';

        var isTerminal3 = ['delivered','collected','cancelled'].indexOf(status) > -1;
        var terminalStyle = isTerminal3 ? 'opacity:0.4;filter:grayscale(80%);' : '';

        return '<div onclick="showPillDetail(' + customer.id + ')" style="'
            + 'width:' + size + 'px;height:' + size + 'px;'
            + 'background:' + bg + ';border-radius:10px;padding:8px;'
            + 'cursor:pointer;position:relative;transition:transform 0.15s;flex-shrink:0;'
            + 'display:flex;flex-direction:column;justify-content:space-between;'
            + 'box-shadow:0 2px 8px rgba(0,0,0,0.15);' + terminalStyle + '" '
            + 'onmouseover="this.style.transform=\'scale(1.04)\'" '
            + 'onmouseout="this.style.transform=\'scale(1)\'">'
            + multiBadge
            + '<div style="font-size:' + Math.round(9 + ratio*5) + 'px;font-weight:800;'
            + 'color:' + textColor + ';line-height:1.2;word-break:break-word;">'
            + customer.name + '</div>'
            + '<div>'
            + '<div style="font-size:' + Math.round(14 + ratio*8) + 'px;font-weight:900;'
            + 'color:' + textColor + ';opacity:0.9;">' + (trolleys || '—') + '<span style="font-size:9px;font-weight:600;"> trolleys</span></div>'
            + '<div style="font-size:9px;color:' + textColor + ';opacity:0.8;margin-top:2px;display:flex;align-items:center;gap:4px;">'
            + '<span style="width:6px;height:6px;border-radius:50%;background:' + statusDot + ';flex-shrink:0;"></span>'
            + (van ? van.name.split(' ')[0] : '') + ' ' + day + ' ' + labels
            + '</div>'
            + '</div>'
            + '</div>';
    }).join('');
}

// ── SWIMLANES ──────────────────────────────────────────────────────────────
function renderSwimlanes() {
    var container = document.getElementById('swimlaneContainer');
    if (!container) return;

    var orders = _getAllOrdersForView();
    var dayNames = ['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

    // Group by status
    var lanes = [
        { key: 'pending',            label: 'Pending',          color: '#f59e0b', bg: '#fffbeb' },
        { key: 'picking',            label: 'Picking',          color: '#3b82f6', bg: '#eff6ff' },
        { key: 'ready_for_delivery', label: 'Ready to Go',      color: '#16a34a', bg: '#f0fdf4' },
        { key: 'delivering',         label: 'Out for Delivery',  color: '#7c3aed', bg: '#f5f3ff' },
        { key: 'delivered',          label: 'Delivered',         color: '#6b7280', bg: '#f9fafb' },
        { key: 'collected',          label: 'Collected',         color: '#0284c7', bg: '#f0f9ff' },
    ];

    container.innerHTML = lanes.map(function(lane) {
        var laneOrders = orders.filter(function(c) {
            return (c.status || 'pending') === lane.key;
        });
        if (laneOrders.length === 0) return '';

        // Sort by trolley count desc within each lane
        laneOrders.sort(function(a,b) {
            return getTotalTrolleyCount(b) - getTotalTrolleyCount(a);
        });

        var chips = laneOrders.map(function(customer) {
            var p        = customer.passport || {};
            var trolleys = getTotalTrolleyCount(customer);
            var van      = VANS.find(function(v) { return v.id === customer.assignedVan; });
            var vanColor = van ? van.color : '#6b7280';
            var day      = dayNames[customer.assignedDay] || '';
            var extraOrders = Array.isArray(p.orders) ? p.orders.length : 0;
            var multiDot = (1+extraOrders) > 1
                ? '<span style="background:#ef4444;color:white;font-size:8px;font-weight:900;'
                  + 'width:13px;height:13px;border-radius:50%;display:inline-flex;align-items:center;'
                  + 'justify-content:center;margin-left:3px;">' + (1+extraOrders) + '</span>' : '';
            var labels = '';
            if (p.barcodedLabels)  labels += '<span style="font-size:7px;background:#dbeafe;color:#1e40af;border-radius:2px;padding:0 3px;">BC</span>';
            if (p.prePricedLabels) labels += '<span style="font-size:7px;background:#ede9fe;color:#6d28d9;border-radius:2px;padding:0 3px;margin-left:2px;">PP</span>';

            var isTerminalLane = ['delivered','collected','cancelled'].indexOf(lane.key) > -1;
            var nameStyle = isTerminalLane
                ? 'text-decoration:line-through;color:#9ca3af;'
                : 'color:#111827;';

            return '<div onclick="showPillDetail(' + customer.id + ')" '
                + 'style="display:inline-flex;align-items:center;gap:5px;background:white;'
                + 'border:1px solid #e5e7eb;border-left:3px solid ' + vanColor + ';'
                + 'border-radius:6px;padding:5px 9px;cursor:pointer;margin:3px;'
                + (isTerminalLane ? 'opacity:0.6;' : '')
                + 'transition:box-shadow 0.12s;box-shadow:0 1px 3px rgba(0,0,0,0.06);" '
                + 'onmouseover="this.style.boxShadow=\'0 2px 8px rgba(0,0,0,0.15)\'" '
                + 'onmouseout="this.style.boxShadow=\'0 1px 3px rgba(0,0,0,0.06)\'">'
                + '<div>'
                + '<div style="font-size:11px;font-weight:800;display:flex;align-items:center;gap:3px;' + nameStyle + '">'
                + customer.name + multiDot
                + '</div>'
                + '<div style="font-size:9px;color:#6b7280;margin-top:1px;display:flex;gap:5px;align-items:center;">'
                + '<span>' + (van ? van.name.split(' ')[0] : '?') + ' ' + (day ? day.substring(0,3) : '') + '</span>'
                + (trolleys ? '<span style="font-weight:700;color:#374151;">' + trolleys + 'T</span>' : '')
                + labels
                + '</div>'
                + '</div>'
                + '</div>';
        }).join('');

        var total   = laneOrders.length;
        var totalT  = laneOrders.reduce(function(s,c){ return s + getTotalTrolleyCount(c); }, 0);

        return '<div style="margin-bottom:12px;border-radius:10px;overflow:hidden;">'
            + '<div style="background:' + lane.color + ';padding:9px 14px;display:flex;justify-content:space-between;align-items:center;">'
            + '<span style="color:white;font-size:13px;font-weight:800;">' + lane.label + '</span>'
            + '<div style="display:flex;gap:8px;">'
            + '<span style="background:rgba(255,255,255,0.25);color:white;font-size:11px;font-weight:700;padding:2px 10px;border-radius:20px;">' + total + ' orders</span>'
            + (totalT ? '<span style="background:rgba(255,255,255,0.25);color:white;font-size:11px;font-weight:700;padding:2px 10px;border-radius:20px;">' + totalT + ' trolleys</span>' : '')
            + '</div>'
            + '</div>'
            + '<div style="background:' + lane.bg + ';padding:8px;min-height:44px;display:flex;flex-wrap:wrap;align-content:flex-start;">'
            + chips
            + '</div>'
            + '</div>';
    }).filter(Boolean).join('');
}

window.setOrdersView = setOrdersView;


// ========== END-OF-DAY AUTO-RESET ==========
// Automatically calls clearOrderData() on all terminal-status orders
// at the configured end-of-day time (default 17:00).
// Runs a check every minute. Safe to run on all connected devices —
// each device checks independently but the DB write is idempotent.

var EOD_RESET_TIME = '17:00'; // configurable — set in Settings → System
var _eodLastRan    = null;    // date string 'YYYY-MM-DD' — prevents double-run

function _runEndOfDayReset() {
    var now     = new Date();
    var dateStr = now.toISOString().split('T')[0];

    // Already ran today — skip
    if (_eodLastRan === dateStr) return;

    var terminalStatuses = ['delivered', 'collected', 'cancelled'];
    var toReset = customers.filter(function(c) {
        return terminalStatuses.indexOf(c.status || '') > -1;
    });

    if (toReset.length === 0) {
        _eodLastRan = dateStr; // nothing to do, mark as done
        return;
    }

    console.log('[EOD] Auto-resetting ' + toReset.length + ' completed orders');
    toReset.forEach(function(c) { clearOrderData(c.id); });

    _eodLastRan = dateStr;
    try { localStorage.setItem('PEP_eodLastRan', dateStr); } catch(e) {}

    updateAllDisplays();
    saveData();
    showNotification('End of day: ' + toReset.length + ' completed orders reset for next delivery', 'info');
}

function _checkEODTime() {
    var now     = new Date();
    var hh      = now.getHours().toString().padStart(2, '0');
    var mm      = now.getMinutes().toString().padStart(2, '0');
    var current = hh + ':' + mm;

    if (current >= EOD_RESET_TIME) {
        _runEndOfDayReset();
    }
}

// Restore last-ran date from localStorage so page refresh doesn't re-run
(function() {
    try {
        var stored = localStorage.getItem('PEP_eodLastRan');
        if (stored) _eodLastRan = stored;
    } catch(e) {}
    // Check every minute
    setInterval(_checkEODTime, 60000);
    // Also check immediately on load (handles refresh after EOD time)
    setTimeout(_checkEODTime, 3000);
})();

function setEODResetTime(timeStr) {
    EOD_RESET_TIME = timeStr || '17:00';
    console.log('[EOD] Reset time set to', EOD_RESET_TIME);
}

window.setEODResetTime = setEODResetTime;

// ========== SEARCH / FILTER ==========
window._ordersSearchQuery    = '';
window._ordersStatusFilter   = '';
window._ordersVanFilter      = '';
window._ordersPriorityFilter = '';

function setOrdersSearch(val) {
    window._ordersSearchQuery = (val || '').toLowerCase().trim();
    _updateClearFiltersBtn();
    updateOrdersGrid();
}

function setOrdersStatusFilter(val) {
    window._ordersStatusFilter = val || '';
    _updateClearFiltersBtn();
    updateOrdersGrid();
}

function setOrdersVanFilter(val) {
    window._ordersVanFilter = val || '';
    _updateClearFiltersBtn();
    updateOrdersGrid();
}

function clearOrdersFilters() {
    window._ordersSearchQuery    = '';
    window._ordersStatusFilter   = '';
    window._ordersVanFilter      = '';
    window._ordersPriorityFilter = '';
    const si = document.getElementById('ordersSearchInput');
    const sf = document.getElementById('ordersStatusFilter');
    const vf = document.getElementById('ordersVanFilter');
    const pf = document.getElementById('ordersPriorityFilter');
    if (si) si.value = '';
    if (sf) sf.value = '';
    if (vf) vf.value = '';
    if (pf) pf.value = '';
    _updateClearFiltersBtn();
    updateOrdersGrid();
}

function setOrdersPriorityFilter(val) {
    window._ordersPriorityFilter = val || '';
    _updateClearFiltersBtn();
    updateOrdersGrid();
}

function _updateClearFiltersBtn() {
    const btn = document.getElementById('clearOrdersFiltersBtn');
    if (!btn) return;
    const active = window._ordersSearchQuery || window._ordersStatusFilter || window._ordersVanFilter || window._ordersPriorityFilter;
    btn.style.display = active ? 'inline-flex' : 'none';
}

function _applyOrdersFilters(list) {
    let out = list.slice(); // always return a new array so callers can safely mutate the original
    if (window._ordersSearchQuery) {
        const q = window._ordersSearchQuery;
        out = out.filter(c =>
            (c.name || '').toLowerCase().includes(q) ||
            (c.address || '').toLowerCase().includes(q) ||
            (c.postcode || '').toLowerCase().includes(q) ||
            (c.passport?.orderNumber || '').toLowerCase().includes(q)
        );
    }
    if (window._ordersStatusFilter) {
        out = out.filter(c => (c.status || '') === window._ordersStatusFilter);
    }
    if (window._ordersVanFilter) {
        const vid = parseInt(window._ordersVanFilter);
        out = out.filter(c => c.assignedVan === vid);
    }
    if (window._ordersPriorityFilter) {
        if (window._ordersPriorityFilter === 'none') {
            out = out.filter(c => !c.priority);
        } else {
            const p = parseInt(window._ordersPriorityFilter);
            out = out.filter(c => c.priority === p);
        }
    }
    return out;
}

// Populate the van filter dropdown after VANS is available
function _populateVanFilterDropdown() {
    const el = document.getElementById('ordersVanFilter');
    if (!el || typeof VANS === 'undefined') return;
    // Keep only the first "All Vans" option, then rebuild
    el.innerHTML = '<option value="">All Vans</option>';
    VANS.forEach(v => {
        const o = document.createElement('option');
        o.value = v.id;
        o.textContent = v.name;
        el.appendChild(o);
    });
}
window._populateVanFilterDropdown = _populateVanFilterDropdown;

// ========== BULK SELECT ==========
window._bulkSelectMode  = false;
window._bulkSelectedIds = new Set();

function toggleBulkSelectMode() {
    window._bulkSelectMode = !window._bulkSelectMode;
    if (!window._bulkSelectMode) {
        window._bulkSelectedIds.clear();
        _hideBulkBar();
    }
    const btn = document.getElementById('bulkSelectToggleBtn');
    if (btn) {
        btn.style.background = window._bulkSelectMode ? 'var(--primary)' : 'var(--surface)';
        btn.style.color      = window._bulkSelectMode ? 'white' : 'var(--text)';
        btn.style.border     = window._bulkSelectMode ? '1px solid var(--primary)' : '1px solid var(--border)';
    }
    updateOrdersGrid();
}

function exitBulkMode() {
    if (!window._bulkSelectMode) return;
    window._bulkSelectMode = false;
    window._bulkSelectedIds.clear();
    _hideBulkBar();
    const btn = document.getElementById('bulkSelectToggleBtn');
    if (btn) {
        btn.style.background = 'var(--surface)';
        btn.style.color      = 'var(--text)';
        btn.style.border     = '1px solid var(--border)';
    }
    updateOrdersGrid();
}

function toggleBulkSelect(customerId) {
    if (window._bulkSelectedIds.has(customerId)) {
        window._bulkSelectedIds.delete(customerId);
    } else {
        window._bulkSelectedIds.add(customerId);
    }
    _updateBulkBar();
    // Sync checkbox visual state without full re-render
    const cb = document.querySelector(`[data-bulk-cb="${customerId}"]`);
    if (cb) cb.checked = window._bulkSelectedIds.has(customerId);
    const card = document.querySelector(`[data-customer-id="${customerId}"]`);
    if (card) card.style.outline = window._bulkSelectedIds.has(customerId) ? '2px solid var(--primary)' : '';
}

function clearBulkSelection() {
    window._bulkSelectedIds.clear();
    _updateBulkBar();
    updateOrdersGrid();
}

function _updateBulkBar() {
    const bar = document.getElementById('bulkActionBar');
    const cnt = document.getElementById('bulkSelectedCount');
    if (!bar) return;
    const n = window._bulkSelectedIds.size;
    if (n > 0) {
        bar.style.display = 'flex';
        if (cnt) cnt.textContent = `${n} selected`;
    } else {
        _hideBulkBar();
    }
}

function _hideBulkBar() {
    const bar = document.getElementById('bulkActionBar');
    if (bar) bar.style.display = 'none';
    const sel = document.getElementById('bulkStatusSelect');
    if (sel) sel.value = '';
}

function bulkApplyStatus() {
    const sel = document.getElementById('bulkStatusSelect');
    const newStatus = sel ? sel.value : '';
    if (!newStatus) {
        if (typeof showNotification === 'function') showNotification('Please choose a status first', 'warning');
        return;
    }
    if (!window._bulkSelectedIds.size) {
        if (typeof showNotification === 'function') showNotification('No orders selected', 'warning');
        return;
    }

    const ids = [...window._bulkSelectedIds];
    ids.forEach(id => {
        if (typeof updateOrderStatus === 'function') updateOrderStatus(id, newStatus);
    });

    const label = newStatus.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    if (typeof showNotification === 'function')
        showNotification(`✅ ${ids.length} orders updated to "${label}"`, 'success');

    clearBulkSelection();
    exitBulkMode();
}

function bulkApplyPriority() {
    const sel = document.getElementById('bulkPrioritySelect');
    const val = sel ? sel.value : '';
    if (!val) {
        if (typeof showNotification === 'function') showNotification('Please choose a priority level first', 'warning');
        return;
    }
    if (!window._bulkSelectedIds.size) {
        if (typeof showNotification === 'function') showNotification('No orders selected', 'warning');
        return;
    }

    const newPriority = val === 'none' ? null : parseInt(val);
    const ids = [...window._bulkSelectedIds];
    ids.forEach(id => {
        const c = customers.find(x => x.id === id);
        if (c) c.priority = newPriority;
    });

    if (typeof saveData === 'function') saveData();

    const label = val === 'none' ? 'cleared' : `P${newPriority}`;
    if (typeof showNotification === 'function')
        showNotification(`✅ ${ids.length} orders set to ${label}`, 'success');

    if (sel) sel.value = '';
    clearBulkSelection();
    exitBulkMode();
}

window.toggleBulkSelectMode  = toggleBulkSelectMode;
window.toggleBulkSelect      = toggleBulkSelect;
window.clearBulkSelection    = clearBulkSelection;
window.bulkApplyStatus       = bulkApplyStatus;
window.bulkApplyPriority     = bulkApplyPriority;
window.exitBulkMode          = exitBulkMode;
window.setOrdersSearch       = setOrdersSearch;
window.setOrdersStatusFilter = setOrdersStatusFilter;
window.setOrdersVanFilter    = setOrdersVanFilter;
window.setOrdersPriorityFilter = setOrdersPriorityFilter;
window.clearOrdersFilters    = clearOrdersFilters;
