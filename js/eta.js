// ========== ETA CALCULATOR ==========
// Business rules:
//   Delivery window:     07:45 - 16:45
//   Pick time:           60 min per trolley
//   Barcoded labels:     +15 min packing
//   Pre-priced labels:   +20 min packing
//   Collection orders:   no travel time (customer collects)
//   Loading time:        20 min per run at warehouse
//   Unloading per stop:  10 min per drop

var ETA_LOADING_TIME_PER_RUN    = 20;
var ETA_UNLOAD_TIME_PER_STOP    = 10;
var ETA_PICK_MINS_PER_TROLLEY   = 60;
var ETA_PACK_BARCODE_EXTRA      = 15;
var ETA_PACK_PREPRICE_EXTRA     = 20;
var ETA_DELIVERY_START          = '07:45';
var ETA_DELIVERY_END            = '16:45';
var ETA_SHIFT_TO_NEXT_WINDOW    = false;
var ETA_HIDE_IF_NOT_STARTED     = false;

var _etaCache = {};

function calculateAllETAs(vanId, dayId) {
    _etaCache = {};
    var runs = computeDeliveryRuns(vanId, dayId);
    if (!runs || runs.length === 0) return _etaCache;
    var now = new Date();

    // Resolve van's configured max speed so drive times are accurate
    var vanSpeedKmh = 0;
    if (vanId && typeof VAN_CAPACITY !== 'undefined' && VAN_CAPACITY[vanId] && VAN_CAPACITY[vanId].maxSpeedMph) {
        vanSpeedKmh = parseFloat(VAN_CAPACITY[vanId].maxSpeedMph) * 1.60934;
    }

    runs.forEach(function(run, runIndex) {
        var runDepart   = _calcRunDeparture(run, now);
        var deliveries  = run.customers.filter(function(c) { return !_isCollection(c); })
                              .sort(function(a,b) { return (a.deliveryOrder||0)-(b.deliveryOrder||0); });
        var collections = run.customers.filter(_isCollection);

        var cumMins = 0, prevLat = YOUR_SITE.lat, prevLng = YOUR_SITE.lng;
        deliveries.forEach(function(customer, stopIdx) {
            var driveMins = _driveMinutes(prevLat, prevLng, customer.lat, customer.lng, vanSpeedKmh);
            cumMins += driveMins;
            var conf = _confidence(customer);
            if (conf === 'hidden') {
                _etaCache[customer.id] = {
                    eta: null, outsideWindow: false, nextDay: false,
                    runNumber: runIndex+1, stopNumber: stopIdx+1, totalStops: deliveries.length,
                    runDepart: runDepart, driveMinutes: Math.round(cumMins),
                    isCollection: false, confidence: 'hidden',
                    label: '--', minutesFromNow: null
                };
            } else {
                var etaMs   = runDepart.getTime() + cumMins*60000 + stopIdx*ETA_UNLOAD_TIME_PER_STOP*60000;
                var eta     = new Date(etaMs);
                var clamped = _clampToWindow(eta);
                _etaCache[customer.id] = {
                    eta: clamped.eta, outsideWindow: clamped.outside, nextDay: clamped.nextDay,
                    runNumber: runIndex+1, stopNumber: stopIdx+1, totalStops: deliveries.length,
                    runDepart: runDepart, driveMinutes: Math.round(cumMins),
                    isCollection: false, confidence: conf,
                    label: _etaLabel(clamped.eta, conf, clamped.outside, clamped.nextDay),
                    minutesFromNow: Math.round((clamped.eta - now)/60000)
                };
            }
            prevLat = customer.lat; prevLng = customer.lng;
            cumMins += ETA_UNLOAD_TIME_PER_STOP;
        });

        collections.forEach(function(customer) {
            var ready = _customerReadyTime(customer, now);
            var conf  = _confidence(customer);
            if (!ready || conf === 'hidden') {
                _etaCache[customer.id] = {
                    eta: null, outsideWindow: false, nextDay: false,
                    runNumber: runIndex+1, stopNumber: null, totalStops: collections.length,
                    runDepart: null, driveMinutes: 0,
                    isCollection: true, confidence: 'hidden',
                    label: '--', minutesFromNow: null
                };
            } else {
                var clamped = _clampToWindow(ready);
                _etaCache[customer.id] = {
                    eta: clamped.eta, outsideWindow: clamped.outside, nextDay: clamped.nextDay,
                    runNumber: runIndex+1, stopNumber: null, totalStops: collections.length,
                    runDepart: null, driveMinutes: 0,
                    isCollection: true, confidence: conf,
                    label: _etaLabel(clamped.eta, conf, clamped.outside, clamped.nextDay),
                    minutesFromNow: Math.round((clamped.eta - now)/60000)
                };
            }
        });
    });
    return _etaCache;
}

function getCustomerETA(customerId) { return _etaCache[customerId] || null; }

function _isCollection(customer) {
    return customer.zone && customer.zone.toLowerCase() === 'collection';
}

function _customerReadyTime(customer, now) {
    var p         = customer.passport || {};
    var trolleys  = Math.max(getTotalTrolleyCount(customer) || 1, 1);
    var packExtra = _packingExtra(p);
    var totalPick = trolleys * ETA_PICK_MINS_PER_TROLLEY;

    if (p.timestamps && p.timestamps.readyForDelivery)
        return new Date(p.timestamps.readyForDelivery);

    if (p.timestamps && p.timestamps.pickingCompleted)
        return new Date(new Date(p.timestamps.pickingCompleted).getTime() + packExtra*60000);

    if (p.timestamps && p.timestamps.pickingStarted) {
        var elapsed   = (now - new Date(p.timestamps.pickingStarted)) / 60000;
        var remaining = Math.max(totalPick - elapsed, 0) + packExtra;
        return new Date(now.getTime() + remaining*60000);
    }

    if (ETA_HIDE_IF_NOT_STARTED) return null;
    return new Date(now.getTime() + (totalPick + packExtra)*60000);
}

function _packingExtra(passport) {
    var extra = 0;
    if (passport.barcodedLabels)  extra += ETA_PACK_BARCODE_EXTRA;
    if (passport.prePricedLabels) extra += ETA_PACK_PREPRICE_EXTRA;
    return extra;
}

function _calcRunDeparture(run, now) {
    var latestReady = null;
    run.customers.forEach(function(customer) {
        var ready = _customerReadyTime(customer, now);
        if (ready && (!latestReady || ready > latestReady)) latestReady = ready;
    });
    if (!latestReady) latestReady = now;
    var depart = new Date(latestReady.getTime() + ETA_LOADING_TIME_PER_RUN*60000);
    var windowStart = _todayAt(ETA_DELIVERY_START);
    if (depart < windowStart) depart = windowStart;
    return depart;
}

function _clampToWindow(eta) {
    var start = _todayAt(ETA_DELIVERY_START);
    var end   = _todayAt(ETA_DELIVERY_END);
    var outside = false, nextDay = false;
    if (eta < start) { eta = start; outside = true; }
    if (eta > end) {
        if (ETA_SHIFT_TO_NEXT_WINDOW) {
            var parts = ETA_DELIVERY_START.split(':').map(Number);
            var tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(parts[0], parts[1], 0, 0);
            eta = tomorrow;
            nextDay = true;
        } else {
            outside = true;
        }
    }
    return { eta: eta, outside: outside, nextDay: nextDay };
}

function _todayAt(timeStr) {
    var parts = timeStr.split(':').map(Number);
    var d = new Date();
    d.setHours(parts[0], parts[1], 0, 0);
    return d;
}

// Returns drive minutes, optionally adjusted for a van's max speed (km/h).
// If the van is slower than what the road data implies, we recalculate using
// the van's actual speed so ETAs aren't over-optimistic.
function _driveMinutes(fromLat, fromLng, toLat, toLng, vanSpeedKmh) {
    var key = fromLat.toFixed(5)+','+fromLng.toFixed(5)+'|'+toLat.toFixed(5)+','+toLng.toFixed(5);
    if (typeof roadDistanceCache !== 'undefined' && roadDistanceCache[key]) {
        var cached = roadDistanceCache[key];
        if (vanSpeedKmh && cached.distance && cached.duration) {
            var impliedKmh = cached.distance / (cached.duration / 60);
            if (vanSpeedKmh < impliedKmh) return (cached.distance / vanSpeedKmh) * 60;
        }
        return cached.duration || _haversineMins(fromLat, fromLng, toLat, toLng, vanSpeedKmh);
    }
    var c = customers.find(function(c) {
        return Math.abs(c.lat-toLat)<0.0001 && Math.abs(c.lng-toLng)<0.0001;
    });
    if (c && c.roadDurationFromSite) {
        if (vanSpeedKmh && c.roadDistanceFromSite && c.roadDurationFromSite) {
            var impliedKmh2 = c.roadDistanceFromSite / (c.roadDurationFromSite / 60);
            if (vanSpeedKmh < impliedKmh2) return (c.roadDistanceFromSite / vanSpeedKmh) * 60;
        }
        return c.roadDurationFromSite;
    }
    return _haversineMins(fromLat, fromLng, toLat, toLng, vanSpeedKmh);
}

function _haversineMins(lat1, lng1, lat2, lng2, speedKmh) {
    var spd = speedKmh || 50;
    var R=6371, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
    var a = Math.sin(dLat/2)*Math.sin(dLat/2)
          + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
    return (R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))/spd)*60;
}

function _confidence(customer) {
    var p = customer.passport;
    if (!p) return ETA_HIDE_IF_NOT_STARTED ? 'hidden' : 'rough';
    if (p.timestamps && p.timestamps.readyForDelivery) return 'actual';
    if (p.timestamps && (p.timestamps.pickingCompleted || p.timestamps.pickingStarted)) return 'estimated';
    return ETA_HIDE_IF_NOT_STARTED ? 'hidden' : 'rough';
}

function _etaLabel(eta, confidence, outsideWindow, nextDay) {
    var pre = confidence==='actual' ? '' : confidence==='estimated' ? '~' : 'est. ';
    var t   = formatTime(eta);
    if (nextDay) return pre + t + ' +1d';
    return pre + t + (outsideWindow ? ' ⚠' : '');
}

function _fmtTime(date) {
    return formatTime(date);
}

function formatETABadge(customerId) {
    var e = _etaCache[customerId];
    if (!e) return '';
    var color = e.confidence==='actual' ? '#16a34a' : e.confidence==='estimated' ? '#d97706' : '#64748b';
    if (e.nextDay) color = '#7c3aed';
    else if (e.outsideWindow) color = '#dc2626';
    var windowNote = e.nextDay
        ? ' | Next available window: ' + _fmtTime(e.eta) + ' tomorrow'
        : (e.outsideWindow ? ' | Outside delivery window!' : '');
    var tooltip = e.isCollection
        ? 'Collection — ready ' + _fmtTime(e.eta) + (e.nextDay ? ' (tomorrow)' : '')
        : 'Run '+e.runNumber+', Stop '+e.stopNumber+'/'+e.totalStops
          +' | Departs '+_fmtTime(e.runDepart)
          +' | Drive '+e.driveMinutes+' min'
          +windowNote;
    var icon = e.nextDay ? 'calendar-plus' : (e.isCollection ? 'box' : 'clock');
    return '<span class="eta-badge-inner" title="'+tooltip+'" style="'
        +'display:inline-flex;align-items:center;gap:3px;'
        +'background:'+color+'18;color:'+color+';border:1px solid '+color+'44;'
        +'border-radius:20px;padding:2px 7px;font-size:10px;font-weight:700;cursor:help;">'
        +'<i class="fas fa-'+icon+'"></i> '+e.label+'</span>';
}

function renderETAPanel(vanId, dayId) {
    var panel = document.getElementById('etaPanel');
    if (!panel) return;
    var runs = computeDeliveryRuns(vanId, dayId);
    calculateAllETAs(vanId, dayId);
    if (!runs || runs.length===0) {
        panel.innerHTML='<p style="color:var(--gray-400);font-size:12px;padding:8px;">No customers assigned.</p>';
        return;
    }
    var html='';
    runs.forEach(function(run, ri) {
        var deliveries  = run.customers.filter(function(c){return !_isCollection(c);})
                             .sort(function(a,b){return (a.deliveryOrder||0)-(b.deliveryOrder||0);});
        var collections = run.customers.filter(_isCollection);
        var firstD      = deliveries[0];
        var departStr   = firstD && _etaCache[firstD.id] ? _fmtTime(_etaCache[firstD.id].runDepart) : '--:--';

        html += '<div style="margin-bottom:14px;">'
            +'<div style="display:flex;justify-content:space-between;align-items:center;'
            +'background:#0f766e;color:white;padding:7px 10px;border-radius:8px 8px 0 0;font-size:12px;font-weight:700;">'
            +'<span><i class="fas fa-truck"></i> Run '+(ri+1)+' &nbsp;·&nbsp; '+run.trolleys+' trolleys'
            +(deliveries.length ? ' &nbsp;·&nbsp; '+deliveries.length+' drops' : '')
            +(collections.length ? ' &nbsp;·&nbsp; '+collections.length+' collect' : '')+'</span>'
            +(deliveries.length ? '<span>Departs '+departStr+'</span>' : '')+'</div>';

        deliveries.forEach(function(c,si) {
            var e = _etaCache[c.id];
            var color = !e ? '#94a3b8' : e.nextDay ? '#7c3aed' : e.outsideWindow ? '#dc2626'
                : e.confidence==='actual' ? '#16a34a' : e.confidence==='estimated' ? '#d97706' : '#94a3b8';
            var p    = c.passport || {};
            var tags = '';
            if (p.barcodedLabels)  tags += '<span style="font-size:9px;background:#dbeafe;color:#1d4ed8;border-radius:3px;padding:1px 4px;margin-left:3px;">BC+'+ETA_PACK_BARCODE_EXTRA+'m</span>';
            if (p.prePricedLabels) tags += '<span style="font-size:9px;background:#ede9fe;color:#6d28d9;border-radius:3px;padding:1px 4px;margin-left:3px;">PP+'+ETA_PACK_PREPRICE_EXTRA+'m</span>';

            html += '<div style="display:flex;justify-content:space-between;align-items:center;'
                +'padding:5px 10px;border-bottom:1px solid var(--border);font-size:11px;'
                +'background:'+(si%2===0?'var(--surface)':'var(--bg)')+';">'
                +'<span style="flex:1;display:flex;align-items:center;min-width:0;overflow:hidden;">'
                +'<span style="color:var(--gray-400);margin-right:5px;min-width:16px;">'+(si+1)+'.</span>'
                +'<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+c.name+'</span>'+tags+'</span>'
                +'<span style="color:'+color+';font-weight:700;font-size:11px;margin-left:8px;white-space:nowrap;">'
                +'<i class="fas fa-clock"></i> '+(e?e.label:'--:--')+'</span></div>';
        });

        if (collections.length) {
            html += '<div style="padding:4px 10px;background:#f0fdf4;border-bottom:1px solid var(--border);font-size:10px;color:#16a34a;font-weight:600;">'
                +'<i class="fas fa-box"></i> Collection (ready time, no delivery)</div>';
            collections.forEach(function(c) {
                var e = _etaCache[c.id];
                html += '<div style="display:flex;justify-content:space-between;align-items:center;'
                    +'padding:5px 10px;border-bottom:1px solid var(--border);font-size:11px;background:#f0fdf4;">'
                    +'<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'
                    +'<i class="fas fa-box" style="color:#16a34a;margin-right:4px;"></i>'+c.name+'</span>'
                    +'<span style="color:#16a34a;font-weight:700;font-size:11px;">Ready '+(e?e.label:'--:--')+'</span></div>';
            });
        }
        html += '</div>';
    });

    html += '<div style="padding:6px 8px;font-size:10px;color:var(--gray-400);display:flex;gap:10px;flex-wrap:wrap;">'
        +'<span><span style="color:#16a34a;">●</span> Actual</span>'
        +'<span><span style="color:#d97706;">●</span> Estimated</span>'
        +'<span><span style="color:#94a3b8;">●</span> Rough</span>'
        +'<span><span style="color:#dc2626;">●</span> Outside window ⚠</span>'
        +(ETA_SHIFT_TO_NEXT_WINDOW ? '<span><span style="color:#7c3aed;">●</span> Next day window +1d</span>' : '')
        +'</div>';

    panel.innerHTML = html;
}

function initETASettings() {
    _setVal('cfg-etaLoading',  ETA_LOADING_TIME_PER_RUN);
    _setVal('cfg-etaUnload',   ETA_UNLOAD_TIME_PER_STOP);
    _setVal('cfg-etaPickMin',  ETA_PICK_MINS_PER_TROLLEY);
    _setVal('cfg-etaBarcode',  ETA_PACK_BARCODE_EXTRA);
    _setVal('cfg-etaPreprice', ETA_PACK_PREPRICE_EXTRA);
    _setVal('cfg-etaStart',    ETA_DELIVERY_START);
    _setVal('cfg-etaEnd',      ETA_DELIVERY_END);
    _setChecked('cfg-etaShiftNextWindow', ETA_SHIFT_TO_NEXT_WINDOW);
    _setChecked('cfg-etaHideIfNotStarted', ETA_HIDE_IF_NOT_STARTED);
}

async function saveETASettings() {
    ETA_LOADING_TIME_PER_RUN  = _getInt('cfg-etaLoading',  20);
    ETA_UNLOAD_TIME_PER_STOP  = _getInt('cfg-etaUnload',   10);
    ETA_PICK_MINS_PER_TROLLEY = _getInt('cfg-etaPickMin',  60);
    ETA_PACK_BARCODE_EXTRA    = _getInt('cfg-etaBarcode',  15);
    ETA_PACK_PREPRICE_EXTRA   = _getInt('cfg-etaPreprice', 20);
    ETA_DELIVERY_START        = _getStr('cfg-etaStart',    '07:45');
    ETA_DELIVERY_END          = _getStr('cfg-etaEnd',      '16:45');
    ETA_SHIFT_TO_NEXT_WINDOW  = _getBool('cfg-etaShiftNextWindow', false);
    ETA_HIDE_IF_NOT_STARTED   = _getBool('cfg-etaHideIfNotStarted', false);
    window.ETA_SHIFT_TO_NEXT_WINDOW = ETA_SHIFT_TO_NEXT_WINDOW;
    window.ETA_HIDE_IF_NOT_STARTED  = ETA_HIDE_IF_NOT_STARTED;

    // Refresh display immediately with new settings
    calculateAllETAs(currentVan, currentDay);
    if (typeof renderETAPanel === 'function') renderETAPanel(currentVan, currentDay);
    if (typeof refreshETABadges === 'function') refreshETABadges();
    if (typeof updateAllDisplays === 'function') updateAllDisplays();

    // Persist to DB by merging into the full company config
    if (typeof saveCompanyConfig === 'function') {
        var cfg = Object.assign({}, (typeof companyConfig !== 'undefined' ? companyConfig : {}), {
            etaStart:             ETA_DELIVERY_START,
            etaEnd:               ETA_DELIVERY_END,
            etaLoadingTime:       ETA_LOADING_TIME_PER_RUN,
            etaUnloadTime:        ETA_UNLOAD_TIME_PER_STOP,
            etaPickMins:          ETA_PICK_MINS_PER_TROLLEY,
            etaBarcodeExtra:      ETA_PACK_BARCODE_EXTRA,
            etaPrepriceExtra:     ETA_PACK_PREPRICE_EXTRA,
            etaShiftToNextWindow: ETA_SHIFT_TO_NEXT_WINDOW,
            etaHideIfNotStarted:  ETA_HIDE_IF_NOT_STARTED
        });
        await saveCompanyConfig(cfg);
    } else {
        showNotification('ETA settings saved', 'success');
    }
}

function _setVal(id,v){var el=document.getElementById(id);if(el)el.value=v;}
function _getInt(id,d){var el=document.getElementById(id);return el?(parseInt(el.value)||d):d;}
function _getStr(id,d){var el=document.getElementById(id);return el?(el.value||d):d;}
function _setChecked(id,v){var el=document.getElementById(id);if(el)el.checked=!!v;}
function _getBool(id,d){var el=document.getElementById(id);return el?el.checked:d;}

window.calculateAllETAs         = calculateAllETAs;
window.getCustomerETA           = getCustomerETA;
window.formatETABadge           = formatETABadge;
window.renderETAPanel           = renderETAPanel;
window.initETASettings          = initETASettings;
window.saveETASettings          = saveETASettings;
window.ETA_SHIFT_TO_NEXT_WINDOW = ETA_SHIFT_TO_NEXT_WINDOW;
window.ETA_HIDE_IF_NOT_STARTED  = ETA_HIDE_IF_NOT_STARTED;
