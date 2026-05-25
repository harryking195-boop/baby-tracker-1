create extension if not exists pgcrypto;

create table if not exists public.babies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  birth_date text not null default '',
  birth_time text not null default '',
  birth_weight_kg numeric,
  birth_type text not null default '',
  complications text not null default '',
  photo_url text,
  invite_code text not null unique default encode(gen_random_bytes(12), 'hex'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.baby_members (
  baby_id uuid not null references public.babies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'partner' check (role in ('owner', 'partner')),
  created_at timestamptz not null default now(),
  primary key (baby_id, user_id)
);

create table if not exists public.baby_entries (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.babies(id) on delete cascade,
  type text not null check (type in ('feed', 'nappy', 'med')),
  happened_at timestamptz not null,
  amount_ml numeric,
  feed_type text,
  nappy_type text,
  medication_name text,
  medication_dose text,
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.babies enable row level security;
alter table public.baby_members enable row level security;
alter table public.baby_entries enable row level security;

drop policy if exists "members can read babies" on public.babies;
create policy "members can read babies"
on public.babies for select
to authenticated
using (
  exists (
    select 1 from public.baby_members
    where baby_members.baby_id = babies.id
      and baby_members.user_id = auth.uid()
  )
);

drop policy if exists "users can create babies" on public.babies;
create policy "users can create babies"
on public.babies for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "members can update babies" on public.babies;
create policy "members can update babies"
on public.babies for update
to authenticated
using (
  exists (
    select 1 from public.baby_members
    where baby_members.baby_id = babies.id
      and baby_members.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.baby_members
    where baby_members.baby_id = babies.id
      and baby_members.user_id = auth.uid()
  )
);

drop policy if exists "members can read memberships" on public.baby_members;
create policy "members can read memberships"
on public.baby_members for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.baby_members mine
    where mine.baby_id = baby_members.baby_id
      and mine.user_id = auth.uid()
  )
);

drop policy if exists "users can join babies" on public.baby_members;
create policy "users can join babies"
on public.baby_members for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "users can refresh own memberships" on public.baby_members;
create policy "users can refresh own memberships"
on public.baby_members for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create or replace function public.join_baby_by_invite(code text)
returns public.babies
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_baby public.babies;
begin
  select *
  into matched_baby
  from public.babies
  where invite_code = code;

  if matched_baby.id is null then
    raise exception 'Invite not found';
  end if;

  insert into public.baby_members (baby_id, user_id, role)
  values (matched_baby.id, auth.uid(), 'partner')
  on conflict (baby_id, user_id) do update set role = excluded.role;

  return matched_baby;
end;
$$;

grant execute on function public.join_baby_by_invite(text) to authenticated;

drop policy if exists "members can read entries" on public.baby_entries;
create policy "members can read entries"
on public.baby_entries for select
to authenticated
using (
  exists (
    select 1 from public.baby_members
    where baby_members.baby_id = baby_entries.baby_id
      and baby_members.user_id = auth.uid()
  )
);

drop policy if exists "members can create entries" on public.baby_entries;
create policy "members can create entries"
on public.baby_entries for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.baby_members
    where baby_members.baby_id = baby_entries.baby_id
      and baby_members.user_id = auth.uid()
  )
);

drop policy if exists "members can delete entries" on public.baby_entries;
create policy "members can delete entries"
on public.baby_entries for delete
to authenticated
using (
  exists (
    select 1 from public.baby_members
    where baby_members.baby_id = baby_entries.baby_id
      and baby_members.user_id = auth.uid()
  )
);

insert into storage.buckets (id, name, public)
values ('baby-photos', 'baby-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "members can upload baby photos" on storage.objects;
create policy "members can upload baby photos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'baby-photos');

drop policy if exists "members can update baby photos" on storage.objects;
create policy "members can update baby photos"
on storage.objects for update
to authenticated
using (bucket_id = 'baby-photos')
with check (bucket_id = 'baby-photos');

drop policy if exists "public can read baby photos" on storage.objects;
create policy "public can read baby photos"
on storage.objects for select
to public
using (bucket_id = 'baby-photos');
