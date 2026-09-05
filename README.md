# Javier Proyect — versión corregida

Esta versión evita `better-sqlite3`/`node-gyp`, que causó el error durante `npm install` con Node.js 24.

En la carpeta del proyecto ejecuta:
1. `npm install`
2. `npm start`
3. Abre `http://localhost:3000`

El primer inicio crea el administrador configurado para este proyecto. Después puedes cambiar usuario y contraseña desde **Panel → Mi cuenta**.

Los proyectos y usuarios se guardan en `data.json` y las imágenes/archivos en `uploads`.
