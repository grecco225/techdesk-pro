function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function findMatchingOption(options = [], preferredName, fallback = null) {
  const normalizedPreferred = normalizeText(preferredName);
  if (!normalizedPreferred) return fallback;

  const exactMatch = options.find(option => normalizeText(option.name) === normalizedPreferred);
  if (exactMatch) return exactMatch;

  const containsMatch = options.find(option => normalizeText(option.name).includes(normalizedPreferred));
  if (containsMatch) return containsMatch;

  return fallback;
}

function buildAiPrompt(descripcionUsuario, { categories = [], subcategories = [], priorities = [] }) {
  const categoryList = categories.map(c => `- ${c.name}`).join('\n');
  const subcategoryList = subcategories.map(s => `- ${s.name} (categoría: ${categories.find(c => c.id === s.category_id)?.name || 'Sin categoría'})`).join('\n');
  const priorityList = priorities.map(p => `- ${p.name}`).join('\n');

  return `Eres un asistente de mesa de ayuda de TI.
A partir de la descripción del usuario, debes sugerir un ticket completo.
IMPORTANTE: NO inventes categorías, subcategorías o prioridades. Elige únicamente de las opciones reales que te damos a continuación.

Categorías disponibles:
${categoryList || '- Sin categorías'}

Subcategorías disponibles:
${subcategoryList || '- Sin subcategorías'}

Prioridades disponibles:
${priorityList || '- Sin prioridades'}

Responde ÚNICAMENTE con un JSON válido, sin texto adicional ni backticks, con este formato exacto:
{
  "titulo": "string corto y claro",
  "categoria": "Nombre exacto de una categoría de la lista",
  "subcategoria": "Nombre exacto de una subcategoría de la lista",
  "prioridad": "Nombre exacto de una prioridad de la lista",
  "descripcion": "descripción del problema reescrita de forma profesional",
  "solucion_sugerida": "un posible primer paso para resolverlo"
}

Descripción del usuario: ${descripcionUsuario}`;
}

function resolveTicketSuggestion(aiSuggestion = {}, { categories = [], subcategories = [], priorities = [] } = {}) {
  const fallbackCategory = categories[0] || null;
  const fallbackPriority = priorities.find(p => normalizeText(p.name) === 'media') || priorities[0] || null;
  const category = findMatchingOption(categories, aiSuggestion.categoria, fallbackCategory);
  const priority = findMatchingOption(priorities, aiSuggestion.prioridad, fallbackPriority);

  const categorySubcategories = (category ? subcategories.filter(s => s.category_id === category.id) : subcategories);
  const fallbackSubcategory = categorySubcategories[0] || null;
  const subcategory = findMatchingOption(categorySubcategories, aiSuggestion.subcategoria, fallbackSubcategory);

  const title = String(aiSuggestion.titulo || aiSuggestion.title || '').trim() || 'Ticket generado';
  const description = String(aiSuggestion.descripcion || aiSuggestion.description || '').trim() || title;
  const solutionSuggested = String(aiSuggestion.solucion_sugerida || aiSuggestion.solution_suggested || '').trim();

  return {
    title: title.length > 80 ? `${title.slice(0, 77)}...` : title,
    description,
    category_id: category ? category.id : null,
    subcategory_id: subcategory ? subcategory.id : null,
    priority_id: priority ? priority.id : null,
    solution_suggested: solutionSuggested,
    titulo: title,
    descripcion: description,
    categoria: category ? category.name : '',
    subcategoria: subcategory ? subcategory.name : '',
    prioridad: priority ? priority.name : '',
  };
}

module.exports = {
  buildAiPrompt,
  resolveTicketSuggestion,
  normalizeText,
};
