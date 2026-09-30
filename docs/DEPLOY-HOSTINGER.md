# Deploying NEXORA Ops on Hostinger at `ops.nexoraaagency.com`

The system runs as a **Node.js web app** on NEXORA's existing Hostinger Business plan, on a **subdomain** of the
domain you already own. The main website `nexoraaagency.com` is a separate app and is **not touched**.

> Nothing in this file has been done yet — it's the exact plan, so anyone (or any AI tool) can do it the same way.

## What you need

- hPanel access to the Hostinger account that owns `nexoraaagency.com`.
- The GitHub repo `Nagy-API/Nexora_System` (private).
- 10 minutes.

## One-time setup

1. **Connect GitHub to Hostinger** (once): hPanel → **Websites → Add website → Node.js Web App → Import Git repository**
   → sign in with GitHub → allow access to `Nagy-API/Nexora_System`.
2. **Domain**: when asked for the domain, use the subdomain **`ops.nexoraaagency.com`** (your own domain — nothing to buy).
   If hPanel asks to create the subdomain first: **Domains → Subdomains → create `ops`**.
3. **Build settings**

   | Setting | Value |
   | --- | --- |
   | Framework / app type | Next.js |
   | Node.js version | 22 |
   | Repository / branch | `Nagy-API/Nexora_System` / `main` |
   | Root directory | `.` (repository root) |
   | Package manager | npm |
   | Build command | `npm run build` |
   | Start command | `npm start` (runs `scripts/production.mjs`: migrate → first-time seed → server) |
   | Install | `npm install` (default) |
   | Output directory | `.next` |

4. **Environment variables** (hPanel → the app → Environment variables). Only **one** is required:

   | Name | Value | Why |
   | --- | --- | --- |
   | `SEED_DEFAULT_PASSWORD` | a long, private, hard-to-guess temporary password (12+ chars, letters + numbers + symbols; not a variation of the company name/year) | first password for every account — each person must change it at first sign-in |

   Notes:
   - **Do not set `NODE_ENV`.** Next.js sets it itself (`production` for build and start). Setting it during the build makes npm skip
     dev tools and can break installs on some hosts (we made the build tools regular dependencies so it works either way).
   - **`DATABASE_URL` is optional.** Leave it unset: in production the app stores its built-in database in `~/nexora-ops-data`
     (your hosting account's home folder — outside the app folder, so redeploys never touch it). Only set it to use a PostgreSQL
     server (`postgres://…`) or another absolute folder (`file:/home/<user>/some-folder`). Never leave a placeholder like `YOURUSER` in it.
   - `PORT` is set by Hostinger automatically.
   - Never put these in the repository.
5. **Deploy** → watch the build log → open `https://ops.nexoraaagency.com`.
6. **SSL**: Hostinger issues a free certificate for the subdomain; make sure it shows as active (the app sends HSTS, so
   browsers will then always use HTTPS).
7. **First sign-in**: share the temporary password privately; everyone picks their own at first sign-in.

## Every update after that

Merge to `main` on GitHub → Hostinger rebuilds and restarts automatically (auto-deploy). The database folder is outside
the app, so data survives every deploy. Migrations run by themselves on start.

## Moving your current local data to the server (optional)

1. On the computer where you use it now: sign in as an admin → **My account → Download a backup** (`.tar.gz`).
2. On the server (hPanel → SSH access), with the app **stopped**:
   `node scripts/restore.mjs ~/ops-backup-XXXX.tar.gz /home/<user>/nexora-ops-data`
   (the target folder must not exist yet — rename any old one first). Start the app again.

## Backups

- In the app: an admin downloads a full backup from **My account** (weekly is a good habit; store it privately).
- Hostinger also keeps its own account backups (hPanel → Backups).
- Restore: stop the app → `node scripts/restore.mjs <file> <folder>` → start.

## If something goes wrong

- Build failed → hPanel build logs. Reproduce locally with the same conditions: `NODE_ENV=production npm ci && npm run build`.
  (A past failure — Turbopack crashing on `globals.css` — was caused by build tools not being installed; they are now regular dependencies.)
- App starts but shows an error → runtime logs; most often a missing/incorrect `DATABASE_URL`.
- Roll back → redeploy the previous commit from hPanel (or revert the merge on GitHub).

## For an AI tool with the Hostinger API (connector)

The same steps map to these operations (run them only with the owner's explicit OK — they change the live account):
`hosting_websites_list` (find the account username), `hosting_git_list-installations` (GitHub must be connected once in
hPanel first), creating the Node.js website for `ops.nexoraaagency.com`, `hosting_nodejs_update-build-settings`
(node 22, app type `next`, build script `build`, output `.next`), setting environment variables, and
`hosting_nodejs_start-build` with `source_type: git`, then polling `hosting_nodejs_build` / `hosting_nodejs_build-logs`.
