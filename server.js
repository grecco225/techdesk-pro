/**
 * TechDesk Pro — Servidor Principal
 * Sistema de Gestión de Soporte Técnico (Help Desk)
 */

require('dotenv').config();
const express    = require('express');
const path       = require('path');
const session    = require('express-session');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const SqliteStore  = require('connect-sqlite3')(session);

// ── Inicializar BD (crea tablas si no existen) ─────────────────
const db = require('./src/db');

// ── Importar módulo Gemini original (MANTENER) ─────────────────
const { generarTicket } = require('./src/gemini');

// ── Rutas ──────────────────────────────────────────────────────
const authRoutes   = require('./src/routes/auth.routes');
const ticketRoutes = require('./src/routes/tickets.routes');
const adminRoutes  = require('./src/routes/admin.routes');
const ticRoutes    = require('./src/routes/tic.routes');

// ── Middleware ─────────────────────────────────────────────────
const { requireAuth } = require('./src/middleware/auth.middleware');
const { csrfSetToken, csrfValidate } = require('./src/middleware/csrf.middleware');

const app  = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 8005;

// ══════════════════════════════════════════════════════════════
// SEGURIDAD — Headers HTTP
// ══════════════════════════════════════════════════════════════
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com'],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:  ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'],
      fontSrc:   ["'self'", 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'],
      imgSrc:    ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", 'cdn.jsdelivr.net'],
    }
  },
  crossOriginEmbedderPolicy: false
}));

// ══════════════════════════════════════════════════════════════
// RATE LIMITING GLOBAL
// ══════════════════════════════════════════════════════════════
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta más tarde.' }
});
app.use(globalLimiter);

// ══════════════════════════════════════════════════════════════
// PARSERS
// ══════════════════════════════════════════════════════════════
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());

// ══════════════════════════════════════════════════════════════
// SESIONES SEGURAS
// ══════════════════════════════════════════════════════════════
const dataDir = path.join(__dirname, 'data');
require('fs').mkdirSync(dataDir, { recursive: true });

app.use(session({
  store: new SqliteStore({
    db: 'sessions.db',
    dir: dataDir,
    table: 'sessions'
  }),
  name: 'techdesk.sid',
  secret: process.env.SESSION_SECRET || 'techdesk-super-secret-change-in-production-' + Math.random(),
  resave: false,
  saveUninitialized: false,
  rolling: true, // Reinicia el maxAge de la cookie con cada request (soporte de inactividad)
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 30 * 60 * 1000, // 30 minutos de inactividad
    sameSite: 'lax'
  }
}));

// ══════════════════════════════════════════════════════════════
// ARCHIVOS ESTÁTICOS — Solo CSS, JS, imágenes (NO archivos HTML)
// Los HTML protegidos se sirven ÚNICAMENTE a través de rutas con requireAuth
// ══════════════════════════════════════════════════════════════
app.use(express.static(path.join(__dirname, 'public'), {
  index: false, // No servir index.html automáticamente
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
  // Bloquear acceso directo a archivos HTML sensibles
  extensions: ['css', 'js', 'png', 'jpg', 'svg', 'ico', 'woff', 'woff2', 'ttf']
}));

// ══════════════════════════════════════════════════════════════
// CSRF — Protección contra Cross-Site Request Forgery
// ══════════════════════════════════════════════════════════════
app.use(csrfSetToken);   // Genera/renueva token en cookie _csrf
app.use(csrfValidate);   // Valida x-csrf-token en POST/PUT/PATCH/DELETE

// Endpoint para que el frontend obtenga el token CSRF
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: req._csrfToken });
});

// ══════════════════════════════════════════════════════════════
// API RUTAS
// ══════════════════════════════════════════════════════════════
app.use('/auth',    authRoutes);
app.use('/tickets', ticketRoutes);
app.use('/admin',   adminRoutes);
app.use('/tic',     ticRoutes);

// ── Endpoint IA Gemini (MANTENER compatibilidad original) ──────
const aiRateLimit = rateLimit({ windowMs: 60 * 1000, max: 10, message: { error: 'Límite de solicitudes IA alcanzado. Espera un minuto.' } });
app.post('/api/generar-ticket', requireAuth, aiRateLimit, async (req, res) => {
  try {
    const { descripcion } = req.body;
    if (!descripcion || descripcion.trim().length < 5) {
      return res.status(400).json({ error: 'Describe el problema con al menos algunas palabras.' });
    }
    const ticket = await generarTicket(descripcion);
    res.json(ticket);
  } catch (err) {
    console.error('Error generando ticket IA:', err.message);
    res.status(500).json({ error: 'Error al generar ticket con IA. Intenta de nuevo.' });
  }
});

// ── Endpoint de categorías y departamentos (sin auth para formularios) ─
app.get('/api/form-data', requireAuth, (req, res) => {
  const categories    = db.prepare(`SELECT * FROM categories WHERE active = 1 ORDER BY name`).all();
  const subcategories = db.prepare(`SELECT * FROM subcategories WHERE active = 1`).all();
  const priorities    = db.prepare(`SELECT * FROM priorities ORDER BY level`).all();
  const departments   = db.prepare(`SELECT id, name FROM departments WHERE active = 1`).all();
  const ticUsers      = db.prepare(`SELECT id, name FROM users WHERE role = 'tic' AND active = 1`).all();
  res.json({ categories, subcategories, priorities, departments, ticUsers });
});

// ══════════════════════════════════════════════════════════════
// RUTAS DE PÁGINAS (SPA-like)
// IMPORTANTE: Estas rutas deben estar ANTES del static middleware
// para que los archivos HTML nunca sean accesibles directamente.
// ══════════════════════════════════════════════════════════════

// Ruta raíz → redirige a login o dashboard según sesión
app.get('/', (req, res) => {
  if (req.session?.userId) {
    return res.redirect('/dashboard');
  }
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  if (req.session?.userId) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/tickets*', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/admin*', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/tic*', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Bloquear acceso directo a archivos HTML protegidos (Bug #5 — defensa en profundidad)
app.get('*.html', (req, res) => {
  const publicHtmlFiles = ['/login.html', '/reset-password.html', '/403.html'];
  if (publicHtmlFiles.includes(req.path)) {
    return res.sendFile(path.join(__dirname, 'public', req.path));
  }
  // Cualquier otro .html requiere autenticación → redirigir a login
  if (!req.session?.userId) {
    return res.redirect('/login');
  }
  return res.redirect('/');
});

// ── Página de error 403 ────────────────────────────────────────
app.get('/403', (req, res) => {
  res.status(403).sendFile(path.join(__dirname, 'public', '403.html'));
});

// ── Health check (Kubernetes) ──────────────────────────────────
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── 404 handler ────────────────────────────────────────────────
app.use((req, res) => {
  if (req.accepts('html')) {
    res.redirect('/');
  } else {
    res.status(404).json({ error: 'Ruta no encontrada' });
  }
});

// ── Error handler global ───────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Error global:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ══════════════════════════════════════════════════════════════
// INICIALIZAR SERVIDOR
// ══════════════════════════════════════════════════════════════
app.listen(PORT, async () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║       🎫 TechDesk Pro v1.0               ║');
  console.log('║  Sistema de Gestión de Soporte Técnico   ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  🌐 http://localhost:${PORT}               ║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  // Verificar si hay usuarios; si no, ejecutar seed
  const userCount = db.prepare(`SELECT COUNT(*) as c FROM users`).get().c;
  if (userCount === 0) {
    console.log('⚙️  Primera ejecución — Inicializando datos...');
    const { execSync } = require('child_process');
    try {
      execSync('node src/db/seed.js', { stdio: 'inherit', cwd: __dirname });
    } catch (e) {
      console.error('Error en seed automático:', e.message);
    }
  }
});
