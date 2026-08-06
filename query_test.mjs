import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function run() {
  const { data: inwardHistory, error: e1 } = await supabase
    .from('v_inward_history')
    .select('id, product_name, batch_code, inward_qty, inward_no')
    
  console.log('v_inward_history:', inwardHistory, e1?.message)

  const { data: items, error: e2 } = await supabase
    .from('inward_items')
    .select('id, inward_id, batch_id')
    
  console.log('\ninward_items:', items, e2?.message)

  const { data: outwards, error: e3 } = await supabase
    .from('v_outward_history')
    .select('id, product_name, batch_code, outward_qty, outward_no')
    
  console.log('\nv_outward_history:', outwards, e3?.message)
}

run()
