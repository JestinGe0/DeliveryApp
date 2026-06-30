const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const fs = require('fs');
const path = require('path');

// Define ORDER_STATUSES for migration
const ORDER_STATUSES = {
    PENDING: 'pending',
    PICKING: 'picking',
    READY_FOR_DELIVERY: 'ready_for_delivery',
    DELIVERING: 'delivering',
    DELIVERED: 'delivered',
    COLLECTED: 'collected',
    CANCELLED: 'cancelled'
};

async function initializeDatabase(db) {
    console.log('Creating database tables...');
    
    await db.exec(`
        -- Customers table
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            address TEXT,
            postcode TEXT,
            latitude REAL,
            longitude REAL,
            zone TEXT,
            road_distance REAL,
            road_duration REAL,
            original_data TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Customer passports table
        CREATE TABLE IF NOT EXISTS customer_passports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            passport_data TEXT NOT NULL,
            version INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (customer_id) REFERENCES customers(id),
            UNIQUE(customer_id)
        );

        -- Orders table
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            order_number TEXT,
            status TEXT,
            assigned_van INTEGER,
            assigned_day INTEGER,
            delivery_order INTEGER,
            assigned_staff TEXT,
            assigned_driver INTEGER,
            zone TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (customer_id) REFERENCES customers(id)
        );

        -- Staff table
        CREATE TABLE IF NOT EXISTS staff (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            staff_id INTEGER NOT NULL UNIQUE,
            name TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            role TEXT,
            type TEXT,
            shift TEXT,
            license TEXT,
            vehicle_preference TEXT,
            total_picks INTEGER DEFAULT 0,
            total_deliveries INTEGER DEFAULT 0,
            notes TEXT,
            active_orders INTEGER DEFAULT 0,
            staff_data TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Delivery plans table
        CREATE TABLE IF NOT EXISTS delivery_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            van_id INTEGER NOT NULL,
            day_id INTEGER NOT NULL,
            customer_ids TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(van_id, day_id)
        );

        -- Picking metrics table (for analytics)
        CREATE TABLE IF NOT EXISTS picking_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            customer_id INTEGER NOT NULL,
            time_to_first_picker INTEGER,
            picking_duration INTEGER,
            efficiency_score INTEGER,
            number_of_pickers INTEGER,
            picker_names TEXT,
            plants_per_hour REAL,
            plants_per_picker TEXT,
            timestamp_first_picker DATETIME,
            timestamp_picking_started DATETIME,
            timestamp_picking_completed DATETIME,
            timestamp_ready_for_delivery DATETIME,
            timestamp_delivered DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (order_id) REFERENCES orders(id),
            FOREIGN KEY (customer_id) REFERENCES customers(id)
        );

        -- Card states table
        CREATE TABLE IF NOT EXISTS card_states (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            card_type TEXT NOT NULL,
            card_id TEXT NOT NULL,
            is_expanded BOOLEAN DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(card_type, card_id)
        );

        -- System settings table
        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Create indexes for better performance
        CREATE INDEX IF NOT EXISTS idx_customers_customer_id ON customers(customer_id);
        CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
        CREATE INDEX IF NOT EXISTS idx_picking_metrics_customer_id ON picking_metrics(customer_id);
        CREATE INDEX IF NOT EXISTS idx_picking_metrics_timestamps ON picking_metrics(timestamp_ready_for_delivery);
    `);

    console.log('✅ Database tables created successfully');
}

// Helper function to determine zone (simplified version for migration)
function determineZone(lat, lng) {
    const YOUR_SITE = {
        lat: 50.93641457204465,
        lng: -0.10523837877714509
    };
    
    lat = parseFloat(lat);
    lng = parseFloat(lng);
    if (isNaN(lat) || isNaN(lng)) return 'Local';
    
    // Simple distance calculation
    const R = 6371;
    const dLat = (lat - YOUR_SITE.lat) * Math.PI / 180;
    const dLon = (lng - YOUR_SITE.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(YOUR_SITE.lat*Math.PI/180)*Math.cos(lat*Math.PI/180)*Math.sin(dLon/2)**2;
    const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    const LOCAL_ZONE_RADIUS = 0;
    if (distance <= LOCAL_ZONE_RADIUS) return 'Local';
    if (lat >= 53.0 && lat <= 55.0 && lng >= -3.5 && lng <= -2.0) return 'North West';
    if (lat >= 50.0 && lat <= 52.0 && lng >= -5.0 && lng <= -2.5) return 'South West';
    if (lat >= 51.0 && lat <= 52.5 && lng >= -0.5 && lng <=  1.5) return 'London/North East';
    if (lat >= 50.5 && lat <= 51.5 && lng >= -1.0 && lng <=  1.0) return 'South East';
    return 'Local';
}

async function migrate() {
    console.log('Starting migration from JSON to SQLite...');
    
    const DATA_DIR = path.join(__dirname, 'data');
    const DB_PATH = path.join(DATA_DIR, 'pep_database.sqlite');
    
    // Create data directory if it doesn't exist
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR);
    }
    
    // Open database
    const db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
    });
    
    // Initialize database tables first
    await initializeDatabase(db);
    
    // Check if we have existing JSON files
    const files = {
        customers: path.join(DATA_DIR, 'customers.json'),
        database: path.join(DATA_DIR, 'database.json'),
        staff: path.join(DATA_DIR, 'staff.json'),
        cardStates: path.join(DATA_DIR, 'cardStates.json')
    };
    
    // Track counts for reporting
    let customerCount = 0;
    let orderCount = 0;
    let staffCount = 0;
    let passportCount = 0;
    
    // Migrate customers
    if (fs.existsSync(files.customers)) {
        console.log('\n📁 Found customers.json - migrating customers...');
        const customerData = JSON.parse(fs.readFileSync(files.customers, 'utf8'));
        
        if (customerData.customers && customerData.customers.length > 0) {
            for (const customer of customerData.customers) {
                const lat = parseFloat(customer.Latitude || customer.latitude || customer.Lat || customer.lat || 0);
                const lng = parseFloat(customer.Longitude || customer.longitude || customer.Lon || customer.lng || customer.Long || 0);
                const zone = determineZone(lat, lng);
                
                const customerId = customer.id || Date.now() + Math.random();
                
                await db.run(`
                    INSERT INTO customers 
                    (customer_id, name, address, postcode, latitude, longitude, zone, original_data)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    customerId,
                    customer.Name || customer.name || 'Unknown',
                    customer.Address || customer.address || '',
                    customer.Pincode || customer.postcode || '',
                    lat,
                    lng,
                    zone,
                    JSON.stringify(customer)
                ]);
                
                customerCount++;
                
                // If customer has passport data in the original JSON, migrate it
                if (customer.passport) {
                    await db.run(`
                        INSERT INTO customer_passports (customer_id, passport_data)
                        VALUES (?, ?)
                    `, [customerId, JSON.stringify(customer.passport)]);
                    passportCount++;
                }
            }
            console.log(`✅ Migrated ${customerCount} customers (${passportCount} with passport data)`);
        }
    }
    
    // Migrate delivery data
    if (fs.existsSync(files.database)) {
        console.log('\n📁 Found database.json - migrating delivery data...');
        const deliveryData = JSON.parse(fs.readFileSync(files.database, 'utf8'));
        
        if (deliveryData.customers) {
            for (const customer of deliveryData.customers) {
                // Get the customer from customers table to get the ID
                const dbCustomer = await db.get(
                    'SELECT id FROM customers WHERE customer_id = ?',
                    [customer.id]
                );
                
                if (dbCustomer) {
                    // Update customer with delivery info
                    await db.run(`
                        UPDATE customers 
                        SET road_distance = ?, road_duration = ?
                        WHERE customer_id = ?
                    `, [
                        customer.roadDistanceFromSite || 0,
                        customer.roadDurationFromSite || 0,
                        customer.id
                    ]);
                    
                    // Insert order data
                    const assignedStaff = JSON.stringify(customer.assignedStaff || []);
                    
                    await db.run(`
                        INSERT OR REPLACE INTO orders 
                        (customer_id, order_number, status, assigned_van, assigned_day, 
                         delivery_order, assigned_staff, assigned_driver, zone)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        customer.id,
                        customer.passport?.orderNumber || `ORD-${customer.id}`,
                        customer.status || ORDER_STATUSES.PENDING,
                        customer.assignedVan,
                        customer.assignedDay,
                        customer.deliveryOrder || 0,
                        assignedStaff,
                        customer.assignedDriver,
                        customer.zone || 'Local'
                    ]);
                    
                    orderCount++;
                    
                    // Migrate picking metrics if available
                    if (customer.passport?.pickingMetrics) {
                        const order = await db.get(
                            'SELECT id FROM orders WHERE customer_id = ?',
                            [customer.id]
                        );
                        
                        if (order) {
                            const metrics = customer.passport.pickingMetrics;
                            const timestamps = customer.passport.timestamps || {};
                            
                            await db.run(`
                                INSERT INTO picking_metrics 
                                (order_id, customer_id, time_to_first_picker, picking_duration, 
                                 efficiency_score, number_of_pickers, picker_names, plants_per_hour,
                                 plants_per_picker, timestamp_first_picker, timestamp_picking_started,
                                 timestamp_picking_completed, timestamp_ready_for_delivery, timestamp_delivered)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            `, [
                                order.id,
                                customer.id,
                                metrics.timeToFirstPicker || 0,
                                metrics.pickingDuration || 0,
                                metrics.efficiencyScore || 0,
                                metrics.numberOfPickers || 0,
                                JSON.stringify(metrics.pickerNames || []),
                                metrics.plantsPerHour || 0,
                                JSON.stringify(metrics.plantsPerPicker || {}),
                                timestamps.firstPickerAssigned,
                                timestamps.pickingStarted,
                                timestamps.pickingCompleted,
                                timestamps.readyForDelivery,
                                timestamps.deliveredAt
                            ]);
                        }
                    }
                }
            }
            console.log(`✅ Migrated ${orderCount} orders with assignments`);
        }
        
        // Migrate delivery plans
        if (deliveryData.deliveryPlan) {
            for (const [vanId, days] of Object.entries(deliveryData.deliveryPlan)) {
                for (const [dayId, customerIds] of Object.entries(days)) {
                    await db.run(`
                        INSERT OR REPLACE INTO delivery_plans (van_id, day_id, customer_ids)
                        VALUES (?, ?, ?)
                    `, [parseInt(vanId), parseInt(dayId), JSON.stringify(customerIds)]);
                }
            }
            console.log('✅ Migrated delivery plans');
        }
    }
    
    // Migrate staff data
    if (fs.existsSync(files.staff)) {
        console.log('\n📁 Found staff.json - migrating staff data...');
        const staffData = JSON.parse(fs.readFileSync(files.staff, 'utf8'));
        
        if (staffData.staffMembers) {
            for (const staff of staffData.staffMembers) {
                await db.run(`
                    INSERT OR REPLACE INTO staff 
                    (staff_id, name, email, phone, role, type, shift, license,
                     vehicle_preference, total_picks, total_deliveries, notes, 
                     active_orders, staff_data)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    staff.id,
                    staff.name,
                    staff.email || '',
                    staff.phone || '',
                    staff.role || '',
                    staff.type || 'picker',
                    staff.shift || 'Morning',
                    staff.license || '',
                    staff.vehiclePreference || '',
                    staff.totalPicks || 0,
                    staff.totalDeliveries || 0,
                    staff.notes || '',
                    staff.activeOrders || 0,
                    JSON.stringify(staff)
                ]);
                
                staffCount++;
            }
            console.log(`✅ Migrated ${staffCount} staff members`);
        }
    }
    
    // Migrate card states
    if (fs.existsSync(files.cardStates)) {
        console.log('\n📁 Found cardStates.json - migrating card states...');
        const cardData = JSON.parse(fs.readFileSync(files.cardStates, 'utf8'));
        
        let cardStateCount = 0;
        
        if (cardData.currentOrders) {
            for (const [cardId, isExpanded] of Object.entries(cardData.currentOrders)) {
                await db.run(`
                    INSERT OR REPLACE INTO card_states (card_type, card_id, is_expanded)
                    VALUES (?, ?, ?)
                `, ['currentOrders', cardId, isExpanded ? 1 : 0]);
                cardStateCount++;
            }
        }
        
        if (cardData.weeklyPlan) {
            for (const [cardId, isExpanded] of Object.entries(cardData.weeklyPlan)) {
                await db.run(`
                    INSERT OR REPLACE INTO card_states (card_type, card_id, is_expanded)
                    VALUES (?, ?, ?)
                `, ['weeklyPlan', cardId, isExpanded ? 1 : 0]);
                cardStateCount++;
            }
        }
        
        console.log(`✅ Migrated ${cardStateCount} card states`);
    }
    
    // Set initial system settings
    await db.run(`
        INSERT OR REPLACE INTO system_settings (key, value)
        VALUES ('db_version', '1.0'), ('migration_date', ?)
    `, [new Date().toISOString()]);
    
    console.log('\n📊 Migration Summary:');
    console.log(`   - Customers: ${customerCount}`);
    console.log(`   - Passports: ${passportCount}`);
    console.log(`   - Orders: ${orderCount}`);
    console.log(`   - Staff: ${staffCount}`);
    console.log(`   - Database: ${DB_PATH}`);
    
    // Create a backup after migration
    const backupDir = path.join(DATA_DIR, 'backups');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir);
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `post-migration-backup-${timestamp}.json`);
    
    // Export all data for backup
    const customers = await db.all('SELECT * FROM customers');
    const passports = await db.all('SELECT * FROM customer_passports');
    const orders = await db.all('SELECT * FROM orders');
    const staff = await db.all('SELECT * FROM staff');
    const deliveryPlans = await db.all('SELECT * FROM delivery_plans');
    const pickingMetrics = await db.all('SELECT * FROM picking_metrics');
    const cardStates = await db.all('SELECT * FROM card_states');
    const settings = await db.all('SELECT * FROM system_settings');
    
    const backupData = {
        timestamp: new Date().toISOString(),
        version: '1.0',
        summary: {
            customers: customers.length,
            passports: passports.length,
            orders: orders.length,
            staff: staff.length,
            deliveryPlans: deliveryPlans.length,
            pickingMetrics: pickingMetrics.length,
            cardStates: cardStates.length,
            settings: settings.length
        },
        data: {
            customers,
            passports,
            orders,
            staff,
            deliveryPlans,
            pickingMetrics,
            cardStates,
            settings
        }
    };
    
    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
    console.log(`\n✅ Backup created at: ${backupFile}`);
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('You can now start the server with: npm start');
}

migrate().catch(console.error);