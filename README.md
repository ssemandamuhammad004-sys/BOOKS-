# Client Activity Manager

A self-hosted app for tracking clients, activities, submission status, deadlines,
reminders and payments (amounts in UGX). This package includes:

- A Node.js + Express **backend** (`server.js`) that serves the app and a REST API
- A real **SQLite database** — a single file at `data/app.db`, created automatically
  on first run
- The **frontend** (`public/index.html`) — one self-contained page, no build step

There is no dependency on Claude, any cloud account, or any external service.
Everything runs from this folder.

---

## 1. Run it locally

Requirements: [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm start
```

Then open **http://localhost:3000** in your browser. On first run the database is
created and pre-loaded with a few sample clients and activities so you can see the
app working immediately; use **Settings → Clear all data** whenever you're ready
to start with your own.

The database lives at `data/app.db`. Back it up by copying that one file. It's a
standard SQLite database — you can open it directly with
[DB Browser for SQLite](https://sqlitebrowser.org/) or the `sqlite3` command line
tool to run your own queries or reports.

To use the app from another device on the same network (e.g. your phone), find
your computer's local IP address (e.g. `192.168.1.20`) and visit
`http://192.168.1.20:3000` from that device instead of `localhost`.

---

## 2. Run it with Docker (recommended for always-on hosting)

If you have [Docker](https://www.docker.com/) installed:

```bash
docker compose up -d --build
```

This builds the image, starts the server, and keeps `data/app.db` on your host
machine (in a `data/` folder next to this README) so your data survives restarts
and rebuilds. Open **http://localhost:3000**.

To stop it: `docker compose down` (your data stays in `data/`).

---

## 3. Deploy so it's reachable from anywhere

Pick whichever fits how you like to manage servers:

### Option A — a VPS (DigitalOcean, Linode, Hetzner, a home server, etc.)

1. Copy this whole folder to the server (e.g. `scp -r client-activity-manager user@your-server:~`).
2. Install Node.js 18+ on the server, or install Docker and use option above.
3. Without Docker:
   ```bash
   npm install --omit=dev
   npm install -g pm2        # keeps the app running and restarts it on crash/reboot
   pm2 start server.js --name activity-manager
   pm2 save
   pm2 startup               # follow the printed instructions to start pm2 on boot
   ```
4. Put a reverse proxy (nginx or Caddy) in front of port 3000 if you want a domain
   name and HTTPS. A minimal Caddy example (`Caddyfile`):
   ```
   yourdomain.com {
     reverse_proxy localhost:3000
   }
   ```
   Caddy handles HTTPS certificates automatically.

### Option B — Render.com / Railway.app (no server management)

Both platforms can build and run this repo directly:

1. Push this folder to a GitHub repository.
2. Create a new "Web Service" (Render) or project (Railway) from that repo.
3. Build command: `npm install`. Start command: `npm start`.
4. **Important:** SQLite needs a persistent disk, or your data will be wiped on
   every redeploy. On Render, add a "Disk" mounted at `/app/data` (or wherever
   your service's working directory is). On Railway, add a Volume mounted at
   `/app/data`.
5. Once deployed, the platform gives you a public URL — that's your app.

### Option C — any platform that runs a Dockerfile

The included `Dockerfile` works as-is on Fly.io, Railway, Render, a VPS, or any
Docker host. Just remember to attach a persistent volume at `/app/data` — without
one, your database resets whenever the container restarts.

---

## How the pieces fit together

```
client-activity-manager/
├── server.js          Express server + REST API + SQLite schema & queries
├── package.json       Dependencies (express, better-sqlite3)
├── public/
│   └── index.html     The whole frontend — dashboard, clients, activities,
│                       calendar, payments, reminders, reports, settings
├── data/               Created automatically — contains app.db (your database)
├── Dockerfile          For container-based hosting
├── docker-compose.yml  One-command local Docker hosting with a persistent volume
```

The frontend talks to the backend over a small REST API:

| Method | Path                    | Purpose                                   |
|--------|--------------------------|--------------------------------------------|
| GET    | `/api/all`               | Load everything (clients, activities, payments) |
| GET/POST | `/api/clients`         | List / create clients |
| PUT/DELETE | `/api/clients/:id`   | Update / delete a client (cascades to their activities & payments) |
| GET/POST | `/api/activities`      | List / create activities |
| PUT/PATCH/DELETE | `/api/activities/:id` | Replace / partially update / delete an activity |
| GET/POST | `/api/payments`        | List / record payments |
| POST   | `/api/reset-sample`     | Wipe everything and reload the sample data |
| POST   | `/api/clear`             | Wipe everything |

Open tabs and devices stay in sync automatically — the frontend polls
`/api/all` every 15 seconds and refreshes immediately after every change you
make.

---

## Extending it

- **Switch to Postgres/MySQL later:** the SQL in `server.js` is plain and
  centralized — the schema and queries near the top are the only things you'd
  need to adapt; the REST API and frontend don't change.
- **Add authentication:** this build assumes trusted, private use (you, on your
  own server). If you'll expose it on the public internet, put it behind a
  login — either a reverse-proxy auth layer (e.g. Caddy's `basicauth`, or
  Cloudflare Access) or add your own login route in `server.js`.
- **Multi-currency:** amounts are labeled UGX throughout the frontend; search
  `index.html` for `UGX` to change the currency label and formatting.
