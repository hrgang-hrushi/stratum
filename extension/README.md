Stratum Chrome extension — developer notes

Overview
--------
This folder contains a minimal Chrome extension wrapper that injects the Stratum UI as a sidebar iframe into web pages. The extension expects the built frontend files (Vite output in `dist/`) to be copied into this folder so extension assets (index.html, assets/*) are packaged.

Quick workflow
--------------
1. Build the frontend (from project root):

   npm run build

   This produces the `dist/` directory containing `index.html` and static assets.

2. Copy the build output into the extension folder (one-time or automated):

   cp -R dist/* extension/

3. Load the extension into Chrome:
   - Open chrome://extensions
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `extension/` folder in the repo

4. Open a target website (or any page) and press the "Stratum" floating button that the content script injects. The sidebar iframe will load the bundled UI (index.html).

Notes & next steps
------------------
- Right now the content script matches all pages ("<all_urls>"). For production, narrow `manifest.json` matches to the college application domains you target (e.g., https://www.commonapp.org/*).
- If you want to communicate between the injected iframe and the content script/page (for copying fields into forms, etc.), we should add a small postMessage bridge and origin-checking for security.
- To integrate with the backend server, the UI can call the server at http://localhost:4000 (if running) — consider switching to a hosted API or implement an auth flow for production.
