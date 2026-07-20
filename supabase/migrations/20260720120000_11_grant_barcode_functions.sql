-- Fix "permission denied for function next_product_barcode" (DSK-205, SRD §4)
-- The default column values for products.sku_barcode and product_units.unit_barcode
-- evaluate app.next_product_barcode() and app.next_unit_barcode().
-- When executing inserts under authenticated role, Postgres requires explicit EXECUTE
-- permission on these helper functions as well as USAGE on schema app.

grant usage on schema app to authenticated;
grant usage on schema app to anon;
grant usage on schema app to service_role;

grant execute on function app.next_product_barcode() to authenticated;
grant execute on function app.next_product_barcode() to anon;
grant execute on function app.next_product_barcode() to service_role;

grant execute on function app.next_unit_barcode() to authenticated;
grant execute on function app.next_unit_barcode() to anon;
grant execute on function app.next_unit_barcode() to service_role;

grant usage, select on sequence app.barcode_seq to authenticated;
grant usage, select on sequence app.barcode_seq to service_role;

notify pgrst, 'reload schema';
