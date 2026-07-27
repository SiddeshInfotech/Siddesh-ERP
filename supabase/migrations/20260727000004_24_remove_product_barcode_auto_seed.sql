-- =============================================================================
-- Migration 24: Remove Automatic Barcode Seeding on Product Creation
--
-- Barcodes are now managed exclusively through the Barcode Registry module.
-- Creating a product no longer seeds a default row into product_barcodes.
-- =============================================================================

drop trigger if exists tg_products_seed_barcode on public.products;
drop function if exists app.tg_seed_product_barcode();
