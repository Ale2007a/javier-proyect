const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const BUCKET = 'project-files';
const DAYS = 30;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY en las variables de entorno.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

const asyncHandler = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

let siteName = 'Javier Proyect';

function esc(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function appPage(title, body, user) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ${esc(siteName)}</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header>
<a class="brand" href="/">${esc(siteName)}</a>
<nav>
<a href="/">Inicio</a>
${user ? '<a href="/admin">Panel</a><a href="/logout">Salir</a>' : '<a href="/login">Admin</a>'}
</nav>
</header>
<main>${body}</main>
<footer>${esc(siteName)} · Proyectos Arduino</footer>
</body>
</html>`;
}

function auth(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/login');
}

function isAdmin(req, res, next) {
  if (req.session.user?.role === 'admin') return next();
  res.status(403).send(
    appPage('403', '<div class="card"><h1>Acceso denegado</h1></div>', req.session.user)
  );
}

function safeName(name = 'archivo') {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function publicFileUrl(filePath) {
  if (!filePath) return '';
  return supabase.storage.from(BUCKET).getPublicUrl(filePath).data.publicUrl;
}

async function uploadFile(file) {
  if (!file) return '';

  const filePath =
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeName(file.originalname)}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, file.buffer, {
      contentType: file.mimetype || 'application/octet-stream',
      upsert: false
    });

  if (error) throw error;
  return filePath;
}

async function removeFiles(paths) {
  const clean = paths.filter(Boolean);
  if (!clean.length) return;

  const { error } = await supabase.storage.from(BUCKET).remove(clean);
  if (error) console.error('No se pudieron borrar algunos archivos:', error.message);
}

async function ensureInitialData() {
  const { data: settings, error: settingsError } = await supabase
    .from('settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (settingsError) throw settingsError;

  if (!settings) {
    const { error } = await supabase
      .from('settings')
      .insert({ id: 1, site_name: 'Javier Proyect' });

    if (error) throw error;
    siteName = 'Javier Proyect';
  } else {
    siteName = settings.site_name || 'Javier Proyect';
  }

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id')
    .limit(1);

  if (usersError) throw usersError;

  if (!users || users.length === 0) {
    const initialPassword =
      process.env.INITIAL_ADMIN_PASSWORD || 'Ale2007';

    const { error } = await supabase
      .from('users')
      .insert({
        username: 'Ale2007a',
        password: bcrypt.hashSync(initialPassword, 12),
        role: 'admin'
      });

    if (error) throw error;

    console.log('Usuario administrador inicial creado: Ale2007a');
  }
}

app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.set('trust proxy', 1);

app.use(session({
  secret: process.env.SESSION_SECRET || 'cambia-esta-clave-en-render',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  const now = new Date().toISOString();

  const { data: projects, error } = await supabase
    .from('projects')
    .select('*')
    .gt('expires_at', now)
    .order('published_at', { ascending: false });

  if (error) throw error;

  const ps = (projects || []).filter(p =>
    !q ||
    String(p.title || '').toLowerCase().includes(q) ||
    String(p.description || '').toLowerCase().includes(q)
  );

  const cards = ps.map(p => {
    const imageUrl = publicFileUrl(p.image);

    return `<article class="project">
${imageUrl ? `<img src="${esc(imageUrl)}" alt="">` : '<div class="placeholder">ARDUINO</div>'}
<div class="pad">
<h2>${esc(p.title)}</h2>
<p>${esc(p.description).slice(0, 180)}</p>
<a class="btn" href="/project/${p.id}">Ver proyecto →</a>
</div>
</article>`;
  }).join('');

  res.send(appPage('Inicio', `
<section class="hero">
<span class="tag">REPOSITORIO ARDUINO</span>
<h1>Aprende, crea y comparte proyectos.</h1>
<p>Diagramas, códigos, materiales y proyectos en un solo lugar.</p>
<form class="search">
<input name="q" value="${esc(req.query.q || '')}" placeholder="Buscar proyectos...">
<button>Buscar</button>
</form>
</section>
<section>
<div class="sectionhead">
<h2>Proyectos publicados</h2>
<span>${ps.length} resultado(s)</span>
</div>
<div class="grid">
${cards || '<div class="card"><h3>Aún no hay proyectos</h3><p>Publica el primero desde el panel.</p></div>'}
</div>
</section>`, req.session.user));
}));

app.get('/project/:id', asyncHandler(async (req, res) => {
  const { data: p, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', Number(req.params.id))
    .maybeSingle();

  if (error) throw error;

  if (!p || new Date(p.expires_at) <= new Date()) {
    return res.status(404).send(
      appPage(
        'No encontrado',
        '<div class="card"><h1>Proyecto no encontrado o publicación expirada</h1></div>',
        req.session.user
      )
    );
  }

  const imageUrl = publicFileUrl(p.image);
  const diagramUrl = publicFileUrl(p.diagram);
  const fileUrl = publicFileUrl(p.file);

  res.send(appPage(p.title, `
<article class="detail">
<a href="/">← Volver</a>
<h1>${esc(p.title)}</h1>
<p class="lead">${esc(p.description)}</p>
${imageUrl ? `<img class="detailimg" src="${esc(imageUrl)}" alt="">` : ''}
${p.materials ? `<section class="box"><h2>🧰 Materiales</h2><pre>${esc(p.materials)}</pre></section>` : ''}
${diagramUrl ? `<section class="box"><h2>🔌 Diagrama</h2><img class="diagram" src="${esc(diagramUrl)}"></section>` : ''}
${p.code ? `<section class="box"><h2>💻 Código Arduino</h2><pre class="code">${esc(p.code)}</pre></section>` : ''}
${fileUrl ? `<p><a class="btn" href="${esc(fileUrl)}" target="_blank" rel="noopener">Descargar archivo</a></p>` : ''}
</article>`, req.session.user));
}));

app.get('/login', (req, res) => res.send(appPage('Administración', `
<div class="auth card">
<h1>Panel de administración</h1>
<form method="post" action="/login">
<label>Usuario<input name="username" required></label>
<label>Contraseña<input type="password" name="password" required></label>
<button>Entrar</button>
</form>
</div>`, req.session.user)));

app.post('/login', asyncHandler(async (req, res) => {
  const username = String(req.body.username || '').trim();

  const { data: u, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .maybeSingle();

  if (error) throw error;

  if (!u || !bcrypt.compareSync(req.body.password || '', u.password)) {
    return res.status(401).send(
      appPage(
        'Error',
        '<div class="card"><h1>Datos incorrectos</h1><a href="/login">Intentar de nuevo</a></div>'
      )
    );
  }

  req.session.user = {
    id: u.id,
    username: u.username,
    role: u.role
  };

  res.redirect('/admin');
}));

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get('/admin', auth, asyncHandler(async (req, res) => {
  const { data: projects, error } = await supabase
    .from('projects')
    .select('*')
    .order('published_at', { ascending: false });

  if (error) throw error;

  const rows = (projects || []).map(p => {
    const expired = new Date(p.expires_at) <= new Date();

    return `<tr>
<td>${esc(p.title)}</td>
<td>${expired ? '<strong>Expirado</strong>' : 'Activo'}</td>
<td><a href="/project/${p.id}">Ver</a></td>
<td>
${expired
  ? `<form method="post" action="/admin/republish/${p.id}" style="display:inline"><button>Volver a publicar</button></form>`
  : ''}
<form method="post" action="/admin/delete/${p.id}" style="display:inline" onsubmit="return confirm('¿Eliminar proyecto?')">
<button class="danger">Eliminar</button>
</form>
</td>
</tr>`;
  }).join('');

  res.send(appPage('Panel', `
<span class="tag">ADMINISTRACIÓN</span>
<h1>Panel de ${esc(req.session.user.username)}</h1>
<div class="adminnav">
<a class="btn" href="/admin/new">+ Nuevo proyecto</a>
<a class="btn secondary" href="/admin/account">Mi cuenta</a>
${req.session.user.role === 'admin'
  ? '<a class="btn secondary" href="/admin/users">Usuarios</a><a class="btn secondary" href="/admin/settings">Cambiar nombre</a>'
  : ''}
</div>
<div class="card">
<h2>Proyectos</h2>
<table>
<tr><th>Proyecto</th><th>Estado</th><th></th><th>Acciones</th></tr>
${rows || '<tr><td colspan="4">Sin proyectos</td></tr>'}
</table>
</div>`, req.session.user));
}));

const form = () => `<div class="card">
<h1>Nuevo proyecto</h1>
<p>La publicación permanecerá activa durante 30 días.</p>
<form method="post" enctype="multipart/form-data">
<label>Nombre<input name="title" required></label>
<label>Descripción<textarea name="description"></textarea></label>
<label>Materiales<textarea name="materials"></textarea></label>
<label>Código Arduino<textarea name="code" class="codeinput"></textarea></label>
<label>Imagen<input type="file" name="image" accept="image/*"></label>
<label>Diagrama<input type="file" name="diagram" accept="image/*"></label>
<label>Archivo .ino<input type="file" name="file" accept=".ino,.txt"></label>
<button>Publicar proyecto</button>
</form>
</div>`;

app.get('/admin/new', auth, (req, res) =>
  res.send(appPage('Nuevo', form(), req.session.user))
);

app.post('/admin/new', auth, upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'diagram', maxCount: 1 },
  { name: 'file', maxCount: 1 }
]), asyncHandler(async (req, res) => {
  const f = req.files || {};

  const image = await uploadFile(f.image?.[0]);
  const diagram = await uploadFile(f.diagram?.[0]);
  const file = await uploadFile(f.file?.[0]);

  const publishedAt = new Date();
  const expiresAt = new Date(
    publishedAt.getTime() + DAYS * 24 * 60 * 60 * 1000
  );

  const { error } = await supabase
    .from('projects')
    .insert({
      title: req.body.title || 'Sin título',
      description: req.body.description || '',
      materials: req.body.materials || '',
      code: req.body.code || '',
      image,
      diagram,
      file,
      published_at: publishedAt.toISOString(),
      expires_at: expiresAt.toISOString()
    });

  if (error) {
    await removeFiles([image, diagram, file]);
    throw error;
  }

  res.redirect('/admin');
}));

app.post('/admin/delete/:id', auth, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);

  const { data: project, error: findError } = await supabase
    .from('projects')
    .select('image, diagram, file')
    .eq('id', id)
    .maybeSingle();

  if (findError) throw findError;

  if (project) {
    await removeFiles([
      project.image,
      project.diagram,
      project.file
    ]);
  }

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id);

  if (error) throw error;

  res.redirect('/admin');
}));

app.post('/admin/republish/:id', auth, asyncHandler(async (req, res) => {
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + DAYS * 24 * 60 * 60 * 1000
  );

  const { error } = await supabase
    .from('projects')
    .update({
      published_at: now.toISOString(),
      expires_at: expiresAt.toISOString()
    })
    .eq('id', Number(req.params.id));

  if (error) throw error;

  res.redirect('/admin');
}));

app.get('/admin/account', auth, asyncHandler(async (req, res) => {
  const { data: u, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', req.session.user.id)
    .maybeSingle();

  if (error) throw error;

  if (!u) {
    req.session.destroy(() => res.redirect('/login'));
    return;
  }

  res.send(appPage('Mi cuenta', `
<div class="card">
<h1>Mi cuenta</h1>
<form method="post">
<label>
Nuevo usuario
<input name="username" required value="${esc(u.username)}">
</label>

<label>
Contraseña actual
<input type="password" name="current_password" required>
</label>

<label>
Nueva contraseña
<input type="password" name="new_password" minlength="8">
</label>

<label>
Repetir nueva contraseña
<input type="password" name="confirm_password" minlength="8">
</label>

<button>Guardar cambios</button>
</form>
</div>`, req.session.user));
}));

app.post('/admin/account', auth, asyncHandler(async (req, res) => {
  const { data: u, error: findError } = await supabase
    .from('users')
    .select('*')
    .eq('id', req.session.user.id)
    .maybeSingle();

  if (findError) throw findError;

  if (!u) {
    return res.status(404).send(
      appPage(
        'Error',
        '<div class="card"><h1>Usuario no encontrado</h1></div>',
        req.session.user
      )
    );
  }

  const currentPassword = req.body.current_password || '';
  const newPassword = req.body.new_password || '';
  const confirmPassword = req.body.confirm_password || '';
  const username = (req.body.username || '').trim();

  if (!bcrypt.compareSync(currentPassword, u.password)) {
    return res.status(400).send(
      appPage(
        'Error',
        '<div class="card"><h1>Contraseña actual incorrecta</h1></div>',
        req.session.user
      )
    );
  }

  const { data: sameUser, error: sameError } = await supabase
    .from('users')
    .select('id')
    .eq('username', username)
    .neq('id', u.id)
    .maybeSingle();

  if (sameError) throw sameError;

  if (!username || sameUser) {
    return res.status(400).send(
      appPage(
        'Error',
        '<div class="card"><h1>Usuario inválido o ya existente.</h1></div>',
        req.session.user
      )
    );
  }

  if (newPassword && newPassword.length < 8) {
    return res.status(400).send(
      appPage(
        'Error',
        '<div class="card"><h1>La nueva contraseña debe tener al menos 8 caracteres.</h1></div>',
        req.session.user
      )
    );
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).send(
      appPage(
        'Error',
        '<div class="card"><h1>Las nuevas contraseñas no coinciden.</h1></div>',
        req.session.user
      )
    );
  }

  const updateData = {
    username
  };

  if (newPassword) {
    updateData.password = bcrypt.hashSync(newPassword, 12);
  }

  const { error } = await supabase
    .from('users')
    .update(updateData)
    .eq('id', u.id);

  if (error) throw error;

  req.session.user.username = username;

  res.redirect('/admin');
}));

app.get('/admin/settings', isAdmin, asyncHandler(async (req, res) => {
  res.send(appPage('Ajustes', `
<div class="card">
<h1>Nombre de la página</h1>
<form method="post">
<label>
Nombre
<input name="site_name" required value="${esc(siteName)}">
</label>
<button>Guardar nombre</button>
</form>
</div>`, req.session.user));
}));

app.post('/admin/settings', isAdmin, asyncHandler(async (req, res) => {
  const newName = (req.body.site_name || 'Javier Proyect').trim() || 'Javier Proyect';

  const { error } = await supabase
    .from('settings')
    .update({ site_name: newName })
    .eq('id', 1);

  if (error) throw error;

  siteName = newName;

  res.redirect('/admin');
}));

app.get('/admin/users', isAdmin, asyncHandler(async (req, res) => {
  const { data: users, error } = await supabase
    .from('users')
    .select('id, username, role')
    .order('id', { ascending: true });

  if (error) throw error;

  const rows = (users || []).map(u => {
    if (u.id === req.session.user.id) {
      return `<tr>
<td>${esc(u.username)}</td>
<td>${esc(u.role)}</td>
<td>Tú</td>
</tr>`;
    }

    return `<tr>
<td>${esc(u.username)}</td>
<td>${esc(u.role)}</td>
<td>
<form method="post" action="/admin/users/role/${u.id}" style="display:inline">
<select name="role" onchange="this.form.submit()">
<option value="editor" ${u.role === 'editor' ? 'selected' : ''}>Editor</option>
<option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrador</option>
</select>
</form>

<form method="post" action="/admin/users/delete/${u.id}" style="display:inline" onsubmit="return confirm('¿Eliminar este usuario?')">
<button class="danger">Eliminar</button>
</form>
</td>
</tr>`;
  }).join('');

  res.send(appPage('Usuarios', `
<div class="card">
<h1>Administrar usuarios</h1>

<form method="post">
<label>
Usuario
<input name="username" required>
</label>

<label>
Contraseña
<input type="password" name="password" minlength="8" required>
</label>

<label>
Rol
<select name="role">
<option value="editor">Editor</option>
<option value="admin">Administrador</option>
</select>
</label>

<button>Crear usuario</button>
</form>
</div>

<div class="card">
<h2>Usuarios</h2>
<table>
<tr>
<th>Usuario</th>
<th>Rol</th>
<th>Acciones</th>
</tr>
${rows || '<tr><td colspan="3">Sin usuarios</td></tr>'}
</table>
</div>`, req.session.user));
}));

app.post('/admin/users', isAdmin, asyncHandler(async (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';
  const role = req.body.role === 'admin' ? 'admin' : 'editor';

  if (!username || password.length < 8) {
    return res.status(400).send(
      appPage(
        'Error',
        '<div class="card"><h1>Usuario o contraseña no válidos.</h1></div>',
        req.session.user
      )
    );
  }

  const { data: existing, error: existingError } = await supabase
    .from('users')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) {
    return res.status(400).send(
      appPage(
        'Error',
        '<div class="card"><h1>Ese usuario ya existe.</h1></div>',
        req.session.user
      )
    );
  }

  const { error } = await supabase
    .from('users')
    .insert({
      username,
      password: bcrypt.hashSync(password, 12),
      role
    });

  if (error) throw error;

  res.redirect('/admin/users');
}));

app.post('/admin/users/role/:id', isAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);

  if (id === req.session.user.id) {
    return res.status(400).send(
      appPage(
        'Error',
        '<div class="card"><h1>No puedes cambiar tu propio rol</h1></div>',
        req.session.user
      )
    );
  }

  if (req.body.role !== 'admin' && req.body.role !== 'editor') {
    return res.status(400).send(
      appPage(
        'Error',
        '<div class="card"><h1>Rol no válido</h1></div>',
        req.session.user
      )
    );
  }

  const { data: user, error: findError } = await supabase
    .from('users')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (findError) throw findError;

  if (!user) {
    return res.status(404).send(
      appPage(
        'Error',
        '<div class="card"><h1>Usuario no encontrado</h1></div>',
        req.session.user
      )
    );
  }

  const { error } = await supabase
    .from('users')
    .update({ role: req.body.role })
    .eq('id', id);

  if (error) throw error;

  res.redirect('/admin/users');
}));

app.post('/admin/users/delete/:id', isAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);

  if (id === req.session.user.id) {
    return res.status(400).send(
      appPage(
        'Error',
        '<div class="card"><h1>No puedes eliminar tu propio usuario</h1></div>',
        req.session.user
      )
    );
  }

  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', id);

  if (error) throw error;

  res.redirect('/admin/users');
}));

app.use((err, req, res, next) => {
  console.error(err);

  let message = 'Ocurrió un error en el servidor.';

  if (err instanceof multer.MulterError) {
    message = err.code === 'LIMIT_FILE_SIZE'
      ? 'El archivo es demasiado grande. Máximo permitido: 8 MB.'
      : `Error al subir el archivo: ${err.message}`;
  } else if (err.message) {
    message = err.message;
  }

  res.status(500).send(
    appPage(
      'Error',
      `<div class="card">
<h1>Error</h1>
<p>${esc(message)}</p>
<a href="/">Volver</a>
</div>`,
      req.session.user
    )
  );
});

async function start() {
  await ensureInitialData();

  app.listen(PORT, () => {
    console.log('Javier Proyect en http://localhost:' + PORT);
  });
}

start().catch(err => {
  console.error('No se pudo iniciar el servidor:', err);
  process.exit(1);
});