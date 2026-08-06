import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables from .env
dotenv.config()

// Ensure we have the necessary environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY // Needs to be provided!

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Error: Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  console.error('Please run this script with your service role key like this:')
  console.error('  $env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"; node scripts/create_office_logins.mjs')
  process.exit(1)
}

// Create a Supabase client with the SERVICE ROLE KEY so we can bypass RLS and create users
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function run() {
  console.log('Fetching offices...')
  const { data: offices, error: officesError } = await supabase.from('offices').select('id, code, name')
  
  if (officesError) {
    console.error('Failed to fetch offices:', officesError)
    process.exit(1)
  }

  const officeMap = {}
  offices.forEach(o => { officeMap[o.code] = o.id })

  const requiredOffices = ['DHULE_MAIN', 'DHULE_BR', 'JALGAON', 'PUNE']
  for (const code of requiredOffices) {
    if (!officeMap[code]) {
      console.error(`❌ Missing office with code ${code} in the database.`)
      process.exit(1)
    }
  }

  // Define the users to create
  const usersToCreate = [
    {
      email: 'superadmin@dhulemain.com',
      password: 'Password123!',
      full_name: 'Super Admin (Dhule Main)',
      role: 'ADMIN', // Super admin has global access
      office_id: officeMap['DHULE_MAIN'],
      is_office_login: true
    },
    {
      email: 'admin@dhulebranch.com',
      password: 'Password123!',
      full_name: 'Dhule Branch Admin',
      role: 'STORE_MANAGER', // General admin limited to their office
      office_id: officeMap['DHULE_BR'],
      is_office_login: true
    },
    {
      email: 'admin@jalgaon.com',
      password: 'Password123!',
      full_name: 'Jalgaon Branch Admin',
      role: 'STORE_MANAGER', // General admin limited to their office
      office_id: officeMap['JALGAON'],
      is_office_login: true
    },
    {
      email: 'admin@pune.com',
      password: 'Password123!',
      full_name: 'Pune Branch Admin',
      role: 'STORE_MANAGER', // General admin limited to their office
      office_id: officeMap['PUNE'],
      is_office_login: true
    }
  ]

  console.log('\nCreating users...')
  
  for (const u of usersToCreate) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: {
        full_name: u.full_name,
        role: u.role,
        office_id: u.office_id,
        is_office_login: u.is_office_login
      }
    })

    if (error) {
      if (error.message.includes('already been registered')) {
        console.log(`⚠️ User ${u.email} already exists.`)
      } else {
        console.error(`❌ Failed to create ${u.email}:`, error.message)
      }
    } else {
      console.log(`✅ Created user ${u.email} (Role: ${u.role}, Office: ${u.office_id})`)
    }
  }

  console.log('\nDone! You can now use these credentials to log in.')
}

run()
