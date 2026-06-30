let currentMapLayer = null;
const mapStyles = {
    // OpenStreetMap
    'streets':          'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    'humanitarian':     'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    // Carto
    'light':            'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    'dark':             'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    'voyager':          'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    'light-nolabels':   'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
    'dark-nolabels':    'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
    // Stadia
    'alidade-smooth':        'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png',
    'alidade-smooth-dark':   'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
    'osm-bright':            'https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}{r}.png',
    // Esri
    'esri-streets':    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    'esri-satellite':  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    'esri-topo':       'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    // Other
    'topo':            'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
};

// ========== SERVER CONFIGURATION ==========
// Derive server URL from the page's own origin so HTTP and HTTPS both work
// without any hardcoded protocol or port.
const SERVER_URL = (function() {
    const protocol = window.location.protocol; // 'http:' or 'https:'
    const host     = window.location.hostname;
    const port     = window.location.port;     // '3000', '3443', etc.
    return protocol + '//' + host + (port ? ':' + port : '');
})();
let MARQUEE_THRESHOLD = 30;
var ACTIVE_DAYS = [1, 2, 3, 4, 5, 6, 7]; // All days active by default
let STOP_TIME_PER_DELIVERY = 15;           // Minutes per delivery stop (for sheet estimates)
let RECONNECT_INTERVAL = 30;               // Seconds between reconnect attempts
let enhancedCustomersData = [];

// ========== UTILITY ==========
function debounce(fn, delay) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

let socket = null;
let syncInterval = null;
let lastSyncTimestamp = null;
let currentCustomerFilter = 'all';

const PASSPORT_FIELDS = {
      // New fields for repeat customer tracking
    isRepeatCustomer: false,
    previousOrderCount: 0,
    totalOrdersCount: 0,
    customerSince: '',
    
    // Additional orders (same customer, different van/day/products)
    orders: [],

    // New fields for pot return
    potsToReturn: false,
    numberOfPotsToReturn: 0,
    potReturnNotes: '',

    // Order Details
    trolleyCount: 0,
    orderNumber: '',
    orderDate: '',
    requiredByDate: '',
    takenBy: '',
    customerContact: '',
    customerEmail: '',
    accountType: '',
    poNumber: '',
    invoiceDelivery: '',
    invoiceEmail: '',
    
    // Plant & Quality Requirements
    plantVariety: '',
    numberOfPlants: '',
    potSize: '',
    potColor: '',
    qualityGrade: '',
    coloursToAvoid: '',
    flowerStage: '',
    mixedColoursOk: false,
    preferredHeight: '',
    blemishTolerance: '',
    specificColours: '',
    additionalPlantNotes: '',
    
    // Labelling Requirements
    barcodedLabels: false,
    prePricedLabels: false,
    labelInstructions: '',
    
    // Delivery & Collection
    fulfilmentMethod: '',
    preferredDeliveryDay: '',
    preferredTimeWindow: '',
    siteAccessRestrictions: false,
    siteAccessTimes: '',
    onsiteContactName: '',
    onsiteContactPhone: '',
    fullAddress: '',
    specialDeliveryInstructions: '',
    
    // Payment
    paymentTerms: '',
    paymentMethod: '',
    paymentReceived: false,
    amountPaid: 0,
    
    // Packer Quality Check (completed at packing)
    packedBy: '',
    datePacked: '',
    flowerStageConfirmed: '',
    qualityGradeMet: false,
    qualityNotes: '',
    labelsApplied: false,
    barcodeChecked: '',
    substitutionsMade: false,
    substitutionDetails: '',
    checkedBy: '',
    signOff: '',
    
    // Timestamp Tracking for Analytics
    timestamps: {
        orderCreated: '',           // When order was first created
        firstPickerAssigned: '',    // When first picker was assigned
        pickingStarted: '',         // When picking status first set
        pickingCompleted: '',       // When ready for delivery status set
        readyForDelivery: '',        // When marked as ready for delivery
        deliveredAt: ''             // When delivered
    },
    
    pickingMetrics: {
        timeToFirstPicker: 0,       // Minutes from order creation to first picker
        pickingDuration: 0,         // Minutes from picking start to completion
        totalPickingTime: 0,        // Total time in picking
        efficiencyScore: 0,         // Calculated efficiency score
        numberOfPickers: 0,          // Number of pickers assigned
        pickerNames: [],              // Names of pickers who worked on order
        plantsPerHour: 0,            // Plants picked per hour
        plantsPerPicker: {}          // Plants per individual picker
    },
    
    lastUpdated: '',
    updatedBy: ''
};
// Add this function to debug collection orders
function debugCollectionOrders() {
    console.log('===== COLLECTION ORDERS DEBUG =====');
    
    // Find all customers marked as collection
    const collectionCustomers = customers.filter(c => c.zone === 'Collection');
    
    console.log(`Total customers: ${customers.length}`);
    console.log(`Customers with zone = "Collection": ${collectionCustomers.length}`);
    
    collectionCustomers.forEach(c => {
        console.log(`- ${c.name}: zone="${c.zone}", assignedDay=${c.assignedDay}, passport exists: ${!!c.passport}`);
    });
    
    // Also check if any customers have zone not set but should be collection
    const possibleCollection = customers.filter(c => 
        c.zone !== 'Collection' && 
        c.passport && (
            c.passport.fulfilmentMethod === 'Collection' ||
            c.passport.specialDeliveryInstructions?.toLowerCase().includes('collect')
        )
    );
    
    console.log(`Customers that might be collection (based on passport): ${possibleCollection.length}`);
    possibleCollection.forEach(c => {
        console.log(`- ${c.name}: zone="${c.zone}", fulfilmentMethod="${c.passport?.fulfilmentMethod}"`);
    });
}


// ========== DELIVERY PLAN HELPER ==========
// Always use this instead of hardcoding {1:{1:[],2:[],...}, 2:{...}, 3:{...}}
// Works for any number of vans defined in VANS.
function emptyDeliveryPlan() {
    var plan = {};
    VANS.forEach(function(v) {
        plan[v.id] = {};
        DAYS.forEach(function(d) { plan[v.id][d.id] = []; });
    });
    return plan;
}
window.emptyDeliveryPlan = emptyDeliveryPlan;

// ========== YOUR SITE COORDINATES ==========
var YOUR_SITE = {
    name: "Warehouse",
    address: "",
    lat: 0,
    lng: 0
};

// ========== DELIVERY SYSTEM CONFIG ==========
var VANS = [
    { id: 1, name: "Van 1", color: "#007bff", iconColor: "#007bff", capacity: 50 },
    { id: 2, name: "Van 2", color: "#dc3545", iconColor: "#dc3545", capacity: 50 },
    { id: 3, name: "Van 3", color: "#28a745", iconColor: "#28a745", capacity: 50 }
];

const DAYS = [
    { id: 1, name: "Monday",    short: "Mon" },
    { id: 2, name: "Tuesday",   short: "Tue" },
    { id: 3, name: "Wednesday", short: "Wed" },
    { id: 4, name: "Thursday",  short: "Thu" },
    { id: 5, name: "Friday",    short: "Fri" },
    { id: 6, name: "Saturday",  short: "Sat" },
    { id: 7, name: "Sunday",    short: "Sun" }
];

const ORDER_STATUSES = {
    PENDING:           'pending',
    PICKING:           'picking',
    READY_FOR_DELIVERY:'ready_for_delivery',
    DELIVERING:        'delivering',
    DELIVERED:         'delivered',
    COLLECTED:         'collected',
    CANCELLED:         'cancelled'
};

let deliveryPlan = {
    1: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] },
    2: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] },
    3: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] }
};

let currentVan = 1;
let currentDay = 1;
let roadDistanceCache = {};

// Delivery runs: deliveryRuns[vanId][dayId] = [ { run:1, driverId:null, customerIds:[] }, ... ]
// Computed from trolley counts — not stored separately, recalculated on demand
var deliveryRuns = {};
var LOCAL_ZONE_RADIUS = 20;
var MAX_TROLLEYS_PER_RUN = 17;
// Bay assignments: vanId -> bay number (1-based). Each van's trolleys stage on one bay.
var vanBayAssignments = {};
var BAY_FEATURE_ENABLED = false;
// 'van' = bay assigned per van (default); 'order' = picker assigns bay per order
var BAY_ASSIGNMENT_MODE = 'van';
var BAY_COUNT = 3;
var BAY_TROLLEY_LIMITS = {}; // bayNumber (string) -> max trolleys
var DELIVERY_RUN_MOVE_ENABLED = true;
var FEATURES = { gamification: true, grouping: true, analytics: true, autoAssign: true, priority: true, diagram: true };

var ZONES = {
    'Local':      { color: '#6b7280', radius: LOCAL_ZONE_RADIUS },
    'Collection': { color: '#8b5cf6' }
};

