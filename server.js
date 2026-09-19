/**
 * Client Activity Manager — backend server
 *
 * A small Express server that serves the frontend (public/) and a REST API
 * backed by a real SQLite database file (data/app.db). Everything lives in
 * this one process; no external services required.
 *
 * Run:   npm install && npm start
 * Then:  open http://localhost:3000
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'app.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

/* ---------------------------------------------------------
   Schema
--------------------------------------------------------- */
db.exec(`
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  institution TEXT,
  notes TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  activity_name TEXT NOT NULL,
  description TEXT,
  activity_date TEXT,
  start_time TEXT,
  end_time TEXT,
  deadline TEXT,
  amount REAL DEFAULT 0,
  amount_paid REAL DEFAULT 0,
  submission_status TEXT,
  reminder_settings TEXT,
  notes TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL,
  amount REAL,
  payment_date TEXT,
  payment_method TEXT,
  notes TEXT
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE INDEX IF NOT EXISTS idx_activities_client ON activities(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_activity ON payments(activity_id);
`);

function getMeta(key) {
  const row = db.prepare('SELECT value FROM meta WHERE key=?').get(key);
  return row ? row.value : null;
}
function setMeta(key, value) {
  db.prepare(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`
  ).run(key, value);
}

function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/* ---------------------------------------------------------
   Seed data (used only the very first time the database is
   created — never re-applied automatically after that, even
   if the tables are later emptied via "Clear all data").
--------------------------------------------------------- */
const insClient = db.prepare(
  `INSERT INTO clients (id,name,phone,email,institution,notes,created_at)
   VALUES (@id,@name,@phone,@email,@institution,@notes,@created_at)`
);
const insertActivitySQL = `
  INSERT INTO activities
    (id,client_id,activity_name,description,activity_date,start_time,end_time,deadline,amount,amount_paid,submission_status,reminder_settings,notes,created_at)
  VALUES
    (@id,@client_id,@activity_name,@description,@activity_date,@start_time,@end_time,@deadline,@amount,@amount_paid,@submission_status,@reminder_settings,@notes,@created_at)`;
const upsertActivitySQL = insertActivitySQL + `
  ON CONFLICT(id) DO UPDATE SET
    client_id=excluded.client_id, activity_name=excluded.activity_name, description=excluded.description,
    activity_date=excluded.activity_date, start_time=excluded.start_time, end_time=excluded.end_time,
    deadline=excluded.deadline, amount=excluded.amount, amount_paid=excluded.amount_paid,
    submission_status=excluded.submission_status, reminder_settings=excluded.reminder_settings,
    notes=excluded.notes, created_at=excluded.created_at`;
const insActivity = db.prepare(insertActivitySQL);
const upsActivity = db.prepare(upsertActivitySQL);
const insPayment = db.prepare(
  `INSERT INTO payments (id,activity_id,amount,payment_date,payment_method,notes)
   VALUES (@id,@activity_id,@amount,@payment_date,@payment_method,@notes)`
);

function sampleData() {
  const t0 = todayStr();
  const clients = [
    { id: 'c1', name: 'Kembabazi Edith', phone: '0772 445 981', email: 'edith.k@gmail.com', institution: 'Makerere University', notes: 'Prefers evening reminders.', created_at: todayStr(-40) },
    { id: 'c2', name: 'John Mukasa', phone: '0701 223 890', email: '', institution: 'Kyambogo University', notes: '', created_at: todayStr(-30) },
    { id: 'c3', name: 'Grace Nabirye', phone: '0754 667 210', email: 'grace.n@yahoo.com', institution: '', notes: 'Referred by John Mukasa.', created_at: todayStr(-18) },
    { id: 'c4', name: 'Peter Okello', phone: '0788 902 345', email: '', institution: 'Uganda Christian University', notes: '', created_at: todayStr(-9) },
  ];
  const activities = [
    { id: 'a1', client_id: 'c1', activity_name: 'Scientific Writing Coursework', description: 'Draft and edit a scientific report for coursework submission.', activity_date: t0, start_time: '09:00', end_time: '16:00', deadline: t0 + 'T16:00', amount: 30000, amount_paid: 30000, submission_status: 'Not Started', reminder_settings: ['3_hours_before', 'at_deadline'], notes: '', created_at: todayStr(-5) },
    { id: 'a2', client_id: 'c2', activity_name: 'Research Coursework', description: 'Literature review and methodology chapter.', activity_date: t0, start_time: '08:00', end_time: '15:00', deadline: t0 + 'T15:00', amount: 40000, amount_paid: 20000, submission_status: 'Submitted', reminder_settings: ['1_day_before'], notes: '', created_at: todayStr(-6) },
    { id: 'a3', client_id: 'c3', activity_name: 'Statistics Assignment', description: 'SPSS analysis and writeup.', activity_date: todayStr(1), start_time: '10:00', end_time: '13:00', deadline: todayStr(1) + 'T13:00', amount: 25000, amount_paid: 0, submission_status: 'Not Started', reminder_settings: ['1_day_before', '3_hours_before'], notes: '', created_at: todayStr(-3) },
    { id: 'a4', client_id: 'c4', activity_name: 'Business Plan Review', description: 'Review and refine business plan draft.', activity_date: todayStr(-2), start_time: '09:00', end_time: '12:00', deadline: todayStr(-2) + 'T12:00', amount: 60000, amount_paid: 60000, submission_status: 'Submitted', reminder_settings: [], notes: 'Client happy with turnaround.', created_at: todayStr(-9) },
    { id: 'a5', client_id: 'c1', activity_name: 'Literature Review Editing', description: 'Edit literature review chapter for grammar and flow.', activity_date: todayStr(-1), start_time: '14:00', end_time: '17:00', deadline: todayStr(-1) + 'T17:00', amount: 35000, amount_paid: 15000, submission_status: 'In Progress', reminder_settings: ['after_deadline'], notes: '', created_at: todayStr(-4) },
    { id: 'a6', client_id: 'c2', activity_name: 'Presentation Slides', description: 'Design slides for defense presentation.', activity_date: todayStr(3), start_time: '11:00', end_time: '12:30', deadline: todayStr(3) + 'T12:30', amount: 20000, amount_paid: 0, submission_status: 'Not Started', reminder_settings: ['1_day_before'], notes: '', created_at: todayStr(-1) },
    { id: 'a7', client_id: 'c4', activity_name: 'Proposal Formatting', description: 'Format proposal to institutional guidelines.', activity_date: todayStr(-6), start_time: '08:30', end_time: '10:30', deadline: todayStr(-6) + 'T10:30', amount: 15000, amount_paid: 15000, submission_status: 'Late Submission', reminder_settings: [], notes: '', created_at: todayStr(-10) },
  ];
  const payments = [
    { id: 'p1', activity_id: 'a1', amount: 30000, payment_date: todayStr(-4), payment_method: 'Mobile Money', notes: 'Paid in full up front' },
    { id: 'p2', activity_id: 'a2', amount: 20000, payment_date: todayStr(-5), payment_method: 'Cash', notes: 'Deposit' },
    { id: 'p3', activity_id: 'a4', amount: 60000, payment_date: todayStr(-9), payment_method: 'Bank Transfer', notes: '' },
    { id: 'p4', activity_id: 'a5', amount: 15000, payment_date: todayStr(-4), payment_method: 'Mobile Money', notes: 'Deposit' },
    { id: 'p5', activity_id: 'a7', amount: 15000, payment_date: todayStr(-10), payment_method: 'Cash', notes: '' },
  ];
  return { clients, activities, payments };
}

function insertSeed() {
  const { clients, activities, payments } = sampleData();
  const tx = db.transaction(() => {
    clients.forEach((c) => insClient.run(c));
    activities.forEach((a) => insActivity.run({ ...a, reminder_settings: JSON.stringify(a.reminder_settings || []) }));
    payments.forEach((p) => insPayment.run(p));
  });
  tx();
}

function wipeAll() {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM payments').run();
    db.prepare('DELETE FROM activities').run();
    db.prepare('DELETE FROM clients').run();
  });
  tx();
}

// Seed only on a genuinely fresh database — never again automatically,
// so "Clear all data" in Settings is never silently undone.
(function seedIfFresh() {
  const already = getMeta('seeded');
  const count = db.prepare('SELECT COUNT(*) c FROM clients').get().c;
  if (!already && count === 0) {
    insertSeed();
    setMeta('seeded', '1');
    console.log('Seeded sample data on first run.');
  }
})();

function rowToActivity(row) {
  let reminders = [];
  try { reminders = row.reminder_settings ? JSON.parse(row.reminder_settings) : []; } catch (e) { reminders = []; }
  return { ...row, reminder_settings: reminders };
}
function activityRow(id, a) {
  return {
    id,
    client_id: a.client_id || '',
    activity_name: a.activity_name || '',
    description: a.description || '',
    activity_date: a.activity_date || '',
    start_time: a.start_time || '',
    end_time: a.end_time || '',
    deadline: a.deadline || null,
    amount: Number(a.amount) || 0,
    amount_paid: Number(a.amount_paid) || 0,
    submission_status: a.submission_status || 'Not Started',
    reminder_settings: JSON.stringify(a.reminder_settings || []),
    notes: a.notes || '',
    created_at: a.created_at || todayStr(),
  };
}

/* ---------------------------------------------------------
   App
--------------------------------------------------------- */
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Combined read (fast initial load) ----
app.get('/api/all', (req, res) => {
  const clients = db.prepare('SELECT * FROM clients ORDER BY name').all();
  const activities = db.prepare('SELECT * FROM activities').all().map(rowToActivity);
  const payments = db.prepare('SELECT * FROM payments').all();
  res.json({ clients, activities, payments });
});

// ---- Clients ----
app.get('/api/clients', (req, res) => {
  res.json(db.prepare('SELECT * FROM clients ORDER BY name').all());
});
app.post('/api/clients', (req, res) => {
  try {
    const id = crypto.randomUUID();
    const c = req.body || {};
    if (!c.name || !c.phone) return res.status(400).json({ error: 'name and phone are required' });
    insClient.run({ id, name: c.name, phone: c.phone, email: c.email || '', institution: c.institution || '', notes: c.notes || '', created_at: c.created_at || todayStr() });
    res.json({ id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/clients/:id', (req, res) => {
  try {
    const id = req.params.id;
    const c = req.body || {};
    db.prepare(
      `INSERT INTO clients (id,name,phone,email,institution,notes,created_at) VALUES (@id,@name,@phone,@email,@institution,@notes,@created_at)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, phone=excluded.phone, email=excluded.email, institution=excluded.institution, notes=excluded.notes, created_at=excluded.created_at`
    ).run({ id, name: c.name || '', phone: c.phone || '', email: c.email || '', institution: c.institution || '', notes: c.notes || '', created_at: c.created_at || todayStr() });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/clients/:id', (req, res) => {
  try {
    const id = req.params.id;
    const tx = db.transaction(() => {
      const acts = db.prepare('SELECT id FROM activities WHERE client_id=?').all(id);
      acts.forEach((a) => db.prepare('DELETE FROM payments WHERE activity_id=?').run(a.id));
      db.prepare('DELETE FROM activities WHERE client_id=?').run(id);
      db.prepare('DELETE FROM clients WHERE id=?').run(id);
    });
    tx();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/clients', (req, res) => {
  try { db.prepare('DELETE FROM clients').run(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- Activities ----
app.get('/api/activities', (req, res) => {
  res.json(db.prepare('SELECT * FROM activities').all().map(rowToActivity));
});
app.post('/api/activities', (req, res) => {
  try {
    const id = crypto.randomUUID();
    const a = req.body || {};
    if (!a.client_id || !a.activity_name) return res.status(400).json({ error: 'client_id and activity_name are required' });
    insActivity.run(activityRow(id, a));
    res.json({ id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/activities/:id', (req, res) => {
  try { upsActivity.run(activityRow(req.params.id, req.body || {})); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.patch('/api/activities/:id', (req, res) => {
  try {
    const id = req.params.id;
    const existing = db.prepare('SELECT * FROM activities WHERE id=?').get(id);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    const merged = { ...rowToActivity(existing), ...(req.body || {}) };
    upsActivity.run(activityRow(id, merged));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/activities/:id', (req, res) => {
  try {
    const id = req.params.id;
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM payments WHERE activity_id=?').run(id);
      db.prepare('DELETE FROM activities WHERE id=?').run(id);
    });
    tx();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/activities', (req, res) => {
  try { db.prepare('DELETE FROM activities').run(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- Payments ----
app.get('/api/payments', (req, res) => {
  res.json(db.prepare('SELECT * FROM payments').all());
});
app.post('/api/payments', (req, res) => {
  try {
    const id = crypto.randomUUID();
    const p = req.body || {};
    if (!p.activity_id || !p.amount) return res.status(400).json({ error: 'activity_id and amount are required' });
    insPayment.run({ id, activity_id: p.activity_id, amount: Number(p.amount) || 0, payment_date: p.payment_date || todayStr(), payment_method: p.payment_method || '', notes: p.notes || '' });
    res.json({ id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/payments/:id', (req, res) => {
  try { db.prepare('DELETE FROM payments WHERE id=?').run(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/payments', (req, res) => {
  try { db.prepare('DELETE FROM payments').run(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- Data management (Settings page) ----
app.post('/api/reset-sample', (req, res) => {
  try { wipeAll(); insertSeed(); setMeta('seeded', '1'); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/clear', (req, res) => {
  try { wipeAll(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.listen(PORT, HOST, () => {
  console.log(`Client Activity Manager running at http://localhost:${PORT}`);
  console.log(`Database file: ${DB_PATH}`);
});
