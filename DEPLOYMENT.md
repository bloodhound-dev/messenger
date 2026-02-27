# Deploy SecureMessenger Web to Vercel

This repository includes a static web app in `web/` and a root-level `vercel.json` already configured for Vercel routing/security headers.

## Option A: Vercel Dashboard (recommended)

1. Push this repository to GitHub/GitLab/Bitbucket.
2. In Vercel, click **Add New Project**.
3. Import this repository.
4. Configure:
   - **Framework Preset**: `Other`
   - **Root Directory**: `.` (repo root)
   - **Build Command**: *(leave empty)*
   - **Output Directory**: *(leave empty)*
5. Click **Deploy**.

Vercel will serve:
- `/` -> `web/index.html`
- `/app.js` -> `web/app.js`
- `/styles.css` -> `web/styles.css`

## Option B: Vercel CLI

Prerequisites:
- Node.js installed
- Vercel account

```bash
npm i -g vercel
vercel login
vercel
```

For production deployment:

```bash
vercel --prod
```

## Post-deploy validation

After deployment, verify:

1. Login page loads at the Vercel domain.
2. OTP MFA flow works locally in browser storage.
3. Chats tab can send/decrypt messages.
4. Dashboard metrics and map render.
5. Response headers include CSP + security headers from `vercel.json`.

## Notes

- This web app is local-storage based (no backend persistence).
- Data is scoped per browser/device profile.
- For real production multi-user deployment, add a backend, identity provider, and audited E2E protocol/session design.


## Troubleshooting: `404: NOT_FOUND` on Vercel

If you see `404: NOT_FOUND` on the deployed URL:

1. Confirm the latest commit is deployed (trigger **Redeploy** in Vercel).
2. In project settings, set **Root Directory** to repository root (`.`).
3. Ensure `index.html` exists at repository root (this repo includes a redirector).
4. Ensure `web/index.html`, `web/app.js`, and `web/styles.css` are present in the deployment output.
5. If you previously set a different Root Directory, change it back to `.` and redeploy.

You can test expected routes after deploy:
- `/` (should redirect to `/web/index.html`)
- `/web/index.html`
- `/web/app.js`
- `/web/styles.css`
