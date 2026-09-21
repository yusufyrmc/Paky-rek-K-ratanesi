require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

let supabase = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
} else {
  console.warn('⚠️ Supabase bağlantı bilgileri yok. Render Environment\'a SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY ekleyin.');
}

module.exports = { supabase };
