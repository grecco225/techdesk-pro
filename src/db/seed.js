/**
 * TechDesk Pro — Seeder (Datos Iniciales)
 * Ejecutar una sola vez para poblar la BD con datos base
 */

const db = require('../db');
const bcrypt = require('bcryptjs');

async function seed() {
  console.log('🌱 Iniciando seeder de TechDesk Pro...');

  // ── Departamentos ──────────────────────────────────────────
  const depts = [
    { name: 'Tecnología e Información', code: 'TIC', description: 'Departamento de soporte técnico' },
    { name: 'Administración', code: 'ADM', description: 'Gestión administrativa' },
    { name: 'Recursos Humanos', code: 'RH', description: 'Gestión de personal' },
    { name: 'Contabilidad', code: 'CONT', description: 'Área financiera y contable' },
    { name: 'Operaciones', code: 'OPS', description: 'Área operativa' },
    { name: 'Ventas', code: 'VEN', description: 'Área comercial' },
  ];
  const insertDept = db.prepare(`INSERT OR IGNORE INTO departments (name, code, description) VALUES (?, ?, ?)`);
  depts.forEach(d => insertDept.run(d.name, d.code, d.description));
  console.log('✅ Departamentos creados');

  // ── Prioridades ────────────────────────────────────────────
  const priorities = [
    { name: 'Baja',    level: 1, color: '#22c55e', sla_hours: 72 },
    { name: 'Media',   level: 2, color: '#eab308', sla_hours: 48 },
    { name: 'Alta',    level: 3, color: '#f97316', sla_hours: 24 },
    { name: 'Urgente', level: 4, color: '#ef4444', sla_hours: 4  },
  ];
  const insertPriority = db.prepare(`INSERT OR IGNORE INTO priorities (name, level, color, sla_hours) VALUES (?, ?, ?, ?)`);
  priorities.forEach(p => insertPriority.run(p.name, p.level, p.color, p.sla_hours));
  console.log('✅ Prioridades creadas');

  // ── Categorías ─────────────────────────────────────────────
  const categories = [
    { name: 'Hardware',       icon: 'cpu',           color: '#6366f1' },
    { name: 'Software',       icon: 'code',          color: '#8b5cf6' },
    { name: 'Red / Conectividad', icon: 'wifi',      color: '#0ea5e9' },
    { name: 'Cuenta / Accesos',   icon: 'key',       color: '#f59e0b' },
    { name: 'Impresoras',    icon: 'printer',         color: '#10b981' },
    { name: 'Correo',        icon: 'mail',            color: '#ec4899' },
    { name: 'Seguridad',     icon: 'shield',          color: '#ef4444' },
    { name: 'Otro',          icon: 'help-circle',     color: '#64748b' },
  ];
  const insertCat = db.prepare(`INSERT OR IGNORE INTO categories (name, icon, color) VALUES (?, ?, ?)`);
  categories.forEach(c => insertCat.run(c.name, c.icon, c.color));
  console.log('✅ Categorías creadas');

  // ── Subcategorías ──────────────────────────────────────────
  const subcats = [
    { cat: 'Hardware', subs: ['Computadora no enciende', 'Monitor dañado', 'Teclado/Mouse', 'Disco duro', 'Memoria RAM', 'UPS / Energía'] },
    { cat: 'Software', subs: ['Aplicación no abre', 'Error de instalación', 'Actualización', 'Licencia expirada', 'Virus/Malware'] },
    { cat: 'Red / Conectividad', subs: ['Sin internet', 'VPN', 'Red lenta', 'Configuración de red', 'Acceso a recursos compartidos'] },
    { cat: 'Cuenta / Accesos', subs: ['Contraseña olvidada', 'Cuenta bloqueada', 'Nuevos permisos', 'Retirar accesos'] },
    { cat: 'Correo', subs: ['No envía/recibe', 'Configuración de cliente', 'Cuota llena', 'Spam'] },
  ];

  const getCatId = db.prepare(`SELECT id FROM categories WHERE name = ?`);
  const insertSub = db.prepare(`INSERT OR IGNORE INTO subcategories (category_id, name) VALUES (?, ?)`);
  for (const sc of subcats) {
    const cat = getCatId.get(sc.cat);
    if (cat) sc.subs.forEach(s => insertSub.run(cat.id, s));
  }
  console.log('✅ Subcategorías creadas');

  // ── Usuarios ───────────────────────────────────────────────
  const ticDept  = db.prepare(`SELECT id FROM departments WHERE code = 'TIC'`).get();
  const admDept  = db.prepare(`SELECT id FROM departments WHERE code = 'ADM'`).get();
  const rrhhDept = db.prepare(`SELECT id FROM departments WHERE code = 'RH'`).get();

  const users = [
    {
      name: 'Administrador del Sistema',
      email: 'admin@techdesk.com',
      password: 'Admin123!',
      role: 'admin',
      department_id: admDept ? admDept.id : null
    },
    {
      name: 'Técnico TIC Principal',
      email: 'tic@techdesk.com',
      password: 'Tic123!',
      role: 'tic',
      department_id: ticDept ? ticDept.id : null
    },
    {
      name: 'María González',
      email: 'empleado@techdesk.com',
      password: 'Emp123!',
      role: 'employee',
      department_id: rrhhDept ? rrhhDept.id : null
    },
    {
      name: 'Carlos Rodríguez',
      email: 'carlos@techdesk.com',
      password: 'Emp123!',
      role: 'employee',
      department_id: admDept ? admDept.id : null
    },
  ];

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (name, email, password_hash, role, department_id)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 12);
    insertUser.run(u.name, u.email, hash, u.role, u.department_id);
  }
  console.log('✅ Usuarios creados');
  console.log('');
  console.log('╔═══════════════════════════════════════╗');
  console.log('║      CREDENCIALES INICIALES           ║');
  console.log('╠═══════════════════════════════════════╣');
  console.log('║ Admin:    admin@techdesk.com           ║');
  console.log('║ Password: Admin123!                    ║');
  console.log('╠═══════════════════════════════════════╣');
  console.log('║ TIC:      tic@techdesk.com             ║');
  console.log('║ Password: Tic123!                      ║');
  console.log('╠═══════════════════════════════════════╣');
  console.log('║ Empleado: empleado@techdesk.com        ║');
  console.log('║ Password: Emp123!                      ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log('');
  console.log('🚀 Seeder completado exitosamente');
}

seed().catch(err => {
  console.error('❌ Error en seeder:', err.message);
  process.exit(1);
});
