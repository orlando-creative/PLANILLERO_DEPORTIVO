import {
  leer, guardar, actualizar, borrar, reiniciarCampeonato,
  esAdmin
} from './supabase.js';
import {
  esc, fmtFecha, fmtReloj, avisar, montarNavegacion
} from './app.js';
import {
  crearModuloGestion, crearModuloPenales, renderizarReloj
} from './app-modulos.js';

// Inicializa el panel privado y coordina la planilla, el reloj y sus módulos auxiliares.
export async function iniciarAdmin() {
  montarNavegacion();
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
    gestion.poblarSelects();
    gestion.renderRegistro();
    gestion.renderEquipos();
    if (pActivo) {
      const up = partidos.find((p) => p.id === pActivo.id);
      if (up) abrirPlanilla(up.id, false);
    }
  };
  const gestion = crearModuloGestion({
    datos: () => ({ equipos, jugadores, partidos, sanciones, partidoActivo: pActivo }),
    cargar,
    abrirPlanilla: (...args) => abrirPlanilla(...args),
    cerrarPlanilla: () => {
      pActivo = null;
      clearInterval(ticker);
      ticker = null;
      document.getElementById('con-partido').hidden = true;
      document.getElementById('sin-partido').hidden = false;
    }
  });
  const penales = crearModuloPenales({
    partido: () => pActivo,
    equipos: () => equipos,
    actualizar,
    avisar,
    reloj: () => renderReloj()
  });
  // Calcula el tiempo restante usando la marca de inicio persistida del reloj.
  const segsActuales = () => {
    if ((pActivo?.estado !== 'en_juego' && pActivo?.estado !== 'tiempo_extra') || !tInicio) return segsBase;
    return Math.max(0, segsBase - Math.floor((Date.now() - new Date(tInicio).getTime()) / 1000));
  };
  // Delega en el módulo de interfaz la representación del reloj y sus controles.
  const renderReloj = () => renderizarReloj(pActivo, segsActuales(), penales);
  // Ejecuta el reloj y guarda el cambio de periodo cuando llega a cero.
  const arrancarReloj = () => {
    if (ticker) clearInterval(ticker);
    ticker = setInterval(async () => {
      renderReloj();
      if (segsActuales() === 0) {
        clearInterval(ticker);
        ticker = null;
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
        gestion.renderRegistro();
      }
    }, 1000);
  };
  // Recalcula el marcador a partir de las incidencias registradas en el partido.
  const sincronizarGolesPartido = async (partidoId) => {
    const part = partidos.find((p) => p.id === partidoId);
    if (!part) return;
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
      const jugLoc = jugadores.filter((j) => j.equipo_id === pActivo.equipo_local_id);
      sJugLoc.innerHTML = '<option value="">Gol de Equipo / Sin dorsal asignado</option>' +
        jugLoc.map((j) => {
          const suspendido = gestion.jugadorSuspendido(j.id);
          return `<option value="${j.id}" ${suspendido ? 'style="color:red;font-weight:bold"' : ''}>
            ${j.dorsal ? `#${j.dorsal} ` : ''}${esc(j.nombre)} ${suspendido ? '[SUSPENDIDO]' : ''}
          </option>`;
        }).join('');
    }
    const sJugVis = document.getElementById('s-jugador-visita');
    if (sJugVis) {
      const jugVis = jugadores.filter((j) => j.equipo_id === pActivo.equipo_visitante_id);
      sJugVis.innerHTML = '<option value="">Gol de Equipo / Sin dorsal asignado</option>' +
        jugVis.map((j) => {
          const suspendido = gestion.jugadorSuspendido(j.id);
          return `<option value="${j.id}" ${suspendido ? 'style="color:red;font-weight:bold"' : ''}>
            ${j.dorsal ? `#${j.dorsal} ` : ''}${esc(j.nombre)} ${suspendido ? '[SUSPENDIDO]' : ''}
          </option>`;
        }).join('');
    }
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
    if (jugadorId && gestion.jugadorSuspendido(jugadorId)) {
      const jInfo = jugadores.find((j) => j.id === jugadorId);
      const conf = confirm(`ATENCIÓN: El jugador ${jInfo?.nombre || ''} tiene sanción ACTIVA por tarjetas.\n¿Deseas registrar esta incidencia de todas formas?`);
      if (!conf) return;
    }
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
    gestion.renderRegistro();

    const eqNombre = equipos.find((e) => e.id === equipoId)?.nombre || 'Equipo';
    const tipoTexto = tipo === 'gol' ? '¡Gol registrado!' : tipo === 'amarilla' ? 'Tarjeta amarilla registrada' : 'Tarjeta roja registrada';
    avisar('aviso-admin', `${tipoTexto} para ${eqNombre}.`);
  };
  // Elimina una incidencia confirmada y vuelve a cargar marcador y sanciones.
  const eliminarIncidencia = async (eventoId) => {
    if (!confirm('¿Deseas eliminar esta incidencia? Si es un gol, el marcador se actualizará automáticamente.')) return;
    await borrar('eventos_partido', eventoId);
    await sincronizarGolesPartido(pActivo.id);
    sanciones = await leer('sanciones');
    partidos = await leer('partidos', 'fecha_hora');
    await abrirPlanilla(pActivo.id, false);
    gestion.renderRegistro();
    avisar('aviso-admin', 'Incidencia eliminada y marcador actualizado.');
  };
  // Deshace el gol más reciente del equipo mediante el flujo normal de eliminación.
  const restarUltimoGolEquipo = async (equipoId) => {
    if (!pActivo) return;
    const golesEquipo = eventos.filter((e) => e.tipo === 'gol' && e.equipo_id === equipoId);
    if (!golesEquipo.length) {
      alert('Este equipo no tiene goles registrados para restar.');
      return;
    }
    const ultimoGol = golesEquipo[golesEquipo.length - 1];
    await eliminarIncidencia(ultimoGol.id);
  };
  // Los siguientes controladores enlazan los botones de incidencias y goles manuales.
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
  document.getElementById('btn-gol-local-mas')?.addEventListener('click', () => {
    if (!pActivo) return;
    const jId = document.getElementById('s-jugador-local')?.value || null;
    registrarIncidencia(pActivo.equipo_local_id, 'gol', jId);
  });

  document.getElementById('btn-gol-local-menos')?.addEventListener('click', () => {
    if (!pActivo) return;
    restarUltimoGolEquipo(pActivo.equipo_local_id);
  });

  document.getElementById('btn-gol-visita-mas')?.addEventListener('click', () => {
    if (!pActivo) return;
    const jId = document.getElementById('s-jugador-visita')?.value || null;
    registrarIncidencia(pActivo.equipo_visitante_id, 'gol', jId);
  });

  document.getElementById('btn-gol-visita-menos')?.addEventListener('click', () => {
    if (!pActivo) return;
    restarUltimoGolEquipo(pActivo.equipo_visitante_id);
  });
  // Controladores del cronómetro: iniciar, pausar, avanzar y cerrar periodos.
  document.getElementById('btn-reloj-ini')?.addEventListener('click', async () => {
    if (!pActivo) return;
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
    gestion.renderRegistro();
  });
  document.getElementById('btn-reloj-pau')?.addEventListener('click', async () => {
    if (!pActivo) return;
    if (ticker) clearInterval(ticker);
    ticker = null;
    segsBase = segsActuales();
    await actualizar('partidos', pActivo.id, {
      estado: 'descanso', reloj_segundos: segsBase, reloj_iniciado_en: null
    });
    pActivo.estado = 'descanso';
    pActivo.reloj_segundos = segsBase;
    pActivo.reloj_iniciado_en = null;
    renderReloj();
    gestion.renderRegistro();
  });
  document.getElementById('btn-reloj-2t')?.addEventListener('click', async () => {
    if (!pActivo) return;
    if (pActivo.periodo !== 1 || pActivo.estado !== 'descanso' || segsActuales() !== 0) {
      avisar('aviso-admin', 'El segundo tiempo comienza cuando termina el primero.', true);
      return;
    }
    if (ticker) clearInterval(ticker);
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
    gestion.renderRegistro();
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
    if (penales.activo) Object.assign(datosFinales, penales.resultadoFinal());

    await actualizar('partidos', pActivo.id, datosFinales);
    pActivo.estado = 'finalizado';
    partidos = await leer('partidos', 'fecha_hora');
    gestion.renderRegistro();
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
    gestion.renderRegistro();
    avisar('aviso-admin', 'Tiempo Extra iniciado: 10 minutos de juego.');
  });
  // Atajo para regresar desde la planilla a la lista de partidos.
  document.getElementById('btn-ir-registro')?.addEventListener('click', () => {
    document.querySelector('[data-tab="sec-registro"]')?.click();
  });
  [['local', 'chk-arbitraje-local', 'arbitraje_local_pagado'],
    ['visitante', 'chk-arbitraje-visita', 'arbitraje_visitante_pagado']].forEach(([lado, id, campo]) => {
    const checkbox = document.getElementById(id);
    checkbox?.addEventListener('change', async () => {
      if (!pActivo) return;
      const paid = checkbox.checked;
      checkbox.disabled = true;
      try {
        await actualizar('partidos', pActivo.id, { [campo]: paid });
        pActivo[campo] = paid;
        gestion.renderRegistro();
        avisar('aviso-admin', `Arbitraje ${lado}: ${paid ? 'pagado' : 'pendiente'}.`);
      } catch (error) {
        checkbox.checked = Boolean(pActivo[campo]);
        avisar('aviso-admin', `No se pudo actualizar el pago del arbitraje: ${error.message}`, true);
      } finally {
        checkbox.disabled = false;
      }
    });
  });
  // Reinicia los partidos solo después de pedir confirmación explícita al administrador.
  document.getElementById('btn-reiniciar-campeonato')?.addEventListener('click', async () => {
    const confirmacion = confirm(
      'ATENCION: ¿Deseas REINICIAR EL CAMPEONATO?\n\n' +
      '- Se eliminarán TODOS los partidos disputados.\n' +
      '- Se reiniciará la tabla de posiciones y goleadores a cero.\n' +
      '- Se eliminarán los goles y sanciones registradas.\n' +
      '- Se mantendrán tus equipos y jugadores inscritos para el nuevo torneo.\n\n' +
      '¿Deseas continuar?'
    );
    if (!confirmacion) return;

    try {
      await reiniciarCampeonato();
      pActivo = null;
      if (ticker) clearInterval(ticker);
      document.getElementById('con-partido').hidden = true;
      document.getElementById('sin-partido').hidden = false;
      await cargar();
      alert('Campeonato reiniciado con éxito. Listo para el nuevo torneo.');
    } catch (err) {
      alert(`Error al reiniciar: ${err.message}`);
    }
  });

  gestion.vincularEventos();
  await cargar();
}
