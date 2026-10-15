-- BETTER CONTROL V13 · SOPORTE FRONTEND
-- Ejecutar una sola vez en Supabase SQL Editor.

begin;

-- Permitir el mismo nombre de actividad en áreas diferentes.
alter table public.tipos_actividad
  drop constraint if exists tipos_actividad_nombre_key;

drop index if exists public.tipos_actividad_nombre_key;

create unique index if not exists ux_tipos_actividad_area_nombre
on public.tipos_actividad (area_id, upper(nombre));

-- Lectura de tipos de seguimiento para usuarios autenticados.
alter table public.tipos_seguimiento enable row level security;
drop policy if exists "tipos_seguimiento_select_authenticated" on public.tipos_seguimiento;
create policy "tipos_seguimiento_select_authenticated"
on public.tipos_seguimiento for select to authenticated using (true);

commit;
