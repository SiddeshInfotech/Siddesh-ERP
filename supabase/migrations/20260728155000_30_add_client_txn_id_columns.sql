-- Add client_txn_id columns to inwards and outwards tables
alter table public.inwards add column if not exists client_txn_id uuid;
alter table public.outwards add column if not exists client_txn_id uuid;

-- Add indexes for idempotency or lookup query performance
create index if not exists ix_inwards_client_txn_id on public.inwards(client_txn_id);
create index if not exists ix_outwards_client_txn_id on public.outwards(client_txn_id);
