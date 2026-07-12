/**
 * Limpieza de duplicados — categorías y subcategorías
 * Seguro de correr: conserva el registro más antiguo (id menor)
 * y reasigna cualquier ticket que apunte a un duplicado.
 */
const db = require('./src/db');

console.log('🧹 Iniciando limpieza de duplicados...\n');

const tx = db.transaction(() => {
  // ── 1. Deduplicar CATEGORÍAS por nombre ─────────────────────
  const catGroups = db.prepare(`
    SELECT name, MIN(id) as keep_id, COUNT(*) as total
    FROM categories
    GROUP BY name
    HAVING COUNT(*) > 1
  `).all();

  for (const group of catGroups) {
    const dupIds = db.prepare(`SELECT id FROM categories WHERE name = ? AND id != ?`)
      .all(group.name, group.keep_id)
      .map(r => r.id);

    for (const dupId of dupIds) {
      db.prepare(`UPDATE tickets SET category_id = ? WHERE category_id = ?`).run(group.keep_id, dupId);
      db.prepare(`UPDATE subcategories SET category_id = ? WHERE category_id = ?`).run(group.keep_id, dupId);
      db.prepare(`DELETE FROM categories WHERE id = ?`).run(dupId);
    }
    console.log(`✅ Categoría "${group.name}": ${group.total} → 1 (fusionadas ${dupIds.length})`);
  }

  // ── 2. Deduplicar SUBCATEGORÍAS por (category_id, nombre) ───
  const subGroups = db.prepare(`
    SELECT category_id, name, MIN(id) as keep_id, COUNT(*) as total
    FROM subcategories
    GROUP BY category_id, name
    HAVING COUNT(*) > 1
  `).all();

  for (const group of subGroups) {
    const dupIds = db.prepare(`SELECT id FROM subcategories WHERE category_id = ? AND name = ? AND id != ?`)
      .all(group.category_id, group.name, group.keep_id)
      .map(r => r.id);

    for (const dupId of dupIds) {
      db.prepare(`UPDATE tickets SET subcategory_id = ? WHERE subcategory_id = ?`).run(group.keep_id, dupId);
      db.prepare(`DELETE FROM subcategories WHERE id = ?`).run(dupId);
    }
    console.log(`✅ Subcategoría "${group.name}": ${group.total} → 1 (fusionadas ${dupIds.length})`);
  }
});

tx();

console.log('\n🎉 Limpieza completada. Tickets existentes preservados.');
