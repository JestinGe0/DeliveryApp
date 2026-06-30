// ========== GETTING STARTED CHECKLIST ==========
// Floating widget shown after first login to guide new users.

var CL_STEPS = [
    {
        id: 's1',
        title: 'Initial setup complete',
        desc: 'Company name, warehouse location and admin account are configured.',
        screen: null,
        auto: true
    },
    {
        id: 's2',
        title: 'Add your first driver',
        desc: 'Go to Staff Management → Add Staff and set the role to Driver.',
        screen: 'staff'
    },
    {
        id: 's3',
        title: 'Import your customers',
        desc: 'Open Current Orders and use the Import button to upload a CSV, or add customers manually.',
        screen: 'orders'
    },
    {
        id: 's4',
        title: 'Create a delivery run',
        desc: 'In Map View, click New Run, then drag customers into the run panel.',
        screen: 'map'
    },
    {
        id: 's5',
        title: 'Complete your first delivery',
        desc: 'Assign a driver to the run, start it, and mark orders as Delivered.',
        screen: 'driver'
    }
];

function _clKey() {
    var u = window.currentUser ? (window.currentUser.username || 'default') : 'default';
    return 'pep_checklist_' + u;
}

function _clLoad() {
    try { return JSON.parse(localStorage.getItem(_clKey())) || { done: {}, hidden: false }; }
    catch(e) { return { done: {}, hidden: false }; }
}

function _clSave(state) {
    try { localStorage.setItem(_clKey(), JSON.stringify(state)); } catch(e) {}
}

function _clDoneCount() {
    var s = _clLoad();
    return CL_STEPS.filter(function(st) { return s.done[st.id]; }).length;
}

// ── Public entry point — called from showApp() after login ───────────────────
function initChecklist() {
    var state = _clLoad();
    state.done['s1'] = true;   // setup wizard already ran
    _clSave(state);

    _clRenderFab();

    var done = _clDoneCount();
    if (!state.hidden && done < CL_STEPS.length) {
        setTimeout(clOpenPanel, 1500);
    }
}

// ── FAB (floating action button) ─────────────────────────────────────────────
function _clRenderFab() {
    var prev = document.getElementById('cl-fab');
    if (prev) prev.remove();

    var done  = _clDoneCount();
    var total = CL_STEPS.length;
    var all   = done >= total;

    var btn = document.createElement('button');
    btn.id        = 'cl-fab';
    btn.className = 'cl-fab' + (all ? ' cl-fab-done' : '');
    btn.title     = all ? 'Setup complete' : 'Getting Started checklist';
    btn.onclick   = clTogglePanel;
    btn.innerHTML = all
        ? '<i class="fas fa-circle-check"></i> Setup Complete'
        : '<i class="fas fa-rocket"></i> Getting Started <span class="cl-badge">' + done + '/' + total + '</span>';

    document.body.appendChild(btn);
}

// ── Panel ─────────────────────────────────────────────────────────────────────
function clTogglePanel() {
    document.getElementById('cl-panel') ? clClosePanel() : clOpenPanel();
}

function clOpenPanel() {
    var prev = document.getElementById('cl-panel');
    if (prev) prev.remove();

    var state = _clLoad();
    var done  = _clDoneCount();
    var total = CL_STEPS.length;
    var pct   = Math.round((done / total) * 100);

    var stepsHtml = CL_STEPS.map(function(step) {
        var isDone = !!state.done[step.id];
        return '<div class="cl-step' + (isDone ? ' cl-step-done' : '') + '">'
            + '<label class="cl-cb-wrap">'
            + '<input type="checkbox"' + (isDone ? ' checked' : '')
            + ' onchange="clToggleStep(\'' + step.id + '\',this.checked)">'
            + '<span class="cl-cb"><i class="fas fa-check"></i></span>'
            + '</label>'
            + '<div class="cl-step-body">'
            + '<div class="cl-step-title">' + step.title + '</div>'
            + '<div class="cl-step-desc">' + step.desc + '</div>'
            + '</div>'
            + (step.screen
                ? '<button class="cl-go" onclick="clNavigate(\'' + step.screen + '\')">'
                  + 'Go <i class="fas fa-arrow-right"></i></button>'
                : '')
            + '</div>';
    }).join('');

    var panel = document.createElement('div');
    panel.id        = 'cl-panel';
    panel.className = 'cl-panel';
    panel.innerHTML =
        '<div class="cl-panel-header">'
        + '<span class="cl-panel-title"><i class="fas fa-rocket"></i> Getting Started</span>'
        + '<div style="display:flex;gap:8px;align-items:center;">'
        + '<a href="/help.html" target="_blank" class="cl-help-link"><i class="fas fa-book-open"></i> Full Guide</a>'
        + '<button class="cl-close" onclick="clClosePanel()" title="Close"><i class="fas fa-times"></i></button>'
        + '</div></div>'
        + '<div class="cl-progress-wrap">'
        + '<div class="cl-progress-label">' + done + ' of ' + total + ' steps complete</div>'
        + '<div class="cl-progress-track"><div class="cl-progress-fill" style="width:' + pct + '%"></div></div>'
        + '</div>'
        + '<div class="cl-steps">' + stepsHtml + '</div>'
        + (done >= total
            ? '<div class="cl-all-done"><i class="fas fa-circle-check"></i> You\'re all set — great work!</div>'
            : '')
        + '<div class="cl-panel-footer">'
        + '<button class="cl-dismiss" onclick="clDismiss()">Don\'t show again</button>'
        + '</div>';

    document.body.appendChild(panel);
}

function clClosePanel() {
    var p = document.getElementById('cl-panel');
    if (p) p.remove();
}

function clDismiss() {
    var state  = _clLoad();
    state.hidden = true;
    _clSave(state);
    clClosePanel();
    var fab = document.getElementById('cl-fab');
    if (fab) fab.remove();
}

// ── Step interaction ──────────────────────────────────────────────────────────
function clToggleStep(id, checked) {
    var state   = _clLoad();
    state.done[id] = checked;
    _clSave(state);
    clOpenPanel();
    _clRenderFab();
}

function clNavigate(screen) {
    document.querySelectorAll('.nav-tab').forEach(function(t) {
        t.classList.toggle('active', t.dataset.screen === screen);
    });
    switchScreen(screen);
    clClosePanel();
}

window.initChecklist  = initChecklist;
window.clTogglePanel  = clTogglePanel;
window.clOpenPanel    = clOpenPanel;
window.clClosePanel   = clClosePanel;
window.clToggleStep   = clToggleStep;
window.clNavigate     = clNavigate;
window.clDismiss      = clDismiss;
