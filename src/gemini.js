const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('./db');
const { buildAiPrompt, resolveTicketSuggestion } = require('./ai-ticket-utils');

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn('⚠️  No se encontró GEMINI_API_KEY en las variables de entorno.');
}

const genAI = new GoogleGenerativeAI(apiKey);

function buildFallbackTicket(descripcionUsuario, categories, subcategories, priorities) {
  return resolveTicketSuggestion({
    titulo: 'Ticket generado',
    categoria: '',
    subcategoria: '',
    prioridad: '',
    descripcion: descripcionUsuario,
    solucion_sugerida: 'No se pudo consultar la IA en este momento. El ticket fue generado con datos de respaldo.'
  }, { categories, subcategories, priorities });
}

async function generateContentWithRetry(model, prompt, attempts = 2) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await model.generateContent(prompt);
    } catch (err) {
      lastError = err;
      const status = err?.status || err?.response?.status;
      const isRetryable = status === 429 || status === 500 || status === 503 || status === 502 || status === 504;

      if (!isRetryable || attempt === attempts) {
        throw err;
      }

      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }

  throw lastError;
}

async function generarTicket(descripcionUsuario) {
  const categories = db.prepare(`SELECT id, name FROM categories WHERE active = 1 ORDER BY name`).all();
  const subcategories = db.prepare(`SELECT id, category_id, name FROM subcategories WHERE active = 1 ORDER BY name`).all();
  const priorities = db.prepare(`SELECT id, name FROM priorities ORDER BY level`).all();

  const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
  const prompt = buildAiPrompt(descripcionUsuario, { categories, subcategories, priorities });
  try {
    const result = await generateContentWithRetry(model, prompt);
    const textoCrudo = result.response.text();
    const textoLimpio = textoCrudo.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(textoLimpio);
    return resolveTicketSuggestion(parsed, { categories, subcategories, priorities });
  } catch (e) {
    console.warn('Gemini no disponible, usando fallback local:', e.message);
    return buildFallbackTicket(descripcionUsuario, categories, subcategories, priorities);
  }
}

module.exports = { generarTicket };
