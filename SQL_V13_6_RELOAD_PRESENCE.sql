-- Ejecuta esto si "Conectados" dice que no encuentra public.crm_presence.
-- Si aún no corriste SQL_V13_3_CONECTADOS.sql, ejecútalo primero.
notify pgrst, 'reload schema';

select to_regclass('public.crm_presence') as crm_presence_table;
