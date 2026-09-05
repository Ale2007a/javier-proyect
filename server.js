const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DB_FILE = path.join(ROOT, 'data.json');
const UPLOADS = path.join(ROOT, 'uploads');

fs.mkdirSync(UPLOADS, { recursive: true });

/* =========================
   BASE DE DATOS
========================= */

function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function esc(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

let db;

if (fs.existsSync(DB_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (error) {
    console.error('Error leyendo data.json:', error);
    process.exit(1);
  }
} else {
  db = {
    settings: {
      site_name: 'Javier Proyect'
    },
    users: [],
    projects: []
  };

  db.users.push({
    id: 1,
    username: 'Ale2007a',
    password: bcrypt.hashSync('Ale2007', 12),
    role: 'admin'
  });

  save();
}

/* Asegurar estructura de la base de datos */

if (!db.settings) {
  db.settings = {
    site_name: 'Javier Proyect'
  };
}

if (!db.settings.site_name) {
  db.settings.site_name = 'Javier Proyect';
}

if (!Array.isArray(db.users)) {
  db.users = [];
}

if (!Array.isArray(db.projects)) {
  db.projects = [];
}

/* =========================
   PÁGINA BASE
========================= */

const appPage = (title, body, user) => `
<!doctype html>
<html lang="es">

<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">

<title>${esc(title)} · ${esc(db.settings.site_name)}</title>

<link rel="stylesheet" href="/style.css">
</head>

<body>

<header>

<a class="brand" href="/">
${esc(db.settings.site_name)}
</a>

<nav>

<a href="/">Inicio</a>

${
  user
    ? '<a href="/admin">Panel</a><a href="/logout">Salir</a>'
    : '<a href="/login">Admin</a>'
}

</nav>

</header>

<main>

${body}

</main>

<footer>
${esc(db.settings.site_name)} · Proyectos Arduino
</footer>

</body>
</html>
`;

/* =========================
   MIDDLEWARE
========================= */

app.use(
  express.urlencoded({
    extended: true,
    limit: '2mb'
  })
);

app.set('trust proxy', 1);

app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      'clave-secreta-javier-2026',

    resave: false,

    saveUninitialized: false,

    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: true
    }
  })
);

app.use(
  '/uploads',
  express.static(UPLOADS)
);

app.use(
  express.static(
    path.join(ROOT, 'public')
  )
);

/* =========================
   SUBIDA DE ARCHIVOS
========================= */

const storage = multer.diskStorage({

  destination: (req, file, cb) => {
    cb(null, UPLOADS);
  },

  filename: (req, file, cb) => {

    const safeName = file.originalname
      .replace(/[^a-zA-Z0-9._-]/g, '_');

    cb(
      null,
      Date.now() + '-' + safeName
    );
  }

});

const upload = multer({

  storage,

  limits: {
    fileSize: 8 * 1024 * 1024
  }

});

/* =========================
   AUTENTICACIÓN
========================= */

function auth(req, res, next) {

  if (!req.session.user) {
    return res.redirect('/login');
  }

  /*
    Actualizamos los datos del usuario
    desde data.json en cada petición.

    Esto permite que si un Admin cambia
    Editor -> Admin, el cambio se aplique.
  */

  const user = db.users.find(
    u => u.id === req.session.user.id
  );

  if (!user) {

    return req.session.destroy(() => {
      res.redirect('/login');
    });

  }

  req.session.user = {
    id: user.id,
    username: user.username,
    role: user.role
  };

  next();
}

function isAdmin(req, res, next) {

  auth(req, res, () => {

    if (req.session.user.role !== 'admin') {

      return res.status(403).send(
        appPage(
          '403',
          `
          <div class="card">
            <h1>Acceso denegado</h1>
            <p>No tienes permisos de administrador.</p>
            <a class="btn" href="/admin">
              Volver al panel
            </a>
          </div>
          `,
          req.session.user
        )
      );

    }

    next();

  });

}

/* =========================
   INICIO
========================= */

app.get('/', (req, res) => {

  const q = (req.query.q || '')
    .toLowerCase()
    .trim();

  const ps = db.projects.filter(p => {

    const title =
      (p.title || '').toLowerCase();

    const description =
      (p.description || '').toLowerCase();

    return (
      !q ||
      title.includes(q) ||
      description.includes(q)
    );

  });

  const cards = ps.map(p => `

<article class="project">

${
  p.image
    ? `
      <img
        src="/uploads/${esc(p.image)}"
        alt="${esc(p.title)}"
      >
      `
    : `
      <div class="placeholder">
        ARDUINO
      </div>
      `
}

<div class="pad">

<h2>${esc(p.title)}</h2>

<p>
${esc(p.description).slice(0, 180)}
</p>

<a
  class="btn"
  href="/project/${p.id}"
>
Ver proyecto →
</a>

</div>

</article>

`).join('');

  res.send(

    appPage(
      'Inicio',

      `

<section class="hero">

<span class="tag">
REPOSITORIO ARDUINO
</span>

<h1>
Aprende, crea y comparte proyectos.
</h1>

<p>
Diagramas, códigos, materiales y proyectos
en un solo lugar.
</p>

<form
  class="search"
  method="get"
  action="/"
>

<input
  name="q"
  value="${esc(req.query.q || '')}"
  placeholder="Buscar proyectos..."
>

<button>
Buscar
</button>

</form>

</section>


<section>

<div class="sectionhead">

<h2>
Proyectos publicados
</h2>

<span>
${ps.length} resultado(s)
</span>

</div>


<div class="grid">

${
  cards ||
  `
  <div class="card">
    <h3>Aún no hay proyectos</h3>
    <p>
      Publica el primero desde el panel.
    </p>
  </div>
  `
}

</div>

</section>

`,

      req.session.user
    )

  );

});

/* =========================
   VER PROYECTO
========================= */

app.get('/project/:id', (req, res) => {

  const p = db.projects.find(
    x => x.id === Number(req.params.id)
  );

  if (!p) {

    return res.status(404).send(

      appPage(
        'No encontrado',

        `
        <div class="card">
          <h1>Proyecto no encontrado</h1>
          <a class="btn" href="/">
            Volver al inicio
          </a>
        </div>
        `
      )

    );

  }

  res.send(

    appPage(

      p.title,

      `

<article class="detail">

<a href="/">
← Volver
</a>

<h1>
${esc(p.title)}
</h1>

<p class="lead">
${esc(p.description || '')}
</p>


${
  p.image
    ? `
      <img
        class="detailimg"
        src="/uploads/${esc(p.image)}"
        alt="${esc(p.title)}"
      >
      `
    : ''
}


${
  p.materials
    ? `
      <section class="box">

      <h2>
      🧰 Materiales
      </h2>

      <pre>
${esc(p.materials)}
      </pre>

      </section>
      `
    : ''
}


${
  p.diagram
    ? `
      <section class="box">

      <h2>
      🔌 Diagrama
      </h2>

      <img
        class="diagram"
        src="/uploads/${esc(p.diagram)}"
      >

      </section>
      `
    : ''
}


${
  p.code
    ? `
      <section class="box">

      <h2>
      💻 Código Arduino
      </h2>

      <pre class="code">
${esc(p.code)}
      </pre>

      </section>
      `
    : ''
}


${
  p.file
    ? `
      <p>

      <a
        class="btn"
        href="/uploads/${esc(p.file)}"
        download
      >
      Descargar archivo
      </a>

      </p>
      `
    : ''
}

</article>

`,

      req.session.user
    )

  );

});

/* =========================
   LOGIN
========================= */

app.get('/login', (req, res) => {

  res.send(

    appPage(

      'Administración',

      `

<div class="auth card">

<h1>
Panel de administración
</h1>

<form
  method="post"
  action="/login"
>

<label>

Usuario

<input
  name="username"
  required
>

</label>


<label>

Contraseña

<input
  type="password"
  name="password"
  required
>

</label>


<button>
Entrar
</button>

</form>

</div>

`

    )

  );

});


app.post('/login', (req, res) => {

  const username =
    (req.body.username || '').trim();

  const password =
    req.body.password || '';

  const u = db.users.find(
    x => x.username === username
  );

  if (
    !u ||
    !bcrypt.compareSync(
      password,
      u.password
    )
  ) {

    return res.status(401).send(

      appPage(

        'Error',

        `
        <div class="card">

          <h1>
          Datos incorrectos
          </h1>

          <a
            class="btn"
            href="/login"
          >
          Intentar de nuevo
          </a>

        </div>
        `

      )

    );

  }

  req.session.user = {

    id: u.id,

    username: u.username,

    role: u.role

  };

  res.redirect('/admin');

});


/* =========================
   LOGOUT
========================= */

app.get('/logout', (req, res) => {

  req.session.destroy(() => {

    res.redirect('/');

  });

});


/* =========================
   PANEL ADMIN
========================= */

app.get('/admin', auth, (req, res) => {

  const isAdminUser =
    req.session.user.role === 'admin';


  const rows = db.projects.map(p => `

<tr>

<td>
${esc(p.title)}
</td>

<td>

<a
  href="/project/${p.id}"
>
Ver
</a>

</td>


<td>

${
  isAdminUser
    ? `
      <form
        method="post"
        action="/admin/delete/${p.id}"
        onsubmit="return confirm('¿Eliminar proyecto?')"
      >

      <button class="danger">
      Eliminar
      </button>

      </form>
      `
    : ''
}

</td>

</tr>

`).join('');


  res.send(

    appPage(

      'Panel',

      `

<span class="tag">
ADMINISTRACIÓN
</span>

<h1>
Panel de ${esc(req.session.user.username)}
</h1>


<div class="adminnav">

<a
  class="btn"
  href="/admin/new"
>
+ Nuevo proyecto
</a>


<a
  class="btn secondary"
  href="/admin/account"
>
Mi cuenta
</a>


${
  isAdminUser
    ? `
      <a
        class="btn secondary"
        href="/admin/users"
      >
      Usuarios
      </a>

      <a
        class="btn secondary"
        href="/admin/settings"
      >
      Cambiar nombre
      </a>
      `
    : ''
}

</div>


<div class="card">

<h2>
Proyectos
</h2>

<table>

<tr>

<th>
Proyecto
</th>

<th>
</th>

<th>
</th>

</tr>

${
  rows ||
  `
  <tr>
    <td colspan="3">
      Sin proyectos
    </td>
  </tr>
  `
}

</table>

</div>

`,

      req.session.user
    )

  );

});


/* =========================
   FORMULARIO NUEVO PROYECTO
========================= */

const form = () => `

<div class="card">

<h1>
Nuevo proyecto
</h1>


<form
  method="post"
  enctype="multipart/form-data"
>


<label>

Nombre

<input
  name="title"
  required
>

</label>


<label>

Descripción

<textarea
  name="description"
></textarea>

</label>


<label>

Materiales

<textarea
  name="materials"
></textarea>

</label>


<label>

Código Arduino

<textarea
  name="code"
  class="codeinput"
></textarea>

</label>


<label>

Imagen

<input
  type="file"
  name="image"
  accept="image/*"
>

</label>


<label>

Diagrama

<input
  type="file"
  name="diagram"
  accept="image/*"
>

</label>


<label>

Archivo .ino

<input
  type="file"
  name="file"
  accept=".ino,.txt"
>

</label>


<button>
Publicar proyecto
</button>


</form>

</div>

`;


/* =========================
   NUEVO PROYECTO
========================= */

app.get('/admin/new', auth, (req, res) => {

  res.send(

    appPage(
      'Nuevo',
      form(),
      req.session.user
    )

  );

});


app.post(
  '/admin/new',
  auth,
  upload.fields([
    {
      name: 'image',
      maxCount: 1
    },
    {
      name: 'diagram',
      maxCount: 1
    },
    {
      name: 'file',
      maxCount: 1
    }
  ]),
  (req, res) => {

    try {

      const f = req.files || {};

      const title =
        (req.body.title || '').trim();

      if (!title) {

        return res.status(400).send(

          appPage(
            'Error',
            `
            <div class="card">
              <h1>
              El proyecto necesita un nombre.
              </h1>

              <a
                class="btn"
                href="/admin/new"
              >
              Volver
              </a>
            </div>
            `,
            req.session.user
          )

        );

      }

      const newId =
        db.projects.length
          ? Math.max(
              ...db.projects.map(x => x.id)
            ) + 1
          : 1;


      db.projects.push({

        id: newId,

        title: title,

        description:
          req.body.description || '',

        materials:
          req.body.materials || '',

        code:
          req.body.code || '',

        image:
          f.image?.[0]?.filename || '',

        diagram:
          f.diagram?.[0]?.filename || '',

        file:
          f.file?.[0]?.filename || ''

      });


      save();

      res.redirect('/admin');

    } catch (error) {

      console.error(
        'Error publicando proyecto:',
        error
      );

      res.status(500).send(

        appPage(
          'Error',
          `
          <div class="card">

            <h1>
            Error al publicar
            </h1>

            <p>
            No se pudo guardar el proyecto.
            </p>

            <a
              class="btn"
              href="/admin/new"
            >
            Volver
            </a>

          </div>
          `,
          req.session.user
        )

      );

    }

  }
);


/* =========================
   ELIMINAR PROYECTO
   SOLO ADMIN
========================= */

app.post(
  '/admin/delete/:id',
  isAdmin,
  (req, res) => {

    const id =
      Number(req.params.id);

    db.projects =
      db.projects.filter(
        p => p.id !== id
      );

    save();

    res.redirect('/admin');

  }
);


/* =========================
   MI CUENTA
========================= */

app.get(
  '/admin/account',
  auth,
  (req, res) => {

    const u = db.users.find(
      x => x.id === req.session.user.id
    );

    if (!u) {
      return res.redirect('/logout');
    }

    res.send(

      appPage(

        'Mi cuenta',

        `

<div class="card">

<h1>
Mi cuenta
</h1>


<form method="post">


<label>

Nuevo usuario

<input
  name="username"
  required
  value="${esc(u.username)}"
>

</label>


<label>

Contraseña actual

<input
  type="password"
  name="current_password"
  required
>

</label>


<label>

Nueva contraseña

<input
  type="password"
  name="new_password"
  minlength="8"
>

</label>


<label>

Repetir nueva contraseña

<input
  type="password"
  name="confirm_password"
  minlength="8"
>

</label>


<button>
Guardar cambios
</button>


</form>

</div>

`,

        req.session.user

      )

    );

  }
);


app.post(
  '/admin/account',
  auth,
  (req, res) => {

    const u = db.users.find(
      x => x.id === req.session.user.id
    );

    if (!u) {
      return res.redirect('/logout');
    }


    const currentPassword =
      req.body.current_password || '';

    const newPassword =
      req.body.new_password || '';

    const confirmPassword =
      req.body.confirm_password || '';

    const username =
      (req.body.username || '').trim();


    if (
      !bcrypt.compareSync(
        currentPassword,
        u.password
      )
    ) {

      return res.status(400).send(

        appPage(
          'Error',

          `
          <div class="card">

            <h1>
            Contraseña actual incorrecta
            </h1>

            <a
              class="btn"
              href="/admin/account"
            >
            Volver
            </a>

          </div>
          `,

          req.session.user
        )

      );

    }


    if (
      !username ||
      db.users.some(
        x =>
          x.id !== u.id &&
          x.username === username
      )
    ) {

      return res.status(400).send(

        appPage(
          'Error',

          `
          <div class="card">

            <h1>
            Usuario inválido o ya existente.
            </h1>

            <a
              class="btn"
              href="/admin/account"
            >
            Volver
            </a>

          </div>
          `,

          req.session.user
        )

      );

    }


    if (
      newPassword &&
      newPassword.length < 8
    ) {

      return res.status(400).send(

        appPage(
          'Error',

          `
          <div class="card">

            <h1>
            La nueva contraseña debe tener
            al menos 8 caracteres.
            </h1>

          </div>
          `,

          req.session.user
        )

      );

    }


    if (
      newPassword !== confirmPassword
    ) {

      return res.status(400).send(

        appPage(
          'Error',

          `
          <div class="card">

            <h1>
            Las contraseñas nuevas no coinciden.
            </h1>

          </div>
          `,

          req.session.user
        )

      );

    }


    u.username = username;


    if (newPassword) {

      u.password =
        bcrypt.hashSync(
          newPassword,
          12
        );

    }


    save();


    req.session.user.username =
      username;


    res.redirect('/admin');

  }
);


/* =========================
   CONFIGURACIÓN
   SOLO ADMIN
========================= */

app.get(
  '/admin/settings',
  isAdmin,
  (req, res) => {

    res.send(

      appPage(

        'Ajustes',

        `

<div class="card">

<h1>
Nombre de la página
</h1>


<form method="post">

<label>

Nombre

<input
  name="site_name"
  required
  value="${esc(db.settings.site_name)}"
>

</label>


<button>
Guardar nombre
</button>

</form>

</div>

`,

        req.session.user

      )

    );

  }
);


app.post(
  '/admin/settings',
  isAdmin,
  (req, res) => {

    const name =
      (req.body.site_name || '').trim();

    db.settings.site_name =
      name || 'Javier Proyect';

    save();

    res.redirect('/admin');

  }
);


/* =========================
   ADMINISTRAR USUARIOS
   SOLO ADMIN
========================= */

app.get(
  '/admin/users',
  isAdmin,
  (req, res) => {

    const rows = db.users.map(u => `

<tr>

<td>
${esc(u.username)}
</td>


<td>
${u.role === 'admin'
  ? 'Administrador'
  : 'Editor'}
</td>


<td>

${
  u.id === req.session.user.id

  ? '<strong>Tú</strong>'

  : `

<form
  method="post"
  action="/admin/users/role/${u.id}"
  style="display:inline"
>

<select
  name="role"
  onchange="this.form.submit()"
>

<option
  value="editor"
  ${u.role === 'editor' ? 'selected' : ''}
>
Editor
</option>


<option
  value="admin"
  ${u.role === 'admin' ? 'selected' : ''}
>
Administrador
</option>

</select>

</form>


<form
  method="post"
  action="/admin/users/delete/${u.id}"
  style="display:inline"
  onsubmit="return confirm('¿Eliminar usuario?')"
>

<button class="danger">
Eliminar
</button>

</form>

`
}

</td>

</tr>

`).join('');


    res.send(

      appPage(

        'Usuarios',

        `

<div class="card">

<h1>
Administrar usuarios
</h1>


<form method="post">


<label>

Usuario

<input
  name="username"
  required
>

</label>


<label>

Contraseña

<input
  type="password"
  name="password"
  minlength="8"
  required
>

</label>


<label>

Rol

<select name="role">

<option value="editor">
Editor
</option>

<option value="admin">
Administrador
</option>

</select>

</label>


<button>
Crear usuario
</button>


</form>

</div>


<div class="card">

<h2>
Usuarios
</h2>


<table>

<tr>

<th>
Usuario
</th>

<th>
Rol
</th>

<th>
Acciones
</th>

</tr>

${rows}

</table>

</div>

`,

        req.session.user

      )

    );

  }
);


/* =========================
   CREAR USUARIO
========================= */

app.post(
  '/admin/users',
  isAdmin,
  (req, res) => {

    const username =
      (req.body.username || '').trim();

    const password =
      req.bo