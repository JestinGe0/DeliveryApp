// ========== ONBOARDING WIZARD ==========
// Shown on first install before the login screen.
// Steps: 1 = Company  2 = Admin user  3 = Import CSV

var _ob = {
    step: 1,
    logo: null,          // base64 string
    csvRows: [],         // parsed CSV rows
    geocoding: false,
};

// ── Entry point — called from auth.js before showing login ───────────────────
async function checkOnboarding() {
    try {
        var r = await fetch(SERVER_URL + '/api/setup/status');
        var d = await r.json();
        if (d.complete) return false;   // skip wizard
        showOnboarding();
        return true;
    } catch(e) {
        return false;
    }
}

function showOnboarding() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('onboarding-wizard').style.display = 'flex';
    obRenderStep();
}

function obRenderStep() {
    // Update progress dots
    [1,2,3].forEach(function(n) {
        var dot = document.getElementById('ob-dot-' + n);
        var lbl = document.getElementById('ob-lbl-' + n);
        if (!dot) return;
        dot.className = 'ob-dot' + (_ob.step === n ? ' active' : _ob.step > n ? ' done' : '');
        if (lbl) lbl.className = 'ob-step-label' + (_ob.step === n ? ' active' : '');
    });

    // Show/hide step panels
    [1,2,3].forEach(function(n) {
        var panel = document.getElementById('ob-step-' + n);
        if (panel) panel.style.display = _ob.step === n ? 'block' : 'none';
    });

    // Update nav buttons
    var back = document.getElementById('ob-back');
    var next = document.getElementById('ob-next');
    if (back) back.style.display = _ob.step > 1 ? 'inline-flex' : 'none';
    if (next) {
        if (_ob.step === 3) {
            next.innerHTML = '<i class="fas fa-rocket"></i> Launch App';
        } else {
            next.innerHTML = 'Continue <i class="fas fa-arrow-right"></i>';
        }
    }
}

// ── Step navigation ───────────────────────────────────────────────────────────
async function obNext() {
    if (_ob.step === 1 && !obValidateStep1()) return;
    if (_ob.step === 2 && !obValidateStep2()) return;
    if (_ob.step === 3) { await obFinish(); return; }
    _ob.step++;
    obRenderStep();
}

function obBack() {
    if (_ob.step > 1) { _ob.step--; obRenderStep(); }
}

// ── Step 1 validation ─────────────────────────────────────────────────────────
function obValidateStep1() {
    var name = (document.getElementById('ob-company-name')?.value || '').trim();
    if (!name) { obError('ob-err-1', 'Company name is required.'); return false; }
    var lat = document.getElementById('ob-lat')?.value;
    var lng = document.getElementById('ob-lng')?.value;
    if (!lat || !lng || isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) {
        obError('ob-err-1', 'Please enter valid warehouse coordinates.'); return false;
    }
    obError('ob-err-1', '');
    return true;
}

// ── Step 2 validation ─────────────────────────────────────────────────────────
function obValidateStep2() {
    var username = (document.getElementById('ob-username')?.value || '').trim();
    var password = (document.getElementById('ob-password')?.value || '').trim();
    var confirm  = (document.getElementById('ob-confirm')?.value || '').trim();
    if (!username) { obError('ob-err-2', 'Username is required.'); return false; }
    if (!/^[a-z0-9_]{3,30}$/.test(username)) { obError('ob-err-2', 'Username: 3–30 chars, lowercase letters, numbers and _ only.'); return false; }
    if (password.length < 6) { obError('ob-err-2', 'Password must be at least 6 characters.'); return false; }
    if (password !== confirm) { obError('ob-err-2', 'Passwords do not match.'); return false; }
    obError('ob-err-2', '');
    return true;
}

// ── Finish — POST to server ───────────────────────────────────────────────────
async function obFinish() {
    var btn = document.getElementById('ob-next');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Setting up…'; }

    try {
        // Step 1 — company
        var company = {
            name:             (document.getElementById('ob-company-name')?.value || '').trim(),
            tagline:          (document.getElementById('ob-tagline')?.value || '').trim(),
            warehouseName:    (document.getElementById('ob-warehouse-name')?.value || '').trim(),
            warehouseAddress: (document.getElementById('ob-warehouse-address')?.value || '').trim(),
            lat:              parseFloat(document.getElementById('ob-lat')?.value),
            lng:              parseFloat(document.getElementById('ob-lng')?.value),
            logo:             _ob.logo || null,
        };

        // Step 2 — admin
        var admin = {
            fullName: (document.getElementById('ob-fullname')?.value || '').trim(),
            username: (document.getElementById('ob-username')?.value || '').trim().toLowerCase(),
            password: (document.getElementById('ob-password')?.value || '').trim(),
        };

        // Save company + admin
        var r1 = await fetch(SERVER_URL + '/api/setup/complete', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ company, admin })
        });
        var d1 = await r1.json();
        if (!d1.success) { obError('ob-err-3', d1.message || 'Setup failed.'); return; }

        // Import CSV if any rows loaded
        if (_ob.csvRows.length > 0) {
            var r2 = await fetch(SERVER_URL + '/api/setup/import-csv', {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customers: _ob.csvRows })
            });
            var d2 = await r2.json();
            if (!d2.success) console.warn('CSV import issue:', d2.message);
        }

        // Hide wizard, show login
        document.getElementById('onboarding-wizard').style.display = 'none';
        showLoginScreen();
        showNotification('Setup complete! Please log in with your new admin account.', 'success');

    } catch(e) {
        obError('ob-err-3', 'Cannot reach server. Make sure the server is running.');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-rocket"></i> Launch App'; }
    }
}

// ── Logo upload ───────────────────────────────────────────────────────────────
function obHandleLogo(input) {
    var file = input.files[0];
    if (!file) return;
    if (file.size > 500 * 1024) { obError('ob-err-1', 'Logo must be under 500 KB.'); return; }
    var reader = new FileReader();
    reader.onload = function(e) {
        _ob.logo = e.target.result;
        var preview = document.getElementById('ob-logo-preview');
        if (preview) { preview.src = _ob.logo; preview.style.display = 'block'; }
        var placeholder = document.getElementById('ob-logo-placeholder');
        if (placeholder) placeholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
}

// ── Geocode address → coordinates ────────────────────────────────────────────
async function obGeocode() {
    var address = (document.getElementById('ob-warehouse-address')?.value || '').trim();
    if (!address) { obError('ob-err-1', 'Enter an address first.'); return; }
    var btn = document.getElementById('ob-geocode-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    try {
        var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(address);
        var r = await fetch(url, { headers: { 'Accept-Language': 'en' } });
        var results = await r.json();
        if (results.length === 0) { obError('ob-err-1', 'Address not found. Try a more specific address or enter coordinates manually.'); return; }
        document.getElementById('ob-lat').value = parseFloat(results[0].lat).toFixed(6);
        document.getElementById('ob-lng').value = parseFloat(results[0].lon).toFixed(6);
        obError('ob-err-1', '');
    } catch(e) {
        obError('ob-err-1', 'Geocoding failed. Enter coordinates manually.');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-search-location"></i> Find'; }
    }
}

// ── CSV parsing ───────────────────────────────────────────────────────────────
function obHandleCSV(input) {
    var file = input.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        var text = e.target.result;
        _ob.csvRows = obParseCSV(text);
        var preview = document.getElementById('ob-csv-preview');
        var count   = document.getElementById('ob-csv-count');
        if (count) count.textContent = _ob.csvRows.length + ' customer' + (_ob.csvRows.length !== 1 ? 's' : '') + ' ready to import';
        if (preview) {
            var sample = _ob.csvRows.slice(0, 5);
            preview.innerHTML = '<table style="width:100%;font-size:11px;border-collapse:collapse;">' +
                '<thead><tr style="background:var(--surface-2);">' +
                '<th style="padding:4px 8px;text-align:left;">Name</th>' +
                '<th style="padding:4px 8px;text-align:left;">Address</th>' +
                '<th style="padding:4px 8px;text-align:left;">Zone</th>' +
                '</tr></thead><tbody>' +
                sample.map(function(r) {
                    return '<tr><td style="padding:4px 8px;border-top:1px solid var(--border);">' + (r.name||'') + '</td>' +
                           '<td style="padding:4px 8px;border-top:1px solid var(--border);">' + (r.address||'') + '</td>' +
                           '<td style="padding:4px 8px;border-top:1px solid var(--border);">' + (r.zone||'') + '</td></tr>';
                }).join('') +
                '</tbody></table>' +
                (_ob.csvRows.length > 5 ? '<div style="padding:4px 8px;font-size:11px;color:var(--text-muted);">… and ' + (_ob.csvRows.length - 5) + ' more</div>' : '');
            preview.style.display = 'block';
        }
    };
    reader.readAsText(file);
}

function obParseCSV(text) {
    var lines = text.split(/\r?\n/).filter(function(l) { return l.trim(); });
    if (lines.length < 2) return [];
    var headers = lines[0].split(',').map(function(h) { return h.trim().toLowerCase().replace(/["']/g,''); });
    var rows = [];
    for (var i = 1; i < lines.length; i++) {
        var vals = lines[i].split(',').map(function(v) { return v.trim().replace(/^["']|["']$/g,''); });
        var obj = {};
        headers.forEach(function(h, idx) { obj[h] = vals[idx] || ''; });
        if (obj.name) rows.push({ name: obj.name, address: obj.address||obj.postcode||'', postcode: obj.postcode||'', lat: obj.lat||0, lng: obj.lng||0, zone: obj.zone||'Local', day: obj.day||null });
    }
    return rows;
}

// ── Helper ────────────────────────────────────────────────────────────────────
function obError(elId, msg) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
}

window.checkOnboarding = checkOnboarding;
window.obNext = obNext;
window.obBack = obBack;
window.obHandleLogo = obHandleLogo;
window.obGeocode = obGeocode;
window.obHandleCSV = obHandleCSV;
