/* SAMPLE demo data for Swavy Spare. Runs once, when the database is new and empty.
   People, prices, IMEIs and the reported-stolen list are all made up for the demo. */
'use strict';
const { estimate, gradeFor, TYPES } = require('./app');

// Build a valid-looking 15-digit IMEI (Luhn check digit) from 14 digits.
function imeiFrom(d14) {
  let s = 0;
  for (let i = 0; i < 14; i++) { let n = +d14[13 - i]; if (i % 2 === 0) { n *= 2; if (n > 9) n -= 9; } s += n; }
  return d14 + ((10 - (s % 10)) % 10);
}

module.exports = function seed(db, app, core) {
  if (db.get('SELECT COUNT(*) n FROM users').n > 0) return false;
  const { salt, hash } = core.hashPassword('swavy123');
  const DAY = 864e5, t0 = Date.now();
  const user = (role, name, email, phone, area) => Number(db.run('INSERT INTO users (role, name, email, phone, city, area, pass_salt, pass_hash, is_sample, created_at) VALUES (?,?,?,?,?,?,?,?,1,?)',
    role, name, email, phone, core.cityOf(area), area, salt, hash, t0 - 90 * DAY).lastInsertRowid);

  const MODELS = [
    ['phone', 'Apple', 'iPhone XR', 190000], ['phone', 'Apple', 'iPhone 11', 270000], ['phone', 'Apple', 'iPhone 12', 360000], ['phone', 'Apple', 'iPhone 13', 500000],
    ['phone', 'Apple', 'iPhone 14 Pro', 900000], ['phone', 'Apple', 'iPhone 15 Pro Max', 1450000],
    ['phone', 'Samsung', 'Galaxy S21', 320000], ['phone', 'Samsung', 'Galaxy S22 Ultra', 620000], ['phone', 'Samsung', 'Galaxy A54', 240000], ['phone', 'Samsung', 'Galaxy S23', 520000],
    ['phone', 'Tecno', 'Camon 20 Pro', 150000], ['phone', 'Tecno', 'Spark 10 Pro', 90000], ['phone', 'Tecno', 'Phantom X2', 290000],
    ['phone', 'Infinix', 'Note 30', 150000], ['phone', 'Infinix', 'Hot 30', 90000], ['phone', 'Infinix', 'Zero 30', 220000],
    ['phone', 'Xiaomi', 'Redmi Note 12', 140000], ['phone', 'Xiaomi', 'Redmi Note 13 Pro', 250000],
    ['laptop', 'HP', 'EliteBook 840 G5', 290000], ['laptop', 'HP', 'Pavilion 15', 330000], ['laptop', 'Dell', 'Latitude 5490', 270000], ['laptop', 'Dell', 'XPS 13', 620000],
    ['laptop', 'Lenovo', 'ThinkPad T480', 280000], ['laptop', 'Lenovo', 'IdeaPad 3', 260000], ['laptop', 'Apple', 'MacBook Air M1', 720000], ['laptop', 'Apple', 'MacBook Pro 14 M1 Pro', 1350000],
    ['tablet', 'Apple', 'iPad 9th gen', 270000], ['tablet', 'Apple', 'iPad Air 4', 430000], ['tablet', 'Samsung', 'Galaxy Tab A8', 160000],
    ['console', 'Sony', 'PS5 (disc)', 640000], ['console', 'Sony', 'PS4 Slim', 240000], ['console', 'Microsoft', 'Xbox Series S', 370000], ['console', 'Nintendo', 'Switch OLED', 370000],
    ['audio', 'Apple', 'AirPods Pro 2', 170000], ['audio', 'Apple', 'AirPods 3', 115000], ['audio', 'Sony', 'WH-1000XM4', 220000], ['audio', 'JBL', 'Flip 6', 85000],
    ['watch', 'Apple', 'Apple Watch SE', 145000], ['watch', 'Apple', 'Apple Watch Series 8', 270000], ['watch', 'Samsung', 'Galaxy Watch 5', 140000]
  ];

  db.tx(() => {
    const M = {};
    MODELS.forEach(([type, brand, name, base]) => { M[name] = Number(db.run('INSERT INTO models (type, brand, name, base_price) VALUES (?,?,?,?)', type, brand, name, base).lastInsertRowid); M[name + ':row'] = { type, brand, name, base }; });

    const buyer = user('user', 'Kemi Adewale', 'buyer@swavy.ng', '08051112222', 'Lekki');
    const seller = user('user', 'Obinna Chukwu', 'seller@swavy.ng', '08051113333', 'Ikeja');
    const checker = user('checker', 'Sodiq Ayinde', 'checker@swavy.ng', '08051114444', 'Yaba');
    const checker2 = user('checker', 'Aminu Garba', 'checker2@swavy.ng', '08051115555', 'Wuse');
    const newChecker = user('checker', 'Victor Ene', 'victor@sample.swavy.ng', '08051116666', 'Ajah');
    db.run('INSERT INTO checkers (user_id, areas, verified, bio) VALUES (?,?,1,?)', checker, JSON.stringify(core.AREAS.Lagos), 'Phone and laptop technician, 8 years.');
    db.run('INSERT INTO checkers (user_id, areas, verified, bio) VALUES (?,?,1,?)', checker2, JSON.stringify(core.AREAS.Abuja), 'Certified Apple and Samsung technician.');
    db.run('INSERT INTO checkers (user_id, areas, verified, bio) VALUES (?,?,0,?)', newChecker, JSON.stringify(['Ajah', 'Lekki']), 'New checker, waiting for verification.');
    const sellers = [seller,
      user('user', 'Halima Sule', 'halima@sample.swavy.ng', '08051117777', 'Garki'),
      user('user', 'David Okoro', 'david@sample.swavy.ng', '08051118888', 'Yaba'),
      user('user', 'Fatima Idris', 'fatima@sample.swavy.ng', '08051119999', 'Jabi'),
      user('user', 'Tobi Ogun', 'tobi@sample.swavy.ng', '08051110000', 'Lekki'),
      user('user', 'Ruth Bassey', 'ruth@sample.swavy.ng', '08051110001', 'Surulere')];

    let n = 0;
    const answersFor = (type, kind) => {
      const a = { cracked: 'no', battery: 'good', biometric: 'yes', working: 'yes', repaired: 'no', scratches: 'no', box: 'yes' };
      if (kind === 1) Object.assign(a, { battery: 'ok', scratches: 'yes' });
      if (kind === 2) Object.assign(a, { battery: 'weak', repaired: 'yes', box: 'no' });
      return a;
    };
    const list = (sellerId, name, storage, kind, area, grade, ago, desc, imeiOverride) => {
      const m = M[name + ':row'];
      const answers = answersFor(m.type, kind);
      const e = estimate(m.base, m.type, storage, answers);
      const needs = TYPES.find(t => t.key === m.type).needsImei;
      const imei = imeiOverride || (needs ? imeiFrom(String(35000000000000 + 7919 * (++n) * 1013).slice(0, 14)) : 'SN' + (480000 + (++n) * 37));
      const price = Math.round((e.mid * (1 + (n % 3) * 0.02)) / 1000) * 1000;
      const t = t0 - ago;
      const id = Number(db.run(`INSERT INTO listings (ref, seller_id, model_id, type, brand, title, storage, answers, imei, est_low, est_high, price, photos, description, city, area, status, grade, checked_at, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'live', ?, ?, ?, ?)`, `SP-${30000 + n}`, sellerId, M[name], m.type, m.brand, `${name}${storage ? ' ' + storage : ''}`, storage, JSON.stringify(answers), imei,
        e.low, e.high, price, JSON.stringify([`/img/sample/${m.type}-${(n % 3) + 1}.svg`, `/img/sample/${m.type}-${((n + 1) % 3) + 1}.svg`]), desc, core.cityOf(area), area, grade, grade ? t + DAY : null, t, t).lastInsertRowid);
      if (grade) {
        const results = { screen: 'pass', cameras: 'pass', charging: 'pass', buttons: 'pass', lock: 'pass', water: 'pass', imei: 'clear' };
        let battery = kind === 0 ? 91 : kind === 1 ? 82 : 71;
        if (grade === 'C') results.buttons = 'fail';
        if (!['phone', 'laptop', 'tablet', 'watch', 'audio'].includes(m.type)) battery = null; else results.battery = battery;
        const chk = core.cityOf(area) === 'Abuja' ? checker2 : checker;
        const g = gradeFor(m.type, results, battery).grade || grade;
        db.run('UPDATE listings SET grade = ? WHERE id = ?', g, id);
        db.run("INSERT INTO checks (listing_id, checker_id, slot, status, fee, results, imei_status, grade, notes, created_at, done_at) VALUES (?,?,?, 'done', ?, ?, 'clear', ?, ?, ?, ?)",
          id, chk, 'Today, afternoon', TYPES.find(x => x.key === m.type).fee, JSON.stringify(results), g, g === 'A' ? 'Clean device. Everything works like new.' : g === 'B' ? 'Works well. Small signs of use.' : 'Works, but one button is stiff. Priced to match.', t + DAY / 2, t + DAY);
      }
      return id;
    };
    list(sellers[1], 'iPhone 13', '128GB', 0, 'Garki', 'A', 2 * DAY, 'Used for 1 year with case and screen guard. Battery 91%.');
    list(sellers[0], 'iPhone 12', '128GB', 1, 'Ikeja', 'B', 4 * DAY, 'Clean UK used. Small scratch on the back.');
    list(sellers[2], 'Galaxy S22 Ultra', '256GB', 0, 'Yaba', 'A', 3 * DAY, 'Pen works perfectly. No burn-in.');
    list(sellers[3], 'MacBook Air M1', '256GB', 0, 'Jabi', 'A', 5 * DAY, '8GB RAM. Battery cycle count 112. Comes with charger.');
    list(sellers[4], 'PS5 (disc)', '', 1, 'Lekki', 'B', 6 * DAY, 'With 1 controller and FIFA 24 disc.');
    list(sellers[5], 'Camon 20 Pro', '256GB', 0, 'Surulere', null, 1 * DAY, 'Bought in March. Still very clean.');
    list(sellers[0], 'ThinkPad T480', '256GB', 1, 'Ikeja', 'B', 7 * DAY, 'i5 8th gen, 16GB RAM. Good for office work.');
    list(sellers[2], 'AirPods Pro 2', '', 0, 'Yaba', 'A', 2 * DAY, 'Noise cancelling works perfectly. With case and box.');
    list(sellers[4], 'iPhone 11', '64GB', 2, 'Lekki', 'C', 8 * DAY, 'Battery changed before. Works fine.');
    list(sellers[1], 'Galaxy Tab A8', '64GB', 0, 'Garki', null, 3 * DAY, 'For kids learning. Good condition.');
    list(sellers[5], 'Note 30', '128GB', 1, 'Surulere', null, 2 * 3600e3, 'Neat phone. Charger included.');
    list(sellers[3], 'Apple Watch SE', '', 0, 'Jabi', 'A', 9 * DAY, '44mm, with 2 straps.');
    list(sellers[2], 'Redmi Note 13 Pro', '256GB', 0, 'Yaba', null, 5 * 3600e3, 'Like new. Used 3 months.');
    list(sellers[4], 'iPhone 15 Pro Max', '256GB', 0, 'Lekki', 'A', 1 * DAY, 'Natural titanium. Battery 98%. Full box.');
    list(sellers[1], 'Xbox Series S', '', 0, 'Garki', null, 4 * DAY, 'With Game Pass controller.');
    // Seller demo: one unchecked listing with a check booked (for the checker demo), one sold.
    const pending = list(seller, 'Galaxy S21', '128GB', 1, 'Ikeja', null, 10 * 3600e3, 'Working well. Selling because I upgraded.');
    db.run("INSERT INTO checks (listing_id, checker_id, slot, status, fee, created_at) VALUES (?,?, 'Today, afternoon', 'booked', 3000, ?)", pending, checker, t0 - 2 * 3600e3);
    const soldId = list(seller, 'iPhone XR', '64GB', 1, 'Ikeja', 'B', 12 * DAY, 'Clean phone.');
    db.run("UPDATE listings SET status = 'sold' WHERE id = ?", soldId);
    const o1 = Number(db.run("INSERT INTO orders (ref, listing_id, buyer_id, seller_id, amount, method, meet_spot, status, code, created_at, updated_at, released_at) VALUES ('SO-40001', ?, ?, ?, 185000, 'meet', 'Ikeja City Mall, main entrance', 'released', '4821', ?, ?, ?)",
      soldId, sellers[2], seller, t0 - 10 * DAY, t0 - 9 * DAY, t0 - 9 * DAY).lastInsertRowid);
    ['David Okoro ordered. ₦185,000 held by Swavy (simulated)', 'Seller is ready to meet', 'Buyer confirmed with code. Money released to seller (simulated)'].forEach((t, i) => db.run('INSERT INTO order_events (order_id, text, at) VALUES (?,?,?)', o1, t, t0 - 10 * DAY + i * 3600e3));
    // A pending offer on the seller's iPhone 12 from the demo buyer.
    const ip12 = db.get("SELECT id, price FROM listings WHERE title = 'iPhone 12 128GB'");
    db.run("INSERT INTO offers (listing_id, buyer_id, amount, status, created_at) VALUES (?,?,?, 'pending', ?)", ip12.id, buyer, Math.round(ip12.price * 0.92 / 1000) * 1000, t0 - 3 * 3600e3);
    // Checker history for earnings.
    for (let k = 0; k < 3; k++) db.run("INSERT INTO checks (listing_id, checker_id, slot, status, fee, results, imei_status, grade, notes, created_at, done_at) VALUES (?,?, 'Morning', 'done', 3000, '{}', 'clear', 'B', 'Sample past check', ?, ?)", soldId, checker, t0 - (k + 13) * DAY, t0 - (k + 13) * DAY);

    // LOCAL DEMO "reported stolen" list (not a real national database).
    [['356938035643809', 'iPhone 13, blue', 'Snatched at Ojuelegba bus stop', 'SCID/2026/1182'], [imeiFrom('35391805829174'), 'Galaxy S22 Ultra, black', 'Stolen from car in Wuse 2', ''],
      [imeiFrom('35290611097438'), 'iPhone 14 Pro, purple', 'Armed robbery, Lekki-Epe expressway', 'LK/2026/0391'], ['SN9921077', 'MacBook Air M1', 'Stolen from office in Yaba', '']]
      .forEach(([imei, device, what, pol], i) => db.run('INSERT INTO reported_imeis (imei, device, what, police_ref, reported_by, created_at) VALUES (?,?,?,?,NULL,?)', imei, device, what, pol, t0 - (i + 2) * DAY));
    db.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('sample_data', 'yes')");
  });
  return true;
};
module.exports.imeiFrom = imeiFrom;
