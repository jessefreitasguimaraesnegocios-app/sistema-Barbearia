// Agenda: POST/GET com Authorization: Bearer CRON_SECRET (se CRON_SECRET estiver definido na Vercel).
// Plano Hobby da Vercel não permite cron < 1/dia no vercel.json — use serviço externo (ex.: cron-job.org a cada 1–5 min)
// ou Vercel Pro com crons. Variáveis: CRON_SECRET (recomendado), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// SUPABASE_ANON_KEY ou VITE_SUPABASE_ANON_KEY.

function supabaseEnv() {
  const rawUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const SUPABASE_URL = rawUrl.replace(/\/$/, '');
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  return { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY };
}

export default async function handler(
  req: { method?: string; headers?: Record<string, string | string[] | undefined> },
  res: {
    setHeader: (k: string, v: string) => void;
    status: (n: number) => { json: (o: object) => void; end: () => void };
  }
) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Use GET ou POST.' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authRaw = req.headers?.authorization;
    const authHeader = typeof authRaw === 'string' ? authRaw : Array.isArray(authRaw) ? authRaw[0] : '';
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ ok: false, error: 'Não autorizado.' });
    }
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY } = supabaseEnv();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ ok: false, error: 'Supabase URL / keys ausentes na Vercel.' });
  }

  const edgeUrl = `${SUPABASE_URL}/functions/v1/expire-pending-pix`;
  let fnRes: Response;
  try {
    fnRes = await fetch(edgeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: '{}',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cron/expire-pending-pix]', e);
    return res.status(503).json({ ok: false, error: `Falha de rede: ${msg}` });
  }

  const text = await fnRes.text();
  let data: Record<string, unknown> = { raw: text };
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* mantém raw */
  }

  return res.status(fnRes.ok ? 200 : 502).json({ ok: fnRes.ok, edgeStatus: fnRes.status, ...data });
}
