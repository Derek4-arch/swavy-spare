/* Swavy Spare front end: shop, 3-step selling with price estimate, Swavy Checker, simulated escrow, stolen-IMEI tools, admin. */
(function (SW) {
  'use strict';
  const { esc, icon, naira } = SW;
  let CAT = null;
  const F = { type: '', brand: '', max: 0, grade: '', city: '', area: '', q: '', sort: '' };   // shop filters
  const SELL = { step: 1, answers: {}, photos: [] };
  const isChecker = () => SW.me && SW.me.role === 'checker';
  const typeOf = k => CAT.types.find(t => t.key === k) || { name: k, icon: 'box', storage: [] };
  const gradeBadge = g => g ? `<span class="grade g${g}">${icon('shield', 'ic-sm')} Swavy Checked · ${g}</span>` : '';
  const GRADE_TEXT = { A: 'Like new. Everything works, battery strong.', B: 'Good. Small signs of use or one minor issue.', C: 'Fair. Works, with visible wear or a known issue (priced to match).' };
  const MEET = { Lagos: ['Ikeja City Mall', 'The Palms, Lekki', 'Circle Mall, Jakande', 'Yaba Tech gate'], Abuja: ['Jabi Lake Mall', 'Ceddi Plaza, Wuse', 'Silverbird Galleria', 'Gwarinpa 1st Avenue'] };

  function shell() {
    document.getElementById('app').innerHTML = `
      <header class="top"><div class="top-in">
        <a href="#/" aria-label="Swavy Spare home">${SW.logo('spare')}</a>
        <nav class="top-nav" id="topnav"></nav><span class="grow"></span>
        <button class="icon-btn" id="themeBtn" aria-label="Switch light or dark mode"></button>
        <a class="icon-btn" href="#/account" aria-label="Account">${icon('user')}</a>
      </div></header>
      <main id="main" tabindex="-1"></main>
      <nav class="tabbar" id="tabbar" aria-label="Main"></nav>`;
    const tb = SW.$('#themeBtn');
    tb.innerHTML = icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon');
    tb.onclick = () => { tb.innerHTML = icon(SW.toggleTheme() === 'dark' ? 'sun' : 'moon'); };
  }
  SW.afterRender = path => {
    const tabs = isChecker()
      ? [['#/', 'shield', 'Checks'], ['#/safety', 'search', 'IMEI check'], ['#/account', 'user', 'Account']]
      : [['#/', 'home', 'Shop'], ['#/sell', 'plus', 'Sell'], ['#/me', 'list', 'My stuff'], ['#/safety', 'shield', 'Safety'], ['#/account', 'user', SW.me ? 'Account' : 'Log in']];
    const on = h => (h === '#/' ? path === '/' || path.startsWith('/l/') : ('#' + path).startsWith(h)) ? 'on' : '';
    SW.$('#tabbar').innerHTML = tabs.map(([h, i, l]) => `<a href="${h}" class="${on(h)}">${icon(i)}<span>${l}</span>${h === '#/me' && SW.badgeCount ? `<span class="dot">${SW.badgeCount}</span>` : ''}</a>`).join('');
    SW.$('#topnav').innerHTML = tabs.filter(t => t[0] !== '#/account').map(([h, , l]) => `<a href="${h}" class="${on(h)}">${l}</a>`).join('');
  };
  SW.needLogin = () => `<div class="empty">${icon('lock')}<h3>Log in to continue</h3><p>It takes 10 seconds.</p><button class="btn btn-primary" data-login>Log in or sign up</button></div>`;
  document.addEventListener('click', e => { if (e.target.closest('[data-login]')) { e.preventDefault(); loginSheet(); } if (e.target.closest('[data-howto]')) onboard(true); });

  async function refreshMe() {
    const r = await SW.get('/api/me'); SW.me = r.me; SW.admin = r.admin; SW.badgeCount = 0;
    if (SW.me && !isChecker()) {
      try { const d = await SW.get('/api/seller'); SW.badgeCount = d.offers.length + d.sales.filter(s => s.status === 'held').length; } catch (e) { /* ignore */ }
    }
  }
  function loginSheet(after) {
    SW.sheet(`<h2>Welcome to Swavy Spare</h2><p class="muted">Log in to buy, sell or check devices.</p>
      <form id="lf" novalidate>
        <label class="field"><span>Email</span><input class="input" name="email" type="email" inputmode="email" autocomplete="email"></label>
        <label class="field"><span>Password</span><input class="input" name="password" type="password" autocomplete="current-password"></label>
        <button class="btn btn-primary btn-block btn-lg">Log in</button></form>
      <p class="small muted mt center">Just testing? Use a sample account:</p>
      <div class="row wrap" style="justify-content:center"><button class="btn btn-sm btn-ghost" data-demo="buyer@swavy.ng">Buyer</button><button class="btn btn-sm btn-ghost" data-demo="seller@swavy.ng">Seller</button><button class="btn btn-sm btn-ghost" data-demo="checker@swavy.ng">Checker</button></div>
      <hr class="hr"><a class="btn btn-block btn-ghost" href="#/signup" data-close>New here? Create account</a>`, (s, close) => {
      const f = s.querySelector('#lf');
      s.querySelectorAll('[data-demo]').forEach(b => b.onclick = () => { f.email.value = b.dataset.demo; f.password.value = 'swavy123'; f.requestSubmit(); });
      f.onsubmit = e => { e.preventDefault(); SW.busy(f.querySelector('button'), async () => {
        try { await SW.post('/api/login', { email: f.email.value, password: f.password.value }); } catch (err) { SW.showErr(f, err); return; }
        close(); await refreshMe(); SW.toast(`Welcome, ${SW.me.name.split(' ')[0]}!`, 'ok'); if (after) after(); else SW.render();
      }); };
    });
  }

  // ——— Shop ———
  function card(l) {
    return `<a class="lcard" href="#/l/${l.id}"><div class="lph"><img src="${esc(l.photos[0] || '')}" alt="" loading="lazy">${l.grade ? `<span class="gpill g${l.grade}">${icon('shield', 'ic-sm')} ${l.grade}</span>` : ''}</div>
      <div class="lbody"><b class="ltitle">${esc(l.title)}</b><span class="lprice">${naira(l.price)}</span><span class="tiny muted">${icon('pin', 'ic-sm')} ${esc(l.area)} · ${SW.ago(l.createdAt)}</span></div></a>`;
  }
  SW.route('/', async () => {
    if (isChecker()) return checkerHome();
    const qs = new URLSearchParams(Object.entries(F).filter(([, v]) => v));
    const list = (await SW.get('/api/listings?' + qs)).listings;
    const active = Object.entries(F).filter(([k, v]) => v && k !== 'type' && k !== 'q' && k !== 'sort').length;
    SW.mount(main => {
      SW.$$('[data-type]', main).forEach(b => b.onclick = () => { F.type = F.type === b.dataset.type ? '' : b.dataset.type; F.brand = ''; SW.render(); });
      const s = SW.$('#q', main); s.onkeydown = e => { if (e.key === 'Enter') { F.q = s.value.trim(); SW.render(); } };
      SW.$('[data-search]', main).onclick = () => { F.q = s.value.trim(); SW.render(); };
      SW.$('[data-filters]', main).onclick = filterSheet;
      SW.$$('[data-clear]', main).forEach(b => b.onclick = () => { Object.keys(F).forEach(k => F[k] = ''); SW.render(); });
      const chk = SW.$('[data-checked]', main); chk.onclick = () => { F.grade = F.grade ? '' : 'checked'; SW.render(); };
    });
    return `<section class="hero"><p class="badge badge-lime">${icon('shield')} Every Swavy Checked phone is IMEI-checked</p>
        <h1>Preloved gadgets, <span class="hl">no wahala.</span></h1>
        <p class="muted" style="font-size:17px;max-width:600px">Buy and sell phones, laptops and more in Lagos and Abuja. Your money is held until you confirm you got the right device.</p></section>
      <div class="searchbar"><input class="input" id="q" placeholder="Search iPhone 13, PS5, MacBook…" value="${esc(F.q)}" aria-label="Search"><button class="btn btn-primary" data-search aria-label="Search">${icon('search')}</button></div>
      <div class="typerow mt">${CAT.types.map(t => `<button class="tchip ${F.type === t.key ? 'on' : ''}" data-type="${t.key}">${icon(t.icon)}<span>${esc(t.name)}</span></button>`).join('')}</div>
      <div class="row between mt wrap"><div class="row wrap" style="gap:8px"><button class="chip ${F.grade ? 'on' : ''}" data-checked>${icon('shield', 'ic-sm')} Swavy Checked only</button><button class="chip" data-filters>${icon('list', 'ic-sm')} Filters${active ? ` (${active})` : ''}</button></div>
        <span class="small muted">${list.length} device${list.length === 1 ? '' : 's'}</span></div>
      ${list.length ? `<div class="lgrid mt">${list.map(card).join('')}</div>` : `<div class="empty mt">${icon('search')}<h3>Nothing matches yet</h3><p>Try fewer filters or a bigger budget.</p><button class="btn btn-primary" data-clear>Clear filters</button></div>`}
      <div class="promo mt2"><div class="card promo-c"><h3>${icon('tag')} Sell your old gadget</h3><p class="muted small">3 quick steps. We suggest a fair price.</p><a class="btn btn-lime btn-block" href="#/sell">Sell now</a></div>
        <div class="card promo-c"><h3>${icon('search')} Check before you buy</h3><p class="muted small">Check any IMEI against the Swavy reported list.</p><a class="btn btn-ghost btn-block" href="#/safety">Check IMEI</a></div></div>
      <p class="footer-note">All people, devices, prices and IMEIs here are SAMPLE data. Payments are simulated: no real money moves.</p>`;
  });
  function filterSheet() {
    const t = Object.assign({}, F);
    const max = 2000000;
    const brands = Array.from(new Set(CAT.models.filter(m => !t.type || m.type === t.type).map(m => m.brand))).sort();
    SW.sheet(`<h2>Filters</h2>
      <label class="field"><span>Brand</span><select class="input" id="fb"><option value="">Any brand</option>${brands.map(b => `<option ${t.brand === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>
      <label class="field"><span>Budget: up to <b id="bv">${t.max ? naira(t.max) : 'any price'}</b></span><input type="range" id="fm" min="50000" max="${max}" step="10000" value="${t.max || max}" class="range"></label>
      <div class="field"><span>Grade</span><div class="chips">${[['', 'Any'], ['checked', 'Checked'], ['A', 'A · Like new'], ['B', 'B · Good'], ['C', 'C · Fair']].map(([v, l]) => `<button class="chip ${t.grade === v ? 'on' : ''}" data-g="${v}">${l}</button>`).join('')}</div></div>
      <label class="field"><span>Area</span><select class="input" id="fa"><option value="">Anywhere</option>${Object.entries(CAT.areas).map(([c, l]) => `<option value="city:${c}" ${t.city === c ? 'selected' : ''}>All ${c}</option>${l.map(a => `<option value="${a}" ${t.area === a ? 'selected' : ''}>${c} · ${a}</option>`).join('')}`).join('')}</select></label>
      <label class="field"><span>Sort</span><select class="input" id="fs"><option value="">Checked first, newest</option><option value="cheap" ${t.sort === 'cheap' ? 'selected' : ''}>Cheapest first</option><option value="dear" ${t.sort === 'dear' ? 'selected' : ''}>Most expensive first</option></select></label>
      <div class="row"><button class="btn btn-ghost grow" id="fr">Reset</button><button class="btn btn-primary grow" id="fo">Show results</button></div>`, (s, close) => {
      const fm = s.querySelector('#fm');
      fm.oninput = () => { s.querySelector('#bv').textContent = +fm.value >= max ? 'any price' : naira(fm.value); };
      s.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { t.grade = b.dataset.g; s.querySelectorAll('[data-g]').forEach(x => x.classList.toggle('on', x === b)); });
      s.querySelector('#fr').onclick = () => { Object.assign(F, { brand: '', max: 0, grade: '', city: '', area: '', sort: '' }); close(); SW.render(); };
      s.querySelector('#fo').onclick = () => {
        const a = s.querySelector('#fa').value;
        Object.assign(F, { brand: s.querySelector('#fb').value, max: +fm.value >= max ? 0 : +fm.value, grade: t.grade, city: a.startsWith('city:') ? a.slice(5) : '', area: a.startsWith('city:') ? '' : a, sort: s.querySelector('#fs').value });
        close(); SW.render();
      };
    });
  }

  // ——— Listing page ———
  function reportCard(c, type) {
    if (!c || !['done', 'failed'].includes(c.status)) return '';
    const items = CAT.checkItems.filter(i => !i.types || i.types.includes(type));
    const ok = v => v === 'pass' || v === 'clear';
    return `<div class="card report"><div class="row between"><h3 style="margin:0">${icon('shield')} Swavy Check report</h3>${c.grade ? `<span class="gbig g${c.grade}">${c.grade}</span>` : '<span class="badge badge-bad">Failed</span>'}</div>
      ${c.grade ? `<p class="muted small">${esc(GRADE_TEXT[c.grade])}</p>` : ''}
      <ul class="checklist"><li class="${ok(c.imeiStatus) ? 'ok' : 'bad'}">${icon(ok(c.imeiStatus) ? 'check' : 'x')} IMEI / serial not on reported-stolen list</li>
      ${items.map(i => `<li class="${ok(c.results[i.key]) ? 'ok' : 'bad'}">${icon(ok(c.results[i.key]) ? 'check' : 'x')} ${esc(i.label)}</li>`).join('')}
      ${c.results.battery ? `<li class="${c.results.battery >= 85 ? 'ok' : 'mid'}">${icon('battery')} Battery health ${c.results.battery}%</li>` : ''}</ul>
      ${c.notes ? `<p class="small">“${esc(c.notes)}”</p>` : ''}<p class="tiny muted">Checked by ${esc(c.checker)} (Swavy Checker) · ${SW.date(c.doneAt)}</p></div>`;
  }
  SW.route('/l/:id', async id => {
    const l = (await SW.get('/api/listings/' + id)).listing;
    const t = typeOf(l.type);
    const qs = CAT.questions.filter(q => q.types.includes(l.type));
    const ans = q => q.kind === 'battery' ? (CAT.battery[l.answers[q.key]] || {}).label : l.answers[q.key] === 'yes' ? 'Yes' : 'No';
    const badAns = q => q.kind === 'battery' ? l.answers[q.key] !== 'good' : l.answers[q.key] === q.bad;
    SW.mount(main => bindListing(main, l));
    const booked = l.check && l.check.status === 'booked';
    return `<button class="back" data-hback>${icon('chevL')} Back</button>
      <div class="lpage"><div>
        <div class="gallery">${l.photos.map((p, i) => `<img src="${esc(p)}" alt="${esc(l.title)} photo ${i + 1}" ${i ? 'loading="lazy"' : ''}>`).join('')}</div>
        ${l.photos.length > 1 ? `<p class="tiny muted center">Swipe for more photos (${l.photos.length})</p>` : ''}
      </div><div>
        <div class="row wrap" style="gap:6px"><span class="badge">${icon(t.icon, 'ic-sm')} ${esc(t.name)}</span>${gradeBadge(l.grade)}${l.status !== 'live' ? `<span class="badge ${l.status === 'blocked' ? 'badge-bad' : 'badge-warn'}">${l.status === 'blocked' ? 'Blocked: reported stolen' : l.status}</span>` : ''}</div>
        <h1 style="margin-top:8px">${esc(l.title)}</h1>
        <div class="pricebig">${naira(l.price)}</div>
        <p class="small muted">Swavy estimate for this condition: ${naira(l.estLow)} – ${naira(l.estHigh)} ${l.price <= l.estHigh ? '<span class="badge badge-ok">Fair price</span>' : '<span class="badge badge-warn">Above estimate</span>'}</p>
        ${l.mine ? sellerPanel(l, booked) : l.status === 'live' ? `
          ${l.myOffer ? `<div class="note ${l.myOffer.status === 'accepted' ? 'note-ok' : l.myOffer.status === 'declined' ? 'note-bad' : 'note-brand'}">${icon('tag')}<span>Your offer ${naira(l.myOffer.amount)}: <b>${l.myOffer.status === 'accepted' ? 'accepted! Buy now at this price.' : l.myOffer.status === 'pending' ? 'waiting for seller' : l.myOffer.status}</b></span></div>` : ''}
          <button class="btn btn-primary btn-block btn-lg mt" data-buy>${icon('lock')} Buy safely${l.myOffer && l.myOffer.status === 'accepted' ? ' for ' + naira(l.myOffer.amount) : ''}</button>
          <div class="row mt"><button class="btn btn-ghost grow" data-offer>${icon('tag')} Make offer</button><a class="btn btn-wa grow" target="_blank" rel="noopener" href="${SW.waShare(`See this ${l.title} for ${naira(l.price)} on Swavy Spare${l.grade ? ' (Swavy Checked, grade ' + l.grade + ')' : ''}: ${location.origin}/#/l/${l.id}`)}">${icon('share')} Share</a></div>
          <div class="note mt">${icon('lock')}<span><b>How “Buy safely” works:</b> your money is held by Swavy, you meet or get delivery, test the device, then give the seller your code. Only then is money released. <i>Simulated in this demo.</i></span></div>`
        : l.openOrderId ? `<a class="btn btn-primary btn-block btn-lg mt" href="#/order/${l.openOrderId}">Open my order</a>` : `<div class="note note-warn mt">${icon('info')}<span>This device is no longer available.</span></div>`}
        ${l.check && l.check.grade || (l.check && l.check.status === 'failed') ? reportCard(l.check, l.type) : `<div class="card mt"><h3 style="margin:0">${icon('shield')} Not Swavy Checked yet</h3><p class="small muted" style="margin:6px 0 0">${booked ? 'A Swavy Checker is booked to test this device soon.' : 'Ask the seller to book a Swavy Checker, or test it well when you meet.'}</p></div>`}
        <div class="card"><h3>Seller says</h3><ul class="answers">${qs.map(q => `<li><span>${esc(q.q)}</span><b class="${badAns(q) ? 'warn' : ''}">${esc(ans(q))}</b></li>`).join('')}${l.storage ? `<li><span>Storage</span><b>${esc(l.storage)}</b></li>` : ''}${l.imeiMasked ? `<li><span>IMEI / serial</span><b>${esc(l.imeiMasked)}</b></li>` : ''}</ul>${l.description ? `<p class="mt">“${esc(l.description)}”</p>` : ''}</div>
        <div class="card"><div class="row">${SW.avatar(l.seller.name, 48)}<div class="grow"><b>${esc(l.seller.name)}</b><div class="small muted">${esc(l.area)}, ${esc(l.city)} · ${l.seller.sales} sale${l.seller.sales === 1 ? '' : 's'} on Swavy · joined ${SW.date(l.seller.since)}</div></div></div></div>
      </div></div>`;
  });
  function sellerPanel(l, booked) {
    return `<div class="card next mt"><p class="eyebrow">Your listing</p>
      ${l.status === 'live' && !l.grade && !booked ? `<h3>Get the Swavy Checked badge</h3><p class="small muted">Checked devices sell faster and for better prices. A verified Tech Checker tests it at your place.</p><button class="btn btn-lime btn-block btn-lg" data-bookcheck>${icon('shield')} Book a Swavy Checker · ${naira(typeOf(l.type).fee)}</button>` : ''}
      ${booked ? `<div class="note note-brand">${icon('clock')}<span>Checker <b>${esc(l.check.checker)}</b> is booked (${esc(l.check.slot)}). Fee ${naira(l.check.fee)}, pay the checker after the check.</span></div>` : ''}
      ${l.offers && l.offers.filter(o => o.status === 'pending').length ? `<h3 class="mt">Offers</h3>${l.offers.filter(o => o.status === 'pending').map(o => `<div class="row between gline"><span><b>${naira(o.amount)}</b> from ${esc(o.buyer)}</span><span class="row" style="gap:6px"><button class="btn btn-sm btn-ok" data-oacc="${o.id}">Accept</button><button class="btn btn-sm btn-ghost" data-odec="${o.id}">No</button></span></div>`).join('')}` : ''}
      ${l.status === 'live' ? `<div class="row mt"><button class="btn btn-ghost grow" data-price>Change price</button><button class="btn btn-bad grow" data-remove>Remove</button></div>` : ''}
      ${l.openOrderId ? `<a class="btn btn-primary btn-block mt" href="#/order/${l.openOrderId}">Open the order</a>` : ''}
      ${l.imei ? `<p class="tiny muted mt">Full IMEI / serial (only you see this): ${esc(l.imei)}</p>` : ''}</div>`;
  }
  function bindListing(main, l) {
    const re = () => SW.render();
    const b = SW.$('[data-buy]', main); if (b) b.onclick = () => buySheet(l);
    const o = SW.$('[data-offer]', main); if (o) o.onclick = () => {
      if (!SW.me) return loginSheet(() => SW.render());
      const sugg = [0.9, 0.93, 0.95].map(k => Math.round(l.price * k / 5000) * 5000);
      SW.sheet(`<h2>Make an offer</h2><p class="muted">Asking price ${naira(l.price)}. The seller can accept or say no.</p>
        <div class="chips">${sugg.map(v => `<button class="chip" data-v="${v}">${naira(v)}</button>`).join('')}</div>
        <label class="field mt"><span>Your offer (₦)</span><input class="input" id="amt" inputmode="numeric" value="${sugg[1]}"></label>
        <button class="btn btn-primary btn-block btn-lg" id="go">Send offer</button>`, (s, close) => {
        s.querySelectorAll('[data-v]').forEach(c => c.onclick = () => { s.querySelector('#amt').value = c.dataset.v; });
        s.querySelector('#go').onclick = e => SW.busy(e.currentTarget, async () => { await SW.post(`/api/listings/${l.id}/offer`, { amount: String(s.querySelector('#amt').value).replace(/[^\d]/g, '') }); close(); SW.toast('Offer sent to the seller!', 'ok'); re(); });
      });
    };
    const bc = SW.$('[data-bookcheck]', main); if (bc) bc.onclick = () => bookCheckSheet(l, re);
    SW.$$('[data-oacc]', main).forEach(x => x.onclick = () => SW.busy(x, async () => { await SW.post(`/api/offers/${x.dataset.oacc}/accept`); SW.toast('Offer accepted. The buyer can now buy at that price.', 'ok'); re(); }));
    SW.$$('[data-odec]', main).forEach(x => x.onclick = () => SW.busy(x, async () => { await SW.post(`/api/offers/${x.dataset.odec}/decline`); SW.toast('Offer declined.'); re(); }));
    const pr = SW.$('[data-price]', main); if (pr) pr.onclick = () => SW.sheet(`<h2>Change price</h2><p class="muted small">Swavy estimate: ${naira(l.estLow)} – ${naira(l.estHigh)}</p><input class="input" id="p" inputmode="numeric" value="${l.price}"><button class="btn btn-primary btn-block btn-lg mt" id="go">Save price</button>`, (s, close) => {
      s.querySelector('#go').onclick = e => SW.busy(e.currentTarget, async () => { await SW.put('/api/listings/' + l.id, { price: String(s.querySelector('#p').value).replace(/[^\d]/g, '') }); close(); SW.toast('Price updated.', 'ok'); re(); });
    });
    const rm = SW.$('[data-remove]', main); if (rm) rm.onclick = async () => { if (await SW.confirm('Remove this listing?', 'Buyers will no longer see it.', 'Yes, remove', 'bad')) SW.busy(rm, async () => { await SW.put('/api/listings/' + l.id, { remove: true }); SW.toast('Listing removed.'); SW.go('#/me'); }); };
  }
  function bookCheckSheet(l, after) {
    let slot = 'Today, afternoon';
    SW.sheet(`<h2>Book a Swavy Checker</h2><p class="muted">A verified Tech Checker comes to you and tests: IMEI (stolen list), screen, battery, cameras, charging, account lock and water damage. Then your listing gets a grade A, B or C.</p>
      <p class="field" style="margin-bottom:6px"><b>When?</b></p><div class="chips">${['Today, afternoon', 'Today, evening', 'Tomorrow, morning', 'Tomorrow, afternoon'].map((s, i) => `<button class="chip ${i ? '' : 'on'}" data-s="${s}">${s}</button>`).join('')}</div>
      <div class="totalbar mt"><span>Check fee (pay the checker)</span><b>${naira(typeOf(l.type).fee)}</b></div><p class="tiny muted">Sample fee. Pay the checker directly after the check.</p>
      <button class="btn btn-lime btn-block btn-lg mt" id="go">${icon('check')} Book checker</button>`, (s, close) => {
      s.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { slot = b.dataset.s; s.querySelectorAll('[data-s]').forEach(x => x.classList.toggle('on', x === b)); });
      s.querySelector('#go').onclick = e => SW.busy(e.currentTarget, async () => { const r = await SW.post(`/api/listings/${l.id}/check`, { slot }); close(); SW.toast(`Booked! ${r.checker} will check your device.`, 'ok'); after && after(); });
    });
  }
  function buySheet(l) {
    if (!SW.me) return loginSheet(() => SW.render());
    if (isChecker()) return SW.toast('Checker accounts cannot buy. Log in as a buyer.', 'bad');
    const price = l.myOffer && l.myOffer.status === 'accepted' ? l.myOffer.amount : l.price;
    let method = 'meet', spot = MEET[l.city][0];
    const draw = s => {
      s.querySelector('#body').innerHTML = `<div class="seg"><button data-m="meet" class="${method === 'meet' ? 'on' : ''}">Meet in person</button><button data-m="deliver" class="${method === 'deliver' ? 'on' : ''}">Delivery</button></div>
        ${method === 'meet' ? `<p class="small muted mt" style="margin-bottom:6px">Pick a safe, busy place:</p><div class="chips">${MEET[l.city].map(m => `<button class="chip ${spot === m ? 'on' : ''}" data-spot="${esc(m)}">${esc(m)}</button>`).join('')}</div>` : `<p class="small muted mt">The seller sends it with a rider. Test it before you give your code. <span class="sample-tag">Sample fee</span></p>`}
        <dl class="kv mt"><dt>${esc(l.title)}</dt><dd>${naira(price)}</dd>${method === 'deliver' ? `<dt>Delivery</dt><dd>${naira(3000)}</dd>` : ''}<dt><b>Total held</b></dt><dd><b>${naira(price + (method === 'deliver' ? 3000 : 0))}</b></dd></dl>`;
      s.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { method = b.dataset.m; draw(s); });
      s.querySelectorAll('[data-spot]').forEach(b => b.onclick = () => { spot = b.dataset.spot; draw(s); });
    };
    SW.sheet(`<h2>Buy safely</h2><div id="body"></div>
      <ol class="flow mt"><li><b>Swavy holds your money</b></li><li>You meet or get delivery and test the device</li><li>Happy? Give the seller your 4-digit code</li><li>Money is released to the seller</li></ol>
      <div class="note note-warn">${icon('info')}<span>${esc(CAT.escrowNote)}</span></div>
      <button class="btn btn-primary btn-block btn-lg mt" id="go">${icon('lock')} Hold my money & order</button>`, (s, close) => {
      draw(s);
      s.querySelector('#go').onclick = e => SW.busy(e.currentTarget, async () => {
        const r = await SW.post(`/api/listings/${l.id}/buy`, { method, meetSpot: method === 'meet' ? spot : '' });
        close(); SW.toast('Order placed. Money held (simulated).', 'ok'); SW.go('#/order/' + r.id);
      });
    });
  }

  // ——— Order page (simulated escrow) ———
  const OSTEPS = ['Ordered', 'Money held', 'Meet / deliver', 'Confirmed', 'Released'];
  SW.route('/order/:id', async id => {
    if (!SW.me) return SW.needLogin();
    return orderView((await SW.get('/api/orders/' + id)).order);
  });
  function orderView(o) {
    const buyer = o.mine === 'buyer';
    const idx = o.status === 'held' ? 1 : o.status === 'handover' ? 2 : o.status === 'released' ? 4 : -1;
    const other = buyer ? o.seller : o.buyer;
    const first = n => esc(String(n).split(' ')[0]);
    let action = '';
    if (o.status === 'refunded') action = `<div class="card next warnc"><p class="eyebrow">Cancelled</p><h2>Money returned to buyer</h2><p class="muted small">${esc(o.note || '')} (simulated)</p></div>`;
    else if (o.status === 'released') action = `<div class="card next okc"><p class="eyebrow">${icon('checkCircle', 'ic-sm')} Complete</p><h2>${buyer ? 'Enjoy your device!' : `${naira(o.amount)} released to you`}</h2><p class="muted small">Money released ${SW.ago(o.releasedAt)} (simulated).</p></div>`;
    else if (buyer) action = `<div class="card next"><p class="eyebrow">${icon('lock', 'ic-sm')} ${naira(o.total)} held by Swavy</p>
        <h2>${o.status === 'held' ? (o.method === 'meet' ? `Meet ${first(other.name)} at ${esc(o.meetSpot)}` : `Waiting for ${first(other.name)} to send it`) : (o.method === 'meet' ? `${first(other.name)} is ready to meet` : 'Your device is on the way')}</h2>
        <div class="codebox"><span class="muted small">Your release code</span><b data-code>${esc(o.code)}</b><span class="small">Test the device first. Give this code to ${first(other.name)} <b>only when you're happy</b>.</span></div>
        <button class="btn btn-ok btn-block btn-lg" data-release>${icon('check')} I got it, release money</button>
        <button class="btn btn-ghost btn-block mt" data-refund>Problem? Cancel & get refund</button></div>`;
    else action = `<div class="card next"><p class="eyebrow">${icon('lock', 'ic-sm')} Buyer's ${naira(o.total)} is held</p>
        <h2>${o.status === 'held' ? (o.method === 'meet' ? `Meet ${first(other.name)} at ${esc(o.meetSpot)}` : `Send the device to ${first(other.name)}`) : 'Collect the buyer\'s code'}</h2>
        <p class="muted small">After ${first(other.name)} tests the device, they give you a 4-digit code. Enter it to release your money.</p>
        ${o.status === 'held' ? `<button class="btn btn-primary btn-block btn-lg" data-handover>${icon(o.method === 'meet' ? 'handshake' : 'car')} ${o.method === 'meet' ? "I'm ready to meet" : "I've sent it"}</button>` : ''}
        <button class="btn ${o.status === 'handover' ? 'btn-ok' : 'btn-ghost'} btn-block btn-lg mt" data-code-entry>${icon('key')} Enter buyer's code</button>
        <button class="btn btn-ghost btn-block mt" data-refund>Cancel sale</button></div>`;
    SW.mount(main => bindOrder(main, o));
    return `<button class="back" data-hback>${icon('chevL')} Back</button>
      <div class="row between wrap"><div><p class="small muted" style="margin:0">Order ${esc(o.ref)} · ${buyer ? 'You are buying' : 'You are selling'}</p><h1 style="margin:0">${esc(o.listing.title)}</h1></div><span class="badge ${o.status === 'released' ? 'badge-ok' : o.status === 'refunded' ? 'badge-bad' : 'badge-brand'}">${esc(o.statusText)}</span></div>
      ${idx >= 0 ? `<ol class="track mt" style="--n:5">${OSTEPS.map((s, i) => `<li class="${i <= idx ? 'done' : ''} ${i === idx ? 'now' : ''}">${s}</li>`).join('')}</ol>` : ''}
      <div class="two-col mt"><div>${action}<div class="note mt">${icon('info')}<span>${esc(o.note)}</span></div></div>
      <div><div class="card row"><img src="${esc(o.listing.photo)}" alt="" style="width:76px;height:60px;object-fit:cover;border-radius:10px"><div class="grow"><b>${esc(o.listing.title)}</b><div>${o.listing.grade ? gradeBadge(o.listing.grade) : '<span class="small muted">Not checked</span>'}</div></div><a class="btn btn-sm btn-ghost" href="#/l/${o.listing.id}">View</a></div>
        <div class="card"><dl class="kv"><dt>Price</dt><dd>${naira(o.amount)}</dd>${o.deliveryFee ? `<dt>Delivery</dt><dd>${naira(o.deliveryFee)}</dd>` : ''}<dt>Total held</dt><dd>${naira(o.total)}</dd><dt>How</dt><dd>${o.method === 'meet' ? 'Meet: ' + esc(o.meetSpot) : 'Delivery'}</dd></dl></div>
        <div class="card"><div class="row">${SW.avatar(other.name, 44)}<div class="grow"><b>${esc(other.name)}</b><div class="small muted">${buyer ? 'Seller' : 'Buyer'} · ${esc(other.area || '')}</div></div></div>
          <div class="row mt"><a class="btn btn-wa btn-sm grow" target="_blank" rel="noopener" href="${SW.wa(other.phone, `Hi ${String(other.name).split(' ')[0]}, about Swavy Spare order ${o.ref} (${o.listing.title}).`)}">${icon('wa')} WhatsApp</a><a class="btn btn-ghost btn-sm grow" href="tel:+${SW.normPhone(other.phone)}">Call</a></div></div>
        <div class="card"><h3>Timeline</h3><ul class="timeline">${o.events.map(e => `<li><span>${esc(e.text)}</span><time class="tiny muted">${SW.ago(e.at)}</time></li>`).join('')}</ul></div></div></div>`;
  }
  function bindOrder(main, o) {
    const reload = r => { main.innerHTML = orderView(r.order); const f = SW.onMount; SW.onMount = null; if (f) f(main); refreshMe().then(() => SW.afterRender(SW.path())); };
    const h = SW.$('[data-handover]', main); if (h) h.onclick = () => SW.busy(h, async () => { reload(await SW.post(`/api/orders/${o.id}/handover`)); SW.toast('Buyer has been told.', 'ok'); });
    const r = SW.$('[data-release]', main); if (r) r.onclick = async () => { if (await SW.confirm('Release the money?', 'Only do this if you have the device and it works as described.', 'Yes, release money')) SW.busy(r, async () => { reload(await SW.post(`/api/orders/${o.id}/release`)); SW.toast('Money released. Enjoy your device! 🎉', 'ok'); }); };
    const rf = SW.$('[data-refund]', main); if (rf) rf.onclick = () => SW.sheet(`<h2>Cancel this order?</h2><p class="muted">The held money goes back to the buyer and the device is listed again.</p><div class="chips">${['Device not as described', 'Seller did not show up', 'Buyer did not show up', 'Changed my mind'].map(x => `<button class="chip" data-r="${x}">${x}</button>`).join('')}</div><button class="btn btn-bad btn-block btn-lg mt" id="go">Cancel & refund</button>`, (s, close) => {
      let reason = ''; s.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { reason = b.dataset.r; s.querySelectorAll('[data-r]').forEach(x => x.classList.toggle('on', x === b)); });
      s.querySelector('#go').onclick = e => SW.busy(e.currentTarget, async () => { const res = await SW.post(`/api/orders/${o.id}/refund`, { reason }); close(); reload(res); SW.toast('Order cancelled. Money returned (simulated).'); });
    });
    const c = SW.$('[data-code-entry]', main); if (c) c.onclick = () => SW.sheet(`<h2>Enter buyer's code</h2><p class="muted">Ask ${esc(o.buyer.name.split(' ')[0])} for the 4-digit code on their screen after they test the device.</p>
      <input class="input code-input" id="code" inputmode="numeric" maxlength="4" placeholder="••••" aria-label="Buyer's code"><button class="btn btn-ok btn-block btn-lg mt" id="go">${icon('check')} Release my money</button>`, (s, close) => {
      s.querySelector('#go').onclick = e => SW.busy(e.currentTarget, async () => { const res = await SW.post(`/api/orders/${o.id}/release`, { code: s.querySelector('#code').value }); close(); reload(res); SW.toast(`${naira(o.amount)} released to you (simulated). 🎉`, 'ok'); });
    });
  }

  // ——— Sell: 3 steps (device -> condition -> photos & price) ———
  SW.route('/sell', async () => {
    if (!SW.me) return `<div class="center" style="max-width:520px;margin:0 auto"><div class="logo-xl">${SW.mark()}</div><h1>Sell your gadget</h1><p class="muted">3 quick steps. We suggest a fair price and buyers pay through Swavy's safe hold.</p><button class="btn btn-primary btn-lg btn-block" data-login>Log in to sell</button></div>`;
    if (isChecker()) return `<div class="empty">${icon('info')}<h3>Checker accounts don't sell</h3><p>Log in with a normal account to sell.</p></div>`;
    const S = SELL, head = `${S.step > 1 || S.type ? `<button class="back" data-sback>${icon('chevL')} Back</button>` : ''}<div class="steps"><i class="on"></i><i class="${S.step >= 2 ? 'on' : ''}"></i><i class="${S.step >= 3 ? 'on' : ''}"></i></div>`;
    let est = null;
    if (S.step >= 2 && S.modelId) est = await SW.post('/api/estimate', { type: S.type, modelId: S.modelId, storage: S.storage, answers: S.answers });
    SW.mount(main => bindSell(main));
    if (S.step === 1) {
      const t = S.type && typeOf(S.type);
      const models = S.type ? CAT.models.filter(m => m.type === S.type && (!S.brand || m.brand === S.brand)) : [];
      const brands = S.type ? Array.from(new Set(CAT.models.filter(m => m.type === S.type).map(m => m.brand))) : [];
      return `${head}<p class="small muted">Step 1 of 3</p><h1>${S.type ? 'Which model?' : 'What are you selling?'}</h1>
        ${!S.type ? `<div class="tiles">${CAT.types.map(x => `<button class="tile" data-stype="${x.key}"><span class="tile-ic">${icon(x.icon)}</span>${esc(x.name)}</button>`).join('')}</div>` : `
        <div class="chips">${['', ...brands].map(b => `<button class="chip ${S.brand === b || (!S.brand && !b) ? 'on' : ''}" data-sbrand="${esc(b)}">${b || 'All'}</button>`).join('')}</div>
        <div class="list mt">${models.map(m => `<button class="pick ${S.modelId === m.id ? 'on' : ''}" data-model="${m.id}"><span><span class="tiny muted">${esc(m.brand)}</span><br>${esc(m.name)}</span>${S.modelId === m.id ? icon('checkCircle') : icon('chevR')}</button>`).join('')}</div>
        ${S.modelId && t.storage.length ? `<div class="card mt next" id="storage"><h3>Storage</h3><div class="chips">${t.storage.map(s => `<button class="chip ${S.storage === s ? 'on' : ''}" data-storage="${s}">${s}</button>`).join('')}</div></div>` : ''}`}`;
    }
    const model = CAT.models.find(m => m.id === S.modelId);
    const estBox = `<div class="estimate"><span class="small">Suggested price</span><b>${naira(est.low)} – ${naira(est.high)}</b><span class="tiny">Estimate from Swavy's sample price table. Not a guarantee.</span></div>`;
    if (S.step === 2) {
      const qs = CAT.questions.filter(q => q.types.includes(S.type));
      const done = qs.every(q => S.answers[q.key]);
      return `${head}<p class="small muted">Step 2 of 3 · ${esc(model.name)}${S.storage ? ' ' + esc(S.storage) : ''}</p><h1>Quick condition check</h1><p class="muted">Be honest. A Swavy Checker can confirm it later.</p>
        ${estBox}
        <div class="qlist">${qs.map(q => `<div class="q"><b>${esc(q.q)}</b><span class="tiny muted">${esc(q.hint)}</span>
          ${q.kind === 'battery' ? `<div class="bat">${Object.entries(CAT.battery).map(([k, v]) => `<button class="${S.answers[q.key] === k ? (k === 'good' ? 'on-yes' : 'on-mid') : ''}" data-ans="${q.key}" data-v="${k}">${esc(v.label)}</button>`).join('')}</div>`
          : `<div class="yesno"><button class="${S.answers[q.key] === 'yes' ? (q.bad === 'yes' ? 'on-no' : 'on-yes') : ''}" data-ans="${q.key}" data-v="yes">Yes</button><button class="${S.answers[q.key] === 'no' ? (q.bad === 'no' ? 'on-no' : 'on-yes') : ''}" data-ans="${q.key}" data-v="no">No</button></div>`}</div>`).join('')}</div>
        <button class="btn btn-primary btn-block btn-lg mt" data-s2 ${done ? '' : 'disabled'}>${done ? 'Next: photos & price' : `Answer all ${qs.length} questions`} ${icon('chevR')}</button>`;
    }
    const t = typeOf(S.type);
    if (S.price == null) S.price = est.mid;
    const areaOpts = Object.entries(CAT.areas).map(([c, l]) => `<optgroup label="${c}">${l.map(a => `<option ${(S.area || SW.me.area) === a ? 'selected' : ''}>${a}</option>`).join('')}</optgroup>`).join('');
    return `${head}<p class="small muted">Step 3 of 3 · ${esc(model.name)}</p><h1>Photos & price</h1>
      ${estBox}${est.reasons.length ? `<p class="tiny muted">Price adjusted for: ${esc(est.reasons.join(' · '))}</p>` : ''}
      <form id="sf" novalidate>
      <div class="field"><span>Photos (up to 6, optional)</span><div class="photos">${S.photos.map((p, i) => `<figure><img src="${esc(p)}" alt="Photo ${i + 1}"><button type="button" class="icon-btn rm" data-rmp="${i}" aria-label="Remove photo">${icon('x', 'ic-sm')}</button></figure>`).join('')}${S.photos.length < 6 ? `<button type="button" class="add-photo" data-addp>${icon('camera')}Add photo</button>` : ''}</div><span class="tiny muted">Tip: front, back and screen on. No photo? We show a sample picture.</span></div>
      <label class="field"><span>${t.needsImei ? 'IMEI (dial *#06# to see it)' : 'Serial number (optional, helps buyers trust you)'}</span><input class="input" name="imei" inputmode="${t.needsImei ? 'numeric' : 'text'}" value="${esc(S.imei || '')}" placeholder="${t.needsImei ? '15 digits' : 'e.g. C02XK1ABCD'}"></label>
      <label class="field"><span>Your price (₦)</span><input class="input" name="price" inputmode="numeric" value="${S.price}"><span class="tiny muted">We suggest ${naira(est.mid)}.</span></label>
      <label class="field"><span>Your area</span><select class="input" name="area">${areaOpts}</select></label>
      <label class="field"><span>Anything else? (optional)</span><textarea class="input" name="description" placeholder="e.g. UK used, with original charger">${esc(S.description || '')}</textarea></label>
      <div class="note">${icon('shield')}<span>We check every IMEI against Swavy's reported-stolen list before your listing goes live.</span></div>
      <button type="submit" class="btn btn-primary btn-block btn-lg mt">${icon('check')} Post my listing</button></form>`;
  });
  function bindSell(main) {
    const S = SELL;
    const keep = () => { const f = SW.$('#sf', main); if (f) Object.assign(S, { imei: f.imei.value, price: f.price.value, area: f.area.value, description: f.description.value }); };
    const back = SW.$('[data-sback]', main); if (back) back.onclick = () => { keep(); if (S.step > 1) S.step--; else { S.type = ''; S.modelId = null; S.brand = ''; S.storage = ''; } SW.render(); };
    SW.$$('[data-stype]', main).forEach(b => b.onclick = () => { Object.assign(S, { type: b.dataset.stype, brand: '', modelId: null, storage: '', answers: {}, price: null }); SW.render(); });
    SW.$$('[data-sbrand]', main).forEach(b => b.onclick = () => { S.brand = b.dataset.sbrand; SW.render(); });
    SW.$$('[data-model]', main).forEach(b => b.onclick = async () => {
      S.modelId = +b.dataset.model; S.price = null; S.storage = '';
      if (!typeOf(S.type).storage.length) S.step = 2;
      await SW.render();
      const st = SW.$('#storage'); if (st) st.scrollIntoView({ behavior: 'smooth', block: 'center' }); else window.scrollTo(0, 0);
    });
    SW.$$('[data-storage]', main).forEach(b => b.onclick = () => { S.storage = b.dataset.storage; S.step = 2; S.price = null; SW.render(); window.scrollTo(0, 0); });
    SW.$$('[data-ans]', main).forEach(b => b.onclick = async () => { S.answers[b.dataset.ans] = b.dataset.v; S.price = null; const y = window.scrollY; await SW.render(); window.scrollTo(0, y); });
    const s2 = SW.$('[data-s2]', main); if (s2) s2.onclick = () => { S.step = 3; SW.render(); window.scrollTo(0, 0); };
    const ap = SW.$('[data-addp]', main); if (ap) ap.onclick = async () => { keep(); const u = await SW.pickPhoto(); if (u) { S.photos.push(u); SW.render(); } };
    SW.$$('[data-rmp]', main).forEach(b => b.onclick = () => { keep(); S.photos.splice(+b.dataset.rmp, 1); SW.render(); });
    const f = SW.$('#sf', main);
    if (f) f.onsubmit = e => { e.preventDefault(); keep(); SW.busy(f.querySelector('[type=submit]'), async () => {
      let r;
      try { r = await SW.post('/api/listings', { type: S.type, modelId: S.modelId, storage: S.storage, answers: S.answers, imei: S.imei, price: String(S.price).replace(/[^\d]/g, ''), area: S.area, description: S.description, photos: S.photos }); }
      catch (err) {
        if (err.code === 'stolen') { SW.sheet(`<div class="center"><div class="stolen-ic">${icon('alert')}</div><h2>Listing blocked</h2><p class="muted">${esc(err.message)}</p><button class="btn btn-primary btn-block" data-close>OK</button></div>`); return; }
        SW.showErr(f, err); return;
      }
      Object.keys(S).forEach(k => delete S[k]); Object.assign(S, { step: 1, answers: {}, photos: [] });
      SW.go('#/sold/' + r.id);
    }); };
  }
  SW.route('/sold/:id', async id => {
    const l = (await SW.get('/api/listings/' + id)).listing;
    SW.mount(main => { const b = SW.$('[data-bookcheck]', main); if (b) b.onclick = () => bookCheckSheet(l, () => SW.go('#/l/' + l.id)); });
    return `<div class="center" style="max-width:560px;margin:0 auto"><div class="okbig">${icon('checkCircle')}</div><h1>Your ${esc(l.title)} is live!</h1><p class="muted">Buyers can now see it for ${naira(l.price)}.</p>
      <div class="card next" style="text-align:left"><p class="eyebrow">${icon('shield', 'ic-sm')} Sell faster</p><h2>Get the Swavy Checked badge</h2><p class="muted">Checked devices get more trust and better offers. A Tech Checker visits, tests it and gives a grade A, B or C.</p>
      <button class="btn btn-lime btn-block btn-lg" data-bookcheck>Book a checker · ${naira(typeOf(l.type).fee)}</button></div>
      <div class="row mt"><a class="btn btn-ghost grow" href="#/l/${l.id}">View listing</a><a class="btn btn-wa grow" target="_blank" rel="noopener" href="${SW.waShare(`I'm selling my ${l.title} for ${naira(l.price)} on Swavy Spare: ${location.origin}/#/l/${l.id}`)}">${icon('share')} Share</a></div></div>`;
  });

  // ——— My stuff: seller dashboard + purchases ———
  SW.route('/me', async () => {
    if (!SW.me) return SW.needLogin();
    if (isChecker()) return checkerHome();
    const [d, mine] = await Promise.all([SW.get('/api/seller'), SW.get('/api/orders')]);
    const tab = SW.qs().get('tab') || 'selling';
    SW.mount(main => {
      SW.$$('[data-oacc]', main).forEach(x => x.onclick = () => SW.busy(x, async () => { await SW.post(`/api/offers/${x.dataset.oacc}/accept`); SW.toast('Offer accepted!', 'ok'); await refreshMe(); SW.render(); }));
      SW.$$('[data-odec]', main).forEach(x => x.onclick = () => SW.busy(x, async () => { await SW.post(`/api/offers/${x.dataset.odec}/decline`); SW.toast('Offer declined.'); await refreshMe(); SW.render(); }));
    });
    const s = d.stats;
    const open = d.sales.filter(x => ['held', 'handover'].includes(x.status)), past = d.sales.filter(x => !['held', 'handover'].includes(x.status));
    const oItem = o => `<a class="item" href="#/order/${o.id}"><img src="${esc(o.listing.photo)}" alt="" class="thumb"><div class="grow"><b>${esc(o.listing.title)}</b><div class="small muted">${o.mine === 'buyer' ? 'From ' + esc(o.seller.name) : 'To ' + esc(o.buyer.name)} · ${SW.ago(o.createdAt)}</div></div><div style="text-align:right"><span class="badge ${o.status === 'released' ? 'badge-ok' : o.status === 'refunded' ? 'badge-bad' : 'badge-brand'}">${esc(o.statusText)}</span><div class="small" style="font-weight:700">${naira(o.amount)}</div></div></a>`;
    const lItem = l => `<a class="item" href="#/l/${l.id}"><img src="${esc(l.photos[0])}" alt="" class="thumb"><div class="grow"><b>${esc(l.title)}</b><div class="small muted">${naira(l.price)} · ${l.status === 'live' ? 'Live' : esc(l.status)}${l.pendingOffers ? ` · <b style="color:var(--warn)">${l.pendingOffers} offer</b>` : ''}</div>
        <div class="row wrap" style="gap:4px;margin-top:4px">${l.grade ? gradeBadge(l.grade) : l.check && l.check.status === 'booked' ? '<span class="badge badge-brand">Check booked</span>' : l.status === 'live' ? '<span class="badge">Not checked</span>' : ''}${l.status === 'blocked' ? '<span class="badge badge-bad">Blocked</span>' : ''}</div></div>${icon('chevR')}</a>`;
    return `<h1>My stuff</h1>
      <div class="seg"><a href="#/me?tab=selling" class="segl ${tab === 'selling' ? 'on' : ''}">Selling</a><a href="#/me?tab=buying" class="segl ${tab === 'buying' ? 'on' : ''}">Buying (${mine.orders.length})</a></div>
      ${tab === 'selling' ? `
      <div class="stat-grid mt"><div class="stat stat-hero"><b>${naira(s.earned)}</b><span>Earned (released)</span></div><div class="stat"><b>${naira(s.held)}</b><span>Held for you now</span></div><div class="stat"><b>${s.live}</b><span>Live listings</span></div><div class="stat"><b>${s.sold}</b><span>Sold</span></div></div>
      ${d.offers.length ? `<div class="section-title"><h2>Offers waiting</h2><span class="badge badge-warn">${d.offers.length}</span></div><div class="list">${d.offers.map(o => `<div class="item"><div class="grow"><b>${naira(o.amount)}</b> <span class="small muted">for ${esc(o.title)} (asking ${naira(o.price)})</span><div class="small muted">${esc(o.buyer)} · ${SW.ago(o.createdAt)}</div></div><button class="btn btn-sm btn-ok" data-oacc="${o.id}">Accept</button><button class="btn btn-sm btn-ghost" data-odec="${o.id}">No</button></div>`).join('')}</div>` : ''}
      ${open.length ? `<div class="section-title"><h2>Sales in progress</h2></div><div class="list">${open.map(oItem).join('')}</div>` : ''}
      <div class="section-title"><h2>My listings</h2><a class="btn btn-sm btn-primary" href="#/sell">${icon('plus', 'ic-sm')} Sell</a></div>
      ${d.listings.length ? `<div class="list">${d.listings.map(lItem).join('')}</div>` : `<div class="empty">${icon('tag')}<h3>Nothing listed yet</h3><p>Turn that old phone into cash.</p><a class="btn btn-primary" href="#/sell">Sell a gadget</a></div>`}
      ${past.length ? `<div class="section-title"><h2>Past sales</h2></div><div class="list">${past.map(oItem).join('')}</div>` : ''}`
      : `<div class="mt">${mine.orders.length ? `<div class="list">${mine.orders.map(oItem).join('')}</div>` : `<div class="empty">${icon('box')}<h3>No purchases yet</h3><p>Find a Swavy Checked device and buy safely.</p><a class="btn btn-primary" href="#/">Shop now</a></div>`}</div>`}`;
  });

  // ——— Safety: IMEI check + report stolen ———
  SW.route('/safety', () => {
    SW.mount(main => {
      const cf = SW.$('#cf', main);
      cf.onsubmit = e => { e.preventDefault(); SW.busy(cf.querySelector('button'), async () => {
        let r; try { r = await SW.get('/api/imei/' + encodeURIComponent(cf.imei.value.replace(/\s/g, '') || '-')); } catch (err) { SW.showErr(cf, err); return; }
        SW.$('#cres', main).innerHTML = r.result === 'reported' ? `<div class="note note-bad mt">${icon('alert')}<span><b>REPORTED STOLEN.</b> ${esc(r.device || '')} was reported on ${SW.date(r.reportedAt)}. Do not buy it.</span></div>` : `<div class="note note-ok mt">${icon('checkCircle')}<span><b>Not on Swavy's reported list.</b> Still test the device and buy safely through Swavy.</span></div>`;
      }); };
      const rf = SW.$('#rf', main);
      rf.onsubmit = e => { e.preventDefault(); if (!SW.me) return loginSheet(() => SW.render()); SW.busy(rf.querySelector('button'), async () => {
        let r; try { r = await SW.post('/api/report', Object.fromEntries(new FormData(rf))); } catch (err) { SW.showErr(rf, err); return; }
        rf.reset(); SW.toast(r.blocked ? `Reported. ${r.blocked} listing with this IMEI was blocked.` : 'Reported. Anyone who tries to sell it on Swavy will be blocked.', 'ok');
      }); };
    });
    return `<h1>Safety</h1><p class="muted">Check a device before you buy, or report your stolen phone so nobody can sell it here.</p>
      <div class="two-col"><div>
        <form id="cf" class="card" novalidate><h2>${icon('search')} Check an IMEI</h2><p class="small muted">Dial <b>*#06#</b> on the phone to see its IMEI.</p>
          <label class="field"><span>IMEI or serial number</span><input class="input" name="imei" placeholder="15 digits"></label><button class="btn btn-primary btn-block btn-lg">Check now</button><div id="cres"></div></form>
      </div><div>
        <form id="rf" class="card" novalidate><h2>${icon('flag')} Report stolen device</h2><p class="small muted">We add it to Swavy's block list. Listings with this IMEI are blocked immediately.</p>
          <label class="field"><span>IMEI or serial number</span><input class="input" name="imei" placeholder="On the box or receipt"></label>
          <label class="field"><span>Device</span><input class="input" name="device" placeholder="e.g. iPhone 13, blue"></label>
          <label class="field"><span>What happened? (optional)</span><input class="input" name="what" placeholder="e.g. Snatched at Ojuelegba"></label>
          <label class="field"><span>Police report number (optional)</span><input class="input" name="policeRef"></label>
          <button class="btn btn-bad btn-block btn-lg">Report stolen</button></form>
      </div></div>
      <div class="note mt">${icon('info')}<span>This is Swavy's own local demo list, not a national police or network database. Always report theft to the police and your network provider too.</span></div>`;
  });

  // ——— Checker ———
  async function checkerHome() {
    const d = await SW.get('/api/checker');
    const e = d.earnings, v = SW.me.checker && SW.me.checker.verified;
    return `<h1>Hi ${esc(SW.me.name.split(' ')[0])} 👋</h1>
      ${v ? `<p><span class="badge badge-ok">${icon('shield')} Verified Swavy Checker</span></p>` : `<div class="note note-warn">${icon('clock')}<span>Waiting for Swavy to verify you. You'll get checks once verified.</span></div>`}
      <div class="stat-grid mt"><div class="stat stat-hero"><b>${naira(e.month)}</b><span>Earned this month</span></div><div class="stat"><b>${naira(e.total)}</b><span>Total earned</span></div><div class="stat"><b>${e.checks}</b><span>Checks done</span></div><div class="stat"><b>${naira(e.pending)}</b><span>From booked checks</span></div></div>
      <div class="section-title"><h2>Booked checks</h2>${d.booked.length ? `<span class="badge badge-warn">${d.booked.length}</span>` : ''}</div>
      ${d.booked.length ? `<div class="list">${d.booked.map(c => `<div class="item"><img src="${esc(c.listing.photos[0])}" class="thumb" alt=""><div class="grow"><b>${esc(c.listing.title)}</b><div class="small muted">${esc(c.seller.name)} · ${esc(c.listing.area)} · ${esc(c.slot)}</div><div class="small">Fee <b>${naira(c.fee)}</b></div></div><a class="btn btn-primary btn-sm" href="#/check/${c.id}">Start check</a></div>`).join('')}</div>` : `<div class="empty">${icon('shield')}<h3>No checks booked</h3><p>New bookings in your areas show here.</p></div>`}
      <div class="section-title"><h2>Finished</h2></div>
      ${d.done.length ? `<div class="list">${d.done.map(c => `<div class="item"><div class="grow"><b>${esc(c.listing.title)}</b><div class="small muted">${SW.date(c.doneAt)} · ${esc(c.listing.area)}</div></div>${c.grade ? `<span class="gbig g${c.grade} gsm">${c.grade}</span>` : '<span class="badge badge-bad">Failed</span>'}<b class="small">+${naira(c.fee)}</b></div>`).join('')}</div>` : `<div class="empty">${icon('cash')}<p>Your finished checks and fees show here.</p></div>`}`;
  }
  SW.route('/check/:id', async id => {
    if (!isChecker()) return SW.needLogin();
    const c = (await SW.get('/api/checks/' + id)).check;
    const L = c.listing;
    const st = { results: {}, imei: null };
    const hasBattery = CAT.questions[1].types.includes(L.type);
    if (c.status !== 'booked') return `<button class="back" data-hback>${icon('chevL')} Back</button><h1>${esc(L.title)}</h1>${reportCard(c, L.type)}`;
    SW.mount(main => {
      const run = SW.$('[data-imei]', main);
      run.onclick = () => SW.busy(run, async () => {
        const r = await SW.post(`/api/checks/${c.id}/imei`); st.imei = r.result;
        SW.$('#imeires', main).innerHTML = r.result === 'reported' ? `<div class="note note-bad">${icon('alert')}<span><b>REPORTED STOLEN</b> (${esc(r.device || '')}). Do not grade. Submit to block this listing.</span></div>` : `<div class="note note-ok">${icon('checkCircle')}<span><b>Clear.</b> Not on the reported list.</span></div>`;
      });
      SW.$$('[data-item]', main).forEach(b => b.onclick = () => {
        st.results[b.dataset.item] = b.dataset.v;
        SW.$$(`[data-item="${b.dataset.item}"]`, main).forEach(x => { x.className = x === b ? (b.dataset.v === 'pass' ? 'on-yes' : 'on-no') : ''; });
      });
      const sub = SW.$('[data-submit]', main);
      sub.onclick = () => {
        if (!st.imei) return SW.toast('Run the IMEI check first.', 'bad');
        SW.busy(sub, async () => {
          const r = await SW.post(`/api/checks/${c.id}/submit`, { results: st.results, battery: hasBattery ? SW.$('#bat', main).value : null, notes: SW.$('#notes', main).value });
          SW.sheet(r.grade ? `<div class="center"><span class="gbig g${r.grade} gxl">${r.grade}</span><h2 class="mt">Graded ${r.grade}</h2><p class="muted">The listing now shows the Swavy Checked badge and your report. ${naira(c.fee)} added to your earnings.</p><a class="btn btn-primary btn-block" href="#/" data-close>Back to my checks</a></div>`
            : `<div class="center"><div class="stolen-ic">${icon('alert')}</div><h2>Check failed</h2><p class="muted">${esc(r.failed)}</p><a class="btn btn-primary btn-block" href="#/" data-close>Back to my checks</a></div>`);
        });
      };
    });
    return `<button class="back" data-hback>${icon('chevL')} Back</button>
      <p class="small muted" style="margin:0">Swavy Check · ${esc(L.ref)}</p><h1>${esc(L.title)}</h1>
      <div class="card row"><img src="${esc(L.photos[0])}" class="thumb" alt=""><div class="grow"><b>${esc(c.seller.name)}</b><div class="small muted">${esc(L.area)} · ${esc(c.slot)} · fee ${naira(c.fee)}</div></div><a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="${SW.wa(c.seller.phone, `Hi ${c.seller.name.split(' ')[0]}, I'm your Swavy Checker for the ${L.title}. I'm on my way.`)}">${icon('wa')} Message</a></div>
      <div class="card next"><h3>1. IMEI / serial check</h3><p class="mono">${esc(L.imei || 'No IMEI / serial given')}</p><p class="tiny muted">Confirm it matches *#06# (phones) or the label on the device.</p><button class="btn btn-primary btn-block" data-imei>${icon('search')} Check reported-stolen list</button><div id="imeires" class="mt"></div></div>
      <div class="card"><h3>2. Test the device</h3>${c.items.map(i => `<div class="q"><b>${esc(i.label)}</b><div class="yesno"><button data-item="${i.key}" data-v="pass">Pass</button><button data-item="${i.key}" data-v="fail">Fail</button></div></div>`).join('')}
        ${hasBattery ? `<label class="field mt"><span>Battery health (%)</span><input class="input" id="bat" inputmode="numeric" placeholder="e.g. 88"></label>` : ''}
        <label class="field"><span>Notes for buyers (optional)</span><input class="input" id="notes" placeholder="e.g. Tiny scratch on the back"></label></div>
      <div class="note">${icon('info')}<span>The grade is worked out for you: <b>A</b> all pass and battery 85%+, <b>B</b> one minor fail or battery 75–84%, <b>C</b> otherwise. Account lock ON or a reported IMEI fails the check.</span></div>
      <button class="btn btn-lime btn-block btn-lg mt" data-submit>${icon('check')} Submit report</button>`;
  });

  // ——— Signup / account / admin ———
  SW.route('/signup', () => {
    const role = SW.qs().get('as') === 'checker' ? 'checker' : 'user';
    SW.mount(main => {
      SW.$$('[data-role]', main).forEach(b => b.onclick = () => SW.go('#/signup?as=' + b.dataset.role));
      const f = SW.$('#sf', main);
      f.onsubmit = e => { e.preventDefault(); SW.busy(f.querySelector('[type=submit]'), async () => {
        try { await SW.post('/api/signup', Object.assign(Object.fromEntries(new FormData(f)), { role })); } catch (err) { SW.showErr(f, err); return; }
        await refreshMe(); SW.toast('Welcome to Swavy Spare!', 'ok'); SW.go('#/');
      }); };
    });
    return `<div style="max-width:520px;margin:0 auto"><h1>Create your account</h1>
      <div class="seg"><button data-role="user" class="${role === 'user' ? 'on' : ''}">Buy & sell</button><button data-role="checker" class="${role === 'checker' ? 'on' : ''}">I'm a Tech Checker</button></div>
      <form id="sf" class="card mt" novalidate>
        <label class="field"><span>Full name</span><input class="input" name="name" autocomplete="name"></label>
        <label class="field"><span>Phone (WhatsApp)</span><input class="input" name="phone" type="tel" inputmode="tel" placeholder="0803 123 4567"></label>
        <label class="field"><span>Email</span><input class="input" name="email" type="email" inputmode="email" autocomplete="email"></label>
        <label class="field"><span>Password (6+ characters)</span><input class="input" name="password" type="password" autocomplete="new-password"></label>
        <label class="field"><span>Your area</span><select class="input" name="area">${Object.entries(CAT.areas).map(([c, l]) => `<optgroup label="${c}">${l.map(a => `<option>${a}</option>`).join('')}</optgroup>`).join('')}</select></label>
        ${role === 'checker' ? `<div class="note note-brand">${icon('shield')}<span>Swavy verifies every checker (ID and skills test) before they get bookings. You earn a fee for every check.</span></div>` : ''}
        <button type="submit" class="btn btn-primary btn-block btn-lg mt">Create account</button>
        <p class="center small mt">Have an account? <button type="button" class="link-btn" data-login>Log in</button></p></form></div>`;
  });
  SW.route('/account', () => {
    if (!SW.me) return `<div style="max-width:520px;margin:0 auto" class="center"><div class="logo-xl">${SW.mark()}</div><h1>Welcome to Swavy Spare</h1><p class="muted">Buy and sell preloved gadgets safely.</p>
      <button class="btn btn-primary btn-block btn-lg" data-login>Log in</button><a class="btn btn-ghost btn-block mt" href="#/signup">Create account</a><a class="btn btn-ghost btn-block mt" href="#/signup?as=checker">Become a Tech Checker</a><button class="link-btn mt" data-howto>How it works</button></div>`;
    SW.mount(main => { SW.$('[data-logout]', main).onclick = async () => { await SW.post('/api/logout'); SW.me = null; SW.badgeCount = 0; SW.toast('Logged out.'); SW.go('#/'); }; });
    return `<h1>Account</h1><div class="card"><div class="row">${SW.avatar(SW.me.name, 56)}<div class="grow"><b style="font-size:18px">${esc(SW.me.name)}</b><div class="small muted">${esc(SW.me.email)} · ${esc(SW.phone(SW.me.phone))}</div><div class="small muted">${esc(SW.me.area)}, ${esc(SW.me.city)} · ${isChecker() ? 'Tech Checker' : 'Buyer & seller'}</div></div></div></div>
      <div class="card list-links">${isChecker() ? '' : `<a class="rowlink" href="#/me">${icon('list')} My listings & orders ${icon('chevR')}</a>`}
        <a class="rowlink" href="#/safety">${icon('shield')} Check IMEI / report stolen ${icon('chevR')}</a>
        <button class="rowlink" data-howto>${icon('info')} How it works ${icon('chevR')}</button>
        <a class="rowlink" href="#/admin">${icon('key')} Admin ${icon('chevR')}</a>
        <button class="rowlink" data-logout>${icon('logout')} Log out</button></div>`;
  });
  SW.route('/admin', async () => {
    let d;
    try { if (!SW.admin) await refreshMe(); if (!SW.admin) throw Object.assign(new Error('admin'), { status: 401 }); d = await SW.get('/api/admin/overview'); } catch (e) {
      if (e.status !== 401) throw e;
      SW.mount(main => { const f = SW.$('#af', main); f.onsubmit = ev => { ev.preventDefault(); SW.busy(f.querySelector('button'), async () => { try { await SW.post('/api/admin/login', { password: f.password.value }); SW.admin = true; SW.render(); } catch (err) { SW.showErr(f, err); } }); }; });
      return `<div style="max-width:440px;margin:0 auto"><h1>Admin</h1><p class="muted">Verify checkers, manage the reported list and listings.</p><form id="af" class="card" novalidate><label class="field"><span>Admin password</span><input class="input" name="password" type="password" autocomplete="current-password"></label><button class="btn btn-primary btn-block">Enter admin</button><p class="tiny muted mt">Default password is in the README (change it in .env).</p></form></div>`;
    }
    SW.mount(main => {
      SW.$$('[data-cv]', main).forEach(b => b.onclick = () => SW.busy(b, async () => { await SW.post(`/api/admin/checkers/${b.dataset.cv}/verify`, { verified: b.dataset.v === '1' }); SW.toast('Saved.', 'ok'); SW.render(); }));
      SW.$$('[data-lrm]', main).forEach(b => b.onclick = async () => { if (await SW.confirm('Remove this listing?', '', 'Remove', 'bad')) SW.busy(b, async () => { await SW.post(`/api/admin/listings/${b.dataset.lrm}/remove`); SW.render(); }); });
      SW.$$('[data-clr]', main).forEach(b => b.onclick = async () => { if (await SW.confirm('Remove from reported list?', 'Only do this if the owner recovered it or it was a mistake.', 'Remove', 'bad')) SW.busy(b, async () => { await SW.post(`/api/admin/reported/${encodeURIComponent(b.dataset.clr)}/clear`); SW.render(); }); });
      SW.$('[data-alogout]', main).onclick = async () => { await SW.post('/api/admin/logout'); await refreshMe(); SW.go('#/'); };
    });
    const s = d.stats;
    return `<div class="row between"><h1 style="margin:0">Admin</h1><button class="btn btn-sm btn-ghost" data-alogout>Leave admin</button></div>
      <div class="stat-grid mt"><div class="stat"><b>${s.live}</b><span>live listings</span></div><div class="stat"><b>${s.checked}</b><span>Swavy Checked</span></div><div class="stat"><b>${naira(s.held)}</b><span>held (simulated)</span></div><div class="stat"><b>${s.blocked}</b><span>blocked listings</span></div></div>
      <div class="section-title"><h2>Tech Checkers</h2></div><div class="list">${d.checkers.map(c => `<div class="item">${SW.avatar(c.name, 40)}<div class="grow"><b>${esc(c.name)}</b> ${c.verified ? '<span class="badge badge-ok">Verified</span>' : '<span class="badge badge-warn">Pending</span>'}<div class="small muted">${esc(c.email)} · ${c.checks} checks · ${esc(c.areas.slice(0, 4).join(', '))}${c.areas.length > 4 ? '…' : ''}</div></div>${c.verified ? `<button class="btn btn-sm btn-ghost" data-cv="${c.id}" data-v="0">Unverify</button>` : `<button class="btn btn-sm btn-ok" data-cv="${c.id}" data-v="1">Verify</button>`}</div>`).join('')}</div>
      <div class="section-title"><h2>Reported stolen</h2><span class="sample-tag">Local demo list</span></div><div class="list">${d.reported.map(r => `<div class="item"><div class="grow"><b class="mono">${esc(r.imei)}</b><div class="small muted">${esc(r.device)} · ${esc(r.what)}${r.policeRef ? ' · Police ' + esc(r.policeRef) : ''} · ${SW.date(r.createdAt)}</div></div><button class="btn btn-sm btn-ghost" data-clr="${esc(r.imei)}">Clear</button></div>`).join('')}</div>
      ${d.attempts.length ? `<div class="section-title"><h2>Blocked listing attempts</h2></div><div class="card">${d.attempts.map(a => `<div class="row between gline"><span><b class="mono">${esc(a.imei)}</b> · ${esc(a.title)} by ${esc(a.name || '?')}</span><span class="small muted">${SW.ago(a.at)}</span></div>`).join('')}</div>` : ''}
      <div class="section-title"><h2>Listings</h2></div><div class="list">${d.listings.map(l => `<div class="item"><img src="${esc(l.photos[0])}" class="thumb" alt=""><div class="grow"><a href="#/l/${l.id}"><b>${esc(l.title)}</b></a><div class="small muted">${naira(l.price)} · ${esc(l.seller.name)} · ${esc(l.status)}${l.grade ? ' · grade ' + l.grade : ''}</div></div><button class="btn btn-sm btn-bad" data-lrm="${l.id}">Remove</button></div>`).join('')}</div>`;
  });

  function onboard(force) {
    SW.onboarding('swavy-spare-onboarded', [
      { icon: 'phone', title: 'Sell your gadget in 3 steps', text: 'Pick the model, answer quick yes/no questions, and we suggest a fair price. No long typing.' },
      { icon: 'shield', title: 'Swavy Checked = real trust', text: 'A verified Tech Checker tests the device, checks the IMEI against the stolen list, and grades it A, B or C.' },
      { icon: 'lock', title: 'Money held till you\'re happy', text: 'The buyer\'s money is held. Meet or get delivery, test it, then give the seller your code. (Simulated in this demo.)' }
    ], force);
  }
  (async () => {
    shell();
    try { [CAT] = await Promise.all([SW.get('/api/catalog'), refreshMe()]); }
    catch (e) { SW.$('#main').innerHTML = `<div class="empty">${icon('alert')}<h3>Cannot reach Swavy Spare</h3><p>${esc(e.message)}</p><button class="btn btn-primary" data-reload>Try again</button></div>`; return; }
    SW.start(); onboard(false);
  })();
})(window.SW);
