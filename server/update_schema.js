const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

async function updateSchema() {
    console.log('Updating database schema...');
    
    const DATA_DIR = path.join(__dirname, 'data');
    const DB_PATH = path.join(DATA_DIR, 'pep_database.sqlite');
    
    const db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
    });

    try {
        // Check if updated_at column exists in picking_metrics
        const tableInfo = await db.all("PRAGMA table_info(picking_metrics)");
        const hasUpdatedAt = tableInfo.some(col => col.name === 'updated_at');
        
        if (!hasUpdatedAt) {
            console.log('Adding updated_at column to picking_metrics table...');
            await db.run(`ALTER TABLE picking_metrics ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
            console.log('✅ Column added successfully');
        } else {
            console.log('updated_at column already exists');
        }

        // Check if other tables need updated_at columns
        const tables = ['customers', 'orders', 'staff', 'delivery_plans', 'card_states'];
        
        for (const table of tables) {
            const tableInfo = await db.all(`PRAGMA table_info(${table})`);
            const hasUpdatedAt = tableInfo.some(col => col.name === 'updated_at');
            
            if (!hasUpdatedAt) {
                console.log(`Adding updated_at column to ${table} table...`);
                await db.run(`ALTER TABLE ${table} ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
                console.log(`✅ Column added to ${table}`);
            }
        }

        // Check if customer_passports table has updated_at
        const passportInfo = await db.all("PRAGMA table_info(customer_passports)");
        const passportHasUpdatedAt = passportInfo.some(col => col.name === 'updated_at');
        
        if (!passportHasUpdatedAt) {
            console.log('Adding updated_at column to customer_passports table...');
            await db.run(`ALTER TABLE customer_passports ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
            console.log('✅ Column added to customer_passports');
        }

        console.log('✅ Schema update completed successfully');
    } catch (error) {
        console.error('Error updating schema:', error);
    } finally {
        await db.close();
    }
}

updateSchema().catch(console.error);