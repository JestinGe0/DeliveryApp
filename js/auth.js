// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', async () => {
    // Check onboarding first — if incomplete, show wizard instead of login
    if (typeof checkOnboarding === 'function') {
        var needsSetup = await checkOnboarding();
        if (needsSetup) return;
    }
    try {
        var res = await fetch(SERVER_URL + '/api/me', { credentials: 'include' });
        var data = await res.json();
        if (data.success) {
            window.currentUser = data.user;
            showApp();
        } else {
            showLoginScreen();
        }
    } catch(e) {
        showLoginScreen();
    }
});
function showLoginScreen(){var ls=document.getElementById('login-screen'),ac=document.getElementById('app-container');if(ls)ls.style.display='flex';if(ac)ac.style.display='none';['login-username','login-password'].forEach(function(id){var el=document.getElementById(id);if(el)el.onkeydown=function(e){if(e.key==='Enter')doLogin();};});}


function showApp() {
    var ls = document.getElementById('login-screen');
    var ac = document.getElementById('app-container');
    if (ls) ls.style.display = 'none';
    if (ac) ac.style.display = 'flex';
    
    var av = document.getElementById('header-avatar');
    if (av && window.currentUser) {
        av.textContent = (window.currentUser.fullName || window.currentUser.username).split(' ').map(function(n){ return n[0]; }).join('').toUpperCase().substring(0,2);
    }
    
    applyRoleBasedNav();
    loadCompanyConfig();
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    loadAnalyticsHistory();
    initWebSocket();
    addSyncButton();
    loadStaffData();
    loadDataFromJSON();
    initializeTimeline();
    loadGamificationData();
    loadRoiData();
    
    // Initialize right panel toggle
    initRightPanel();

    // Map screen is active by default after login — show the toggle button
    var panelBtn = document.getElementById('panelToggleBtn');
    if (panelBtn) panelBtn.style.display = 'flex';
    
    setInterval(function() {
        if (socket && !socket.connected) socket.connect();
    }, 30000);
    
    window.addEventListener('online', function() {
        if (socket && !socket.connected) socket.connect();
    });
    
    window.addEventListener('offline', function() {
        showNotification('You are offline - changes saved locally', 'warning');
    });
    
    setTimeout(initPassportEventListeners, 1000);
}


async function doLogin(){
    var username=(document.getElementById('login-username')?.value||'').trim();
    var password=(document.getElementById('login-password')?.value||'').trim();
    var errorEl=document.getElementById('login-error'),errorMsg=document.getElementById('login-error-msg');
    var btnText=document.getElementById('login-btn-text'),btnSpin=document.getElementById('login-btn-spinner'),loginBtn=document.getElementById('login-btn');
    if(errorEl)errorEl.style.display='none';
    if(!username||!password){if(errorMsg)errorMsg.textContent='Please enter your username and password.';if(errorEl)errorEl.style.display='flex';return;}
    if(btnText)btnText.style.display='none';if(btnSpin)btnSpin.style.display='inline-flex';if(loginBtn)loginBtn.disabled=true;
    try{
        var res=await fetch(SERVER_URL+'/api/login',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
        var data=await res.json();
        if(data.success){window.currentUser=data.user;showApp();}
        else{if(errorMsg)errorMsg.textContent=data.message||'Invalid username or password.';if(errorEl)errorEl.style.display='flex';}
    }catch(err){if(errorMsg)errorMsg.textContent='Cannot reach server.';if(errorEl)errorEl.style.display='flex';}
    finally{if(btnText)btnText.style.display='inline-flex';if(btnSpin)btnSpin.style.display='none';if(loginBtn)loginBtn.disabled=false;}
}
function toggleLoginPw(){var input=document.getElementById('login-password'),icon=document.getElementById('pw-eye');if(!input)return;if(input.type==='password'){input.type='text';if(icon){icon.classList.remove('fa-eye');icon.classList.add('fa-eye-slash');}}else{input.type='password';if(icon){icon.classList.remove('fa-eye-slash');icon.classList.add('fa-eye');}}}
async function doLogout(){
    try { await fetch(SERVER_URL+'/api/logout',{method:'POST',credentials:'include'}); } catch(e){}
    window.currentUser=null;
    var pw=document.getElementById('login-password');if(pw)pw.value='';
    showLoginScreen();
}



// ========== ROLE-BASED NAV ==========
// Roles:
//   admin   — full access to everything
//   manager — everything except Settings & user management
//   staff   — orders, weekly plan, driver view, pickers dashboard, gamification
var ROLE_SCREENS = {
    admin:   ['map','orders','plan','staff','gamification','grouping','analytics','roi','driver','pickers','settings','diagram','api-import'],
    manager: ['map','orders','plan','staff','gamification','grouping','analytics','roi','driver','pickers','diagram','api-import'],
    staff:   ['map','orders','plan','driver','pickers','gamification','diagram']
};

function getUserRole() {
    return ((window.currentUser && window.currentUser.role) || 'staff').toLowerCase();
}

function applyRoleBasedNav() {
    var role = getUserRole();
    var allowed = ROLE_SCREENS[role] || ROLE_SCREENS['staff'];

    document.querySelectorAll('.nav-tab').forEach(function(tab){
        var s = tab.getAttribute('data-screen');
        var show = allowed.indexOf(s) !== -1;
        // api-import tab visibility is controlled by the apiEnabled setting, not just role
        if (s === 'api-import') show = false; // hidden until loadCompanyConfig enables it
        tab.style.display = show ? 'flex' : 'none';
    });

    var sb = document.getElementById('adminSettingsBtn');
    if (sb) sb.style.display = role === 'admin' ? 'inline-flex' : 'none';

    document.querySelectorAll('.admin-only').forEach(function(el) {
        el.style.display = role === 'admin' ? '' : 'none';
    });

    // For non-admins: expand panels to fill the space freed by hidden action buttons
    var isAdmin = role === 'admin';
    var actionGrid      = document.querySelector('.action-grid');
    var etaPanelWrapper = document.getElementById('etaPanelWrapper');
    var etaPanel        = document.getElementById('etaPanel');
    var runsPanel       = document.getElementById('deliveryRunsPanel');
    var runsContent     = document.getElementById('deliveryRunsContent');
    var etaPanelToggle  = document.getElementById('etaPanelToggle');

    var controlCard = document.querySelector('.control-card');
    if (!isAdmin) {
        // Make control-card a flex column so children can stretch
        if (controlCard) { controlCard.style.display = 'flex'; controlCard.style.flexDirection = 'column'; }
        // Collapse the action-grid to zero so it takes no space
        if (actionGrid) { actionGrid.style.display = 'none'; }

        // Force-open both panels
        if (etaPanel)       { etaPanel.style.display = ''; }
        if (etaPanelToggle) { etaPanelToggle.textContent = '▼'; }
        if (runsContent)    { runsContent.style.display = ''; }

        // Remove fixed max-heights; let them grow naturally
        if (etaPanel)    { etaPanel.style.maxHeight    = 'none'; etaPanel.style.flex    = '1'; }
        if (runsContent) { runsContent.style.maxHeight = 'none'; runsContent.style.flex = '1'; }

        // Stretch the panel wrappers to fill remaining vertical space
        if (etaPanelWrapper) { etaPanelWrapper.style.flex = '1'; etaPanelWrapper.style.display = 'flex'; etaPanelWrapper.style.flexDirection = 'column'; }
        if (runsPanel)       { runsPanel.style.flex = '1'; runsPanel.style.display = 'flex'; runsPanel.style.flexDirection = 'column'; }
    } else {
        if (controlCard) { controlCard.style.display = ''; controlCard.style.flexDirection = ''; }
        if (actionGrid) { actionGrid.style.display = ''; }
        if (etaPanel)    { etaPanel.style.maxHeight    = '380px'; etaPanel.style.flex    = ''; }
        if (runsContent) { runsContent.style.maxHeight = '320px'; runsContent.style.flex = ''; }
        if (etaPanelWrapper) { etaPanelWrapper.style.flex = ''; etaPanelWrapper.style.display = ''; etaPanelWrapper.style.flexDirection = ''; }
        if (runsPanel)       { runsPanel.style.flex = ''; runsPanel.style.display = ''; runsPanel.style.flexDirection = ''; }
    }

    // Apply feature flags on top of role-based visibility
    applyFeatureFlags();

    var at = document.querySelector('.nav-tab.active');
    var as = at ? at.getAttribute('data-screen') : null;
    if (!as || allowed.indexOf(as) === -1) switchScreen('map');
}

function applyFeatureFlags() {
    if (typeof FEATURES === 'undefined') return;
    // Read checkboxes into FEATURES first
    var map = { 'feat-gamification':'gamification', 'feat-grouping':'grouping',
                'feat-analytics':'analytics', 'feat-autoAssign':'autoAssign',
                'feat-priority':'priority', 'feat-diagram':'diagram',
                'feat-aiChat':'aiChat' };
    Object.keys(map).forEach(function(id) {
        var el = document.getElementById(id);
        if (el) FEATURES[map[id]] = el.checked;
    });
    // Apply nav tab visibility
    var gamTab = document.querySelector('.nav-tab[data-screen="gamification"]');
    if (gamTab) gamTab.style.display = FEATURES.gamification !== false ? '' : 'none';
    var grpTab = document.querySelector('.nav-tab[data-screen="grouping"]');
    if (grpTab) grpTab.style.display = FEATURES.grouping !== false ? '' : 'none';
    var diagTab = document.querySelector('.nav-tab[data-screen="diagram"]');
    if (diagTab) diagTab.style.display = FEATURES.diagram !== false ? '' : 'none';
    ['analytics','roi'].forEach(function(s) {
        var t = document.querySelector('.nav-tab[data-screen="' + s + '"]');
        if (t) t.style.display = FEATURES.analytics !== false ? '' : 'none';
    });
    var aa = document.getElementById('autoAssignBtn');
    if (aa) aa.style.display = (FEATURES.autoAssign !== false && getUserRole() === 'admin') ? '' : 'none';
    // Priority feature: show/hide filter dropdown and bulk priority section
    var priorityOn = FEATURES.priority !== false;
    var pf = document.getElementById('ordersPriorityFilter');
    if (pf) pf.style.display = priorityOn ? '' : 'none';
    var bp = document.getElementById('bulkPrioritySection');
    if (bp) bp.style.display = priorityOn ? 'contents' : 'none';
    // Re-render orders so priority badges/borders appear or disappear immediately
    if (!priorityOn && typeof updateOrdersGrid === 'function') updateOrdersGrid();
    // AI Chat button visibility
    var aiBtn = document.getElementById('aiHeaderBtn');
    if (aiBtn) {
        var aiOn = FEATURES.aiChat !== false;
        aiBtn.style.display = aiOn ? '' : 'none';
        if (!aiOn && typeof closeAIChat === 'function') closeAIChat();
    }
    // Redirect away if active tab was hidden
    var active = document.querySelector('.nav-tab.active');
    if (active && active.style.display === 'none' && typeof switchScreen === 'function') switchScreen('map');
}
window.applyFeatureFlags = applyFeatureFlags;

function canAccess(screen) {
    var role = getUserRole();
    var allowed = ROLE_SCREENS[role] || ROLE_SCREENS['staff'];
    return allowed.indexOf(screen) !== -1;
}

