const BASE = (import.meta && import.meta.env && import.meta.env.VITE_API_BASE) ? import.meta.env.VITE_API_BASE : 'http://localhost:4000';

export async function getSchools() {
  const res = await fetch(`${BASE}/api/schools`);
  if (!res.ok) throw new Error('Failed to fetch schools');
  return res.json();
}

export async function createSchool(payload) {
  const res = await fetch(`${BASE}/api/schools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to create school');
  return res.json();
}

export async function deleteSchool(id) {
  const res = await fetch(`${BASE}/api/schools/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error('Failed to delete school');
  return true;
}
