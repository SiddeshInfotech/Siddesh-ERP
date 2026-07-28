import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function check() {
  console.log('Checking batches and barcodes...')
  const { data: batches, error: be } = await supabase.from('product_batches').select('*')
  console.log('Batches:', batches?.length, be?.message)
  
  const { data: barcodes, error: bce } = await supabase.from('product_barcodes').select('*')
  console.log('Barcodes:', barcodes?.length, bce?.message)
}
check()
