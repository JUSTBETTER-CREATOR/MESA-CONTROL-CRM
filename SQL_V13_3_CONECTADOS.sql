-- ============================================================
-- BETTER CONTROL V13.3 · PRESENCIA / CONECTADOS
-- Ejecutar una sola vez en Supabase SQL Editor.
-- ============================================================

begin;

create table if not exists public.crm_presence (
    analista_id uuid primary key references public.analistas(id) on delete cascade,
    area_id uuid references public.areas(id) on delete cascade,
    connected_at timestamptz not null default now(),
    last_seen timestamptz not null default now(),
    is_online boolean not null default true
);

create index if not exists ix_crm_presence_area
on public.crm_presence(area_id);

create index if not exists ix_crm_presence_last_seen
on public.crm_presence(last_seen desc);

alter table public.crm_presence enable row level security;

do $$
declare p record;
begin
  for p in
    select schemaname,tablename,policyname
    from pg_policies
    where schemaname='public' and tablename='crm_presence'
  loop
    execute format('drop policy if exists %I on %I.%I',p.policyname,p.schemaname,p.tablename);
  end loop;
end $$;

-- Cada usuario ve presencia de su área. GLOBAL ve todas.
create policy "crm_presence_select_area"
on public.crm_presence
for select
to authenticated
using (
    public.soy_global()
    or area_id = public.mi_area_id()
);

-- Cada usuario operativo crea únicamente su propio registro de presencia.
create policy "crm_presence_insert_own"
on public.crm_presence
for insert
to authenticated
with check (
    analista_id = public.mi_analista_id()
    and area_id = public.mi_area_id()
);

-- Cada usuario actualiza únicamente su propia señal.
create policy "crm_presence_update_own"
on public.crm_presence
for update
to authenticated
using (
    analista_id = public.mi_analista_id()
)
with check (
    analista_id = public.mi_analista_id()
    and area_id = public.mi_area_id()
);

-- Realtime, si todavía no está publicado.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='crm_presence'
  ) then
    alter publication supabase_realtime add table public.crm_presence;
  end if;
end $$;

commit;

-- PRUEBA:
-- select * from public.crm_presence order by last_seen desc;
