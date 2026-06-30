// ========== DRIVER DELIVERY SHEET FUNCTIONS ==========

// Generate and print delivery sheet for current van/day
function printDriverDeliverySheet() {
    const van = VANS.find(v => v.id === currentVan);
    const day = DAYS.find(d => d.id === currentDay);
    
    if (!van || !day) {
        showNotification('Please select a van and day first', 'warning');
        return;
    }
    
    const assignments = deliveryPlan[currentVan]?.[currentDay] || [];
    
    if (assignments.length === 0) {
        showNotification('No deliveries scheduled for this van/day', 'warning');
        return;
    }
    
    // Get assigned customers
    const assignedCustomers = assignments
        .map(id => customers.find(c => c.id === id))
        .filter(c => c);
    
    // Create printable content
    const printContent = generateDeliverySheetHTML(van, day, assignedCustomers);
    
    // Open print window
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
}

// Generate HTML for delivery sheet
function generateDeliverySheetHTML(van, day, customers) {
    const date = new Date().toLocaleDateString('en-GB', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    // Calculate route statistics
    let totalDistance = 0;
    let totalDuration = 0;
    let totalPlants = 0;
    let totalPotsToReturn = 0;
    
    // Warehouse to first customer
    if (customers.length > 0) {
        const first = getRoadDistanceDuration(
            YOUR_SITE.lat, YOUR_SITE.lng,
            customers[0].lat, customers[0].lng
        );
        totalDistance += first.distance;
        totalDuration += first.duration;
        
        // Between customers
        for (let i = 0; i < customers.length - 1; i++) {
            const leg = getRoadDistanceDuration(
                customers[i].lat, customers[i].lng,
                customers[i + 1].lat, customers[i + 1].lng
            );
            totalDistance += leg.distance;
            totalDuration += leg.duration;
        }
        
        // Last customer back to warehouse
        const last = getRoadDistanceDuration(
            customers[customers.length - 1].lat,
            customers[customers.length - 1].lng,
            YOUR_SITE.lat, YOUR_SITE.lng
        );
        totalDistance += last.distance;
        totalDuration += last.duration;
    }
    
    // Calculate total plants and pots to return
    customers.forEach(c => {
        totalPlants += parseInt(c.passport?.numberOfPlants) || 0;
        if (c.passport?.potsToReturn) {
            totalPotsToReturn += parseInt(c.passport.numberOfPotsToReturn) || 0;
        }
    });
    
    const totalTimeWithStops = totalDuration + (customers.length * (typeof STOP_TIME_PER_DELIVERY !== 'undefined' ? STOP_TIME_PER_DELIVERY : 15)); // configurable mins per stop
    
    // Generate stops table
    const stopsRows = customers.map((customer, index) => {
        const plantCount = parseInt(customer.passport?.numberOfPlants) || 0;
        const staffNames = (customer.assignedStaff || [])
            .map(id => staffMembers.find(s => s.id === id)?.name)
            .filter(Boolean)
            .join(', ') || 'Not assigned';
        
        const driver = customer.assignedDriver ? 
            staffMembers.find(s => s.id === customer.assignedDriver)?.name : 'Not assigned';
        
        const specialInstructions = customer.passport?.specialDeliveryInstructions || 'None';
        const accessNotes = customer.passport?.siteAccessRestrictions ? 
            `⚠️ Access: ${customer.passport.siteAccessTimes || 'Restricted'}` : '';
        
        const contactInfo = customer.passport?.onsiteContactName ? 
            `Contact: ${customer.passport.onsiteContactName} ${customer.passport.onsiteContactPhone || ''}` : '';
        
        // Pot return information
        let potReturnInfo = '';
        if (customer.passport?.potsToReturn && customer.passport?.numberOfPotsToReturn > 0) {
            potReturnInfo = `
                <div class="pot-return-info">
                    <i class="fas fa-recycle"></i> 
                    <strong>Collect ${customer.passport.numberOfPotsToReturn} used pots</strong>
                    ${customer.passport.potReturnSizes ? `<br>📏 Sizes: ${customer.passport.potReturnSizes}` : ''}
                    ${customer.passport.potReturnNotes ? `<br>📝 ${customer.passport.potReturnNotes}` : ''}
                </div>
            `;
        }
        
        // Repeat customer info
        let repeatInfo = '';
        if (customer.passport?.isRepeatCustomer && customer.passport?.totalOrdersCount > 1) {
            repeatInfo = `<br><span class="repeat-badge-print">🏆 Repeat Customer (${customer.passport.totalOrdersCount} total orders)</span>`;
        }
        
        // Calculate distance and duration from previous stop
        const prevLat = index === 0 ? YOUR_SITE.lat : customers[index - 1].lat;
        const prevLng = index === 0 ? YOUR_SITE.lng : customers[index - 1].lng;
        const legData = getRoadDistanceDuration(prevLat, prevLng, customer.lat, customer.lng);
        const distFromPrev = legData.distance;
        const durationFromPrev = legData.duration;
        
        return `
            <tr class="stop-row">
                <td class="stop-number">${index + 1}</td>
                <td>
                    <strong>${customer.name}</strong><br>
                    <span class="address">${customer.address}</span>
                    ${customer.postcode ? `<br><span class="postcode">${customer.postcode}</span>` : ''}
                    ${repeatInfo}
                </td>
                <td class="text-center">${plantCount}</td>
                <td class="text-center pot-return-cell">
                    ${potReturnInfo || '—'}
                </td>
                <td>
                    ${specialInstructions !== 'None' ? `<div class="instruction">📝 ${specialInstructions}</div>` : ''}
                    ${accessNotes ? `<div class="access-note">${accessNotes}</div>` : ''}
                    ${contactInfo ? `<div class="contact">📞 ${contactInfo}</div>` : ''}
                </td>
                <td class="text-center">${distFromPrev.toFixed(1)} km</td>
                <td class="text-center">${Math.round(durationFromPrev)} min</td>
                <td>${staffNames}</td>
                <td>${driver}</td>
                <td>
                    <span class="status-badge status-${customer.status}">
                        ${getStatusText(customer.status)}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
    
    // Get driver name for the van
    const vanDriver = staffMembers.find(s => 
        s.type === 'driver' && s.vehiclePreference === van.name
    )?.name || van.driver || 'Not assigned';
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Delivery Sheet - ${van.name} - ${day.name}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            line-height: 1.5;
            color: #1C1917;
            background: white;
            padding: 20px;
            max-width: 1400px;
            margin: 0 auto;
        }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 3px solid #16A34A;
        }
        
        .title h1 {
            font-size: 28px;
            font-weight: 800;
            color: #1C1917;
            margin-bottom: 5px;
        }
        
        .title h1 i {
            color: #16A34A;
            margin-right: 10px;
        }
        
        .title .date {
            color: #78716C;
            font-size: 14px;
        }
        
        .van-info {
            background: #F5F5F4;
            padding: 15px 25px;
            border-radius: 10px;
            text-align: right;
            border: 1px solid #E7E5E4;
        }
        
        .van-info .van-name {
            font-size: 24px;
            font-weight: 700;
            color: #16A34A;
            margin-bottom: 5px;
        }
        
        .van-info .day-name {
            font-size: 18px;
            color: #44403C;
        }
        
        .summary-cards {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 15px;
            margin-bottom: 30px;
        }
        
        .summary-card {
            background: #F5F5F4;
            border: 1px solid #E7E5E4;
            border-radius: 10px;
            padding: 15px;
            text-align: center;
        }
        
        .summary-card .label {
            font-size: 12px;
            color: #78716C;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 5px;
        }
        
        .summary-card .value {
            font-size: 28px;
            font-weight: 700;
            color: #1C1917;
        }
        
        .summary-card .unit {
            font-size: 14px;
            color: #78716C;
            margin-left: 3px;
        }
        
        .driver-info {
            background: #F0FDF4;
            border: 2px solid #BBF7D0;
            border-radius: 10px;
            padding: 15px 20px;
            margin-bottom: 30px;
            display: flex;
            align-items: center;
            gap: 20px;
        }
        
        .driver-info i {
            font-size: 24px;
            color: #16A34A;
        }
        
        .driver-info .driver-details {
            flex: 1;
        }
        
        .driver-info .driver-name {
            font-size: 18px;
            font-weight: 700;
            color: #1C1917;
        }
        
        .driver-info .driver-role {
            color: #78716C;
            font-size: 14px;
        }
        
        .driver-info .vehicle {
            background: white;
            padding: 8px 15px;
            border-radius: 8px;
            border: 1px solid #BBF7D0;
            color: #16A34A;
            font-weight: 600;
        }
        
        .stops-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
            font-size: 13px;
        }
        
        .stops-table th {
            background: #1C1917;
            color: white;
            padding: 12px 8px;
            font-weight: 600;
            text-align: left;
            white-space: nowrap;
        }
        
        .stops-table th:first-child {
            border-top-left-radius: 8px;
        }
        
        .stops-table th:last-child {
            border-top-right-radius: 8px;
        }
        
        .stops-table td {
            padding: 12px 8px;
            border-bottom: 1px solid #E7E5E4;
            vertical-align: top;
        }
        
        .stops-table tr:hover td {
            background: #F5F5F4;
        }
        
        .stop-number {
            font-weight: 700;
            color: #16A34A;
            font-size: 16px;
            text-align: center;
        }
        
        .address {
            color: #44403C;
            font-size: 12px;
            display: block;
            margin-top: 3px;
        }
        
        .postcode {
            font-weight: 600;
            color: #16A34A;
            font-size: 12px;
        }
        
        .instruction {
            background: #FFFBEB;
            border-left: 3px solid #F59E0B;
            padding: 5px 8px;
            margin-bottom: 5px;
            font-size: 11px;
            border-radius: 4px;
        }
        
        .access-note {
            background: #FEF2F2;
            border-left: 3px solid #DC2626;
            padding: 5px 8px;
            margin-bottom: 5px;
            font-size: 11px;
            border-radius: 4px;
        }
        
        .contact {
            background: #EFF6FF;
            border-left: 3px solid #2563EB;
            padding: 5px 8px;
            font-size: 11px;
            border-radius: 4px;
        }
        
        .pot-return-info {
            background: #F0FDF4;
            border-left: 3px solid #16A34A;
            padding: 5px 8px;
            margin-bottom: 5px;
            font-size: 11px;
            border-radius: 4px;
            text-align: left;
        }
        
        .pot-return-info i {
            color: #16A34A;
            margin-right: 4px;
        }
        
        .pot-return-cell {
            background: #FEFCE8;
        }
        
        .repeat-badge-print {
            display: inline-block;
            background: #FEF3C7;
            color: #92400E;
            padding: 2px 6px;
            border-radius: 12px;
            font-size: 9px;
            font-weight: 600;
            margin-top: 4px;
        }
        
        .text-center {
            text-align: center;
        }
        
        .status-badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .status-pending { background: #FEF3C7; color: #92400E; }
        .status-picking { background: #DBEAFE; color: #1E40AF; }
        .status-ready_for_delivery { background: #FED7AA; color: #9A3412; }
        .status-delivering { background: #DCFCE7; color: #166534; }
        .status-delivered { background: #E5E5E5; color: #44403C; }
        
        .route-summary {
            background: #F5F5F4;
            border: 1px solid #E7E5E4;
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 30px;
        }
        
        .route-summary h3 {
            font-size: 16px;
            margin-bottom: 15px;
            color: #1C1917;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .route-summary h3 i {
            color: #16A34A;
        }
        
        .route-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
        }
        
        .route-item {
            background: white;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid #E7E5E4;
        }
        
        .route-item .route-label {
            font-size: 11px;
            color: #78716C;
            text-transform: uppercase;
            margin-bottom: 3px;
        }
        
        .route-item .route-value {
            font-size: 18px;
            font-weight: 700;
            color: #1C1917;
        }
        
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px dashed #E7E5E4;
            display: flex;
            justify-content: space-between;
            color: #78716C;
            font-size: 12px;
        }
        
        .signature-section {
            margin-top: 40px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 40px;
        }
        
        .signature-box {
            border-top: 2px solid #1C1917;
            padding-top: 10px;
            margin-top: 20px;
        }
        
        .signature-label {
            font-size: 12px;
            color: #78716C;
            margin-bottom: 5px;
        }
        
        @media print {
            body { padding: 0; }
            .summary-card { break-inside: avoid; }
            .stops-table { break-inside: auto; }
            tr { break-inside: avoid; }
            .pot-return-info {
                background: #F0FDF4;
                break-inside: avoid;
            }
            .repeat-badge-print {
                background: #FEF3C7;
            }
        }
        
        .emergency-contacts {
            margin-top: 30px;
            padding: 15px;
            background: #FEF2F2;
            border: 1px solid #FECACA;
            border-radius: 8px;
            font-size: 12px;
        }
        
        .checklist {
            margin-top: 30px;
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
        }
        
        .checklist-item {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 12px;
        }
        
        .checklist-item input[type="checkbox"] {
            width: 16px;
            height: 16px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">
            <h1><i class="fas fa-truck"></i> PEP Delivery Sheet</h1>
            <div class="date">Generated: ${date}</div>
        </div>
        <div class="van-info">
            <div class="van-name">${van.name}</div>
            <div class="day-name">${day.name}</div>
        </div>
    </div>
    
    <div class="summary-cards">
        <div class="summary-card">
            <div class="label">Total Stops</div>
            <div class="value">${customers.length}</div>
        </div>
        <div class="summary-card">
            <div class="label">Total Plants</div>
            <div class="value">${totalPlants}</div>
        </div>
        <div class="summary-card">
            <div class="label">Pots to Collect</div>
            <div class="value">${totalPotsToReturn}</div>
        </div>
        <div class="summary-card">
            <div class="label">Total Distance</div>
            <div class="value">${totalDistance.toFixed(1)} <span class="unit">km</span></div>
        </div>
        <div class="summary-card">
            <div class="label">Drive Time</div>
            <div class="value">${Math.floor(totalDuration / 60)}h ${totalDuration % 60}m</div>
        </div>
        <div class="summary-card">
            <div class="label">Est. Finish</div>
            <div class="value">${formatTime(new Date(Date.now() + totalTimeWithStops * 60000))}</div>
        </div>
    </div>
    
    <div class="driver-info">
        <i class="fas fa-user-circle"></i>
        <div class="driver-details">
            <div class="driver-name">${vanDriver}</div>
            <div class="driver-role">Assigned Driver</div>
        </div>
        <div class="vehicle">
            <i class="fas fa-truck"></i> ${van.name}
        </div>
    </div>
    
    <div class="route-summary">
        <h3><i class="fas fa-route"></i> Route Overview</h3>
        <div class="route-grid">
            <div class="route-item">
                <div class="route-label">Start Point</div>
                <div class="route-value">Warehouse</div>
                <div style="font-size: 11px; color: #78716C;">${YOUR_SITE.address}</div>
            </div>
            <div class="route-item">
                <div class="route-label">First Stop</div>
                <div class="route-value">${customers[0]?.name || 'N/A'}</div>
                <div style="font-size: 11px; color: #78716C;">${customers[0]?.address || ''}</div>
            </div>
            <div class="route-item">
                <div class="route-label">Last Stop</div>
                <div class="route-value">${customers[customers.length - 1]?.name || 'N/A'}</div>
                <div style="font-size: 11px; color: #78716C;">${customers[customers.length - 1]?.address || ''}</div>
            </div>
            <div class="route-item">
                <div class="route-label">End Point</div>
                <div class="route-value">Warehouse</div>
                <div style="font-size: 11px; color: #78716C;">Return to base</div>
            </div>
        </div>
    </div>
    
    <h3 style="margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">
        <i class="fas fa-list"></i> Delivery Stops
    </h3>
    
    <table class="stops-table">
        <thead>
            <tr>
                <th>Stop</th>
                <th>Customer</th>
                <th>Plants</th>
                <th>Pots to Collect</th>
                <th>Instructions</th>
                <th>Distance</th>
                <th>Time</th>
                <th>Pickers</th>
                <th>Driver</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
            ${stopsRows}
        </tbody>
    </table>
    
    <div class="checklist">
        <div class="checklist-item">
            <input type="checkbox"> Vehicle inspection complete
        </div>
        <div class="checklist-item">
            <input type="checkbox"> All plants loaded
        </div>
        <div class="checklist-item">
            <input type="checkbox"> Delivery documents ready
        </div>
        <div class="checklist-item">
            <input type="checkbox"> Labels checked
        </div>
        <div class="checklist-item">
            <input type="checkbox"> Route planned
        </div>
        <div class="checklist-item">
            <input type="checkbox"> Emergency contacts noted
        </div>
        <div class="checklist-item">
            <input type="checkbox"> Pot return bags ready
        </div>
    </div>
    
    <div class="emergency-contacts">
        <strong><i class="fas fa-phone-alt"></i> Emergency Contacts:</strong><br><br>
        Warehouse: 01234 567890<br>
        Supervisor: 07700 123456<br>
        Roadside Assistance: 0800 123 4567
    </div>
    
    <div class="signature-section">
        <div>
            <div class="signature-label">Driver Signature</div>
            <div class="signature-box"></div>
        </div>
        <div>
            <div class="signature-label">Warehouse Supervisor</div>
            <div class="signature-box"></div>
        </div>
    </div>
    
    <div class="footer">
        <span>PEP Delivery Management System</span>
        <span>Page 1 of 1</span>
    </div>
</body>
</html>`;
}


// ========== TROLLEY INDICATOR ==========

function updateTrolleyIndicator() {
    var ind = document.getElementById('trolleyCapacityIndicator');
    if (!ind) return;
    var primary = parseFloat(document.getElementById('passportTrolleyCount')?.value) || 0;
    var extra = 0;
    if (typeof currentPassportCustomerId !== 'undefined' && currentPassportCustomerId && typeof customers !== 'undefined') {
        var _c = customers.find(function(x){ return x.id === currentPassportCustomerId; });
        extra = (_c?.passport?.orders || []).reduce(function(sum, o) { return sum + (parseFloat(o.trolleyCount) || 0); }, 0);
    }
    var count = primary + extra;
    if (count === 0) { ind.textContent = ''; ind.style.background=''; return; }
    var _maxT = (typeof MAX_TROLLEYS_PER_RUN !== 'undefined') ? MAX_TROLLEYS_PER_RUN : 17;
    var pct = Math.round((count / _maxT) * 100);
    var bg  = count <= 10 ? '#dcfce7' : count <= 14 ? '#fef9c3' : '#fee2e2';
    var col = count <= 10 ? '#166534' : count <= 14 ? '#854d0e' : '#991b1b';
    ind.textContent = count + ' / ' + _maxT + ' trolleys (' + pct + '%)';
    ind.style.background = bg; ind.style.color = col;
}

// ========== BAY ASSIGNMENT ==========

function getBayForVan(vanId) {
    return vanBayAssignments[vanId] || null;
}

async function saveBayAssignment(vanId, bayNumber) {
    var num = parseInt(bayNumber);
    if (isNaN(num) || num < 1) {
        delete vanBayAssignments[vanId];
    } else {
        vanBayAssignments[vanId] = num;
    }
    // Persist via companyConfig
    var cfg = Object.assign({}, companyConfig || {}, { vanBayAssignments: Object.assign({}, vanBayAssignments) });
    await saveCompanyConfig(cfg);
    refreshDriverView();
}

function renderBayBoard() {
    var _bayLimits = (typeof companyConfig !== 'undefined' && companyConfig.bayTrolleyLimits)
        ? companyConfig.bayTrolleyLimits
        : ((typeof BAY_TROLLEY_LIMITS !== 'undefined') ? BAY_TROLLEY_LIMITS : {});
    var _getMax = function(bayNum) { return parseInt(_bayLimits[bayNum] || _bayLimits[String(bayNum)]) || 17; };

    // Build bayMap: bayNumber -> [ { van, slots: [{customer, trolleyIndex}] } ]
    // slots are individual trolley positions — one slot per trolley unit
    var bayMap = {}; // bayNumber -> { vans: [{van, slots}], totalSlots }
    VANS.forEach(function(van) {
        var bay = vanBayAssignments[van.id];
        if (!bay) return;
        // Collect all customers across all days for this van, in day order
        var slots = [];
        DAYS.forEach(function(day) {
            var ids = deliveryPlan[van.id]?.[day.id] || [];
            ids.forEach(function(id) {
                var c = customers.find(function(x){ return x.id === id; });
                if (!c) return;
                var t = getTotalTrolleyCount(c) || 1;
                for (var i = 0; i < t; i++) slots.push({ customer: c, trolleyIndex: i, total: t });
            });
        });
        if (!bayMap[bay]) bayMap[bay] = { vans: [], totalSlots: 0 };
        bayMap[bay].vans.push({ van: van, slots: slots });
        bayMap[bay].totalSlots += slots.length;
    });

    var unassigned = VANS.filter(function(v){ return !vanBayAssignments[v.id]; });
    var bayNums = Object.keys(bayMap).map(Number).sort(function(a,b){ return a-b; });

    var html = '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 20px;margin-bottom:20px;">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">';
    html += '<h3 style="font-size:14px;font-weight:800;color:var(--text);margin:0;display:flex;align-items:center;gap:8px;">';
    html += '<i class="fas fa-warehouse" style="color:var(--primary);"></i> Bay Layout</h3>';
    html += '<div style="display:flex;gap:8px;align-items:center;">';
    // Legend
    VANS.forEach(function(van) {
        if (!vanBayAssignments[van.id]) return;
        html += '<span style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:var(--text);">';
        html += '<span style="width:10px;height:10px;border-radius:2px;background:' + van.color + ';display:inline-block;"></span>' + van.name + '</span>';
    });
    html += '<button onclick="openBayAssignModal()" style="background:var(--primary);color:white;border:none;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px;"><i class="fas fa-edit"></i> Edit Bays</button>';
    html += '</div></div>';

    if (bayNums.length === 0) {
        html += '<p style="color:var(--text-muted);font-size:13px;margin:0;">No bay assignments yet. Click <strong>Edit Bays</strong> to assign each van to a bay.</p>';
    } else {
        bayNums.forEach(function(bayNum) {
            var MAX = _getMax(bayNum);
            var entry = bayMap[bayNum];
            var totalSlots = entry.totalSlots;
            var pct = Math.min(100, Math.round((totalSlots / MAX) * 100));
            var barColor = pct <= 60 ? '#16a34a' : pct <= 85 ? '#d97706' : '#dc2626';
            var bgColor  = pct <= 60 ? '#dcfce7' : pct <= 85 ? '#fef3c7' : '#fee2e2';
            var txtColor = pct <= 60 ? '#166534' : pct <= 85 ? '#92400e' : '#991b1b';

            html += '<div style="margin-bottom:24px;">';

            // Bay title row
            html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">';
            html += '<span style="font-size:15px;font-weight:800;color:var(--text);">Bay ' + bayNum + '</span>';
            html += '<span style="font-size:11px;font-weight:700;color:' + txtColor + ';background:' + bgColor + ';padding:2px 10px;border-radius:12px;">' + totalSlots + ' / ' + MAX + ' trolleys</span>';
            // capacity bar
            html += '<div style="flex:1;background:#e5e7eb;border-radius:20px;height:8px;overflow:hidden;max-width:200px;">';
            html += '<div style="background:' + barColor + ';height:100%;border-radius:20px;width:' + pct + '%;transition:width 0.3s;"></div></div>';
            html += '</div>';

            // Trolley diagram — one row per van assigned to this bay
            entry.vans.forEach(function(ve) {
                var van = ve.van;
                var slots = ve.slots;
                var vanSlotCount = slots.length;

                html += '<div style="margin-bottom:10px;">';
                // Van label above row
                html += '<div style="font-size:11px;font-weight:700;color:' + van.color + ';margin-bottom:6px;display:flex;align-items:center;gap:6px;">';
                html += '<i class="fas fa-truck" style="font-size:10px;"></i> ' + van.name;
                html += ' <span style="font-weight:500;color:var(--text-muted);">(' + vanSlotCount + ' trolleys)</span></div>';

                // Trolley slots row
                html += '<div style="display:flex;gap:3px;flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px;">';

                // Empty slots to fill up to MAX
                var emptySlots = MAX - vanSlotCount;

                slots.forEach(function(slot, idx) {
                    // Slightly darken border when same customer spans multiple trolleys
                    var isFirst = slot.trolleyIndex === 0;
                    var isLast  = slot.trolleyIndex === slot.total - 1;
                    var borderLeft  = isFirst  ? '2.5px solid ' + van.color : '1px solid ' + van.color + '66';
                    var borderRight = isLast   ? '2.5px solid ' + van.color : '1px solid ' + van.color + '66';

                    // Truncate customer name for display
                    var name = slot.customer.name || '';
                    var displayName = name.length > 22 ? name.substring(0, 20) + '…' : name;

                    html += '<div title="' + name + (slot.total > 1 ? ' (' + (slot.trolleyIndex+1) + '/' + slot.total + ')' : '') + '" ';
                    html += 'style="flex-shrink:0;width:52px;height:130px;border-top:2.5px solid ' + van.color + ';border-bottom:2.5px solid ' + van.color + ';';
                    html += 'border-left:' + borderLeft + ';border-right:' + borderRight + ';';
                    html += 'background:' + van.color + '12;border-radius:3px;';
                    html += 'display:flex;align-items:center;justify-content:center;position:relative;cursor:default;">';

                    // Rotated customer name
                    html += '<span style="display:block;white-space:nowrap;font-size:11px;font-weight:600;color:' + van.color + ';';
                    html += 'transform:rotate(-90deg);transform-origin:center center;width:120px;text-align:center;overflow:hidden;text-overflow:ellipsis;">';
                    html += displayName + '</span>';

                    // Label indicators — pill badges top-centre
                    var passport = slot.customer.passport;
                    if (passport && (passport.barcodedLabels || passport.prePricedLabels)) {
                        html += '<span style="position:absolute;top:4px;left:0;right:0;display:flex;justify-content:center;gap:3px;">';
                        if (passport.barcodedLabels)  html += '<span title="Barcoded Labels Required" style="font-size:9px;font-weight:700;background:#1e3a5f;color:#b5d4f4;border-radius:20px;padding:2px 6px;letter-spacing:0.3px;">BC</span>';
                        if (passport.prePricedLabels) html += '<span title="Pre-Priced Labels Required" style="font-size:9px;font-weight:700;background:#166534;color:#bbf7d0;border-radius:20px;padding:2px 6px;">£</span>';
                        html += '</span>';
                    }

                    // Trolley number in bottom corner if multi-trolley customer
                    if (slot.total > 1) {
                        html += '<span style="position:absolute;bottom:3px;right:4px;font-size:8px;font-weight:800;color:' + van.color + ';opacity:0.7;">' + (slot.trolleyIndex+1) + '</span>';
                    }

                    html += '</div>';
                });

                // Empty/spare slots
                for (var e = 0; e < emptySlots; e++) {
                    html += '<div style="flex-shrink:0;width:52px;height:130px;border:1.5px dashed #d1d5db;border-radius:3px;background:#fafafa;"></div>';
                }

                html += '</div>'; // slots row
                html += '</div>'; // van block
            });

            html += '</div>'; // bay block
        });

        if (unassigned.length > 0) {
            html += '<p style="font-size:12px;color:var(--text-muted);margin:4px 0 0 0;">';
            html += '<i class="fas fa-info-circle"></i> Not assigned to a bay: ';
            html += unassigned.map(function(v){ return v.name; }).join(', ') + '</p>';
        }
    }

    html += '</div>';
    return html;
}

function renderOrderBayBoard() {
    var _bayLimits = (typeof companyConfig !== 'undefined' && companyConfig.bayTrolleyLimits)
        ? companyConfig.bayTrolleyLimits
        : ((typeof BAY_TROLLEY_LIMITS !== 'undefined') ? BAY_TROLLEY_LIMITS : {});
    var _getMax = function(bayNum) { return parseInt(_bayLimits[bayNum] || _bayLimits[String(bayNum)]) || 17; };

    // Group customers with a bay number, handling overflow splits
    // bayMap[bayNum] = [{customer, count, isOverflow}]
    var bayMap = {};
    customers.forEach(function(c) {
        if (!c.bayNumber) return;
        var totalT = getTotalTrolleyCount(c) || 1;
        var oc = (c.bayOverflow && c.bayOverflow.count) ? parseInt(c.bayOverflow.count) : 0;
        oc = Math.min(oc, totalT - 1); // must keep at least 1 in primary
        var primaryT = totalT - oc;
        if (!bayMap[c.bayNumber]) bayMap[c.bayNumber] = [];
        bayMap[c.bayNumber].push({ customer: c, count: primaryT, isOverflow: false });
        if (oc > 0 && c.bayOverflow && c.bayOverflow.bay) {
            var ob = c.bayOverflow.bay;
            if (!bayMap[ob]) bayMap[ob] = [];
            bayMap[ob].push({ customer: c, count: oc, isOverflow: true });
        }
    });
    var bayNums = Object.keys(bayMap).map(Number).sort(function(a,b){return a-b;});

    var bayCount = bayNums.length;
    var html = '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 20px;margin-bottom:20px;">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;" onclick="toggleOrderBayBoard(this)">';
    html += '<h3 style="font-size:14px;font-weight:800;color:var(--text);margin:0;display:flex;align-items:center;gap:8px;">';
    html += '<i class="fas fa-warehouse" style="color:var(--primary);"></i> Bay Layout';
    html += '<span style="font-size:11px;font-weight:500;color:var(--text-muted);">(order-based)</span>';
    if (bayCount > 0) html += '<span style="font-size:11px;font-weight:700;background:var(--primary);color:white;padding:1px 8px;border-radius:20px;">' + bayCount + ' bay' + (bayCount > 1 ? 's' : '') + '</span>';
    html += '</h3>';
    html += '<i class="fas fa-chevron-down" style="color:var(--text-muted);font-size:12px;transition:transform 0.2s;"></i>';
    html += '</div>';
    html += '<div class="bay-board-body" style="display:none;margin-top:16px;">';

    if (bayNums.length === 0) {
        html += '<p style="color:var(--text-muted);font-size:13px;margin:0;">No bay assignments yet. Pickers assign bays when marking orders as <strong>Ready for Delivery</strong> or <strong>Delivering</strong>.</p>';
    } else {
        bayNums.forEach(function(bayNum) {
            var MAX = _getMax(bayNum);
            var totalSlots = bayMap[bayNum].reduce(function(sum, e){ return sum + e.count; }, 0);
            var pct = Math.min(100, Math.round((totalSlots / MAX) * 100));
            var barColor = pct <= 60 ? '#16a34a' : pct <= 85 ? '#d97706' : '#dc2626';
            var bgColor  = pct <= 60 ? '#dcfce7' : pct <= 85 ? '#fef3c7' : '#fee2e2';
            var txtColor = pct <= 60 ? '#166534' : pct <= 85 ? '#92400e' : '#991b1b';

            html += '<div style="margin-bottom:24px;">';
            html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">';
            html += '<span style="font-size:15px;font-weight:800;color:var(--text);">Bay ' + bayNum + '</span>';
            html += '<span style="font-size:11px;font-weight:700;color:' + txtColor + ';background:' + bgColor + ';padding:2px 10px;border-radius:12px;">' + totalSlots + ' / ' + MAX + ' trolleys</span>';
            html += '<div style="flex:1;background:#e5e7eb;border-radius:20px;height:8px;overflow:hidden;max-width:200px;">';
            html += '<div style="background:' + barColor + ';height:100%;border-radius:20px;width:' + pct + '%;transition:width 0.3s;"></div></div>';
            html += '</div>';

            html += '<div style="display:flex;gap:3px;flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px;">';
            var entries = bayMap[bayNum];
            entries.forEach(function(entry) {
                var c = entry.customer;
                var t = entry.count;
                var isOverflow = entry.isOverflow;
                var van = c.assignedVan ? VANS.find(function(v){return v.id===c.assignedVan;}) : null;
                var col = van ? van.color : '#6b7280';
                var name = c.name || '';
                var displayName = name.length > 22 ? name.substring(0,20) + '…' : name;
                var borderStyle = isOverflow ? 'dashed' : 'solid';
                var bg = col + (isOverflow ? '08' : '12');
                for (var i = 0; i < t; i++) {
                    var isFirst = i === 0;
                    var isLast  = i === t - 1;
                    var bL = isFirst ? '2.5px ' + borderStyle + ' ' + col : '1px ' + borderStyle + ' ' + col + '66';
                    var bR = isLast  ? '2.5px ' + borderStyle + ' ' + col : '1px ' + borderStyle + ' ' + col + '66';
                    var tooltip = name + (isOverflow ? ' (overflow)' : '') + (t > 1 ? ' (' + (i+1) + '/' + t + ')' : '');
                    html += '<div title="' + tooltip + '" ';
                    html += 'style="flex-shrink:0;width:52px;height:130px;';
                    html += 'border-top:2.5px ' + borderStyle + ' ' + col + ';border-bottom:2.5px ' + borderStyle + ' ' + col + ';';
                    html += 'border-left:' + bL + ';border-right:' + bR + ';';
                    html += 'background:' + bg + ';border-radius:3px;opacity:' + (isOverflow ? '0.65' : '1') + ';';
                    html += 'display:flex;align-items:center;justify-content:center;position:relative;cursor:default;">';
                    html += '<span style="display:block;white-space:nowrap;font-size:11px;font-weight:600;color:' + col + ';';
                    html += 'transform:rotate(-90deg);transform-origin:center center;width:120px;text-align:center;overflow:hidden;text-overflow:ellipsis;">';
                    html += displayName + (isOverflow ? ' ↗' : '') + '</span>';
                    if (t > 1) {
                        html += '<span style="position:absolute;bottom:3px;right:4px;font-size:8px;font-weight:800;color:' + col + ';opacity:0.7;">' + (i+1) + '</span>';
                    }
                    // Label indicators — top of trolley slot
                    var cp = c.passport;
                    var topBadges = [];
                    if (cp && cp.barcodedLabels)  topBadges.push('<span title="Barcoded Labels Required" style="font-size:9px;font-weight:700;background:#1e3a5f;color:#b5d4f4;border-radius:20px;padding:2px 6px;letter-spacing:0.3px;">BC</span>');
                    if (cp && cp.prePricedLabels) topBadges.push('<span title="Pre-Priced Labels Required" style="font-size:9px;font-weight:700;background:#166534;color:#bbf7d0;border-radius:20px;padding:2px 6px;">£</span>');
                    if (isOverflow && i === 0) topBadges.unshift('<span style="font-size:7px;font-weight:800;color:' + col + ';opacity:0.7;letter-spacing:0.5px;">OVF</span>');
                    if (topBadges.length) {
                        html += '<span style="position:absolute;top:3px;left:0;right:0;display:flex;justify-content:center;gap:2px;flex-wrap:wrap;">' + topBadges.join('') + '</span>';
                    }
                    html += '</div>';
                }
            });

            var emptySlots = Math.max(0, MAX - totalSlots);
            for (var e = 0; e < emptySlots; e++) {
                html += '<div style="flex-shrink:0;width:52px;height:130px;border:1.5px dashed #d1d5db;border-radius:3px;background:#fafafa;"></div>';
            }
            html += '</div>';
            html += '</div>';
        });
    }

    html += '</div>'; // bay-board-body
    html += '</div>'; // outer card
    return html;
}

var _bayBoardOpen = false;

function toggleOrderBayBoard(header) {
    var body = header.parentElement.querySelector('.bay-board-body');
    var icon = header.querySelector('.fa-chevron-down,.fa-chevron-up');
    if (!body) return;
    var collapsed = body.style.display === 'none';
    body.style.display = collapsed ? 'block' : 'none';
    _bayBoardOpen = collapsed;
    if (icon) { icon.classList.toggle('fa-chevron-down', !collapsed); icon.classList.toggle('fa-chevron-up', collapsed); }
}

function openBayAssignModal() {
    var rows = VANS.map(function(van) {
        var bay = vanBayAssignments[van.id] || '';
        return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f3f4f6;">' +
            '<span style="width:12px;height:12px;border-radius:50%;background:' + van.color + ';flex-shrink:0;display:inline-block;"></span>' +
            '<span style="flex:1;font-size:14px;font-weight:700;color:var(--text);">' + van.name + '</span>' +
            '<input type="number" min="1" value="' + bay + '" placeholder="Bay #" ' +
                'style="width:80px;padding:6px 10px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-weight:700;text-align:center;" ' +
                'onchange="vanBayAssignments[' + van.id + '] = this.value ? parseInt(this.value) : undefined">' +
            '</div>';
    }).join('');

    var modal = document.createElement('div');
    modal.id = 'bayAssignModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = '<div style="background:white;border-radius:14px;padding:24px;width:360px;max-width:95vw;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">' +
        '<h3 style="margin:0;font-size:16px;font-weight:800;"><i class="fas fa-warehouse" style="color:var(--primary);margin-right:8px;"></i>Assign Bays to Vans</h3>' +
        '<button onclick="document.getElementById(\'bayAssignModal\').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;">&times;</button>' +
        '</div>' +
        '<p style="font-size:12px;color:#6b7280;margin:0 0 12px 0;">Assign a bay number to each van. Capacity limits are set per bay in Settings.</p>' +
        rows +
        '<div style="display:flex;gap:10px;margin-top:16px;">' +
        '<button onclick="document.getElementById(\'bayAssignModal\').remove()" style="flex:1;padding:10px;border:1px solid var(--border);border-radius:8px;background:white;cursor:pointer;font-weight:600;">Cancel</button>' +
        '<button onclick="_saveBayAssignmentsFromModal()" style="flex:1;padding:10px;background:var(--primary);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Save</button>' +
        '</div></div>';
    document.body.appendChild(modal);
}

function _openRunDiagram(vanId, dayId, runNumber) {
    var _bayLimits = (typeof companyConfig !== 'undefined' && companyConfig.bayTrolleyLimits)
        ? companyConfig.bayTrolleyLimits
        : ((typeof BAY_TROLLEY_LIMITS !== 'undefined') ? BAY_TROLLEY_LIMITS : {});
    var _getMaxForBay = function(b) { return parseInt(_bayLimits[b] || _bayLimits[String(b)]) || 17; };
    var _runSplitMax = (typeof MAX_TROLLEYS_PER_RUN !== 'undefined') ? MAX_TROLLEYS_PER_RUN : 17;

    var van = VANS.find(function(v){ return v.id === vanId; });
    var day = DAYS.find(function(d){ return d.id === dayId; });
    if (!van || !day) return;

    // Recompute runs to get this specific run's customers
    var runs = (typeof computeDeliveryRuns === 'function')
        ? computeDeliveryRuns(vanId, dayId)
        : (function() {
            var ids = deliveryPlan[vanId]?.[dayId] || [];
            var stops = ids.map(function(id){ return customers.find(function(c){ return c.id === id; }); }).filter(Boolean);
            var result = [], cur = [], curT = 0;
            stops.forEach(function(c) {
                var t = getTotalTrolleyCount(c);
                if (curT + t > _runSplitMax && cur.length) { result.push({ run: result.length+1, customers: cur, trolleys: curT }); cur=[]; curT=0; }
                cur.push(c); curT += t;
            });
            if (cur.length) result.push({ run: result.length+1, customers: cur, trolleys: curT });
            return result;
        })();

    var run = runs.find(function(r){ return r.run === runNumber; });
    if (!run) return;

    var bay = vanBayAssignments[vanId];
    // MAX is determined after runBayList is built (below); placeholder for van-based mode
    var MAX = bay ? _getMaxForBay(bay) : _runSplitMax;

    // Build trolley slots — skip orders that have left the bay (delivering/delivered/collected/cancelled)
    var _bayReleasedStatuses = ['delivering', 'delivered', 'collected', 'cancelled'];
    var slots = [];
    run.customers.forEach(function(c) {
        if (_bayReleasedStatuses.indexOf(c.status) !== -1) return;
        var t = getTotalTrolleyCount(c) || 1;
        var oc = (c.bayOverflow && c.bayOverflow.count) ? Math.min(parseInt(c.bayOverflow.count), t - 1) : 0;
        var primaryCount = t - oc;
        for (var i = 0; i < primaryCount; i++) slots.push({ customer: c, trolleyIndex: i, total: t, slotBay: c.bayNumber || null, isOverflow: false });
        for (var j = 0; j < oc; j++) slots.push({ customer: c, trolleyIndex: primaryCount + j, total: t, slotBay: (c.bayOverflow && c.bayOverflow.bay) || null, isOverflow: true });
    });
    // In order-based mode, assign a distinct colour per bay number for this run
    var orderMode = BAY_FEATURE_ENABLED && BAY_ASSIGNMENT_MODE === 'order';
    var bayPalette = ['#1d4ed8','#dc2626','#15803d','#7c3aed','#b45309','#0e7490','#be185d'];
    var runBayList = [];
    if (orderMode) {
        // Collect unique bays from slot-level bay (respects overflow splitting)
        slots.forEach(function(s) { var b = s.slotBay; if (b && runBayList.indexOf(b) === -1) runBayList.push(b); });
        runBayList.sort(function(a,b){ return parseInt(a)-parseInt(b); });
        // MAX = primary bay limit (the first/main bay); overflow slots wrap to next row visually
        var primaryBayInRun = slots.length > 0 ? slots[0].slotBay : null;
        if (primaryBayInRun) {
            MAX = _getMaxForBay(primaryBayInRun);
        }
    }
    function bayColor(bayNum) { var i = runBayList.indexOf(bayNum); return bayPalette[i % bayPalette.length]; }

    var activeTrolleys = slots.length;
    var pct = Math.min(100, Math.round((activeTrolleys / MAX) * 100));
    var barColor = pct <= 60 ? '#16a34a' : pct <= 85 ? '#d97706' : '#dc2626';
    var bgColor  = pct <= 60 ? '#dcfce7' : pct <= 85 ? '#fef3c7' : '#fee2e2';
    var txtColor = pct <= 60 ? '#166534' : pct <= 85 ? '#92400e' : '#991b1b';

    var emptyCount = Math.max(0, MAX - slots.length);

    // Group slots by bay row so overflow bays render as a separate labelled row
    // Each group: { bayNum, color, slots[], maxSlots }
    var bayRows = [];
    if (orderMode && runBayList.length > 0) {
        runBayList.forEach(function(b) {
            var bSlots = slots.filter(function(s){ return s.slotBay === b; });
            if (bSlots.length === 0) return;
            var maxForBay = _getMaxForBay(b);
            bayRows.push({ bayNum: b, color: bayColor(b), slots: bSlots, maxSlots: maxForBay });
        });
        // slots with no bay assigned (shouldn't normally happen but guard)
        var unassigned = slots.filter(function(s){ return !s.slotBay; });
        if (unassigned.length) bayRows.push({ bayNum: null, color: van.color, slots: unassigned, maxSlots: MAX });
    } else {
        bayRows.push({ bayNum: bay || null, color: van.color, slots: slots, maxSlots: MAX });
    }

    // Slot dimensions — tall narrow portrait rectangles
    var SLOT_W = 52;
    var SLOT_H = 340;
    var NAME_W  = SLOT_H - 80; // rotated span width = usable slot height

    function _buildSlotHtml(slot, slotNum, col, rowMax) {
        var name = slot.customer.name || '';
        var isFirst = slot.trolleyIndex === 0;
        var isLast  = slot.trolleyIndex === slot.total - 1;
        var bL = isFirst ? '2.5px solid ' + col : '1px solid ' + col + '44';
        var bR = isLast  ? '2.5px solid ' + col : '1px solid ' + col + '44';
        var numColor = slotNum > rowMax ? '#dc2626' : '#1c1917';

        // Outer slot: position:relative, NO overflow:hidden so rotated span isn't clipped
        var h = '<div title="' + name + (slot.total > 1 ? ' (' + (slot.trolleyIndex+1) + '/' + slot.total + ')' : '') + '" ';
        h += 'style="flex-shrink:0;width:' + SLOT_W + 'px;height:' + SLOT_H + 'px;position:relative;';
        h += 'border-top:2.5px solid ' + col + ';border-bottom:2.5px solid ' + col + ';';
        h += 'border-left:' + bL + ';border-right:' + bR + ';';
        h += 'background:' + col + '10;border-radius:3px;">';

        // Label badges — absolute top centre
        var sp = slot.customer.passport;
        h += '<span style="position:absolute;top:6px;left:0;right:0;display:flex;justify-content:center;gap:2px;">';
        if (sp && sp.barcodedLabels)  h += '<span title="Barcoded Labels" style="font-size:9px;font-weight:700;background:#1e3a5f;color:#b5d4f4;border-radius:20px;padding:1px 5px;">BC</span>';
        if (sp && sp.prePricedLabels) h += '<span title="Pre-Priced Labels" style="font-size:9px;font-weight:700;background:#166534;color:#bbf7d0;border-radius:20px;padding:1px 5px;">£</span>';
        h += '</span>';

        // Rotated name — absolutely centred, sized to slot height so it never overflows
        h += '<span style="position:absolute;top:50%;left:50%;';
        h += 'transform:translate(-50%,-50%) rotate(-90deg);';
        h += 'width:' + NAME_W + 'px;';
        h += 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        h += 'font-size:15px;font-weight:700;color:' + col + ';text-align:center;line-height:1.2;">' + name + '</span>';

        // Slot number — absolute bottom centre
        h += '<span style="position:absolute;bottom:6px;left:0;right:0;text-align:center;';
        h += 'font-size:36px;font-weight:800;color:' + numColor + ';line-height:1;">' + slotNum + '</span>';

        h += '</div>';
        return h;
    }

    // Build one flex row per bay
    var slotsHtml = '';
    bayRows.forEach(function(row) {
        var rowEmpty = Math.max(0, row.maxSlots - row.slots.length);

        // Bay label header (always shown — helps orientation even for single-bay)
        slotsHtml += '<div style="flex-shrink:0;">';
        slotsHtml += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">';
        slotsHtml += '<span style="font-size:12px;font-weight:800;color:' + row.color + ';padding:2px 12px;border:2px solid ' + row.color + ';border-radius:20px;background:' + row.color + '12;">';
        slotsHtml += (row.bayNum ? 'Bay ' + row.bayNum : 'Unassigned') + '</span>';
        slotsHtml += '<span style="font-size:12px;color:#6b7280;">' + row.slots.length + ' / ' + row.maxSlots + ' trolleys</span>';
        slotsHtml += '</div>';

        // Slots in a horizontal flex row — fixed width, horizontally scrollable
        slotsHtml += '<div style="display:flex;gap:4px;overflow-x:auto;padding-bottom:4px;">';
        row.slots.forEach(function(slot, i) {
            slotsHtml += _buildSlotHtml(slot, i + 1, row.color, row.maxSlots);
        });
        for (var e = 0; e < rowEmpty; e++) {
            var emptyNum = row.slots.length + e + 1;
            var emptyNumColor = emptyNum === row.maxSlots ? '#dc2626' : '#d1d5db';
            slotsHtml += '<div style="flex-shrink:0;width:' + SLOT_W + 'px;height:' + SLOT_H + 'px;position:relative;';
            slotsHtml += 'border:1.5px dashed #d1d5db;border-radius:3px;background:#f9fafb;">';
            slotsHtml += '<span style="position:absolute;bottom:6px;left:0;right:0;text-align:center;font-size:36px;font-weight:800;color:' + emptyNumColor + ';line-height:1;">' + emptyNum + '</span>';
            slotsHtml += '</div>';
        }
        slotsHtml += '</div>';
        slotsHtml += '</div>';
    });

    var title = van.name + ' — ' + day.name + (runs.length > 1 ? ' · Run ' + runNumber : '');
    var bayLabel;
    if (orderMode && runBayList.length > 0) {
        bayLabel = runBayList.map(function(b){ return '<span style="color:' + bayColor(b) + ';font-weight:800;">Bay ' + b + '</span>'; }).join(' &amp; ');
    } else if (orderMode) {
        bayLabel = 'No bay assigned';
    } else {
        bayLabel = bay ? 'Bay ' + bay : 'No bay assigned';
    }

    var modal = document.createElement('div');
    modal.id = 'runDiagramModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:stretch;justify-content:stretch;padding:0;';
    modal.onclick = function(e){ if(e.target===modal) modal.remove(); };
    modal.innerHTML =
        '<div style="background:white;padding:24px 28px;width:100%;height:100%;display:flex;flex-direction:column;">' +
        // Header
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-shrink:0;">' +
        '<div>' +
        '<h3 style="margin:0 0 5px 0;font-size:20px;font-weight:800;color:#1c1917;display:flex;align-items:center;gap:10px;">' +
        '<span style="width:16px;height:16px;border-radius:4px;background:' + van.color + ';display:inline-block;flex-shrink:0;"></span>' + title + '</h3>' +
        '<div style="display:flex;align-items:center;gap:12px;">' +
        '<span style="font-size:13px;font-weight:700;color:#6b7280;"><i class="fas fa-warehouse" style="margin-right:5px;"></i>' + bayLabel + '</span>' +
        '<span style="font-size:13px;font-weight:700;color:' + txtColor + ';background:' + bgColor + ';padding:3px 12px;border-radius:12px;">' + activeTrolleys + ' / ' + MAX + ' trolleys</span>' +
        '</div></div>' +
        '<button onclick="document.getElementById(\'runDiagramModal\').remove()" style="background:#f3f4f6;border:none;width:36px;height:36px;border-radius:50%;cursor:pointer;color:#6b7280;font-size:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">&times;</button>' +
        '</div>' +
        // Capacity bar
        '<div style="background:#f3f4f6;border-radius:20px;height:8px;overflow:hidden;margin-bottom:' + (orderMode && runBayList.length > 1 ? '8px' : '16px') + ';flex-shrink:0;">' +
        '<div style="background:' + barColor + ';height:100%;border-radius:20px;width:' + pct + '%;"></div></div>' +
        // Bay colour legend — only in order mode with multiple bays
        (orderMode && runBayList.length > 1
            ? '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;flex-shrink:0;">' +
              runBayList.map(function(b){
                  return '<span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:' + bayColor(b) + ';border:2px solid ' + bayColor(b) + ';background:' + bayColor(b) + '12;padding:3px 12px;border-radius:20px;">' +
                         '<i class="fas fa-warehouse" style="font-size:11px;"></i> Bay ' + b + '</span>';
              }).join('') +
              '</div>'
            : '') +
        // Trolley slots — one row per bay, fixed-width slots, scrollable
        '<div style="flex:1;display:flex;flex-direction:column;gap:12px;min-height:0;overflow-y:auto;">' +
        slotsHtml +
        '</div>' +
        // Footer
        '<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:12px;color:#9ca3af;flex-shrink:0;">' +
        '<span>' + activeTrolleys + ' trolley' + (activeTrolleys !== 1 ? 's' : '') + ' · ' + slots.filter(function(s,i,a){ return a.findIndex(function(x){return x.customer===s.customer;})===i; }).length + ' customer' + (activeTrolleys !== 1 ? 's' : '') + ' in bay</span>' +
        '<span>' + bayRows.reduce(function(sum, r){ return sum + Math.max(0, r.maxSlots - r.slots.length); }, 0) + ' spare slot' + (emptyCount !== 1 ? 's' : '') + '</span>' +
        '</div>' +
        '</div>';

    document.getElementById('runDiagramModal')?.remove();
    modal.dataset.vanId     = vanId;
    modal.dataset.dayId     = dayId;
    modal.dataset.runNumber = runNumber;
    document.body.appendChild(modal);
}

async function _saveBayAssignmentsFromModal() {
    document.getElementById('bayAssignModal')?.remove();
    // vanBayAssignments already mutated inline by the input onchange handlers
    // Clean up undefined values
    VANS.forEach(function(van) {
        if (!vanBayAssignments[van.id]) delete vanBayAssignments[van.id];
    });
    var cfg = Object.assign({}, companyConfig || {}, { vanBayAssignments: Object.assign({}, vanBayAssignments) });
    await saveCompanyConfig(cfg);
    showNotification('Bay assignments saved ✓', 'success');
    refreshDriverView();
}

// ========== DRIVER VIEW ==========
// Tracks the selected day filter: null = all week, dayId = specific day
var _driverViewDayFilter = null;

function setDriverViewDay(dayId) {
    _driverViewDayFilter = dayId;
    refreshDriverView();
}

// ── Print Bay Sheet ──────────────────────────────────────────────────────────

function openPrintBaySheet() {
    // Build day options for the picker
    var activeDays = DAYS.filter(function(d){
        return VANS.some(function(v){ return (deliveryPlan[v.id]?.[d.id]?.length||0) > 0; });
    });

    var modal = document.createElement('div');
    modal.id = 'printBaySheetModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;';
    modal.onclick = function(e){ if(e.target===modal) modal.remove(); };

    var dayOptions = '<option value="all">All days</option>' +
        activeDays.map(function(d){ return '<option value="'+d.id+'">'+d.name+'</option>'; }).join('');

    // Gather all assignable customers for the checklist
    var allAssigned = [];
    DAYS.forEach(function(day){
        VANS.forEach(function(van){
            (deliveryPlan[van.id]?.[day.id] || []).forEach(function(id){
                var c = customers.find(function(x){ return x.id===id; });
                if (c && allAssigned.indexOf(c) === -1) allAssigned.push(c);
            });
        });
    });

    var customerRows = allAssigned.map(function(c){
        var t = getTotalTrolleyCount(c) || 1;
        var bay = c.bayNumber || (c.assignedVan ? (vanBayAssignments[c.assignedVan] || '—') : '—');
        return '<label style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f3f4f6;cursor:pointer;font-size:13px;">' +
            '<input type="checkbox" value="'+c.id+'" checked style="width:15px;height:15px;flex-shrink:0;">' +
            '<span style="flex:1;font-weight:600;color:#1c1917;">'+c.name+'</span>' +
            '<span style="font-size:11px;color:#6b7280;">Bay '+bay+' · '+t+' 🛒</span>' +
            '</label>';
    }).join('');

    modal.innerHTML =
        '<div style="background:white;border-radius:16px;padding:28px;width:500px;max-height:80vh;display:flex;flex-direction:column;gap:16px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;">' +
        '<h3 style="margin:0;font-size:17px;font-weight:800;color:#1c1917;"><i class="fas fa-print" style="color:#6366f1;margin-right:8px;"></i>Print Bay Sheet</h3>' +
        '<button onclick="document.getElementById(\'printBaySheetModal\').remove()" style="background:#f3f4f6;border:none;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:16px;color:#6b7280;">&times;</button>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;">' +
        '<label style="font-size:12px;font-weight:700;color:#374151;">Day</label>' +
        '<select id="pbs-day" style="padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;font-weight:600;">'+dayOptions+'</select>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;min-height:0;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;">' +
        '<label style="font-size:12px;font-weight:700;color:#374151;">Orders to include</label>' +
        '<div style="display:flex;gap:8px;">' +
        '<button onclick="document.querySelectorAll(\'#pbs-orders input\').forEach(function(i){i.checked=true;})" style="font-size:11px;background:none;border:none;color:#6366f1;cursor:pointer;font-weight:700;">Select all</button>' +
        '<button onclick="document.querySelectorAll(\'#pbs-orders input\').forEach(function(i){i.checked=false;})" style="font-size:11px;background:none;border:none;color:#6b7280;cursor:pointer;font-weight:700;">Clear</button>' +
        '</div></div>' +
        '<div id="pbs-orders" style="overflow-y:auto;max-height:280px;border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px;">' +
        (customerRows || '<p style="color:#9ca3af;font-size:13px;margin:0;">No assigned orders found.</p>') +
        '</div>' +
        '</div>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;padding-top:4px;border-top:1px solid #f3f4f6;">' +
        '<button onclick="document.getElementById(\'printBaySheetModal\').remove()" style="padding:9px 20px;border:1px solid #d1d5db;border-radius:8px;background:white;color:#374151;font-size:13px;font-weight:700;cursor:pointer;">Cancel</button>' +
        '<button onclick="printBaySheet()" style="padding:9px 20px;border:none;border-radius:8px;background:#6366f1;color:white;font-size:13px;font-weight:700;cursor:pointer;"><i class="fas fa-print" style="margin-right:6px;"></i>Print</button>' +
        '</div>' +
        '</div>';

    document.body.appendChild(modal);
}

function printBaySheet() {
    var modal = document.getElementById('printBaySheetModal');
    var selectedDayId = document.getElementById('pbs-day')?.value;
    var checkedIds = Array.from(document.querySelectorAll('#pbs-orders input:checked')).map(function(i){ return parseFloat(i.value); });
    if (modal) modal.remove();

    var MAX = (typeof MAX_TROLLEYS_PER_RUN !== 'undefined') ? MAX_TROLLEYS_PER_RUN : 17;
    var _bayLimits = (typeof companyConfig !== 'undefined' && companyConfig.bayTrolleyLimits) ? companyConfig.bayTrolleyLimits : {};
    var _getMax = function(b){ return parseInt(_bayLimits[b] || _bayLimits[String(b)]) || MAX; };
    var orderMode = BAY_FEATURE_ENABLED && BAY_ASSIGNMENT_MODE === 'order';

    var filterDays = selectedDayId === 'all'
        ? DAYS.filter(function(d){ return VANS.some(function(v){ return (deliveryPlan[v.id]?.[d.id]?.length||0) > 0; }); })
        : DAYS.filter(function(d){ return d.id === parseInt(selectedDayId); });

    var now = new Date();
    var printedAt = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) + ' ' + formatTime(now);

    // ── Collect bay data ─────────────────────────────────────────────────────
    // bayMap[bayNum] = [ { customer, count, van, day, isOverflow } ]
    var bayMap = {};
    var tableRows = []; // for summary table

    filterDays.forEach(function(day){
        VANS.forEach(function(van){
            var ids = deliveryPlan[van.id]?.[day.id] || [];
            ids.forEach(function(id){
                var c = customers.find(function(x){ return x.id===id; });
                if (!c || checkedIds.indexOf(c.id) === -1) return;

                var t = getTotalTrolleyCount(c) || 1;
                var oc = (c.bayOverflow && c.bayOverflow.count) ? Math.min(parseInt(c.bayOverflow.count), t-1) : 0;
                var primaryCount = t - oc;

                // determine bay
                var bay = orderMode ? (c.bayNumber || null) : (vanBayAssignments[van.id] || null);
                var overflowBay = (orderMode && c.bayOverflow && c.bayOverflow.bay) ? c.bayOverflow.bay : null;

                if (bay) {
                    if (!bayMap[bay]) bayMap[bay] = [];
                    bayMap[bay].push({ customer: c, count: primaryCount, van: van, day: day, isOverflow: false });
                }
                if (overflowBay && oc > 0) {
                    if (!bayMap[overflowBay]) bayMap[overflowBay] = [];
                    bayMap[overflowBay].push({ customer: c, count: oc, van: van, day: day, isOverflow: true });
                }

                // table row
                var p = c.passport || {};
                tableRows.push({
                    name: c.name,
                    address: c.address || '',
                    day: day.name,
                    van: van.name,
                    vanColor: van.color,
                    bay: bay || '—',
                    trolleys: t,
                    barcoded: !!p.barcodedLabels,
                    prePriced: !!p.prePricedLabels,
                    orderNumber: p.orderNumber || '',
                    status: c.status || ''
                });
            });
        });
    });

    var bayNums = Object.keys(bayMap).map(Number).sort(function(a,b){return a-b;});

    // ── Bay palette for order mode ───────────────────────────────────────────
    var bayPalette = ['#1d4ed8','#dc2626','#15803d','#7c3aed','#b45309','#0e7490','#be185d'];
    function bayColor(n){ return bayPalette[(bayNums.indexOf(Number(n))) % bayPalette.length]; }

    // ── Build trolley diagram HTML per bay ───────────────────────────────────
    // Circled number characters ①②③… (Unicode supports up to ⑳ = 20)
    var circled = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳'];
    function circledNum(n) { return circled[n-1] || '('+n+')'; }

    function buildBayDiagram() {
        if (bayNums.length === 0) return '<p style="color:#9ca3af;font-size:13px;">No bay assignments for the selected orders/day.</p>';
        var h = '';
        bayNums.forEach(function(bayNum){
            var entries = bayMap[bayNum];
            var MAX_BAY = _getMax(bayNum);
            var totalSlots = entries.reduce(function(s,e){ return s+e.count; }, 0);
            var pct = Math.min(100, Math.round((totalSlots / MAX_BAY) * 100));
            var barCol = pct<=60?'#16a34a':pct<=85?'#d97706':'#dc2626';
            var col = orderMode ? bayColor(bayNum) : (entries[0] ? entries[0].van.color : '#6b7280');

            // Build per-bay customer reference map: customerId → { refNum, customer, totalCount, slotCol, p }
            var refMap = {};   // customerId → ref number
            var refList = [];  // ordered list of unique customers in this bay
            var refCounter = 0;
            entries.forEach(function(entry){
                var cid = entry.customer.id;
                if (!refMap[cid]) {
                    refCounter++;
                    refMap[cid] = refCounter;
                    refList.push({
                        ref: refCounter,
                        customer: entry.customer,
                        totalTrolleys: getTotalTrolleyCount(entry.customer) || 1,
                        slotCol: orderMode ? col : entry.van.color,
                        p: entry.customer.passport || {}
                    });
                }
            });

            h += '<div style="margin-bottom:24px;break-inside:avoid;">';

            // Bay heading
            h += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">';
            h += '<span style="font-size:15px;font-weight:800;color:#1c1917;">Bay '+bayNum+'</span>';
            h += '<span style="font-size:11px;font-weight:700;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;padding:2px 10px;border-radius:20px;">'+totalSlots+' / '+MAX_BAY+' trolleys</span>';
            h += '<div style="flex:1;background:#e5e7eb;border-radius:20px;height:6px;max-width:180px;overflow:hidden;">';
            h += '<div style="background:'+barCol+';height:100%;width:'+pct+'%;border-radius:20px;"></div></div>';
            h += '</div>';

            // Trolley slots row
            h += '<div style="display:flex;gap:3px;flex-wrap:nowrap;overflow:hidden;margin-bottom:8px;">';
            var slotIdx = 0;
            entries.forEach(function(entry){
                var c = entry.customer;
                var t = entry.count;
                var slotCol = orderMode ? col : entry.van.color;
                var borderStyle = entry.isOverflow ? 'dashed' : 'solid';
                var p = c.passport || {};
                var ref = refMap[c.id];

                for (var i=0; i<t; i++) {
                    slotIdx++;
                    var isFirst = i===0, isLast = i===t-1;
                    var bL = isFirst ? '2.5px '+borderStyle+' '+slotCol : '1px '+borderStyle+' '+slotCol+'55';
                    var bR = isLast  ? '2.5px '+borderStyle+' '+slotCol : '1px '+borderStyle+' '+slotCol+'55';

                    h += '<div style="flex-shrink:0;width:48px;height:110px;';
                    h += 'border-top:2.5px '+borderStyle+' '+slotCol+';border-bottom:2.5px '+borderStyle+' '+slotCol+';';
                    h += 'border-left:'+bL+';border-right:'+bR+';';
                    h += 'background:'+slotCol+'10;border-radius:3px;';
                    h += 'display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:4px 0;">';

                    // Label badges top
                    if (p.barcodedLabels || p.prePricedLabels) {
                        h += '<span style="display:flex;justify-content:center;gap:2px;flex-shrink:0;">';
                        if (p.barcodedLabels)  h += '<span style="font-size:8px;font-weight:700;background:#1e3a5f;color:#b5d4f4;border-radius:20px;padding:1px 5px;">BC</span>';
                        if (p.prePricedLabels) h += '<span style="font-size:8px;font-weight:700;background:#166534;color:#bbf7d0;border-radius:20px;padding:1px 5px;">£</span>';
                        h += '</span>';
                    } else {
                        h += '<span style="height:14px;flex-shrink:0;"></span>';
                    }

                    // Circled reference number — large, centred
                    h += '<span style="font-size:30px;font-weight:900;color:'+slotCol+';line-height:1;flex-shrink:0;">'+circledNum(ref)+'</span>';

                    // Slot number bottom
                    h += '<span style="font-size:16px;font-weight:800;color:#1c1917;line-height:1;flex-shrink:0;">'+slotIdx+'</span>';
                    h += '</div>';
                }
            });

            // Empty slots
            var empty = Math.max(0, MAX_BAY - totalSlots);
            for (var e=0; e<empty; e++) {
                slotIdx++;
                h += '<div style="flex-shrink:0;width:48px;height:110px;border:1.5px dashed #d1d5db;border-radius:3px;background:#fafafa;';
                h += 'display:flex;align-items:flex-end;justify-content:center;padding-bottom:4px;">';
                h += '<span style="font-size:16px;font-weight:800;color:#d1d5db;line-height:1;">'+slotIdx+'</span>';
                h += '</div>';
            }
            h += '</div>'; // slots row

            // ── Key table for this bay ───────────────────────────────────────
            h += '<table style="border-collapse:collapse;font-size:11px;width:auto;min-width:360px;">';
            h += '<thead><tr style="background:#f3f4f6;">';
            h += '<th style="padding:4px 10px;border:1px solid #e5e7eb;font-weight:700;color:#374151;text-align:center;white-space:nowrap;">Ref</th>';
            h += '<th style="padding:4px 10px;border:1px solid #e5e7eb;font-weight:700;color:#374151;text-align:left;">Customer</th>';
            h += '<th style="padding:4px 10px;border:1px solid #e5e7eb;font-weight:700;color:#374151;text-align:center;white-space:nowrap;">Trolleys</th>';
            h += '<th style="padding:4px 10px;border:1px solid #e5e7eb;font-weight:700;color:#374151;text-align:left;">Labels</th>';
            h += '</tr></thead><tbody>';
            refList.forEach(function(item, idx){
                var bg = idx%2===0 ? 'white' : '#f9fafb';
                var labels = '';
                if (item.p.barcodedLabels)  labels += '<span style="font-size:9px;font-weight:700;background:#1e3a5f;color:#b5d4f4;border-radius:20px;padding:1px 6px;margin-right:3px;">BC</span>';
                if (item.p.prePricedLabels) labels += '<span style="font-size:9px;font-weight:700;background:#166534;color:#bbf7d0;border-radius:20px;padding:1px 6px;">£</span>';
                h += '<tr style="background:'+bg+';">';
                h += '<td style="padding:5px 10px;border:1px solid #e5e7eb;text-align:center;font-size:18px;font-weight:900;color:'+item.slotCol+';">'+circledNum(item.ref)+'</td>';
                h += '<td style="padding:5px 10px;border:1px solid #e5e7eb;font-weight:600;color:#1c1917;">'+item.customer.name+'</td>';
                h += '<td style="padding:5px 10px;border:1px solid #e5e7eb;text-align:center;font-weight:700;color:#1c1917;">'+item.totalTrolleys+'</td>';
                h += '<td style="padding:5px 10px;border:1px solid #e5e7eb;">'+(labels||'<span style="color:#9ca3af;font-size:10px;">—</span>')+'</td>';
                h += '</tr>';
            });
            h += '</tbody></table>';
            h += '</div>'; // bay block
        });
        return h;
    }

    // ── Build summary table ──────────────────────────────────────────────────
    function buildTable() {
        if (tableRows.length === 0) return '';
        tableRows.sort(function(a,b){ return String(a.bay).localeCompare(String(b.bay)) || a.name.localeCompare(b.name); });
        var h = '<table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:4px;">';
        h += '<thead><tr style="background:#f3f4f6;">';
        ['Bay','Customer','Address','Day','Van','Trolleys','Labels','Order #','Status'].forEach(function(col){
            h += '<th style="padding:6px 8px;text-align:left;font-weight:700;color:#374151;border:1px solid #e5e7eb;white-space:nowrap;">'+col+'</th>';
        });
        h += '</tr></thead><tbody>';
        tableRows.forEach(function(r, idx){
            var bg = idx%2===0 ? 'white' : '#f9fafb';
            var labels = '';
            if (r.barcoded)  labels += '<span style="font-size:9px;font-weight:700;background:#1e3a5f;color:#b5d4f4;border-radius:20px;padding:1px 5px;margin-right:3px;">BC</span>';
            if (r.prePriced) labels += '<span style="font-size:9px;font-weight:700;background:#166534;color:#bbf7d0;border-radius:20px;padding:1px 5px;">£</span>';
            h += '<tr style="background:'+bg+';">';
            h += '<td style="padding:5px 8px;border:1px solid #e5e7eb;font-weight:700;color:#1c1917;white-space:nowrap;">'+r.bay+'</td>';
            h += '<td style="padding:5px 8px;border:1px solid #e5e7eb;font-weight:600;color:#1c1917;">'+r.name+'</td>';
            h += '<td style="padding:5px 8px;border:1px solid #e5e7eb;color:#4b5563;max-width:180px;">'+r.address+'</td>';
            h += '<td style="padding:5px 8px;border:1px solid #e5e7eb;white-space:nowrap;">'+r.day+'</td>';
            h += '<td style="padding:5px 8px;border:1px solid #e5e7eb;white-space:nowrap;"><span style="color:'+r.vanColor+';font-weight:700;">'+r.van+'</span></td>';
            h += '<td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:center;font-weight:700;">'+r.trolleys+'</td>';
            h += '<td style="padding:5px 8px;border:1px solid #e5e7eb;">'+labels+'</td>';
            h += '<td style="padding:5px 8px;border:1px solid #e5e7eb;color:#6b7280;font-size:10px;">'+r.orderNumber+'</td>';
            h += '<td style="padding:5px 8px;border:1px solid #e5e7eb;color:#6b7280;text-transform:capitalize;">'+r.status+'</td>';
            h += '</tr>';
        });
        h += '</tbody></table>';
        return h;
    }

    var dayLabel = selectedDayId === 'all'
        ? 'All Days'
        : (DAYS.find(function(d){ return d.id===parseInt(selectedDayId); })?.name || '');

    var html =
        '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
        '<title>Bay Sheet — '+dayLabel+'</title>' +
        '<style>' +
        '@page { size: A4 landscape; margin: 12mm 14mm; }' +
        'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin:0; color:#1c1917; }' +
        '.page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:16px; padding-bottom:10px; border-bottom:2px solid #1c1917; }' +
        'h1 { margin:0 0 2px 0; font-size:20px; font-weight:800; }' +
        '.meta { font-size:11px; color:#6b7280; }' +
        '.section-title { font-size:13px; font-weight:800; color:#1c1917; margin:16px 0 8px 0; padding-bottom:4px; border-bottom:1px solid #e5e7eb; }' +
        '.legend { display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:10px; font-size:11px; }' +
        '@media print { button { display:none!important; } body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }' +
        '</style></head><body>' +

        '<div class="page-header">' +
        '<div>' +
        '<h1><i>Bay Assignment Sheet</i></h1>' +
        '<div class="meta">Day: <strong>'+dayLabel+'</strong> &nbsp;·&nbsp; Printed: '+printedAt+'</div>' +
        '</div>' +
        '<div style="text-align:right;">' +
        '<button onclick="window.print()" style="padding:8px 18px;background:#6366f1;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">🖨 Print</button>' +
        '</div>' +
        '</div>' +

        // Legend
        '<div class="legend">' +
        '<span style="font-weight:700;color:#374151;">Legend:</span>' +
        '<span><span style="font-size:10px;font-weight:700;background:#1e3a5f;color:#b5d4f4;border-radius:20px;padding:1px 6px;">BC</span> Barcoded Labels</span>' +
        '<span><span style="font-size:10px;font-weight:700;background:#166534;color:#bbf7d0;border-radius:20px;padding:1px 6px;">£</span> Pre-Priced Labels</span>' +
        '<span style="font-size:10px;color:#6b7280;">Dashed border = overflow trolley</span>' +
        '</div>' +

        // Van colour key
        '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">' +
        VANS.map(function(v){ return '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;"><span style="width:10px;height:10px;border-radius:2px;background:'+v.color+';display:inline-block;"></span>'+v.name+'</span>'; }).join('') +
        '</div>' +

        '<div class="section-title">Bay Diagram</div>' +
        buildBayDiagram() +

        '<div class="section-title" style="margin-top:20px;">Order Summary</div>' +
        buildTable() +

        '</body></html>';

    var w = window.open('', '_blank', 'width=1100,height=750');
    w.document.write(html);
    w.document.close();
    w.focus();
}

function refreshDriverView() {
    var el = document.getElementById('driverViewContent');
    if (!el) return;
    var MAX = (typeof MAX_TROLLEYS_PER_RUN !== 'undefined') ? MAX_TROLLEYS_PER_RUN : 17;

    // ── Day filter bar ──
    var html = '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:16px;">';
    // All Week button
    var allActive = _driverViewDayFilter === null;
    html += '<button onclick="setDriverViewDay(null)" style="padding:6px 16px;border-radius:20px;border:2px solid ' + (allActive ? 'var(--primary)' : 'var(--border)') + ';background:' + (allActive ? 'var(--primary)' : 'var(--surface)') + ';color:' + (allActive ? 'white' : 'var(--text)') + ';font-size:12px;font-weight:700;cursor:pointer;">All Week</button>';
    DAYS.forEach(function(day) {
        // Only show days that have at least one delivery
        var hasDeliveries = VANS.some(function(van){ return (deliveryPlan[van.id]?.[day.id]?.length||0) > 0; });
        if (!hasDeliveries) return;
        var active = _driverViewDayFilter === day.id;
        html += '<button onclick="setDriverViewDay('+day.id+')" style="padding:6px 16px;border-radius:20px;border:2px solid ' + (active ? 'var(--primary)' : 'var(--border)') + ';background:' + (active ? 'var(--primary)' : 'var(--surface)') + ';color:' + (active ? 'white' : 'var(--text)') + ';font-size:12px;font-weight:700;cursor:pointer;">'+day.name+'</button>';
    });
    html += '<button onclick="openPrintBaySheet()" style="margin-left:auto;padding:6px 16px;border-radius:20px;border:2px solid #6366f1;background:#6366f1;color:white;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;"><i class="fas fa-print"></i> Print Bay Sheet</button>';
    html += '</div>';

    // Bay bar — only shown when bay feature is enabled
    if (BAY_FEATURE_ENABLED) {
        if (BAY_ASSIGNMENT_MODE === 'order') {
            // Order-based: show summary of bay assignments per order
            var bayOrderMap = {};
            customers.forEach(function(c) {
                if (c.bayNumber) {
                    if (!bayOrderMap[c.bayNumber]) bayOrderMap[c.bayNumber] = 0;
                    bayOrderMap[c.bayNumber]++;
                }
            });
            var bayNums = Object.keys(bayOrderMap).map(Number).sort(function(a,b){return a-b;});
            html += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:18px;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:10px;">';
            html += '<span style="font-size:12px;font-weight:700;color:var(--text-muted);"><i class="fas fa-warehouse" style="margin-right:5px;"></i>Bay Summary (order-based):</span>';
            if (bayNums.length === 0) {
                html += '<span style="font-size:12px;color:var(--text-muted);font-style:italic;">No bay assignments yet — pickers assign bays when marking orders ready</span>';
            } else {
                bayNums.forEach(function(b) {
                    html += '<span style="display:inline-flex;align-items:center;gap:5px;background:var(--primary-light,#eff6ff);border:1px solid var(--primary);border-radius:20px;padding:3px 10px;font-size:12px;font-weight:700;color:var(--primary);">';
                    html += '<i class="fas fa-warehouse" style="font-size:10px;"></i>Bay ' + b + ': ' + bayOrderMap[b] + ' order' + (bayOrderMap[b] > 1 ? 's' : '') + '</span>';
                });
            }
            html += '</div>';
        } else {
            html += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:18px;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:10px;">';
            html += '<span style="font-size:12px;font-weight:700;color:var(--text-muted);"><i class="fas fa-warehouse" style="margin-right:5px;"></i>Bay Assignments:</span>';
            var anyBay = false;
            VANS.forEach(function(van) {
                var b = vanBayAssignments[van.id];
                if (!b) return;
                anyBay = true;
                html += '<span style="display:inline-flex;align-items:center;gap:5px;background:' + van.color + '18;border:1px solid ' + van.color + '44;border-radius:20px;padding:3px 10px;font-size:12px;font-weight:700;color:' + van.color + ';">';
                html += '<span style="width:8px;height:8px;border-radius:50%;background:' + van.color + ';display:inline-block;"></span>' + van.name + ' → Bay ' + b + '</span>';
            });
            if (!anyBay) html += '<span style="font-size:12px;color:var(--text-muted);font-style:italic;">None assigned yet</span>';
            html += '<button onclick="openBayAssignModal()" style="margin-left:auto;background:var(--primary);color:white;border:none;padding:5px 12px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;display:flex;align-items:center;gap:5px;"><i class="fas fa-edit"></i> Edit Bays</button>';
            html += '</div>';
        }
    }

    // Bay board — full diagram below the bar
    if (BAY_FEATURE_ENABLED) {
        html += BAY_ASSIGNMENT_MODE === 'order' ? renderOrderBayBoard() : renderBayBoard();
    }

    // Apply day filter
    var visibleDays = _driverViewDayFilter === null
        ? DAYS
        : DAYS.filter(function(d){ return d.id === _driverViewDayFilter; });

    visibleDays.forEach(function(day) {
        var hasAny = VANS.some(function(van){ return (deliveryPlan[van.id]?.[day.id]?.length||0) > 0; });
        if (!hasAny) return;

        html += '<div style="margin-bottom:28px;">';
        html += '<h3 style="font-family:var(--font-display);font-size:16px;font-weight:800;color:var(--text);margin:0 0 14px 0;padding-bottom:8px;border-bottom:2px solid var(--border);display:flex;align-items:center;gap:8px;">';
        html += '<i class="fas fa-calendar-day" style="color:var(--primary);"></i> ' + day.name + '</h3>';
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;">';

        VANS.forEach(function(van) {
            var ids = deliveryPlan[van.id]?.[day.id] || [];
            var stops = ids.map(function(id){ return customers.find(function(c){return c.id===id;}); }).filter(Boolean);

            if (!stops.length) {
                // Show empty van card
                html += '<div style="background:var(--surface);border:2px solid '+van.color+'44;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">';
                html += '<div style="background:'+van.color+';padding:12px 16px;display:flex;align-items:center;justify-content:space-between;">';
                html += '<span style="color:white;font-weight:800;font-size:15px;display:flex;align-items:center;gap:8px;"><i class="fas fa-truck"></i> '+van.name+'</span>';
                html += '<span style="background:rgba(255,255,255,0.25);color:white;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;">0 stops</span>';
                html += '</div>';
                html += '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;"><i class="fas fa-inbox" style="opacity:0.3;font-size:22px;display:block;margin-bottom:6px;"></i>No stops assigned</div>';
                html += '</div>';
                return;
            }

            // Pre-calculate ETAs for this van+day so stop rows can show them
            if (typeof calculateAllETAs === 'function') calculateAllETAs(van.id, day.id);

            // Compute delivery runs using computeDeliveryRuns if available, else manual split
            var runs = [];
            if (typeof computeDeliveryRuns === 'function') {
                runs = computeDeliveryRuns(van.id, day.id);
            } else {
                // Fallback: manual split using per-van limit
                var vanLimit = getVanTrolleyLimit(van.id);
                var currentRun = [], currentTrolleys = 0;
                stops.forEach(function(c) {
                    var t = getTotalTrolleyCount(c);
                    if (currentTrolleys + t > vanLimit && currentRun.length > 0) {
                        runs.push({ run: runs.length + 1, customers: currentRun, trolleys: currentTrolleys, driverId: null });
                        currentRun = []; currentTrolleys = 0;
                    }
                    currentRun.push(c); currentTrolleys += t;
                });
                if (currentRun.length) runs.push({ run: runs.length + 1, customers: currentRun, trolleys: currentTrolleys, driverId: null });
            }

            var totalTrolleys = stops.reduce(function(t,c){ return t + getTotalTrolleyCount(c); }, 0);
            var totalRuns = runs.length;

            // Van header (spans all runs)
            html += '<div style="background:var(--surface);border:2px solid '+van.color+'44;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">';
            html += '<div style="background:'+van.color+';padding:12px 16px;display:flex;align-items:center;justify-content:space-between;">';
            html += '<span style="color:white;font-weight:800;font-size:15px;display:flex;align-items:center;gap:8px;"><i class="fas fa-truck"></i> '+van.name+'</span>';
            html += '<div style="display:flex;gap:6px;align-items:center;">';
            html += '<span style="background:rgba(255,255,255,0.25);color:white;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;">'+stops.length+' stops</span>';
            html += '<span style="background:rgba(255,255,255,0.25);color:white;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;">'+totalTrolleys+' 🛒</span>';
            if (totalRuns > 1) {
                html += '<span style="background:#fff3;color:white;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;border:1px solid rgba(255,255,255,0.5);">'+totalRuns+' runs</span>';
            }
            if (BAY_FEATURE_ENABLED && BAY_ASSIGNMENT_MODE !== 'order') {
                var vanBay = getBayForVan(van.id);
                if (vanBay) {
                    html += '<span style="background:rgba(0,0,0,0.25);color:white;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;border:1px solid rgba(255,255,255,0.4);" title="Bay assignment"><i class="fas fa-warehouse" style="margin-right:4px;font-size:10px;"></i>Bay '+vanBay+'</span>';
                }
            }
            html += '</div></div>';

            // Render each run
            var vanLimit = getVanTrolleyLimit(van.id);
            runs.forEach(function(run) {
                var pct = Math.min(100, Math.round((run.trolleys / vanLimit) * 100));
                var barColor = pct<=60?'#16a34a':pct<=85?'#d97706':'#dc2626';
                var bgColor  = pct<=60?'#dcfce7':pct<=85?'#fef3c7':'#fee2e2';
                var txtColor = pct<=60?'#166534':pct<=85?'#92400e':'#991b1b';

                // Run sub-header — clickable when bay feature is enabled
                var runBg = totalRuns > 1 ? 'background:'+van.color+'18;' : '';
                if (BAY_FEATURE_ENABLED) {
                    var runKey = 'run_' + van.id + '_' + day.id + '_' + run.run;
                    html += '<div id="'+runKey+'" style="'+runBg+'border-bottom:1px solid '+van.color+'22;cursor:pointer;transition:background 0.15s;" ';
                    html += 'onclick="_openRunDiagram('+van.id+','+day.id+','+run.run+')" ';
                    html += 'onmouseenter="this.style.background=\''+van.color+'22\'" ';
                    html += 'onmouseleave="this.style.background=\''+(totalRuns>1?van.color+'18':'transparent')+'\'">';
                } else {
                    html += '<div style="'+runBg+'border-bottom:1px solid '+van.color+'22;">';
                }

                if (totalRuns > 1) {
                    html += '<div style="padding:6px 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px dashed '+van.color+'33;">';
                    html += '<span style="font-size:12px;font-weight:800;color:'+van.color+';">RUN '+run.run+'</span>';
                    html += '<span style="font-size:11px;font-weight:600;color:'+txtColor+';background:'+bgColor+';padding:1px 8px;border-radius:12px;">'+run.trolleys+'/'+vanLimit+' 🛒</span>';
                    html += '</div>';
                }

                // Driver for this run
                var driver = run.driverId ? staffMembers.find(function(s){return s.id===run.driverId;}) : null;
                // Also check per-customer driver as fallback for run 1
                if (!driver && run.run === 1) {
                    run.customers.forEach(function(c){ if(c.assignedDriver&&!driver) driver=staffMembers.find(function(s){return s.id===c.assignedDriver;}); });
                }

                html += '<div style="padding:10px 14px;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;gap:8px;position:relative;background:#ffb800;">';
                if (driver) {
                    var ini = driver.name.split(' ').map(function(n){return n[0];}).join('').toUpperCase();
                    html += '<div style="width:28px;height:28px;background:rgba(0,0,0,0.18);border-radius:6px;display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:700;flex-shrink:0;">'+ini+'</div>';
                    html += '<div><div style="font-size:13px;font-weight:700;color:#1c1917;">'+driver.name+'</div>';
                    html += '<div style="font-size:11px;color:rgba(0,0,0,0.55);">'+(driver.role||'Driver')+(totalRuns>1?' · Run '+run.run:'')+'</div></div>';
                } else {
                    html += '<div style="width:28px;height:28px;background:rgba(0,0,0,0.12);border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fas fa-user" style="color:rgba(0,0,0,0.35);font-size:11px;"></i></div>';
                    html += '<span style="font-size:13px;color:rgba(0,0,0,0.45);font-style:italic;">No driver assigned'+(totalRuns>1?' for run '+run.run:'')+'</span>';
                }
                // Bay number centred in the driver row
                if (BAY_FEATURE_ENABLED) {
                    html += '<div style="position:absolute;left:0;right:0;display:flex;justify-content:center;align-items:center;gap:8px;pointer-events:none;">';
                    if (BAY_ASSIGNMENT_MODE === 'order') {
                        // Collect unique bay numbers assigned to orders in this run
                        var runBays = [];
                        run.customers.forEach(function(c) { if (c.bayNumber && runBays.indexOf(c.bayNumber) === -1) runBays.push(c.bayNumber); });
                        runBays.sort(function(a,b){ return parseInt(a)-parseInt(b); });
                        runBays.forEach(function(bn) {
                            html += '<span style="font-size:22px;font-weight:900;color:var(--text);letter-spacing:1px;line-height:1;">BAY '+bn+'</span>';
                        });
                    } else {
                        var runBayNum = getBayForVan(van.id);
                        if (runBayNum) {
                            html += '<span style="font-size:22px;font-weight:900;color:var(--text);letter-spacing:1px;line-height:1;">BAY '+runBayNum+'</span>';
                        }
                    }
                    html += '</div>';
                }
                html += '</div>';

                // Trolley bar
                html += '<div style="padding:10px 14px;border-bottom:1px solid #f3f4f6;">';
                html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">';
                html += '<span style="font-size:11px;font-weight:700;color:var(--text-muted);">🛒 Trolley Capacity</span>';
                html += '<span style="font-size:12px;font-weight:800;color:'+txtColor+';background:'+bgColor+';padding:2px 8px;border-radius:20px;">'+run.trolleys+' / '+vanLimit+'</span>';
                html += '</div>';
                html += '<div style="background:#f3f4f6;border-radius:20px;height:10px;overflow:hidden;">';
                html += '<div style="background:'+barColor+';height:100%;border-radius:20px;width:'+pct+'%;transition:width 0.4s;"></div></div>';
                html += '<div style="display:flex;justify-content:space-between;margin-top:3px;font-size:10px;color:var(--text-muted);">';
                html += '<span>'+pct+'% full</span>';
                html += '<span style="color:'+barColor+';font-weight:600;">'+(vanLimit-run.trolleys)+' spare</span></div>';
                if (BAY_FEATURE_ENABLED) {
                    html += '<div style="margin-top:6px;font-size:10px;color:'+van.color+';font-weight:600;opacity:0.75;"><i class="fas fa-th-large" style="margin-right:3px;"></i>Click to view bay diagram</div>';
                }
                html += '</div>';

                // Stops for this run
                html += '<div style="max-height:200px;overflow-y:auto;">';
                run.customers.forEach(function(c, i) {
                    var t  = getTotalTrolleyCount(c);
                    var sc = getStatusBadgeColor(c.status);
                    // ETA for this stop
                    var etaE = typeof getCustomerETA === 'function' ? getCustomerETA(c.id) : null;
                    var etaColor = '#64748b';
                    if (etaE) { etaColor = etaE.confidence==='actual'?'#16a34a':etaE.confidence==='estimated'?'#d97706':'#64748b'; if(etaE.nextDay) etaColor='#7c3aed'; else if(etaE.outsideWindow) etaColor='#dc2626'; }

                    html += '<div onclick="event.stopPropagation();_driverViewToggleStatusPanel('+c.id+',this)" style="display:flex;align-items:center;gap:8px;padding:7px 14px;border-bottom:1px solid #f9fafb;cursor:pointer;transition:background 0.15s;position:relative;" onmouseover="this.style.background=\'#f9fafb\'" onmouseout="this.style.background=\'\'">';
                    html += '<span style="background:'+van.color+'22;color:'+van.color+';width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;flex-shrink:0;">'+(i+1)+'</span>';
                    html += '<div style="flex:1;min-width:0;"><div style="font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+c.name+'</div>';
                    html += '<div style="font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+(c.address||'')+'</div></div>';
                    // ETA — absolutely centred in the row
                    if (etaE) {
                        html += '<div style="position:absolute;left:0;right:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;">';
                        html += '<span style="font-size:24px;font-weight:900;color:'+etaColor+';line-height:1;letter-spacing:-0.5px;">'+etaE.label+'</span>';
                        html += '<span style="font-size:10px;font-weight:600;color:'+etaColor+';opacity:0.75;">'+(etaE.nextDay?'next window':etaE.isCollection?'collection':'est. arrival')+'</span>';
                        html += '</div>';
                    }
                    html += '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0;">';
                    if (t>0) html += '<span style="font-size:11px;font-weight:700;color:#16a34a;">🛒 '+t+'</span>';
                    html += '<span style="background:'+sc+';color:white;font-size:9px;font-weight:700;padding:1px 6px;border-radius:10px;">'+getStatusText(c.status)+'</span>';
                    if (BAY_FEATURE_ENABLED && BAY_ASSIGNMENT_MODE === 'order' && c.bayNumber) {
                        html += '<span style="font-size:9px;font-weight:800;color:var(--primary);background:var(--primary-light,#eff6ff);padding:1px 6px;border-radius:10px;border:1px solid var(--primary);">Bay '+c.bayNumber+'</span>';
                    }
                    html += '</div></div>';
                    // Inline status panel (collapsed by default)
                    html += '<div id="dvStatusPanel-'+c.id+'" style="display:none;padding:8px 14px 10px 42px;border-bottom:1px solid #f3f4f6;background:#f8fafc;" onclick="event.stopPropagation()">';
                    html += '<div style="font-size:10px;font-weight:700;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Change status</div>';
                    html += '<div style="display:flex;flex-wrap:wrap;gap:5px;">';
                    Object.values(ORDER_STATUSES).forEach(function(s) {
                        var active = s === c.status;
                        var col = getStatusBadgeColor(s);
                        var onclick = (BAY_FEATURE_ENABLED && BAY_ASSIGNMENT_MODE === 'order' && s === 'ready_for_delivery')
                            ? 'promptBayAndUpdateStatus('+c.id+',\''+s+'\')'
                            : 'updateOrderStatus('+c.id+',\''+s+'\');closeOrderModal && closeOrderModal();';
                        html += '<button onclick="'+onclick+'" style="padding:4px 10px;font-size:10px;font-weight:700;border-radius:20px;border:2px solid '+col+';';
                        html += active ? 'background:'+col+';color:white;' : 'background:white;color:'+col+';';
                        html += 'cursor:pointer;transition:all 0.12s;">'+getStatusText(s)+'</button>';
                    });
                    html += '</div></div>';
                });
                html += '</div>'; // stops
                html += '</div>'; // run block
            });

            html += '</div>'; // van card
        });
        html += '</div></div>'; // grid + day
    });

    if (!html) {
        html = '<div style="text-align:center;padding:60px 20px;color:var(--text-muted);"><i class="fas fa-truck" style="font-size:40px;opacity:0.15;display:block;margin-bottom:16px;"></i><p style="font-size:16px;font-weight:600;">No deliveries scheduled yet.</p><p style="font-size:13px;margin-top:6px;">Assign customers to vans and days to see the schedule here.</p></div>';
    }
    el.innerHTML = html;

    // Re-apply bay board open state if it was expanded before refresh
    if (_bayBoardOpen) {
        var bayBody = el.querySelector('.bay-board-body');
        if (bayBody) {
            bayBody.style.display = 'block';
            var bayIcon = bayBody.previousElementSibling && bayBody.previousElementSibling.querySelector('.fa-chevron-down');
            if (bayIcon) { bayIcon.classList.remove('fa-chevron-down'); bayIcon.classList.add('fa-chevron-up'); }
        }
    }

    // If the run diagram popup is open, re-render it with fresh data
    var openModal = document.getElementById('runDiagramModal');
    if (openModal && openModal.dataset.vanId) {
        _openRunDiagram(
            parseInt(openModal.dataset.vanId),
            parseInt(openModal.dataset.dayId),
            parseInt(openModal.dataset.runNumber)
        );
    }
}

function _driverViewToggleStatusPanel(customerId, rowEl) {
    var panel = document.getElementById('dvStatusPanel-' + customerId);
    if (!panel) return;
    var isOpen = panel.style.display !== 'none';
    // Close all other open panels first
    document.querySelectorAll('[id^="dvStatusPanel-"]').forEach(function(p) { p.style.display = 'none'; });
    if (!isOpen) panel.style.display = 'block';
}

