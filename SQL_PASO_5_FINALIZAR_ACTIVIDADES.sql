-- PASO 5 · Cierre de actividades
-- Ejecuta una sola vez en Supabase > SQL Editor

alter table public.actividades
add column if not exists cierre text;

-- No hacen falta políticas nuevas: las políticas UPDATE/SELECT de actividades ya aplican.
