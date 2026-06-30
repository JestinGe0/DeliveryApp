// ========== ANALYTICS STORAGE ==========
// This will store permanent analytics data that persists even after order is cleared
let analyticsHistory = [];

const ANALYTICS_STORAGE_KEY = 'PEP_analytics_history';

// Load analytics history from localStorage
function loadAnalyticsHistory() {
    try {
        const saved = localStorage.getItem(ANALYTICS_STORAGE_KEY);
        if (saved) {
            analyticsHistory = JSON.parse(saved);
            console.log(`Loaded ${analyticsHistory.length} analytics records from history`);
        }
    } catch (e) {
        console.error('Error loading analytics history:', e);
        analyticsHistory = [];
    }
}

// Save analytics history to localStorage and server
function saveAnalyticsHistory() {
    try {
        localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(analyticsHistory));
        
        // Send to server if connected
        if (socket && socket.connected) {
            socket.emit('update-analytics-history', analyticsHistory);
        }
    } catch (error) {
        console.error('Error saving analytics history:', error);
    }
}

// Add analytics record to history - FIXED VERSION (no duplicates)
function addAnalyticsRecord(customer) {
    if (!customer) {
        console.log('No customer provided to addAnalyticsRecord');
        return;
    }
    
    console.log('Adding analytics record for customer:', customer.id, customer.name);
    
    // Ensure passport exists
    if (!customer.passport) {
        console.log('Customer has no passport, skipping analytics');
        return;
    }
    
    const passport = customer.passport;
    const plantCount = parseInt(passport.numberOfPlants) || 0;
    const pickingDuration = passport.pickingMetrics?.pickingDuration || 0;
    const timeToFirst = passport.pickingMetrics?.timeToFirstPicker || 0;
    
    // Get picker names from assigned staff
    const pickerNames = [];
    if (customer.assignedStaff && customer.assignedStaff.length > 0) {
        customer.assignedStaff.forEach(staffId => {
            const staff = staffMembers.find(s => s.id === staffId);
            if (staff && staff.name) {
                pickerNames.push(staff.name);
            }
        });
    }
    
    // Also check passport pickerNames
    if (passport.pickingMetrics?.pickerNames && passport.pickingMetrics.pickerNames.length > 0) {
        passport.pickingMetrics.pickerNames.forEach(name => {
            if (!pickerNames.includes(name)) {
                pickerNames.push(name);
            }
        });
    }
    
    console.log('Picker names found:', pickerNames);
    
    // Only record if we have meaningful data
    if (plantCount > 0 || pickingDuration > 0 || timeToFirst > 0) {
        const record = {
            id: Date.now() + Math.random(), // Unique ID
            customerId: customer.id,
            customerName: customer.name || 'Unknown',
            orderNumber: passport.orderNumber || `ORD-${customer.id}`,
            plantCount: plantCount,
            potSize: passport.potSize || '',
            plantVariety: passport.plantVariety || '',
            qualityGrade: passport.qualityGrade || '',
            flowerStage: passport.flowerStage || '',
            
            // Timestamps
            orderCreated: passport.timestamps?.orderCreated,
            firstPickerAssigned: passport.timestamps?.firstPickerAssigned,
            pickingStarted: passport.timestamps?.pickingStarted,
            pickingCompleted: passport.timestamps?.pickingCompleted,
            readyForDelivery: passport.timestamps?.readyForDelivery,
            deliveredAt: passport.timestamps?.deliveredAt,
            
            // Metrics
            timeToFirstPicker: timeToFirst,
            pickingDuration: pickingDuration,
            numberOfPickers: pickerNames.length || passport.pickingMetrics?.numberOfPickers || 0,
            pickerNames: pickerNames,
            plantsPerHour: passport.pickingMetrics?.plantsPerHour || 0,
            efficiencyScore: passport.pickingMetrics?.efficiencyScore || 0,
            
            // Picker performance breakdown
            plantsPerPicker: passport.pickingMetrics?.plantsPerPicker || {},
            
            // Metadata
            recordedAt: new Date().toISOString(),
            status: customer.status,
            
            // Add a unique key for deduplication
            uniqueOrderKey: `${customer.id}_${passport.orderNumber || `ORD-${customer.id}`}`
        };
        
        // Check if we already have a record for this order (using unique key)
        const existingIndex = analyticsHistory.findIndex(r => 
            r.uniqueOrderKey === record.uniqueOrderKey
        );
        
        if (existingIndex >= 0) {
            // Get the existing record
            const existing = analyticsHistory[existingIndex];
            
            // Only update if this record has more complete data (e.g., delivered status is more complete than delivering)
            const isMoreComplete = (
                (record.status === ORDER_STATUSES.DELIVERED && existing.status !== ORDER_STATUSES.DELIVERED) ||
                (record.status === ORDER_STATUSES.COLLECTED && existing.status !== ORDER_STATUSES.COLLECTED) ||
                (record.status === ORDER_STATUSES.READY_FOR_DELIVERY && existing.status === ORDER_STATUSES.PICKING) ||
                (record.pickingDuration > 0 && existing.pickingDuration === 0) ||
                (record.efficiencyScore > 0 && existing.efficiencyScore === 0)
            );
            
            if (isMoreComplete) {
                // Update existing record with more complete data
                // Prefer non-zero metric values so a later snapshot with zeros
                // doesn't wipe out metrics that were computed earlier
                analyticsHistory[existingIndex] = {
                    ...existing,
                    ...record,
                    // Always keep best (non-zero) metric values
                    timeToFirstPicker: record.timeToFirstPicker || existing.timeToFirstPicker,
                    pickingDuration:   record.pickingDuration   || existing.pickingDuration,
                    plantsPerHour:     record.plantsPerHour     || existing.plantsPerHour,
                    efficiencyScore:   record.efficiencyScore   || existing.efficiencyScore,
                    plantCount:        record.plantCount        || existing.plantCount,
                    // Keep richest pickerNames array
                    pickerNames: (record.pickerNames && record.pickerNames.length > 0)
                        ? record.pickerNames
                        : existing.pickerNames,
                    // Keep best timestamps (prefer non-empty)
                    orderCreated:        record.orderCreated        || existing.orderCreated,
                    firstPickerAssigned: record.firstPickerAssigned || existing.firstPickerAssigned,
                    pickingStarted:      record.pickingStarted      || existing.pickingStarted,
                    pickingCompleted:    record.pickingCompleted     || existing.pickingCompleted,
                    readyForDelivery:    record.readyForDelivery     || existing.readyForDelivery,
                    deliveredAt:         record.deliveredAt          || existing.deliveredAt,
                    // Preserve the original recordedAt for the first record
                    recordedAt: existing.recordedAt,
                    lastUpdated: record.recordedAt
                };
                console.log(`Updated analytics record for order ${record.orderNumber} with more complete data`);
            } else {
                console.log(`Skipping duplicate record for order ${record.orderNumber} (existing has ${existing.status}, new has ${record.status})`);
            }
        } else {
            // Add new record
            analyticsHistory.push(record);
            console.log(`Added new analytics record for order ${record.orderNumber}`);
        }
        
        saveAnalyticsHistory();
    } else {
        console.log('No meaningful data to record for customer:', customer.id);
    }
}


// ========== ANALYTICS DASHBOARD FUNCTIONS ==========
let pickingTimesChart = null;
let efficiencyChart = null;
let productivityChart = null;

// Global filter state
let analyticsFilters = {
    startDate: null,
    endDate: null,
    filterType: 'all',
    customerSearch: '',
    selectedCustomer: 'all'
};

// Get analytics records filtered by date range - WITH DEDUPLICATION
function getAnalyticsRecords(startDate, endDate) {
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);
    
    // Filter by date
    const dateFiltered = analyticsHistory.filter(record => {
        const recordDate = new Date(record.recordedAt || record.orderCreated || record.readyForDelivery || 0);
        if (isNaN(recordDate.getTime())) return false;
        return recordDate >= start && recordDate <= end;
    });
    
    // Deduplicate by uniqueOrderKey, keeping the most complete record for each order
    const uniqueRecords = {};
    dateFiltered.forEach(record => {
        const key = record.uniqueOrderKey || `${record.customerId}_${record.orderNumber}`;
        
        if (!uniqueRecords[key]) {
            uniqueRecords[key] = record;
        } else {
            const existing = uniqueRecords[key];
            
            const score = r => (
                (r.status === ORDER_STATUSES.DELIVERED  ? 10 : 0) +
                (r.status === ORDER_STATUSES.COLLECTED  ? 10 : 0) +
                (r.pickingDuration  > 0 ? 5 : 0) +
                (r.efficiencyScore  > 0 ? 5 : 0) +
                (r.plantsPerHour    > 0 ? 5 : 0) +
                (r.pickerNames.length > 0 ? 3 : 0)
            );
            
            if (score(record) > score(existing)) {
                uniqueRecords[key] = record;
            }
        }
    });
    
    return Object.values(uniqueRecords);
}

// Helper function to calculate analytics from history
function calculateAnalyticsFromHistory(startDate, endDate) {
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);
    
    // Filter records by date
    const filteredRecords = analyticsHistory.filter(record => {
        const recordDate = new Date(record.recordedAt || record.orderCreated || 0);
        return recordDate >= start && recordDate <= end;
    });
    
    // Calculate metrics
    let totalTimeToFirst = 0;
    let totalPickingDuration = 0;
    let totalPlants = 0;
    let ordersWithFirstPicker = 0;
    let ordersWithDuration = 0;
    let ordersWithPlants = 0;
    let efficiencyScores = [];
    
    const efficiencyDistribution = {
        excellent: 0,
        good: 0,
        average: 0,
        poor: 0
    };
    
    const productivityByRange = {
        '1-10': { count: 0, totalTime: 0, totalPlants: 0 },
        '11-25': { count: 0, totalTime: 0, totalPlants: 0 },
        '26-50': { count: 0, totalTime: 0, totalPlants: 0 },
        '51-100': { count: 0, totalTime: 0, totalPlants: 0 },
        '100+': { count: 0, totalTime: 0, totalPlants: 0 }
    };
    
    const pickerStats = {};
    
    filteredRecords.forEach(record => {
        const plantCount = record.plantCount || 0;
        
        if (plantCount > 0) {
            totalPlants += plantCount;
            ordersWithPlants++;
        }
        
        if (record.timeToFirstPicker > 0) {
            totalTimeToFirst += record.timeToFirstPicker;
            ordersWithFirstPicker++;
            
            // Track picker stats
            if (record.pickerNames) {
                record.pickerNames.forEach(name => {
                    if (!pickerStats[name]) {
                        pickerStats[name] = {
                            orders: 0,
                            totalPlants: 0,
                            totalDuration: 0
                        };
                    }
                    pickerStats[name].orders++;
                    pickerStats[name].totalPlants += plantCount;
                });
            }
        }
        
        if (record.pickingDuration > 0) {
            totalPickingDuration += record.pickingDuration;
            ordersWithDuration++;
            
            if (record.pickerNames) {
                record.pickerNames.forEach(name => {
                    if (pickerStats[name]) {
                        pickerStats[name].totalDuration += record.pickingDuration;
                    }
                });
            }
            
            // Track by plant range
            let range = '100+';
            if (plantCount <= 10) range = '1-10';
            else if (plantCount <= 25) range = '11-25';
            else if (plantCount <= 50) range = '26-50';
            else if (plantCount <= 100) range = '51-100';
            
            productivityByRange[range].count++;
            productivityByRange[range].totalTime += record.pickingDuration;
            productivityByRange[range].totalPlants += plantCount;
        }
        
        if (record.efficiencyScore > 0) {
            efficiencyScores.push(record.efficiencyScore);
            
            if (record.efficiencyScore >= 90) efficiencyDistribution.excellent++;
            else if (record.efficiencyScore >= 70) efficiencyDistribution.good++;
            else if (record.efficiencyScore >= 50) efficiencyDistribution.average++;
            else efficiencyDistribution.poor++;
        }
    });
    
    const avgTimeToFirstPicker = ordersWithFirstPicker > 0 ? Math.round(totalTimeToFirst / ordersWithFirstPicker) : 0;
    const avgPickingDuration = ordersWithDuration > 0 ? Math.round(totalPickingDuration / ordersWithDuration) : 0;
    const avgPlantsPerOrder = ordersWithPlants > 0 ? Math.round(totalPlants / ordersWithPlants) : 0;
    const avgEfficiencyScore = efficiencyScores.length > 0 ? Math.round(efficiencyScores.reduce((a, b) => a + b, 0) / efficiencyScores.length) : 0;
    
    // Build productivity data
    const productivityData = [];
    for (const [range, data] of Object.entries(productivityByRange)) {
        if (data.count > 0) {
            productivityData.push({
                range,
                orderCount: data.count,
                totalPlants: data.totalPlants,
                avgTimePerOrder: Math.round(data.totalTime / data.count),
                avgPlantsPerOrder: Math.round(data.totalPlants / data.count),
                plantsPerHour: data.totalTime > 0 ? Math.round((data.totalPlants / data.totalTime) * 60) : 0
            });
        }
    }
    
    // Build picker performance
    const pickerPerformance = [];
    for (const [name, stats] of Object.entries(pickerStats)) {
        pickerPerformance.push({
            name,
            orders: stats.orders,
            totalPlants: stats.totalPlants,
            plantsPerHour: stats.totalDuration > 0 ? Math.round((stats.totalPlants / stats.totalDuration) * 60) : 0,
            avgTimeToFirst: 0, // Not tracked per picker in history
            avgDuration: stats.totalDuration > 0 ? Math.round(stats.totalDuration / stats.orders) : 0,
            efficiency: avgPickingDuration > 0 && stats.totalDuration > 0 ? 
                Math.min(100, Math.round((avgPickingDuration / (stats.totalDuration / stats.orders)) * 100)) : 100
        });
    }
    
    return {
        summary: {
            avgTimeToFirstPicker,
            avgPickingDuration,
            avgPlantsPerOrder,
            avgEfficiencyScore,
            completedOrders: filteredRecords.length,
            totalPlantsPicked: totalPlants
        },
        records: filteredRecords,
        efficiencyDistribution,
        productivityData,
        pickerPerformance
    };
}
// Add this function to properly display analytics from history
function displayAnalyticsFromHistory() {
    const startDate = document.getElementById('analyticsStartDate')?.value;
    const endDate = document.getElementById('analyticsEndDate')?.value;
    
    // Get data from analyticsHistory
    const data = calculateAnalyticsFromHistory(startDate, endDate);
    
    // Update summary cards
    document.getElementById('avgTimeToFirstPicker').textContent = `${data.summary.avgTimeToFirstPicker} min`;
    document.getElementById('avgPickingDuration').textContent = `${data.summary.avgPickingDuration} min`;
    document.getElementById('avgPlantsPerOrder').textContent = data.summary.avgPlantsPerOrder;
    
    // Update charts with the correct IDs from your screenshot
    updatePickingTimesChart(data.records);
    updateEfficiencyChart(data.efficiencyDistribution);
    updateProductivityChart(data.productivityData);
    
    console.log('Analytics displayed:', data.summary);
}
// Clean up duplicate records in analytics history
function cleanupAnalyticsDuplicates() {
    console.log('Cleaning up duplicate analytics records. Before:', analyticsHistory.length);
    
    const uniqueMap = {};
    
    analyticsHistory.forEach(record => {
        const key = record.uniqueOrderKey || `${record.customerId}_${record.orderNumber}`;
        
        if (!uniqueMap[key]) {
            uniqueMap[key] = record;
        } else {
            // Keep the record with more complete data
            const existing = uniqueMap[key];
            
            const existingScore = (
                (existing.status === ORDER_STATUSES.DELIVERED ? 10 : 0) +
                (existing.status === ORDER_STATUSES.COLLECTED ? 10 : 0) +
                (existing.pickingDuration > 0 ? 5 : 0) +
                (existing.efficiencyScore > 0 ? 5 : 0) +
                (existing.plantsPerHour > 0 ? 5 : 0)
            );
            
            const newScore = (
                (record.status === ORDER_STATUSES.DELIVERED ? 10 : 0) +
                (record.status === ORDER_STATUSES.COLLECTED ? 10 : 0) +
                (record.pickingDuration > 0 ? 5 : 0) +
                (record.efficiencyScore > 0 ? 5 : 0) +
                (record.plantsPerHour > 0 ? 5 : 0)
            );
            
            if (newScore > existingScore) {
                uniqueMap[key] = record;
            }
        }
    });
    
    analyticsHistory = Object.values(uniqueMap);
    saveAnalyticsHistory();
    
    console.log('After cleanup:', analyticsHistory.length);
    showNotification(`Cleaned up duplicates. Now have ${analyticsHistory.length} unique records`, 'success');
}

// Get all analytics records (no deduplication - we want each order separately)
function getAllAnalyticsRecords() {
    return analyticsHistory.map(record => ({
        ...record,
        // Ensure all fields have defaults
        customerName: record.customerName || 'Unknown',
        orderNumber: record.orderNumber || `ORD-${record.customerId}`,
        plantCount: record.plantCount || 0,
        timeToFirstPicker: record.timeToFirstPicker || 0,
        pickingDuration: record.pickingDuration || 0,
        plantsPerHour: record.plantsPerHour || 0,
        efficiencyScore: record.efficiencyScore || 0,
        status: record.status || 'unknown',
        pickerNames: record.pickerNames || []
    }));
}

// Apply filters to records
function filterAnalyticsRecords(records) {
    const start = analyticsFilters.startDate ? new Date(analyticsFilters.startDate) : new Date(0);
    const end = analyticsFilters.endDate ? new Date(analyticsFilters.endDate) : new Date();
    end.setHours(23, 59, 59, 999);
    
    return records.filter(record => {
        // Date filter
        const recordDate = new Date(record.recordedAt || record.orderCreated || record.readyForDelivery || 0);
        if (isNaN(recordDate.getTime())) return false;
        if (recordDate < start || recordDate > end) return false;
        
        // Status filter
        if (analyticsFilters.filterType === 'completed') {
            if (record.status !== ORDER_STATUSES.DELIVERED && record.status !== ORDER_STATUSES.COLLECTED) {
                return false;
            }
        } else if (analyticsFilters.filterType === 'inProgress') {
            if (record.status === ORDER_STATUSES.DELIVERED || 
                record.status === ORDER_STATUSES.COLLECTED || 
                record.status === ORDER_STATUSES.CANCELLED) {
                return false;
            }
        }
        
        // Customer filter
        if (analyticsFilters.selectedCustomer !== 'all') {
            if (record.customerName !== analyticsFilters.selectedCustomer) {
                return false;
            }
        }
        
        // Customer search
        if (analyticsFilters.customerSearch) {
            if (!record.customerName.toLowerCase().includes(analyticsFilters.customerSearch)) {
                return false;
            }
        }
        
        return true;
    });
}

function calculateAnalytics(startDate, endDate, filterType) {
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);
    
    const ordersWithData = customers.filter(c => 
        c.passport && 
        c.passport.timestamps && 
        new Date(c.passport.timestamps.orderCreated || 0) >= start &&
        new Date(c.passport.timestamps.orderCreated || 0) <= end
    );
    
    let filteredOrders = ordersWithData;
    if (filterType === 'completed') {
        filteredOrders = ordersWithData.filter(c => 
            c.status === ORDER_STATUSES.DELIVERED || 
            c.status === ORDER_STATUSES.COLLECTED
        );
    } else if (filterType === 'inProgress') {
        filteredOrders = ordersWithData.filter(c => 
            c.status !== ORDER_STATUSES.DELIVERED && 
            c.status !== ORDER_STATUSES.COLLECTED &&
            c.status !== ORDER_STATUSES.CANCELLED
        );
    }
    
    let totalTimeToFirstPicker = 0;
    let totalPickingDuration = 0;
    let totalPlantsPicked = 0;
    let ordersWithFirstPicker = 0;
    let ordersWithPickingDuration = 0;
    let ordersWithPlants = 0;
    let completedOrders = 0;
    let efficiencyScores = [];
    
    const pickerStats = {};
    const efficiencyDistribution = {
        excellent: 0,
        good: 0,
        average: 0,
        poor: 0
    };
    
    const productivityByRange = {
        '1-10': { count: 0, totalTime: 0, totalPlants: 0 },
        '11-25': { count: 0, totalTime: 0, totalPlants: 0 },
        '26-50': { count: 0, totalTime: 0, totalPlants: 0 },
        '51-100': { count: 0, totalTime: 0, totalPlants: 0 },
        '100+': { count: 0, totalTime: 0, totalPlants: 0 }
    };
    
    const recentOrders = [];
    
    filteredOrders.forEach(order => {
        const timestamps = order.passport.timestamps || {};
        const metrics = order.passport.pickingMetrics || {};
        const plantCount = parseInt(order.passport.numberOfPlants) || 0;
        
        if (plantCount > 0) {
            totalPlantsPicked += plantCount;
            ordersWithPlants++;
        }
        
        if (timestamps.orderCreated && timestamps.firstPickerAssigned) {
            const created = new Date(timestamps.orderCreated);
            const firstPicker = new Date(timestamps.firstPickerAssigned);
            const timeToFirst = Math.round((firstPicker - created) / (1000 * 60));
            
            if (timeToFirst > 0) {
                totalTimeToFirstPicker += timeToFirst;
                ordersWithFirstPicker++;
                
                if (metrics.pickerNames && metrics.pickerNames.length > 0) {
                    metrics.pickerNames.forEach(pickerName => {
                        if (!pickerStats[pickerName]) {
                            pickerStats[pickerName] = {
                                orders: 0,
                                totalTimeToFirst: 0,
                                totalPickingDuration: 0,
                                totalPlants: 0,
                                efficiencyScores: []
                            };
                        }
                        pickerStats[pickerName].orders++;
                        pickerStats[pickerName].totalTimeToFirst += timeToFirst;
                        pickerStats[pickerName].totalPlants += plantCount;
                    });
                }
            }
        }
        
        if (timestamps.pickingStarted && timestamps.pickingCompleted) {
            const started = new Date(timestamps.pickingStarted);
            const completed = new Date(timestamps.pickingCompleted);
            const duration = Math.round((completed - started) / (1000 * 60));
            
            if (duration > 0) {
                totalPickingDuration += duration;
                ordersWithPickingDuration++;
                
                if (metrics.pickerNames && metrics.pickerNames.length > 0) {
                    metrics.pickerNames.forEach(pickerName => {
                        if (pickerStats[pickerName]) {
                            pickerStats[pickerName].totalPickingDuration += duration;
                        }
                    });
                }
                
                if (plantCount > 0) {
                    let range = '100+';
                    if (plantCount <= 10) range = '1-10';
                    else if (plantCount <= 25) range = '11-25';
                    else if (plantCount <= 50) range = '26-50';
                    else if (plantCount <= 100) range = '51-100';
                    
                    productivityByRange[range].count++;
                    productivityByRange[range].totalTime += duration;
                    productivityByRange[range].totalPlants += plantCount;
                }
            }
        }
        
        if (metrics.efficiencyScore) {
            efficiencyScores.push(metrics.efficiencyScore);
            
            if (metrics.efficiencyScore >= 90) efficiencyDistribution.excellent++;
            else if (metrics.efficiencyScore >= 70) efficiencyDistribution.good++;
            else if (metrics.efficiencyScore >= 50) efficiencyDistribution.average++;
            else efficiencyDistribution.poor++;
        }
        
        if (order.status === ORDER_STATUSES.DELIVERED || order.status === ORDER_STATUSES.COLLECTED) {
            completedOrders++;
        }
        
        if (recentOrders.length < 20) {
            recentOrders.push({
                id: order.id,
                name: order.name,
                orderNumber: order.passport.orderNumber || `ORD-${order.id}`,
                plantCount: plantCount,
                created: timestamps.orderCreated,
                firstPicker: timestamps.firstPickerAssigned,
                readyForDelivery: timestamps.readyForDelivery,
                timeToFirst: metrics.timeToFirstPicker || 0,
                pickingDuration: metrics.pickingDuration || 0,
                status: order.status,
                efficiency: metrics.efficiencyScore || 0,
                plantsPerHour: metrics.plantsPerHour || 0
            });
        }
    });
    
    const avgTimeToFirstPicker = ordersWithFirstPicker > 0 
        ? Math.round(totalTimeToFirstPicker / ordersWithFirstPicker) 
        : 0;
    
    const avgPickingDuration = ordersWithPickingDuration > 0 
        ? Math.round(totalPickingDuration / ordersWithPickingDuration) 
        : 0;
    
    const avgPlantsPerOrder = ordersWithPlants > 0
        ? Math.round(totalPlantsPicked / ordersWithPlants)
        : 0;
    
    const avgEfficiencyScore = efficiencyScores.length > 0 
        ? Math.round(efficiencyScores.reduce((a, b) => a + b, 0) / efficiencyScores.length) 
        : 0;
    
    const productivityData = [];
    for (const [range, data] of Object.entries(productivityByRange)) {
        if (data.count > 0) {
            const avgTimePerOrder = Math.round(data.totalTime / data.count);
            const avgPlantsPerOrder = Math.round(data.totalPlants / data.count);
            const plantsPerHour = data.totalTime > 0 
                ? Math.round((data.totalPlants / data.totalTime) * 60) 
                : 0;
            
            productivityData.push({
                range,
                orderCount: data.count,
                totalPlants: data.totalPlants,
                avgTimePerOrder,
                avgPlantsPerOrder,
                plantsPerHour
            });
        }
    }
    
    const pickerPerformance = [];
    for (const [name, stats] of Object.entries(pickerStats)) {
        const avgTimeToFirst = stats.orders > 0 
            ? Math.round(stats.totalTimeToFirst / stats.orders) 
            : 0;
        const avgDuration = stats.orders > 0 
            ? Math.round(stats.totalPickingDuration / stats.orders) 
            : 0;
        const avgPlantsPerOrder = stats.orders > 0
            ? Math.round(stats.totalPlants / stats.orders)
            : 0;
        const plantsPerHour = stats.totalPickingDuration > 0
            ? Math.round((stats.totalPlants / stats.totalPickingDuration) * 60)
            : 0;
        
        let efficiency = 100;
        if (avgPickingDuration > 0 && avgDuration > 0) {
            efficiency = Math.round((avgPickingDuration / avgDuration) * 100);
            if (efficiency > 100) efficiency = 100;
        }
        
        pickerPerformance.push({
            name,
            orders: stats.orders,
            avgTimeToFirst,
            avgDuration,
            avgPlantsPerOrder,
            plantsPerHour,
            totalPlants: stats.totalPlants,
            efficiency
        });
    }
    
    pickerPerformance.sort((a, b) => b.plantsPerHour - a.plantsPerHour);
    
    return {
        summary: {
            avgTimeToFirstPicker,
            avgPickingDuration,
            avgPlantsPerOrder,
            avgEfficiencyScore,
            completedOrders,
            totalOrders: filteredOrders.length,
            totalPlantsPicked
        },
        orders: filteredOrders,
        efficiencyDistribution,
        productivityData,
        pickerPerformance,
        recentOrders
    };
}

function updateAnalyticsSummary(summary) {
    const avgTimeEl = document.getElementById('avgTimeToFirstPicker');
    const avgDurationEl = document.getElementById('avgPickingDuration');
    const avgPlantsEl = document.getElementById('avgPlantsPerOrder');
    const avgEfficiencyEl = document.getElementById('avgEfficiencyScore');
    const completedEl = document.getElementById('completedOrdersCount');
    const totalPlantsEl = document.getElementById('totalPlantsPicked');
    
    if (avgTimeEl) avgTimeEl.textContent = `${summary.avgTimeToFirstPicker} min`;
    if (avgDurationEl) avgDurationEl.textContent = `${summary.avgPickingDuration} min`;
    if (avgPlantsEl) avgPlantsEl.textContent = summary.avgPlantsPerOrder;
    if (avgEfficiencyEl) avgEfficiencyEl.textContent = `${summary.avgEfficiencyScore}%`;
    if (completedEl) completedEl.textContent = summary.completedOrders;
    if (totalPlantsEl) totalPlantsEl.textContent = summary.totalPlantsPicked;
}

function updatePickingTimesChart(orders) {
    const canvas = document.getElementById('pickingTimesChart');
    if (!canvas) {
        console.log('pickingTimesChart canvas not found');
        return;
    }
    const ctx = canvas.getContext('2d');
    
    // Get last 15 orders
    const chartOrders = orders.slice(0, 15);
    
    const labels = chartOrders.map(o => o.orderNumber || `Order ${o.customerId}`);
    const timeToFirstData = chartOrders.map(o => o.timeToFirstPicker || 0);
    const pickingDurationData = chartOrders.map(o => o.pickingDuration || 0);
    const plantCounts = chartOrders.map(o => o.plantCount || 0);
    
    if (pickingTimesChart) {
        pickingTimesChart.destroy();
    }
    
    pickingTimesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Time to First Picker (min)',
                    data: timeToFirstData,
                    backgroundColor: '#3498db',
                    borderRadius: 4,
                    yAxisID: 'y'
                },
                {
                    label: 'Picking Duration (min)',
                    data: pickingDurationData,
                    backgroundColor: '#2ecc71',
                    borderRadius: 4,
                    yAxisID: 'y'
                },
                {
                    label: 'Plants per Order',
                    data: plantCounts,
                    backgroundColor: '#e74c3c',
                    borderRadius: 4,
                    yAxisID: 'y1',
                    type: 'line',
                    borderColor: '#e74c3c',
                    borderWidth: 2,
                    pointBackgroundColor: '#e74c3c',
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        afterBody: function(context) {
                            const index = context[0].dataIndex;
                            const order = chartOrders[index];
                            if (order) {
                                return [
                                    `Customer: ${order.customerName}`,
                                    `Status: ${getStatusText(order.status)}`,
                                    `Pickers: ${order.pickerNames?.join(', ') || 'None'}`
                                ];
                            }
                            return '';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Minutes'
                    },
                    grid: {
                        drawOnChartArea: true
                    }
                },
                y1: {
                    position: 'right',
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Plants'
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }
            }
        }
    });
}

function updateEfficiencyChart(distribution) {
    const canvas = document.getElementById('efficiencyDistributionChart');
    if (!canvas) {
        console.log('efficiencyDistributionChart canvas not found');
        return;
    }
    const ctx = canvas.getContext('2d');
    
    if (efficiencyChart) {
        efficiencyChart.destroy();
    }
    
    efficiencyChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Excellent (>90%)', 'Good (70-90%)', 'Average (50-70%)', 'Poor (<50%)'],
            datasets: [{
                data: [
                    distribution.excellent,
                    distribution.good,
                    distribution.average,
                    distribution.poor
                ],
                backgroundColor: [
                    '#2ecc71',
                    '#3498db',
                    '#f39c12',
                    '#e74c3c'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

function updateProductivityChart(productivityData) {
    const canvas = document.getElementById('productivityChart');
    if (!canvas) {
        console.log('productivityChart canvas not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    if (productivityChart) {
        productivityChart.destroy();
    }
    
    if (!productivityData || productivityData.length === 0) {
        // Show a message instead of a chart
        const wrapper = canvas.parentElement;
        if (wrapper) {
            wrapper.innerHTML = '<div class="no-data">No productivity data available</div>';
        }
        return;
    }
    
    const labels = productivityData.map(d => d.range);
    const plantsPerHour = productivityData.map(d => d.plantsPerHour);
    const avgTimeData = productivityData.map(d => d.avgTimePerOrder);
    
    productivityChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Plants per Hour',
                    data: plantsPerHour,
                    backgroundColor: '#9b59b6',
                    borderRadius: 4,
                    yAxisID: 'y'
                },
                {
                    label: 'Avg Picking Time (min)',
                    data: avgTimeData,
                    backgroundColor: '#f39c12',
                    borderRadius: 4,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        afterBody: function(context) {
                            const index = context[0].dataIndex;
                            const data = productivityData[index];
                            return [
                                `Orders: ${data.orderCount}`,
                                `Total Plants: ${data.totalPlants}`,
                                `Avg Plants/Order: ${data.avgPlantsPerOrder}`
                            ];
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Plants per Hour'
                    }
                },
                y1: {
                    position: 'right',
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Minutes'
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }
            }
        }
    });
}

function updatePickerPerformance(pickerData) {
    const tbody = document.getElementById('pickerPerformanceBody');
    
    if (!tbody) return;
    
    if (!pickerData || pickerData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center">No picker data available</td></tr>';
        return;
    }
    
    tbody.innerHTML = pickerData.map(picker => {
        let performanceClass = '';
        if (picker.efficiency >= 90) performanceClass = '';
        else if (picker.efficiency >= 70) performanceClass = 'medium';
        else performanceClass = 'low';
        
        let productivityRating = 'Average';
        let productivityColor = '#f39c12';
        if (picker.plantsPerHour >= 60) {
            productivityRating = 'Excellent';
            productivityColor = '#2ecc71';
        } else if (picker.plantsPerHour >= 40) {
            productivityRating = 'Good';
            productivityColor = '#3498db';
        } else if (picker.plantsPerHour >= 20) {
            productivityRating = 'Average';
            productivityColor = '#f39c12';
        } else {
            productivityRating = 'Below Average';
            productivityColor = '#e74c3c';
        }
        
        return `
            <tr>
                <td><strong>${picker.name}</strong></td>
                <td>${picker.orders}</td>
                <td>${picker.totalPlants}</td>
                <td>${picker.avgPlantsPerOrder}</td>
                <td>${picker.plantsPerHour} <small style="color: ${productivityColor};">(${productivityRating})</small></td>
                <td>${picker.avgTimeToFirst} min</td>
                <td>${picker.avgDuration} min</td>
                <td>${picker.efficiency}%</td>
                <td>
                    <div class="performance-bar">
                        <div class="performance-fill ${performanceClass}" style="width: ${picker.efficiency}%"></div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function updateRecentOrdersTable(orders) {
    const tbody = document.getElementById('recentOrdersBody');
    
    if (!tbody) return;
    
    if (!orders || orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="text-center">No recent orders</td></tr>';
        return;
    }
    
    tbody.innerHTML = orders.map(order => {
        const statusClass = order.status === ORDER_STATUSES.DELIVERED || order.status === ORDER_STATUSES.COLLECTED 
            ? 'completed' 
            : 'picking';
        
        const _fmtDt = function(ts) {
            if (!ts) return '-';
            var d = new Date(ts);
            return d.toLocaleDateString('en-GB', {day:'2-digit',month:'short'}) + ' ' + formatTime(d);
        };
        const created = _fmtDt(order.created);
        const firstPicker = _fmtDt(order.firstPicker);
        const readyForDelivery = _fmtDt(order.readyForDelivery);
        
        const plantsPerHour = order.plantCount > 0 && order.pickingDuration > 0
            ? Math.round((order.plantCount / order.pickingDuration) * 60)
            : 0;
        
        return `
            <tr>
                <td><strong>${order.orderNumber}</strong></td>
                <td>${order.name}</td>
                <td>${order.plantCount}</td>
                <td>${created}</td>
                <td>${firstPicker}</td>
                <td>${readyForDelivery}</td>
                <td>${order.timeToFirst > 0 ? order.timeToFirst + ' min' : '-'}</td>
                <td>${order.pickingDuration > 0 ? order.pickingDuration + ' min' : '-'}</td>
                <td>${plantsPerHour > 0 ? plantsPerHour + ' plants/hr' : '-'}</td>
                <td><span class="status-badge-analytics ${statusClass}">${getStatusText(order.status)}</span></td>
                <td>${order.efficiency}%</td>
            </tr>
        `;
    }).join('');
}

function exportPickerData() {
    const startDate = document.getElementById('analyticsStartDate').value;
    const endDate = document.getElementById('analyticsEndDate').value;
    const data = calculateAnalytics(startDate, endDate, 'all');
    
    let csv = 'Picker,Orders Picked,Total Plants,Avg Plants/Order,Plants/Hour,Avg Time to First Pick (min),Avg Picking Duration (min),Efficiency Score (%)\n';
    
    data.pickerPerformance.forEach(picker => {
        csv += `"${picker.name}",${picker.orders},${picker.totalPlants},${picker.avgPlantsPerOrder},${picker.plantsPerHour},${picker.avgTimeToFirst},${picker.avgDuration},${picker.efficiency}\n`;
    });
    
    downloadCSV(csv, 'picker_performance.csv');
}

function exportOrderData() {
    const startDate = document.getElementById('analyticsStartDate').value;
    const endDate = document.getElementById('analyticsEndDate').value;
    const filterType = document.getElementById('analyticsFilterType').value;
    const data = calculateAnalytics(startDate, endDate, filterType);
    
    let csv = 'Order Number,Customer,Plants,Created,First Picker,Ready for Delivery,Time to First (min),Picking Duration (min),Plants/Hour,Status,Efficiency (%)\n';
    
    data.recentOrders.forEach(order => {
        const created = order.created ? new Date(order.created).toISOString() : '';
        const firstPicker = order.firstPicker ? new Date(order.firstPicker).toISOString() : '';
        const readyForDelivery = order.readyForDelivery ? new Date(order.readyForDelivery).toISOString() : '';
        const plantsPerHour = order.plantCount > 0 && order.pickingDuration > 0
            ? Math.round((order.plantCount / order.pickingDuration) * 60)
            : 0;
        
        csv += `"${order.orderNumber}","${order.name}",${order.plantCount},${created},${firstPicker},${readyForDelivery},${order.timeToFirst},${order.pickingDuration},${plantsPerHour},"${getStatusText(order.status)}",${order.efficiency}\n`;
    });
    
    downloadCSV(csv, 'order_analytics.csv');
}

function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
}


// ========== ANALYTICS PAGE FUNCTIONS ==========

let pageAnalyticsCharts = {};

function refreshAnalyticsPage() {
    // Set default dates (last 30 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    const startDateInput = document.getElementById('pageAnalyticsStartDate');
    const endDateInput = document.getElementById('pageAnalyticsEndDate');
    
    if (startDateInput) {
        startDateInput.value = startDate.toISOString().split('T')[0];
    }
    if (endDateInput) {
        endDateInput.value = endDate.toISOString().split('T')[0];
    }
    
    // Apply filters to load data
    applyAnalyticsFilters();
}

function applyAnalyticsFilters() {
    const startDate = document.getElementById('pageAnalyticsStartDate').value;
    const endDate = document.getElementById('pageAnalyticsEndDate').value;
    const filterType = document.getElementById('pageAnalyticsFilterType').value;
    
    // Get analytics data from history (persistent storage)
    const data = calculateAnalyticsFromHistory(startDate, endDate);
    
    // Update summary cards (these have page- prefix)
    document.getElementById('pageAvgTimeToFirstPicker').textContent = `${data.summary.avgTimeToFirstPicker} min`;
    document.getElementById('pageAvgPickingDuration').textContent = `${data.summary.avgPickingDuration} min`;
    document.getElementById('pageAvgPlantsPerOrder').textContent = data.summary.avgPlantsPerOrder;
    document.getElementById('pageAvgEfficiencyScore').textContent = `${data.summary.avgEfficiencyScore}%`;
    document.getElementById('pageCompletedOrdersCount').textContent = data.summary.completedOrders;
    document.getElementById('pageTotalPlantsPicked').textContent = data.summary.totalPlantsPicked;
    
    // Update charts (these DO NOT have page- prefix in HTML)
    updateAnalyticsPickingTimesChart(data.records);
    updateAnalyticsEfficiencyChart(data.efficiencyDistribution);
    updateAnalyticsProductivityChart(data.productivityData);
    
    // Update picker performance table (this has page- prefix)
    updateAnalyticsPickerPerformance(data.pickerPerformance);

    // Update recent order activity table
    renderRecentOrderActivity(data.records);
}
function updateAnalyticsPickerPerformance(pickerData) {
    const tbody = document.getElementById('pagePickerPerformanceBody');
    
    if (!tbody) return;
    
    if (!pickerData || pickerData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No data available</td></tr>';
        return;
    }
    
    tbody.innerHTML = pickerData.map(picker => `
        <tr>
            <td><strong>${picker.name}</strong></td>
            <td>${picker.orders}</td>
            <td>${picker.totalPlants}</td>
            <td>${picker.plantsPerHour}</td>
            <td>${picker.avgTimeToFirst} min</td>
            <td>${picker.avgDuration} min</td>
            <td>${picker.efficiency}%</td>
        </tr>
    `).join('');
}
// Add reset function
function resetAnalyticsFilters() {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    document.getElementById('pageAnalyticsStartDate').value = startDate.toISOString().split('T')[0];
    document.getElementById('pageAnalyticsEndDate').value = endDate.toISOString().split('T')[0];
    document.getElementById('pageAnalyticsFilterType').value = 'all';
    
    applyAnalyticsFilters();
}

// ===== Recent Order Activity =====
function renderRecentOrderActivity(records) {
    const tbody = document.getElementById('recentOrderActivityBody');
    if (!tbody) return;

    if (!records || records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="text-center dash-cell">No order activity recorded yet</td></tr>';
        return;
    }

    // Sort most-recent first
    const sorted = [...records].sort((a, b) => {
        const ta = a.recordedAt || a.orderCreated || '';
        const tb = b.recordedAt || b.orderCreated || '';
        return tb.localeCompare(ta);
    });

    // Format a timestamp as DD/MM/YYYY,\nHH:MM:SS
    function fmtDt(ts) {
        if (!ts) return '<span class="dash-cell">-</span>';
        const d = new Date(ts);
        if (isNaN(d)) return '<span class="dash-cell">-</span>';
        const date = d.toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric' });
        const time = d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
        return `${date},<br>${time}`;
    }

    // Diff two ISO timestamps in minutes, returns null if not computable
    function diffMin(from, to) {
        if (!from || !to) return null;
        const a = new Date(from), b = new Date(to);
        if (isNaN(a) || isNaN(b)) return null;
        const diff = Math.round((b - a) / 60000);
        return diff >= 0 ? diff : null;
    }

    // Format minutes value – derive from timestamps when stored value is 0/missing
    function fmtMin(storedVal, fromTs, toTs) {
        const val = (storedVal && storedVal > 0) ? storedVal : diffMin(fromTs, toTs);
        if (val === null || val === undefined || val <= 0) return '<span class="dash-cell">-</span>';
        return `${val} min`;
    }

    // Format plants/hour – derive if stored value is 0
    function fmtPph(storedVal, plantCount, storedDuration, fromTs, toTs) {
        if (storedVal && storedVal > 0) {
            return `${Number(storedVal).toLocaleString()} plants/hr`;
        }
        // Try to compute from plant count + duration
        const duration = (storedDuration && storedDuration > 0) ? storedDuration : diffMin(fromTs, toTs);
        if (plantCount > 0 && duration && duration > 0) {
            const pph = Math.round((plantCount / duration) * 60);
            return `${Number(pph).toLocaleString()} plants/hr`;
        }
        return '<span class="dash-cell">-</span>';
    }

    function statusBadge(status) {
        const map = {
            delivered:          { cls: 'delivered',  label: 'Delivered'  },
            delivering:         { cls: 'delivering', label: 'Delivering' },
            picking:            { cls: 'picking',    label: 'Picking'    },
            ready_for_delivery: { cls: 'ready',      label: 'Ready'      },
            collected:          { cls: 'collected',  label: 'Collected'  },
            cancelled:          { cls: 'cancelled',  label: 'Cancelled'  },
            pending:            { cls: 'pending',    label: 'Pending'    },
        };
        const s = map[status] || { cls: 'pending', label: status || 'Unknown' };
        return `<span class="order-status-badge ${s.cls}">${s.label}</span>`;
    }

    function effClass(score) {
        if (!score || score === 0) return '';
        if (score < 50) return ' low';
        if (score < 80) return ' medium';
        return '';
    }

    function fmtPickers(names) {
        if (!names || names.length === 0) return '<span class="dash-cell">-</span>';
        return names.map(n => `<span class="picker-tag">${n}</span>`).join(' ');
    }

    tbody.innerHTML = sorted.map(r => {
        // Derived duration: firstPickerAssigned → readyForDelivery (or pickingCompleted)
        const durationFrom = r.firstPickerAssigned || r.pickingStarted;
        const durationTo   = r.readyForDelivery    || r.pickingCompleted;

        return `
        <tr>
            <td class="order-id" title="${r.orderNumber || ''}">${r.orderNumber || `ORD-${r.customerId}`}</td>
            <td>${r.customerName || '-'}</td>
            <td>${r.plantCount > 0 ? r.plantCount : '<span class="dash-cell">-</span>'}</td>
            <td>${fmtDt(r.orderCreated)}</td>
            <td>${fmtDt(r.firstPickerAssigned)}</td>
            <td>${fmtDt(r.readyForDelivery)}</td>
            <td>${fmtMin(r.timeToFirstPicker, r.orderCreated, r.firstPickerAssigned)}</td>
            <td>${fmtMin(r.pickingDuration, durationFrom, durationTo)}</td>
            <td>${fmtPph(r.plantsPerHour, r.plantCount, r.pickingDuration, durationFrom, durationTo)}</td>
            <td>${fmtPickers(r.pickerNames)}</td>
            <td>${statusBadge(r.status)}</td>
            <td>${r.efficiencyScore > 0 ? `<span class="efficiency-value${effClass(r.efficiencyScore)}">${r.efficiencyScore}%</span>` : '<span class="dash-cell">-</span>'}</td>
        </tr>`;
    }).join('');
}

function exportRecentOrderActivity() {
    const records = analyticsHistory;
    if (!records || records.length === 0) {
        showNotification('No order activity data to export', 'warning');
        return;
    }

    const sorted = [...records].sort((a, b) => {
        const ta = a.recordedAt || a.orderCreated || '';
        const tb = b.recordedAt || b.orderCreated || '';
        return tb.localeCompare(ta);
    });

    function fmtDtCsv(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        if (isNaN(d)) return '';
        return d.toLocaleString('en-GB');
    }

    const headers = ['Order','Customer','Plants','Created','First Picker','Ready for Delivery','Time to Picker (min)','Picking Time (min)','Plants/Hour','Pickers','Status','Efficiency (%)'];
    const rows = sorted.map(r => {
        const durationFrom = r.firstPickerAssigned || r.pickingStarted;
        const durationTo   = r.readyForDelivery    || r.pickingCompleted;
        function diffMinExp(from, to) {
            if (!from || !to) return '';
            const a = new Date(from), b = new Date(to);
            if (isNaN(a) || isNaN(b)) return '';
            const d = Math.round((b - a) / 60000);
            return d >= 0 ? d : '';
        }
        const ttp = r.timeToFirstPicker || diffMinExp(r.orderCreated, r.firstPickerAssigned);
        const pd  = r.pickingDuration   || diffMinExp(durationFrom, durationTo);
        let pph = r.plantsPerHour;
        if (!pph && r.plantCount > 0 && pd > 0) pph = Math.round((r.plantCount / pd) * 60);
        return [
            r.orderNumber || `ORD-${r.customerId}`,
            r.customerName || '',
            r.plantCount || '',
            fmtDtCsv(r.orderCreated),
            fmtDtCsv(r.firstPickerAssigned),
            fmtDtCsv(r.readyForDelivery),
            ttp || '',
            pd  || '',
            pph || '',
            (r.pickerNames || []).join('; '),
            r.status || '',
            r.efficiencyScore || ''
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `order-activity-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showNotification('Order activity exported successfully', 'success');
}

function updateAnalyticsProductivityChart(productivityData) {
    const canvas = document.getElementById('productivityChart');
    if (!canvas) {
        console.log('productivityChart canvas not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    if (pageAnalyticsCharts.productivity) {
        pageAnalyticsCharts.productivity.destroy();
    }
    
    if (!productivityData || productivityData.length === 0) {
        // Show a message instead of a chart
        const wrapper = canvas.parentElement;
        if (wrapper) {
            wrapper.innerHTML = '<div class="no-data">No productivity data available</div>';
        }
        return;
    }
    
    const labels = productivityData.map(d => d.range);
    const plantsPerHour = productivityData.map(d => d.plantsPerHour || 0);
    const avgTimeData = productivityData.map(d => d.avgTimePerOrder || 0);
    
    pageAnalyticsCharts.productivity = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Plants per Hour',
                    data: plantsPerHour,
                    backgroundColor: '#9b59b6',
                    borderRadius: 4,
                    yAxisID: 'y'
                },
                {
                    label: 'Avg Picking Time (min)',
                    data: avgTimeData,
                    backgroundColor: '#f39c12',
                    borderRadius: 4,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        afterBody: function(context) {
                            const index = context[0].dataIndex;
                            const data = productivityData[index];
                            return [
                                `Orders: ${data.orderCount}`,
                                `Total Plants: ${data.totalPlants}`,
                                `Avg Plants/Order: ${data.avgPlantsPerOrder}`
                            ];
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Plants per Hour'
                    }
                },
                y1: {
                    position: 'right',
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Minutes'
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }
            }
        }
    });
}
function updateAnalyticsEfficiencyChart(distribution) {
    const canvas = document.getElementById('efficiencyDistributionChart');
    if (!canvas) {
        console.log('efficiencyDistributionChart canvas not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    if (pageAnalyticsCharts.efficiency) {
        pageAnalyticsCharts.efficiency.destroy();
    }
    
    pageAnalyticsCharts.efficiency = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Excellent (>90%)', 'Good (70-90%)', 'Average (50-70%)', 'Poor (<50%)'],
            datasets: [{
                data: [
                    distribution.excellent || 0,
                    distribution.good || 0,
                    distribution.average || 0,
                    distribution.poor || 0
                ],
                backgroundColor: [
                    '#2ecc71',
                    '#3498db',
                    '#f39c12',
                    '#e74c3c'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}
function updateAnalyticsPickingTimesChart(records) {
    const canvas = document.getElementById('pickingTimesChart');
    if (!canvas) {
        console.log('pickingTimesChart canvas not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    // Get last 15 orders
    const chartOrders = records.slice(0, 15);
    
    const labels = chartOrders.map(o => o.orderNumber || `Order ${o.customerId}`);
    const timeToFirstData = chartOrders.map(o => o.timeToFirstPicker || 0);
    const pickingDurationData = chartOrders.map(o => o.pickingDuration || 0);
    const plantCounts = chartOrders.map(o => o.plantCount || 0);
    
    if (pageAnalyticsCharts.picking) {
        pageAnalyticsCharts.picking.destroy();
    }
    
    pageAnalyticsCharts.picking = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Time to First Picker (min)',
                    data: timeToFirstData,
                    backgroundColor: '#3498db',
                    borderRadius: 4,
                    yAxisID: 'y'
                },
                {
                    label: 'Picking Duration (min)',
                    data: pickingDurationData,
                    backgroundColor: '#2ecc71',
                    borderRadius: 4,
                    yAxisID: 'y'
                },
                {
                    label: 'Plants per Order',
                    data: plantCounts,
                    backgroundColor: '#e74c3c',
                    borderRadius: 4,
                    yAxisID: 'y1',
                    type: 'line',
                    borderColor: '#e74c3c',
                    borderWidth: 2,
                    pointBackgroundColor: '#e74c3c',
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        afterBody: function(context) {
                            const index = context[0].dataIndex;
                            const order = chartOrders[index];
                            if (order) {
                                return [
                                    `Customer: ${order.customerName}`,
                                    `Status: ${getStatusText(order.status)}`,
                                    `Pickers: ${order.pickerNames?.join(', ') || 'None'}`
                                ];
                            }
                            return '';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Minutes'
                    },
                    grid: {
                        drawOnChartArea: true
                    }
                },
                y1: {
                    position: 'right',
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Plants'
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }
            }
        }
    });
}


function updatePagePickingTimesChart(orders) {
    const canvas = document.getElementById('pagePickingTimesChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const chartOrders = orders.slice(0, 15);
    
    if (pageAnalyticsCharts.picking) pageAnalyticsCharts.picking.destroy();
    
    pageAnalyticsCharts.picking = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartOrders.map(o => o.orderNumber || `Order ${o.customerId}`),
            datasets: [
                {
                    label: 'Time to First Picker (min)',
                    data: chartOrders.map(o => o.timeToFirstPicker || 0),
                    backgroundColor: '#3498db',
                    yAxisID: 'y'
                },
                {
                    label: 'Picking Duration (min)',
                    data: chartOrders.map(o => o.pickingDuration || 0),
                    backgroundColor: '#2ecc71',
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' }
            },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Minutes' } }
            }
        }
    });
}

function updatePageEfficiencyChart(distribution) {
    const canvas = document.getElementById('pageEfficiencyChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    if (pageAnalyticsCharts.efficiency) pageAnalyticsCharts.efficiency.destroy();
    
    pageAnalyticsCharts.efficiency = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Excellent (>90%)', 'Good (70-90%)', 'Average (50-70%)', 'Poor (<50%)'],
            datasets: [{
                data: [
                    distribution.excellent || 0,
                    distribution.good || 0,
                    distribution.average || 0,
                    distribution.poor || 0
                ],
                backgroundColor: ['#2ecc71', '#3498db', '#f39c12', '#e74c3c']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

function updatePageProductivityChart(productivityData) {
    const canvas = document.getElementById('pageProductivityChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    if (pageAnalyticsCharts.productivity) pageAnalyticsCharts.productivity.destroy();
    
    pageAnalyticsCharts.productivity = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: productivityData.map(d => d.range),
            datasets: [
                {
                    label: 'Plants per Hour',
                    data: productivityData.map(d => d.plantsPerHour || 0),
                    backgroundColor: '#9b59b6',
                    yAxisID: 'y'
                },
                {
                    label: 'Avg Picking Time (min)',
                    data: productivityData.map(d => d.avgTimePerOrder || 0),
                    backgroundColor: '#f39c12',
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top' } },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Plants/Hour' } },
                y1: { position: 'right', beginAtZero: true, title: { display: true, text: 'Minutes' } }
            }
        }
    });
}

function updatePagePickerPerformance(pickerData) {
    const tbody = document.getElementById('pagePickerPerformanceBody');
    if (!tbody) return;
    
    if (!pickerData || pickerData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No data available</td></tr>';
        return;
    }
    
    tbody.innerHTML = pickerData.map(picker => `
        <tr>
            <td><strong>${picker.name}</strong></td>
            <td>${picker.orders}</td>
            <td>${picker.totalPlants}</td>
            <td>${picker.plantsPerHour}</td>
            <td>${picker.avgTimeToFirst} min</td>
            <td>${picker.avgDuration} min</td>
            <td>${picker.efficiency}%</td>
        </tr>
    `).join('');
}

