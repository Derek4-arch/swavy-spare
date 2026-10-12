# Swavy Spare

Buy and sell preloved phones, laptops and gadgets in Lagos and Abuja, **safely**.

> Everything in the demo database (people, devices, prices, IMEIs) is **SAMPLE data**.
> **Payments are simulated.** "Money held" and "Money released" are only status labels. No real money moves.
> Real escrow would need a licensed provider such as Paystack or Flutterwave.
> The **reported-stolen IMEI list is a local demo list** stored in this app's own database. It is **not** connected to any real national, police or network database.

## How to run it

**Windows:** double-click `start.bat`. Your browser opens by itself at http://localhost:3001 (or the next free port if 3001 is busy). Keep the black window open while you use the app.

You need **Node.js 24** (free from https://nodejs.org). Nothing else to install: no `npm install`.

**Any computer (terminal):**

```
npm start          # starts the app at http://localhost:3001
npm test           # runs the automatic API tests on a temporary database
npm run db         # shows what is inside the database
```

Swavy Fix uses port 3000 and Swavy Spare uses 3001, so both can run at the same time.
To use it from your phone on the same Wi-Fi: make a `.env` file (copy `.env.example`), set `HOST=0.0.0.0` and restart.

## Demo logins (password for all: `swavy123`)

| Who | Email | What to try |
|---|---|---|
| Buyer (Lekki) | `buyer@swavy.ng` | Has an offer waiting on an iPhone 12 |
| Seller (Ikeja) | `seller@swavy.ng` | Has listings, an offer to answer, a past sale and a check booked |
| Tech Checker (Lagos) | `checker@swavy.ng` | Has a booked check to do |
| Tech Checker (Abuja) | `checker2@swavy.ng` | |

**Admin page:** open `http://localhost:3001/#/admin`. Default password **`swavyadmin`**. Change it with `ADMIN_PASSWORD=...` in `.env`.

**Try the stolen block:** when selling a phone, enter IMEI `356938035643809`. It is on the demo stolen list, so the listing is blocked.
A clean test IMEI you can use: `490154203237518`.

## How it works

1. **Sell in 3 steps:** pick the device type and model (popular iPhones, Samsung, Tecno, Infinix, Redmi, HP, Dell, Lenovo, MacBook, PS5, AirPods and more) → answer big Yes/No condition questions (cracked screen? battery? Face ID/fingerprint? repairs? scratches? box?) → add photos, IMEI and price. You get an **instant suggested price range** as you answer.
   The estimate is simple: a sample base price for the model × storage × condition factors (for example cracked screen −30%, weak battery −22%). It is labelled as an estimate.
2. **Swavy Checker:** the seller books a verified Tech Checker. The checker runs the IMEI against the reported-stolen list, then marks Pass/Fail for screen, cameras/Face ID, charging, buttons/speakers, iCloud/Google lock and water damage, and enters battery health. The app works out the grade:
   - **A**: everything passes and battery is 85% or more
   - **B**: one minor fail, or battery 75–84%
   - **C**: anything else (for example water damage)
   - **Failed**: account lock still on, or the IMEI is reported stolen (the listing gets blocked)
   Checked listings show a **Swavy Checked** badge and the full report. Checkers earn a fee per check (₦2,000–₦5,000 sample fees) shown on their dashboard.
3. **Buy safely:** Order → **Money held** (simulated) → meet at a safe public place or get delivery → the buyer tests the device and gives the seller a 4-digit code → **Money released**. Buyers can also release the money themselves, or cancel for a refund before release.
4. **Offers:** buyers can make an offer. If the seller accepts, the buyer can buy at that price.
5. **Safety page:** anyone can check an IMEI. Logged-in users can **report a stolen device**: the IMEI goes on the list and any live listing with it is blocked straight away.
6. **Dashboards:** sellers see listings, offers and sales; checkers see booked checks, the checklist and earnings; the admin verifies checkers, manages the reported list, sees blocked listing attempts and can remove listings.

Also: filters (type, brand, budget slider, grade, area), light and dark mode, a 3-slide "How it works" intro, phone-first layout, installable as an app (PWA), WhatsApp share buttons with the message already typed.

## Look inside the database

The database is one file: `data/swavy-spare.db` (created on first run).

- `npm run db` lists every table and how many rows it has.
- `npm run db -- listings` shows the latest listings. Try `checks`, `orders`, `offers`, `reported_imeis`, `models` (the sample price table).
- You can also open the file with the free "DB Browser for SQLite".

To start fresh, close the app and delete the `data` folder.

## Files

- `public/index.html` main page, `public/css/` styles, `public/js/` app code, `public/sw.js` offline/install support
- `server/` the web server (Node.js built-ins only: http, sqlite, crypto), `server/schema.sql` the tables, `server/seed.js` the sample data
- `tests/api-test.js` automatic tests
