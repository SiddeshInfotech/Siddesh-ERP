-- =============================================================================
-- 19 — PRODUCT NOTES
--
-- Stores manual notes added by users to a product's timeline.
-- =============================================================================

create table public.product_notes (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  note_text   text not null,
  
  -- Standard audit fields
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id),
  version     integer not null default 1,
  
  constraint chk_product_notes_text check (length(trim(note_text)) > 0)
);

create index ix_product_notes_product on public.product_notes (product_id);

create trigger tg_product_notes_audit before insert or update on public.product_notes
  for each row execute function app.tg_set_audit();

-- RLS
alter table public.product_notes enable row level security;

-- Admin can do everything
create policy "Admin all product_notes" on public.product_notes
  for all to authenticated
  using (app.is_admin())
  with check (app.is_admin());

-- Store Managers and Sales Executives can view notes
create policy "Staff view product_notes" on public.product_notes
  for select to authenticated
  using (app.current_role() in ('STORE_MANAGER', 'SALES_EXECUTIVE'));

-- Store Managers and Sales Executives can add notes
create policy "Staff insert product_notes" on public.product_notes
  for insert to authenticated
  with check (app.current_role() in ('STORE_MANAGER', 'SALES_EXECUTIVE'));

notify pgrst, 'reload schema';
