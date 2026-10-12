/* Swavy Spare API test: starts a fresh server on a temporary database and runs the main flows.
   Run with: npm test */
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'swavy-spare-test-'));
const PORT = 3900 + Math.floor(Math.random() * 90), BASE = `http://localhost:${PORT}`;
let pass = 0, failed = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } };
function client() {
  let cookie = '';
  return async (method, url, body) => {
    const r = await fetch(BASE + url, { method, headers: Object.assign({ 'Content-Type': 'application/json', Origin: BASE }, cookie ? { Cookie: cookie } : {}), body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const j = await r.json().catch(() => ({})); j.status = r.status; return j;
  };
}
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'server.js'), '--port', String(PORT)], { env: Object.assign({}, process.env, { DATA_DIR: DATA, QUIET: '1' }), stdio: 'inherit' });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/catalog'); break; } catch (e) { await new Promise(r => setTimeout(r, 200)); } }
  try {
    const buyer = client(), seller = client(), checker = client(), anon = client();
    const cat = await anon('GET', '/api/catalog');
    ok('catalog has 6 device types and models', cat.types.length === 6 && cat.models.length > 30);
    ok('shop lists live devices', (await anon('GET', '/api/listings')).listings.length >= 15);
    ok('grade filter works', (await anon('GET', '/api/listings?grade=A')).listings.every(l => l.grade === 'A'));
    ok('budget filter works', (await anon('GET', '/api/listings?max=200000')).listings.every(l => l.price <= 200000));
    for (const [c, e] of [[buyer, 'buyer'], [seller, 'seller'], [checker, 'checker']]) ok(e + ' logs in', (await c('POST', '/api/login', { email: e + '@swavy.ng', password: 'swavy123' })).ok);
    const ip13 = cat.models.find(m => m.name === 'iPhone 13');
    const good = { cracked: 'no', battery: 'good', biometric: 'yes', working: 'yes', repaired: 'no', scratches: 'no', box: 'yes' };
    const e1 = await anon('POST', '/api/estimate', { type: 'phone', modelId: ip13.id, storage: '128GB', answers: good });
    const e2 = await anon('POST', '/api/estimate', { type: 'phone', modelId: ip13.id, storage: '128GB', answers: Object.assign({}, good, { cracked: 'yes', battery: 'weak' }) });
    ok('estimator gives a range around the base price', e1.low < ip13.basePrice && e1.high > ip13.basePrice);
    ok('cracked screen + weak battery lowers the estimate', e2.mid < e1.mid * 0.6, [e1.mid, e2.mid]);
    const stolen = await seller('POST', '/api/listings', { type: 'phone', modelId: ip13.id, storage: '128GB', answers: good, imei: '356938035643809', area: 'Ikeja' });
    ok('reported IMEI is blocked at listing', stolen.status === 409 && stolen.code === 'stolen');
    ok('bad IMEI refused', (await seller('POST', '/api/listings', { type: 'phone', modelId: ip13.id, storage: '128GB', answers: good, imei: '123456789012345', area: 'Ikeja' })).field === 'imei');
    const IMEI = '490154203237518';
    const L = await seller('POST', '/api/listings', { type: 'phone', modelId: ip13.id, storage: '128GB', answers: good, imei: IMEI, area: 'Ikeja', price: e1.mid });
    ok('seller posts listing', L.ok && L.id);
    const bk = await seller('POST', `/api/listings/${L.id}/check`, { slot: 'Today, afternoon' });
    ok('seller books a Swavy Checker', bk.ok && bk.fee === 3000);
    const cd = await checker('GET', '/api/checker');
    const chk = cd.booked.find(c => c.listing.id === L.id);
    ok('checker sees the booked check', !!chk);
    ok('checker IMEI lookup is clear', (await checker('POST', `/api/checks/${chk.id}/imei`)).result === 'clear');
    const all = { screen: 'pass', cameras: 'pass', charging: 'pass', buttons: 'pass', lock: 'pass', water: 'pass' };
    const sub = await checker('POST', `/api/checks/${chk.id}/submit`, { results: all, battery: 90 });
    ok('all pass + battery 90 = grade A', sub.grade === 'A', sub);
    ok('checker earned the fee', (await checker('GET', '/api/checker')).earnings.total >= cd.earnings.total + 3000);
    const lv = (await buyer('GET', '/api/listings/' + L.id)).listing;
    ok('listing shows report and grade', lv.grade === 'A' && lv.check.grade === 'A' && !lv.imei);
    // Grading rules
    const { gradeFor } = require('../server/app');
    ok('one fail + battery 80 = B', gradeFor('phone', Object.assign({}, all, { buttons: 'fail' }), 80).grade === 'B');
    ok('water damage = C', gradeFor('phone', Object.assign({}, all, { water: 'fail' }), 90).grade === 'C');
    ok('account lock on = failed', gradeFor('phone', Object.assign({}, all, { lock: 'fail' }), 90).grade === null);
    // Offer + escrow
    ok('buyer offer too low refused', (await buyer('POST', `/api/listings/${L.id}/offer`, { amount: 1000 })).status === 400);
    const offerAmt = Math.round(e1.mid * 0.95);
    await buyer('POST', `/api/listings/${L.id}/offer`, { amount: offerAmt });
    const sd = await seller('GET', '/api/seller');
    const off = sd.offers.find(o => o.listingId === L.id);
    ok('seller sees the offer', !!off);
    await seller('POST', `/api/offers/${off.id}/accept`);
    const ob = await buyer('POST', `/api/listings/${L.id}/buy`, { method: 'meet', meetSpot: 'Ikeja City Mall' });
    let o = (await buyer('GET', '/api/orders/' + ob.id)).order;
    ok('order uses accepted offer and money is held', o.amount === offerAmt && o.status === 'held' && /^\d{4}$/.test(o.code));
    ok('seller does not see the code', (await seller('GET', '/api/orders/' + ob.id)).order.code === null);
    ok('listing reserved, second buyer blocked', (await anon('GET', '/api/listings/' + L.id)).listing.status === 'reserved');
    o = (await seller('POST', `/api/orders/${ob.id}/handover`)).order;
    ok('seller ready to meet', o.status === 'handover');
    ok('wrong code refused', (await seller('POST', `/api/orders/${ob.id}/release`, { code: '0000' === (await buyer('GET', '/api/orders/' + ob.id)).order.code ? '1111' : '0000' })).status === 400);
    const code = (await buyer('GET', '/api/orders/' + ob.id)).order.code;
    o = (await seller('POST', `/api/orders/${ob.id}/release`, { code })).order;
    ok('buyer code releases money, listing sold', o.status === 'released' && (await anon('GET', '/api/listings/' + L.id)).status === 200);
    // Report stolen blocks a live listing
    const L2 = await seller('POST', '/api/listings', { type: 'phone', modelId: ip13.id, storage: '64GB', answers: good, imei: '353456789012348', area: 'Ikeja' });
    ok('second listing posted', L2.ok, L2);
    const rep = await buyer('POST', '/api/report', { imei: '353456789012348', device: 'iPhone 13', what: 'Snatched' });
    ok('report stolen blocks the live listing', rep.blocked === 1);
    ok('blocked listing hidden from buyers', (await anon('GET', '/api/listings/' + L2.id)).status === 404);
    ok('IMEI lookup shows reported', (await anon('GET', '/api/imei/353456789012348')).result === 'reported');
    ok('admin overview needs password', (await anon('GET', '/api/admin/overview')).status === 401);
    await anon('POST', '/api/admin/login', { password: 'swavyadmin' });
    const ad = await anon('GET', '/api/admin/overview');
    ok('admin sees blocked attempt and reported list', ad.attempts.length >= 1 && ad.reported.length >= 5);
  } catch (e) { failed++; console.error(e); }
  srv.kill();
  console.log(`\n  ${pass} passed, ${failed} failed\n`);
  fs.rmSync(DATA, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})();
