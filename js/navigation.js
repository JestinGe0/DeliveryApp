// ========== SCREEN SWITCHING ==========
// Switch between screens
function switchScreen(screenId) {
    // Update active tab
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    if (event && event.target) {
        event.target.classList.add('active');
    }
    
    // Hide all screens
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    
    // Show selected screen
    const selectedScreen = document.getElementById(`screen-${screenId}`);
    if (selectedScreen) {
        selectedScreen.classList.add('active');
    }

    // Show panel toggle button only on the map screen
    const panelBtn = document.getElementById('panelToggleBtn');
    if (panelBtn) {
        panelBtn.style.display = screenId === 'map' ? 'flex' : 'none';
    }
    
    // Refresh data based on screen
    switch(screenId) {
        case 'map':
            // Staggered invalidations — catches flex layout settling after display:flex kicks in
            [50, 150, 350, 700].forEach(function(ms) {
                setTimeout(function() {
                    if (typeof map !== 'undefined' && map) map.invalidateSize();
                }, ms);
            });
            break;
        case 'driver':
            setTimeout(refreshDriverView, 150);
            break;
        case 'staff':
            if (typeof renderStaffGrid === 'function') renderStaffGrid();
            break;
        case 'plan':
            if (typeof updateTimelineMarker === 'function') {
                setTimeout(updateTimelineMarker, 100);
            }
            break;
        case 'gamification':
            if (typeof refreshGamificationPage === 'function') refreshGamificationPage();
            break;
        case 'grouping':
            if (typeof refreshGroupingPage === 'function') refreshGroupingPage();
            break;
        case 'analytics':
            if (typeof refreshAnalyticsPage === 'function') refreshAnalyticsPage();
            break;
        case 'roi':
            if (typeof refreshROIPage === 'function') refreshROIPage();
            break;
        case 'settings':
            if (typeof initSettingsPage === 'function') initSettingsPage();
            break;
        case 'pickers':
            if (typeof refreshPickerDashboard === 'function') refreshPickerDashboard();
            break;
        case 'diagram':
            if (typeof refreshDiagram === 'function') refreshDiagram();
            break;
        case 'api-import':
            if (typeof onApiImportScreenShow === 'function') onApiImportScreenShow();
            break;
    }
}

// ========== SMART GROUPING WITH CUSTOMER SELECTION ==========
// (The smart grouping functions are now properly placed above)

