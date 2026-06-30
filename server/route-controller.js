/**
 * route-controller.js
 * Sits between the browser and the Python OR-Tools optimiser.
 * 1. Receives stops + van configs + options from /api/optimise-route
 * 2. Fetches real duration AND distance matrices from /api/road-matrix
 * 3. Sends everything to the Python service on port 8000
 * 4. Returns ordered stop lists per van back to the browser
 */

const fetch   = require('node-fetch');
const https   = require('https');

const PYTHON_URL    = process.env.PYTHON_URL    || 'http://localhost:8000';
const HTTPS_ENABLED = process.env.HTTPS_ENABLED === 'true';
const HTTPS_PORT    = parseInt(process.env.HTTPS_PORT || '3443');
const HTTP_PORT     = parseInt(process.env.PORT        || '3000');

// Internal self-calls must bypass the HTTP→HTTPS redirect.
// When HTTPS is enabled, call the HTTPS server directly and skip cert verification
// (safe: this is a localhost call to our own self-signed certificate).
const SELF_URL    = HTTPS_ENABLED
    ? `https://localhost:${HTTPS_PORT}`
    : `http://localhost:${HTTP_PORT}`;
const localAgent  = HTTPS_ENABLED
    ? new https.Agent({ rejectUnauthorized: false })
    : undefined;

const DEPOT_LNG = parseFloat(process.env.SITE_LNG || 0);
const DEPOT_LAT = parseFloat(process.env.SITE_LAT || 0);


/**
 * Fetch an NxN duration (minutes) and distance (km) matrix for depot + stops.
 * Locations must be [[lng,lat], ...] with depot at index 0.
 * Returns { durations: [[min]], distances: [[km]] | null }
 */
async function getMatrices(locations) {
    const res = await fetch(`${SELF_URL}/api/road-matrix`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ locations }),
        agent:   localAgent
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Road matrix failed (${res.status}): ${err}`);
    }
    const data = await res.json();
    if (!data.durations) throw new Error('Road matrix response missing durations');

    // durations from /api/road-matrix are in seconds — convert to minutes
    const durations = data.durations.map(row => row.map(v => v / 60));
    // distances are already in km (all three backends normalise to km)
    const distances = data.distances || null;

    return { durations, distances };
}


/**
 * Check the Python optimiser is running before we try to use it.
 */
async function checkPythonService() {
    try {
        const res = await fetch(`${PYTHON_URL}/health`, { timeout: 3000 });
        return res.ok;
    } catch {
        return false;
    }
}


/**
 * Main entry point — called by POST /api/optimise-route
 *
 * @param {Array}  stops    — [{ id, lat, lng, trolleys }, ...]
 * @param {Array}  vans     — [{ id, maxTrolleys, maxStops, maxDistance }, ...]
 * @param {Object} options  — { costFunction, dropPenalty, timeLimit }
 */
async function optimiseRoutes(stops, vans, options = {}, depot = null) {
    if (!stops || stops.length === 0) {
        return { routes: {}, success: true, message: 'No stops provided' };
    }

    const pythonAlive = await checkPythonService();
    if (!pythonAlive) {
        throw new Error('Python optimiser is not running. Start it with: python optimise.py');
    }

    const depotLng = depot ? parseFloat(depot.lng) : DEPOT_LNG;
    const depotLat = depot ? parseFloat(depot.lat) : DEPOT_LAT;

    // Build location list — depot first, then stops ([lng, lat] for ORS/Valhalla/OSRM)
    const locations = [
        [depotLng, depotLat],
        ...stops.map(s => [parseFloat(s.lng), parseFloat(s.lat)])
    ];

    console.log(`[VRP] Fetching ${locations.length}×${locations.length} road matrix…`);
    const { durations, distances } = await getMatrices(locations);

    const costFn = options.costFunction || 'minimize_time';
    console.log(`[VRP] Sending ${stops.length} stops to OR-Tools | cost_function=${costFn}`);

    const payload = {
        stops: stops.map(s => ({
            id:       s.id,
            lat:      parseFloat(s.lat),
            lng:      parseFloat(s.lng),
            trolleys: parseInt(s.trolleys) || 0
        })),
        vans: vans.map(v => ({
            id:          v.id,
            maxTrolleys: v.maxTrolleys || 17,
            maxStops:    v.maxStops    || 15,
            maxDistance: v.maxDistance || 200
        })),
        duration_matrix:   durations,
        distance_matrix:   distances,
        cost_function:     costFn,
        drop_penalty:      options.dropPenalty  || 10_000_000,
        time_limit_seconds: options.timeLimit   || 30
    };

    const res = await fetch(`${PYTHON_URL}/optimise`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload)
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Python optimiser error (${res.status}): ${err}`);
    }

    const result = await res.json();
    console.log(`[VRP] ${result.message || 'Done'} — ${Object.keys(result.routes || {}).length} routes`);
    return result;
}


module.exports = { optimiseRoutes, checkPythonService };
