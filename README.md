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
