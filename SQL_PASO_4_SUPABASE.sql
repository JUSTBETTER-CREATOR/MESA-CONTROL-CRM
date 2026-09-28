-- PASO 4 · Ajustes para que la V3 funcione completa

-- 1) Clave estable para actualizar ASISTENCIA sin duplicar personas
alter table public.personas add column if not exists clave text;
create unique index if not exists ux_personas_clave on public.personas(clave) where clave is not null;

-- 2) GitHub Pages necesita poder actualizar el catálogo compartido de tiendas
create policy "usuarios autenticados pueden crear tiendas"
on public.tiendas for insert to authenticated
with check (true);

create policy "usuarios autenticados pueden actualizar tiendas"
on public.tiendas for update to authenticated
using (true) with check (true);

-- 3) Bucket privado para fotos, PDFs y evidencias
insert into storage.buckets (id, name, public)
values ('evidencias','evidencias',false)
on conflict (id) do update set public = false;

create policy "usuarios autenticados pueden subir evidencias storage"
on storage.objects for insert to authenticated
with check (bucket_id = 'evidencias');

create policy "usuarios autenticados pueden ver evidencias storage"
on storage.objects for select to authenticated
using (bucket_id = 'evidencias');

-- 4) Realtime para que el tablero se actualice al momento.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='actividades'
  ) then
    alter publication supabase_realtime add table public.actividades;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='seguimientos'
  ) then
    alter publication supabase_realtime add table public.seguimientos;
  end if;
end $$;
