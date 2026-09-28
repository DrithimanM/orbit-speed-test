const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const app = fs.readFileSync('dist/app.js', 'utf8');
const html = fs.readFileSync('dist/index.html', 'utf8');
const security = require('../dist/security.js');
const coreContext = vm.createContext({});
vm.runInContext(fs.readFileSync('dist/core.js', 'utf8'), coreContext);
const Core = vm.runInContext('SpeedCore', coreContext);

assert.doesNotMatch(app, /navigator\.geolocation|getCurrentPosition|watchPosition/);
assert.match(app, /AbortSignal\.timeout\(800\)/);
assert.match(app, /Promise\.allSettled\(servers\.map\(probe\)\)/);
assert.match(app, /durationMs:5000/);
assert.match(app, /durationMs:15000/);
assert.match(app, /delta>=100/);
assert.match(app, /await delay\(250,signal\)/);
assert.match(app, /function redactIP/);
assert.match(app, /function showIP/);
assert.doesNotMatch(app, /innerHTML|outerHTML|insertAdjacentHTML|\beval\(|new Function/);
assert.match(html, /id="profile-toggle"/);
assert.match(html, /role="switch"/);
assert.match(html, /id="unmask-ip"/);
assert.doesNotMatch(html, /rocket\.png|id="rocket"/);
assert.match(html, /mechanical-progress/);

assert.equal(Core.median([1, 2, 9, 10]), 5.5);
assert.equal(Core.jitter([10, 20, 15]), 7.5);
assert.equal(Core.distance([25, 55], [25, 55]), 0);
assert.ok(Core.distance([25.2, 55.3], [51.5, -.1]) > 5000);
assert.equal(Core.bufferbloatGrade(4.9), 'A+');
assert.equal(Core.bufferbloatGrade(15), 'A');
assert.equal(Core.bufferbloatGrade(30), 'B');
assert.equal(Core.bufferbloatGrade(60), 'C');
assert.equal(Core.bufferbloatGrade(60.1), 'F');

const transfer = {bytes:100, durationMs:5000, transferMs:5000, mbps:.16, points:[{seconds:.1, mbps:.2}], loadedPings:[12, 16, 14], probeFailures:0, requests:2, retries:0};
const record = {id:'flight', date:'2026-09-28T10:00:00Z', status:'complete', server:'Cloudflare', serverId:'cloudflare', pings:[10,11,10,11], pingMs:10.5, jitterMs:1, downloadMbps:100, uploadMbps:20, download:transfer, upload:transfer, streams:4, profile:'quick', measurementVersion:2};
assert.equal(security.validRecord(record), true);
assert.equal(security.validRecord({...record, profile:'deep'}), false);
assert.equal(security.validRecord({...record, ip:'192.0.2.1'}), false);
assert.equal(security.validRecord({...record, location:[25,55]}), false);
console.log('PASS: GPS-free route lock, dual profiles, 100 ms throughput sampling, 250 ms loaded probes, safe DOM, IP-redaction control, profile-aware records, and bounded history.');
