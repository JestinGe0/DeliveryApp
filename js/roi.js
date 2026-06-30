// ========== ROI PAGE FUNCTIONS ==========

let pageROICharts = {};

function refreshROIPage() {
    refreshPageROISummary();
    refreshPageROICustomers();
    refreshPageROIZones();
    refreshPageROITrends();
    refreshPageROIProjections();
}

function refreshPageROISummary() {
    const customers = Object.values(roiData.customers || {});
    const zones = Object.values(roiData.zones || {});
    
    const totalProfit = customers.reduce((sum, c) => sum + (c.totalProfit || 0), 0);
    const avgRoi = customers.length > 0 ? customers.reduce((sum, c) => sum + (c.averageRoi || 0), 0) / customers.length : 0;
    const topCustomer = customers.sort((a, b) => b.totalProfit - a.totalProfit)[0];
    const bestZone = zones.sort((a, b) => b.averageRoi - a.averageRoi)[0];
    
    document.getElementById('pageTotalProfit').textContent = `£${totalProfit.toLocaleString()}`;
    document.getElementById('pageAvgROI').textContent = `${Math.round(avgRoi)}%`;
    document.getElementById('pageTopCustomer').textContent = topCustomer?.customerName || '-';
    document.getElementById('pageBestZone').textContent = bestZone?.zone || '-';
}

function refreshPageROICustomers() {
    const searchTerm = document.getElementById('pageCustomerSearch')?.value?.toLowerCase() || '';
    const sortBy = document.getElementById('pageCustomerSort')?.value || 'profit';
    
    let customers = Object.values(roiData.customers || []);
    
    if (searchTerm) {
        customers = customers.filter(c => c.customerName?.toLowerCase().includes(searchTerm));
    }
    
    customers.sort((a, b) => {
        switch(sortBy) {
            case 'profit': return b.totalProfit - a.totalProfit;
            case 'roi': return b.averageRoi - a.averageRoi;
            case 'revenue': return b.totalRevenue - a.totalRevenue;
            default: return b.totalProfit - a.totalProfit;
        }
    });
    
    const tbody = document.getElementById('pageCustomerRoiBody');
    if (!tbody) return;
    
    tbody.innerHTML = customers.map(c => {
        const ltv = calculateCustomerLTV(c.customerId);
        return `
            <tr>
                <td><strong>${c.customerName || 'Unknown'}</strong></td>
                <td>${c.zone || '-'}</td>
                <td><span class="tier-badge tier-${c.valueTier}">${c.valueTier}</span></td>
                <td>${c.totalOrders || 0}</td>
                <td>£${(c.totalRevenue || 0).toLocaleString()}</td>
                <td class="${c.totalProfit >= 0 ? 'profit-positive' : 'profit-negative'}">£${(c.totalProfit || 0).toLocaleString()}</td>
                <td>${Math.round(c.averageRoi || 0)}%</td>
                <td>£${ltv.toLocaleString()}</td>
            </tr>
        `;
    }).join('');
}

function refreshPageROIZones() {
    const zones = getZonePerformance();
    const grid = document.getElementById('pageZonesGrid');
    if (!grid) return;
    
    grid.innerHTML = zones.map(zone => `
        <div class="zone-card ${zone.zone?.toLowerCase().replace(/[\/\s]/g, '-') || 'local'}">
            <div class="zone-header">
                <span class="zone-name">${zone.zone}</span>
                <span class="tier-badge">${zone.customerCount} customers</span>
            </div>
            <div class="zone-stats">
                <div class="zone-stat">
                    <div class="zone-stat-value">£${Math.round(zone.totalProfit || 0).toLocaleString()}</div>
                    <div class="zone-stat-label">Total Profit</div>
                </div>
                <div class="zone-stat">
                    <div class="zone-stat-value">${zone.totalOrders}</div>
                    <div class="zone-stat-label">Orders</div>
                </div>
                <div class="zone-stat">
                    <div class="zone-stat-value">${Math.round(zone.averageRoi || 0)}%</div>
                    <div class="zone-stat-label">ROI</div>
                </div>
            </div>
            <div class="zone-roi-bar">
                <div class="zone-roi-fill" style="width: ${Math.min(100, zone.averageRoi || 0)}%"></div>
            </div>
        </div>
    `).join('');
    
    updatePageZoneChart(zones);
}

function updatePageZoneChart(zones) {
    const canvas = document.getElementById('pageZoneChart');
    if (!canvas) return;
    
    if (pageROICharts.zone) pageROICharts.zone.destroy();
    
    const ctx = canvas.getContext('2d');
    pageROICharts.zone = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: zones.map(z => z.zone),
            datasets: [
                {
                    label: 'ROI %',
                    data: zones.map(z => Math.round(z.averageRoi || 0)),
                    backgroundColor: '#10b981',
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top' } },
            scales: { y: { beginAtZero: true, title: { display: true, text: 'ROI %' } } }
        }
    });
}

function refreshPageROITrends() {
    const months = parseInt(document.getElementById('pageTrendsPeriod')?.value || '6');
    const trends = getROITrends(months);
    
    const canvas = document.getElementById('pageTrendsChart');
    if (!canvas) return;
    
    if (pageROICharts.trends) pageROICharts.trends.destroy();
    
    const ctx = canvas.getContext('2d');
    pageROICharts.trends = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trends.map(t => t.month),
            datasets: [
                {
                    label: 'Profit (£)',
                    data: trends.map(t => t.profit),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y'
                },
                {
                    label: 'ROI %',
                    data: trends.map(t => t.roi),
                    borderColor: '#f59e0b',
                    borderDash: [5, 5],
                    tension: 0.4,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top' } },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Profit (£)' } },
                y1: { position: 'right', beginAtZero: true, title: { display: true, text: 'ROI %' } }
            }
        }
    });
}

function refreshPageROIProjections() {
    const customers = Object.values(roiData.customers || []);
    
    const topLTV = customers
        .map(c => ({ ...c, ltv: calculateCustomerLTV(c.customerId) }))
        .sort((a, b) => b.ltv - a.ltv)
        .slice(0, 10);
    
    const highPotential = customers
        .filter(c => c.averageRoi > 30 && c.totalOrders < 5)
        .sort((a, b) => b.averageRoi - a.averageRoi)
        .slice(0, 10);
    
    const atRisk = customers
        .filter(c => c.totalOrders > 5 && c.averageRoi < 10)
        .sort((a, b) => a.averageRoi - b.averageRoi)
        .slice(0, 10);
    
    document.getElementById('pageTopLtvList').innerHTML = topLTV.map(c => `
        <div class="projection-item">
            <span class="projection-customer">${c.customerName}</span>
            <span class="projection-value">£${c.ltv.toLocaleString()}</span>
        </div>
    `).join('');
    
    document.getElementById('pageHighPotentialList').innerHTML = highPotential.map(c => `
        <div class="projection-item">
            <span class="projection-customer">${c.customerName}</span>
            <span class="projection-value">${Math.round(c.averageRoi)}% ROI</span>
        </div>
    `).join('');
    
    document.getElementById('pageAtRiskList').innerHTML = atRisk.map(c => `
        <div class="projection-item">
            <span class="projection-customer">${c.customerName}</span>
            <span class="projection-value">${Math.round(c.averageRoi)}% ROI</span>
        </div>
    `).join('');
    
    const recommendations = [
        '✅ Focus on high-ROI customers for repeat business',
        '📊 Review pricing strategy for low-margin zones',
        '🎯 Target high-potential customers with special offers',
        '📞 Reach out to at-risk customers to prevent churn'
    ];
    
    document.getElementById('pageRecommendations').innerHTML = `
        <h4><i class="fas fa-lightbulb"></i> Recommendations</h4>
        <ul>${recommendations.map(r => `<li><i class="fas fa-check-circle"></i> ${r}</li>`).join('')}</ul>
    `;
}

function updateCurrentTime() { var el=document.getElementById('currentTime'); if(el) el.textContent=formatTime(new Date()); }

function debugDataFlow() {
    console.log('===== DATA FLOW DEBUG =====');
    console.log('Customers:', customers.length);
    customers.filter(c=>c.assignedVan).forEach(c => console.log(`  ${c.name}: Van ${c.assignedVan}, Day ${c.assignedDay}, Status: ${c.status}`));
    console.log('Delivery plan:', JSON.stringify(deliveryPlan,null,2));
    console.log('Socket connected:', socket ? socket.connected : false);
}

// ========== ROI CALCULATION CONFIGURATION ==========

// Cost constants (adjust these based on your actual costs)
const COST_CONFIG = {
    // Labour costs
    pickerHourlyRate: 15.50,      // £ per hour for pickers
    driverHourlyRate: 18.50,       // £ per hour for drivers
    supervisorHourlyRate: 22.00,   // £ per hour for supervisors
    
    // Vehicle costs
    fuelCostPerKm: 0.45,           // £ per km
    vehicleMaintenancePerKm: 0.12,  // £ per km
    vehicleDepreciationPerKm: 0.08, // £ per km
    
    // Fixed costs
    warehouseOverheadPerOrder: 2.50, // £ per order
    packagingCostPerPlant: 0.35,     // £ per plant
    labelCostPerOrder: 0.15,         // £ per order
    
    // Revenue assumptions (adjust based on your pricing)
    averagePlantValue: 4.99,         // £ per plant - average selling price
    premiumPlantMultiplier: 1.5,      // Premium grade plants sell for 50% more
    budgetPlantMultiplier: 0.7,       // Budget grade plants sell for 30% less
    
    // Zone-specific costs (multipliers for different zones)
    zoneCostMultipliers: {
        'North West': 1.1,            // 10% higher delivery costs
        'South West': 1.05,            // 5% higher delivery costs
        'London/North East': 1.2,      // 20% higher delivery costs (congestion/traffic)
        'South East': 1.0,              // Baseline
        'Local': 0.8,                    // 20% lower delivery costs
        'Collection': 0.5                 // 50% lower costs (customer collects)
    },
    
    // Customer value tiers
    customerValueTiers: {
        'platinum': { threshold: 10000, discount: 0.15, color: '#e5e4e2' },  // 15% discount for >£10k revenue
        'gold': { threshold: 5000, discount: 0.10, color: '#ffd700' },        // 10% discount for >£5k revenue
        'silver': { threshold: 2000, discount: 0.05, color: '#c0c0c0' },      // 5% discount for >£2k revenue
        'bronze': { threshold: 500, discount: 0.02, color: '#cd7f32' },       // 2% discount for >£500 revenue
        'basic': { threshold: 0, discount: 0, color: '#9ca3af' }               // No discount
    }
};

// ROI data storage
let roiData = {
    customers: {},
    zones: {},
    monthly: {},
    yearly: {}
};

const ROI_STORAGE_KEY = 'PEP_roi_data';

// Load ROI data
function loadRoiData() {
    try {
        const saved = localStorage.getItem(ROI_STORAGE_KEY);
        if (saved) {
            roiData = JSON.parse(saved);
            console.log('✅ Loaded ROI data');
        }
    } catch (e) {
        console.error('Error loading ROI data:', e);
    }
}

// Save ROI data
function saveRoiData() {
    try {
        localStorage.setItem(ROI_STORAGE_KEY, JSON.stringify(roiData));
        
        // Send to server if connected
        if (socket && socket.connected) {
            socket.emit('update-roi-data', roiData);
        }
    } catch (error) {
        console.error('Error saving ROI data:', error);
    }
}

// Calculate ROI for a single order
function calculateOrderROI(customer, orderData) {
    if (!customer || !orderData) return null;
    
    const passport = orderData.passport || {};
    const plantCount = parseInt(passport.numberOfPlants) || 0;
    const qualityGrade = passport.qualityGrade || 'Standard';
    const zone = customer.zone || 'Local';
    const distance = customer.roadDistanceFromSite || 0;
    const pickingDuration = orderData.pickingMetrics?.pickingDuration || 0;
    const numberOfPickers = orderData.pickingMetrics?.numberOfPickers || 1;
    const driverTime = orderData.deliveryDuration || 30; // Default 30 mins if not tracked
    
    // Calculate revenue
    let plantValue = COST_CONFIG.averagePlantValue;
    if (qualityGrade === 'Premium') plantValue *= COST_CONFIG.premiumPlantMultiplier;
    if (qualityGrade === 'Budget') plantValue *= COST_CONFIG.budgetPlantMultiplier;
    
    const revenue = plantCount * plantValue;
    
    // Calculate costs
    const pickingCost = (pickingDuration / 60) * COST_CONFIG.pickerHourlyRate * numberOfPickers;
    const drivingCost = distance * (COST_CONFIG.fuelCostPerKm + COST_CONFIG.vehicleMaintenancePerKm + COST_CONFIG.vehicleDepreciationPerKm);
    const driverCost = (driverTime / 60) * COST_CONFIG.driverHourlyRate;
    const warehouseOverhead = COST_CONFIG.warehouseOverheadPerOrder;
    const packagingCost = plantCount * COST_CONFIG.packagingCostPerPlant;
    const labelCost = COST_CONFIG.labelCostPerOrder;
    
    // Zone cost multiplier
    const zoneMultiplier = COST_CONFIG.zoneCostMultipliers[zone] || 1.0;
    const totalCost = (pickingCost + drivingCost + driverCost + warehouseOverhead + packagingCost + labelCost) * zoneMultiplier;
    
    // Calculate profit and ROI
    const profit = revenue - totalCost;
    const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;
    
    return {
        orderId: orderData.id,
        orderNumber: passport.orderNumber || `ORD-${orderData.id}`,
        date: passport.orderDate || orderData.createdAt,
        
        revenue: Math.round(revenue * 100) / 100,
        costs: {
            picking: Math.round(pickingCost * 100) / 100,
            driving: Math.round(drivingCost * 100) / 100,
            driver: Math.round(driverCost * 100) / 100,
            warehouse: warehouseOverhead,
            packaging: Math.round(packagingCost * 100) / 100,
            labels: labelCost,
            total: Math.round(totalCost * 100) / 100
        },
        profit: Math.round(profit * 100) / 100,
        roi: Math.round(roi * 10) / 10,
        
        metrics: {
            plantCount,
            distance,
            pickingDuration,
            numberOfPickers,
            zoneMultiplier
        }
    };
}

// Update customer ROI data
function updateCustomerROI(customer, orderData) {
    const roi = calculateOrderROI(customer, orderData);
    if (!roi) return;
    
    const customerId = customer.id;
    
    // Initialize customer data if not exists
    if (!roiData.customers[customerId]) {
        roiData.customers[customerId] = {
            customerId,
            customerName: customer.name,
            zone: customer.zone,
            firstOrder: roi.date,
            lastOrder: roi.date,
            totalOrders: 0,
            totalRevenue: 0,
            totalCost: 0,
            totalProfit: 0,
            averageRoi: 0,
            orders: [],
            plantCount: 0,
            averageOrderValue: 0,
            customerSince: new Date().toISOString(),
            valueTier: 'basic'
        };
    }
    
    const cust = roiData.customers[customerId];
    
    // Update customer data
    cust.totalOrders++;
    cust.totalRevenue += roi.revenue;
    cust.totalCost += roi.costs.total;
    cust.totalProfit += roi.profit;
    cust.plantCount += roi.metrics.plantCount;
    cust.averageRoi = (cust.totalProfit / cust.totalCost) * 100;
    cust.averageOrderValue = cust.totalRevenue / cust.totalOrders;
    cust.lastOrder = roi.date;
    
    // Store order in history (keep last 50 orders)
    cust.orders.unshift({
        orderNumber: roi.orderNumber,
        date: roi.date,
        revenue: roi.revenue,
        profit: roi.profit,
        roi: roi.roi,
        plantCount: roi.metrics.plantCount
    });
    
    if (cust.orders.length > 50) cust.orders.pop();
    
    // Determine value tier
    cust.valueTier = 'basic';
    for (const [tier, config] of Object.entries(COST_CONFIG.customerValueTiers)) {
        if (cust.totalRevenue >= config.threshold) {
            cust.valueTier = tier;
        }
    }
    
    // Update zone data
    updateZoneROI(customer.zone, roi);
    
    // Update monthly data
    updateMonthlyROI(roi.date, roi);
    
    saveRoiData();
}

// Update zone ROI data
function updateZoneROI(zone, roi) {
    if (!roiData.zones[zone]) {
        roiData.zones[zone] = {
            zone,
            totalOrders: 0,
            totalRevenue: 0,
            totalCost: 0,
            totalProfit: 0,
            averageRoi: 0,
            customerCount: 0,
            uniqueCustomers: new Set()
        };
    }
    
    const zoneData = roiData.zones[zone];
    zoneData.totalOrders++;
    zoneData.totalRevenue += roi.revenue;
    zoneData.totalCost += roi.costs.total;
    zoneData.totalProfit += roi.profit;
    zoneData.averageRoi = (zoneData.totalProfit / zoneData.totalCost) * 100;
    
    // Track unique customers (convert Set to array for storage)
    if (!zoneData.uniqueCustomers) zoneData.uniqueCustomers = new Set();
    zoneData.uniqueCustomers.add(roi.customerId);
    zoneData.customerCount = zoneData.uniqueCustomers.size;
}

// Update monthly ROI data
function updateMonthlyROI(dateStr, roi) {
    const date = new Date(dateStr);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!roiData.monthly[monthKey]) {
        roiData.monthly[monthKey] = {
            month: monthKey,
            totalOrders: 0,
            totalRevenue: 0,
            totalCost: 0,
            totalProfit: 0,
            averageRoi: 0,
            topCustomers: []
        };
    }
    
    const monthData = roiData.monthly[monthKey];
    monthData.totalOrders++;
    monthData.totalRevenue += roi.revenue;
    monthData.totalCost += roi.costs.total;
    monthData.totalProfit += roi.profit;
    monthData.averageRoi = (monthData.totalProfit / monthData.totalCost) * 100;
}

// Get customer ROI summary
function getCustomerROISummary(customerId) {
    return roiData.customers[customerId] || null;
}

// Get zone ROI summary
function getZoneROISummary(zone) {
    return roiData.zones[zone] || null;
}

// Get top customers by ROI
function getTopCustomersByROI(limit = 10) {
    return Object.values(roiData.customers)
        .sort((a, b) => b.averageRoi - a.averageRoi)
        .slice(0, limit);
}

// Get top customers by profit
function getTopCustomersByProfit(limit = 10) {
    return Object.values(roiData.customers)
        .sort((a, b) => b.totalProfit - a.totalProfit)
        .slice(0, limit);
}

// Get zone performance comparison
function getZonePerformance() {
    return Object.values(roiData.zones)
        .map(zone => ({
            ...zone,
            profitPerOrder: zone.totalProfit / zone.totalOrders,
            revenuePerOrder: zone.totalRevenue / zone.totalOrders
        }))
        .sort((a, b) => b.averageRoi - a.averageRoi);
}

// Calculate customer lifetime value (CLV)
function calculateCustomerLTV(customerId) {
    const cust = roiData.customers[customerId];
    if (!cust) return 0;
    
    const daysSinceFirst = (new Date() - new Date(cust.firstOrder)) / (1000 * 60 * 60 * 24);
    const monthsActive = Math.max(1, daysSinceFirst / 30);
    
    const avgMonthlyProfit = cust.totalProfit / monthsActive;
    const projectedAnnualProfit = avgMonthlyProfit * 12;
    
    // Simple CLV: annual profit * 3 years
    return Math.round(projectedAnnualProfit * 3 * 100) / 100;
}

// Get ROI trends
function getROITrends(months = 6) {
    const trends = [];
    const now = new Date();
    
    for (let i = months - 1; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        const monthData = roiData.monthly[monthKey] || {
            month: monthKey,
            totalOrders: 0,
            totalRevenue: 0,
            totalCost: 0,
            totalProfit: 0,
            averageRoi: 0
        };
        
        trends.push({
            month: date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
            orders: monthData.totalOrders,
            revenue: monthData.totalRevenue,
            profit: monthData.totalProfit,
            roi: monthData.averageRoi
        });
    }
    
    return trends;
}

// ========== ROI UI FUNCTIONS ==========

let roiCharts = {};

