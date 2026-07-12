/**
 * TechDesk Pro — Base de Datos SQLite
 * Esquema completo con todas las tablas del sistema
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Directorio de datos
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const db = new Database(path.join(dataDir, 'techdesk.db'));

// Optimizaciones de rendimiento
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

// ══════════════════════════════════════════════════════════════
// TABLAS PRINCIPALES
// ══════════════════════════════════════════════════════════════

db.exec(`
  -- Departamentos
  CREATE TABLE IF NOT EXISTS departments (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL UNIQUE,
    code      TEXT NOT NULL UNIQUE,
    description TEXT,
    active    INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Usuarios
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK(role IN ('admin', 'tic', 'employee')),
    department_id INTEGER REFERENCES departments(id),
    phone         TEXT,
    avatar        TEXT,
    active        INTEGER NOT NULL DEFAULT 1,
    suspended     INTEGER NOT NULL DEFAULT 0,
    remember_token TEXT,
    reset_token    TEXT,
    reset_token_expires TEXT,
    login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until   TEXT,
    last_login     TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at     TEXT
  );

  -- Categorías de tickets
  CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT,
    icon        TEXT DEFAULT 'tag',
    color       TEXT DEFAULT '#4f46e5',
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Subcategorías
  CREATE TABLE IF NOT EXISTS subcategories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    name        TEXT NOT NULL,
    active      INTEGER NOT NULL DEFAULT 1
  );

  -- Prioridades
  CREATE TABLE IF NOT EXISTS priorities (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL UNIQUE,
    level INTEGER NOT NULL,
    color TEXT NOT NULL,
    sla_hours INTEGER NOT NULL DEFAULT 24
  );

  -- Tickets
  CREATE TABLE IF NOT EXISTS tickets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    code            TEXT NOT NULL UNIQUE,
    title           TEXT NOT NULL,
    description     TEXT NOT NULL,
    category_id     INTEGER REFERENCES categories(id),
    subcategory_id  INTEGER REFERENCES subcategories(id),
    priority_id     INTEGER NOT NULL REFERENCES priorities(id),
    status          TEXT NOT NULL DEFAULT 'nuevo'
                    CHECK(status IN ('nuevo','en_revision','en_proceso','pendiente','esperando_usuario','resuelto','cerrado')),
    requester_id    INTEGER NOT NULL REFERENCES users(id),
    department_id   INTEGER REFERENCES departments(id),
    assigned_to     INTEGER REFERENCES users(id),
    due_date        TEXT,
    resolved_at     TEXT,
    closed_at       TEXT,
    resolution_time INTEGER,
    ai_suggested    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at      TEXT
  );

  -- Comentarios de tickets
  CREATE TABLE IF NOT EXISTS ticket_comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id  INTEGER NOT NULL REFERENCES tickets(id),
    user_id    INTEGER NOT NULL REFERENCES users(id),
    content    TEXT NOT NULL,
    type       TEXT NOT NULL DEFAULT 'public' CHECK(type IN ('public','internal')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Adjuntos de tickets
  CREATE TABLE IF NOT EXISTS ticket_attachments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id   INTEGER NOT NULL REFERENCES tickets(id),
    comment_id  INTEGER REFERENCES ticket_comments(id),
    user_id     INTEGER NOT NULL REFERENCES users(id),
    filename    TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mimetype    TEXT NOT NULL,
    size        INTEGER NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Historial de cambios de estado del ticket
  CREATE TABLE IF NOT EXISTS ticket_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id   INTEGER NOT NULL REFERENCES tickets(id),
    user_id     INTEGER NOT NULL REFERENCES users(id),
    action      TEXT NOT NULL,
    old_value   TEXT,
    new_value   TEXT,
    note        TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Solicitudes administrativas (TIC → Admin)
  CREATE TABLE IF NOT EXISTS admin_requests (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    code            TEXT NOT NULL UNIQUE,
    type            TEXT NOT NULL,
    requester_id    INTEGER NOT NULL REFERENCES users(id),
    affected_user_id INTEGER REFERENCES users(id),
    subject         TEXT NOT NULL,
    description     TEXT NOT NULL,
    priority        TEXT NOT NULL DEFAULT 'media'
                    CHECK(priority IN ('baja','media','alta','urgente')),
    status          TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK(status IN ('pendiente','aprobada','rechazada','en_proceso','finalizada')),
    observations    TEXT,
    admin_response  TEXT,
    resolved_by     INTEGER REFERENCES users(id),
    resolved_at     TEXT,
    signature       TEXT,
    attachment      TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Notificaciones
  CREATE TABLE IF NOT EXISTS notifications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    type       TEXT NOT NULL,
    title      TEXT NOT NULL,
    message    TEXT NOT NULL,
    link       TEXT,
    read       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Logs de auditoría
  CREATE TABLE IF NOT EXISTS audit_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id),
    user_name   TEXT,
    action      TEXT NOT NULL,
    entity      TEXT NOT NULL,
    entity_id   INTEGER,
    old_data    TEXT,
    new_data    TEXT,
    ip_address  TEXT,
    user_agent  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Tiempo de trabajo TIC
  CREATE TABLE IF NOT EXISTS time_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id  INTEGER NOT NULL REFERENCES tickets(id),
    user_id    INTEGER NOT NULL REFERENCES users(id),
    minutes    INTEGER NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ══════════════════════════════════════════════════════════════
  -- ÍNDICES PARA RENDIMIENTO
  -- ══════════════════════════════════════════════════════════════
  CREATE INDEX IF NOT EXISTS idx_tickets_requester   ON tickets(requester_id);
  CREATE INDEX IF NOT EXISTS idx_tickets_assigned    ON tickets(assigned_to);
  CREATE INDEX IF NOT EXISTS idx_tickets_status      ON tickets(status);
  CREATE INDEX IF NOT EXISTS idx_tickets_priority    ON tickets(priority_id);
  CREATE INDEX IF NOT EXISTS idx_comments_ticket     ON ticket_comments(ticket_id);
  CREATE INDEX IF NOT EXISTS idx_history_ticket      ON ticket_history(ticket_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user  ON notifications(user_id, read);
  CREATE INDEX IF NOT EXISTS idx_audit_user          ON audit_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_admin_req_status    ON admin_requests(status);
`);

module.exports = db;
