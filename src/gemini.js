const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('./db');
const { buildAiPrompt, resolveTicketSuggestion } = require('./ai-ticket-utils');

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn('⚠️  No se encontró GEMINI_API_KEY en las variables de entorno.');
}

const genAI = new GoogleGenerativeAI(apiKey);

async function generarTicket(descripcionUsuario) {
  const categories = db.prepare(`SELECT id, name FROM categories WHERE active = 1 ORDER BY name`).all();
  const subcategories = db.prepare(`SELECT id, category_id, name FROM subcategories WHERE active = 1 ORDER BY name`).all();
  const priorities = db.prepare(`SELECT id, name FROM priorities ORDER BY level`).all();

  const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
  const prompt = buildAiPrompt(descripcionUsuario, { categories, subcategories, priorities });
  const result = await model.generateContent(prompt);
  const textoCrudo = result.response.text();
  const textoLimpio = textoCrudo.replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(textoLimpio);
    return resolveTicketSuggestion(parsed, { categories, subcategories, priorities });
  } catch (e) {
    return resolveTicketSuggestion({
      titulo: 'Ticket generado',
      categoria: '',
      subcategoria: '',
      prioridad: '',
      descripcion: descripcionUsuario,
      solucion_sugerida: textoCrudo
    }, { categories, subcategories, priorities });
  }
}

module.exports = { generarTicket };
