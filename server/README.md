Server (Express + TypeScript + Prisma)

Quick start:

1. cd server
2. npm install
3. npx prisma migrate dev --name init
4. npm run dev

The server will run on http://localhost:4000 by default. API endpoints:
- GET /api/health
- GET /api/schools
- POST /api/schools
- DELETE /api/schools/:id
Additional developer endpoints (placeholders):
- POST /api/search-schools  -> accepts { query } and forwards to your configured school-search provider. Requires SCHOOL_SEARCH_API_KEY in the server env.
- POST /api/stratum-agent  -> accepts { prompt } and forwards to your configured agent/LLM provider. Requires STRATUM_AGENT_API_KEY in the server env.

Notes on providers

- College Scorecard: If you have a `SCORECARD_API_KEY` (data.gov key) the server will use the College Scorecard API for school lookups when requested. Otherwise the server will fall back to Google Places when `SCHOOL_SEARCH_API_KEY` is set (Google key).

- Google Places: Provide `SCHOOL_SEARCH_API_KEY` (Google API key) to enable Places Text Search as a fallback/enrichment provider.

- Hugging Face Inference (recommended free-ish option): Set `STRATUM_AGENT_API_KEY` to your Hugging Face token (starts with `hf_`) and optionally set `STRATUM_AGENT_MODEL` to the model id you want (default `gpt2`). The server will forward prompts to the Hugging Face Inference API.

Security note: Keep keys in `server/.env` and never commit them. The server proxies calls to external providers so the frontend does not see raw keys.

Environment
- Copy `server/.env.example` -> `server/.env` and set the API keys:
	- SCHOOL_SEARCH_API_KEY=...
	- STRATUM_AGENT_API_KEY=...

Security note: Keep those keys on the server (in `.env`) and do not expose them to the frontend. The server endpoints above act as a proxy so the frontend never sees raw keys.
