const { createClient } = require('@supabase/supabase-js')

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SECRET
    )
    const { username, display_name, email, password } = req.body
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    })
    if (error) return res.status(400).json({ error: error.message })
    await supabase.from('users').insert({
      id: data.user.id,
      username,
      display_name,
      email
    })
    return res.status(200).json({ success: true, message: 'Account created successfully' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}