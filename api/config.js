// Vercel Function: Public config for frontend
// GET /api/config - Returns public Supabase credentials

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Return public Supabase config (anon key is safe for client-side)
  return res.status(200).json({
    supabase_url: process.env.SUPABASE_URL || 'https://sdevgsxrmontdlysjwuq.supabase.co',
    supabase_anon_key: process.env.SUPABASE_KEY || ''
  });
};
