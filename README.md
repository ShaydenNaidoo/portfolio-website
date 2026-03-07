# Go + React Portfolio (Auto GitHub Sync)

This repo now includes a production-ready portfolio stack:

- **Backend:** Go API (`/backend`)
- **Frontend:** React app (`/frontend`)
- **Data model:** editable sections for certifications, CV, work experience, and language badges
- **Project automation:** GitHub repos are fetched automatically and re-sorted with a pin system
- **TryHackMe integration:** backend endpoint that pulls profile stats

## Features implemented

1. **Auto-detect GitHub repos and updates**
   - Backend fetches `https://api.github.com/users/:username/repos` and refreshes project list.
   - Optional GitHub webhook endpoint (`/webhooks/github`) triggers refresh on `push/repository/create` events.

2. **Editable project descriptions/readme text**
   - Per-project overrides are stored in `backend/data/repo_overrides.json`.
   - UI includes editable fields for `description` and `readme` notes.

3. **Pin/reorder projects**
   - Every project can be pinned and given a `pinOrder`.
   - Pinned repos are always sorted first.

4. **Dedicated sections**
   - Certifications
   - CV link/download
   - Work experience
   - Languages (tag/badge style)
   - TryHackMe stats panel

5. **Admin-only Mission Control**
   - Persona-style daily mission/task tracker
   - Calendar view for due dates and upcoming tests/assignments
   - Academic module progress calculators seeded from study-guide assessment formulas
   - Persisted data in `backend/data/admin_mission_control.json`

## Quick start

### 1) Backend

```bash
cd backend
go run .
```

Environment variables:

- `GITHUB_USERNAME` (required for your real account)
- `GITHUB_TOKEN` (optional but recommended to avoid rate limits)
- `THM_USERNAME` (optional)
- `THM_SESSION` (optional cookie value if private stats require session auth)
- `THM_COOKIE` (optional full cookie header; preferred when syncing skills + completed room names)
- `ADMIN_USERNAME` (optional, default `shayden`)
- `ADMIN_PASSWORD_HASH` (required for secure admin login)
- `ADMIN_PASSWORD` (legacy plaintext fallback; avoid in production)
- `MONGODB_URI` (optional; enables MongoDB persistence for admin blog posts and mission tracker)
- `MONGODB_DATABASE` (optional; default `portfolio`)
- `PORT` (optional, default `8080`)

### 2) Frontend

```bash
cd frontend
npm install
VITE_API_BASE=http://localhost:8080 npm run dev
```

### 3) Local full stack with Docker

```bash
docker compose up --build
```

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8080`

## Configure content

Edit this file for your profile sections:

- `backend/data/site_data.json`

Project overrides are written automatically to:

- `backend/data/repo_overrides.json`

Mission and module progress data is written automatically to:

- `backend/data/admin_mission_control.json`

If `MONGODB_URI` is set, blog posts and mission data are persisted in MongoDB collections:

- `blog_posts`
- `missions`
- `module_progress`

## Manual AI project thumbnails

This repo supports manual per-project thumbnail imports.

1. Generate thumbnails using the Persona 5 themed prompts in:
   - `frontend/public/assets/project-art/PROMPTS.md`
2. Save generated files into:
   - `frontend/public/assets/project-art/`
3. Current mapped filenames:
   - `green-cart-p5r.png`
   - `cos301-computer-networks-p5r.png`
   - `portfolio-website-p5r.png`
   - `assemblywork-p5r.png`
4. If your project names differ, edit the `MANUAL_PROJECT_IMAGES` map in:
   - `frontend/src/main.jsx`

## Production deployment (fully online)

### Recommended: Render/Railway/Fly.io split deploy

1. Deploy backend as a web service from `backend/`.
2. Set backend environment variables above.
3. Deploy frontend as static site from `frontend/` with:
   - Build: `npm install && npm run build`
   - Publish dir: `dist`
   - Env var: `VITE_API_BASE=https://<your-backend-url>`
4. In GitHub repo settings, add webhook:
   - Payload URL: `https://<your-backend-url>/webhooks/github`
   - Events: push + repository + create

After this, your portfolio is online for employers and auto-updates from GitHub.

## Important security note

For production, protect admin endpoints (`/api/admin/*`) with auth (e.g., JWT/session + reverse proxy auth).
Current implementation is intentionally lightweight and should be hardened before public launch.
