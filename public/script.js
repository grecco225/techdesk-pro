const form = document.getElementById('form-ticket');
const btn = document.getElementById('btn-generar');
const errorDiv = document.getElementById('mensaje-error');
const resultado = document.getElementById('resultado');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const descripcion = document.getElementById('descripcion').value.trim();

  errorDiv.classList.add('oculto');
  resultado.classList.add('oculto');

  if (descripcion.length < 5) {
    mostrarError('Por favor describe el problema con más detalle.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Generando...';

  const csrfToken = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith('_csrf='))
    ?.split('=')[1];

  try {
    const res = await fetch('/api/generar-ticket', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken || ''
      },
      body: JSON.stringify({ descripcion })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Error desconocido');
    }

    mostrarTicket(data);
  } catch (err) {
    mostrarError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generar Ticket';
  }
});

function mostrarError(msg) {
  errorDiv.textContent = msg;
  errorDiv.classList.remove('oculto');
}

function mostrarTicket(ticket) {
  document.getElementById('ticket-titulo').textContent = ticket.titulo;
  document.getElementById('ticket-prioridad').textContent = 'Prioridad: ' + ticket.prioridad;
  document.getElementById('ticket-categoria').textContent = ticket.categoria;
  document.getElementById('ticket-descripcion').textContent = ticket.descripcion;
  document.getElementById('ticket-solucion').textContent = ticket.solucion_sugerida;
  resultado.classList.remove('oculto');
}
