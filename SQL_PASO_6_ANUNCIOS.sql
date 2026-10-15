-- PASO 6 · Anuncios compartidos
-- Ejecuta una sola vez en Supabase > SQL Editor

create table if not exists public.anuncios (
    id uuid primary key default gen_random_uuid(),
    mensaje text not null,
    autor_id uuid not null references public.analistas(id) on delete restrict,
    activo boolean not null default true,
    created_at timestamptz not null default now()
);

alter table public.anuncios enable row level security;

-- Todos los usuarios autenticados pueden leer anuncios.
drop policy if exists "usuarios autenticados pueden ver anuncios" on public.anuncios;
create policy "usuarios autenticados pueden ver anuncios"
on public.anuncios for select to authenticated
using (true);

-- Solo el perfil MARIELA puede publicar.
drop policy if exists "mariela puede crear anuncios" on public.anuncios;
create policy "mariela puede crear anuncios"
on public.anuncios for insert to authenticated
with check (
  exists (
    select 1 from public.analistas a
    where a.id = autor_id
      and a.user_id = auth.uid()
      and upper(a.nombre) = 'MARIELA'
      and a.activo = true
  )
);

-- Solo MARIELA puede cerrar/reactivar anuncios.
drop policy if exists "mariela puede actualizar anuncios" on public.anuncios;
create policy "mariela puede actualizar anuncios"
on public.anuncios for update to authenticated
using (
  exists (
    select 1 from public.analistas a
    where a.user_id = auth.uid()
      and upper(a.nombre) = 'MARIELA'
      and a.activo = true
  )
)
with check (
  exists (
    select 1 from public.analistas a
    where a.user_id = auth.uid()
      and upper(a.nombre) = 'MARIELA'
      and a.activo = true
  )
);

-- Realtime para que aparezcan sin recargar.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='anuncios'
  ) then
    alter publication supabase_realtime add table public.anuncios;
  end if;
end $$;
