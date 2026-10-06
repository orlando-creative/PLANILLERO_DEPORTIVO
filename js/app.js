import { leer, actualizar, obtenerUsuario, esAdmin, cerrarSesion } from './supabase.js';

// Helpers, páginas públicas y módulos de administración.
// Escapa texto antes de insertarlo como contenido HTML.
export const esc = (text) => {
  const node = document.createElement('div');
  node.textContent = String(text ?? '');
  return node.innerHTML;
};

// Presenta una fecha en el formato local usado por las pantallas.
export const fmtFecha = (date) => date
  ? new Date(date).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })
  : '-';

// Convierte segundos en una lectura de reloj MM:SS.
export const fmtReloj = (seconds) => {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
};

// Muestra un aviso temporal de éxito o error en el elemento indicado.
export const avisar = (id, message, error = false) => {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = message;
  element.className = `aviso ${error ? 'aviso-error' : 'aviso-ok'}`;
  element.hidden = false;
  setTimeout(() => { element.hidden = true; }, 5000);
};

// Construye el encabezado y pie comunes según la ruta y el rol de sesión.
export function montarNavegacion() {
  const user = obtenerUsuario();
  const admin = esAdmin();
  const route = window.location.pathname.split('/').pop() || 'index.html';
  const header = document.querySelector('header');

  if (header) {
    header.innerHTML = `
      <div class="header-top">U.E. "Luz del Mundo A" · Campeonato de Futsal 2026</div>
      <div class="header-main">
        <div class="contenedor header-bar">
          <a href="index.html" class="marca">
            <img src="assets/escudo-luz-del-mundo.svg" alt="Escudo">
            <div class="marca-tit">PLANILLERO <span>FUTSAL</span></div>
          </a>
          <nav class="nav-links">
            <a href="index.html" class="${route === 'index.html' ? 'activo' : ''}">Inicio</a>
            <a href="sanciones.html" class="${route === 'sanciones.html' ? 'activo' : ''}">Sanciones</a>
            <a href="reglamento.html" class="${route === 'reglamento.html' ? 'activo' : ''}">Reglamento</a>
            ${admin ? `<a href="administracion.html" class="admin-link ${route === 'administracion.html' ? 'activo' : ''}">Mesa de Planilla</a>` : ''}
            ${user
              ? '<button type="button" class="btn btn-sm btn-red" id="btn-logout">Salir</button>'
              : '<a href="inicio-sesion.html" class="btn btn-sm btn-out" style="color:#fff;border-color:#fff">Acceso Admin</a>'}
          </nav>
        </div>
      </div>`;
    document.getElementById('btn-logout')?.addEventListener('click', cerrarSesion);
  }

  const footer = document.querySelector('footer');
  if (footer) {
    footer.innerHTML = `
      <div class="contenedor">
        <p><strong>U.E. Luz del Mundo A · Planillero Oficial de Futsal</strong></p>
        <p style="margin-top:6px">
          <a href="index.html">Inicio</a> · <a href="sanciones.html">Sanciones</a> · <a href="reglamento.html">Reglamento</a>
          ${admin ? ' · <a href="administracion.html">Mesa de Planilla</a>' : ''}
        </p>
      </div>`;
  }
}

// Carga los datos públicos y presenta partidos, posiciones y goleadores filtrables.
export async function iniciarIndex() {
  montarNavegacion();
  try {
    const [equipos, partidos, posiciones, goleadores] = await Promise.all([
      leer('equipos'), leer('partidos', 'fecha_hora'), leer('posiciones'), leer('goleadores')
    ]);
    const categoria = document.getElementById('filtro-cat');
    const genero = document.getElementById('filtro-gen');
    categoria.innerHTML = '<option value="">Todas las categorías</option>' +
      [...new Set(equipos.map((team) => team.categoria).filter(Boolean))].sort()
        .map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
    const names = Object.fromEntries(equipos.map((team) => [team.id, team.nombre]));

    // Redibuja las tablas públicas aplicando los filtros elegidos.
    const render = () => {
      const cat = categoria.value;
      const gen = genero.value;
      // Decide si un registro coincide con los filtros activos.
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

      const standings = posiciones.filter(visible)
        .sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf);
      document.getElementById('tbody-posiciones').innerHTML = standings.length
        ? standings.map((row, index) => `
          <tr><td><strong>${index + 1}</strong></td><td><strong>${esc(row.equipo)}</strong></td>
          <td>${esc(row.categoria)} (${esc(row.genero)})</td><td>${row.pj}</td><td>${row.pg}-${row.pe}-${row.pp}</td>
          <td>${row.gf}:${row.gc}</td><td>${row.dg > 0 ? `+${row.dg}` : row.dg}</td>
          <td><strong style="color:var(--color-verde)">${row.pts}</strong></td></tr>`).join('')
        : '<tr><td colspan="8" class="empty">Aún no hay partidos finalizados.</td></tr>';

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
  montarNavegacion();
  const admin = esAdmin();
  try {
    const [sanciones, jugadores, equipos, partidos] = await Promise.all([
      leer('sanciones', 'creada_en'), leer('jugadores'), leer('equipos'), leer('partidos')
    ]);
    const players = Object.fromEntries(jugadores.map((row) => [row.id, row]));
    const teams = Object.fromEntries(equipos.map((row) => [row.id, row.nombre]));
    const matches = Object.fromEntries(partidos.map((row) => [row.id, row]));
    const tbody = document.getElementById('tbody-sanciones');

    tbody.innerHTML = sanciones.length ? sanciones.map((sanction) => {
      const player = players[sanction.jugador_id];
      const match = matches[sanction.partido_id];
      const game = match ? `${teams[match.equipo_local_id]} vs ${teams[match.equipo_visitante_id]}` : 'Partido';
      const adminControls = admin ? `
        <td><div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
          <input type="number" min="0" step="1" value="${Number(sanction.monto)}" data-monto-sancion="${sanction.id}" style="width:60px;padding:2px">
          <button class="btn btn-sm btn-out" data-guardar-monto="${sanction.id}">Fijar</button>
          <button class="btn btn-sm ${sanction.pagada ? 'btn-out' : ''}" data-pago="${sanction.id}" data-val="${!sanction.pagada}">${sanction.pagada ? 'Pendiente' : 'Marcar Pagada'}</button>
          <button class="btn btn-sm btn-red" data-estado="${sanction.id}" data-val="suspendida">Suspender</button>
          <button class="btn btn-sm btn-out" data-estado="${sanction.id}" data-val="retirada">Retirar</button>
        </div></td>` : '';
      return `<tr>
        <td><strong>${esc(player?.nombre)}</strong> ${player?.dorsal ? `(#${player.dorsal})` : ''}</td>
        <td>${esc(teams[player?.equipo_id] || '-')}</td>
        <td><span class="badge-tarj ${sanction.tarjeta}"></span> <strong>[${esc(sanction.tarjeta.toUpperCase())}]</strong></td>
        <td><small>${esc(game)}</small></td><td>Bs. ${Number(sanction.monto).toFixed(2)}</td>
        <td><strong>${sanction.pagada ? 'Pagada' : 'Pendiente'}</strong></td>
        <td><span class="tag tag-${sanction.estado === 'suspendida' ? 'juego' : 'prog'}">${esc(sanction.estado)}</span></td>
        ${adminControls}</tr>`;
    }).join('') : '<tr><td colspan="8" class="empty">No hay sanciones registradas.</td></tr>';

    if (admin) {
      document.getElementById('th-admin-sanciones')?.removeAttribute('hidden');
      // Cambia el pago y el estado disciplinario asociado a la sanción.
      tbody.querySelectorAll('[data-pago]').forEach((button) => button.addEventListener('click', async () => {
        const paid = button.dataset.val === 'true';
        await actualizar('sanciones', button.dataset.pago, { pagada: paid, estado: paid ? 'cumplida' : 'pendiente' });
        iniciarSanciones();
      }));
      // Aplica el estado disciplinario solicitado por el administrador.
      tbody.querySelectorAll('[data-estado]').forEach((button) => button.addEventListener('click', async () => {
        await actualizar('sanciones', button.dataset.estado, { estado: button.dataset.val });
        iniciarSanciones();
      }));
      // Guarda el monto de multa editado para esta sanción.
      tbody.querySelectorAll('[data-guardar-monto]').forEach((button) => button.addEventListener('click', async () => {
        const input = tbody.querySelector(`[data-monto-sancion="${button.dataset.guardarMonto}"]`);
        await actualizar('sanciones', button.dataset.guardarMonto, { monto: Number(input.value || 0) });
        iniciarSanciones();
      }));
    }
  } catch (error) {
    document.getElementById('tbody-sanciones').innerHTML =
      `<tr><td colspan="8" class="empty">${esc(error.message)}</td></tr>`;
  }
}
