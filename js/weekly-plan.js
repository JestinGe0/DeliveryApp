// ========== WEEKLY PLAN ==========
function updateWeeklyPlanTable() {
    const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

    // Show/hide columns based on ACTIVE_DAYS setting
    // ACTIVE_DAYS contains day IDs (1=Mon, 2=Tue, ... 7=Sun)
    const activeDayIds = (typeof ACTIVE_DAYS !== 'undefined' && ACTIVE_DAYS.length)
        ? ACTIVE_DAYS
        : [1, 2, 3, 4, 5, 6, 7];

    days.forEach((day, index) => {
        const dayId = index + 1; // Monday = 1
        const isActive = activeDayIds.includes(dayId);

        // Toggle column cell visibility
        const col = document.getElementById(day.toLowerCase() + '-col');
        if (col) {
            col.style.display = isActive ? '' : 'none';
        }

        // Toggle header cell visibility
        const table = document.querySelector('.plan-table thead tr');
        if (table) {
            const th = table.children[index];
            if (th) th.style.display = isActive ? '' : 'none';
        }

        // Toggle timeline strip day
        const timelineDay = document.querySelector(`.timeline-day[data-day="${day.toLowerCase()}"]`);
        if (timelineDay) timelineDay.style.display = isActive ? '' : 'none';
    });

    days.forEach(day => {
        const col = document.getElementById(day.toLowerCase() + '-col');
        if (!col) return;
        col.innerHTML = '';

        // Include both delivery customers AND collection customers with assigned days
        const dayCustomers = customers.filter(c => {
            // Delivery customers with van assignment
            if (c.assignedVan && c.assignedDay && getDayName(c.assignedDay) === day) return true;
            
            // Collection customers with assigned day (regardless of van assignment)
            if (c.zone === 'Collection' && c.assignedDay && getDayName(c.assignedDay) === day) return true;
            
            return false;
        });

        dayCustomers.forEach(customer => {
            const van = customer.assignedVan ? VANS.find(v => v.id === customer.assignedVan) : null;
            const staffList = (customer.assignedStaff||[]).map(id => staffMembers.find(s => s.id === id)).filter(Boolean);
            const driver = customer.assignedDriver ? staffMembers.find(s => s.id === customer.assignedDriver) : null;

            let bgColor = '', textColor = '', blinkClass = '';
            
            // Different styling for collection vs delivery
            if (customer.zone === 'Collection') {
                bgColor = ZONES.Collection.color; // Purple
                textColor = 'white';
            } else {
                switch (customer.status) {
                    case ORDER_STATUSES.PENDING:            bgColor='#b71c1c'; textColor='white'; if (!staffList.length) blinkClass='blinking-dark-red'; break;
                    case ORDER_STATUSES.PICKING:            bgColor='#ffc107'; textColor='#333'; break;
                    case ORDER_STATUSES.READY_FOR_DELIVERY: bgColor='#f57c00'; textColor='white'; break;
                    case ORDER_STATUSES.DELIVERING:         bgColor='#2e7d32'; textColor='white'; break;
                    case ORDER_STATUSES.DELIVERED:          bgColor='#9e9e9e'; textColor='white'; break;
                    case ORDER_STATUSES.CANCELLED:          bgColor='#d32f2f'; textColor='white'; break;
                    case ORDER_STATUSES.COLLECTED:          bgColor='#ffffff'; textColor='#333'; break;
                }
            }

            const card = document.createElement('div');
            card.className = `weekly-order-card ${customer.zone.toLowerCase().replace(/[\/\s]/g,'-')} ${blinkClass}`;
            card.setAttribute('data-customer-id', customer.id);
            card.setAttribute('data-day', day);
            card.style.backgroundColor = bgColor;
            card.style.color = textColor;
            
            const key        = `${customer.id}_${day}`;
            const isExpanded = cardExpandedStates.weeklyPlan[key] || false;
            card.setAttribute('data-expanded', isExpanded);

            const overlayBg = textColor==='white' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)';

            const passportHTML = getWeeklyPassportDisplayHTML(customer);

            // Add collection badge for collection orders
            const typeBadge = customer.zone === 'Collection' 
                ? '<span class="weekly-collection-badge" style="background:rgba(255,255,255,0.3); padding:2px 8px; border-radius:12px; margin-left:8px; font-size:10px;"><i class="fas fa-boxes"></i> Collection</span>'
                : '';

            card.innerHTML = `
                <div class="weekly-collapsed-view" style="${isExpanded?'display:none':'display:block'}">
                    <div class="weekly-collapsed-content">
                        <span class="weekly-customer-name-collapsed" style="color:${textColor}"><i class="fas fa-chevron-${isExpanded?'up':'down'} weekly-expand-icon-inline" style="color:${textColor};opacity:0.7;font-size:11px;margin-right:4px;"></i>${customer.name} ${typeBadge}</span>
                        <span class="weekly-status-badge-collapsed" style="background:${getStatusBadgeColor(customer.status)};color:${customer.status===ORDER_STATUSES.PICKING?'#333':'white'}">${getStatusText(customer.status)}</span>
                        ${customer.zone !== 'Collection' ?
                            `<span class="weekly-van-collapsed" style="color:${van?van.color:'#2563eb'};background:white;padding:2px 8px;border-radius:4px;font-weight:bold;">
                                <i class="fas fa-truck"></i> ${van?van.name:'Unassigned'}
                            </span>` :
                            `<span class="weekly-collection-indicator" style="background:white;color:${ZONES.Collection.color};padding:2px 8px;border-radius:4px;font-weight:bold;">
                                <i class="fas fa-boxes"></i> Collection
                            </span>`
                        }
                    </div>
                </div>
                <div class="weekly-expanded-view" style="${isExpanded?'display:block':'display:none'}">
                    <div style="font-family:var(--font-display);font-size:18px;font-weight:800;color:${textColor};padding:10px 0 4px;letter-spacing:-0.2px;">${customer.name}</div>
                    <div style="margin-bottom:8px;font-size:0.8rem;color:${textColor==='white'?'rgba(255,255,255,0.8)':'#666'}">
                        <i class="far fa-clock"></i> ${formatTime(new Date())}
                        ${customer.zone === 'Collection' ? 
                            ` | <i class="fas fa-boxes"></i> Collection Order` : 
                            ` | <i class="fas fa-truck"></i> Delivery Order`
                        }
                    </div>
                    <div class="weekly-address" style="color:${textColor};margin-bottom:10px;font-size:0.9rem;">
                        <i class="fas fa-map-marker-alt"></i> ${customer.address}
                    </div>
                    ${passportHTML}
                    
                    ${customer.zone === 'Collection' && customer.assignedDay ? 
                        `<div style="background:${overlayBg};color:${textColor};padding:4px 8px;border-radius:4px;margin-bottom:5px;font-size:0.85rem;">
                            <i class="fas fa-calendar-check"></i> Scheduled Collection: ${getDayName(customer.assignedDay)}
                        </div>` : ''
                    }
                    
                    ${driver ? `<div style="background:${overlayBg};color:${textColor};padding:4px 8px;border-radius:4px;margin-bottom:5px;font-size:0.85rem;"><i class="fas fa-truck"></i> Driver: ${driver.name} (${driver.license||'No license'})</div>` : ''}
                    
                    ${!driver && customer.status===ORDER_STATUSES.READY_FOR_DELIVERY && customer.zone !== 'Collection' ? 
                        `<div style="background:${overlayBg};color:${textColor};padding:4px 8px;border-radius:4px;margin-bottom:5px;font-size:0.85rem;font-weight:bold;">
                            <i class="fas fa-exclamation-triangle"></i> NEEDS DRIVER
                        </div>` : ''
                    }
                    
                    ${staffList.length ? 
                        `<div style="background:${overlayBg};color:${textColor};padding:4px 8px;border-radius:4px;margin-bottom:5px;font-size:0.85rem;">
                            <i class="fas fa-users"></i> ${staffList.map(s=>s.name).join(', ')}
                        </div>` : ''
                    }
                    
                    ${!staffList.length && customer.status===ORDER_STATUSES.PENDING && customer.zone !== 'Collection' ? 
                        `<div style="background:${overlayBg};color:${textColor};padding:4px 8px;border-radius:4px;margin-bottom:5px;font-size:0.85rem;font-weight:bold;">
                            <i class="fas fa-exclamation-triangle"></i> NO PICKER ASSIGNED
                        </div>` : ''
                    }
                    
                    <div class="weekly-actions">
                        ${customer.zone === 'Collection' ?
                            `<button style="background:${ZONES.Collection.color};color:white;border:none;padding:4px 8px;border-radius:4px;font-size:0.75rem;cursor:pointer;" onclick="event.stopPropagation();openCollectionDaySelector(${customer.id})">
                                <i class="fas fa-calendar-alt"></i> Reschedule
                            </button>` :
                            `<button style="background:#a855f7;color:white;border:none;padding:4px 8px;border-radius:4px;font-size:0.75rem;cursor:pointer;" onclick="event.stopPropagation();assignToCollection(${customer.id})">
                                <i class="fas fa-boxes"></i> Collection
                            </button>`
                        }
                        <button style="background:#ec4899;color:white;border:none;padding:4px 8px;border-radius:4px;font-size:0.75rem;cursor:pointer;" onclick="event.stopPropagation();openAssignStaffModal(${customer.id})">
                            <i class="fas fa-users"></i> Pickers
                        </button>
                        <button style="background:#f59e0b;color:white;border:none;padding:4px 8px;border-radius:4px;font-size:0.75rem;cursor:pointer;" onclick="event.stopPropagation();openAssignDriverModal(${customer.id})">
                            <i class="fas fa-truck"></i> Driver
                        </button>
                        <button style="background:#3b82f6;color:white;border:none;padding:4px 8px;border-radius:4px;font-size:0.75rem;cursor:pointer;" onclick="event.stopPropagation();showStatusUpdateModal(customers.find(c=>c.id===${customer.id}))">
                            <i class="fas fa-edit"></i> Update
                        </button>
                        ${customer.status === ORDER_STATUSES.DELIVERED || customer.status === ORDER_STATUSES.COLLECTED || customer.status === ORDER_STATUSES.CANCELLED ? 
                            `<button style="background:#dc3545;color:white;border:none;padding:4px 8px;border-radius:4px;font-size:0.75rem;cursor:pointer;" onclick="event.stopPropagation();promptClearOrderData(${customer.id})">
                                <i class="fas fa-broom"></i> Clear Data
                            </button>` : ''
                        }
                    </div>
                </div>`;

            card.addEventListener('click', function (e) {
                if (e.target.tagName==='BUTTON' || e.target.closest('button')) return;
                toggleWeeklyCard(this);
            });
            col.appendChild(card);
        });

        const totalDiv = document.createElement('div');
        
        // Count total orders (delivery + collection) for this day
        const deliveryCount = dayCustomers.filter(c => c.zone !== 'Collection').length;
        const collectionCount = dayCustomers.filter(c => c.zone === 'Collection').length;
        
        if (dayCustomers.length) {
            totalDiv.className = 'day-total';
            let totalText = `<strong>Total: ${dayCustomers.length}</strong>`;
            if (collectionCount > 0) {
                totalText += `<br><span style="font-size:11px;">📦 ${collectionCount} collection · 🚚 ${deliveryCount} delivery</span>`;
            }
            totalDiv.innerHTML = totalText;
        } else {
            totalDiv.style.cssText = 'text-align:center;color:#999;padding:20px;';
            totalDiv.innerHTML = '<i class="far fa-calendar-times"></i> No orders';
        }
        col.appendChild(totalDiv);

        // Update the column header with the order count
        const hdr = document.getElementById(day.toLowerCase() + '-hdr');
        if (hdr) {
            hdr.textContent = dayCustomers.length > 0
                ? `${day} (${dayCustomers.length})`
                : day;
        }
    });
}

function updateCollectionStats() {
    const collectionHeader = document.querySelector('.zone-header.collection');
    if (collectionHeader) {
        // Remove existing stats element if present
        const existingStats = collectionHeader.querySelector('.collection-stats');
        if (existingStats) {
            existingStats.remove();
        }
        
        // Count active collection orders (with passport data)
        const activeCollections = customers.filter(c => 
            c.zone === 'Collection' && 
            c.passport && (
                c.passport.orderNumber || 
                c.passport.plantVariety || 
                c.passport.numberOfPlants
            )
        );
        
        const scheduled = activeCollections.filter(c => c.assignedDay).length;
        const unscheduled = activeCollections.filter(c => !c.assignedDay).length;
        
        // Only show stats if there are active collections
        if (activeCollections.length > 0) {
            const statsEl = document.createElement('span');
            statsEl.className = 'collection-stats';
            statsEl.style.cssText = 'font-size:11px; margin-left:10px; opacity:0.8;';
            statsEl.innerHTML = `📅 ${scheduled} scheduled · ⏳ ${unscheduled} unscheduled`;
            collectionHeader.appendChild(statsEl);
        }
    }
}
// Then call it after updating orders grid
// Find the updateOrdersGrid function and add this line at the end:
// setTimeout(updateCollectionStats, 100);

