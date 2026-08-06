import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function run() {
  const { data, error } = await supabase.from('profiles').select('email:id, full_name, role, office_id, is_office_login')
  if (error) {
    console.error(error)
  } else {
    console.table(data)
  }
}
run()
