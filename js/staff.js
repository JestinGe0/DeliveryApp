// ========== STAFF MANAGEMENT ==========
function filterStaffByType(type) {
    currentStaffFilter = type;
    document.querySelectorAll('.type-filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    renderStaffGrid();
}

function renderStaffGrid() {
    const container = document.getElementById('staffGrid');
    let filtered = currentStaffFilter === 'all' ? staffMembers : staffMembers.filter(s => s.type === currentStaffFilter);

    if (!filtered.length) {
        container.innerHTML = `
            <div style="text-align:center;padding:50px;">
                <i class="fas fa-users-slash fa-3x" style="color:#ccc;margin-bottom:20px;"></i>
                <h3>No Staff Members</h3>
                <p style="color:#999;margin-bottom:20px;">Add your first staff member to get started.</p>
                <button class="add-staff-btn" style="display:inline-flex;" onclick="openAddStaffModal()">
                    <i class="fas fa-plus"></i> Add Staff
                </button>
            </div>`;
        return;
    }

    filtered.forEach(s => {
        s.activeOrders = s.type === 'picker'
            ? customers.filter(c => c.assignedStaff && c.assignedStaff.includes(s.id)).length
            : customers.filter(c => c.assignedDriver === s.id).length;
    });

    const rows = filtered.map(staff => {
        const initials = staff.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        const sType    = staff.type || 'picker';
        const isPicker = sType === 'picker';
        const statVal  = isPicker ? (staff.totalPicks || 0) : (staff.totalDeliveries || 0);
        const statLabel = isPicker ? 'Picks' : 'Deliveries';

        const typeBadge = isPicker
            ? `<span style="background:#dcfce7;color:#166534;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;">
                   <i class="fas fa-hand-holding"></i> Picker
               </span>`
            : `<span style="background:#fff7ed;color:#9a3412;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;">
                   <i class="fas fa-truck"></i> Driver
               </span>`;

        const activeBadge = staff.activeOrders > 0
            ? `<span style="background:#dbeafe;color:#1e40af;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;">${staff.activeOrders}</span>`
            : `<span style="color:#9ca3af;font-size:12px;">—</span>`;

        return `
            <tr class="staff-table-row">
                <td style="padding:12px 16px;white-space:nowrap;">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div style="
                            width:36px;height:36px;border-radius:8px;flex-shrink:0;
                            background:${isPicker ? 'var(--primary)' : '#f59e0b'};
                            color:white;font-weight:700;font-size:14px;
                            display:flex;align-items:center;justify-content:center;
                            font-family:var(--font-display);">
                            ${initials}
                        </div>
                        <div>
                            <div style="font-weight:700;font-size:14px;color:var(--text);">${staff.name}</div>
                            <div style="font-size:12px;color:var(--text-muted);">${staff.role || (isPicker ? 'Picker' : 'Driver')} · ${staff.shift || 'Morning'}</div>
                        </div>
                    </div>
                </td>
                <td style="padding:12px 16px;white-space:nowrap;">${typeBadge}</td>
                <td style="padding:12px 16px;white-space:nowrap;font-size:13px;color:var(--text-2);">
                    <i class="fas fa-envelope" style="color:var(--text-muted);margin-right:6px;"></i>${staff.email}
                </td>
                <td style="padding:12px 16px;white-space:nowrap;font-size:13px;color:var(--text-2);">
                    <i class="fas fa-phone" style="color:var(--text-muted);margin-right:6px;"></i>${staff.phone || '—'}
                </td>
                <td style="padding:12px 16px;text-align:center;white-space:nowrap;">${activeBadge}</td>
                <td style="padding:12px 16px;text-align:center;white-space:nowrap;font-size:13px;font-weight:700;color:var(--text-2);">
                    ${statVal} <span style="font-size:11px;font-weight:400;color:var(--text-muted);">${statLabel}</span>
                </td>
                <td style="padding:12px 16px;white-space:nowrap;font-size:13px;color:var(--text-2);">
                    ${staff.license ? `<span style="background:#f3f4f6;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;">${staff.license}</span>` : '—'}
                </td>
                <td style="padding:12px 16px;white-space:nowrap;">
                    <div style="display:flex;gap:8px;">
                        <button onclick="viewStaffOrders(${staff.id})" title="View Orders"
                            style="background:var(--primary);color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;">
                            <i class="fas fa-eye"></i> Orders
                        </button>
                        <button onclick="openEditStaffModal(${staff.id})" title="Edit"
                            style="background:#3b82f6;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="deleteStaff(${staff.id})" title="Delete"
                            style="background:#ef4444;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
    }).join('');

    container.innerHTML = `
        <div style="overflow-x:auto; width:100%;">
            <table style="width:100%; min-width:1000px; border-collapse:collapse; background:var(--surface); border-radius:10px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.07);">
                <thead>
                    <tr style="background:var(--surface-2); border-bottom:2px solid var(--border);">
                        <th style="padding:14px 16px; text-align:left; font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap;">Staff Member</th>
                        <th style="padding:14px 16px; text-align:left; font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap;">Type</th>
                        <th style="padding:14px 16px; text-align:left; font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap;">Email</th>
                        <th style="padding:14px 16px; text-align:left; font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap;">Phone</th>
                        <th style="padding:14px 16px; text-align:center; font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap;">Active</th>
                        <th style="padding:14px 16px; text-align:center; font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap;">Stats</th>
                        <th style="padding:14px 16px; text-align:left; font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap;">License</th>
                        <th style="padding:14px 16px; text-align:left; font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap;">Actions</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function toggleStaffTypeFields() {
    const type = document.getElementById('staffType').value;
    document.getElementById('driverFields').style.display = type==='driver' ? 'flex' : 'none';
    document.getElementById('staffRole').value = type==='driver' ? 'Driver' : 'Picker';
}

function openAddStaffModal() {
    const m = document.getElementById('addStaffModal');
    ['staffName','staffEmail','staffPhone','staffNotes'].forEach(id => document.getElementById(id).value='');
    document.getElementById('staffType').value         = 'picker';
    document.getElementById('staffRole').value         = 'Picker';
    document.getElementById('staffShift').value        = 'Morning';
    document.getElementById('staffLicense').value      = 'Class 1';
    document.getElementById('staffVehiclePref').value  = 'Van 1';
    document.getElementById('staffTotalStats').value   = '0';
    document.getElementById('driverFields').style.display = 'none';
    m.classList.add('active');
}

function closeAddStaffModal() { document.getElementById('addStaffModal').classList.remove('active'); }

function saveStaff() {
    const name  = document.getElementById('staffName').value.trim();
    const email = document.getElementById('staffEmail').value.trim();
    if (!name || !email) { alert('Please fill in all required fields'); return; }

    const type = document.getElementById('staffType').value;
    const newStaff = {
        id: nextStaffId++, name, email,
        phone: document.getElementById('staffPhone').value.trim(),
        role:  document.getElementById('staffRole').value.trim(),
        type,
        shift: document.getElementById('staffShift').value,
        notes: document.getElementById('staffNotes').value.trim(),
        activeOrders: 0
    };

    if (type === 'picker') {
        newStaff.totalPicks = parseInt(document.getElementById('staffTotalStats').value)||0;
    } else {
        newStaff.license           = document.getElementById('staffLicense').value;
        newStaff.vehiclePreference = document.getElementById('staffVehiclePref').value;
        newStaff.totalDeliveries   = parseInt(document.getElementById('staffTotalStats').value)||0;
    }

    staffMembers.push(newStaff);
    saveStaffData();
    renderStaffGrid();
    closeAddStaffModal();
    showNotification('Staff added successfully');
}

function openEditStaffModal(staffId) {
    const staff = staffMembers.find(s => s.id === staffId);
    if (!staff) return;
    document.getElementById('editStaffId').value    = staff.id;
    document.getElementById('editStaffType').value  = staff.type;
    document.getElementById('editStaffName').value  = staff.name;
    document.getElementById('editStaffEmail').value = staff.email;
    document.getElementById('editStaffPhone').value = staff.phone||'';
    document.getElementById('editStaffRole').value  = staff.role;
    document.getElementById('editStaffShift').value = staff.shift;
    document.getElementById('editStaffNotes').value = staff.notes||'';
    if (staff.type==='driver') {
        document.getElementById('editDriverFields').style.display  = 'flex';
        document.getElementById('editStaffLicense').value          = staff.license||'Class 1';
        document.getElementById('editStaffVehiclePref').value      = staff.vehiclePreference||'Van 1';
    } else {
        document.getElementById('editDriverFields').style.display = 'none';
    }
    document.getElementById('editStaffModal').classList.add('active');
}

function closeEditStaffModal() { document.getElementById('editStaffModal').classList.remove('active'); }

function updateStaff() {
    const id    = parseInt(document.getElementById('editStaffId').value);
    const staff = staffMembers.find(s => s.id === id);
    if (!staff) return;
    staff.name  = document.getElementById('editStaffName').value.trim();
    staff.email = document.getElementById('editStaffEmail').value.trim();
    staff.phone = document.getElementById('editStaffPhone').value.trim();
    staff.role  = document.getElementById('editStaffRole').value.trim();
    staff.shift = document.getElementById('editStaffShift').value;
    staff.notes = document.getElementById('editStaffNotes').value.trim();
    if (staff.type==='driver') {
        staff.license          = document.getElementById('editStaffLicense').value;
        staff.vehiclePreference = document.getElementById('editStaffVehiclePref').value;
    }
    saveStaffData();
    renderStaffGrid();
    closeEditStaffModal();
    showNotification('Staff updated successfully');
}

function deleteStaff(staffId) {
    if (!confirm('Are you sure you want to delete this staff member?')) return;
    const staff = staffMembers.find(s => s.id === staffId);
    if (!staff) return;

    if (staff.type==='picker') {
        const hasOrders = customers.some(c => c.assignedStaff && c.assignedStaff.includes(staffId));
        if (hasOrders && !confirm('This picker has active orders. Remove them? Continue?')) return;
        customers.forEach(c => { if (c.assignedStaff) c.assignedStaff = c.assignedStaff.filter(id => id!==staffId); });
    } else {
        const hasDeliveries = customers.some(c => c.assignedDriver===staffId);
        if (hasDeliveries && !confirm('This driver has active deliveries. Remove them? Continue?')) return;
        customers.forEach(c => { if (c.assignedDriver===staffId) c.assignedDriver=null; });
    }

    staffMembers = staffMembers.filter(s => s.id!==staffId);
    saveStaffData();
    renderStaffGrid();
    updateAllDisplays();
    showNotification('Staff deleted successfully');
}

function viewStaffOrders(staffId) {
    const staff = staffMembers.find(s => s.id===staffId);
    if (!staff) return;
    const orders = staff.type==='picker'
        ? customers.filter(c => c.assignedStaff && c.assignedStaff.includes(staffId))
        : customers.filter(c => c.assignedDriver===staffId);
    let msg = `${staff.name}'s Assigned Orders:\n\n`;
    msg += orders.length ? orders.map(o=>`• ${o.name} - ${o.address.substring(0,50)}...`).join('\n') : 'No orders assigned.';
    alert(msg);
}

function getStaffNames(staffIds) {
    if (!staffIds || !staffIds.length) return 'None';
    return staffIds.map(id => { const s=staffMembers.find(x=>x.id===id); return s?s.name:'Unknown'; }).join(', ');
}

function getDriverName(driverId) {
    if (!driverId) return 'None';
    const driver = staffMembers.find(s=>s.id===driverId);
    return driver ? driver.name : 'Unknown';
}

// ========== PICKER ASSIGNMENT ==========
function openAssignStaffModal(customerId) {
    const customer = customers.find(c=>c.id===customerId);
    if (!customer) return;
    if (!Array.isArray(customer.assignedStaff)) customer.assignedStaff = customer.assignedStaff ? [customer.assignedStaff] : [];

    document.getElementById('assignStaffCustomerInfo').innerHTML = `
        <strong>${customer.name}</strong><br>
        <small>${customer.address}</small><br>
        <small>Zone: ${customer.zone} | Status: ${getStatusText(customer.status)}</small>`;

    renderAssignedStaffTags(customer);
    renderAvailableStaffList(customer);
    document.getElementById('assignStaffModal').dataset.customerId = customerId;
    document.getElementById('assignStaffModal').classList.add('active');
}

function closeAssignStaffModal() { document.getElementById('assignStaffModal').classList.remove('active'); }

function renderAssignedStaffTags(customer) {
    const container = document.getElementById('assignedStaffTags');
    const arr = Array.isArray(customer.assignedStaff) ? customer.assignedStaff : (customer.assignedStaff ? [customer.assignedStaff] : []);
    if (!arr.length) { container.innerHTML='<span style="color:var(--gray-400);">No staff assigned</span>'; return; }
    container.innerHTML = `<div class="staff-tags">${arr.map(id => {
        const s = staffMembers.find(x=>x.id===id);
        return s ? `<span class="staff-tag"><i class="fas fa-user"></i> ${s.name}<span class="remove-staff" onclick="removeStaffFromOrder(${customer.id},${id},event)">×</span></span>` : '';
    }).join('')}</div>`;
}

function renderAvailableStaffList(customer) {
    const container = document.getElementById('staffListContainer');
    const pickers   = staffMembers.filter(s=>s.type==='picker');
    if (!pickers.length) { container.innerHTML='<div style="text-align:center;padding:30px;"><p>No pickers available.</p></div>'; return; }

    const arr = Array.isArray(customer.assignedStaff) ? customer.assignedStaff : (customer.assignedStaff ? [customer.assignedStaff] : []);
    container.innerHTML = pickers.map(staff => {
        const isAssigned  = arr.includes(staff.id);
        const activeOrders = customers.filter(c => { const a=Array.isArray(c.assignedStaff)?c.assignedStaff:[c.assignedStaff||'']; return a.includes(staff.id); }).length;
        return `
            <div class="staff-option ${isAssigned?'selected':''}" onclick="toggleStaffSelection(${customer.id},${staff.id})">
                <div class="staff-option-avatar" style="background:linear-gradient(135deg,var(--staff),#d946ef);">
                    ${staff.name.split(' ').map(n=>n[0]).join('').toUpperCase().substring(0,2)}
                </div>
                <div class="staff-option-info">
                    <div class="staff-option-name">${staff.name}</div>
                    <div class="staff-option-role">${staff.role} · ${staff.shift}</div>
                    <small>Active orders: ${activeOrders} | Total picks: ${staff.totalPicks||0}</small>
                </div>
                ${isAssigned ? '<i class="fas fa-check-circle" style="color:var(--success);font-size:1.2rem;"></i>' : ''}
            </div>`;
    }).join('');
}

function toggleStaffSelection(customerId, staffId) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    
    if (!customer.passport) customer.passport = { ...PASSPORT_FIELDS };
    if (!customer.passport.timestamps) customer.passport.timestamps = {};
    if (!customer.passport.pickingMetrics) customer.passport.pickingMetrics = {};
    
    if (!Array.isArray(customer.assignedStaff)) customer.assignedStaff = customer.assignedStaff ? [customer.assignedStaff] : [];
    
    const staff = staffMembers.find(s => s.id === staffId);
    const plantCount = parseInt(customer.passport?.numberOfPlants) || 0;
    const idx = customer.assignedStaff.indexOf(staffId);
    
    if (idx === -1) {
        customer.assignedStaff.push(staffId);
        
        if (!customer.passport.pickingMetrics.pickerNames) {
            customer.passport.pickingMetrics.pickerNames = [];
        }
        if (staff && !customer.passport.pickingMetrics.pickerNames.includes(staff.name)) {
            customer.passport.pickingMetrics.pickerNames.push(staff.name);
        }
        
        if (!customer.passport.pickingMetrics.plantsPerPicker) {
            customer.passport.pickingMetrics.plantsPerPicker = {};
        }
        if (staff) {
            const totalPickers = customer.assignedStaff.length;
            const plantsPerPicker = Math.ceil(plantCount / totalPickers);
            customer.passport.pickingMetrics.plantsPerPicker[staff.name] = plantsPerPicker;
        }
        
        if (!customer.passport.timestamps.orderCreated) {
            customer.passport.timestamps.orderCreated = new Date().toISOString();
        }
        
        if (!customer.passport.timestamps.firstPickerAssigned) {
            customer.passport.timestamps.firstPickerAssigned = new Date().toISOString();
            
            if (customer.passport.timestamps.orderCreated) {
                const created = new Date(customer.passport.timestamps.orderCreated);
                const assigned = new Date(customer.passport.timestamps.firstPickerAssigned);
                customer.passport.pickingMetrics.timeToFirstPicker = Math.round((assigned - created) / (1000 * 60));
            }
        }
        
        customer.passport.pickingMetrics.numberOfPickers = customer.assignedStaff.length;
        
        if (customer.status === ORDER_STATUSES.PENDING) {
            customer.status = ORDER_STATUSES.PICKING;
            if (!customer.passport.timestamps.pickingStarted) {
                customer.passport.timestamps.pickingStarted = new Date().toISOString();
            }
        }
        
        showNotification('Staff added to order');
    } else {
        customer.assignedStaff.splice(idx, 1);
        
        if (customer.passport.pickingMetrics.pickerNames && staff) {
            customer.passport.pickingMetrics.pickerNames = customer.passport.pickingMetrics.pickerNames.filter(n => n !== staff.name);
        }
        
        if (customer.passport.pickingMetrics.plantsPerPicker && staff) {
            delete customer.passport.pickingMetrics.plantsPerPicker[staff.name];
        }
        
        customer.passport.pickingMetrics.numberOfPickers = customer.assignedStaff.length;
        
        if (!customer.assignedStaff.length && customer.status === ORDER_STATUSES.PICKING) {
            customer.status = ORDER_STATUSES.PENDING;
        }
        
        showNotification('Staff removed from order');
    }
    
    renderAssignedStaffTags(customer);
    renderAvailableStaffList(customer);
    updateAllDisplays();
    saveData();
}

function removeStaffFromOrder(customerId, staffId, event) { event.stopPropagation(); toggleStaffSelection(customerId, staffId); }

// ========== DRIVER ASSIGNMENT ==========
let currentDriverFilter = 'all';

function openAssignDriverModal(customerId) {
    const customer = customers.find(c=>c.id===customerId);
    if (!customer) return;
    const van = customer.assignedVan ? VANS.find(v=>v.id===customer.assignedVan) : null;
    document.getElementById('assignDriverCustomerInfo').innerHTML = `
        <strong>${customer.name}</strong><br>
        <small>${customer.address}</small><br>
        <small>Zone: ${customer.zone} | Status: ${getStatusText(customer.status)}</small><br>
        ${van ? `<small>Van: <span style="color:${van.color}">${van.name}</span></small>` : ''}`;
    renderAssignedDriverTag(customer);
    renderAvailableDriversList(customer);
    document.getElementById('assignDriverModal').dataset.customerId = customerId;
    document.getElementById('assignDriverModal').classList.add('active');
    document.getElementById('removeDriverBtn').style.display = customer.assignedDriver ? 'inline-flex' : 'none';
}

function closeAssignDriverModal() {
    document.getElementById('assignDriverModal').classList.remove('active');
    currentDriverFilter = 'all';
    resetDriverFilters();
}

function renderAssignedDriverTag(customer) {
    const container = document.getElementById('assignedDriverTag');
    if (!customer.assignedDriver) { container.innerHTML='<span style="color:var(--gray-400);">No driver assigned</span>'; return; }
    const driver = staffMembers.find(s=>s.id===customer.assignedDriver);
    if (!driver) { container.innerHTML='<span style="color:var(--gray-400);">No driver assigned</span>'; return; }
    container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,#f59e0b20,#d9770620);padding:10px;border-radius:var(--radius);border-left:4px solid #f59e0b;">
            <div style="display:flex;align-items:center;gap:15px;">
                <div style="width:50px;height:50px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:1.2rem;">
                    ${driver.name.split(' ').map(n=>n[0]).join('').toUpperCase().substring(0,2)}
                </div>
                <div>
                    <div style="font-weight:bold;font-size:1.2rem;">${driver.name} ${driver.license?`<span class="driver-license-badge">${driver.license}</span>`:''}</div>
                    <div style="color:var(--gray-600);">${driver.role}</div>
                    <div style="font-size:0.9rem;margin-top:5px;">
                        <span style="margin-right:15px;"><i class="fas fa-trophy"></i> ${driver.totalDeliveries||0} deliveries</span>
                        <span><i class="fas fa-clock"></i> ${driver.shift} shift</span>
                    </div>
                </div>
            </div>
            <i class="fas fa-check-circle" style="color:#f59e0b;font-size:2rem;"></i>
        </div>`;
}

function renderAvailableDriversList(customer) {
    const container = document.getElementById('driverListContainer');
    let drivers     = staffMembers.filter(s=>s.type==='driver');
    if (!drivers.length) { container.innerHTML='<div style="text-align:center;padding:30px;"><p>No drivers available.</p></div>'; return; }

    if (currentDriverFilter==='class1') drivers=drivers.filter(d=>d.license==='Class 1');
    else if (currentDriverFilter==='class2') drivers=drivers.filter(d=>d.license==='Class 2');
    else if (currentDriverFilter==='van1') drivers=drivers.filter(d=>d.vehiclePreference==='Van 1');
    else if (currentDriverFilter==='van2') drivers=drivers.filter(d=>d.vehiclePreference==='Van 2');
    else if (currentDriverFilter==='van3') drivers=drivers.filter(d=>d.vehiclePreference==='Van 3');

    container.innerHTML = drivers.map(driver => {
        const isAssigned      = customer.assignedDriver===driver.id;
        const activeDeliveries = customers.filter(c=>c.assignedDriver===driver.id).length;
        const vanMatch        = customer.assignedVan && driver.vehiclePreference===VANS.find(v=>v.id===customer.assignedVan)?.name;
        return `
            <div class="staff-option ${isAssigned?'selected':''} ${vanMatch?'van-match':''}" onclick="selectDriver(${customer.id},${driver.id})"
                 style="${vanMatch?'border-color:#f59e0b;':''}">
                <div class="staff-option-avatar" style="background:linear-gradient(135deg,#f59e0b,#d97706);">
                    ${driver.name.split(' ').map(n=>n[0]).join('').toUpperCase().substring(0,2)}
                </div>
                <div class="staff-option-info">
                    <div class="staff-option-name">
                        ${driver.name}
                        ${driver.license ? `<span class="driver-license-badge">${driver.license}</span>` : ''}
                        ${driver.vehiclePreference ? `<span class="driver-preference-badge">🚐 ${driver.vehiclePreference}</span>` : ''}
                        ${vanMatch ? '<span style="color:#f59e0b;margin-left:10px;"><i class="fas fa-check-circle"></i> Van Match</span>' : ''}
                    </div>
                    <div class="staff-option-role">${driver.role} · ${driver.shift}</div>
                    <div class="driver-stats">
                        <span><i class="fas fa-truck"></i> ${activeDeliveries} active</span>
                        <span><i class="fas fa-history"></i> ${driver.totalDeliveries||0} total</span>
                    </div>
                </div>
                ${isAssigned ? '<i class="fas fa-check-circle" style="color:#f59e0b;font-size:1.2rem;"></i>' : ''}
            </div>`;
    }).join('');
}

function selectDriver(customerId, driverId) {
    const customer = customers.find(c=>c.id===customerId);
    if (!customer) return;
    if (customer.assignedDriver===driverId) {
        customer.assignedDriver=null;
        showNotification('Driver removed from order');
    } else {
        customer.assignedDriver=driverId;
        showNotification('Driver assigned to order');
    }
    renderAssignedDriverTag(customer);
    renderAvailableDriversList(customer);
    document.getElementById('removeDriverBtn').style.display = customer.assignedDriver ? 'inline-flex' : 'none';
    updateAllDisplays();
    saveData();
}

function removeDriverFromOrder() {
    const customerId = parseInt(document.getElementById('assignDriverModal').dataset.customerId);
    const customer   = customers.find(c=>c.id===customerId);
    if (!customer) return;
    customer.assignedDriver=null;
    renderAssignedDriverTag(customer);
    renderAvailableDriversList(customer);
    document.getElementById('removeDriverBtn').style.display='none';
    updateAllDisplays();
    saveData();
    showNotification('Driver removed from order');
}

function filterDrivers(filter) {
    currentDriverFilter=filter;
    document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
    document.getElementById(`filter${filter.charAt(0).toUpperCase()+filter.slice(1)}`).classList.add('active');
    const customerId = parseInt(document.getElementById('assignDriverModal').dataset.customerId);
    const customer   = customers.find(c=>c.id===customerId);
    if (customer) renderAvailableDriversList(customer);
}

function resetDriverFilters() {
    currentDriverFilter='all';
    document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
    document.getElementById('filterAll').classList.add('active');
}

