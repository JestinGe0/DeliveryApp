

// Add this to analytics page to show repeat customer stats
function getRepeatCustomerStats() {
    const repeatCustomers = customers.filter(c => 
        c.passport && c.passport.isRepeatCustomer && c.passport.totalOrdersCount > 1
    );
    
    const totalRepeatOrders = repeatCustomers.reduce((sum, c) => 
        sum + (c.passport.totalOrdersCount || 0), 0
    );
    
    return {
        count: repeatCustomers.length,
        totalOrders: totalRepeatOrders,
        averageOrders: repeatCustomers.length > 0 ? 
            Math.round(totalRepeatOrders / repeatCustomers.length) : 0
    };
}

// ========== GLOBAL EXPORTS ==========
window.warmRoadDistanceCache        = warmRoadDistanceCache;
window.getRoadDistanceDurationAsync = getRoadDistanceDurationAsync;
window.runVRPOptimisation           = runVRPOptimisation;
window.changeMapStyle             = changeMapStyle;
window.switchScreen               = switchScreen;
window.openCustomerModal          = openCustomerModal;
window.closeCustomerModal         = closeCustomerModal;
window.filterModalCustomers       = filterModalCustomers;
window.updateTrolleyCount          = updateTrolleyCount;
window.resetModalFilters          = resetModalFilters;
window.focusOnCustomer            = focusOnCustomer;
window.focusOnCustomerFromModal   = focusOnCustomerFromModal;
window.assignToVanDay             = assignToVanDay;
window.toggleRoutePanel           = toggleRoutePanel;
window.unassignCustomer           = unassignCustomer;
window.assignToCollection         = assignToCollection;
window.unassignFromCollection     = unassignFromCollection;
window.updateOrderStatus          = updateOrderStatus;
window.showStatusUpdateModal      = showStatusUpdateModal;
window.closeOrderModal            = closeOrderModal;
window.showVanDayRoute            = showVanDayRoute;
window.optimizeCurrentRoute       = optimizeCurrentRoute;
window.autoAssignCustomers        = autoAssignCustomers;
window.showDirectionsFromWarehouse = showDirectionsFromWarehouse;
window.printCurrentDeliverySheet  = printDriverDeliverySheet;
window.clearCurrentVanDay         = clearCurrentVanDay;
window.clearAllAssignments        = clearAllAssignments;
window.debugDataFlow              = debugDataFlow;
window.toggleCard                 = toggleCard;
window.toggleWeeklyCard           = toggleWeeklyCard;
window.filterStaffByType          = filterStaffByType;
window.openAddStaffModal          = openAddStaffModal;
window.closeAddStaffModal         = closeAddStaffModal;
window.saveStaff                  = saveStaff;
window.toggleStaffTypeFields      = toggleStaffTypeFields;
window.openEditStaffModal         = openEditStaffModal;
window.closeEditStaffModal        = closeEditStaffModal;
window.updateStaff                = updateStaff;
window.deleteStaff                = deleteStaff;
window.viewStaffOrders            = viewStaffOrders;
window.openAssignStaffModal       = openAssignStaffModal;
window.closeAssignStaffModal      = closeAssignStaffModal;
window.toggleStaffSelection       = toggleStaffSelection;
window.removeStaffFromOrder       = removeStaffFromOrder;
window.openAssignDriverModal      = openAssignDriverModal;
window.closeAssignDriverModal     = closeAssignDriverModal;
window.selectDriver               = selectDriver;
window.removeDriverFromOrder      = removeDriverFromOrder;
window.filterDrivers              = filterDrivers;
window.getDriverName              = getDriverName;
window.requestSync                = requestSync;
window.openPassportModal          = openPassportModal;
window.closePassportModal         = closePassportModal;
window.switchPassportTab          = switchPassportTab;
window.savePassportData           = savePassportData;
window.toggleSpecificTime         = toggleSpecificTime;
window.toggleAccessTimes          = toggleAccessTimes;
window.toggleQualityNotes         = toggleQualityNotes;
window.toggleSubstitutionDetails  = toggleSubstitutionDetails;
window.clearOrderData             = clearOrderData;
window.promptClearOrderData       = promptClearOrderData;
window.exportPickerData           = exportPickerData;
window.exportOrderData            = exportOrderData;
window.getAnalyticsRecords        = getAnalyticsRecords;
window.exportAnalyticsData        = exportOrderData; // exportAnalyticsData → exportOrderData
window.cleanupAnalyticsDuplicates = cleanupAnalyticsDuplicates;
window.exportAnalyticsHistory     = function() {
    const data = analyticsHistory;
    let csv = 'Order Number,Customer Name,Plant Count,Quality Grade,Flower Stage,Time to First Picker (min),Picking Duration (min),Number of Pickers,Pickers,Plants per Hour,Efficiency Score,Order Created,Ready for Delivery,Delivered\n';
    
    data.forEach(record => {
        csv += `"${record.orderNumber}","${record.customerName}",${record.plantCount},"${record.qualityGrade}","${record.flowerStage}",${record.timeToFirstPicker},${record.pickingDuration},${record.numberOfPickers},"${(record.pickerNames || []).join('; ')}",${record.plantsPerHour},${record.efficiencyScore},"${record.orderCreated}","${record.readyForDelivery}","${record.deliveredAt}"\n`;
    });
    
    downloadCSV(csv, 'analytics_history.csv');
};
window.refreshLeaderboard          = refreshPageLeaderboard;
window.refreshAchievements         = refreshPageAchievements;
window.refreshChallenges           = refreshPageChallenges;
window.refreshAwards               = refreshPageAwards;
window.refreshMyStats              = refreshPageMyStats;
// window.exportRoiData — no export function in roi.js
// window.viewCustomerDetails — function not found
// window.openSmartGroupingModal — replaced by page grouping
// window.closeSmartGroupingModal — replaced by page grouping
// window.refreshGroupingSuggestions — replaced by page grouping
// window.toggleGroupDetails — replaced by page grouping
// window.updateGroupSelection — replaced by page grouping
window.applySelectedGroups         = pageApplySelectedGroups;
window.selectAllCustomers          = pageSelectAllCustomers;
window.deselectAllCustomers        = pageDeselectAllCustomers;
window.toggleCustomerSelection     = pageToggleCustomerSelection;
window.proceedToGrouping           = pageProceedToGrouping;
window.backToSelection             = pageBackToSelection;
window.switchPageTab                = switchPageTab;
window.refreshGamificationPage      = refreshGamificationPage;
window.refreshPageLeaderboard       = refreshPageLeaderboard;
window.refreshPageAchievements      = refreshPageAchievements;
window.refreshPageChallenges        = refreshPageChallenges;
window.refreshPageAwards            = refreshPageAwards;
window.refreshPageMyStats           = refreshPageMyStats;
window.refreshGroupingPage          = refreshGroupingPage;
window.pageSelectAllCustomers       = pageSelectAllCustomers;
window.pageDeselectAllCustomers     = pageDeselectAllCustomers;
window.pageProceedToGrouping        = pageProceedToGrouping;
window.pageBackToSelection          = pageBackToSelection;
window.pageApplySelectedGroups      = pageApplySelectedGroups;
window.refreshAnalyticsPage         = refreshAnalyticsPage;
window.applyAnalyticsFilters        = applyAnalyticsFilters;
window.renderRecentOrderActivity    = renderRecentOrderActivity;
window.exportRecentOrderActivity    = exportRecentOrderActivity;
window.resetAnalyticsFilters        = resetAnalyticsFilters;
window.refreshROIPage               = refreshROIPage;
window.refreshPageROICustomers      = refreshPageROICustomers;
window.refreshPageROIZones          = refreshPageROIZones;
window.refreshPageROITrends         = refreshPageROITrends;
window.refreshPageROIProjections    = refreshPageROIProjections;
window.refreshGroupingPage = refreshGroupingPage;
window.pageSelectAllCustomers = pageSelectAllCustomers;
window.pageDeselectAllCustomers = pageDeselectAllCustomers;
window.pageProceedToGrouping = pageProceedToGrouping;
window.pageBackToSelection = pageBackToSelection;
window.pageApplySelectedGroups = pageApplySelectedGroups;
window.pageToggleCustomerSelection = pageToggleCustomerSelection;
window.updatePageGroupSelection = updatePageGroupSelection;
window.warmRoadDistanceCache       = warmRoadDistanceCache;
window.getRoadDistanceDurationAsync = getRoadDistanceDurationAsync;

window.refreshDeliveryRunsPanel = refreshDeliveryRunsPanel;
window.assignRunDriver          = assignRunDriver;
window.toggleDeliveryRunsPanel  = toggleDeliveryRunsPanel;
window.invalidateRunDrivers     = invalidateRunDrivers;
window.computeDeliveryRuns      = computeDeliveryRuns;

window.loadDistanceCacheFromStorage  = loadDistanceCacheFromStorage;
window.saveDistanceCacheToStorage    = saveDistanceCacheToStorage;
window.clearDistanceCacheStorage     = clearDistanceCacheStorage;

window.refreshPickerDashboard = refreshPickerDashboard;

window.promptWeeklyReset = promptWeeklyReset;
window.promptFullReset   = promptFullReset;

window.quickSaveCustomer = quickSaveCustomer;

window.quickSavePassport = quickSavePassport;

window.clearCustomersBaseCache = clearCustomersBaseCache;


function toggleETAPanel() {
    var panel  = document.getElementById('etaPanel');
    var toggle = document.getElementById('etaPanelToggle');
    if (!panel) return;
    var hidden = panel.style.display === 'none';
    panel.style.display  = hidden ? '' : 'none';
    if (toggle) toggle.textContent = hidden ? '▼' : '▶';
}
window.toggleETAPanel   = toggleETAPanel;
window.saveETASettings  = saveETASettings;
window.initETASettings  = initETASettings;

// Guard exports for functions that may not exist if grouping.js wasn't updated.
// Using typeof checks prevents "not defined" crashes on older deployments.
if (typeof ensureVanCapacity    === 'function') window.ensureVanCapacity    = ensureVanCapacity;
if (typeof renderVanCapacityCards === 'function') window.renderVanCapacityCards = renderVanCapacityCards;
if (typeof updateLocalZoneLabel === 'function') window.updateLocalZoneLabel = updateLocalZoneLabel;
if (typeof drawLocalZoneCircle  === 'function') window.drawLocalZoneCircle  = drawLocalZoneCircle;
if (typeof applyFeatureFlags    === 'function') window.applyFeatureFlags    = applyFeatureFlags;

// AI Chat
window.openAIChat         = openAIChat;
window.closeAIChat        = closeAIChat;
window.toggleAIChat       = toggleAIChat;
window.sendAIMessage      = sendAIMessage;
window.submitAIChatInput  = submitAIChatInput;
window.clearAIChat        = clearAIChat;
window.aiChatKeydown      = aiChatKeydown;
window._resizeInput       = _resizeInput;
window.startAIMic         = startAIMic;
window.stopAIMic          = stopAIMic;
if (typeof normalizeDeliveryPlan === 'function') window.normalizeDeliveryPlan = normalizeDeliveryPlan;
