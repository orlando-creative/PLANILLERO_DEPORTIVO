import { leer, actualizar, obtenerUsuario, esAdmin, cerrarSesion } from './supabase.js';

// Helpers, páginas públicas y módulos de administración.
// Escapa texto usando el DOM para que los datos se muestren y no se ejecuten como HTML.
export const esc = (text) => {
  const node = document.createElement('div');
  node.textContent = String(text ?? '');
  return node.innerHTML;
};

// Presenta fecha y hora con el formato breve del idioma español; usa "-" si no hay fecha.
export const fmtFecha = (date) => date
  ? new Date(date).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })
  : '-';

// Convierte segundos no negativos en una lectura de reloj con minutos y segundos.
export const fmtReloj = (seconds) => {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
};

let notificationHost;
let notificationTimer;

// Crea una sola región accesible para avisos y la reutiliza entre mensajes.
const getNotificationHost = () => {
  // Si la página reemplazó el contenedor, crea uno nuevo y lo conecta al documento.
  if (notificationHost?.isConnected) return notificationHost;
  notificationHost = document.createElement('div');
  notificationHost.className = 'notificaciones';
  notificationHost.setAttribute('aria-live', 'polite');
  notificationHost.setAttribute('aria-relevant', 'additions text');
  document.body.append(notificationHost);
  return notificationHost;
};

// Muestra un aviso temporal de éxito o error en la parte inferior.
export const avisar = (id, message, error = false) => {
  const host = getNotificationHost();
  // Reutiliza el mismo aviso para evitar que se acumulen mensajes en pantalla.
  let toast = host.querySelector('.notificacion-aviso');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'notificacion notificacion-aviso';
    host.prepend(toast);
  }
  clearTimeout(notificationTimer);
  toast.textContent = message;
  toast.classList.toggle('notificacion-error', error);
  toast.setAttribute('role', error ? 'alert' : 'status');
  // Reinicia el temporizador para que cada nuevo mensaje permanezca visible cinco segundos.
  notificationTimer = setTimeout(() => toast.remove(), 5000);
};

// Actualiza los controles de sesión presentes en el HTML estático.
export function sincronizarNavegacion() {
  const user = obtenerUsuario();
  const admin = esAdmin();
  // Los enlaces administrativos solo se muestran a cuentas con ese rol.
  const adminLinks = document.querySelectorAll('#nav-admin, #footer-admin');
  adminLinks.forEach((link) => { link.hidden = !admin; });
  document.getElementById('nav-login')?.toggleAttribute('hidden', Boolean(user));
  const logout = document.getElementById('btn-logout');
  if (logout) {
    logout.hidden = !user;
    logout.onclick = () => cerrarSesion();
  }
}

// Carga los datos públicos y presenta partidos, posiciones y goleadores filtrables.
export async function iniciarIndex() {
  sincronizarNavegacion();
  try {
    // Solicita en paralelo los datos usados por las cuatro secciones del inicio.
    const [equipos, partidos, posiciones, goleadores] = await Promise.all([
      leer('equipos'), leer('partidos', 'fecha_hora'), leer('posiciones'), leer('goleadores')
    ]);
    const categoria = document.getElementById('filtro-cat');
    const genero = document.getElementById('filtro-gen');
    // Construye categorías únicas a partir de los equipos recibidos.
    categoria.innerHTML = '<option value="">Todas las categorías</option>' +
      [...new Set(equipos.map((team) => team.categoria).filter(Boolean))].sort()
        .map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
    const names = Object.fromEntries(equipos.map((team) => [team.id, team.nombre]));

    // Redibuja las tablas públicas aplicando los filtros elegidos.
    const render = () => {
      const cat = categoria.value;
      const gen = genero.value;
      // Comprueba si un partido, posición o goleador coincide con los filtros.
      const visible = (row) => (!cat || row.categoria === cat) && (!gen || row.genero === gen);
      const filteredMatches = partidos.filter(visible);
      document.getElementById('tbody-partidos').innerHTML = filteredMatches.length
        ? filteredMatches.map((match) => {
          const penales = match.penales_local != null && match.penales_visitante != null
            ? `<small class="resultado-penales">Penales: ${match.penales_local} - ${match.penales_visitante}</small>` : '';
          return `
          <tr>
            <td data-label="Fecha y Hora">${fmtFecha(match.fecha_hora)}</td>
            <td data-label="Fase"><strong>${esc(match.fase)}</strong></td>
            <td data-label="Partido y Resultado"><span class="resultado-partido">${esc(names[match.equipo_local_id])}
              <strong>${match.goles_local} - ${match.goles_visitante}</strong>
              ${esc(names[match.equipo_visitante_id])}</span>${penales}</td>
            <td data-label="Categoría / Rama">${esc(match.categoria)} (${esc(match.genero)})</td>
            <td data-label="Estado"><span class="tag tag-${match.estado === 'en_juego' ? 'juego' : match.estado === 'finalizado' ? 'fin' : 'prog'}">${esc(match.estado.replace('_', ' '))}</span></td>
          </tr>`;
        }).join('')
        : '<tr><td colspan="5" class="empty">No hay partidos con los filtros seleccionados.</td></tr>';

      // Ordena la clasificación por puntos y usa goles como desempate.
      const standings = posiciones.filter(visible)
        .sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf);
      document.getElementById('tbody-posiciones').innerHTML = standings.length
        ? standings.map((row, index) => `
          <tr><td><strong>${index + 1}</strong></td><td><strong>${esc(row.equipo)}</strong></td>
          <td>${esc(row.categoria)} (${esc(row.genero)})</td><td>${row.pj}</td><td>${row.pg}-${row.pe}-${row.pp}</td>
          <td>${row.gf}:${row.gc}</td><td>${row.dg > 0 ? `+${row.dg}` : row.dg}</td>
          <td><strong style="color:var(--color-verde)">${row.pts}</strong></td></tr>`).join('')
        : '<tr><td colspan="8" class="empty">Aún no hay partidos finalizados.</td></tr>';

      // Presenta los diez máximos goleadores que cumplen con los filtros.
      const scorers = goleadores.filter(visible).sort((a, b) => b.goles - a.goles).slice(0, 10);
      document.getElementById('tbody-goleadores').innerHTML = scorers.length
        ? scorers.map((row, index) => `
          <tr><td><strong>${index + 1}</strong></td><td><strong>${esc(row.jugador)}</strong> ${row.dorsal ? `(#${row.dorsal})` : ''}</td>
          <td>${esc(row.equipo)}</td><td>${esc(row.categoria)} (${esc(row.genero)})</td>
          <td><strong style="color:var(--color-verde)">${row.goles} goles</strong></td></tr>`).join('')
        : '<tr><td colspan="5" class="empty">Aún no se registraron goles.</td></tr>';
    };
    categoria.onchange = render;
    genero.onchange = render;
    render();
  } catch (error) {
    avisar('aviso-index', error.message, true);
  }
}

// Muestra las sanciones y, para administradores, habilita su gestión.
export async function iniciarSanciones() {
  sincronizarNavegacion();
  const admin = esAdmin();
  try {
    // Reúne sanciones y datos relacionados para traducir sus IDs a nombres.
    const [sanciones, jugadores, equipos, partidos] = await Promise.all([
      leer('sanciones', 'creada_en'), leer('jugadores'), leer('equipos'), leer('partidos')
    ]);
    const players = Object.fromEntries(jugadores.map((row) => [row.id, row]));
    const teams = Object.fromEntries(equipos.map((row) => [row.id, row.nombre]));
    const matches = Object.fromEntries(partidos.map((row) => [row.id, row]));
    const tbody = document.getElementById('tbody-sanciones');

    // Cada fila combina la sanción con su jugador, equipo y partido relacionados.
    tbody.innerHTML = sanciones.length ? sanciones.map((sanction) => {
      const player = players[sanction.jugador_id];
      const match = matches[sanction.partido_id];
      const game = match ? `${teams[match.equipo_local_id]} vs ${teams[match.equipo_visitante_id]}` : 'Partido';
      const adminControls = admin ? `
        <td><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <label style="display:inline-flex;align-items:center;gap:6px;font-weight:700;cursor:pointer">
            <input type="checkbox" data-pago="${sanction.id}" data-val="${!sanction.pagada}" ${sanction.pagada ? 'checked' : ''}> Pagó
          </label>
          <button class="btn btn-sm btn-red" data-estado="${sanction.id}" data-val="suspendida">Suspender</button>
          <button class="btn btn-sm btn-out" data-estado="${sanction.id}" data-val="retirada">Retirar</button>
        </div></td>` : '';
      return `<tr>
        <td><strong>${esc(player?.nombre)}</strong> ${player?.dorsal ? `(#${player.dorsal})` : ''}</td>
        <td>${esc(teams[player?.equipo_id] || '-')}</td>
        <td><span class="badge-tarj ${sanction.tarjeta}"></span> <strong>[${esc(sanction.tarjeta.toUpperCase())}]</strong></td>
        <td><small>${esc(game)}</small></td>
        <td><strong>${sanction.pagada ? 'Sí' : 'No'}</strong></td>
        <td><span class="tag tag-${sanction.estado === 'suspendida' ? 'juego' : 'prog'}">${esc(sanction.estado)}</span></td>
        ${adminControls}</tr>`;
    }).join('') : '<tr><td colspan="7" class="empty">No hay sanciones registradas.</td></tr>';

    if (admin) {
      document.getElementById('th-admin-sanciones')?.removeAttribute('hidden');
      // Actualiza el pago y el estado de la sanción al cambiar su casilla.
      tbody.querySelectorAll('[data-pago]').forEach((checkbox) => checkbox.addEventListener('change', async () => {
        const paid = checkbox.checked;
        // Al pagar, la sanción pasa a cumplida; al desmarcar, vuelve a pendiente.
        await actualizar('sanciones', checkbox.dataset.pago, { pagada: paid, estado: paid ? 'cumplida' : 'pendiente' });
        iniciarSanciones();
      }));
      // Permite cambiar una sanción a suspendida o retirada desde la tabla.
      tbody.querySelectorAll('[data-estado]').forEach((button) => button.addEventListener('click', async () => {
        // El valor del botón indica el nuevo estado disciplinario.
        await actualizar('sanciones', button.dataset.estado, { estado: button.dataset.val });
        iniciarSanciones();
      }));
    }
  } catch (error) {
    document.getElementById('tbody-sanciones').innerHTML =
      `<tr><td colspan="8" class="empty">${esc(error.message)}</td></tr>`;
  }
}
