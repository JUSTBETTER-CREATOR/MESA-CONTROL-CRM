BETTER CONTROL V13.3 · CONECTADOS

NUEVO:
- Pestaña "🟢 Conectados".
- Muestra quién está conectado en el área activa.
- Muestra cuánto tiempo lleva conectado desde que abrió el CRM.
- También muestra última señal de usuarios desconectados.
- Ingrid GLOBAL puede cambiar de área y ver conexiones por área.
- Mantiene el FIX V13.2 de la relación actividades -> analistas.
- Mantiene buscador/creación rápida de actividades y GIF cute.

ANTES DE SUBIR A GITHUB:
1. Supabase > SQL Editor.
2. Ejecutar SQL_V13_3_CONECTADOS.sql.
3. Después reemplazar los archivos del repo por este paquete.
4. Esperar GitHub Pages y hacer Ctrl + F5.

NOTA:
- Se considera conectado si envió señal en los últimos 90 segundos.
- El navegador manda una señal cada 30 segundos.
- Al cerrar sesión se marca desconectado inmediatamente.
