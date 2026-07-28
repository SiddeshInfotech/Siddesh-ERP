-- Temporary view for product barcodes
create or replace view public.temp_product_barcodes as select * from public.product_barcodes;

grant select on public.temp_product_barcodes to anon, authenticated, service_role;
