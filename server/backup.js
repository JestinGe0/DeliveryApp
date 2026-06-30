const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const fs = require('fs');
const path = require('path');

async function createBackup() {
    console.log('Creating manual backup...');
    
    const DATA_DIR = path.join(__dirname, 'data');
    const DB_PATH = path.join(DATA_DIR, 'pep_database.sqlite');
    const backupDir = path.join(DATA_DIR, 'backups');
    
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir);
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `manual-backup-${timestamp}.json`);
    
    const db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
    });
    
    // Export all data
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
    console.log(`✅ Backup created at ${backupFile}`);
    
    // Keep only last 20 backups
    const backups = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('manual-backup-') && f.endsWith('.json'))
        .map(f => ({
            name: f,
            path: path.join(backupDir, f),
            time: fs.statSync(path.join(backupDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);
    
    if (backups.length > 20) {
        backups.slice(20).forEach(backup => {
            fs.unlinkSync(backup.path);
            console.log(`Removed old backup: ${backup.name}`);
        });
    }
}

createBackup().catch(console.error);