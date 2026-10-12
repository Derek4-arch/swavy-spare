-- Swavy Spare database (SQLite). Created automatically on first run.
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('user','checker')),   -- 'user' can buy and sell
  name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT NOT NULL,
  city TEXT, area TEXT,
  pass_salt TEXT NOT NULL, pass_hash TEXT NOT NULL,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  is_admin INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS checkers (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  areas TEXT NOT NULL DEFAULT '[]',
  verified INTEGER NOT NULL DEFAULT 0,
  bio TEXT NOT NULL DEFAULT ''
);
-- Base price table for the estimator: SAMPLE prices for a good used device (edit freely).
CREATE TABLE IF NOT EXISTS models (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,             -- phone, laptop, tablet, console, audio, watch
  brand TEXT NOT NULL, name TEXT NOT NULL,
  base_price INTEGER NOT NULL,
  popular INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  seller_id INTEGER NOT NULL REFERENCES users(id),
  model_id INTEGER REFERENCES models(id),
  type TEXT NOT NULL, brand TEXT NOT NULL, title TEXT NOT NULL,
  storage TEXT NOT NULL DEFAULT '',
  answers TEXT NOT NULL DEFAULT '{}',   -- seller's condition answers (JSON)
  imei TEXT NOT NULL DEFAULT '',        -- IMEI (phones/tablets) or serial number
  est_low INTEGER NOT NULL, est_high INTEGER NOT NULL,
  price INTEGER NOT NULL,
  photos TEXT NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL, area TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('live','reserved','sold','blocked','removed')),
  grade TEXT,                           -- A, B or C after a Swavy Check
  checked_at INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS listings_imei ON listings(imei);
-- Swavy Checker visits: checklist results and grade.
CREATE TABLE IF NOT EXISTS checks (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  checker_id INTEGER NOT NULL REFERENCES users(id),
  slot TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('booked','done','failed','cancelled')),
  fee INTEGER NOT NULL,
  results TEXT NOT NULL DEFAULT '{}',
  imei_status TEXT,                     -- clear / reported
  grade TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL, done_at INTEGER
);
-- LOCAL DEMO list of reported-stolen IMEIs / serials. NOT a real national database.
CREATE TABLE IF NOT EXISTS reported_imeis (
  imei TEXT PRIMARY KEY,
  device TEXT NOT NULL DEFAULT '',
  what TEXT NOT NULL DEFAULT '',
  police_ref TEXT NOT NULL DEFAULT '',
  reported_by INTEGER,
  created_at INTEGER NOT NULL
);
-- Attempts to list a reported device (shown to admin).
CREATE TABLE IF NOT EXISTS blocked_attempts (
  id INTEGER PRIMARY KEY, imei TEXT NOT NULL, user_id INTEGER, title TEXT, at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','declined','used')),
  created_at INTEGER NOT NULL
);
-- Orders with a SIMULATED escrow status. No real money moves.
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  buyer_id INTEGER NOT NULL REFERENCES users(id),
  seller_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL, delivery_fee INTEGER NOT NULL DEFAULT 0,
  method TEXT NOT NULL CHECK (method IN ('meet','deliver')),
  meet_spot TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('held','handover','released','refunded')),
  code TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, released_at INTEGER
);
CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, text TEXT NOT NULL, at INTEGER NOT NULL
);
