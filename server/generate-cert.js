'use strict';
const selfsigned = require('selfsigned');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const certDir  = path.join(__dirname, 'certs');
const keyPath  = path.join(certDir, 'server.key');
const certPath = path.join(certDir, 'server.cert');

if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });

// Collect all local IPv4 addresses so the cert covers every NIC on this machine
const nets = os.networkInterfaces();
const ips  = ['127.0.0.1'];
for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
}

const attrs = [
    { name: 'commonName',       value: 'PEP Delivery Platform' },
    { name: 'organizationName', value: 'PEP Delivery'          }
];

const extensions = [{
    name: 'subjectAltName',
    altNames: [
        { type: 2, value: 'localhost' },
        ...ips.map(ip => ({ type: 7, ip }))
    ]
}];

console.log('Generating self-signed TLS certificate...');
console.log('Covering IPs: localhost, ' + ips.join(', '));

const pems = selfsigned.generate(attrs, {
    days:      3650,
    algorithm: 'sha256',
    keySize:   2048,
    extensions
});

fs.writeFileSync(keyPath,  pems.private);
fs.writeFileSync(certPath, pems.cert);

console.log('');
console.log('Certificate written to:');
console.log('  Key:  ' + keyPath);
console.log('  Cert: ' + certPath);
console.log('');
console.log('Next steps:');
console.log('  1. Open server\\.env and set  HTTPS_ENABLED=true');
console.log('  2. Run stop.bat then start.bat');
console.log('  3. Open https://localhost:3443  (or your network IP)');
console.log('  4. Browser will warn "connection not private" — click Advanced > Proceed.');
console.log('     This warning appears once per browser because the cert is self-signed.');
console.log('     It does NOT mean the traffic is unencrypted — it IS encrypted.');
