// Input validation helpers for API endpoints

const VALID_ROLES = ['admin', 'manager', 'staff', 'picker'];
const VALID_ZONES = ['North West', 'South West', 'London/North East', 'South East', 'Local', 'Collection'];

function isStr(v, min = 0, max = Infinity) {
    return typeof v === 'string' && v.length >= min && v.length <= max;
}

function isNum(v, min = -Infinity, max = Infinity) {
    const n = Number(v);
    return !isNaN(n) && n >= min && n <= max;
}

function validateUser(body, isUpdate = false) {
    const errors = [];
    if (!isUpdate) {
        if (!isStr(body.username, 2, 50))   errors.push('username must be 2–50 characters');
        if (!isStr(body.password, 6, 200))  errors.push('password must be at least 6 characters');
        if (!VALID_ROLES.includes(body.role)) errors.push(`role must be one of: ${VALID_ROLES.join(', ')}`);
    } else {
        if (body.role !== undefined && !VALID_ROLES.includes(body.role))
            errors.push(`role must be one of: ${VALID_ROLES.join(', ')}`);
        if (body.password && !isStr(body.password, 6, 200))
            errors.push('password must be at least 6 characters');
    }
    if (body.fullName !== undefined && !isStr(body.fullName, 0, 100))
        errors.push('fullName must be under 100 characters');
    return errors;
}

function validateCustomerCreate(body) {
    const errors = [];
    if (!isStr(body.name, 1, 200))          errors.push('name is required (1–200 chars)');
    if (!isNum(body.lat, -90, 90))          errors.push('lat must be a valid latitude (-90 to 90)');
    if (!isNum(body.lng, -180, 180))        errors.push('lng must be a valid longitude (-180 to 180)');
    if (body.zone && !VALID_ZONES.includes(body.zone))
        errors.push(`zone must be one of: ${VALID_ZONES.join(', ')}`);
    if (body.postcode !== undefined && !isStr(body.postcode, 0, 20))
        errors.push('postcode must be ≤20 characters');
    return errors;
}

function validateCustomerUpdate(body) {
    const errors = [];
    if (body.name !== undefined     && !isStr(body.name, 1, 200))   errors.push('name must be 1–200 characters');
    if (body.lat  !== undefined     && !isNum(body.lat, -90, 90))   errors.push('lat must be a valid latitude (-90 to 90)');
    if (body.lng  !== undefined     && !isNum(body.lng, -180, 180)) errors.push('lng must be a valid longitude (-180 to 180)');
    if (body.zone !== undefined && body.zone && !VALID_ZONES.includes(body.zone))
        errors.push(`zone must be one of: ${VALID_ZONES.join(', ')}`);
    if (body.postcode !== undefined && !isStr(body.postcode, 0, 20))
        errors.push('postcode must be ≤20 characters');
    return errors;
}

function validateBulkCustomers(body) {
    const errors = [];
    if (!Array.isArray(body)) { errors.push('request body must be an array of customers'); return errors; }
    if (body.length > 2000)   errors.push('maximum 2000 customers per upload');
    return errors;
}

function fail(res, errors) {
    return res.status(400).json({ success: false, message: errors[0], errors });
}

module.exports = { validateUser, validateCustomerCreate, validateCustomerUpdate, validateBulkCustomers, fail };
