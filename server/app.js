/* Swavy Spare: listings, price estimator, Swavy Checker grading, IMEI block list, offers and simulated escrow. */
'use strict';

const TYPES = [
  { key: 'phone', name: 'Phone', icon: 'phone', storage: ['64GB', '128GB', '256GB', '512GB'], fee: 3000, needsImei: true },
  { key: 'laptop', name: 'Laptop', icon: 'laptop', storage: ['128GB', '256GB', '512GB', '1TB'], fee: 5000 },
  { key: 'tablet', name: 'Tablet', icon: 'tablet', storage: ['64GB', '128GB', '256GB', '512GB'], fee: 4000, needsImei: false },
  { key: 'console', name: 'Game console', icon: 'game', storage: [], fee: 5000 },
  { key: 'audio', name: 'AirPods & audio', icon: 'headphones', storage: [], fee: 2000 },
  { key: 'watch', name: 'Smartwatch', icon: 'watch', storage: [], fee: 2000 }
];
const T = Object.fromEntries(TYPES.map(t => [t.key, t]));

// Condition questions. "bad" is the answer that lowers the price; factor is the price multiplier for it.
const QUESTIONS = [
  { key: 'cracked', q: 'Is the screen cracked?', hint: 'Any crack, even small', bad: 'yes', factor: 0.7, types: ['phone', 'laptop', 'tablet', 'watch'] },
  { key: 'battery', q: 'How is the battery?', hint: 'iPhone: Settings > Battery > Battery Health', kind: 'battery', types: ['phone', 'laptop', 'tablet', 'watch', 'audio'] },
  { key: 'biometric', q: 'Face ID or fingerprint works?', hint: 'Unlock with your face or finger', bad: 'no', factor: 0.85, types: ['phone', 'tablet'] },
  { key: 'working', q: 'Everything works?', hint: 'Buttons, speaker, mic, cameras, charging', bad: 'no', factor: 0.75, types: ['phone', 'laptop', 'tablet', 'console', 'audio', 'watch'] },
  { key: 'repaired', q: 'Any repairs or parts changed?', hint: 'Screen, battery or board changed before', bad: 'yes', factor: 0.88, types: ['phone', 'laptop', 'tablet', 'console', 'audio', 'watch'] },
  { key: 'scratches', q: 'Scratches or dents on the body?', hint: 'Deep marks you can feel', bad: 'yes', factor: 0.93, types: ['phone', 'laptop', 'tablet', 'console', 'audio', 'watch'] },
  { key: 'box', q: 'Do you have the box or charger?', hint: 'Original accessories add value', bad: 'no', factor: 0.97, types: ['phone', 'laptop', 'tablet', 'console', 'audio', 'watch'] }
];
const BATTERY = { good: { label: 'Good (85%+)', f: 1 }, ok: { label: 'OK (75–84%)', f: 0.9 }, weak: { label: 'Weak (below 75%)', f: 0.78 } };
const CHECK_ITEMS = [
  { key: 'screen', label: 'Screen: no cracks, dead pixels or lines' },
  { key: 'cameras', label: 'Cameras and Face ID / fingerprint work', types: ['phone', 'tablet', 'laptop'] },
  { key: 'charging', label: 'Charges properly' },
  { key: 'buttons', label: 'Buttons, speakers and mic work' },
  { key: 'lock', label: 'iCloud / Google account lock is OFF', critical: true },
  { key: 'water', label: 'No water damage signs' }
];
const ESCROW_NOTE = 'Simulated escrow: this demo does not hold real money. Real payments would need a licensed provider like Paystack or Flutterwave.';
const STATUS_TEXT = { held: 'Money held', handover: 'Meeting / on the way', released: 'Money released', refunded: 'Cancelled & refunded' };

function luhn(d) { let s = 0; for (let i = 0; i < d.length; i++) { let n = +d[d.length - 1 - i]; if (i % 2) { n *= 2; if (n > 9) n -= 9; } s += n; } return s % 10 === 0; }
const round5k = n => Math.max(5000, Math.round(n / 5000) * 5000);

function estimate(base, type, storage, answers) {
  const t = T[type];
  let f = 1;
  const reasons = [];
  if (t && t.storage.length && storage) {
    const i = t.storage.indexOf(storage);
    if (i >= 0) { const sf = [0.9, 1, 1.12, 1.25][i]; if (sf !== 1) reasons.push(`${storage} storage ${sf > 1 ? '+' : ''}${Math.round((sf - 1) * 100)}%`); f *= sf; }
  }
  for (const q of QUESTIONS) {
    if (!q.types.includes(type)) continue;
    const a = answers[q.key];
    if (q.kind === 'battery') { const b = BATTERY[a]; if (b && b.f !== 1) { f *= b.f; reasons.push(`Battery ${a} -${Math.round((1 - b.f) * 100)}%`); } continue; }
    if (a === q.bad) { f *= q.factor; reasons.push(`${q.q.replace('?', '')}: ${a} -${Math.round((1 - q.factor) * 100)}%`); }
  }
  const est = base * f;
  return { low: round5k(est * 0.9), high: round5k(est * 1.06), mid: round5k(est), reasons };
}

function gradeFor(type, results, battery) {
  const items = CHECK_ITEMS.filter(i => !i.types || i.types.includes(type));
  const fails = items.filter(i => results[i.key] === 'fail');
  if (fails.some(i => i.critical)) return { grade: null, failed: 'Account lock is still ON. The seller must remove iCloud / Google lock before this device can be Swavy Checked.' };
  const water = fails.some(i => i.key === 'water');
  const b = battery == null || battery === '' ? null : Number(battery);
  if (!fails.length && (b == null || b >= 85)) return { grade: 'A' };
  if (!water && fails.length <= 1 && (b == null || b >= 75)) return { grade: 'B' };
  return { grade: 'C' };
}

function createApp({ db, core }) {
  const { fail, str, text, int, json } = core;
  const now = () => Date.now();
  const cleanImei = v => String(v || '').replace(/[\s-]/g, '').toUpperCase().slice(0, 30);
  const reported = imei => imei ? db.get('SELECT * FROM reported_imeis WHERE imei = ?', imei) : null;
  const oevent = (id, t) => db.run('INSERT INTO order_events (order_id, text, at) VALUES (?,?,?)', id, t, now());

  function me(u) {
    const out = { id: u.id, role: u.role, name: u.name, email: u.email, phone: u.phone, city: u.city, area: u.area };
    if (u.role === 'checker') { const c = db.get('SELECT * FROM checkers WHERE user_id = ?', u.id); out.checker = c ? { areas: json(c.areas, []), verified: !!c.verified } : null; }
    return out;
  }
  function checkOut(c) {
    if (!c) return null;
    const ch = db.get('SELECT name FROM users WHERE id = ?', c.checker_id);
    return { id: c.id, status: c.status, slot: c.slot, fee: c.fee, results: json(c.results, {}), imeiStatus: c.imei_status, grade: c.grade, notes: c.notes, createdAt: c.created_at, doneAt: c.done_at, checker: ch ? ch.name : '' };
  }
  function listingOut(l, viewer, full) {
    const s = db.get('SELECT id, name, area, city, phone, created_at FROM users WHERE id = ?', l.seller_id);
    const o = {
      id: l.id, ref: l.ref, type: l.type, brand: l.brand, title: l.title, storage: l.storage, price: l.price, estLow: l.est_low, estHigh: l.est_high,
      photos: json(l.photos, []), city: l.city, area: l.area, status: l.status, grade: l.grade, checked: !!l.grade, checkedAt: l.checked_at, createdAt: l.created_at,
      seller: { id: s.id, name: s.name, area: s.area, since: s.created_at, sales: db.get("SELECT COUNT(*) n FROM orders WHERE seller_id = ? AND status = 'released'", s.id).n },
      mine: !!viewer && viewer.id === l.seller_id
    };
    if (full) {
      o.answers = json(l.answers, {}); o.description = l.description;
      o.imeiMasked = l.imei ? l.imei.slice(0, 4) + '•••••••' + l.imei.slice(-4) : '';
      const c = db.get("SELECT * FROM checks WHERE listing_id = ? ORDER BY id DESC LIMIT 1", l.id);
      o.check = checkOut(c);
      if (o.mine) { o.imei = l.imei; o.offers = db.all("SELECT o.id, o.amount, o.status, o.created_at createdAt, u.name buyer FROM offers o JOIN users u ON u.id = o.buyer_id WHERE listing_id = ? ORDER BY o.id DESC", l.id); }
      if (viewer && !o.mine) { const off = db.get("SELECT id, amount, status FROM offers WHERE listing_id = ? AND buyer_id = ? ORDER BY id DESC LIMIT 1", l.id, viewer.id); o.myOffer = off || null; }
      const ord = viewer && db.get("SELECT id FROM orders WHERE listing_id = ? AND (buyer_id = ? OR seller_id = ?) AND status IN ('held','handover') ", l.id, viewer.id, viewer.id);
      o.openOrderId = ord ? ord.id : null;
    }
    return o;
  }

  function browse(q, viewer) {
    const where = ["l.status = 'live'"], args = [];
    if (q.type && T[q.type]) { where.push('l.type = ?'); args.push(q.type); }
    if (q.brand) { where.push('l.brand = ?'); args.push(str(q.brand, 30)); }
    if (q.max && Number(q.max) > 0) { where.push('l.price <= ?'); args.push(Number(q.max)); }
    if (q.grade === 'checked') where.push('l.grade IS NOT NULL');
    else if (['A', 'B', 'C'].includes(q.grade)) { where.push('l.grade = ?'); args.push(q.grade); }
    if (q.city) { where.push('l.city = ?'); args.push(str(q.city, 20)); }
    if (q.area) { where.push('l.area = ?'); args.push(str(q.area, 40)); }
    if (q.q) { where.push('(l.title LIKE ? OR l.brand LIKE ?)'); args.push(`%${str(q.q, 40)}%`, `%${str(q.q, 40)}%`); }
    const order = q.sort === 'cheap' ? 'l.price ASC' : q.sort === 'dear' ? 'l.price DESC' : '(l.grade IS NOT NULL) DESC, l.created_at DESC';
    return db.all(`SELECT l.* FROM listings l WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 120`, ...args).map(l => listingOut(l, viewer));
  }

  function getListing(id) { const l = db.get('SELECT * FROM listings WHERE id = ?', Number(id)); if (!l) fail('Listing not found.', null, 404); return l; }

  function quote(b) {
    const type = str(b.type, 20);
    if (!T[type]) fail('Pick a device type.');
    const m = db.get('SELECT * FROM models WHERE id = ?', Number(b.modelId));
    if (!m || m.type !== type) fail('Pick the model.');
    return Object.assign(estimate(m.base_price, type, str(b.storage, 10), b.answers || {}), { base: m.base_price, model: m });
  }

  function createListing(user, b) {
    if (user.role !== 'user') fail('Checker accounts cannot sell. Use a normal account.', null, 403);
    const est = quote(b);
    const type = est.model.type;
    const answers = {};
    for (const q of QUESTIONS.filter(x => x.types.includes(type))) {
      const a = b.answers && b.answers[q.key];
      if (q.kind === 'battery' ? !BATTERY[a] : !['yes', 'no'].includes(a)) fail(`Please answer: ${q.q}`);
      answers[q.key] = a;
    }
    const imei = cleanImei(b.imei);
    if (T[type].needsImei) {
      if (!/^\d{15}$/.test(imei)) fail('Enter the 15-digit IMEI. Dial *#06# on the phone to see it.', 'imei');
      if (!luhn(imei)) fail('That IMEI does not look right. Check the digits again (dial *#06#).', 'imei');
    } else if (imei && imei.length < 5) fail('Serial number looks too short.', 'imei');
    if (imei && reported(imei)) {
      db.run('INSERT INTO blocked_attempts (imei, user_id, title, at) VALUES (?,?,?,?)', imei, user.id, est.model.name, now());
      fail('This device has been reported stolen on Swavy. It cannot be listed. If this is a mistake, contact Swavy support with your receipt.', 'imei', 409, 'stolen');
    }
    if (imei && db.get("SELECT 1 FROM listings WHERE imei = ? AND status IN ('live','reserved')", imei)) fail('This device is already listed on Swavy Spare.', 'imei', 409);
    const price = int(b.price || est.mid, 'price', { min: 1000, max: 50e6, label: 'Price' });
    const area = str(b.area, 40) || user.area, city = core.cityOf(area);
    if (!city) fail('Pick your area.', 'area');
    const photos = (Array.isArray(b.photos) ? b.photos : []).filter(u => /^\/(uploads|img)\/[A-Za-z0-9_\/.-]+$/.test(u)).slice(0, 8);
    const storage = T[type].storage.includes(b.storage) ? b.storage : '';
    const title = `${est.model.name}${storage ? ' ' + storage : ''}`;
    return db.tx(() => {
      let ref; do { ref = core.ref('SP'); } while (db.get('SELECT 1 FROM listings WHERE ref = ?', ref));
      return Number(db.run(`INSERT INTO listings (ref, seller_id, model_id, type, brand, title, storage, answers, imei, est_low, est_high, price, photos, description, city, area, status, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'live', ?, ?)`, ref, user.id, est.model.id, type, est.model.brand, title, storage, JSON.stringify(answers), imei, est.low, est.high, price,
        JSON.stringify(photos.length ? photos : [`/img/sample/${type}-1.svg`]), text(b.description, 600), city, area, now(), now()).lastInsertRowid);
    });
  }

  function myListing(user, id) { const l = getListing(id); if (l.seller_id !== user.id) fail('This is not your listing.', null, 403); return l; }

  function bookCheck(user, id, slot) {
    const l = myListing(user, id);
    if (l.status !== 'live') fail('You can only book a check for a live listing.');
    if (l.grade) fail('This device is already Swavy Checked.');
    if (db.get("SELECT 1 FROM checks WHERE listing_id = ? AND status = 'booked'", l.id)) fail('A check is already booked for this device.');
    const all = db.all("SELECT c.*, u.name FROM checkers c JOIN users u ON u.id = c.user_id WHERE c.verified = 1");
    const pick = all.find(c => json(c.areas, []).includes(l.area)) || all.find(c => json(c.areas, []).some(a => core.cityOf(a) === l.city));
    if (!pick) fail('No Swavy Checker covers your area yet. Try again soon.');
    db.run("INSERT INTO checks (listing_id, checker_id, slot, status, fee, created_at) VALUES (?,?,?, 'booked', ?, ?)", l.id, pick.user_id, str(slot, 40) || 'Today', T[l.type].fee, now());
    return { checker: pick.name, fee: T[l.type].fee };
  }

  function checkFor(user, id) {
    const c = db.get('SELECT * FROM checks WHERE id = ?', Number(id));
    if (!c || c.checker_id !== user.id) fail('Check not found.', null, 404);
    return c;
  }
  function checkerJob(c) {
    const l = db.get('SELECT * FROM listings WHERE id = ?', c.listing_id);
    const s = db.get('SELECT name, phone, area FROM users WHERE id = ?', l.seller_id);
    return Object.assign(checkOut(c), { listing: { id: l.id, ref: l.ref, title: l.title, type: l.type, imei: l.imei, area: l.area, city: l.city, answers: json(l.answers, {}), photos: json(l.photos, []), price: l.price }, seller: s, items: CHECK_ITEMS.filter(i => !i.types || i.types.includes(l.type)) });
  }
  function imeiLookup(imei) {
    imei = cleanImei(imei);
    if (!imei) fail('Enter an IMEI or serial number.', 'imei');
    const r = reported(imei);
    return { imei, result: r ? 'reported' : 'clear', reportedAt: r ? r.created_at : null, device: r ? r.device : null };
  }
  function submitCheck(user, id, b) {
    const c = checkFor(user, id);
    if (c.status !== 'booked') fail('This check is already finished.');
    const l = db.get('SELECT * FROM listings WHERE id = ?', c.listing_id);
    const items = CHECK_ITEMS.filter(i => !i.types || i.types.includes(l.type));
    const results = {};
    for (const i of items) { const v = b.results && b.results[i.key]; if (!['pass', 'fail'].includes(v)) fail(`Mark: ${i.label}`); results[i.key] = v; }
    let battery = null;
    if (QUESTIONS[1].types.includes(l.type)) { battery = int(b.battery, 'battery', { min: 1, max: 100, label: 'Battery health %' }); results.battery = battery; }
    const isReported = !!(l.imei && reported(l.imei));
    results.imei = isReported ? 'reported' : 'clear';
    const g = isReported ? { grade: null, failed: 'IMEI is on the reported-stolen list. Listing blocked.' } : gradeFor(l.type, results, battery);
    return db.tx(() => {
      db.run('UPDATE checks SET status = ?, results = ?, imei_status = ?, grade = ?, notes = ?, done_at = ? WHERE id = ?', g.grade ? 'done' : 'failed', JSON.stringify(results), results.imei, g.grade, text(b.notes, 500) || (g.failed || ''), now(), c.id);
      if (g.grade) db.run('UPDATE listings SET grade = ?, checked_at = ?, updated_at = ? WHERE id = ?', g.grade, now(), now(), l.id);
      else if (isReported) db.run("UPDATE listings SET status = 'blocked', updated_at = ? WHERE id = ?", now(), l.id);
      return { grade: g.grade, failed: g.failed || null, imei: results.imei };
    });
  }
  function checkerDash(user) {
    const rows = db.all('SELECT * FROM checks WHERE checker_id = ? ORDER BY id DESC', user.id);
    const m = new Date(); m.setDate(1); m.setHours(0, 0, 0, 0);
    const paid = rows.filter(r => r.status === 'done' || r.status === 'failed');
    return {
      booked: rows.filter(r => r.status === 'booked').map(checkerJob),
      done: paid.slice(0, 20).map(checkerJob),
      earnings: { total: paid.reduce((s, r) => s + r.fee, 0), month: paid.filter(r => r.done_at >= m.getTime()).reduce((s, r) => s + r.fee, 0), checks: paid.length, pending: rows.filter(r => r.status === 'booked').reduce((s, r) => s + r.fee, 0) }
    };
  }

  // ——— Offers ———
  function makeOffer(user, id, amount) {
    const l = getListing(id);
    if (l.seller_id === user.id) fail('You cannot make an offer on your own listing.');
    if (l.status !== 'live') fail('This device is no longer available.');
    amount = int(amount, 'amount', { min: 1000, max: l.price, label: 'Offer' });
    if (amount < l.price * 0.5) fail('That offer is too low. Try at least half of the price.', 'amount');
    db.run("UPDATE offers SET status = 'declined' WHERE listing_id = ? AND buyer_id = ? AND status = 'pending'", l.id, user.id);
    db.run("INSERT INTO offers (listing_id, buyer_id, amount, status, created_at) VALUES (?,?,?, 'pending', ?)", l.id, user.id, amount, now());
  }
  function decideOffer(user, oid, accept) {
    const o = db.get('SELECT * FROM offers WHERE id = ?', Number(oid));
    if (!o) fail('Offer not found.', null, 404);
    myListing(user, o.listing_id);
    if (o.status !== 'pending') fail('This offer is no longer pending.');
    db.run('UPDATE offers SET status = ? WHERE id = ?', accept ? 'accepted' : 'declined', o.id);
  }

  // ——— Orders & simulated escrow ———
  function orderFor(user, id) {
    const o = db.get('SELECT * FROM orders WHERE id = ?', Number(id));
    if (!o || (o.buyer_id !== user.id && o.seller_id !== user.id)) fail('Order not found.', null, 404);
    return o;
  }
  function orderOut(o, user) {
    const l = db.get('SELECT * FROM listings WHERE id = ?', o.listing_id);
    const buyer = db.get('SELECT name, phone, area FROM users WHERE id = ?', o.buyer_id), seller = db.get('SELECT name, phone, area FROM users WHERE id = ?', o.seller_id);
    const isBuyer = user.id === o.buyer_id;
    return {
      id: o.id, ref: o.ref, amount: o.amount, deliveryFee: o.delivery_fee, total: o.amount + o.delivery_fee, method: o.method, meetSpot: o.meet_spot, status: o.status, statusText: STATUS_TEXT[o.status],
      code: isBuyer && ['held', 'handover'].includes(o.status) ? o.code : null, mine: isBuyer ? 'buyer' : 'seller', createdAt: o.created_at, releasedAt: o.released_at, note: ESCROW_NOTE,
      listing: { id: l.id, title: l.title, type: l.type, grade: l.grade, photo: json(l.photos, [])[0] || '' }, buyer, seller,
      events: db.all('SELECT text, at FROM order_events WHERE order_id = ? ORDER BY id', o.id)
    };
  }
  function buy(user, id, b) {
    const l = getListing(id);
    if (user.role !== 'user') fail('Checker accounts cannot buy. Use a normal account.', null, 403);
    if (l.seller_id === user.id) fail('You cannot buy your own device.');
    if (l.status !== 'live') fail('Sorry, this device is no longer available.');
    if (l.imei && reported(l.imei)) fail('This device has been reported stolen. Purchase blocked.', null, 409, 'stolen');
    const method = b.method === 'deliver' ? 'deliver' : 'meet';
    const offer = db.get("SELECT * FROM offers WHERE listing_id = ? AND buyer_id = ? AND status = 'accepted' ORDER BY id DESC LIMIT 1", l.id, user.id);
    const amount = offer ? offer.amount : l.price;
    return db.tx(() => {
      let ref; do { ref = core.ref('SO'); } while (db.get('SELECT 1 FROM orders WHERE ref = ?', ref));
      const oid = Number(db.run(`INSERT INTO orders (ref, listing_id, buyer_id, seller_id, amount, delivery_fee, method, meet_spot, status, code, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?, 'held', ?, ?, ?)`,
        ref, l.id, user.id, l.seller_id, amount, method === 'deliver' ? 3000 : 0, method, str(b.meetSpot, 120), core.code4(), now(), now()).lastInsertRowid);
      if (offer) db.run("UPDATE offers SET status = 'used' WHERE id = ?", offer.id);
      db.run("UPDATE listings SET status = 'reserved', updated_at = ? WHERE id = ?", now(), l.id);
      oevent(oid, `${user.name} ordered. ₦${(amount + (method === 'deliver' ? 3000 : 0)).toLocaleString('en-NG')} held by Swavy (simulated)`);
      return oid;
    });
  }
  function handover(user, id) {
    const o = orderFor(user, id);
    if (o.seller_id !== user.id) fail('Only the seller can do this.', null, 403);
    if (o.status !== 'held') fail('You cannot do this now.');
    db.run("UPDATE orders SET status = 'handover', updated_at = ? WHERE id = ?", now(), o.id);
    oevent(o.id, o.method === 'deliver' ? 'Seller sent the device (on the way)' : 'Seller is ready to meet');
  }
  function release(user, id, code) {
    const o = orderFor(user, id);
    if (!['held', 'handover'].includes(o.status)) fail('This order is already closed.');
    if (o.seller_id === user.id) {
      if (String(code || '').trim() !== o.code) fail("Wrong code. Ask the buyer for the 4-digit code on their screen after they test the device.", 'code');
    } else if (o.buyer_id !== user.id) fail('Not allowed.', null, 403);
    db.tx(() => {
      db.run("UPDATE orders SET status = 'released', released_at = ?, updated_at = ? WHERE id = ?", now(), now(), o.id);
      db.run("UPDATE listings SET status = 'sold', updated_at = ? WHERE id = ?", now(), o.listing_id);
      oevent(o.id, o.seller_id === user.id ? 'Buyer confirmed with code. Money released to seller (simulated)' : 'Buyer confirmed receipt. Money released to seller (simulated)');
    });
  }
  function refund(user, id, reason) {
    const o = orderFor(user, id);
    if (!['held', 'handover'].includes(o.status)) fail('This order is already closed.');
    db.tx(() => {
      db.run("UPDATE orders SET status = 'refunded', note = ?, updated_at = ? WHERE id = ?", str(reason, 160), now(), o.id);
      db.run("UPDATE listings SET status = CASE WHEN status = 'reserved' THEN 'live' ELSE status END, updated_at = ? WHERE id = ?", now(), o.listing_id);
      oevent(o.id, `${user.id === o.buyer_id ? 'Buyer' : 'Seller'} cancelled. Money returned to buyer (simulated)${reason ? ': ' + str(reason, 160) : ''}`);
    });
  }

  function reportStolen(user, b) {
    const imei = cleanImei(b.imei);
    if (!/^[0-9A-Z]{5,30}$/.test(imei)) fail('Enter the IMEI (15 digits) or serial number.', 'imei');
    if (/^\d{15}$/.test(imei) && !luhn(imei)) fail('That IMEI does not look right. Check it on the box or receipt.', 'imei');
    const device = str(b.device, 60);
    if (!device) fail('What device is it? e.g. iPhone 13, black.', 'device');
    return db.tx(() => {
      db.run('INSERT OR IGNORE INTO reported_imeis (imei, device, what, police_ref, reported_by, created_at) VALUES (?,?,?,?,?,?)', imei, device, text(b.what, 400), str(b.policeRef, 40), user.id, now());
      const hit = db.all("SELECT id FROM listings WHERE imei = ? AND status IN ('live','reserved')", imei);
      hit.forEach(l => db.run("UPDATE listings SET status = 'blocked', updated_at = ? WHERE id = ?", now(), l.id));
      return { blocked: hit.length };
    });
  }

  function sellerDash(user) {
    const listings = db.all('SELECT * FROM listings WHERE seller_id = ? AND status != ? ORDER BY updated_at DESC', user.id, 'removed').map(l => Object.assign(listingOut(l, user), {
      pendingOffers: db.get("SELECT COUNT(*) n FROM offers WHERE listing_id = ? AND status = 'pending'", l.id).n,
      check: checkOut(db.get('SELECT * FROM checks WHERE listing_id = ? ORDER BY id DESC LIMIT 1', l.id))
    }));
    const offers = db.all("SELECT o.id, o.amount, o.status, o.created_at createdAt, u.name buyer, l.title, l.price, l.id listingId FROM offers o JOIN listings l ON l.id = o.listing_id JOIN users u ON u.id = o.buyer_id WHERE l.seller_id = ? AND o.status = 'pending' ORDER BY o.id DESC", user.id);
    const sales = db.all('SELECT * FROM orders WHERE seller_id = ? ORDER BY updated_at DESC', user.id).map(o => orderOut(o, user));
    const released = sales.filter(s => s.status === 'released');
    return { listings, offers, sales, stats: { live: listings.filter(l => l.status === 'live').length, sold: released.length, earned: released.reduce((s, o) => s + o.amount, 0), held: sales.filter(s => ['held', 'handover'].includes(s.status)).reduce((s, o) => s + o.amount, 0) } };
  }
  function buyerOrders(user) { return db.all('SELECT * FROM orders WHERE buyer_id = ? ORDER BY updated_at DESC', user.id).map(o => orderOut(o, user)); }

  function signup(auth, b) {
    const role = b.role === 'checker' ? 'checker' : 'user';
    const area = str(b.area, 40);
    if (!core.cityOf(area)) fail('Pick your area.', 'area');
    return db.tx(() => {
      const id = auth.createUser({ role, name: b.name, email: b.email, phone: b.phone, password: b.password, city: core.cityOf(area), area });
      if (role === 'checker') db.run('INSERT INTO checkers (user_id, areas, verified) VALUES (?,?,0)', id, JSON.stringify([area]));
      return db.get('SELECT * FROM users WHERE id = ?', id);
    });
  }
  function adminOverview() {
    return {
      stats: {
        users: db.get("SELECT COUNT(*) n FROM users WHERE role = 'user'").n, live: db.get("SELECT COUNT(*) n FROM listings WHERE status = 'live'").n,
        checked: db.get('SELECT COUNT(*) n FROM listings WHERE grade IS NOT NULL').n, blocked: db.get("SELECT COUNT(*) n FROM listings WHERE status = 'blocked'").n,
        held: db.get("SELECT COALESCE(SUM(amount),0) n FROM orders WHERE status IN ('held','handover')").n, released: db.get("SELECT COALESCE(SUM(amount),0) n FROM orders WHERE status = 'released'").n
      },
      checkers: db.all('SELECT c.*, u.name, u.email, u.area FROM checkers c JOIN users u ON u.id = c.user_id ORDER BY c.verified, u.id').map(c => ({ id: c.user_id, name: c.name, email: c.email, areas: json(c.areas, []), verified: !!c.verified, checks: db.get("SELECT COUNT(*) n FROM checks WHERE checker_id = ? AND status IN ('done','failed')", c.user_id).n })),
      reported: db.all('SELECT imei, device, what, police_ref policeRef, created_at createdAt FROM reported_imeis ORDER BY created_at DESC'),
      attempts: db.all('SELECT a.imei, a.title, a.at, u.name FROM blocked_attempts a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 30'),
      listings: db.all("SELECT * FROM listings WHERE status IN ('live','reserved','blocked') ORDER BY id DESC LIMIT 60").map(l => listingOut(l, null))
    };
  }

  return { me, browse, getListing, listingOut, quote, createListing, myListing, bookCheck, checkFor, checkerJob, imeiLookup, submitCheck, checkerDash, makeOffer, decideOffer, orderFor, orderOut, buy, handover, release, refund, reportStolen, sellerDash, buyerOrders, signup, adminOverview, cleanImei };
}

function routes(router, { db, app, auth, core }) {
  const { fail } = core;
  router.get('/api/catalog', () => ({
    types: TYPES, questions: QUESTIONS, battery: BATTERY, checkItems: CHECK_ITEMS, areas: core.AREAS, escrowNote: ESCROW_NOTE,
    models: db.all('SELECT id, type, brand, name, base_price basePrice FROM models ORDER BY type, brand, base_price DESC'),
    brands: db.all("SELECT DISTINCT brand FROM listings WHERE status = 'live' ORDER BY brand").map(r => r.brand)
  }));
  router.post('/api/signup', ctx => { const u = app.signup(auth, ctx.body); auth.start(ctx, u.id); return { me: app.me(u) }; });
  router.get('/api/listings', ctx => ({ listings: app.browse(ctx.query, ctx.user) }));
  router.get('/api/listings/:id', ctx => {
    const l = app.getListing(ctx.params.id);
    const isAdmin = ctx.admin;
    if (['removed', 'blocked'].includes(l.status) && !(ctx.user && ctx.user.id === l.seller_id) && !isAdmin) fail('This listing is no longer available.', null, 404);
    return { listing: app.listingOut(l, ctx.user, true) };
  });
  router.post('/api/estimate', ctx => { const e = app.quote(ctx.body); delete e.model; return e; });
  router.post('/api/listings', { auth: true }, ctx => ({ id: app.createListing(ctx.user, ctx.body) }));
  router.put('/api/listings/:id', { auth: true }, ctx => {
    const l = app.myListing(ctx.user, ctx.params.id);
    if (ctx.body.price != null) db.run('UPDATE listings SET price = ?, updated_at = ? WHERE id = ?', core.int(ctx.body.price, 'price', { min: 1000, max: 50e6, label: 'Price' }), Date.now(), l.id);
    if (ctx.body.remove) { if (l.status === 'reserved') fail('Someone has ordered this. Finish or cancel the order first.'); db.run("UPDATE listings SET status = 'removed', updated_at = ? WHERE id = ?", Date.now(), l.id); }
    return {};
  });
  router.post('/api/listings/:id/check', { auth: true }, ctx => app.bookCheck(ctx.user, ctx.params.id, ctx.body.slot));
  router.post('/api/listings/:id/offer', { auth: true }, ctx => { app.makeOffer(ctx.user, ctx.params.id, ctx.body.amount); return {}; });
  router.post('/api/offers/:id/accept', { auth: true }, ctx => { app.decideOffer(ctx.user, ctx.params.id, true); return {}; });
  router.post('/api/offers/:id/decline', { auth: true }, ctx => { app.decideOffer(ctx.user, ctx.params.id, false); return {}; });
  router.post('/api/listings/:id/buy', { auth: true }, ctx => ({ id: app.buy(ctx.user, ctx.params.id, ctx.body) }));
  router.get('/api/orders', { auth: true }, ctx => ({ orders: app.buyerOrders(ctx.user) }));
  router.get('/api/orders/:id', { auth: true }, ctx => ({ order: app.orderOut(app.orderFor(ctx.user, ctx.params.id), ctx.user) }));
  const oact = fn => ctx => { fn(ctx); return { order: app.orderOut(app.orderFor(ctx.user, ctx.params.id), ctx.user) }; };
  router.post('/api/orders/:id/handover', { auth: true }, oact(ctx => app.handover(ctx.user, ctx.params.id)));
  router.post('/api/orders/:id/release', { auth: true }, oact(ctx => app.release(ctx.user, ctx.params.id, ctx.body.code)));
  router.post('/api/orders/:id/refund', { auth: true }, oact(ctx => app.refund(ctx.user, ctx.params.id, ctx.body.reason)));
  router.get('/api/seller', { auth: true }, ctx => app.sellerDash(ctx.user));
  router.get('/api/imei/:imei', ctx => app.imeiLookup(ctx.params.imei));
  router.post('/api/report', { auth: true }, ctx => app.reportStolen(ctx.user, ctx.body));
  router.get('/api/checker', { auth: true, role: 'checker' }, ctx => app.checkerDash(ctx.user));
  router.get('/api/checks/:id', { auth: true, role: 'checker' }, ctx => ({ check: app.checkerJob(app.checkFor(ctx.user, ctx.params.id)) }));
  router.post('/api/checks/:id/imei', { auth: true, role: 'checker' }, ctx => { const c = app.checkerJob(app.checkFor(ctx.user, ctx.params.id)); return app.imeiLookup(c.listing.imei || 'NONE'); });
  router.post('/api/checks/:id/submit', { auth: true, role: 'checker' }, ctx => app.submitCheck(ctx.user, ctx.params.id, ctx.body));

  router.get('/api/admin/overview', { admin: true }, () => app.adminOverview());
  router.post('/api/admin/checkers/:id/verify', { admin: true }, ctx => { if (!db.run('UPDATE checkers SET verified = ? WHERE user_id = ?', ctx.body.verified ? 1 : 0, Number(ctx.params.id)).changes) fail('Checker not found.', null, 404); return {}; });
  router.post('/api/admin/listings/:id/remove', { admin: true }, ctx => { db.run("UPDATE listings SET status = 'removed', updated_at = ? WHERE id = ?", Date.now(), Number(ctx.params.id)); return {}; });
  router.post('/api/admin/reported/:imei/clear', { admin: true }, ctx => { db.run('DELETE FROM reported_imeis WHERE imei = ?', app.cleanImei(ctx.params.imei)); return {}; });
  router.post('/api/admin/logout', ctx => { auth.end(ctx); return {}; });
}

module.exports = { createApp, routes, seed: (...a) => require('./seed')(...a), TYPES, QUESTIONS, estimate, gradeFor, luhn };
