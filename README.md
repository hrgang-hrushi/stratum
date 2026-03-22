# Stratum

Stratum is a small dashboard and Chrome extension to help students manage college applications. It includes:

- A React + Vite frontend (src/) with a dashboard, library, and agent UI.
- A TypeScript Express backend (server/) with a small dataset and endpoints for searching and agent proxying.
- An extension wrapper in `extension/` that can load the built frontend into an iframe on arbitrary pages.

Quick start

1. Install dependencies:

   npm install
   cd server && npm install

2. Run backend (from project root):

   cd server
   npm run dev

3. Run frontend (from project root):

   npm run dev

4. Build & load extension:

   npm run build
   cp -R dist/* extension/

   Then load `extension/` as an unpacked extension in chrome://extensions

Notes

- The repo contains a curated local colleges dataset (server/data/colleges.json) used as a fallback for demos.
- To enable Google or Hugging Face providers, set the corresponding API keys in `server/.env`.
