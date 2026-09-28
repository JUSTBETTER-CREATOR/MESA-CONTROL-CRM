MESA DE CONTROL CRM - V2

1) Abre index.html con Chrome/Edge.
2) El prototipo ya trae precargados los catálogos extraídos de:
   - ASISTENCIA_INVEX_27 09 2026.xlsx
   - BASE DE TIENDAS INVEX_22-09-2026 RANKING (3).xlsx
3) En Catálogos puedes cargar versiones nuevas de ambos archivos. El historial local no se borra.
4) Los datos operativos del prototipo se guardan en el navegador (localStorage) y las evidencias en IndexedDB.
5) Para que varias computadoras vean lo mismo en tiempo real, la siguiente fase es conectar Supabase/Firebase. Esta V2 sirve para validar el flujo y diseño antes de conectar backend.
6) Chart.js y SheetJS se cargan desde CDN, por lo que se necesita internet para estadísticas y carga de Excel.
