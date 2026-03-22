import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;


app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5175' }));
app.use(express.json());

// Load local colleges dataset for offline/local search fallback
let localColleges: any[] = [];
const FORCE_LOCAL_AGENT = process.env.FORCE_LOCAL_AGENT === '1';
try {
  const p = path.join(__dirname, '..', 'data', 'colleges.json');
  const raw = fs.readFileSync(p, 'utf-8');
  localColleges = JSON.parse(raw);
  console.log(`Loaded ${localColleges.length} local colleges from ${p}`);
} catch (err) {
  console.warn('No local colleges dataset found or failed to parse:', err && (err as any).message ? (err as any).message : err);
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Debug endpoint: directly fetch Google Places raw response (dev only)
app.post('/api/debug-google', async (req: Request, res: Response) => {
  const q = req.body && req.body.query ? String(req.body.query) : '';
  const googleKey = process.env.SCHOOL_SEARCH_API_KEY;
  if (!googleKey) return res.status(400).json({ error: 'No SCHOOL_SEARCH_API_KEY configured' });
  try {
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&key=${googleKey}&type=university`;
    const r = await fetch(url);
    const text = await r.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (e) { parsed = { raw: text }; }
    return res.json({ ok: r.ok, status: r.status, body: parsed });
  } catch (err) {
    console.error('debug-google error', err);
    return res.status(500).json({ error: 'Failed to fetch Google Places', detail: String(err) });
  }
});

// Proxy endpoint for school search (uses SCHOOL_SEARCH_API_KEY)
// This endpoint expects { query: string } in the POST body and will
// forward to your external school-search provider. For now it validates
// that the API key exists and returns a placeholder response. Implement
// the actual provider call when you have the provider details.
app.post('/api/search-schools', async (req: Request, res: Response) => {
  const q = req.body && req.body.query ? String(req.body.query) : '';
  const provider = req.body && req.body.provider ? String(req.body.provider) : 'auto';
  console.log('search-schools request', { q, provider });

  // Prefer College Scorecard if configured (SCORECARD_API_KEY), otherwise
  // fallback to Google Places when the provided key looks like a Google API key.
  const scorecardKey = process.env.SCORECARD_API_KEY;
  const googleKey = process.env.SCHOOL_SEARCH_API_KEY;

  try {
    if ((provider === 'scorecard' || provider === 'auto') && scorecardKey) {
      // College Scorecard API
      const url = `https://api.data.gov/ed/collegescorecard/v1/schools.json?school.name=${encodeURIComponent(q)}&per_page=10&api_key=${scorecardKey}`;
      const r = await fetch(url);
      if (!r.ok) return res.status(502).json({ error: 'Scorecard lookup failed' });
      const data = await r.json();
      const results = (data.results || []).map((s: any) => ({
        id: s.id || s['id'] || s.school && s.school.school_id,
        name: s.school && s.school.name || s['school.name'] || s.name || '',
        city: s.school && s.school.city || s['school.city'] || '',
        state: s.school && s.school.state || s['school.state'] || '',
        raw: s
      }));
      return res.json({ query: q, provider: 'scorecard', results });
    }

    if ((provider === 'google' || provider === 'auto') && googleKey) {
      // Google Places Text Search
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&key=${googleKey}&type=university`;
      try {
        const r = await fetch(url);
        const text = await r.text();
        let data: any = {};
        try { data = JSON.parse(text); } catch (e) { data = { results: [] }; }

        // If HTTP not OK or Google reports non-OK status, fallback to local dataset
        if (!r.ok || (data.status && data.status !== 'OK')) {
          console.warn('Google Places unavailable or returned error, falling back to local dataset', { status: data.status || r.status, error_message: data.error_message || text });
          const ql = q.toLowerCase();
          const results = (localColleges || []).filter(c => (c.name || '').toLowerCase().includes(ql)).slice(0, 10);
          return res.json({ query: q, provider: 'google-fallback-local', results, google_status: data.status || r.status, google_error: data.error_message || null, raw_google: data });
        }

        const results = (data.results || []).map((p: any) => ({
          id: p.place_id,
          name: p.name,
          city: (p.formatted_address || '').split(',').slice(-3,-2)[0] || '',
          state: (p.formatted_address || '').split(',').slice(-2,-1)[0] || '',
          address: p.formatted_address,
          lat: p.geometry && p.geometry.location && p.geometry.location.lat,
          lng: p.geometry && p.geometry.location && p.geometry.location.lng,
          raw: p
        }));
        return res.json({ query: q, provider: 'google', results });
      } catch (err) {
        console.error('Error calling Google Places, falling back to local dataset', err);
        const ql = q.toLowerCase();
        const results = (localColleges || []).filter(c => (c.name || '').toLowerCase().includes(ql)).slice(0, 10);
        return res.json({ query: q, provider: 'google-fallback-local', results, google_status: 'ERROR', google_error: String(err) });
      }
    }

    // No provider available, prefer local dataset if present
    if ((provider === 'local' || (!scorecardKey && !googleKey)) && localColleges && localColleges.length > 0) {
      // Improved local fuzzy scoring: score by token matches in name/city/state
      const ql = (q || '').trim().toLowerCase();
      const qTokens = ql.split(/\s+/).filter(Boolean);
      const scored = (localColleges || []).map((c: any) => {
        const name = (c.name || '').toLowerCase();
        const city = (c.city || '').toLowerCase();
        const state = (c.state || '').toLowerCase();
        let score = 0;
        if (!ql) score = 1; // if empty query, give minimal score so we can show some results
        // exact name match high score
        if (ql && name === ql) score += 50;
        // startsWith match
        if (ql && name.startsWith(ql)) score += 10;
        for (const t of qTokens) {
          if (!t) continue;
          if (name.includes(t)) score += 6;
          if (city.includes(t)) score += 4;
          if (state.includes(t)) score += 2;
          // penalize long unmatched tokens slightly (no-op here)
        }
        // boost for short queries where first token matches start of name
        if (qTokens.length > 0 && name.split(' ')[0].startsWith(qTokens[0])) score += 3;
        return { item: c, score };
      }).filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 10).map(s => s.item);
      return res.json({ query: q, provider: 'local', results: scored });
    }

    // fallback mock results
    const mock = [
      { name: 'Mock University A', city: 'Mocksville', state: 'CA', id: 'mua' },
      { name: 'Mock College B', city: 'Sampleton', state: 'NY', id: 'mcb' }
    ];
    return res.json({ query: q, provider: 'mock', results: mock });
  } catch (err) {
    console.error('search-schools error:', err);
    return res.status(500).json({ error: 'Internal error during search' });
  }
});

// Stratum agent endpoint (uses STRATUM_AGENT_API_KEY)
// Accepts { prompt: string } and will call your agent backend or LLM provider.
// If the key is missing we return 501. Implement the integration where noted.
app.post('/api/stratum-agent', async (req: Request, res: Response) => {
  // Allow an ephemeral Hugging Face key to be supplied in the request body
  // as `hf_key` for quick testing without storing secrets in .env.
  const bodyHfKey = req.body && req.body.hf_key ? String(req.body.hf_key) : undefined;
  const envKey = process.env.STRATUM_AGENT_API_KEY;
  // Use ephemeral key if provided and it looks like an HF token (starts with hf_)
  const key = (bodyHfKey && bodyHfKey.startsWith('hf_')) ? bodyHfKey : envKey;
  const prompt = req.body && req.body.prompt ? String(req.body.prompt) : '';
  // default to a small instruction-tuned Flan model for better replies
  const model = process.env.STRATUM_AGENT_MODEL || 'google/flan-t5-base';

  if (!key) {
    return res.status(501).json({ error: 'STRATUM_AGENT_API_KEY not configured on the server' });
  }

  try {
    // If configured, prefer local deterministic agent replies for quick demos
    if (FORCE_LOCAL_AGENT || req.body && req.body.use_local) {
      // Look for an explicit college field in the request body
      const collegeQuery = (req.body && req.body.college) ? String(req.body.college).toLowerCase() : '';
      let found = null;
      // If a college name was provided, try to match; otherwise try to find a name inside the prompt
      if (collegeQuery) {
        found = localColleges.find(c => (c.name || '').toLowerCase().includes(collegeQuery) || (c.id || '') === collegeQuery);
      }
      if (!found && prompt) {
        const pl = prompt.toLowerCase();
        found = localColleges.find(c => (c.name || '').toLowerCase().includes(pl) || pl.includes((c.name || '').toLowerCase().split(' ')[0]));
      }
      const college = found || (localColleges && localColleges.length > 0 ? localColleges[0] : null);
      if (college) {
        const reply = `${college.name} — ${college.city || 'Unknown'}, ${college.state || ''}: ${college.name.split(' ')[0]} is a well-established research university located in ${college.city || 'its city'}. It offers a broad range of undergraduate and graduate programs and has a competitive admissions profile.`;
        return res.json({ prompt, reply, provider: 'local-template', college: { id: college.id, name: college.name, city: college.city, state: college.state } });
      }
      return res.json({ prompt, reply: 'No local college data available to generate a summary.', provider: 'local-template' });
    }

    // If the key looks like a Hugging Face token (starts with hf_), call HF Inference
    if (key && key.startsWith('hf_')) {
      const hfModel = process.env.STRATUM_AGENT_MODEL || 'gpt2';
      const hfUrl = `https://api-inference.huggingface.co/models/${encodeURIComponent(hfModel)}`;
      // Log whether we're using ephemeral or env key (do not log tokens themselves)
      console.log(`Using Hugging Face key for model ${hfModel} (ephemeral:${!!bodyHfKey})`);
      const r = await fetch(hfUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 256 } })
      });
      if (!r.ok) {
        // Try to detect HF guidance to use router.huggingface.co and retry once
        const text = await r.text();
        console.error('HF inference error', r.status, text);
        // If HF suggests using the router, try the pipeline endpoint first (text2text-generation)
        if (text && text.toString().includes('router.huggingface.co')) {
          try {
            const pipelineUrl = 'https://api-inference.huggingface.co/pipeline/text2text-generation';
            console.log('Attempting HF pipeline text2text-generation call for model', hfModel);
            const p = await fetch(pipelineUrl, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: hfModel, inputs: prompt })
            });
            if (p.ok) {
              const outp = await p.json();
              let replyp = '';
              if (typeof outp === 'string') replyp = outp;
              else if (Array.isArray(outp) && outp[0] && (outp[0].generated_text || outp[0].summary_text)) replyp = outp[0].generated_text || outp[0].summary_text;
              else if (outp.generated_text) replyp = outp.generated_text;
              else replyp = JSON.stringify(outp);
              return res.json({ prompt, reply: replyp, provider: 'huggingface-pipeline', model: hfModel, ephemeral_key_used: !!bodyHfKey });
            }
            const pt = await p.text();
            console.error('HF pipeline retry failed', p.status, pt);
          } catch (errp) {
            console.error('Error during HF pipeline retry', errp);
          }

          try {
            const routerUrl = hfUrl.replace('api-inference.huggingface.co', 'router.huggingface.co');
            console.log('Retrying HF inference via router endpoint:', routerUrl);
            const r2 = await fetch(routerUrl, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 256 } })
            });
            if (!r2.ok) {
              const t2 = await r2.text();
              console.error('HF router retry failed', r2.status, t2);
              return res.status(502).json({ error: 'Hugging Face inference failed (router retry)', detail: t2 });
            }
            const out2 = await r2.json();
            let reply2 = '';
            if (typeof out2 === 'string') reply2 = out2;
            else if (Array.isArray(out2) && out2[0] && out2[0].generated_text) reply2 = out2[0].generated_text;
            else if (out2.generated_text) reply2 = out2.generated_text;
            else reply2 = JSON.stringify(out2);
            return res.json({ prompt, reply: reply2, provider: 'huggingface-router', model: hfModel, ephemeral_key_used: !!bodyHfKey });
          } catch (err2) {
            console.error('Error during HF router retry', err2);
            return res.status(502).json({ error: 'Hugging Face router retry failed', detail: String(err2) });
          }
        }
        return res.status(502).json({ error: 'Hugging Face inference failed', detail: text });
      }
      const out = await r.json();
      // HF inference responses vary; try to extract generated text.
      let reply = '';
      if (typeof out === 'string') reply = out;
      else if (Array.isArray(out) && out[0] && out[0].generated_text) reply = out[0].generated_text;
      else if (out.generated_text) reply = out.generated_text;
      else reply = JSON.stringify(out);
      return res.json({ prompt, reply, provider: 'huggingface', model: hfModel, ephemeral_key_used: !!bodyHfKey });
    }

    // Fallback: if key looks like a Google API key (starts with AI), leave mock behavior
    if (key.startsWith('AI') || key.startsWith('AIza')) {
      // We kept the Google mock earlier — implement a simple echo for now.
      return res.json({ prompt, reply: `Echo from stratum-agent (mock using provided key): ${prompt}`, provider: 'mock-google' });
    }

    // Otherwise, default to a mock echo reply
    return res.json({ prompt, reply: `Echo from stratum-agent (mock): ${prompt}`, provider: 'mock' });
  } catch (err) {
    console.error('stratum-agent error:', err);
    return res.status(500).json({ error: 'Internal error running agent' });
  }
});

// GET /api/schools
app.get('/api/schools', async (_req: Request, res: Response) => {
  try {
    const schools = await prisma.school.findMany({ orderBy: { createdAt: 'asc' } });
    res.json(schools);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch schools' });
  }
});

// POST /api/schools
app.post('/api/schools', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const school = await prisma.school.create({ data });
    res.status(201).json(school);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create school' });
  }
});

// simple delete endpoint
app.delete('/api/schools/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  try {
    await prisma.school.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete school' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
