import {
  leer, guardar, actualizar, borrar, esAdmin
} from './supabase.js';
import {
  esc, fmtFecha, fmtReloj, avisar, sincronizarNavegacion
} from './app.js';
import { crearModuloPartidos } from './app-partidos.js';
import { crearModuloEquipos } from './app-equipos.js';

// Actualiza el reloj y habilita controles según el estado y periodo del partido.
const renderizarReloj = (partido, segundos, penales) => {
  const reloj = document.getElementById('reloj-num');
  if (!reloj || !partido) return;
  reloj.textContent = fmtReloj(segundos);
  const periodo = partido.periodo === 3 ? 'TIEMPO EXTRA' : partido.periodo === 4 ? 'PENALES' : `${partido.periodo}° TIEMPO`;
  document.getElementById('reloj-periodo').textContent =
    `${periodo} (${partido.estado.replace(/_/g, ' ').toUpperCase()})`;
  // Habilita cada control únicamente cuando la situación del encuentro lo permite.
  const fin = partido.estado === 'finalizado';
  const enJuego = ['en_juego', 'tiempo_extra'].includes(partido.estado);
  const puedeProrroga = partido.periodo === 2 && partido.estado === 'descanso' && segundos === 0 &&
    partido.goles_local === partido.goles_visitante;
  document.getElementById('btn-reloj-ini').disabled = fin || partido.estado === 'penales' || segundos === 0;
  document.getElementById('btn-reloj-pau').disabled = fin || !enJuego;
  document.getElementById('btn-reloj-2t').disabled =
    fin || partido.periodo !== 1 || partido.estado !== 'descanso' || segundos > 0;
  document.getElementById('btn-reloj-extra').disabled = fin || !puedeProrroga;
  document.getElementById('btn-toggle-penales').disabled = fin || partido.estado !== 'penales';
  document.getElementById('btn-reloj-fin').disabled = fin || partido.periodo < 2 || enJuego ||
    segundos > 0 || (partido.estado === 'penales' && !penales.ganador());
};

// Agrupa la lógica de la tanda: turnos, tiros, resultado y persistencia.
const crearModuloPenales = ({ partido, equipos, actualizar, reloj }) => {
  // Los tiros se guardan por separado para conservar el orden y el resultado de cada lado.
  let local = [];
  let visitante = [];
  let activo = false;
  // Devuelve al ganador cuando la tanda ya se decidió; si no, devuelve null.
  const ganador = () => {
    const match = partido();
    if (!match) return null;
    const localGoles = local.filter((shot) => shot === 'gol').length;
    const visitaGoles = visitante.filter((shot) => shot === 'gol').length;
    if (local.length === visitante.length && local.length >= 5 && localGoles !== visitaGoles) {
      return localGoles > visitaGoles ? match.equipo_local_id : match.equipo_visitante_id;
    }
    if (local.length <= 5 && visitante.length <= 5) {
      if (localGoles + 5 - local.length < visitaGoles && visitante.length >= local.length) return match.equipo_visitante_id;
      if (visitaGoles + 5 - visitante.length < localGoles && local.length >= visitante.length) return match.equipo_local_id;
    }
    return null;
  };
  // Guarda los tiros actuales y notifica si Supabase no pudo actualizarlos.
  const guardarTiros = async () => {
    const match = partido();
    try {
      await actualizar('partidos', match.id, { penales_local_tiros: local, penales_visitante_tiros: visitante });
      match.penales_local_tiros = local;
      match.penales_visitante_tiros = visitante;
      return true;
    } catch (error) {
      avisar('aviso-admin', `No se pudo guardar la tanda de penales: ${error.message}`, true);
      return false;
    }
  };
  // Sincroniza en pantalla el marcador, los tiros disponibles y el turno actual.
  const render = () => {
    const match = partido();
    if (!match) return;
    // El marcador de la tanda cuenta únicamente los tiros convertidos en gol.
    const goles = [local, visitante].map((tiros) => tiros.filter((tiro) => tiro === 'gol').length);
    document.getElementById('penales-score-local').textContent = goles[0];
    document.getElementById('penales-score-visita').textContent = goles[1];
    document.getElementById('penales-total-local').textContent = `${goles[0]} goles`;
    document.getElementById('penales-total-visita').textContent = `${goles[1]} goles`;
    const badge = document.getElementById('marcador-penales-badge');
    badge.hidden = !activo;
    if (activo) document.getElementById('txt-marcador-penales').textContent = `Penales: ${goles[0]} - ${goles[1]}`;
    const maxTiros = Math.max(5, local.length + 1, visitante.length + 1);
    [['local', local], ['visita', visitante]].forEach(([lado, tiros]) => {
      document.getElementById(`indicadores-penales-${lado}`).innerHTML =
        Array.from({ length: maxTiros }, (_, index) => {
          const tiro = tiros[index];
          const clase = tiro === 'gol' ? 'tiro-gol' : tiro === 'fallo' ? 'tiro-fallo' : 'tiro-pendiente';
          return `<div class="tiro-slot ${clase}">${tiro === 'gol' ? 'G' : tiro === 'fallo' ? 'X' : index + 1}</div>`;
        }).join('');
    });
    const botones = ['btn-penal-local-gol', 'btn-penal-local-fallo', 'btn-penal-visita-gol', 'btn-penal-visita-fallo']
      .map((id) => document.getElementById(id));
    const winner = ganador();
    // En alternancia, comienza local y luego tira el lado que tenga menos tiros.
    const localTurn = local.length <= visitante.length;
    const status = document.getElementById('penales-estado-texto');
    if (winner) {
      status.textContent = `Ganador por Penales: ${equipos().find((team) => team.id === winner)?.nombre || 'Equipo'} (${goles[0]} - ${goles[1]})`;
      status.style.color = 'var(--color-verde)';
      botones.forEach((button) => { button.disabled = true; });
    } else {
      const teamId = localTurn ? match.equipo_local_id : match.equipo_visitante_id;
      status.textContent = `Turno: ${equipos().find((team) => team.id === teamId)?.nombre || 'Equipo'} (Tiro ${(localTurn ? local : visitante).length + 1})`;
      status.style.color = '#7d6608';
      botones.forEach((button, index) => { button.disabled = !activo || (index < 2) !== localTurn; });
    }
  };
  // Valida el turno, registra un tiro y actualiza el resultado visible.
  const registrar = async (lado, resultado) => {
    if (!activo || ganador()) return;
    const esTurnoLocal = local.length <= visitante.length;
    if ((lado === 'local') !== esTurnoLocal) return;
    const tiros = lado === 'local' ? local : visitante;
    tiros.push(resultado);
    if (!await guardarTiros()) tiros.pop();
    render();
    reloj();
  };
  // Inicia una tanda nueva y guarda sus listas de tiros vacías.
  const iniciar = async () => {
    local = [];
    visitante = [];
    activo = true;
    document.getElementById('panel-penales').hidden = false;
    const match = partido();
    document.getElementById('penales-nom-local').textContent =
      equipos().find((team) => team.id === match.equipo_local_id)?.nombre || 'Local';
    document.getElementById('penales-nom-visita').textContent =
      equipos().find((team) => team.id === match.equipo_visitante_id)?.nombre || 'Visitante';
    if (!await guardarTiros()) {
      activo = false;
      document.getElementById('panel-penales').hidden = true;
      return false;
    }
    render();
    return true;
  };
  // Enlaza los controles para anotar tiros, deshacer, reiniciar y mostrar la tanda.
  [['local', 'gol'], ['local', 'fallo'], ['visita', 'gol'], ['visita', 'fallo']].forEach(([lado, resultado]) => {
    const suffix = resultado === 'gol' ? 'gol' : 'fallo';
    document.getElementById(`btn-penal-${lado}-${suffix}`).addEventListener('click', () => registrar(lado, resultado));
  });
  document.getElementById('btn-penal-deshacer').addEventListener('click', async () => {
    if (!activo) return;
    // Elimina el tiro más reciente del lado que lleva más lanzamientos.
    const tiros = local.length > visitante.length ? local : visitante;
    const last = tiros.pop();
    if (last && !await guardarTiros()) tiros.push(last);
    render();
    reloj();
  });
  document.getElementById('btn-penal-reiniciar').addEventListener('click', async () => {
    if (!activo || !confirm('¿Reiniciar toda la tanda de penales? Se borrarán todos los tiros registrados.')) return;
    // Conserva una copia para restaurar la tanda si falla el guardado.
    const anteriores = [local, visitante];
    local = [];
    visitante = [];
    if (!await guardarTiros()) [local, visitante] = anteriores;
    else avisar('aviso-admin', 'Tanda de penales reiniciada.');
    render();
    reloj();
  });
  document.getElementById('btn-toggle-penales').addEventListener('click', () => {
    if (activo) document.getElementById('panel-penales').hidden = !document.getElementById('panel-penales').hidden;
  });
  return {
    iniciar, ganador, get activo() { return activo; },
    // Devuelve los goles y todos los tiros para guardar el resultado final.
    resultadoFinal: () => ({
      penales_local: local.filter((shot) => shot === 'gol').length,
      penales_visitante: visitante.filter((shot) => shot === 'gol').length,
      penales_local_tiros: local, penales_visitante_tiros: visitante
    }),
    // Restaura en pantalla los tiros guardados del partido seleccionado.
    cargar(match) {
      activo = match.estado === 'penales';
      local = Array.isArray(match.penales_local_tiros) ? match.penales_local_tiros : [];
      visitante = Array.isArray(match.penales_visitante_tiros) ? match.penales_visitante_tiros : [];
      document.getElementById('panel-penales').hidden = !activo;
      document.getElementById('marcador-penales-badge').hidden = !activo;
      if (activo) {
        document.getElementById('penales-nom-local').textContent =
          equipos().find((team) => team.id === match.equipo_local_id)?.nombre || 'Local';
        document.getElementById('penales-nom-visita').textContent =
          equipos().find((team) => team.id === match.equipo_visitante_id)?.nombre || 'Visitante';
        render();
      }
    }
  };
};

// Inicializa el panel privado y coordina la planilla, el reloj y sus módulos auxiliares.
export async function iniciarAdmin() {
  sincronizarNavegacion();
  if (!esAdmin()) {
    window.location.href = 'inicio-sesion.html';
    return;
  }
  let equipos = [];
  let jugadores = [];
  let partidos = [];
  let sanciones = [];
  let pActivo = null;
  let eventos = [];
  let ticker = null;
  let segsBase = 1 * 60;
  let tInicio = null;
  // Referencias a módulos que se crean después de definir las funciones compartidas.
  let partidosUI;
  let equiposUI;
  const datos = () => ({ equipos, jugadores, partidos, sanciones, partidoActivo: pActivo });
  // Indica si un jugador tiene una sanción activa que afecte su participación.
  const jugadorSuspendido = (jugadorId) =>
    sanciones.some((row) => row.jugador_id === jugadorId && row.estado === 'suspendida');
  // Cambia la sección visible al seleccionar una pestaña del panel.
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('activo'));
      document.querySelectorAll('.tab-sec').forEach((s) => s.hidden = true);
      btn.classList.add('activo');
      document.getElementById(btn.dataset.tab).hidden = false;
    });
  });
  // Recarga los datos compartidos y vuelve a pintar las vistas del panel.
  const cargar = async () => {
    [equipos, jugadores, partidos, sanciones] = await Promise.all([
      leer('equipos'),
      leer('jugadores'),
      leer('partidos', 'fecha_hora'),
      leer('sanciones')
    ]);
    partidosUI?.poblarSelects();
    partidosUI?.renderRegistro();
    equiposUI?.render();
    if (pActivo) {
      const up = partidos.find((p) => p.id === pActivo.id);
      if (up) abrirPlanilla(up.id, false);
    }
  };
  // Calcula el tiempo restante usando la marca de inicio persistida del reloj.
  const segsActuales = () => {
    if ((pActivo?.estado !== 'en_juego' && pActivo?.estado !== 'tiempo_extra') || !tInicio) return segsBase;
    return Math.max(0, segsBase - Math.floor((Date.now() - new Date(tInicio).getTime()) / 1000));
  };
  // Actualiza la pantalla del reloj con el partido, segundos y estado de penales.
  const renderReloj = () => renderizarReloj(pActivo, segsActuales(), penales);
  const penales = crearModuloPenales({
    partido: () => pActivo,
    equipos: () => equipos,
    actualizar,
    reloj: () => renderReloj()
  });
  // Ejecuta el reloj y guarda el cambio de periodo cuando llega a cero.
  const arrancarReloj = () => {
    if (ticker) clearInterval(ticker);
    ticker = setInterval(async () => {
      renderReloj();
      if (segsActuales() === 0) {
        clearInterval(ticker);
        ticker = null;
        // Al acabar la prórroga empatada, el estado cambia a penales; si no, queda en descanso.
        const penalesTrasProrroga = pActivo.periodo === 3 &&
          pActivo.goles_local === pActivo.goles_visitante;
        const nuevoEstado = penalesTrasProrroga ? 'penales' : 'descanso';
        await actualizar('partidos', pActivo.id, {
          estado: nuevoEstado,
          periodo: penalesTrasProrroga ? 4 : pActivo.periodo,
          reloj_segundos: 0,
          reloj_iniciado_en: null,
          ...(penalesTrasProrroga ? { penales_local_tiros: [], penales_visitante_tiros: [] } : {})
        });
        pActivo.estado = nuevoEstado;
        pActivo.periodo = penalesTrasProrroga ? 4 : pActivo.periodo;
        pActivo.reloj_segundos = 0;
        pActivo.reloj_iniciado_en = null;
        segsBase = 0;
        tInicio = null;
        renderReloj();
        if (penalesTrasProrroga) {
          if (await penales.iniciar()) {
            avisar('aviso-admin', 'Tiempo extra finalizado en empate. Comienza la tanda de 5 penales por equipo.');
          }
        } else if (pActivo.periodo === 2 && pActivo.goles_local === pActivo.goles_visitante) {
          avisar('aviso-admin', 'Segundo tiempo finalizado en empate. Puedes iniciar 10 minutos de tiempo extra.');
        }
        partidosUI.renderRegistro();
      }
    }, 1000);
  };
  // Recalcula el marcador a partir de las incidencias registradas en el partido.
  const sincronizarGolesPartido = async (partidoId) => {
    const part = partidos.find((p) => p.id === partidoId);
    if (!part) return;
    // El acta de eventos es la fuente del marcador, no un contador manual independiente.
    const todosEv = await leer('eventos_partido');
    const evsPartido = todosEv.filter((e) => e.partido_id === partidoId);
    const golesLoc = evsPartido.filter((e) => e.tipo === 'gol' && e.equipo_id === part.equipo_local_id).length;
    const golesVis = evsPartido.filter((e) => e.tipo === 'gol' && e.equipo_id === part.equipo_visitante_id).length;
    await actualizar('partidos', partidoId, {
      goles_local: golesLoc,
      goles_visitante: golesVis
    });
    part.goles_local = golesLoc;
    part.goles_visitante = golesVis;

    if (pActivo && pActivo.id === partidoId) {
      pActivo.goles_local = golesLoc;
      pActivo.goles_visitante = golesVis;
      eventos = evsPartido;
      const elGolLoc = document.getElementById('mar-gol-local');
      const elGolVis = document.getElementById('mar-gol-visita');
      if (elGolLoc) elGolLoc.textContent = golesLoc;
      if (elGolVis) elGolVis.textContent = golesVis;
    }

    return { golesLoc, golesVis, evsPartido };
  };
  // Carga un partido seleccionado y representa su marcador, incidencias y reloj.
  const abrirPlanilla = async (id, scroll = true) => {
    if (ticker) clearInterval(ticker);
    pActivo = partidos.find((p) => p.id === id);
    if (!pActivo) return;
    // Recupera únicamente eventos del partido abierto y deriva de ellos ambos goles.
    const todosEv = await leer('eventos_partido');
    eventos = todosEv.filter((e) => e.partido_id === id);
    const golesLoc = eventos.filter((e) => e.tipo === 'gol' && e.equipo_id === pActivo.equipo_local_id).length;
    const golesVis = eventos.filter((e) => e.tipo === 'gol' && e.equipo_id === pActivo.equipo_visitante_id).length;
    if (pActivo.goles_local !== golesLoc || pActivo.goles_visitante !== golesVis) {
      pActivo.goles_local = golesLoc;
      pActivo.goles_visitante = golesVis;
      await actualizar('partidos', pActivo.id, { goles_local: golesLoc, goles_visitante: golesVis });
    }
    segsBase = pActivo.reloj_segundos ?? 60;
    tInicio = pActivo.reloj_iniciado_en;
    // Si el partido seguía corriendo al recargar, descuenta el tiempo que pasó fuera de pantalla.
    if ((pActivo.estado === 'en_juego' || pActivo.estado === 'tiempo_extra') && tInicio) {
      segsBase = Math.max(0, segsBase - Math.floor((Date.now() - new Date(tInicio).getTime()) / 1000));
      tInicio = new Date().toISOString();
    }

    penales.cargar(pActivo);
    document.getElementById('sin-partido').hidden = true;
    document.getElementById('con-partido').hidden = false;
    const eqLoc = equipos.find((e) => e.id === pActivo.equipo_local_id);
    const eqVis = equipos.find((e) => e.id === pActivo.equipo_visitante_id);
    const capLoc = jugadores.find((j) => j.id === pActivo.capitan_local_id);
    const capVis = jugadores.find((j) => j.id === pActivo.capitan_visitante_id);
    const nomLoc = eqLoc?.nombre || 'Local';
    const nomVis = eqVis?.nombre || 'Visitante';

    // Sincroniza nombres, marcador, capitanes y pagos con los datos persistidos.
    document.getElementById('mar-nom-local').textContent = nomLoc;
    document.getElementById('mar-nom-visita').textContent = nomVis;
    const panelNomLoc = document.getElementById('panel-nom-local');
    if (panelNomLoc) panelNomLoc.textContent = nomLoc;
    const panelNomVis = document.getElementById('panel-nom-visita');
    if (panelNomVis) panelNomVis.textContent = nomVis;

    document.getElementById('mar-gol-local').textContent = pActivo.goles_local;
    document.getElementById('mar-gol-visita').textContent = pActivo.goles_visitante;
    document.getElementById('mar-cap-local').textContent = capLoc ? `(C) ${capLoc.nombre}` : 'Sin capitán';
    document.getElementById('mar-cap-visita').textContent = capVis ? `(C) ${capVis.nombre}` : 'Sin capitán';
    document.getElementById('pago-arbitraje-nombre-local').textContent = nomLoc;
    document.getElementById('pago-arbitraje-nombre-visita').textContent = nomVis;
    document.getElementById('chk-arbitraje-local').checked = Boolean(pActivo.arbitraje_local_pagado);
    document.getElementById('chk-arbitraje-visita').checked = Boolean(pActivo.arbitraje_visitante_pagado);
    document.getElementById('meta-partido-texto').textContent =
      `${pActivo.fase} · ${pActivo.categoria} (${pActivo.genero}) · ${fmtFecha(pActivo.fecha_hora)}`;
    const sJugLoc = document.getElementById('s-jugador-local');
    if (sJugLoc) {
      // Solo ofrece jugadores del equipo local y marca los que tienen suspensión activa.
      const jugLoc = jugadores.filter((j) => j.equipo_id === pActivo.equipo_local_id);
      sJugLoc.innerHTML = '<option value="">Gol de Equipo / Sin dorsal asignado</option>' +
        jugLoc.map((j) => {
          const suspendido = jugadorSuspendido(j.id);
          return `<option value="${j.id}" ${suspendido ? 'style="color:red;font-weight:bold"' : ''}>
            ${j.dorsal ? `#${j.dorsal} ` : ''}${esc(j.nombre)} ${suspendido ? '[SUSPENDIDO]' : ''}
          </option>`;
        }).join('');
    }
    const sJugVis = document.getElementById('s-jugador-visita');
    if (sJugVis) {
      // Construye la lista equivalente para el equipo visitante.
      const jugVis = jugadores.filter((j) => j.equipo_id === pActivo.equipo_visitante_id);
      sJugVis.innerHTML = '<option value="">Gol de Equipo / Sin dorsal asignado</option>' +
        jugVis.map((j) => {
          const suspendido = jugadorSuspendido(j.id);
          return `<option value="${j.id}" ${suspendido ? 'style="color:red;font-weight:bold"' : ''}>
            ${j.dorsal ? `#${j.dorsal} ` : ''}${esc(j.nombre)} ${suspendido ? '[SUSPENDIDO]' : ''}
          </option>`;
        }).join('');
    }
    // Resume tarjetas y goles y presenta el historial en orden del más reciente al más antiguo.
    const totalAmarillas = eventos.filter((e) => e.tipo === 'amarilla').length;
    const totalRojas = eventos.filter((e) => e.tipo === 'roja').length;
    const statsCont = document.getElementById('stats-partido-badges');
    if (statsCont) {
      statsCont.innerHTML = `
        <span class="badge-stat-pill">Total Goles: ${pActivo.goles_local + pActivo.goles_visitante}</span>
        <span class="badge-stat-pill" style="background:#fef9e7;color:#7d6608">Amarillas: ${totalAmarillas}</span>
        <span class="badge-stat-pill" style="background:#fdedec;color:#78281f">Rojas: ${totalRojas}</span>
      `;
    }
    const listaEv = document.getElementById('lista-eventos-planilla');
    listaEv.innerHTML = eventos.length ? [...eventos].reverse().map((ev) => {
      const j = jugadores.find((x) => x.id === ev.jugador_id);
      const eq = equipos.find((x) => x.id === ev.equipo_id);
      const icono = ev.tipo === 'gol' ? '[GOL]' : ev.tipo === 'amarilla' ? '[AMARILLA]' : '[ROJA]';
      const esLocal = ev.equipo_id === pActivo.equipo_local_id;
      const etiquetaLado = esLocal ? 'LOCAL' : 'VISITANTE';
      const nombreJugador = j ? (j.dorsal ? `#${j.dorsal} ${j.nombre}` : j.nombre) : 'Gol de Equipo';

      return `
        <li>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap">
            <span style="font-size:1.1rem">${icono}</span>
            <span class="badge-lado ${esLocal ? 'local' : 'visita'}" style="font-size:0.68rem">${etiquetaLado}</span>
            <strong>${esc(nombreJugador)}</strong>
            <span class="muted" style="font-size:0.8rem">(${esc(eq?.nombre || 'Equipo')})</span>
            <small style="color:var(--color-texto-secundario); font-weight:600">
              · ${ev.periodo}°T (${fmtReloj(ev.segundo_partido)})
            </small>
          </div>
          <button class="btn btn-sm btn-red" data-del-ev="${ev.id}" title="Eliminar incidencia y recalcular marcador">
            Eliminar
          </button>
        </li>
      `;
    }).join('') : '<li class="empty">Sin incidencias registradas en este partido.</li>';
    // Permite quitar del historial una incidencia concreta y sincronizar el marcador.
    listaEv.querySelectorAll('[data-del-ev]').forEach((b) => b.addEventListener('click', async () => {
      await eliminarIncidencia(b.dataset.delEv);
    }));
    renderReloj();
    if (pActivo.estado === 'en_juego' || pActivo.estado === 'tiempo_extra') arrancarReloj();
    if (scroll) document.getElementById('con-partido').scrollIntoView({ behavior: 'smooth' });
  };
  // Registra un gol o tarjeta y actualiza los datos dependientes de la planilla.
  const registrarIncidencia = async (equipoId, tipo, jugadorId) => {
    if (!pActivo) return;
    if (tipo !== 'gol' && !jugadorId) {
      alert('Para registrar una tarjeta debes seleccionar a un jugador de la lista.');
      return;
    }
    if (jugadorId && jugadorSuspendido(jugadorId)) {
      const jInfo = jugadores.find((j) => j.id === jugadorId);
      const conf = confirm(`ATENCIÓN: El jugador ${jInfo?.nombre || ''} tiene sanción ACTIVA por tarjetas.\n¿Deseas registrar esta incidencia de todas formas?`);
      if (!conf) return;
    }
    // Guarda el segundo transcurrido del periodo junto al evento para mostrarlo en el acta.
    const duracionPeriodo = pActivo.periodo === 3 ? 60 : 60;
    const segTranscurridos = Math.max(0, duracionPeriodo - segsActuales());
    await guardar('eventos_partido', {
      partido_id: pActivo.id,
      equipo_id: equipoId,
      jugador_id: jugadorId ? jugadorId : null,
      tipo,
      periodo: pActivo.periodo,
      segundo_partido: segTranscurridos
    });
    await sincronizarGolesPartido(pActivo.id);
    sanciones = await leer('sanciones');
    partidos = await leer('partidos', 'fecha_hora');
    await abrirPlanilla(pActivo.id, false);
    partidosUI.renderRegistro();

    const eqNombre = equipos.find((e) => e.id === equipoId)?.nombre || 'Equipo';
    const tipoTexto = tipo === 'gol' ? '¡Gol registrado!' : tipo === 'amarilla' ? 'Tarjeta amarilla registrada' : 'Tarjeta roja registrada';
    avisar('aviso-admin', `${tipoTexto} para ${eqNombre}.`);
  };
  // Elimina una incidencia confirmada y vuelve a cargar marcador y sanciones.
  const eliminarIncidencia = async (eventoId) => {
    if (!confirm('¿Deseas eliminar esta incidencia? Si es un gol, el marcador se actualizará automáticamente.')) return;
    // El borrado también puede afectar el marcador y las sanciones derivadas de la incidencia.
    await borrar('eventos_partido', eventoId);
    await sincronizarGolesPartido(pActivo.id);
    sanciones = await leer('sanciones');
    partidos = await leer('partidos', 'fecha_hora');
    await abrirPlanilla(pActivo.id, false);
    partidosUI.renderRegistro();
    avisar('aviso-admin', 'Incidencia eliminada y marcador actualizado.');
  };
  // Los controladores siguientes registran goles y tarjetas de ambos equipos.
  document.getElementById('btn-inc-gol-local')?.addEventListener('click', () => {
    if (!pActivo) return;
    const jId = document.getElementById('s-jugador-local')?.value || null;
    registrarIncidencia(pActivo.equipo_local_id, 'gol', jId);
  });

  document.getElementById('btn-inc-amarilla-local')?.addEventListener('click', () => {
    if (!pActivo) return;
    const jId = document.getElementById('s-jugador-local')?.value || null;
    registrarIncidencia(pActivo.equipo_local_id, 'amarilla', jId);
  });

  document.getElementById('btn-inc-roja-local')?.addEventListener('click', () => {
    if (!pActivo) return;
    const jId = document.getElementById('s-jugador-local')?.value || null;
    registrarIncidencia(pActivo.equipo_local_id, 'roja', jId);
  });
  document.getElementById('btn-inc-gol-visita')?.addEventListener('click', () => {
    if (!pActivo) return;
    const jId = document.getElementById('s-jugador-visita')?.value || null;
    registrarIncidencia(pActivo.equipo_visitante_id, 'gol', jId);
  });

  document.getElementById('btn-inc-amarilla-visita')?.addEventListener('click', () => {
    if (!pActivo) return;
    const jId = document.getElementById('s-jugador-visita')?.value || null;
    registrarIncidencia(pActivo.equipo_visitante_id, 'amarilla', jId);
  });

  document.getElementById('btn-inc-roja-visita')?.addEventListener('click', () => {
    if (!pActivo) return;
    const jId = document.getElementById('s-jugador-visita')?.value || null;
    registrarIncidencia(pActivo.equipo_visitante_id, 'roja', jId);
  });
  // Estos botones ofrecen ajustes rápidos de marcador, pero crean o quitan eventos reales.
  // Controladores del cronómetro: iniciar, pausar, avanzar y finalizar el partido.
  document.getElementById('btn-reloj-ini')?.addEventListener('click', async () => {
    if (!pActivo) return;
    // Guarda el instante de inicio; el intervalo de pantalla calcula el tiempo transcurrido.
    segsBase = segsActuales();
    tInicio = new Date().toISOString();
    const estadoJuego = pActivo.periodo === 3 ? 'tiempo_extra' : 'en_juego';
    await actualizar('partidos', pActivo.id, {
      estado: estadoJuego, reloj_segundos: segsBase, reloj_iniciado_en: tInicio
    });
    pActivo.estado = estadoJuego;
    pActivo.reloj_segundos = segsBase;
    pActivo.reloj_iniciado_en = tInicio;
    arrancarReloj();
    partidosUI.renderRegistro();
  });
  document.getElementById('btn-reloj-pau')?.addEventListener('click', async () => {
    if (!pActivo) return;
    if (ticker) clearInterval(ticker);
    ticker = null;
    // Al pausar, persiste segundos restantes y elimina la marca de inicio.
    segsBase = segsActuales();
    await actualizar('partidos', pActivo.id, {
      estado: 'descanso', reloj_segundos: segsBase, reloj_iniciado_en: null
    });
    pActivo.estado = 'descanso';
    pActivo.reloj_segundos = segsBase;
    pActivo.reloj_iniciado_en = null;
    renderReloj();
    partidosUI.renderRegistro();
  });
  document.getElementById('btn-reloj-2t')?.addEventListener('click', async () => {
    if (!pActivo) return;
    if (pActivo.periodo !== 1 || pActivo.estado !== 'descanso' || segsActuales() !== 0) {
      avisar('aviso-admin', 'El segundo tiempo comienza cuando termina el primero.', true);
      return;
    }
    if (ticker) clearInterval(ticker);
    // El segundo tiempo empieza con el reloj reglamentario reiniciado.
    segsBase = 60;
    tInicio = new Date().toISOString();
    await actualizar('partidos', pActivo.id, {
      estado: 'en_juego', periodo: 2, reloj_segundos: 60, reloj_iniciado_en: tInicio
    });
    pActivo.estado = 'en_juego';
    pActivo.periodo = 2;
    pActivo.reloj_segundos = 60;
    pActivo.reloj_iniciado_en = tInicio;
    arrancarReloj();
    partidosUI.renderRegistro();
  });
  document.getElementById('btn-reloj-fin')?.addEventListener('click', async () => {
    if (!pActivo) return;
    if (pActivo.periodo < 2 || pActivo.estado === 'en_juego' ||
        pActivo.estado === 'tiempo_extra' || segsActuales() > 0) {
      avisar('aviso-admin', 'Finaliza el tiempo reglamentario antes de cerrar el partido.', true);
      return;
    }
    if (pActivo.estado === 'penales' && !penales.ganador()) {
      avisar('aviso-admin', 'Completa la tanda de penales antes de finalizar el partido.', true);
      return;
    }
    if (!confirm('¿Deseas finalizar oficialmente el partido? Se cerrará el cronómetro y el marcador quedará definitivo.')) return;
    if (ticker) clearInterval(ticker);
    ticker = null;
    segsBase = segsActuales();
    const datosFinales = {
      estado: 'finalizado', reloj_segundos: segsBase, reloj_iniciado_en: null
    };
    // Adjunta el resultado de penales si la tanda estaba activa.
    if (penales.activo) Object.assign(datosFinales, penales.resultadoFinal());

    await actualizar('partidos', pActivo.id, datosFinales);
    pActivo.estado = 'finalizado';
    partidos = await leer('partidos', 'fecha_hora');
    partidosUI.renderRegistro();
    renderReloj();
    avisar('aviso-admin', 'Partido finalizado oficialmente.');
  });
  // Inicia la prórroga solo si el segundo tiempo terminó empatado.
  document.getElementById('btn-reloj-extra')?.addEventListener('click', async () => {
    if (!pActivo) return;
    if (pActivo.periodo !== 2 || pActivo.estado !== 'descanso' || segsActuales() !== 0) {
      avisar('aviso-admin', 'El tiempo extra solo puede comenzar al terminar el segundo tiempo.', true);
      return;
    }
    if (pActivo.goles_local !== pActivo.goles_visitante) {
      avisar('aviso-admin', 'El tiempo extra solo se juega si el partido queda empatado.', true);
      return;
    }
    if (!confirm('¿Iniciar Tiempo Extra de 10 minutos por empate?')) return;

    if (ticker) clearInterval(ticker);
    // Inicia el periodo 3 con 600 segundos y guarda todo para poder restaurarlo.
    segsBase = 600;
    tInicio = new Date().toISOString();
    await actualizar('partidos', pActivo.id, {
      estado: 'tiempo_extra', periodo: 3, reloj_segundos: 600, reloj_iniciado_en: tInicio
    });
    pActivo.estado = 'tiempo_extra';
    pActivo.periodo = 3;
    pActivo.reloj_segundos = 600;
    pActivo.reloj_iniciado_en = tInicio;
    arrancarReloj();
    partidosUI.renderRegistro();
    avisar('aviso-admin', 'Tiempo Extra iniciado: 10 minutos de juego.');
  });
  // Atajo para regresar desde la planilla a la lista de partidos.
  document.getElementById('btn-ir-registro')?.addEventListener('click', () => {
    document.querySelector('[data-tab="sec-registro"]')?.click();
  });
  [['local', 'chk-arbitraje-local', 'arbitraje_local_pagado'],
    ['visitante', 'chk-arbitraje-visita', 'arbitraje_visitante_pagado']].forEach(([lado, id, campo]) => {
    // Guarda por separado el pago de arbitraje de cada equipo.
    const checkbox = document.getElementById(id);
    checkbox?.addEventListener('change', async () => {
      if (!pActivo) return;
      const paid = checkbox.checked;
      checkbox.disabled = true;
      try {
        // El nombre del campo varía por equipo, así un listener atiende ambas casillas.
        await actualizar('partidos', pActivo.id, { [campo]: paid });
        pActivo[campo] = paid;
        partidosUI.renderRegistro();
        avisar('aviso-admin', `Arbitraje ${lado}: ${paid ? 'pagado' : 'pendiente'}.`);
      } catch (error) {
        checkbox.checked = Boolean(pActivo[campo]);
        avisar('aviso-admin', `No se pudo actualizar el pago del arbitraje: ${error.message}`, true);
      } finally {
        checkbox.disabled = false;
      }
    });
  });
  // Cierra la planilla seleccionada y detiene la actualización del cronómetro.
  const cerrarPlanilla = () => {
    pActivo = null;
    clearInterval(ticker);
    ticker = null;
    document.getElementById('con-partido').hidden = true;
    document.getElementById('sin-partido').hidden = false;
  };
  partidosUI = crearModuloPartidos({
    datos, cargar, abrirPlanilla: (...args) => abrirPlanilla(...args), cerrarPlanilla, jugadorSuspendido
  });
  equiposUI = crearModuloEquipos({ datos, cargar, cerrarPlanilla });
  partidosUI.vincularEventos();
  equiposUI.vincularEventos();
  await cargar();
}
