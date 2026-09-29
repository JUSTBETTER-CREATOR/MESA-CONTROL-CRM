MESA DE CONTROL CRM V3 - GITHUB PAGES + SUPABASE

1. En Supabase > SQL Editor ejecuta SQL_PASO_4_SUPABASE.sql.
2. Reemplaza en GitHub los archivos index.html, styles.css, app.js y agrega config.js.
3. Conserva la carpeta assets/catalogs.js.
4. Espera a que GitHub Pages publique los cambios.
5. Entra con el usuario creado en Supabase Authentication.
6. Una sola vez: abre Catálogos y carga la ASISTENCIA actual y la BASE DE TIENDAS actual.
7. Desde ese momento, personas, tiendas, actividades y seguimientos se comparten entre usuarios.

IMPORTANTE:
- config.js contiene una PUBLISHABLE KEY de Supabase. Está diseñada para usarse públicamente en el navegador.
- NO pongas jamás una secret key o service_role key en GitHub.


V4 - FINALIZACION DE ACTIVIDADES
1. Ejecutar SQL_PASO_5_FINALIZAR_ACTIVIDADES.sql en Supabase.
2. Reemplazar index.html, app.js y styles.css en GitHub.
3. Al finalizar una actividad se guarda hora fin, duracion y cierre opcional.
4. En Inicio aparecen las finalizadas recientemente con estado FINALIZADA.
