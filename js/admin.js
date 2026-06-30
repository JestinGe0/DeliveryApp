// ========== COMPANY CONFIG ==========
var companyConfig = null;
async function loadCompanyConfig() {
    try {
        const res = await fetch(SERVER_URL + '/api/config');
        const data = await res.json();
        if (data.success && data.config && Object.keys(data.config).length > 0) {
            companyConfig = data.config;
            applyCompanyConfig(data.config);
        } else {
            saveDefaultConfig();
            showFirstRunBanner();
        }
    } catch (err) {
        console.error('Config load failed:', err);
        saveDefaultConfig();
    }
}

function showFirstRunBanner() {
    if (document.getElementById('first-run-banner')) return;
    var b = document.createElement('div');
    b.id = 'first-run-banner';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#1d4ed8;color:white;padding:11px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.25);';
    b.innerHTML = '<div style="display:flex;align-items:center;gap:10px;"><i class="fas fa-circle-info" style="font-size:15px;flex-shrink:0;"></i><span><strong>Welcome — first-time setup required.</strong> Please configure your warehouse location, vans and delivery zones before use.</span></div>' +
        '<div style="display:flex;gap:8px;flex-shrink:0;">' +
        '<button onclick="document.getElementById(\'first-run-banner\').remove();openAdminSettings();" style="background:white;color:#1d4ed8;border:none;padding:7px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;">Open Settings</button>' +
        '<button onclick="document.getElementById(\'first-run-banner\').remove();" style="background:rgba(255,255,255,0.2);color:white;border:none;width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:14px;line-height:1;">✕</button>' +
        '</div>';
    document.body.appendChild(b);
}
function saveDefaultConfig(){var d={companyName:'PEP',companyTagline:'Delivery Management',warehouseName:YOUR_SITE.name,warehouseAddress:YOUR_SITE.address,warehouseLat:YOUR_SITE.lat,warehouseLng:YOUR_SITE.lng,mapDefaultLat:YOUR_SITE.lat,mapDefaultLng:YOUR_SITE.lng,mapDefaultZoom:6,localZoneRadius:20,mapStyle:'streets',activeDays:[1,2,3,4,5,6,7],marqueeThreshold:30,timeFormat:'24',stopTime:15,reconnectInterval:30,proximityThreshold:15,challenges:{},monthlyAwards:{},vans:VANS.map(function(v){var cap=(typeof VAN_CAPACITY!=='undefined'&&VAN_CAPACITY[v.id])||{};return {id:v.id,name:v.name,color:v.color,capacity:v.capacity,maxPlants:cap.maxPlants||500,maxStops:cap.maxStops||15,maxDistance:cap.maxDistance||200,efficiency:cap.efficiency||1.0,preferredZones:cap.preferredZones||[],maxSpeedMph:cap.maxSpeedMph||0};}),zones:Object.entries(ZONES).filter(function(e){return e[0]!=='Collection';}).map(function(e){var n=e[0],z=e[1];return {name:n,color:z.color,latMin:z.latRange?z.latRange[0]:'',latMax:z.latRange?z.latRange[1]:'',lngMin:z.lngRange?z.lngRange[0]:'',lngMax:z.lngRange?z.lngRange[1]:'',isLocal:n==='Local'};})};companyConfig=d;fetch(SERVER_URL+'/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).catch(function(){});}

function applyCompanyConfig(cfg){
    if(!cfg)return;
    if(cfg.companyName){
        document.querySelectorAll('.logo span,.login-logo span').forEach(function(el){
            el.textContent=cfg.companyName;
        });
        document.title=cfg.companyName+' | Delivery Management';
    }
    if(cfg.warehouseLat&&cfg.warehouseLng){
        YOUR_SITE.lat=parseFloat(cfg.warehouseLat);
        YOUR_SITE.lng=parseFloat(cfg.warehouseLng);
        YOUR_SITE.name=cfg.warehouseName||YOUR_SITE.name;
        YOUR_SITE.address=cfg.warehouseAddress||YOUR_SITE.address;
        
        // Update warehouse marker when warehouse coordinates change
        if(typeof updateMapMarkers === 'function') {
            updateMapMarkers();
        }
    }
    // Fix: Check if map exists and is a Leaflet map before calling setView
    if(typeof map !== 'undefined' && map && typeof map.setView === 'function' && cfg.mapDefaultLat && cfg.mapDefaultLng){
        var zoom = cfg.mapDefaultZoom || 6;
        map.setView([parseFloat(cfg.mapDefaultLat), parseFloat(cfg.mapDefaultLng)], zoom);
        console.log('Map view updated to:', cfg.mapDefaultLat, cfg.mapDefaultLng, 'zoom:', zoom);
    }
    if(cfg.vans&&cfg.vans.length>0){
        VANS.length=0;
        cfg.vans.forEach(function(v){
            VANS.push({id:v.id,name:v.name,color:v.color,iconColor:v.color,capacity:v.capacity||50});
            if(!deliveryPlan[v.id])deliveryPlan[v.id]={1:[],2:[],3:[],4:[],5:[],6:[],7:[]};
        });
        // Refresh van/day selector and orders van filter after vans update
        if(typeof updateVanDaySelector === 'function') updateVanDaySelector();
        if(typeof _populateVanFilterDropdown === 'function') _populateVanFilterDropdown();
    }
    if(cfg.zones&&cfg.zones.length>0){
        var col=ZONES['Collection'],r=parseFloat(cfg.localZoneRadius)||20;
        Object.keys(ZONES).forEach(function(k){
            if(k!=='Collection')delete ZONES[k];
        });
        cfg.zones.forEach(function(z){
            ZONES[z.name]=z.isLocal?{color:z.color,radius:r}:{color:z.color,latRange:[parseFloat(z.latMin),parseFloat(z.latMax)],lngRange:[parseFloat(z.lngMin),parseFloat(z.lngMax)]};
        });
        ZONES['Collection']=col;
    }
    // Active days
    if(cfg.activeDays && Array.isArray(cfg.activeDays)){
        ACTIVE_DAYS = cfg.activeDays;
        if(typeof updateVanDaySelector === 'function') updateVanDaySelector();
    }
    // Display: marquee threshold
    if(cfg.marqueeThreshold){ MARQUEE_THRESHOLD = parseInt(cfg.marqueeThreshold) || 30; }
    // System: stop time per delivery
    if(cfg.stopTime){ STOP_TIME_PER_DELIVERY = parseInt(cfg.stopTime) || 15; }
    if(cfg.maxTrolleysPerRun && typeof MAX_TROLLEYS_PER_RUN !== 'undefined'){
        MAX_TROLLEYS_PER_RUN = parseInt(cfg.maxTrolleysPerRun) || 17;
    }
    // System: reconnect interval (applied to next reconnect)
    if(cfg.reconnectInterval){ RECONNECT_INTERVAL = parseInt(cfg.reconnectInterval) || 30; }
    // System: proximity threshold for smart grouping
    if(cfg.proximityThreshold && typeof PROXIMITY_THRESHOLD !== 'undefined'){ PROXIMITY_THRESHOLD = parseInt(cfg.proximityThreshold) || 15; }
    // Map style
    if(cfg.mapStyle && typeof applyMapStyle === 'function'){ applyMapStyle(cfg.mapStyle); }
    // Van capacity / grouping settings — rebuild VAN_CAPACITY to match saved vans exactly
    if(cfg.vans && cfg.vans.length > 0 && typeof VAN_CAPACITY !== 'undefined'){
        // Add / update entries for vans in config
        cfg.vans.forEach(function(v){
            VAN_CAPACITY[v.id]={
                maxPlants:v.maxPlants||500,
                maxStops:v.maxStops||15,
                maxDistance:v.maxDistance||200,
                preferredZones:v.preferredZones||[],
                efficiency:v.efficiency!=null?v.efficiency:1.0,
                maxSpeedMph:v.maxSpeedMph||0
            };
        });
        // Remove stale entries for vans that are no longer in the config
        var _cfgVanIds = cfg.vans.map(function(v){ return v.id; });
        Object.keys(VAN_CAPACITY).forEach(function(k){
            if(!_cfgVanIds.includes(parseInt(k))) delete VAN_CAPACITY[k];
        });
    }
    // Challenges
    if(cfg.challenges && typeof CHALLENGES !== 'undefined'){
        Object.keys(cfg.challenges).forEach(function(k){
            if(CHALLENGES[k]) Object.assign(CHALLENGES[k], cfg.challenges[k]);
        });
    }
    // Monthly awards
    if(cfg.monthlyAwards && typeof MONTHLY_AWARDS !== 'undefined'){
        Object.keys(cfg.monthlyAwards).forEach(function(k){
            if(MONTHLY_AWARDS[k]) Object.assign(MONTHLY_AWARDS[k], cfg.monthlyAwards[k]);
        });
    }
    // ETA settings
    if(cfg.etaStart            && typeof ETA_DELIVERY_START         !== 'undefined') ETA_DELIVERY_START         = cfg.etaStart;
    if(cfg.etaEnd              && typeof ETA_DELIVERY_END           !== 'undefined') ETA_DELIVERY_END           = cfg.etaEnd;
    if(cfg.etaLoadingTime  != null && typeof ETA_LOADING_TIME_PER_RUN  !== 'undefined') ETA_LOADING_TIME_PER_RUN  = parseInt(cfg.etaLoadingTime)  || 20;
    if(cfg.etaUnloadTime   != null && typeof ETA_UNLOAD_TIME_PER_STOP  !== 'undefined') ETA_UNLOAD_TIME_PER_STOP  = parseInt(cfg.etaUnloadTime)   || 10;
    if(cfg.etaPickMins     != null && typeof ETA_PICK_MINS_PER_TROLLEY !== 'undefined') ETA_PICK_MINS_PER_TROLLEY = parseInt(cfg.etaPickMins)     || 60;
    if(cfg.etaBarcodeExtra != null && typeof ETA_PACK_BARCODE_EXTRA    !== 'undefined') ETA_PACK_BARCODE_EXTRA    = parseInt(cfg.etaBarcodeExtra)  || 15;
    if(cfg.etaPrepriceExtra!= null && typeof ETA_PACK_PREPRICE_EXTRA   !== 'undefined') ETA_PACK_PREPRICE_EXTRA   = parseInt(cfg.etaPrepriceExtra) || 20;
    if(cfg.etaShiftToNextWindow !== undefined && typeof ETA_SHIFT_TO_NEXT_WINDOW !== 'undefined'){
        ETA_SHIFT_TO_NEXT_WINDOW = !!cfg.etaShiftToNextWindow;
        window.ETA_SHIFT_TO_NEXT_WINDOW = ETA_SHIFT_TO_NEXT_WINDOW;
    }
    if(cfg.etaHideIfNotStarted !== undefined && typeof ETA_HIDE_IF_NOT_STARTED !== 'undefined'){
        ETA_HIDE_IF_NOT_STARTED = !!cfg.etaHideIfNotStarted;
        window.ETA_HIDE_IF_NOT_STARTED = ETA_HIDE_IF_NOT_STARTED;
    }
    // OR-Tools optimiser settings
    if(cfg.ortoolsCostFunction  !== undefined && typeof ORTOOLS_COST_FUNCTION !== 'undefined') ORTOOLS_COST_FUNCTION  = cfg.ortoolsCostFunction  || 'minimize_time';
    if(cfg.ortoolsMaxStops      !== undefined && typeof ORTOOLS_MAX_STOPS     !== 'undefined') ORTOOLS_MAX_STOPS      = cfg.ortoolsMaxStops      || 15;
    if(cfg.ortoolsMaxDistance   !== undefined && typeof ORTOOLS_MAX_DISTANCE  !== 'undefined') ORTOOLS_MAX_DISTANCE   = cfg.ortoolsMaxDistance   || 200;
    if(cfg.ortoolsDropPenalty   !== undefined && typeof ORTOOLS_DROP_PENALTY  !== 'undefined') ORTOOLS_DROP_PENALTY   = cfg.ortoolsDropPenalty   || 10000000;
    if(cfg.ortoolsTimeLimit     !== undefined && typeof ORTOOLS_TIME_LIMIT    !== 'undefined') ORTOOLS_TIME_LIMIT     = cfg.ortoolsTimeLimit     || 30;
    if(cfg.routeDriverStyle       !== undefined && typeof ROUTE_DRIVER_STYLE       !== 'undefined') ROUTE_DRIVER_STYLE       = !!cfg.routeDriverStyle;
    if(cfg.deliveryRunMoveEnabled !== undefined && typeof DELIVERY_RUN_MOVE_ENABLED !== 'undefined') DELIVERY_RUN_MOVE_ENABLED = cfg.deliveryRunMoveEnabled !== false;
    if(cfg.vanBayAssignments && typeof vanBayAssignments !== 'undefined'){
        Object.assign(vanBayAssignments, cfg.vanBayAssignments);
    }
    if(cfg.bayFeatureEnabled !== undefined && typeof BAY_FEATURE_ENABLED !== 'undefined'){
        BAY_FEATURE_ENABLED = !!cfg.bayFeatureEnabled;
    }
    if(cfg.bayAssignmentMode !== undefined && typeof BAY_ASSIGNMENT_MODE !== 'undefined'){
        BAY_ASSIGNMENT_MODE = cfg.bayAssignmentMode;
    }
    if(cfg.bayCount !== undefined && typeof BAY_COUNT !== 'undefined'){
        BAY_COUNT = cfg.bayCount || 3;
    }
    if(cfg.bayTrolleyLimits && typeof BAY_TROLLEY_LIMITS !== 'undefined'){
        Object.keys(BAY_TROLLEY_LIMITS).forEach(function(k){ delete BAY_TROLLEY_LIMITS[k]; });
        Object.assign(BAY_TROLLEY_LIMITS, cfg.bayTrolleyLimits);
    }
    if(cfg.panelControlsBtn !== undefined && typeof applyPanelControlsBtnSetting === 'function') applyPanelControlsBtnSetting(!!cfg.panelControlsBtn);
    // API Integration — show/hide nav tab based on saved setting
    var _apiTab = document.querySelector('.api-import-nav-tab');
    if(_apiTab) _apiTab.style.display = cfg.apiEnabled ? 'flex' : 'none';
    // Feature flags
    if(cfg.features && typeof FEATURES !== 'undefined'){
        var _fDef = {gamification:true,grouping:true,analytics:true,autoAssign:true,priority:true,diagram:true,aiChat:true};
        Object.keys(_fDef).forEach(function(k){
            var val = cfg.features[k] !== undefined ? cfg.features[k] : _fDef[k];
            FEATURES[k] = val;
            var el = document.getElementById('feat-' + k);
            if(el) el.checked = val;
        });
        if(typeof applyFeatureFlags === 'function') applyFeatureFlags();
    }
    if(cfg.appTheme) applyTheme(cfg.appTheme, true);
    if(typeof renderZoneGrid==='function') renderZoneGrid();
    if(typeof updateAllDisplays==='function')updateAllDisplays();
}




function applyTheme(theme, skipSave) {
    var validThemes = ['default', 'midnight', 'dark'];
    if (!validThemes.includes(theme)) theme = 'default';

    if (theme === 'default') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }

    // Cache in localStorage for instant apply on next page load (no flash)
    localStorage.setItem('PEP_app_theme', theme);

    // Update active swatch in picker
    document.querySelectorAll('.theme-swatch').forEach(function(el) {
        el.classList.toggle('active', el.dataset.theme === theme);
    });

    // Persist to DB unless called from applyCompanyConfig (skipSave=true)
    if (!skipSave) {
        var cfg = Object.assign({}, (typeof companyConfig !== 'undefined' ? companyConfig : {}), { appTheme: theme });
        if (typeof saveCompanyConfig === 'function') saveCompanyConfig(cfg);
    }
}
window.applyTheme = applyTheme;

async function saveCompanyConfig(cfg) {
    try {
        const res = await fetch(SERVER_URL + '/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cfg)
        });
        const data = await res.json();
        if (data.success) {
            companyConfig = cfg;
            applyCompanyConfig(cfg);
            showNotification('Settings saved ✓', 'success');
            return true;
        } else {
            showNotification(data.message || 'Failed to save', 'error');
            return false;
        }
    } catch (err) {
        console.error('Error saving config:', err);
        showNotification('Could not reach server - changes saved locally only', 'warning');
        // Still save locally so settings persist until server is available
        companyConfig = cfg;
        applyCompanyConfig(cfg);
        return false;
    }
}

// ========== CUSTOMER MANAGEMENT ==========
async function adminSaveCustomer(){var name=(document.getElementById('cfg-cust-name')?.value||'').trim(),address=(document.getElementById('cfg-cust-address')?.value||'').trim(),postcode=(document.getElementById('cfg-cust-postcode')?.value||'').trim(),lat=parseFloat(document.getElementById('cfg-cust-lat')?.value),lng=parseFloat(document.getElementById('cfg-cust-lng')?.value),zone=(document.getElementById('cfg-cust-zone')?.value||'').trim(),dayVal=document.getElementById('cfg-cust-day')?.value;if(!name){showNotification('Customer name is required','warning');return;}if(isNaN(lat)||isNaN(lng)){showNotification('Valid latitude and longitude are required','warning');return;}var payload={name:name,address:address,postcode:postcode,lat:lat,lng:lng,zone:zone||'Local',assignedDay:dayVal?parseInt(dayVal):null};try{var res=await fetch(SERVER_URL+'/api/customer/single',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});var data=await res.json();if(data.success){var c=data.customer;var rd=getRoadDistanceDuration(YOUR_SITE.lat,YOUR_SITE.lng,c.lat,c.lng);c.roadDistanceFromSite=rd.distance;c.roadDurationFromSite=rd.duration;c.status='pending';c.assignedStaff=[];c.deliveryOrder=0;customers.push(c);updateAllDisplays();showNotification('Customer "'+name+'" added ✓','success');['cfg-cust-name','cfg-cust-address','cfg-cust-postcode','cfg-cust-lat','cfg-cust-lng'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});document.getElementById('cfg-cust-zone').value='Local';document.getElementById('cfg-cust-day').value='';renderAdminCustomerList();}else showNotification(data.message||'Failed to save','error');}catch(err){showNotification('Cannot reach server','error');}}
async function adminDeleteCustomer(id,name){if(!confirm('Delete customer "'+name+'"?'))return;try{var res=await fetch(SERVER_URL+'/api/customer/single/'+id,{method:'DELETE'});var data=await res.json();if(data.success){customers=customers.filter(function(c){return c.id!==id;});updateAllDisplays();showNotification('Customer deleted','success');renderAdminCustomerList();}else showNotification('Failed to delete','error');}catch(err){showNotification('Cannot reach server','error');}}
function renderAdminCustomerList() {
    const el = document.getElementById('cfg-customer-list');
    if (!el) return;

    const cc = document.getElementById('cfg-cust-count');
    if (cc) cc.textContent = customers.length;

    if (!customers.length) {
        el.innerHTML = '<p style="color:#9ca3af;font-size:12px;padding:12px;">No customers yet.</p>';
        return;
    }

    // Prepare zone options for inline editing (optional)
    const zoneOptions = Object.keys(ZONES).map(z => `<option value="${z}">${z}</option>`).join('');

    el.innerHTML = `
        <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
                <thead>
                    <tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb;">
                        <th style="padding:7px 10px;text-align:left;font-weight:700;color:#6b7280;text-transform:uppercase;font-size:10px;">Name</th>
                        <th style="padding:7px 10px;text-align:left;font-weight:700;color:#6b7280;text-transform:uppercase;font-size:10px;">Address</th>
                        <th style="padding:7px 10px;text-align:left;font-weight:700;color:#6b7280;text-transform:uppercase;font-size:10px;">Postcode</th>
                        <th style="padding:7px 10px;text-align:center;font-weight:700;color:#6b7280;text-transform:uppercase;font-size:10px;">Zone</th>
                        <th style="padding:7px 10px;text-align:center;font-weight:700;color:#6b7280;text-transform:uppercase;font-size:10px;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${customers.slice(0, 200).map(c => {
                        const zoneColor = (ZONES[c.zone] && ZONES[c.zone].color) ? ZONES[c.zone].color : '#6b7280';
                        return `
                            <tr style="border-bottom:1px solid #f3f4f6;">
                                <td style="padding:7px 10px;font-weight:600;">${escapeHtml(c.name)}</td>
                                <td style="padding:7px 10px;color:#6b7280;">${escapeHtml((c.address || '').substring(0, 35))}</td>
                                <td style="padding:7px 10px;color:#6b7280;">${escapeHtml(c.postcode || '—')}</td>
                                <td style="padding:7px 10px;text-align:center;">
                                    <span style="background:${zoneColor}20;color:${zoneColor};padding:2px 8px;border-radius:20px;font-weight:600;font-size:11px;">${escapeHtml(c.zone)}</span>
                                </td>
                                <td style="padding:7px 10px;text-align:center;">
                                    <button onclick="adminEditCustomer(${c.id})" 
                                        style="background:#3b82f6;color:white;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px;margin-right:4px;">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button onclick="adminDeleteCustomer(${c.id}, '${escapeHtml(c.name).replace(/'/g, "\\'")}')" 
                                        style="background:#ef4444;color:white;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px;">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                    ${customers.length > 200 ? `<tr><td colspan="5" style="padding:8px;text-align:center;color:#9ca3af;font-size:11px;">Showing 200 of ${customers.length}</td></tr>` : ''}
                </tbody>
            </table>
        </div>
    `;
}

// Simple escape to prevent XSS
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}





function filterAdminCustomerList(q){var el=document.getElementById('cfg-customer-list');if(!el)return;el.querySelectorAll('tbody tr').forEach(function(r){r.style.display=(!q||r.textContent.toLowerCase().includes(q.toLowerCase()))?'':'none';});}

// ── New settings helpers ──
function adminToggleDay(id, btn) {
    var days = window._adminActiveDays || [];
    var idx = days.indexOf(id);
    if (idx === -1) { days.push(id); btn.style.background='#16a34a'; btn.style.color='white'; btn.style.borderColor='#16a34a'; }
    else            { days.splice(idx,1); btn.style.background='white'; btn.style.color='#6b7280'; btn.style.borderColor='#e5e7eb'; }
    window._adminActiveDays = days;
}
function adminSelectTimeFormat(fmt) {
    ['cfg-tf-24','cfg-tf-12'].forEach(function(id){
        var b=document.getElementById(id);
        if(!b)return;
        var active=((fmt==='24'&&id==='cfg-tf-24')||(fmt==='12'&&id==='cfg-tf-12'));
        b.style.background=active?'#16a34a':'white';
        b.style.color=active?'white':'#374151';
        b.style.borderColor=active?'#16a34a':'#e5e7eb';
    });
    window._adminTimeFormat=fmt;
}
function adminSelectMapStyle(style) {
    document.querySelectorAll('.map-style-btn').forEach(function(b){
        var active=b.dataset.style===style;
        b.style.background=active?'#16a34a':'white';
        b.style.color=active?'white':'#374151';
        b.style.borderColor=active?'#16a34a':'#e5e7eb';
    });
    window._adminMapStyle=style;
    if(typeof applyMapStyle==='function') applyMapStyle(style);
}

function adminGamificationUpdate(type, key, field, value) {
    if (type === 'challenge') {
        if (!window._adminChallenges[key]) window._adminChallenges[key] = {};
        window._adminChallenges[key][field] = value;
    } else if (type === 'award') {
        if (!window._adminMonthlyAwards[key]) window._adminMonthlyAwards[key] = {};
        window._adminMonthlyAwards[key][field] = value;
    }
}
function buildGamificationPanel(cfg) {
    var IS = 'width:100%;padding:8px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;outline:none;box-sizing:border-box;';
    var html = '<div id="apanel-gamification" style="display:none;">';
    html += '<h4 style="font-size:13px;font-weight:700;margin-bottom:4px;color:#1c1917;"><i class="fas fa-flag-checkered" style="color:#16a34a;margin-right:6px;"></i>Challenges</h4>';
    html += '<p style="font-size:11px;color:#9ca3af;margin-bottom:12px;">Edit the name, description and colour of each challenge shown in the Gamification screen.</p>';
    var challenges = typeof CHALLENGES !== 'undefined' ? CHALLENGES : {};
    Object.keys(challenges).forEach(function(key) {
        var ch = challenges[key];
        var saved = (cfg.challenges && cfg.challenges[key]) || {};
        var name = saved.name || ch.name;
        var desc = (saved.description || ch.description || '').replace(/'/g, '&#39;');
        var color = saved.color || ch.color;
        html += '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:8px;">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
            '<i class="fas ' + ch.icon + '" style="color:' + color + ';font-size:14px;"></i>' +
            '<strong style="font-size:12px;">' + key + '</strong>' +
            '<span style="font-size:10px;color:#9ca3af;background:#f3f4f6;padding:2px 6px;border-radius:4px;">' + (ch.metric || '') + ' &middot; ' + (ch.duration || '') + '</span>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 40px;gap:8px;">' +
            '<input type="text" value="' + name + '" placeholder="Challenge name" style="' + IS + '" oninput="adminGamificationUpdate(\'challenge\',\'' + key + '\',\'name\',this.value)">' +
            '<input type="text" value="' + desc + '" placeholder="Description" style="' + IS + '" oninput="adminGamificationUpdate(\'challenge\',\'' + key + '\',\'description\',this.value)">' +
            '<input type="color" value="' + color + '" style="height:36px;border:1px solid #e5e7eb;border-radius:6px;padding:2px;cursor:pointer;width:100%;" oninput="adminGamificationUpdate(\'challenge\',\'' + key + '\',\'color\',this.value)">' +
            '</div></div>';
    });
    var awards = typeof MONTHLY_AWARDS !== 'undefined' ? MONTHLY_AWARDS : {};
    html += '<h4 style="font-size:13px;font-weight:700;margin-top:20px;margin-bottom:4px;color:#1c1917;"><i class="fas fa-trophy" style="color:#fbbf24;margin-right:6px;"></i>Monthly Awards</h4>';
    html += '<p style="font-size:11px;color:#9ca3af;margin-bottom:12px;">Edit the name, description and colour of each monthly award.</p>';
    Object.keys(awards).forEach(function(key) {
        var aw = awards[key];
        var saved = (cfg.monthlyAwards && cfg.monthlyAwards[key]) || {};
        var name = saved.name || aw.name;
        var desc = (saved.description || aw.description || '').replace(/'/g, '&#39;');
        var color = saved.color || aw.color;
        html += '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:8px;">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
            '<i class="fas ' + aw.icon + '" style="color:' + color + ';font-size:14px;"></i>' +
            '<strong style="font-size:12px;">' + key + '</strong>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 40px;gap:8px;">' +
            '<input type="text" value="' + name + '" placeholder="Award name" style="' + IS + '" oninput="adminGamificationUpdate(\'award\',\'' + key + '\',\'name\',this.value)">' +
            '<input type="text" value="' + desc + '" placeholder="Description" style="' + IS + '" oninput="adminGamificationUpdate(\'award\',\'' + key + '\',\'description\',this.value)">' +
            '<input type="color" value="' + color + '" style="height:36px;border:1px solid #e5e7eb;border-radius:6px;padding:2px;cursor:pointer;width:100%;" oninput="adminGamificationUpdate(\'award\',\'' + key + '\',\'color\',this.value)">' +
            '</div></div>';
    });
    html += '</div>';
    return html;
}

// ========== ADMIN SETTINGS MODAL ==========
function openAdminSettings(){
    var e=document.getElementById('adminSettingsModal');if(e)e.remove();
    var cfg=companyConfig||{};
    var vans=(cfg.vans||VANS.map(function(v){return {id:v.id,name:v.name,color:v.color,capacity:v.capacity};})).map(function(v){var cap=(typeof VAN_CAPACITY!=='undefined'&&VAN_CAPACITY[v.id])||{};return {id:v.id,name:v.name,color:v.color,capacity:v.capacity||50,maxPlants:v.maxPlants||cap.maxPlants||500,maxStops:v.maxStops||cap.maxStops||15,maxDistance:v.maxDistance||cap.maxDistance||200,efficiency:v.efficiency!=null?v.efficiency:(cap.efficiency||1.0),preferredZones:v.preferredZones||cap.preferredZones||[],maxSpeedMph:v.maxSpeedMph||cap.maxSpeedMph||0};});
    var zones=cfg.zones||Object.entries(ZONES).filter(function(e){return e[0]!=='Collection';}).map(function(e){var n=e[0],z=e[1];return {name:n,color:z.color,latMin:z.latRange?.[0]||'',latMax:z.latRange?.[1]||'',lngMin:z.lngRange?.[0]||'',lngMax:z.lngRange?.[1]||'',isLocal:n==='Local'};});
    window._adminVans=JSON.parse(JSON.stringify(vans));
    window._adminZones=JSON.parse(JSON.stringify(zones));
    window._adminActiveDays=JSON.parse(JSON.stringify(cfg.activeDays||DAYS.map(function(d){return d.id;})));
    window._adminTimeFormat=cfg.timeFormat||'24';
    window._adminMapStyle=cfg.mapStyle||'streets';
    window._adminChallenges=JSON.parse(JSON.stringify(cfg.challenges||{}));
    window._adminMonthlyAwards=JSON.parse(JSON.stringify(cfg.monthlyAwards||{}));
    var IS='width:100%;padding:8px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;outline:none;box-sizing:border-box;';
    var zoneOptions=Object.keys(ZONES).map(function(z){return '<option value="'+z+'">'+z+'</option>';}).join('');
    var dayOptions='<option value="">— Unscheduled —</option>'+DAYS.map(function(d){return '<option value="'+d.id+'">'+d.name+'</option>';}).join('');
    var m=document.createElement('div');m.id='adminSettingsModal';
    m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto;';
    m.innerHTML=`<div style="background:white;border-radius:16px;width:100%;max-width:800px;margin:auto;box-shadow:0 24px 64px rgba(0,0,0,0.3);overflow:hidden;">
        <div style="background:#1c1917;padding:18px 24px;display:flex;align-items:center;justify-content:space-between;">
            <h2 style="color:white;font-size:17px;font-weight:700;margin:0;"><i class="fas fa-cog" style="color:#16a34a;margin-right:8px;"></i>Company Settings</h2>
            <button onclick="document.getElementById('adminSettingsModal').remove()" style="background:rgba(255,255,255,0.1);border:none;color:white;width:30px;height:30px;border-radius:6px;cursor:pointer;font-size:15px;">✕</button>
        </div>
        <div style="display:flex;flex-wrap:wrap;border-bottom:2px solid #f3f4f6;background:#fafafa;">
            <button onclick="adminTab('company')"   id="atab-company"   style="padding:11px 14px;border:none;background:transparent;cursor:pointer;font-weight:600;font-size:12px;white-space:nowrap;border-bottom:3px solid #16a34a;color:#16a34a;">🏢 Company</button>
            <button onclick="adminTab('warehouse')" id="atab-warehouse" style="padding:11px 14px;border:none;background:transparent;cursor:pointer;font-weight:600;font-size:12px;white-space:nowrap;border-bottom:3px solid transparent;color:#6b7280;">📍 Warehouse</button>
            <button onclick="adminTab('vans')"      id="atab-vans"      style="padding:11px 14px;border:none;background:transparent;cursor:pointer;font-weight:600;font-size:12px;white-space:nowrap;border-bottom:3px solid transparent;color:#6b7280;">🚐 Vans</button>
            <button onclick="adminTab('zones')"     id="atab-zones"     style="padding:11px 14px;border:none;background:transparent;cursor:pointer;font-weight:600;font-size:12px;white-space:nowrap;border-bottom:3px solid transparent;color:#6b7280;">🗺️ Zones</button>
            <button onclick="adminTab('customers')" id="atab-customers" style="padding:11px 14px;border:none;background:transparent;cursor:pointer;font-weight:600;font-size:12px;white-space:nowrap;border-bottom:3px solid transparent;color:#6b7280;">👥 Customers</button>
            <button onclick="adminTab('mapview')"   id="atab-mapview"   style="padding:11px 14px;border:none;background:transparent;cursor:pointer;font-weight:600;font-size:12px;white-space:nowrap;border-bottom:3px solid transparent;color:#6b7280;">🌍 Map</button>
            <button onclick="adminTab('days')"      id="atab-days"      style="padding:11px 14px;border:none;background:transparent;cursor:pointer;font-weight:600;font-size:12px;white-space:nowrap;border-bottom:3px solid transparent;color:#6b7280;">📅 Days</button>
            <button onclick="adminTab('display')"   id="atab-display"   style="padding:11px 14px;border:none;background:transparent;cursor:pointer;font-weight:600;font-size:12px;white-space:nowrap;border-bottom:3px solid transparent;color:#6b7280;">🖥️ Display</button>
            <button onclick="adminTab('system')"    id="atab-system"    style="padding:11px 14px;border:none;background:transparent;cursor:pointer;font-weight:600;font-size:12px;white-space:nowrap;border-bottom:3px solid transparent;color:#6b7280;">⚙️ System</button>
            <button onclick="adminTab('gamification')" id="atab-gamification" style="padding:11px 14px;border:none;background:transparent;cursor:pointer;font-weight:600;font-size:12px;white-space:nowrap;border-bottom:3px solid transparent;color:#6b7280;">🎮 Gamification</button>
            <button onclick="adminTab('audit');loadAuditLog()" id="atab-audit" style="padding:11px 14px;border:none;background:transparent;cursor:pointer;font-weight:600;font-size:12px;white-space:nowrap;border-bottom:3px solid transparent;color:#6b7280;">🔍 Audit Log</button>
        </div>
        <div style="padding:22px;">
            <div id="apanel-company"><div style="margin-bottom:14px;"><label style="display:block;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px;">Company / App Name</label><input id="cfg-companyName" type="text" value="${cfg.companyName||'PEP'}" style="${IS}"><p style="font-size:11px;color:#9ca3af;margin-top:3px;">Shown in header, login screen and browser tab.</p></div><div><label style="display:block;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px;">Tagline</label><input id="cfg-tagline" type="text" value="${cfg.companyTagline||'Delivery Management'}" style="${IS}"></div></div>
            <div id="apanel-warehouse" style="display:none;"><div style="margin-bottom:14px;"><label style="display:block;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px;">Warehouse Name</label><input id="cfg-whName" type="text" value="${cfg.warehouseName||YOUR_SITE.name}" style="${IS}"></div><div style="margin-bottom:14px;"><label style="display:block;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px;">Address</label><input id="cfg-whAddress" type="text" value="${cfg.warehouseAddress||YOUR_SITE.address}" style="${IS}"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;"><div><label style="display:block;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px;">Latitude</label><input id="cfg-whLat" type="number" step="0.0001" value="${cfg.warehouseLat||YOUR_SITE.lat}" style="${IS}"></div><div><label style="display:block;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px;">Longitude</label><input id="cfg-whLng" type="number" step="0.0001" value="${cfg.warehouseLng||YOUR_SITE.lng}" style="${IS}"></div></div><div style="margin-bottom:14px;"><label style="display:block;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px;">Local Zone Radius (km)</label><input id="cfg-localRadius" type="number" step="1" value="${cfg.localZoneRadius||20}" style="${IS}"></div><div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;font-size:12px;color:#1e40af;"><i class="fas fa-circle-info"></i> <a href="https://maps.google.com" target="_blank">maps.google.com</a> → right-click warehouse → "What's here?" for coordinates.</div></div>
            <div id="apanel-vans" style="display:none;"><p style="font-size:12px;color:#6b7280;margin-bottom:12px;">Each van gets its own colour on the map and weekly plan.</p><div id="cfg-vans-list"></div><button onclick="adminAddVan()" style="background:#16a34a;color:white;border:none;padding:8px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;margin-top:4px;"><i class="fas fa-plus"></i> Add Van</button></div>
            <div id="apanel-zones" style="display:none;"><p style="font-size:12px;color:#6b7280;margin-bottom:12px;">Zones matched by lat/lng bounding boxes. "Collection" is always present.</p><div id="cfg-zones-list"></div><button onclick="adminAddZone()" style="background:#16a34a;color:white;border:none;padding:8px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;margin-top:4px;"><i class="fas fa-plus"></i> Add Zone</button></div>
            <div id="apanel-customers" style="display:none;">
                <div style="background:#f0fdf4;border:2px solid #bbf7d0;border-radius:10px;padding:16px;margin-bottom:20px;"><h4 style="margin:0 0 12px 0;font-size:13px;font-weight:700;color:#166534;"><i class="fas fa-user-plus"></i> Add New Customer</h4>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;"><div><label style="display:block;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Name *</label><input id="cfg-cust-name" type="text" placeholder="Customer / company name" style="${IS}"></div><div><label style="display:block;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Address</label><input id="cfg-cust-address" type="text" placeholder="Full delivery address" style="${IS}"></div></div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:10px;margin-bottom:12px;"><div><label style="display:block;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Postcode</label><input id="cfg-cust-postcode" type="text" placeholder="e.g. BN6 9RR" style="${IS}"></div><div><label style="display:block;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Latitude *</label><input id="cfg-cust-lat" type="number" step="0.0001" placeholder="50.936" style="${IS}"></div><div><label style="display:block;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Longitude *</label><input id="cfg-cust-lng" type="number" step="0.0001" placeholder="-0.105" style="${IS}"></div><div><label style="display:block;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Zone</label><select id="cfg-cust-zone" style="${IS}">${zoneOptions}</select></div><div><label style="display:block;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Delivery Day</label><select id="cfg-cust-day" style="${IS}">${dayOptions}</select></div></div>
                <button onclick="adminSaveCustomer()" style="background:#16a34a;color:white;border:none;padding:9px 20px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700;"><i class="fas fa-plus"></i> Add Customer</button>
                <span style="font-size:11px;color:#9ca3af;margin-left:10px;">Find lat/lng: <a href="https://maps.google.com" target="_blank" style="color:#16a34a;">maps.google.com</a> → right-click → "What's here?"</span></div>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;"><h4 style="margin:0;font-size:13px;font-weight:700;"><i class="fas fa-users"></i> Existing Customers (<span id="cfg-cust-count">0</span>)</h4><input type="text" id="cfg-cust-search" placeholder="🔍 Search..." oninput="filterAdminCustomerList(this.value)" style="padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;width:200px;outline:none;"></div>
                <div id="cfg-customer-list" style="max-height:300px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:8px;"></div>
            </div>
            <div id="apanel-mapview" style="display:none;">
                <div style="margin-bottom:16px;"><label style="display:block;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Map Style</label>
                <div style="display:flex;flex-wrap:wrap;gap:8px;">${[['streets','🗺️ Streets'],['light','☀️ Light'],['dark','🌙 Dark'],['topo','⛰️ Topo'],['watercolor','🎨 Watercolor']].map(function(s){var active=(cfg.mapStyle||'streets')===s[0];return '<button class="map-style-btn" data-style="'+s[0]+'" onclick="adminSelectMapStyle(\''+s[0]+'\')" style="padding:7px 14px;border:1px solid '+(active?'#16a34a':'#e5e7eb')+';border-radius:6px;background:'+(active?'#16a34a':'white')+';color:'+(active?'white':'#374151')+';cursor:pointer;font-size:12px;font-weight:600;">'+s[1]+'</button>';}).join('')}</div></div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;"><div><label style="display:block;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px;">Default Lat</label><input id="cfg-mapLat" type="number" step="0.1" value="${cfg.mapDefaultLat||YOUR_SITE.lat}" style="${IS}"></div><div><label style="display:block;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px;">Default Lng</label><input id="cfg-mapLng" type="number" step="0.1" value="${cfg.mapDefaultLng||YOUR_SITE.lng}" style="${IS}"></div><div><label style="display:block;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px;">Zoom (1–18)</label><input id="cfg-mapZoom" type="number" min="1" max="18" value="${cfg.mapDefaultZoom||6}" style="${IS}"></div></div><div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;font-size:12px;color:#166534;"><strong>Presets:</strong><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;"><button onclick="adminMapPreset(54.5,-2.5,6)" style="padding:4px 10px;border:1px solid #16a34a;border-radius:4px;background:white;cursor:pointer;font-size:11px;">🇬🇧 UK</button><button onclick="adminMapPreset(46.2,2.2,6)" style="padding:4px 10px;border:1px solid #16a34a;border-radius:4px;background:white;cursor:pointer;font-size:11px;">🇫🇷 France</button><button onclick="adminMapPreset(51.2,10.4,6)" style="padding:4px 10px;border:1px solid #16a34a;border-radius:4px;background:white;cursor:pointer;font-size:11px;">🇩🇪 Germany</button><button onclick="adminMapPreset(40.4,-3.7,6)" style="padding:4px 10px;border:1px solid #16a34a;border-radius:4px;background:white;cursor:pointer;font-size:11px;">🇪🇸 Spain</button><button onclick="adminMapPreset(42.8,12.5,6)" style="padding:4px 10px;border:1px solid #16a34a;border-radius:4px;background:white;cursor:pointer;font-size:11px;">🇮🇹 Italy</button><button onclick="adminMapPreset(37.9,-95.7,4)" style="padding:4px 10px;border:1px solid #16a34a;border-radius:4px;background:white;cursor:pointer;font-size:11px;">🇺🇸 USA</button><button onclick="adminMapPreset(-25.3,133.8,4)" style="padding:4px 10px;border:1px solid #16a34a;border-radius:4px;background:white;cursor:pointer;font-size:11px;">🇦🇺 AU</button><button onclick="adminMapPreset(-40.9,174.9,5)" style="padding:4px 10px;border:1px solid #16a34a;border-radius:4px;background:white;cursor:pointer;font-size:11px;">🇳🇿 NZ</button></div></div></div>

            <div id="apanel-days" style="display:none;">
                <p style="font-size:12px;color:#6b7280;margin-bottom:14px;">Toggle which days appear in the delivery planner. Disabling a day hides it from the UI without removing existing assignments.</p>
                <div style="display:flex;flex-wrap:wrap;gap:10px;">${DAYS.map(function(d){var active=(window._adminActiveDays||[]).indexOf(d.id)!==-1;return '<button onclick="adminToggleDay('+d.id+',this)" style="padding:10px 18px;border:1px solid '+(active?'#16a34a':'#e5e7eb')+';border-radius:8px;background:'+(active?'#16a34a':'white')+';color:'+(active?'white':'#6b7280')+';cursor:pointer;font-size:13px;font-weight:700;min-width:90px;">'+d.name+'</button>';}).join('')}</div>
                <p style="font-size:11px;color:#9ca3af;margin-top:14px;"><i class="fas fa-circle-info"></i> Click a day to toggle it on/off. Green = active.</p>
            </div>

            <div id="apanel-display" style="display:none;">
                <div style="margin-bottom:18px;"><label style="display:block;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px;">Scroll Threshold (characters)</label>
                <input id="cfg-marquee" type="number" min="10" max="100" value="${cfg.marqueeThreshold||30}" style="${IS}">
                <p style="font-size:11px;color:#9ca3af;margin-top:3px;">Customer name scrolls in the card when it exceeds this length. Default: 30.</p></div>
                <div><label style="display:block;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Clock Format</label>
                <div style="display:flex;gap:10px;">
                    <button id="cfg-tf-24" onclick="adminSelectTimeFormat('24')" style="padding:9px 20px;border:1px solid ${(cfg.timeFormat||'24')==='24'?'#16a34a':'#e5e7eb'};border-radius:8px;background:${(cfg.timeFormat||'24')==='24'?'#16a34a':'white'};color:${(cfg.timeFormat||'24')==='24'?'white':'#374151'};cursor:pointer;font-size:13px;font-weight:700;">🕐 24-hour (14:30)</button>
                    <button id="cfg-tf-12" onclick="adminSelectTimeFormat('12')" style="padding:9px 20px;border:1px solid ${(cfg.timeFormat||'24')==='12'?'#16a34a':'#e5e7eb'};border-radius:8px;background:${(cfg.timeFormat||'24')==='12'?'#16a34a':'white'};color:${(cfg.timeFormat||'24')==='12'?'white':'#374151'};cursor:pointer;font-size:13px;font-weight:700;">🕐 12-hour (2:30 PM)</button>
                </div></div>
            </div>

            <div id="apanel-system" style="display:none;">
                <div style="margin-bottom:18px;"><label style="display:block;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px;">Stop Time Estimate (minutes per delivery)</label>
                <input id="cfg-stopTime" type="number" min="1" max="120" value="${cfg.stopTime||15}" style="${IS}">
                <p style="font-size:11px;color:#9ca3af;margin-top:3px;">Added per stop when calculating total route duration on the printed driver sheet. Default: 15.</p></div>
                <div style="margin-bottom:18px;"><label style="display:block;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px;">Reconnect Interval (seconds)</label>
                <input id="cfg-reconnect" type="number" min="5" max="300" value="${cfg.reconnectInterval||30}" style="${IS}">
                <p style="font-size:11px;color:#9ca3af;margin-top:3px;">How often the app tries to re-establish the server connection when offline. Default: 30.</p></div>
                <div><label style="display:block;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px;">Proximity Threshold (km)</label>
                <input id="cfg-proximityThreshold" type="number" min="1" max="200" value="${cfg.proximityThreshold||15}" style="${IS}">
                <p style="font-size:11px;color:#9ca3af;margin-top:3px;">Customers within this distance are considered "close" during smart grouping. Default: 15.</p></div>
            </div>
            ${buildGamificationPanel(cfg)}
            <div id="apanel-audit" style="display:none;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <input id="audit-q-user" type="text" placeholder="Username…" style="padding:7px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;width:120px;" oninput="loadAuditLog()">
                        <select id="audit-q-action" style="padding:7px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;" onchange="loadAuditLog()">
                            <option value="">All Actions</option>
                            <option value="auth.login">Login</option>
                            <option value="user">Users</option>
                            <option value="customer">Customers</option>
                            <option value="delivery">Delivery saves</option>
                            <option value="config">Config changes</option>
                        </select>
                        <input id="audit-q-from" type="date" style="padding:7px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;" onchange="loadAuditLog()">
                        <input id="audit-q-to"   type="date" style="padding:7px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;" onchange="loadAuditLog()">
                    </div>
                    <span id="audit-count" style="font-size:11px;color:#9ca3af;"></span>
                </div>
                <div id="audit-log-table" style="overflow-x:auto;max-height:420px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:8px;">
                    <table style="width:100%;border-collapse:collapse;font-size:12px;">
                        <thead><tr style="background:#f9fafb;position:sticky;top:0;">
                            <th style="padding:8px 12px;text-align:left;font-weight:700;color:#374151;white-space:nowrap;border-bottom:1px solid #e5e7eb;">Time</th>
                            <th style="padding:8px 12px;text-align:left;font-weight:700;color:#374151;border-bottom:1px solid #e5e7eb;">User</th>
                            <th style="padding:8px 12px;text-align:left;font-weight:700;color:#374151;border-bottom:1px solid #e5e7eb;">Action</th>
                            <th style="padding:8px 12px;text-align:left;font-weight:700;color:#374151;border-bottom:1px solid #e5e7eb;">Target</th>
                            <th style="padding:8px 12px;text-align:left;font-weight:700;color:#374151;border-bottom:1px solid #e5e7eb;">Details</th>
                        </tr></thead>
                        <tbody id="audit-log-body"><tr><td colspan="5" style="padding:24px;text-align:center;color:#9ca3af;">Loading…</td></tr></tbody>
                    </table>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
                    <button id="audit-prev" onclick="auditPage(-1)" style="padding:6px 14px;border:1px solid #e5e7eb;border-radius:6px;background:white;cursor:pointer;font-size:12px;font-weight:600;">← Prev</button>
                    <span id="audit-page-label" style="font-size:11px;color:#6b7280;"></span>
                    <button id="audit-next" onclick="auditPage(1)"  style="padding:6px 14px;border:1px solid #e5e7eb;border-radius:6px;background:white;cursor:pointer;font-size:12px;font-weight:600;">Next →</button>
                </div>
            </div>
        </div>
        <div style="padding:14px 22px;border-top:1px solid #f3f4f6;display:flex;justify-content:space-between;align-items:center;background:#fafafa;">
            <span style="font-size:11px;color:#9ca3af;">Company, Warehouse, Vans, Zones and Map saved together.</span>
            <div style="display:flex;gap:10px;"><button onclick="document.getElementById('adminSettingsModal').remove()" style="padding:9px 18px;border:1px solid #e5e7eb;border-radius:8px;background:white;cursor:pointer;font-size:13px;font-weight:600;">Close</button><button id="admin-save-btn" onclick="adminSaveAll()" style="padding:9px 18px;background:#16a34a;color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;"><i class="fas fa-save"></i> Save Settings</button></div>
        </div>
    </div>`;
    document.body.appendChild(m);
    refreshAdminVanList();
    refreshAdminZoneList();
}




function setCustomerFilter(filter) {
    currentCustomerFilter = filter;
    document.querySelectorAll('.filter-assign-btn').forEach(btn => btn.classList.remove('active'));
    if (filter === 'all') document.querySelector('.filter-assign-btn:nth-child(1)').classList.add('active');
    else if (filter === 'assigned') document.querySelector('.filter-assign-btn:nth-child(2)').classList.add('active');
    else document.querySelector('.filter-assign-btn:nth-child(3)').classList.add('active');
    renderModalCustomerList();
}


function adminTab(n){['company','warehouse','vans','zones','customers','mapview','days','display','system','gamification','audit'].forEach(function(t){var p=document.getElementById('apanel-'+t),b=document.getElementById('atab-'+t);if(p)p.style.display=t===n?'block':'none';if(b){b.style.borderBottom=t===n?'3px solid #16a34a':'3px solid transparent';b.style.color=t===n?'#16a34a':'#6b7280';}});var sb=document.getElementById('admin-save-btn');if(sb)sb.style.display=n==='audit'?'none':'inline-flex';if(n==='customers'){var cc=document.getElementById('cfg-cust-count');if(cc)cc.textContent=customers.length;renderAdminCustomerList();var sel=document.getElementById('cfg-cust-zone');if(sel)sel.innerHTML=Object.keys(ZONES).map(function(z){return '<option value="'+z+'">'+z+'</option>';}).join('');}}

var _auditOffset = 0;
var _auditLimit  = 50;

function loadAuditLog(resetPage) {
    if (resetPage !== false) _auditOffset = 0;
    var user   = (document.getElementById('audit-q-user')?.value   || '').trim();
    var action = (document.getElementById('audit-q-action')?.value || '').trim();
    var from   = (document.getElementById('audit-q-from')?.value   || '').trim();
    var to     = (document.getElementById('audit-q-to')?.value     || '').trim();
    var qs = '?limit=' + _auditLimit + '&offset=' + _auditOffset;
    if (user)   qs += '&username=' + encodeURIComponent(user);
    if (action) qs += '&action='   + encodeURIComponent(action);
    if (from)   qs += '&from='     + encodeURIComponent(from);
    if (to)     qs += '&to='       + encodeURIComponent(to);
    fetch(SERVER_URL + '/api/audit' + qs, { credentials: 'include' })
        .then(function(r){ return r.json(); })
        .then(function(d) {
            if (!d.success) return;
            var tbody = document.getElementById('audit-log-body');
            var count = document.getElementById('audit-count');
            var label = document.getElementById('audit-page-label');
            var prev  = document.getElementById('audit-prev');
            var next  = document.getElementById('audit-next');
            if (count) count.textContent = d.total + ' records';
            var from2 = d.offset + 1, to2 = Math.min(d.offset + d.limit, d.total);
            if (label) label.textContent = d.total ? from2 + '–' + to2 + ' of ' + d.total : '0 records';
            if (prev) prev.disabled = d.offset === 0;
            if (next) next.disabled = d.offset + d.limit >= d.total;
            var BADGES = {
                'auth.login':'background:#dcfce7;color:#166534;',
                'user.create':'background:#dbeafe;color:#1e40af;',
                'user.update':'background:#e0e7ff;color:#3730a3;',
                'user.delete':'background:#fee2e2;color:#991b1b;',
                'customer.create':'background:#dbeafe;color:#1e40af;',
                'customer.update':'background:#e0e7ff;color:#3730a3;',
                'customer.delete':'background:#fee2e2;color:#991b1b;',
                'delivery.save':'background:#fef9c3;color:#854d0e;',
                'config.update':'background:#f3e8ff;color:#6b21a8;',
            };
            if (!d.logs.length) {
                tbody.innerHTML = '<tr><td colspan="5" style="padding:24px;text-align:center;color:#9ca3af;">No records found</td></tr>';
                return;
            }
            tbody.innerHTML = d.logs.map(function(row) {
                var ts = new Date(row.timestamp + (row.timestamp.endsWith('Z') ? '' : 'Z'));
                var timeStr = ts.toLocaleDateString() + ' ' + ts.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
                var badge = BADGES[row.action] || 'background:#f3f4f6;color:#374151;';
                var details = '';
                if (row.details) {
                    try {
                        var d2 = JSON.parse(row.details);
                        details = Object.entries(d2).map(function(e){ return e[0]+': '+e[1]; }).join(', ');
                    } catch(e) { details = row.details; }
                }
                return '<tr style="border-top:1px solid #f3f4f6;">' +
                    '<td style="padding:8px 12px;white-space:nowrap;color:#6b7280;">' + timeStr + '</td>' +
                    '<td style="padding:8px 12px;font-weight:600;color:#111827;">' + (row.username || '—') + '</td>' +
                    '<td style="padding:8px 12px;"><span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;' + badge + '">' + row.action + '</span></td>' +
                    '<td style="padding:8px 12px;color:#374151;">' + (row.entity_name || row.entity_type || '—') + '</td>' +
                    '<td style="padding:8px 12px;color:#6b7280;font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + details.replace(/"/g,'&quot;') + '">' + details + '</td>' +
                '</tr>';
            }).join('');
        })
        .catch(function(e){ console.error('Audit log fetch error', e); });
}

function auditPage(dir) {
    _auditOffset = Math.max(0, _auditOffset + dir * _auditLimit);
    loadAuditLog(false);
}

function adminVanUpdate(i,f,v){if(!window._adminVans[i])return;if(f==='capacity'||f==='maxPlants'||f==='maxStops'||f==='maxDistance')window._adminVans[i][f]=parseInt(v)||0;else if(f==='efficiency'||f==='maxSpeedMph')window._adminVans[i][f]=parseFloat(v)||0;else if(f==='preferredZones')window._adminVans[i][f]=v.split(',').map(function(s){return s.trim();}).filter(Boolean);else window._adminVans[i][f]=v;}
function adminZoneUpdate(i,f,v){if(window._adminZones[i])window._adminZones[i][f]=v;}
function adminToggleZoneGeo(i,l){var g=document.querySelector('.zone-geo-'+i);if(g)g.style.display=l?'none':'grid';}
function adminAddVan(){var id=window._adminVans.length>0?Math.max.apply(null,window._adminVans.map(function(v){return v.id;}))+1:1;window._adminVans.push({id:id,name:'Van '+id,color:'#6366f1',capacity:50,maxPlants:500,maxStops:15,maxDistance:200,efficiency:1.0,preferredZones:[],maxSpeedMph:0});refreshAdminVanList();}
function adminRemoveVan(i){if(window._adminVans.length<=1){showNotification('Need at least 1 van','warning');return;}window._adminVans.splice(i,1);refreshAdminVanList();}
function refreshAdminVanList(){var IS='width:100%;padding:8px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;outline:none;box-sizing:border-box;';var DS='background:#ef4444;color:white;border:none;padding:8px 10px;border-radius:6px;cursor:pointer;font-size:12px;';var el=document.getElementById('cfg-vans-list');if(!el)return;el.innerHTML=window._adminVans.map(function(v,i){return '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:10px;"><div style="display:grid;grid-template-columns:1fr 50px 80px auto;gap:8px;align-items:center;margin-bottom:8px;"><input type="text" value="'+v.name+'" placeholder="Van name" style="'+IS+'" oninput="adminVanUpdate('+i+',\'name\',this.value)"><input type="color" value="'+v.color+'" style="height:36px;border:1px solid #e5e7eb;border-radius:6px;padding:2px;cursor:pointer;width:100%;" oninput="adminVanUpdate('+i+',\'color\',this.value)"><input type="number" value="'+(v.capacity||50)+'" placeholder="Capacity" style="'+IS+'" oninput="adminVanUpdate('+i+',\'capacity\',this.value)"><button onclick="adminRemoveVan('+i+')" style="'+DS+'"><i class="fas fa-trash"></i></button></div><div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:8px;margin-bottom:8px;"><div><label style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;display:block;margin-bottom:3px;">Max Plants</label><input type="number" value="'+(v.maxPlants||500)+'" style="'+IS+'" oninput="adminVanUpdate('+i+',\'maxPlants\',this.value)"></div><div><label style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;display:block;margin-bottom:3px;">Max Stops</label><input type="number" value="'+(v.maxStops||15)+'" style="'+IS+'" oninput="adminVanUpdate('+i+',\'maxStops\',this.value)"></div><div><label style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;display:block;margin-bottom:3px;">Max Distance (km)</label><input type="number" value="'+(v.maxDistance||200)+'" style="'+IS+'" oninput="adminVanUpdate('+i+',\'maxDistance\',this.value)"></div><div><label style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;display:block;margin-bottom:3px;">Max Speed (mph)</label><input type="number" min="0" max="200" placeholder="0 = no limit" value="'+(v.maxSpeedMph||'')+'" style="'+IS+'" title="Speed limit in mph (e.g. 54 for the large van). Leave 0 if no limit. Used by PEP strategy for accurate drive time." oninput="adminVanUpdate('+i+',\'maxSpeedMph\',this.value)"></div><div><label style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;display:block;margin-bottom:3px;">Efficiency</label><input type="number" step="0.05" min="0.1" max="3" value="'+(v.efficiency!=null?v.efficiency:1.0)+'" style="'+IS+'" oninput="adminVanUpdate('+i+',\'efficiency\',this.value)"></div></div><div><label style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;display:block;margin-bottom:3px;">Preferred Zones (comma-separated)</label><input type="text" value="'+((v.preferredZones||[]).join(', '))+'" placeholder="e.g. North West, Local" style="'+IS+'" oninput="adminVanUpdate('+i+',\'preferredZones\',this.value)"></div></div>';}).join('');}
function adminAddZone(){window._adminZones.push({name:'New Zone',color:'#6366f1',latMin:'',latMax:'',lngMin:'',lngMax:'',isLocal:false});refreshAdminZoneList();}
function adminRemoveZone(i){window._adminZones.splice(i,1);refreshAdminZoneList();}
function refreshAdminZoneList(){var IS='width:100%;padding:8px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;outline:none;box-sizing:border-box;';var DS='background:#ef4444;color:white;border:none;padding:8px 10px;border-radius:6px;cursor:pointer;font-size:12px;';var el=document.getElementById('cfg-zones-list');if(!el)return;el.innerHTML=window._adminZones.map(function(z,i){return '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:8px;"><div style="display:grid;grid-template-columns:1fr 50px auto;gap:8px;align-items:center;margin-bottom:8px;"><input type="text" value="'+z.name+'" style="'+IS+'" oninput="adminZoneUpdate('+i+',\'name\',this.value)"><input type="color" value="'+z.color+'" style="height:36px;border:1px solid #e5e7eb;border-radius:6px;padding:2px;cursor:pointer;width:100%;" oninput="adminZoneUpdate('+i+',\'color\',this.value)"><button onclick="adminRemoveZone('+i+')" style="'+DS+'"><i class="fas fa-trash"></i></button></div><label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:8px;cursor:pointer;"><input type="checkbox" '+(z.isLocal?'checked':'')+' onchange="adminZoneUpdate('+i+',\'isLocal\',this.checked);adminToggleZoneGeo('+i+',this.checked)"> Local zone</label><div class="zone-geo-'+i+'" style="display:'+(z.isLocal?'none':'grid')+';grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;"><input type="number" step="0.1" value="'+z.latMin+'" placeholder="Lat min" style="'+IS+'" oninput="adminZoneUpdate('+i+',\'latMin\',this.value)"><input type="number" step="0.1" value="'+z.latMax+'" placeholder="Lat max" style="'+IS+'" oninput="adminZoneUpdate('+i+',\'latMax\',this.value)"><input type="number" step="0.1" value="'+z.lngMin+'" placeholder="Lng min" style="'+IS+'" oninput="adminZoneUpdate('+i+',\'lngMin\',this.value)"><input type="number" step="0.1" value="'+z.lngMax+'" placeholder="Lng max" style="'+IS+'" oninput="adminZoneUpdate('+i+',\'lngMax\',this.value)"></div></div>';}).join('');}
function adminMapPreset(lat,lng,zoom){var l=document.getElementById('cfg-mapLat'),g=document.getElementById('cfg-mapLng'),z=document.getElementById('cfg-mapZoom');if(l)l.value=lat;if(g)g.value=lng;if(z)z.value=zoom;}




async function adminSaveAll(){
    var cfg={
        companyName:(document.getElementById('cfg-companyName')?.value||'').trim()||'PEP',
        companyTagline:(document.getElementById('cfg-tagline')?.value||'').trim()||'Delivery Management',
        warehouseName:(document.getElementById('cfg-whName')?.value||'').trim()||YOUR_SITE.name,
        warehouseAddress:(document.getElementById('cfg-whAddress')?.value||'').trim()||YOUR_SITE.address,
        warehouseLat:parseFloat(document.getElementById('cfg-whLat')?.value)||YOUR_SITE.lat,
        warehouseLng:parseFloat(document.getElementById('cfg-whLng')?.value)||YOUR_SITE.lng,
        localZoneRadius:parseFloat(document.getElementById('cfg-localRadius')?.value)||20,
        mapDefaultLat:parseFloat(document.getElementById('cfg-mapLat')?.value)||YOUR_SITE.lat,
        mapDefaultLng:parseFloat(document.getElementById('cfg-mapLng')?.value)||YOUR_SITE.lng,
        mapDefaultZoom:parseInt(document.getElementById('cfg-mapZoom')?.value)||6,
        mapStyle:window._adminMapStyle||'streets',
        activeDays:window._adminActiveDays||DAYS.map(function(d){return d.id;}),
        marqueeThreshold:parseInt(document.getElementById('cfg-marquee')?.value)||30,
        timeFormat:window._adminTimeFormat||'24',
        stopTime:parseInt(document.getElementById('cfg-stopTime')?.value)||15,
        reconnectInterval:parseInt(document.getElementById('cfg-reconnect')?.value)||30,
        proximityThreshold:parseInt(document.getElementById('cfg-proximityThreshold')?.value)||15,
        challenges:window._adminChallenges||{},
        monthlyAwards:window._adminMonthlyAwards||{},
        vans:window._adminVans||[],
        zones:window._adminZones||[]
    };
    await saveCompanyConfig(cfg);
    document.getElementById('adminSettingsModal')?.remove();
    if(typeof updateMapMarkers==='function'){
        updateMapMarkers();
        addWarehouseMarker();
    }
    // Apply map view from saved settings immediately
    if(typeof map!=='undefined'&&map&&typeof map.setView==='function'&&cfg.mapDefaultLat&&cfg.mapDefaultLng){
        map.setView([cfg.mapDefaultLat, cfg.mapDefaultLng], cfg.mapDefaultZoom);
    }
}



// ── CSS fixes inline ──
(function(){var s=document.createElement('style');s.textContent='.staff-grid{display:block!important;width:100%!important;overflow-x:auto;overflow-y:auto;flex:1;padding:0!important;}.staff-table{width:100%!important;border-collapse:collapse;min-width:640px;}.staff-table-row{border-bottom:1px solid #e7e5e4;transition:background 0.12s;}.staff-table-row:hover{background:#f0fdf4;}.map-overlay{left:auto!important;right:14px!important;}';document.head.appendChild(s);})();

// ========== EXPORTS ==========
window.doLogin=doLogin;window.doLogout=doLogout;window.toggleLoginPw=toggleLoginPw;
window.applyRoleBasedNav=applyRoleBasedNav;
window.refreshDriverView=refreshDriverView;
window.updateTrolleyIndicator=updateTrolleyIndicator;
window.openAdminSettings=openAdminSettings;window.adminTab=adminTab;window.loadAuditLog=loadAuditLog;window.auditPage=auditPage;
window.adminVanUpdate=adminVanUpdate;window.adminZoneUpdate=adminZoneUpdate;
window.adminToggleZoneGeo=adminToggleZoneGeo;window.adminAddVan=adminAddVan;
window.adminRemoveVan=adminRemoveVan;window.adminAddZone=adminAddZone;
window.adminRemoveZone=adminRemoveZone;window.adminMapPreset=adminMapPreset;
window.adminSaveAll=adminSaveAll;
window.adminSaveCustomer=adminSaveCustomer;window.adminDeleteCustomer=adminDeleteCustomer;
window.filterAdminCustomerList=filterAdminCustomerList;
window.adminToggleDay=adminToggleDay;window.adminSelectTimeFormat=adminSelectTimeFormat;
window.adminSelectMapStyle=adminSelectMapStyle;
window.adminGamificationUpdate=adminGamificationUpdate;