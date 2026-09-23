-- Phase 3 "Get Listed" payments: LemonSqueezy checkout, webhook-confirmed
-- activation, and discount redemption. Package pricing still lives only in
-- lib/get-listed/packages.ts (see migration 0015's comment) — base_amount
-- here is a snapshot of what was actually charged for this order, not a
-- second source of truth for the price.
--
-- Amounts are stored in cents (matching LemonSqueezy's own API units, and
-- avoiding fractional-cent issues once an arbitrary Discount Drop
-- percentage like 37% is applied to a whole-dollar package price).

create table orders (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'lemonsqueezy' check (provider in ('lemonsqueezy')),
  -- Nullable until LemonSqueezy's order_created webhook actually reports
  -- one — a pending order created right before checkout doesn't have this
  -- yet. Unique once set: a Postgres unique constraint permits any number
  -- of NULLs, so multiple still-pending orders never collide on this.
  provider_order_id text unique,
  provider_customer_id text,
  provider_variant_id text,
  package_key text not null check (package_key in ('starter', 'growth', 'scale')),
  base_amount int not null check (base_amount >= 0),
  discount_percent int not null default 0 check (discount_percent between 0 and 100),
  discount_amount int not null default 0 check (discount_amount >= 0),
  final_amount int not null check (final_amount >= 0),
  currency text not null default 'USD',
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'failed', 'refunded', 'cancelled')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_campaign_id_idx on orders (campaign_id);
create index orders_owner_id_idx on orders (owner_id);
create index orders_payment_status_idx on orders (payment_status);

-- At most one pending order per campaign at a time — a retried "Get
-- Listed" click reuses the existing pending order (see
-- lib/get-listed/orders.ts) instead of piling up duplicates, and this
-- index is the hard DB-level backstop for that even under a race.
create unique index orders_one_pending_per_campaign_idx on orders (campaign_id) where payment_status = 'pending';

-- The single place an order is ever marked paid. Atomic and idempotent by
-- construction: the `where payment_status = 'pending'` guard means a
-- retried webhook delivery (or a webhook arriving after an admin
-- reconciliation already ran, or vice versa) finds zero rows on its second
-- call and the function becomes a no-op — same "atomic guard, not
-- check-then-write" pattern as cast_vote and discount-drop's completed_at
-- check. Campaign activation and discount redemption happen in the same
-- transaction as the payment-status flip, so a crash or concurrent call
-- can never leave a paid order next to a still-awaiting-payment campaign
-- or a double-redeemed discount.
create or replace function finalize_get_listed_order(
  p_order_id uuid,
  p_provider_order_id text,
  p_provider_customer_id text default null,
  p_provider_variant_id text default null
)
returns orders
language plpgsql
as $$
declare
  v_order orders;
  v_discount_award_id uuid;
begin
  update orders
    set payment_status = 'paid',
        paid_at = now(),
        provider_order_id = coalesce(orders.provider_order_id, p_provider_order_id),
        provider_customer_id = coalesce(p_provider_customer_id, orders.provider_customer_id),
        provider_variant_id = coalesce(p_provider_variant_id, orders.provider_variant_id),
        updated_at = now()
    where id = p_order_id and payment_status = 'pending'
    returning * into v_order;

  if v_order.id is null then
    return null;
  end if;

  update campaigns
    set status = 'active', updated_at = now()
    where id = v_order.campaign_id and status = 'awaiting_payment'
    returning discount_award_id into v_discount_award_id;

  if v_discount_award_id is not null then
    update discount_awards
      set status = 'redeemed', redeemed_at = now()
      where id = v_discount_award_id and status = 'available';
  end if;

  return v_order;
end;
$$;

-- Audit trail for POST /api/admin/get-listed/campaigns/[id]/reconcile-payment
-- — the manual escape hatch for "payment succeeded externally, but the
-- webhook was missed or delayed." Never used to bypass verification, only
-- to record who did and why after the fact.
create table payment_reconciliations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  campaign_id uuid not null references campaigns (id) on delete cascade,
  admin_identifier text not null,
  reason text not null,
  payment_reference text not null,
  created_at timestamptz not null default now()
);

create index payment_reconciliations_order_id_idx on payment_reconciliations (order_id);

-- Same zero-policy RLS posture as every other mutable table in this app —
-- reachable only through the service-role admin client from server-side
-- route handlers, which independently verify identity/ownership/admin
-- authorization before every read or write (see migration 0001 and 0015's
-- comments).
alter table orders enable row level security;
alter table payment_reconciliations enable row level security;
