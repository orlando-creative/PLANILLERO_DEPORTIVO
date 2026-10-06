import { guardar, actualizar, borrar, guardarFinanzas } from './supabase.js';
import { esc, fmtFecha, fmtReloj, avisar } from './app.js';

// Representa el tiempo del partido y habilita los controles válidos para su estado.
export function renderizarReloj(partido, segundos, penales) {
  const relojEl = document.getElementById('reloj-num');
  if (!relojEl || !partido) return;
  relojEl.textContent = fmtReloj(segundos);
  let txtPeriodo = '';
  if (partido.periodo === 3) txtPeriodo = 'TIEMPO EXTRA';
  else if (partido.periodo === 4) txtPeriodo = 'PENALES';
  else txtPeriodo = `${partido.periodo}° TIEMPO`;
  txtPeriodo += ` (${partido.estado.replace(/_/g, ' ').toUpperCase()})`;
  document.getElementById('reloj-periodo').textContent = txtPeriodo;

  const fin = partido.estado === 'finalizado';
  const enJuego = partido.estado === 'en_juego' || partido.estado === 'tiempo_extra';
  const empate = partido.goles_local === partido.goles_visitante;
  const puedeIrATiempoExtra = partido.periodo === 2 && partido.estado === 'descanso' &&
    segundos === 0 && empate;
  const penalSinResolver = partido.estado === 'penales' && !penales.ganador();
  const tiempoReglamentarioTerminado = partido.periodo >= 2 && !enJuego && segundos === 0;
  document.getElementById('btn-reloj-ini').disabled = fin || partido.estado === 'penales' || segundos === 0;
  document.getElementById('btn-reloj-pau').disabled = fin || !enJuego;
  document.getElementById('btn-reloj-2t').disabled = fin || partido.periodo !== 1 ||
    partido.estado !== 'descanso' || segundos > 0;
  document.getElementById('btn-reloj-extra').disabled = fin || !puedeIrATiempoExtra;
  document.getElementById('btn-toggle-penales').disabled = fin || partido.estado !== 'penales';
  document.getElementById('btn-reloj-fin').disabled = fin || !tiempoReglamentarioTerminado || penalSinResolver;
}

// Finanzas, partidos y plantillas del panel.
// Crea el resumen financiero y los controles de cobros y costos del torneo.
export function crearModuloFinanzas({ datos, cargar, actualizarFinanzas }) {
  // Calcula totales y renderiza tarifas, pagos, arbitrajes y balance.
  const render = () => {
    const { equipos, partidos, sanciones, finanzasCfg } = datos();
    // Suma un campo numérico solo para las filas que cumplen la condición.
    const total = (rows, predicate, key) => rows.filter(predicate)
      .reduce((sum, row) => sum + Number(row[key] || 0), 0);
    const inscripciones = total(equipos, (row) => row.inscripcion_pagada, 'monto_inscripcion');
    const pendientesInsc = total(equipos, (row) => !row.inscripcion_pagada, 'monto_inscripcion');
    const multas = total(sanciones, (row) => row.pagada, 'monto');
    const pendientesMultas = total(sanciones, (row) => !row.pagada, 'monto');
    const arbitraje = total(partidos, (row) => row.arbitraje_pagado, 'costo_arbitraje');
    const pendientesArb = total(partidos, (row) => !row.arbitraje_pagado, 'costo_arbitraje');
    const kpis = {
      'kpi-ingresos-inscripciones': `Bs. ${inscripciones.toFixed(2)}`,
      'kpi-inscripciones-pendientes': `(Pendiente: Bs. ${pendientesInsc.toFixed(2)})`,
      'kpi-ingresos-multas': `Bs. ${multas.toFixed(2)}`,
      'kpi-multas-pendientes': `(Pendiente: Bs. ${pendientesMultas.toFixed(2)})`,
      'kpi-egresos-arbitraje': `Bs. ${arbitraje.toFixed(2)}`,
      'kpi-arbitraje-pendiente': `(Por pagar: Bs. ${pendientesArb.toFixed(2)})`
    };
    Object.entries(kpis).forEach(([id, value]) => {
      document.getElementById(id).textContent = value;
    });
    const balance = document.getElementById('kpi-balance-general');
    const neto = inscripciones + multas - arbitraje;
    balance.textContent = `Bs. ${neto.toFixed(2)}`;
    balance.style.color = neto >= 0 ? 'var(--color-verde)' : 'var(--color-rojo)';

    Object.entries({
      'cfg-tarifa-amarilla': finanzasCfg.multa_amarilla ?? 10,
      'cfg-tarifa-roja': finanzasCfg.multa_roja ?? 20,
      'cfg-tarifa-inscripcion': finanzasCfg.monto_inscripcion ?? 50,
      'cfg-tarifa-arbitraje': finanzasCfg.costo_arbitraje ?? 30
    }).forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (input) input.value = value;
    });

    const tablaEquipos = document.getElementById('tbody-finanzas-equipos');
    if (tablaEquipos) {
      tablaEquipos.innerHTML = equipos.length ? equipos.map((team) => `
        <tr><td><strong>${esc(team.nombre)}</strong></td><td>${esc(team.categoria)} (${esc(team.genero)})</td>
        <td>Bs. <input type="number" step="1" min="0" value="${Number(team.monto_inscripcion || 0)}" data-monto-eq="${team.id}" style="width:70px;padding:3px"></td>
        <td><strong>${team.inscripcion_pagada ? 'Pagada' : 'Pendiente'}</strong></td><td>
        <button class="btn btn-sm ${team.inscripcion_pagada ? 'btn-out' : ''}" data-pago-eq="${team.id}" data-val="${!team.inscripcion_pagada}">${team.inscripcion_pagada ? 'Marcar Pendiente' : 'Marcar Pagada'}</button>
        <button class="btn btn-sm btn-out" data-guardar-monto-eq="${team.id}">Guardar Monto</button></td></tr>
      `).join('') : '<tr><td colspan="5" class="empty">No hay equipos registrados.</td></tr>';
      // Actualiza si la inscripción del equipo está cancelada y recarga el resumen.
      tablaEquipos.querySelectorAll('[data-pago-eq]').forEach((button) => button.addEventListener('click', async () => {
        await actualizar('equipos', button.dataset.pagoEq, { inscripcion_pagada: button.dataset.val === 'true' });
        await cargar();
      }));
      // Guarda el monto de inscripción específico del equipo.
      tablaEquipos.querySelectorAll('[data-guardar-monto-eq]').forEach((button) => button.addEventListener('click', async () => {
        const input = tablaEquipos.querySelector(`[data-monto-eq="${button.dataset.guardarMontoEq}"]`);
        await actualizar('equipos', button.dataset.guardarMontoEq, { monto_inscripcion: Number(input.value || 0) });
        await cargar();
        avisar('aviso-admin', 'Monto de inscripción actualizado.');
      }));
    }

    const tablaPartidos = document.getElementById('tbody-finanzas-partidos');
    if (!tablaPartidos) return;
    const names = Object.fromEntries(equipos.map((team) => [team.id, team.nombre]));
    tablaPartidos.innerHTML = partidos.length ? partidos.map((match) => {
      const multasPartido = sanciones.filter((row) => row.partido_id === match.id);
      const totalMultas = multasPartido.reduce((sum, row) => sum + Number(row.monto || 0), 0);
      const cobradas = multasPartido.filter((row) => row.pagada)
        .reduce((sum, row) => sum + Number(row.monto || 0), 0);
      return `<tr><td>${fmtFecha(match.fecha_hora)}</td>
        <td><strong>${esc(names[match.equipo_local_id])} vs ${esc(names[match.equipo_visitante_id])}</strong></td>
        <td>Bs. <input type="number" step="1" min="0" value="${Number(match.costo_arbitraje || 0)}" data-arb-partido="${match.id}" style="width:65px;padding:3px">
        <button class="btn btn-sm btn-out" data-guardar-arb="${match.id}">Fijar</button></td>
        <td><button class="btn btn-sm ${match.arbitraje_pagado ? '' : 'btn-red'}" data-toggle-arb="${match.id}" data-val="${!match.arbitraje_pagado}">${match.arbitraje_pagado ? 'Pagado a Arbitro' : 'Pendiente Pago'}</button></td>
        <td>Bs. ${cobradas.toFixed(2)} / ${totalMultas.toFixed(2)}</td>
        <td><span class="tag tag-${match.estado === 'finalizado' ? 'fin' : 'prog'}">${esc(match.estado)}</span></td></tr>`;
    }).join('') : '<tr><td colspan="6" class="empty">No hay partidos registrados para rendición.</td></tr>';
    // Cambia el estado de pago del arbitraje del partido correspondiente.
    tablaPartidos.querySelectorAll('[data-toggle-arb]').forEach((button) => button.addEventListener('click', async () => {
      await actualizar('partidos', button.dataset.toggleArb, { arbitraje_pagado: button.dataset.val === 'true' });
      await cargar();
    }));
    // Guarda el costo de arbitraje fijado para un partido.
    tablaPartidos.querySelectorAll('[data-guardar-arb]').forEach((button) => button.addEventListener('click', async () => {
      const input = tablaPartidos.querySelector(`[data-arb-partido="${button.dataset.guardarArb}"]`);
      await actualizar('partidos', button.dataset.guardarArb, { costo_arbitraje: Number(input.value || 0) });
      await cargar();
      avisar('aviso-admin', 'Costo de arbitraje actualizado.');
    }));
  };

  // Persiste la configuración de multas, inscripción y arbitraje del campeonato.
  document.getElementById('form-tarifas-base')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = {
      multa_amarilla: Number(document.getElementById('cfg-tarifa-amarilla').value),
      multa_roja: Number(document.getElementById('cfg-tarifa-roja').value),
      monto_inscripcion: Number(document.getElementById('cfg-tarifa-inscripcion').value),
      costo_arbitraje: Number(document.getElementById('cfg-tarifa-arbitraje').value),
      actualizado_en: new Date().toISOString()
    };
    try {
      await guardarFinanzas(values);
      actualizarFinanzas(values);
      avisar('aviso-admin', 'Tarifas del campeonato actualizadas con éxito.');
    } catch (error) {
      alert(`Error al guardar tarifas: ${error.message}`);
    }
  });
  return { render };
}

// Crea los formularios y el registro administrativo de equipos, plantillas y partidos.
export function crearModuloGestion({ datos, cargar, abrirPlanilla, cerrarPlanilla }) {
  // Indica si existe una sanción activa que impide al jugador participar.
  const jugadorSuspendido = (jugadorId) =>
    datos().sanciones.some((row) => row.jugador_id === jugadorId && row.estado === 'suspendida');

  // Muestra el plantel del equipo elegido y permite designar un capitán habilitado.
  const renderPlantel = (lado) => {
    const { jugadores, sanciones } = datos();
    const equipo = document.getElementById(lado === 'local' ? 's-partido-local' : 's-partido-visita')?.value;
    const lista = document.getElementById(`plantel-${lado}`);
    const capitan = document.getElementById(lado === 'local' ? 's-cap-local' : 's-cap-visita');
    if (!lista) return;
    if (!equipo) {
      lista.innerHTML = '<p class="muted" style="font-size:.85rem;padding:8px">Selecciona un equipo para ver su plantel</p>';
      if (capitan) capitan.innerHTML = '<option value="">Sin designar</option>';
      return;
    }
    const plantilla = jugadores.filter((row) => row.equipo_id === equipo);
    if (!plantilla.length) {
      lista.innerHTML = '<p class="muted" style="font-size:.85rem;padding:8px">Este equipo no tiene jugadores registrados</p>';
      if (capitan) capitan.innerHTML = '<option value="">Sin designar</option>';
      return;
    }
    lista.innerHTML = `<div class="plantel-lista">${plantilla.map((player) => {
      const suspendido = jugadorSuspendido(player.id);
      const amarillas = sanciones.filter((row) => row.jugador_id === player.id && row.tarjeta === 'amarilla').length;
      const rojas = sanciones.filter((row) => row.jugador_id === player.id && row.tarjeta === 'roja').length;
      return `<div class="plantel-jugador ${suspendido ? 'plantel-suspendido' : ''}">
        <div class="plantel-info"><strong>${player.dorsal ? `#${player.dorsal} ` : ''}${esc(player.nombre)}</strong>
        ${suspendido ? '<span class="tag-suspension">SUSPENDIDO</span>' : ''}</div>
        <div class="plantel-tarjetas">${amarillas ? `<span class="badge-mini-tarj amarilla">${amarillas}</span>` : ''}
        ${rojas ? `<span class="badge-mini-tarj roja">${rojas}</span>` : ''}</div></div>`;
    }).join('')}</div>`;
    if (capitan) capitan.innerHTML = '<option value="">Sin designar</option>' + plantilla.map((player) => {
      const suspended = jugadorSuspendido(player.id);
      return `<option value="${player.id}" ${suspended ? 'disabled style="color:#999"' : ''}>${esc(player.nombre)} ${player.dorsal ? `(#${player.dorsal})` : ''} ${suspended ? '[SUSPENDIDO]' : ''}</option>`;
    }).join('');
  };

  // Llena los selectores de equipos y conserva su selección actual cuando es posible.
  const poblarSelects = () => {
    const { equipos } = datos();
    const jugador = document.getElementById('s-equipo-jugador');
    if (jugador) jugador.innerHTML = equipos.map((team) =>
      `<option value="${team.id}">${esc(team.nombre)} · ${esc(team.categoria)} (${esc(team.genero)})</option>`
    ).join('');
    const local = document.getElementById('s-partido-local');
    const visita = document.getElementById('s-partido-visita');
    if (local && visita) {
      const options = '<option value="">Seleccionar equipo</option>' + equipos.map((team) =>
        `<option value="${team.id}">${esc(team.nombre)} · ${esc(team.categoria)} (${esc(team.genero)})</option>`
      ).join('');
      const localValue = local.value;
      const visitaValue = visita.value;
      local.innerHTML = options;
      visita.innerHTML = options;
      local.value = localValue;
      visita.value = visitaValue;
    }
    renderPlantel('local');
    renderPlantel('visita');
  };

  // Dibuja los partidos administrativos y conecta sus acciones de gestión.
  const renderRegistro = () => {
    const container = document.getElementById('lista-partidos-admin');
    if (!container) return;
    const { equipos, partidos } = datos();
    const names = Object.fromEntries(equipos.map((team) => [team.id, team.nombre]));
    container.innerHTML = partidos.length ? partidos.map((match) => {
      const running = ['en_juego', 'tiempo_extra', 'penales'].includes(match.estado);
      const stateClass = running ? 'juego' : match.estado === 'finalizado' ? 'fin' : match.estado === 'postergado' ? 'desc' : 'prog';
      const stateText = ({ en_juego: 'En Juego', tiempo_extra: 'Tiempo Extra', penales: 'Penales', postergado: 'Postergado' })[match.estado] || match.estado;
      const penalties = match.penales_local != null && match.penales_visitante != null
        ? ` · Penales: ${match.penales_local} - ${match.penales_visitante}` : '';
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid var(--color-borde);flex-wrap:wrap;gap:8px">
        <div><strong>${esc(names[match.equipo_local_id])} ${match.goles_local} - ${match.goles_visitante} ${esc(names[match.equipo_visitante_id])}</strong>${penalties}
        <small style="display:block;color:var(--color-texto-secundario)">${esc(match.fase)} · ${esc(match.categoria)} (${esc(match.genero)}) · ${fmtFecha(match.fecha_hora)} · Arbitraje: Bs. ${Number(match.costo_arbitraje || 0).toFixed(2)} (${match.arbitraje_pagado ? 'Pagado' : 'Pendiente'})</small></div>
        <div style="display:flex;gap:6px;align-items:center"><span class="tag tag-${stateClass}">${esc(stateText)}</span>
        <button class="btn btn-sm" data-abrir-reg="${match.id}">Abrir Planilla</button>
        <button class="btn btn-sm btn-out" data-editar-reg="${match.id}">Editar</button>
        <button class="btn btn-sm btn-out" data-postergar-reg="${match.id}" ${running || match.estado === 'finalizado' ? 'disabled' : ''}>Postergar</button>
        <button class="btn btn-sm btn-red" data-borrar-reg="${match.id}">Eliminar</button></div></div>`;
    }).join('') : '<p class="empty">No hay partidos en el campeonato.</p>';

    // Abre la planilla seleccionada y muestra su pestaña.
    container.querySelectorAll('[data-abrir-reg]').forEach((button) => button.addEventListener('click', () => {
      abrirPlanilla(button.dataset.abrirReg);
      document.querySelector('[data-tab="sec-planilla"]').click();
    }));
    // Edita fase, fecha y costo después de validar los valores ingresados.
    container.querySelectorAll('[data-editar-reg]').forEach((button) => button.addEventListener('click', async () => {
      const match = datos().partidos.find((row) => row.id === button.dataset.editarReg);
      if (!match) return;
      const phase = prompt('Fase del partido:', match.fase);
      if (phase === null) return;
      const dateText = prompt('Fecha y hora (YYYY-MM-DDTHH:MM):', new Date(match.fecha_hora).toISOString().slice(0, 16));
      if (dateText === null) return;
      const costText = prompt('Costo de arbitraje (Bs.):', match.costo_arbitraje || 30);
      if (costText === null) return;
      const date = new Date(dateText);
      const cost = Number(costText);
      if (!Number.isFinite(date.getTime()) || !Number.isFinite(cost) || cost < 0) {
        avisar('aviso-admin', 'Ingresa una fecha y un costo de arbitraje válidos.', true);
        return;
      }
      await actualizar('partidos', match.id, {
        fase: phase.trim() || match.fase, fecha_hora: date.toISOString(), costo_arbitraje: cost
      });
      await cargar();
      avisar('aviso-admin', 'Partido editado correctamente.');
    }));
    // Marca como postergado un partido que todavía no está en juego ni finalizado.
    container.querySelectorAll('[data-postergar-reg]').forEach((button) => button.addEventListener('click', async () => {
      if (!confirm('¿Deseas postergar este partido?')) return;
      await actualizar('partidos', button.dataset.postergarReg, { estado: 'postergado' });
      await cargar();
      avisar('aviso-admin', 'Partido marcado como postergado.');
    }));
    // Elimina el partido y sus dependencias tras confirmación del administrador.
    container.querySelectorAll('[data-borrar-reg]').forEach((button) => button.addEventListener('click', async () => {
      if (!confirm('¿Deseas eliminar este partido y sus incidencias?')) return;
      await borrar('partidos', button.dataset.borrarReg);
      if (datos().partidoActivo?.id === button.dataset.borrarReg) cerrarPlanilla();
      await cargar();
    }));
  };

  // Conecta formularios y selectores con las operaciones de gestión.
  const vincularEventos = () => {
    document.getElementById('s-partido-local')?.addEventListener('change', () => renderPlantel('local'));
    document.getElementById('s-partido-visita')?.addEventListener('change', () => renderPlantel('visita'));
    // Valida y registra un encuentro nuevo con sus equipos, capitanes y reloj inicial.
    document.getElementById('form-partido').addEventListener('submit', async (event) => {
      event.preventDefault();
      const { equipos, finanzasCfg } = datos();
      const localId = document.getElementById('s-partido-local').value;
      const visitanteId = document.getElementById('s-partido-visita').value;
      if (!localId || !visitanteId || localId === visitanteId) {
        alert('Selecciona dos equipos distintos.');
        return;
      }
      const local = equipos.find((team) => team.id === localId);
      const result = await guardar('partidos', {
        fase: document.getElementById('partido-fase').value.trim(),
        fecha_hora: new Date(document.getElementById('partido-fecha').value).toISOString(),
        categoria: local.categoria, genero: local.genero,
        equipo_local_id: localId, equipo_visitante_id: visitanteId,
        capitan_local_id: document.getElementById('s-cap-local').value || null,
        capitan_visitante_id: document.getElementById('s-cap-visita').value || null,
        costo_arbitraje: Number(document.getElementById('partido-arbitraje')?.value || finanzasCfg.costo_arbitraje || 30),
        arbitraje_pagado: false, reloj_segundos: 900, periodo: 1, estado: 'programado'
      });
      document.getElementById('form-partido').reset();
      document.getElementById('plantel-local').innerHTML = '';
      document.getElementById('plantel-visita').innerHTML = '';
      await cargar();
      const id = Array.isArray(result) ? result[0]?.id : result?.id;
      if (id) abrirPlanilla(id);
      avisar('aviso-admin', 'Partido programado exitosamente.');
    });
    // Registra un equipo y sus datos de inscripción.
    document.getElementById('form-equipo').addEventListener('submit', async (event) => {
      event.preventDefault();
      const { finanzasCfg } = datos();
      await guardar('equipos', {
        nombre: document.getElementById('equipo-nombre').value.trim(),
        categoria: document.getElementById('equipo-categoria').value.trim(),
        genero: document.getElementById('equipo-genero').value,
        monto_inscripcion: Number(document.getElementById('equipo-inscripcion')?.value || finanzasCfg.monto_inscripcion || 50),
        inscripcion_pagada: document.getElementById('equipo-inscripcion-pagada').checked
      });
      document.getElementById('form-equipo').reset();
      await cargar();
      avisar('aviso-admin', 'Equipo guardado.');
    });
    // Incorpora un jugador a la plantilla del equipo seleccionado.
    document.getElementById('form-jugador').addEventListener('submit', async (event) => {
      event.preventDefault();
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
  };

  return { poblarSelects, renderRegistro, vincularEventos, jugadorSuspendido };
}

// La tanda y sus resultados se conservan al reabrir la planilla.
// Administra turnos, resultados y persistencia de la definición por penales.
export function crearModuloPenales({ partido, equipos, actualizar, avisar, reloj }) {
  let local = [];
  let visitante = [];
  let activo = false;

  // Determina al ganador tras cinco tiros o durante la muerte súbita.
  const ganador = () => {
    const match = partido();
    if (!match) return null;
    const localGoles = local.filter((shot) => shot === 'gol').length;
    const visitanteGoles = visitante.filter((shot) => shot === 'gol').length;
    const localTiros = local.length;
    const visitanteTiros = visitante.length;

    if (localTiros === visitanteTiros && localTiros >= 5 && localGoles !== visitanteGoles) {
      return localGoles > visitanteGoles ? match.equipo_local_id : match.equipo_visitante_id;
    }
    if (localTiros <= 5 && visitanteTiros <= 5) {
      if (localGoles + 5 - localTiros < visitanteGoles && visitanteTiros >= localTiros) {
        return match.equipo_visitante_id;
      }
      if (visitanteGoles + 5 - visitanteTiros < localGoles && localTiros >= visitanteTiros) {
        return match.equipo_local_id;
      }
    }
    return null;
  };

  // Actualiza marcador, indicadores de tiros, turno y estado de los controles.
  const render = () => {
    const match = partido();
    if (!match) return;
    const goals = [local, visitante].map((shots) => shots.filter((shot) => shot === 'gol').length);
    document.getElementById('penales-score-local').textContent = goals[0];
    document.getElementById('penales-score-visita').textContent = goals[1];
    document.getElementById('penales-total-local').textContent = `${goals[0]} goles`;
    document.getElementById('penales-total-visita').textContent = `${goals[1]} goles`;
    const badge = document.getElementById('marcador-penales-badge');
    if (badge && activo) {
      badge.hidden = false;
      document.getElementById('txt-marcador-penales').textContent = `Penales: ${goals[0]} - ${goals[1]}`;
    }

    const maxShots = Math.max(5, local.length + 1, visitante.length + 1);
    [['local', local], ['visita', visitante]].forEach(([side, shots]) => {
      const slots = document.getElementById(`indicadores-penales-${side}`);
      slots.innerHTML = Array.from({ length: maxShots }, (_, index) => {
        const shot = shots[index];
        const state = shot === 'gol' ? 'tiro-gol' : shot === 'fallo' ? 'tiro-fallo' : 'tiro-pendiente';
        const label = shot === 'gol' ? 'G' : shot === 'fallo' ? 'X' : index + 1;
        return `<div class="tiro-slot ${state}">${label}</div>`;
      }).join('');
    });

    const status = document.getElementById('penales-estado-texto');
    const buttons = ['btn-penal-local-gol', 'btn-penal-local-fallo', 'btn-penal-visita-gol', 'btn-penal-visita-fallo']
      .map((id) => document.getElementById(id));
    const winner = ganador();
    if (winner) {
      status.textContent = `Ganador por Penales: ${equipos().find((team) => team.id === winner)?.nombre || 'Equipo'} (${goals[0]} - ${goals[1]})`;
      status.style.color = 'var(--color-verde)';
      buttons.forEach((button) => { button.disabled = true; });
    } else {
      const localTurn = local.length <= visitante.length;
      const name = equipos().find((team) => team.id === (localTurn ? match.equipo_local_id : match.equipo_visitante_id))?.nombre;
      const count = (localTurn ? local : visitante).length + 1;
      status.textContent = `Turno: ${name || (localTurn ? 'Local' : 'Visitante')} (Tiro ${count})`;
      status.style.color = '#7d6608';
      buttons.forEach((button, index) => { button.disabled = !activo || (index < 2) !== localTurn; });
    }
  };

  // Guarda ambos historiales de tiros y revierte el avance si falla la actualización.
  const guardarTiros = async () => {
    const match = partido();
    try {
      await actualizar('partidos', match.id, {
        penales_local_tiros: local,
        penales_visitante_tiros: visitante
      });
      match.penales_local_tiros = local;
      match.penales_visitante_tiros = visitante;
      return true;
    } catch (error) {
      avisar('aviso-admin', `No se pudo guardar la tanda de penales: ${error.message}`, true);
      return false;
    }
  };

  // Registra el tiro del equipo al que corresponde el turno y actualiza la vista.
  const registrar = async (side, result) => {
    if (!activo || ganador()) return;
    const localTurn = local.length <= visitante.length;
    if ((side === 'local') !== localTurn) return;
    const shots = side === 'local' ? local : visitante;
    shots.push(result);
    if (!await guardarTiros()) shots.pop();
    render();
    reloj();
  };

  // Recupera o inicializa la tanda y muestra el panel con los equipos participantes.
  const iniciar = async () => {
    local = [];
    visitante = [];
    activo = true;
    const panel = document.getElementById('panel-penales');
    panel.hidden = false;
    const match = partido();
    const teams = equipos();
    document.getElementById('penales-nom-local').textContent =
      teams.find((team) => team.id === match.equipo_local_id)?.nombre || 'Local';
    document.getElementById('penales-nom-visita').textContent =
      teams.find((team) => team.id === match.equipo_visitante_id)?.nombre || 'Visitante';
    if (!await guardarTiros()) {
      activo = false;
      panel.hidden = true;
      return false;
    }
    render();
    return true;
  };

  // Los botones registran goles/fallos, deshacen el último tiro o reinician la tanda.
  document.getElementById('btn-penal-local-gol')?.addEventListener('click', () => registrar('local', 'gol'));
  document.getElementById('btn-penal-local-fallo')?.addEventListener('click', () => registrar('local', 'fallo'));
  document.getElementById('btn-penal-visita-gol')?.addEventListener('click', () => registrar('visita', 'gol'));
  document.getElementById('btn-penal-visita-fallo')?.addEventListener('click', () => registrar('visita', 'fallo'));
  document.getElementById('btn-penal-deshacer')?.addEventListener('click', async () => {
    if (!activo) return;
    const shots = local.length > visitante.length ? local : visitante;
    const last = shots.pop();
    if (last && !await guardarTiros()) shots.push(last);
    render();
    reloj();
  });
  document.getElementById('btn-penal-reiniciar')?.addEventListener('click', async () => {
    if (!activo || !confirm('¿Reiniciar toda la tanda de penales? Se borrarán todos los tiros registrados.')) return;
    const previous = [local, visitante];
    local = [];
    visitante = [];
    if (!await guardarTiros()) [local, visitante] = previous;
    else avisar('aviso-admin', 'Tanda de penales reiniciada.');
    render();
    reloj();
  });
  document.getElementById('btn-toggle-penales')?.addEventListener('click', () => {
    const panel = document.getElementById('panel-penales');
    if (activo && panel) panel.hidden = !panel.hidden;
  });

  return {
    iniciar,
    ganador,
    get activo() { return activo; },
    // Devuelve los resultados compactos que se guardan al finalizar el partido.
    resultadoFinal: () => ({
      penales_local: local.filter((shot) => shot === 'gol').length,
      penales_visitante: visitante.filter((shot) => shot === 'gol').length,
      penales_local_tiros: local,
      penales_visitante_tiros: visitante
    }),
    // Restaura el estado persistido cuando se abre una planilla con penales activos.
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
    },
    render
  };
}
