// Vercel Serverless: POST /api/partner/staff/create-access
// Dono da loja (barbearia) cria usuário Auth para um profissional e vincula perfil + professionals.user_id.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export default async function handler(
  req: {
    method?: string;
    headers?: Record<string, string | string[] | undefined>;
    body?: { professionalId?: string; email?: string; password?: string; shopId?: string };
  },
  res: {
    setHeader: (k: string, v: string) => void;
    status: (n: number) => { json: (o: object) => void; end: () => void };
    end?: (code?: number) => void;
  }
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido. Use POST.' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ success: false, error: 'Configuração do Supabase indisponível.' });
  }

  const authRaw = req.headers?.authorization;
  const authHeader = typeof authRaw === 'string' ? authRaw : Array.isArray(authRaw) ? authRaw[0] : '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return res.status(401).json({ success: false, error: 'Token não enviado. Faça login novamente.' });
  }

  const body = req.body || {};
  const professionalId = typeof body.professionalId === 'string' ? body.professionalId.trim() : '';
  const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const shopIdBody = typeof body.shopId === 'string' ? body.shopId.trim() : '';

  if (!professionalId || !email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Informe professionalId, email e password.',
    });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, error: 'A senha deve ter pelo menos 6 caracteres.' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: authData, error: authErr } = await supabase.auth.getUser(token);
  const ownerId = authData?.user?.id;
  if (authErr || !ownerId) {
    return res.status(401).json({ success: false, error: 'Sessão inválida ou expirada.' });
  }

  const { data: allowedByRateLimit, error: rateErr } = await supabase.rpc('security_check_rate_limit', {
    p_route: 'staff-create-access',
    p_subject: `staff-create-access:${ownerId}:${professionalId}`,
    p_limit: 8,
    p_window_seconds: 60,
  });
  if (rateErr) {
    return res.status(500).json({ success: false, error: `Falha no rate limit: ${rateErr.message}` });
  }
  if (allowedByRateLimit === false) {
    return res.status(429).json({
      success: false,
      error: 'Muitas tentativas. Aguarde 1 minuto e tente novamente.',
    });
  }

  const { data: ownerProfile, error: ownerProfErr } = await supabase
    .from('profiles')
    .select('role, shop_id')
    .eq('id', ownerId)
    .single();
  if (ownerProfErr || !ownerProfile) {
    return res.status(403).json({ success: false, error: 'Perfil do dono não encontrado.' });
  }
  if ((ownerProfile as { role?: string }).role !== 'barbearia') {
    return res.status(403).json({ success: false, error: 'Apenas o dono da barbearia pode criar acesso da equipe.' });
  }

  const ownerShopId = (ownerProfile as { shop_id?: string | null }).shop_id;
  if (!ownerShopId) {
    return res.status(403).json({ success: false, error: 'Dono sem loja vinculada.' });
  }
  if (shopIdBody && shopIdBody !== ownerShopId) {
    return res.status(403).json({ success: false, error: 'Loja não confere com o seu cadastro.' });
  }

  const { data: shop, error: shopErr } = await supabase
    .from('shops')
    .select('id, owner_id')
    .eq('id', ownerShopId)
    .single();
  if (shopErr || !shop || (shop as { owner_id?: string }).owner_id !== ownerId) {
    return res.status(403).json({ success: false, error: 'Você não é o dono desta loja.' });
  }

  const { data: professional, error: proErr } = await supabase
    .from('professionals')
    .select('id, shop_id, name, user_id')
    .eq('id', professionalId)
    .single();
  if (proErr || !professional) {
    return res.status(404).json({ success: false, error: 'Profissional não encontrado.' });
  }
  if ((professional as { shop_id?: string }).shop_id !== ownerShopId) {
    return res.status(403).json({ success: false, error: 'Este profissional não pertence à sua loja.' });
  }

  const existingUserId = (professional as { user_id?: string | null }).user_id;
  if (existingUserId) {
    return res.status(400).json({
      success: false,
      error: 'Este profissional já possui login vinculado.',
    });
  }

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr || !created?.user?.id) {
    const msg = createErr?.message || 'Não foi possível criar o usuário.';
    if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered')) {
      return res.status(409).json({
        success: false,
        error: 'Este e-mail já está cadastrado. Use outro e-mail ou remova a conta existente.',
      });
    }
    return res.status(400).json({ success: false, error: msg });
  }

  const newUserId = created.user.id;

  const proName = String((professional as { name?: string }).name || '').trim();

  const { error: profileUpdateErr } = await supabase
    .from('profiles')
    .update({
      role: 'profissional',
      shop_id: ownerShopId,
      professional_id: professionalId,
      ...(proName ? { full_name: proName } : {}),
    })
    .eq('id', newUserId);

  if (profileUpdateErr) {
    await supabase.auth.admin.deleteUser(newUserId);
    return res.status(500).json({
      success: false,
      error: 'Falha ao atualizar perfil: ' + profileUpdateErr.message,
    });
  }

  const { data: verifyProf, error: verifyErr } = await supabase
    .from('profiles')
    .select('role, professional_id')
    .eq('id', newUserId)
    .single();
  if (
    verifyErr ||
    !verifyProf ||
    (verifyProf as { role?: string }).role !== 'profissional' ||
    (verifyProf as { professional_id?: string }).professional_id !== professionalId
  ) {
    await supabase.auth.admin.deleteUser(newUserId);
    return res.status(500).json({
      success: false,
      error: 'Não foi possível confirmar o perfil do profissional. Tente novamente.',
    });
  }

  const { error: linkErr } = await supabase
    .from('professionals')
    .update({ user_id: newUserId })
    .eq('id', professionalId)
    .eq('shop_id', ownerShopId);

  if (linkErr) {
    await supabase.auth.admin.deleteUser(newUserId);
    return res.status(500).json({
      success: false,
      error: 'Falha ao vincular profissional: ' + linkErr.message,
    });
  }

  return res.status(200).json({
    success: true,
    userId: newUserId,
    message: 'Acesso criado. O profissional pode entrar em Sou parceiro com este e-mail e senha.',
  });
}
