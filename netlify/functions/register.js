// Netlify Function: Register User
// POST /.netlify/functions/register

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { username, display_name, email, password } = JSON.parse(event.body);

    // Validation
    if (!username || !display_name || !email || !password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'All fields are required' })
      };
    }

    if (username.length < 3 || username.length > 20) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Username must be 3-20 characters' })
      };
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Username can only contain letters, numbers, and underscores' })
      };
    }

    if (password.length < 8) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Password must be at least 8 characters' })
      };
    }

    // Initialize Supabase with service role key (server-side only)
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SECRET
    );

    // Check if username already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('username')
      .eq('username', username)
      .single();

    if (existingUser) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: 'Username already taken' })
      };
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: authError.message })
      };
    }

    // Create user profile in users table
    const { error: profileError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        username,
        display_name,
        email,
        total_points: 0,
        correct_scores: 0,
        current_streak: 0
      });

    if (profileError) {
      // Rollback: delete auth user if profile creation fails
      await supabase.auth.admin.deleteUser(authData.user.id);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to create user profile' })
      };
    }

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        message: 'Account created successfully',
        user: {
          id: authData.user.id,
          username,
          display_name,
          email
        }
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', details: error.message })
    };
  }
};
