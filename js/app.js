import {
  leer, guardar, actualizar, borrar, reiniciarCampeonato,
  obtenerFinanzas, guardarFinanzas,
  obtenerUsuario, esAdmin, cerrarSesion
} from './supabase.js';

// ============================================================================
// UTILIDADES COMPARTIDAS
// ============================================================================

/**
 * Escapa caracteres HTML especiales para evitar inyecciones XSS en el DOM
 * @param {string|number|null} txt Texto a sanitizar
 * @returns {string} Texto seguro para insertar en innerHTML
 */
const esc = (txt) => {
  const d = document.createElement('div');
  d.textContent = String(txt ?? '');
  return d.innerHTML;
};

/**
 * Da formato de fecha y hora corta localizada (dd/mm/aaaa hh:mm)
 * @param {string|null} f Fecha en formato ISO o null
 * @returns {string} Fecha formateada o guion si no existe
 */
const fmtFecha = (f) => f ? new Date(f).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : '-';

/**
 * Convierte un total de segundos a formato digital de reloj (MM:SS)
 * @param {number} seg Cantidad de segundos
 * @returns {string} Cadena en formato "20:00"
 */
const fmtReloj = (seg) => {
  const s = Math.max(0, Math.floor(seg));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Muestra un aviso o mensaje temporal en pantalla (verde para exito, rojo para error)
 * @param {string} id ID del elemento contenedor del aviso
 * @param {string} msj Mensaje a mostrar
 * @param {boolean} esError Indica si el mensaje es de error
 */
const avisar = (id, msj, esError = false) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msj;
  el.className = `aviso ${esError ? 'aviso-error' : 'aviso-ok'}`;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 5000); // Se oculta automaticamente tras 5 segundos
};

// ============================================================================
// NAVEGACION INSTITUCIONAL (ENCABEZADO Y PIE DE PAGINA)
// ============================================================================

/**
 * Construye de forma dinamica el encabezado institucional y el pie de pagina
 * adaptando los enlaces segun si el usuario es administrador o visitante
 */
export function montarNavegacion() {
  const u = obtenerUsuario();
  const admin = esAdmin();
  const ruta = window.location.pathname.split('/').pop() || 'index.html';

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
            <a href="index.html" class="${ruta === 'index.html' ? 'activo' : ''}">Inicio</a>
            <a href="sanciones.html" class="${ruta === 'sanciones.html' ? 'activo' : ''}">Sanciones</a>
            <a href="reglamento.html" class="${ruta === 'reglamento.html' ? 'activo' : ''}">Reglamento</a>
            ${admin ? `<a href="administracion.html" class="admin-link ${ruta === 'administracion.html' ? 'activo' : ''}">Mesa de Planilla</a>` : ''}
            ${u ? `<button type="button" class="btn btn-sm btn-red" id="btn-logout">Salir</button>` : `<a href="inicio-sesion.html" class="btn btn-sm btn-out" style="color:#fff;border-color:#fff">Acceso Admin</a>`}
          </nav>
        </div>
      </div>
    `;
    // Asignar evento de cierre de sesion al boton
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
      </div>
    `;
  }
}

// ============================================================================
// PAGINA PUBLICA (INDEX.HTML) - RESULTADOS, POSICIONES Y GOLEADORES
// ============================================================================

/**
 * Inicializa la pagina principal publica:
 * - Carga estadisticas generales (partidos, goles, equipos)
 * - Renderiza la lista de partidos jugados y en curso
 * - Renderiza la tabla de posiciones calculada con partidos finalizados
 * - Renderiza la tabla de goleadores
 * - Configura los filtros dinamicos por categoria y rama
 */
export async function iniciarIndex() {
  montarNavegacion();
  try {
    // Carga paralela de todas las colecciones necesarias desde Supabase
    const [equipos, partidos, eventos, posiciones, goleadores] = await Promise.all([
      leer('equipos'),
      leer('partidos', 'fecha_hora'),
      leer('eventos_partido'),
      leer('posiciones'),
      leer('goleadores')
    ]);

    // Asignar contadores del resumen
    document.getElementById('tot-partidos').textContent = partidos.length;
    document.getElementById('tot-goles').textContent = eventos.filter((e) => e.tipo === 'gol').length;
    document.getElementById('tot-equipos').textContent = equipos.length;

    // Poblar el selector de categorias unicas existentes
    const fCat = document.getElementById('filtro-cat');
    const fGen = document.getElementById('filtro-gen');
    const cats = [...new Set(equipos.map((e) => e.categoria).filter(Boolean))].sort();
    fCat.innerHTML = '<option value="">Todas las categorías</option>' + cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');

    // Mapa de identificadores de equipos a sus nombres para acceso rapido O(1)
    const mapaEq = Object.fromEntries(equipos.map((e) => [e.id, e.nombre]));

    /**
     * Funcion que filtra y renderiza las tablas cada vez que cambia un selector
     */
    const render = () => {
      const c = fCat.value;
      const g = fGen.value;
      const fPart = partidos.filter((p) => (!c || p.categoria === c) && (!g || p.genero === g));

      // 1. Renderizar tabla de partidos
      const tbodyP = document.getElementById('tbody-partidos');
      tbodyP.innerHTML = fPart.length ? fPart.map((p) => `
        <tr>
          <td>${fmtFecha(p.fecha_hora)}</td>
          <td><strong>${esc(p.fase)}</strong></td>
          <td>${esc(mapaEq[p.equipo_local_id])} <strong>${p.goles_local} - ${p.goles_visitante}</strong> ${esc(mapaEq[p.equipo_visitante_id])}</td>
          <td>${esc(p.categoria)} (${esc(p.genero)})</td>
          <td><span class="tag tag-${p.estado === 'en_juego' ? 'juego' : p.estado === 'finalizado' ? 'fin' : 'prog'}">${esc(p.estado.replace('_', ' '))}</span></td>
        </tr>
      `).join('') : '<tr><td colspan="5" class="empty">No hay partidos con los filtros seleccionados.</td></tr>';

      // 2. Renderizar tabla de posiciones ordenada por Pts, DG y GF
      const fPos = posiciones.filter((p) => (!c || p.categoria === c) && (!g || p.genero === g))
        .sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf);
      const tbodyPos = document.getElementById('tbody-posiciones');
      tbodyPos.innerHTML = fPos.length ? fPos.map((p, i) => `
        <tr>
          <td><strong>${i + 1}</strong></td>
          <td><strong>${esc(p.equipo)}</strong></td>
          <td>${esc(p.categoria)} (${esc(p.genero)})</td>
          <td>${p.pj}</td>
          <td>${p.pg}-${p.pe}-${p.pp}</td>
          <td>${p.gf}:${p.gc}</td>
          <td>${p.dg > 0 ? `+${p.dg}` : p.dg}</td>
          <td><strong style="color:var(--color-verde)">${p.pts}</strong></td>
        </tr>
      `).join('') : '<tr><td colspan="8" class="empty">Aún no hay partidos finalizados.</td></tr>';

      // 3. Renderizar tabla de goleadores ordenada por goles anotados
      const fGol = goleadores.filter((gol) => (!c || gol.categoria === c) && (!g || gol.genero === g))
        .sort((a, b) => b.goles - a.goles);
      const tbodyGol = document.getElementById('tbody-goleadores');
      tbodyGol.innerHTML = fGol.length ? fGol.slice(0, 10).map((gol, i) => `
        <tr>
          <td><strong>${i + 1}</strong></td>
          <td><strong>${esc(gol.jugador)}</strong> ${gol.dorsal ? `(#${gol.dorsal})` : ''}</td>
          <td>${esc(gol.equipo)}</td>
          <td>${esc(gol.categoria)} (${esc(gol.genero)})</td>
          <td><strong style="color:var(--color-verde)">${gol.goles} goles</strong></td>
        </tr>
      `).join('') : '<tr><td colspan="5" class="empty">Aún no se registraron goles.</td></tr>';
    };

    // Vincular eventos de cambio en filtros
    fCat.onchange = render;
    fGen.onchange = render;
    render(); // Primera ejecucion
  } catch (err) {
    avisar('aviso-index', err.message, true);
  }
}

// ============================================================================
// PANEL DE ADMINISTRACION, PLANILLA Y RENDICION DE CUENTAS
// ============================================================================

/**
 * Inicializa el panel administrativo privado:
 * - Valida sesion de administrador; si no es admin redirige a login
 * - Gestiona navegacion interna por pestanas (tabs)
 * - Control de planilla en vivo y cronometro oficial de futsal (1T y 2T)
 * - Registro de incidencias (goles, tarjetas amarillas y rojas con autor en cancha)
 * - Programacion de nuevos partidos y altas de equipos/jugadores
 * - Modulo financiero completo de Rendicion de Cuentas (arbitrajes, inscripciones, balance)
 * - Boton para reiniciar el campeonato a cero
 */
export async function iniciarAdmin() {
  montarNavegacion();
  // Verificacion de seguridad del rol antes de renderizar controles
  if (!esAdmin()) {
    window.location.href = 'inicio-sesion.html';
    return;
  }

  // Estado local en memoria del panel
  let equipos = [];
  let jugadores = [];
  let partidos = [];
  let pActivo = null;        // Partido abierto en la planilla digital
  let eventos = [];         // Incidencias del partido abierto
  let sanciones = [];       // Tarjetas y multas registradas
  let finanzasCfg = {};     // Tarifas base (multas, arbitraje, inscripcion)
  let ticker = null;        // Temporizador setInterval para el reloj
  let segsBase = 20 * 60;   // 20 minutos de futsal en segundos (1200)
  let tInicio = null;       // Marca de tiempo ISO cuando arranca el reloj

  // Configuracion de pestanas (Tabs)
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('activo'));
      document.querySelectorAll('.tab-sec').forEach((s) => s.hidden = true);
      btn.classList.add('activo');
      document.getElementById(btn.dataset.tab).hidden = false;
    });
  });

  /**
   * Carga o refresca todos los datos desde Supabase y actualiza las vistas
   */
  const cargar = async () => {
    [equipos, jugadores, partidos, sanciones, finanzasCfg] = await Promise.all([
      leer('equipos'),
      leer('jugadores'),
      leer('partidos', 'fecha_hora'),
      leer('sanciones'),
      obtenerFinanzas()
    ]);
    poblarSelects();
    renderRegistro();
    renderRendicionCuentas();
    // Si habia un partido abierto, mantenerlo actualizado en vivo
    if (pActivo) {
      const up = partidos.find((p) => p.id === pActivo.id);
      if (up) abrirPlanilla(up.id, false);
    }
  };

  /**
   * Llena los menus desplegables de equipos y capitanes segun los filtros seleccionados
   */
  const poblarSelects = () => {
    const sEqJug = document.getElementById('s-equipo-jugador');
    if (sEqJug) sEqJug.innerHTML = equipos.map((e) => `<option value="${e.id}">${esc(e.nombre)} · ${esc(e.categoria)} (${esc(e.genero)})</option>`).join('');

    const cat = document.getElementById('filtro-prog-cat')?.value || '';
    const gen = document.getElementById('filtro-prog-gen')?.value || '';
    const filtrados = equipos.filter((e) => (!cat || e.categoria === cat) && (!gen || e.genero === gen));

    const sLoc = document.getElementById('s-partido-local');
    const sVis = document.getElementById('s-partido-visita');
    if (sLoc && sVis) {
      const opts = '<option value="">Seleccionar equipo</option>' + filtrados.map((e) => `<option value="${e.id}">${esc(e.nombre)} · ${esc(e.categoria)} (${esc(e.genero)})</option>`).join('');
      sLoc.innerHTML = opts;
      sVis.innerHTML = opts;
    }
    poblarCapitanesNuevo();
  };

  /**
   * Llena los desplegables de capitanes segun los jugadores del equipo local y visitante elegidos
   */
  const poblarCapitanesNuevo = () => {
    [['s-cap-local', 's-partido-local'], ['s-cap-visita', 's-partido-visita']].forEach(([cId, eId]) => {
      const selC = document.getElementById(cId);
      const selE = document.getElementById(eId);
      if (!selC || !selE) return;
      const jug = jugadores.filter((j) => j.equipo_id === selE.value);
      selC.innerHTML = '<option value="">Sin designar</option>' + jug.map((j) => `<option value="${j.id}">${esc(j.nombre)} ${j.dorsal ? `(#${j.dorsal})` : ''}</option>`).join('');
    });
  };

  // Reaccionar al cambio de equipo para actualizar la lista de capitanes
  document.getElementById('s-partido-local')?.addEventListener('change', poblarCapitanesNuevo);
  document.getElementById('s-partido-visita')?.addEventListener('change', poblarCapitanesNuevo);

  /**
   * Renderiza la lista general de partidos en la pestana de registro
   */
  const renderRegistro = () => {
    const cont = document.getElementById('lista-partidos-admin');
    if (!cont) return;
    const mapaEq = Object.fromEntries(equipos.map((e) => [e.id, e.nombre]));

    cont.innerHTML = partidos.length ? partidos.map((p) => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid var(--color-borde); flex-wrap:wrap; gap:8px">
        <div>
          <strong>${esc(mapaEq[p.equipo_local_id])} ${p.goles_local} - ${p.goles_visitante} ${esc(mapaEq[p.equipo_visitante_id])}</strong>
          <small style="display:block; color:var(--color-texto-secundario)">${esc(p.fase)} · ${esc(p.categoria)} (${esc(p.genero)}) · ${fmtFecha(p.fecha_hora)} · Arbitraje: Bs. ${Number(p.costo_arbitraje || 0).toFixed(2)} (${p.arbitraje_pagado ? 'Pagado' : 'Pendiente'})</small>
        </div>
        <div style="display:flex; gap:6px; align-items:center">
          <span class="tag tag-${p.estado === 'en_juego' ? 'juego' : p.estado === 'finalizado' ? 'fin' : 'prog'}">${esc(p.estado)}</span>
          <button class="btn btn-sm" data-abrir="${p.id}">Abrir Planilla</button>
          <button class="btn btn-sm btn-red" data-borrar="${p.id}">Eliminar</button>
        </div>
      </div>
    `).join('') : '<p class="empty">No hay partidos en el campeonato.</p>';

    // Botones para cargar el partido en la planilla digital
    cont.querySelectorAll('[data-abrir]').forEach((b) => b.addEventListener('click', () => {
      abrirPlanilla(b.dataset.abrir);
      document.querySelector('[data-tab="sec-planilla"]').click();
    }));

    // Botones para eliminar un partido individual
    cont.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Deseas eliminar este partido y sus incidencias de la planilla?')) return;
      await borrar('partidos', b.dataset.borrar);
      await cargar();
    }));
  };

  /**
   * Calcula los segundos restantes del cronometro teniendo en cuenta el tiempo transcurrido en vivo
   * @returns {number} Segundos restantes
   */
  const segsActuales = () => {
    if (pActivo?.estado !== 'en_juego' || !tInicio) return segsBase;
    return Math.max(0, segsBase - Math.floor((Date.now() - new Date(tInicio).getTime()) / 1000));
  };

  /**
   * Actualiza el display del reloj y el estado de habilitacion de los botones de control
   */
  const renderReloj = () => {
    const relojEl = document.getElementById('reloj-num');
    if (!relojEl || !pActivo) return;
    relojEl.textContent = fmtReloj(segsActuales());
    document.getElementById('reloj-periodo').textContent = `${pActivo.periodo}° TIEMPO (${pActivo.estado.toUpperCase()})`;
    const fin = pActivo.estado === 'finalizado';
    document.getElementById('btn-reloj-ini').disabled = fin;
    document.getElementById('btn-reloj-pau').disabled = fin || pActivo.estado !== 'en_juego';
    document.getElementById('btn-reloj-2t').disabled = fin || pActivo.periodo >= 2;
    document.getElementById('btn-reloj-fin').disabled = fin;
  };

  /**
   * Inicia el temporizador de cuenta regresiva por cada segundo
   */
  const arrancarReloj = () => {
    if (ticker) clearInterval(ticker);
    tInicio = new Date().toISOString();
    ticker = setInterval(async () => {
      renderReloj();
      // Al llegar a cero el tiempo reglamentario, pausar y marcar descanso
      if (segsActuales() === 0) {
        clearInterval(ticker);
        await actualizar('partidos', pActivo.id, { estado: 'descanso', reloj_segundos: 0, reloj_iniciado_en: null });
        pActivo.estado = 'descanso';
        renderReloj();
      }
    }, 1000);
  };

  /**
   * Abre un partido en la planilla digital oficial
   * @param {string} id UUID del partido
   * @param {boolean} scroll Si debe hacer scroll hasta la seccion
   */
  const abrirPlanilla = async (id, scroll = true) => {
    if (ticker) clearInterval(ticker);
    pActivo = partidos.find((p) => p.id === id);
    if (!pActivo) return;

    // Obtener los eventos registrados correspondientes a este partido
    const todosEv = await leer('eventos_partido');
    eventos = todosEv.filter((e) => e.partido_id === id);

    segsBase = pActivo.reloj_segundos ?? 1200;
    tInicio = pActivo.reloj_iniciado_en;
    if (pActivo.estado === 'en_juego' && tInicio) {
      segsBase = Math.max(0, segsBase - Math.floor((Date.now() - new Date(tInicio).getTime()) / 1000));
      tInicio = new Date().toISOString();
    }

    document.getElementById('sin-partido').hidden = true;
    document.getElementById('con-partido').hidden = false;

    const eqLoc = equipos.find((e) => e.id === pActivo.equipo_local_id);
    const eqVis = equipos.find((e) => e.id === pActivo.equipo_visitante_id);
    const capLoc = jugadores.find((j) => j.id === pActivo.capitan_local_id);
    const capVis = jugadores.find((j) => j.id === pActivo.capitan_visitante_id);

    // Renderizar marcador oficial y metadatos
    document.getElementById('mar-nom-local').textContent = eqLoc?.nombre || 'Local';
    document.getElementById('mar-nom-visita').textContent = eqVis?.nombre || 'Visitante';
    document.getElementById('mar-gol-local').textContent = pActivo.goles_local || 0;
    document.getElementById('mar-gol-visita').textContent = pActivo.goles_visitante || 0;
    document.getElementById('mar-cap-local').textContent = capLoc ? `(C) Capitán: ${capLoc.nombre}` : 'Sin capitán';
    document.getElementById('mar-cap-visita').textContent = capVis ? `(C) Capitán: ${capVis.nombre}` : 'Sin capitán';
    document.getElementById('meta-partido-texto').textContent = `${pActivo.fase} · ${pActivo.categoria} (${pActivo.genero}) · ${fmtFecha(pActivo.fecha_hora)}`;

    // Arbitraje del partido
    const arbChk = document.getElementById('chk-arbitraje-pagado');
    if (arbChk) {
      arbChk.checked = Boolean(pActivo.arbitraje_pagado);
      document.getElementById('txt-costo-arbitraje-partido').textContent = Number(pActivo.costo_arbitraje || 0).toFixed(2);
    }

    // Selectores para anotar incidencias (goles o tarjetas)
    const selEq = document.getElementById('s-incidencia-equipo');
    selEq.innerHTML = `<option value="${pActivo.equipo_local_id}">${esc(eqLoc?.nombre)}</option><option value="${pActivo.equipo_visitante_id}">${esc(eqVis?.nombre)}</option>`;
    const poblarJugIncidencia = () => {
      const jList = jugadores.filter((j) => j.equipo_id === selEq.value);
      document.getElementById('s-incidencia-jugador').innerHTML = jList.map((j) => `<option value="${j.id}">${j.dorsal ? `#${j.dorsal} ` : ''}${esc(j.nombre)}</option>`).join('');
    };
    selEq.onchange = poblarJugIncidencia;
    poblarJugIncidencia();

    // Historial de eventos del partido con opcion de eliminacion por error
    const listaEv = document.getElementById('lista-eventos-planilla');
    listaEv.innerHTML = eventos.length ? [...eventos].reverse().map((ev) => {
      const j = jugadores.find((x) => x.id === ev.jugador_id);
      const eq = equipos.find((x) => x.id === ev.equipo_id);
      return `
        <li>
          <span>
            [${ev.tipo.toUpperCase()}] · <strong>${esc(j?.nombre)}</strong> (${esc(eq?.nombre)}) · <small>${ev.periodo}°T (${fmtReloj(ev.segundo_partido)})</small>
          </span>
          <button class="btn btn-sm btn-red" data-del-ev="${ev.id}">Eliminar</button>
        </li>
      `;
    }).join('') : '<li class="empty">Sin incidencias registradas.</li>';

    // Eliminar incidencia errónea
    listaEv.querySelectorAll('[data-del-ev]').forEach((b) => b.addEventListener('click', async () => {
      await borrar('eventos_partido', b.dataset.delEv);
      await abrirPlanilla(pActivo.id, false);
      partidos = await leer('partidos', 'fecha_hora');
      renderRegistro();
      renderRendicionCuentas();
    }));

    renderReloj();
    if (pActivo.estado === 'en_juego') arrancarReloj();
    if (scroll) document.getElementById('con-partido').scrollIntoView({ behavior: 'smooth' });
  };

  // Checkbox de pago de arbitraje directamente en la planilla
  document.getElementById('chk-arbitraje-pagado')?.addEventListener('change', async (e) => {
    if (!pActivo) return;
    const pagado = e.target.checked;
    await actualizar('partidos', pActivo.id, { arbitraje_pagado: pagado });
    pActivo.arbitraje_pagado = pagado;
    partidos = await leer('partidos', 'fecha_hora');
    renderRegistro();
    renderRendicionCuentas();
  });

  // Boton: Iniciar o reanudar el cronometro
  document.getElementById('btn-reloj-ini').addEventListener('click', async () => {
    segsBase = segsActuales();
    tInicio = new Date().toISOString();
    await actualizar('partidos', pActivo.id, { estado: 'en_juego', reloj_segundos: segsBase, reloj_iniciado_en: tInicio });
    pActivo.estado = 'en_juego';
    arrancarReloj();
  });

  // Boton: Pausar el cronometro
  document.getElementById('btn-reloj-pau').addEventListener('click', async () => {
    if (ticker) clearInterval(ticker);
    segsBase = segsActuales();
    await actualizar('partidos', pActivo.id, { estado: 'descanso', reloj_segundos: segsBase, reloj_iniciado_en: null });
    pActivo.estado = 'descanso';
    renderReloj();
  });

  // Boton: Iniciar el segundo tiempo (reinicia a 20:00 y fija periodo 2)
  document.getElementById('btn-reloj-2t').addEventListener('click', async () => {
    if (ticker) clearInterval(ticker);
    segsBase = 1200;
    tInicio = new Date().toISOString();
    await actualizar('partidos', pActivo.id, { estado: 'en_juego', periodo: 2, reloj_segundos: 1200, reloj_iniciado_en: tInicio });
    pActivo.estado = 'en_juego';
    pActivo.periodo = 2;
    arrancarReloj();
  });

  // Boton: Finalizar el partido oficialmente
  document.getElementById('btn-reloj-fin').addEventListener('click', async () => {
    if (!confirm('Deseas finalizar oficialmente el partido?')) return;
    if (ticker) clearInterval(ticker);
    segsBase = segsActuales();
    await actualizar('partidos', pActivo.id, { estado: 'finalizado', reloj_segundos: segsBase, reloj_iniciado_en: null });
    pActivo.estado = 'finalizado';
    partidos = await leer('partidos', 'fecha_hora');
    renderRegistro();
    renderRendicionCuentas();
    renderReloj();
    avisar('aviso-admin', 'Partido finalizado oficialmente.');
  });

  // Formulario: Registrar incidencia (Gol, Amarilla o Roja)
  document.getElementById('form-incidencia').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pActivo) return;
    const eqId = document.getElementById('s-incidencia-equipo').value;
    const jId = document.getElementById('s-incidencia-jugador').value;
    const tipo = document.getElementById('s-incidencia-tipo').value;

    await guardar('eventos_partido', {
      partido_id: pActivo.id,
      equipo_id: eqId,
      jugador_id: jId,
      tipo,
      periodo: pActivo.periodo,
      segundo_partido: Math.max(0, 1200 - segsActuales())
    });

    await abrirPlanilla(pActivo.id, false);
    partidos = await leer('partidos', 'fecha_hora');
    sanciones = await leer('sanciones');
    renderRegistro();
    renderRendicionCuentas();
  });

  // Formulario: Programar un nuevo partido
  document.getElementById('form-partido').addEventListener('submit', async (e) => {
    e.preventDefault();
    const locId = document.getElementById('s-partido-local').value;
    const visId = document.getElementById('s-partido-visita').value;
    if (!locId || !visId || locId === visId) {
      alert('Selecciona dos equipos distintos.');
      return;
    }
    const eqL = equipos.find((x) => x.id === locId);
    const costoArb = Number(document.getElementById('partido-arbitraje')?.value || finanzasCfg.costo_arbitraje || 30);

    const nuevo = await guardar('partidos', {
      fase: document.getElementById('partido-fase').value.trim(),
      fecha_hora: new Date(document.getElementById('partido-fecha').value).toISOString(),
      categoria: eqL.categoria,
      genero: eqL.genero,
      equipo_local_id: locId,
      equipo_visitante_id: visId,
      capitan_local_id: document.getElementById('s-cap-local').value || null,
      capitan_visitante_id: document.getElementById('s-cap-visita').value || null,
      costo_arbitraje: costoArb,
      arbitraje_pagado: false,
      reloj_segundos: 1200,
      periodo: 1,
      estado: 'programado'
    });
    document.getElementById('form-partido').reset();
    await cargar();
    const id = Array.isArray(nuevo) ? nuevo[0]?.id : nuevo?.id;
    if (id) {
      abrirPlanilla(id);
      document.querySelector('[data-tab="sec-planilla"]').click();
    }
    avisar('aviso-admin', 'Partido programado exitosamente.');
  });

  // Formulario: Registrar nuevo equipo
  document.getElementById('form-equipo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const inscMonto = Number(document.getElementById('equipo-inscripcion')?.value || finanzasCfg.monto_inscripcion || 50);
    await guardar('equipos', {
      nombre: document.getElementById('equipo-nombre').value.trim(),
      categoria: document.getElementById('equipo-categoria').value.trim(),
      genero: document.getElementById('equipo-genero').value,
      monto_inscripcion: inscMonto,
      inscripcion_pagada: document.getElementById('equipo-inscripcion-pagada').checked
    });
    document.getElementById('form-equipo').reset();
    await cargar();
    avisar('aviso-admin', 'Equipo guardado.');
  });

  // Formulario: Registrar nuevo jugador
  document.getElementById('form-jugador').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dorsal = document.getElementById('jugador-dorsal').value;
    await guardar('jugadores', {
      equipo_id: document.getElementById('s-equipo-jugador').value,
      nombre: document.getElementById('jugador-nombre').value.trim(),
      dorsal: dorsal ? Number(dorsal) : null
    });
    document.getElementById('form-jugador').reset();
    await cargar();
    avisar('aviso-admin', 'Jugador guardado.');
  });

  // ==========================================================================
  // RENDICION DE CUENTAS Y CONTROL FINANCIERO COMPLETO
  // ==========================================================================

  /**
   * Calcula y renderiza el balance financiero, ingresos, egresos y tablas de rendición
   */
  const renderRendicionCuentas = () => {
    // 1. Totales de inscripciones de equipos
    const totalInscripcionesCobradas = equipos.filter((e) => e.inscripcion_pagada).reduce((acc, e) => acc + Number(e.monto_inscripcion || 0), 0);
    const totalInscripcionesPendientes = equipos.filter((e) => !e.inscripcion_pagada).reduce((acc, e) => acc + Number(e.monto_inscripcion || 0), 0);

    // 2. Totales de multas disciplinarias por tarjetas amarillas y rojas
    const totalMultasCobradas = sanciones.filter((s) => s.pagada).reduce((acc, s) => acc + Number(s.monto || 0), 0);
    const totalMultasPendientes = sanciones.filter((s) => !s.pagada).reduce((acc, s) => acc + Number(s.monto || 0), 0);

    // 3. Totales de costos de arbitraje
    const totalArbitrajePagado = partidos.filter((p) => p.arbitraje_pagado).reduce((acc, p) => acc + Number(p.costo_arbitraje || 0), 0);
    const totalArbitrajePendiente = partidos.filter((p) => !p.arbitraje_pagado).reduce((acc, p) => acc + Number(p.costo_arbitraje || 0), 0);

    // 4. Balance General: Dinero real disponible en la caja del torneo
    const totalIngresosEfectivos = totalInscripcionesCobradas + totalMultasCobradas;
    const balanceCaja = totalIngresosEfectivos - totalArbitrajePagado;

    // Actualizar tarjetas de resumen en el DOM
    document.getElementById('kpi-ingresos-inscripciones').textContent = `Bs. ${totalInscripcionesCobradas.toFixed(2)}`;
    document.getElementById('kpi-inscripciones-pendientes').textContent = `(Pendiente: Bs. ${totalInscripcionesPendientes.toFixed(2)})`;

    document.getElementById('kpi-ingresos-multas').textContent = `Bs. ${totalMultasCobradas.toFixed(2)}`;
    document.getElementById('kpi-multas-pendientes').textContent = `(Pendiente: Bs. ${totalMultasPendientes.toFixed(2)})`;

    document.getElementById('kpi-egresos-arbitraje').textContent = `Bs. ${totalArbitrajePagado.toFixed(2)}`;
    document.getElementById('kpi-arbitraje-pendiente').textContent = `(Por pagar: Bs. ${totalArbitrajePendiente.toFixed(2)})`;

    const elBalance = document.getElementById('kpi-balance-general');
    elBalance.textContent = `Bs. ${balanceCaja.toFixed(2)}`;
    elBalance.style.color = balanceCaja >= 0 ? 'var(--color-verde)' : 'var(--color-rojo)';

    // Formulario de tarifas base del campeonato
    const cfgAmarilla = document.getElementById('cfg-tarifa-amarilla');
    const cfgRoja = document.getElementById('cfg-tarifa-roja');
    const cfgInsc = document.getElementById('cfg-tarifa-inscripcion');
    const cfgArb = document.getElementById('cfg-tarifa-arbitraje');
    if (cfgAmarilla && finanzasCfg) {
      cfgAmarilla.value = finanzasCfg.multa_amarilla ?? 10;
      cfgRoja.value = finanzasCfg.multa_roja ?? 20;
      cfgInsc.value = finanzasCfg.monto_inscripcion ?? 50;
      cfgArb.value = finanzasCfg.costo_arbitraje ?? 30;
    }

    // Tabla de Control de Inscripciones por Equipo
    const tbodyEqFin = document.getElementById('tbody-finanzas-equipos');
    if (tbodyEqFin) {
      tbodyEqFin.innerHTML = equipos.length ? equipos.map((eq) => `
        <tr>
          <td><strong>${esc(eq.nombre)}</strong></td>
          <td>${esc(eq.categoria)} (${esc(eq.genero)})</td>
          <td>
            Bs. <input type="number" step="1" min="0" value="${Number(eq.monto_inscripcion || 0)}" data-monto-eq="${eq.id}" style="width:70px;padding:3px">
          </td>
          <td><strong>${eq.inscripcion_pagada ? 'Pagada' : 'Pendiente'}</strong></td>
          <td>
            <button class="btn btn-sm ${eq.inscripcion_pagada ? 'btn-out' : ''}" data-pago-eq="${eq.id}" data-val="${!eq.inscripcion_pagada}">
              ${eq.inscripcion_pagada ? 'Marcar Pendiente' : 'Marcar Pagada'}
            </button>
            <button class="btn btn-sm btn-out" data-guardar-monto-eq="${eq.id}">Guardar Monto</button>
          </td>
        </tr>
      `).join('') : '<tr><td colspan="5" class="empty">No hay equipos registrados.</td></tr>';

      // Cambiar estado pagado / pendiente de inscripcion
      tbodyEqFin.querySelectorAll('[data-pago-eq]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const val = btn.dataset.val === 'true';
          await actualizar('equipos', btn.dataset.pagoEq, { inscripcion_pagada: val });
          await cargar();
        });
      });

      // Modificar monto de inscripcion individual de un equipo
      tbodyEqFin.querySelectorAll('[data-guardar-monto-eq]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const input = tbodyEqFin.querySelector(`[data-monto-eq="${btn.dataset.guardarMontoEq}"]`);
          const monto = Number(input.value || 0);
          await actualizar('equipos', btn.dataset.guardarMontoEq, { monto_inscripcion: monto });
          await cargar();
          avisar('aviso-admin', 'Monto de inscripción actualizado.');
        });
      });
    }

    // Tabla de Rendicion por Partido (Arbitraje y multas generadas)
    const tbodyPartFin = document.getElementById('tbody-finanzas-partidos');
    if (tbodyPartFin) {
      const mapaEq = Object.fromEntries(equipos.map((e) => [e.id, e.nombre]));
      tbodyPartFin.innerHTML = partidos.length ? partidos.map((p) => {
        const sancionesPartido = sanciones.filter((s) => s.partido_id === p.id);
        const multasTotales = sancionesPartido.reduce((acc, s) => acc + Number(s.monto || 0), 0);
        const multasCobradas = sancionesPartido.filter((s) => s.pagada).reduce((acc, s) => acc + Number(s.monto || 0), 0);
        const costoArb = Number(p.costo_arbitraje || 0);

        return `
          <tr>
            <td>${fmtFecha(p.fecha_hora)}</td>
            <td><strong>${esc(mapaEq[p.equipo_local_id])} vs ${esc(mapaEq[p.equipo_visitante_id])}</strong></td>
            <td>
              Bs. <input type="number" step="1" min="0" value="${costoArb}" data-arb-partido="${p.id}" style="width:65px;padding:3px">
              <button class="btn btn-sm btn-out" data-guardar-arb="${p.id}">Fijar</button>
            </td>
            <td>
              <button class="btn btn-sm ${p.arbitraje_pagado ? '' : 'btn-red'}" data-toggle-arb="${p.id}" data-val="${!p.arbitraje_pagado}">
                ${p.arbitraje_pagado ? 'Pagado a Arbitro' : 'Pendiente Pago'}
              </button>
            </td>
            <td>Bs. ${multasCobradas.toFixed(2)} / ${multasTotales.toFixed(2)}</td>
            <td><span class="tag tag-${p.estado === 'finalizado' ? 'fin' : 'prog'}">${esc(p.estado)}</span></td>
          </tr>
        `;
      }).join('') : '<tr><td colspan="6" class="empty">No hay partidos registrados para rendición.</td></tr>';

      // Alternar estado de pago al arbitro
      tbodyPartFin.querySelectorAll('[data-toggle-arb]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const val = btn.dataset.val === 'true';
          await actualizar('partidos', btn.dataset.toggleArb, { arbitraje_pagado: val });
          await cargar();
        });
      });

      // Modificar costo de arbitraje del partido
      tbodyPartFin.querySelectorAll('[data-guardar-arb]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const input = tbodyPartFin.querySelector(`[data-arb-partido="${btn.dataset.guardarArb}"]`);
          const monto = Number(input.value || 0);
          await actualizar('partidos', btn.dataset.guardarArb, { costo_arbitraje: monto });
          await cargar();
          avisar('aviso-admin', 'Costo de arbitraje actualizado.');
        });
      });
    }
  };

  // Formulario: Guardar tarifas base del campeonato
  document.getElementById('form-tarifas-base')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nuevosValores = {
      multa_amarilla: Number(document.getElementById('cfg-tarifa-amarilla').value),
      multa_roja: Number(document.getElementById('cfg-tarifa-roja').value),
      monto_inscripcion: Number(document.getElementById('cfg-tarifa-inscripcion').value),
      costo_arbitraje: Number(document.getElementById('cfg-tarifa-arbitraje').value),
      actualizado_en: new Date().toISOString()
    };
    try {
      await guardarFinanzas(nuevosValores);
      finanzasCfg = nuevosValores;
      avisar('aviso-admin', 'Tarifas del campeonato actualizadas con éxito.');
    } catch (err) {
      alert(`Error al guardar tarifas: ${err.message}`);
    }
  });

  // Boton: Reiniciar Campeonato a cero
  document.getElementById('btn-reiniciar-campeonato')?.addEventListener('click', async () => {
    const confirmacion = confirm(
      'ATENCION: Deseas REINICIAR EL CAMPEONATO?\n\n' +
      '- Se eliminaran TODOS los partidos disputados.\n' +
      '- Se reiniciara la tabla de posiciones y goleadores a cero.\n' +
      '- Se eliminaran los goles y sanciones registradas.\n' +
      '- Se mantendran tus equipos y jugadores inscritos para el nuevo torneo.\n\n' +
      'Deseas continuar?'
    );
    if (!confirmacion) return;

    try {
      await reiniciarCampeonato();
      pActivo = null;
      if (ticker) clearInterval(ticker);
      document.getElementById('con-partido').hidden = true;
      document.getElementById('sin-partido').hidden = false;
      await cargar();
      alert('Campeonato reiniciado con exito. Listo para el nuevo torneo.');
    } catch (err) {
      alert(`Error al reiniciar: ${err.message}`);
    }
  });

  await cargar(); // Carga inicial al entrar al panel admin
}

// ============================================================================
// PAGINA DE SANCIONES (SANCIONES.HTML)
// ============================================================================

/**
 * Inicializa la pagina de sanciones disciplinarias:
 * - Lista todas las tarjetas amarillas y rojas aplicadas en cancha
 * - Muestra el monto de multa y estado de pago (Pagada / Pendiente)
 * - Muestra el estado de sancion (Pendiente, Suspendida, Cumplida, Retirada)
 * - Provee controles de administracion para fijar montos, cobrar, suspender o retirar
 */
export async function iniciarSanciones() {
  montarNavegacion();
  const admin = esAdmin();

  try {
    const [sanciones, jugadores, equipos, partidos] = await Promise.all([
      leer('sanciones', 'creada_en'),
      leer('jugadores'),
      leer('equipos'),
      leer('partidos')
    ]);

    const mapaJ = Object.fromEntries(jugadores.map((j) => [j.id, j]));
    const mapaEq = Object.fromEntries(equipos.map((e) => [e.id, e.nombre]));
    const mapaP = Object.fromEntries(partidos.map((p) => [p.id, p]));

    const tbody = document.getElementById('tbody-sanciones');
    tbody.innerHTML = sanciones.length ? sanciones.map((s) => {
      const j = mapaJ[s.jugador_id];
      const eq = mapaEq[j?.equipo_id] || '-';
      const p = mapaP[s.partido_id];
      const partidoInfo = p ? `${mapaEq[p.equipo_local_id]} vs ${mapaEq[p.equipo_visitante_id]}` : 'Partido';

      let adminBtns = '';
      if (admin) {
        adminBtns = `
          <td>
            <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap">
              <input type="number" min="0" step="1" value="${Number(s.monto)}" data-monto-sancion="${s.id}" style="width:60px;padding:2px">
              <button class="btn btn-sm btn-out" data-guardar-monto="${s.id}">Fijar</button>
              <button class="btn btn-sm ${s.pagada ? 'btn-out' : ''}" data-pago="${s.id}" data-val="${!s.pagada}">
                ${s.pagada ? 'Pendiente' : 'Marcar Pagada'}
              </button>
              <button class="btn btn-sm btn-red" data-estado="${s.id}" data-val="suspendida">Suspender</button>
              <button class="btn btn-sm btn-out" data-estado="${s.id}" data-val="retirada">Retirar</button>
            </div>
          </td>
        `;
      }

      return `
        <tr>
          <td><strong>${esc(j?.nombre)}</strong> ${j?.dorsal ? `(#${j.dorsal})` : ''}</td>
          <td>${esc(eq)}</td>
          <td><span class="badge-tarj ${s.tarjeta}"></span> <strong>[${esc(s.tarjeta.toUpperCase())}]</strong></td>
          <td><small>${esc(partidoInfo)}</small></td>
          <td>Bs. ${Number(s.monto).toFixed(2)}</td>
          <td><strong>${s.pagada ? 'Pagada' : 'Pendiente'}</strong></td>
          <td><span class="tag tag-${s.estado === 'suspendida' ? 'juego' : 'prog'}">${esc(s.estado)}</span></td>
          ${adminBtns}
        </tr>
      `;
    }).join('') : '<tr><td colspan="8" class="empty">No hay sanciones registradas.</td></tr>';

    if (admin) {
      document.getElementById('th-admin-sanciones')?.removeAttribute('hidden');

      // Alternar estado de pago de la multa
      tbody.querySelectorAll('[data-pago]').forEach((b) => b.addEventListener('click', async () => {
        const val = b.dataset.val === 'true';
        await actualizar('sanciones', b.dataset.pago, { pagada: val, estado: val ? 'cumplida' : 'pendiente' });
        iniciarSanciones();
      }));

      // Cambiar estado disciplinario (suspender o retirar sancion)
      tbody.querySelectorAll('[data-estado]').forEach((b) => b.addEventListener('click', async () => {
        await actualizar('sanciones', b.dataset.estado, { estado: b.dataset.val });
        iniciarSanciones();
      }));

      // Modificar monto individual de la multa
      tbody.querySelectorAll('[data-guardar-monto]').forEach((b) => b.addEventListener('click', async () => {
        const input = tbody.querySelector(`[data-monto-sancion="${b.dataset.guardarMonto}"]`);
        const monto = Number(input.value || 0);
        await actualizar('sanciones', b.dataset.guardarMonto, { monto });
        iniciarSanciones();
      }));
    }
  } catch (err) {
    document.getElementById('tbody-sanciones').innerHTML = `<tr><td colspan="8" class="empty">${esc(err.message)}</td></tr>`;
  }
}
