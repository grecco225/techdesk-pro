const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveTicketSuggestion, buildAiPrompt } = require('../src/ai-ticket-utils');

test('resolveTicketSuggestion maps valid names to real ids and falls back safely', () => {
  const categories = [{ id: 1, name: 'Hardware' }, { id: 2, name: 'Software' }];
  const subcategories = [{ id: 10, category_id: 1, name: 'Computadora no enciende' }, { id: 11, category_id: 2, name: 'Aplicación no abre' }];
  const priorities = [{ id: 3, name: 'Media' }, { id: 4, name: 'Alta' }];

  const result = resolveTicketSuggestion({
    categoria: 'HARDWARE',
    subcategoria: 'Computadora no enciende',
    prioridad: 'Alta',
    titulo: 'Impresora sin respuesta',
    descripcion: 'La impresora no imprime.',
  }, { categories, subcategories, priorities });

  assert.equal(result.category_id, 1);
  assert.equal(result.subcategory_id, 10);
  assert.equal(result.priority_id, 4);
  assert.equal(result.title.length > 0, true);
  assert.equal(result.description.length > 0, true);
});

test('resolveTicketSuggestion uses safe fallback when AI returns unknown names', () => {
  const categories = [{ id: 1, name: 'Hardware' }, { id: 2, name: 'Software' }];
  const subcategories = [{ id: 10, category_id: 1, name: 'Computadora no enciende' }, { id: 11, category_id: 2, name: 'Aplicación no abre' }];
  const priorities = [{ id: 3, name: 'Media' }, { id: 4, name: 'Alta' }];

  const result = resolveTicketSuggestion({
    categoria: 'Categoría inventada',
    subcategoria: 'Subcategoría inventada',
    prioridad: 'Urgente inventado',
    titulo: '',
    descripcion: '',
  }, { categories, subcategories, priorities });

  assert.equal(result.category_id, 1);
  assert.equal(result.subcategory_id, 10);
  assert.equal(result.priority_id, 3);
  assert.equal(result.title, 'Ticket generado');
  assert.equal(result.description, 'Ticket generado');
});

test('buildAiPrompt includes the exact available options from the database', () => {
  const categories = [{ id: 1, name: 'Hardware' }, { id: 2, name: 'Software' }];
  const subcategories = [{ id: 10, category_id: 1, name: 'Computadora no enciende' }, { id: 11, category_id: 2, name: 'Aplicación no abre' }];
  const priorities = [{ id: 3, name: 'Media' }, { id: 4, name: 'Alta' }];

  const prompt = buildAiPrompt('Mi equipo no enciende', { categories, subcategories, priorities });

  assert.match(prompt, /Hardware/);
  assert.match(prompt, /Software/);
  assert.match(prompt, /Computadora no enciende/);
  assert.match(prompt, /Media/);
  assert.match(prompt, /Alta/);
});
