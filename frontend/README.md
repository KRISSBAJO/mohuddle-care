# Mohuddle frontend on Vercel

This project serves the public Mohuddle pages. Its build copies shared components and assets
from the repository's `src/` and `public/` directories; do not edit generated `frontend/src/`
or `frontend/public/` files. It needs no database, session, storage or email secrets.

Set `BACKEND_ORIGIN` to the Render HTTPS origin. Portal, sign-in, API and document paths are
proxied there, including Render's own JavaScript assets. Portal assets use the `/portal-assets` prefix; frontend assets use the standard `/_next` paths.
Cookies stay on the public frontend host. Render's `APP_URL` must match that public origin.

In Vercel, choose root directory `frontend`, allow source files outside that root, use Node 22,
install with `npm ci` and build with `npm run build`. See `../docs/deployment.md` for the backend
configuration and initial-owner setup.

Production uses `https://mohuddle.com`; `www.mohuddle.com` redirects to that address.
