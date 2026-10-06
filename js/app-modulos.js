import { guardar, actualizar, borrar } from './supabase.js';
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
    const categoria = document.getElementById('partido-categoria')?.value || '';
    const local = document.getElementById('s-partido-local');
    const visita = document.getElementById('s-partido-visita');
    if (local && visita) {
      const compatibles = equipos.filter((team) => !categoria || team.categoria === categoria);
      const options = '<option value="">Seleccionar equipo</option>' + compatibles.map((team) =>
        `<option value="${team.id}">${esc(team.nombre)} · ${esc(team.categoria)} (${esc(team.genero)})</option>`
      ).join('');
      const localValue = local.value;
      const visitaValue = visita.value;
      local.innerHTML = options;
      visita.innerHTML = options;
      local.value = compatibles.some((team) => team.id === localValue) ? localValue : '';
      visita.value = compatibles.some((team) => team.id === visitaValue) ? visitaValue : '';
      local.disabled = !categoria;
      visita.disabled = !categoria;
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
        ? `<small class="registro-penales">Penales: ${match.penales_local} - ${match.penales_visitante}</small>` : '';
      const arbitration = `<small class="registro-pagos-arbitraje">Arbitraje: ${esc(names[match.equipo_local_id] || 'Local')} ${match.arbitraje_local_pagado ? 'pagó' : 'no pagó'} · ${esc(names[match.equipo_visitante_id] || 'Visitante')} ${match.arbitraje_visitante_pagado ? 'pagó' : 'no pagó'}</small>`;
      return `<article class="registro-partido">
        <div class="registro-partido-info">
          <strong class="registro-partido-marcador">${esc(names[match.equipo_local_id])}
            <span>${match.goles_local} - ${match.goles_visitante}</span>
            ${esc(names[match.equipo_visitante_id])}</strong>
          ${penalties}
          ${arbitration}
          <small class="registro-partido-meta">${esc(match.fase)} · ${esc(match.categoria)} (${esc(match.genero)}) · ${fmtFecha(match.fecha_hora)}</small>
        </div>
        <div class="registro-partido-acciones"><span class="tag tag-${stateClass}">${esc(stateText)}</span>
        <button class="btn btn-sm" data-abrir-reg="${match.id}">Abrir Planilla</button>
        <button class="btn btn-sm btn-out" data-editar-reg="${match.id}">Editar</button>
        <button class="btn btn-sm btn-out" data-postergar-reg="${match.id}" ${running || match.estado === 'finalizado' ? 'disabled' : ''}>Postergar</button>
        <button class="btn btn-sm btn-red" data-borrar-reg="${match.id}">Eliminar</button></div></article>`;
    }).join('') : '<p class="empty">No hay partidos en el campeonato.</p>';

    // Abre la planilla seleccionada y muestra su pestaña.
    container.querySelectorAll('[data-abrir-reg]').forEach((button) => button.addEventListener('click', () => {
      abrirPlanilla(button.dataset.abrirReg);
      document.querySelector('[data-tab="sec-planilla"]').click();
    }));
    // Edita fase y fecha después de validar los valores ingresados.
    container.querySelectorAll('[data-editar-reg]').forEach((button) => button.addEventListener('click', async () => {
      const match = datos().partidos.find((row) => row.id === button.dataset.editarReg);
      if (!match) return;
      const phase = prompt('Fase del partido:', match.fase);
      if (phase === null) return;
      const dateText = prompt('Fecha y hora (YYYY-MM-DDTHH:MM):', new Date(match.fecha_hora).toISOString().slice(0, 16));
      if (dateText === null) return;
      const date = new Date(dateText);
      if (!Number.isFinite(date.getTime())) {
        avisar('aviso-admin', 'Ingresa una fecha y hora válidas.', true);
        return;
      }
      await actualizar('partidos', match.id, {
        fase: phase.trim() || match.fase, fecha_hora: date.toISOString()
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

  const renderEquipos = () => {
    const container = document.getElementById('equipos-registrados');
    if (!container) return;
    const { equipos, jugadores } = datos();
    container.innerHTML = equipos.length ? equipos.map((team) => {
      const integrantes = jugadores.filter((player) => player.equipo_id === team.id);
      return `<article class="equipo-admin-card">
        <div class="equipo-admin-header">
          <div>
            <strong>${esc(team.nombre)}</strong>
            <small>${esc(team.categoria)} · ${esc(team.genero)} · ${integrantes.length} jugador${integrantes.length === 1 ? '' : 'es'}</small>
          </div>
          <label class="pago-equipo">
            <input type="checkbox" data-inscripcion="${team.id}" ${team.inscripcion_pagada ? 'checked' : ''}>
            <span>Inscripción ${team.inscripcion_pagada ? 'pagada' : 'pendiente'}</span>
          </label>
        </div>
        <ul class="equipo-admin-integrantes">${integrantes.map((player) =>
          `<li><span>${player.dorsal ? `#${player.dorsal} ` : ''}${esc(player.nombre)}</span>
            <button type="button" class="btn btn-sm btn-out" data-editar-jugador="${player.id}">Editar</button></li>`
        ).join('') || '<li class="muted">Sin jugadores</li>'}</ul>
        <details class="equipo-agregar-jugador">
          <summary>+ Añadir jugador</summary>
          <form data-agregar-jugador="${team.id}" class="jugador-rapido-form">
            <input name="nombre" aria-label="Nombre del jugador" placeholder="Nombre y apellido" required>
            <input name="dorsal" type="number" min="1" max="99" aria-label="Dorsal" placeholder="Dorsal">
            <button type="submit" class="btn btn-sm">Guardar</button>
          </form>
        </details>
        <button type="button" class="btn btn-sm btn-red equipo-eliminar" data-eliminar-equipo="${team.id}">
          Eliminar equipo
        </button>
      </article>`;
    }).join('') : '<p class="empty">No hay equipos registrados.</p>';

    container.querySelectorAll('[data-inscripcion]').forEach((checkbox) => {
      checkbox.addEventListener('change', async () => {
        const team = equipos.find((row) => row.id === checkbox.dataset.inscripcion);
        if (!team) return;
        const paid = checkbox.checked;
        checkbox.disabled = true;
        checkbox.parentElement.querySelector('span').textContent = `Inscripción ${paid ? 'pagada' : 'pendiente'}`;
        try {
          await actualizar('equipos', team.id, { inscripcion_pagada: paid });
          team.inscripcion_pagada = paid;
          avisar('aviso-admin', `Inscripción de ${team.nombre}: ${paid ? 'pagada' : 'pendiente'}.`);
        } catch (error) {
          checkbox.checked = Boolean(team.inscripcion_pagada);
          checkbox.parentElement.querySelector('span').textContent = `Inscripción ${team.inscripcion_pagada ? 'pagada' : 'pendiente'}`;
          avisar('aviso-admin', `No se pudo actualizar el pago de inscripción: ${error.message}`, true);
        } finally {
          checkbox.disabled = false;
        }
      });
    });

    container.querySelectorAll('[data-agregar-jugador]').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submit = form.querySelector('[type="submit"]');
        submit.disabled = true;
        try {
          const data = new FormData(form);
          const dorsal = data.get('dorsal');
          await guardar('jugadores', {
            equipo_id: form.dataset.agregarJugador,
            nombre: String(data.get('nombre')).trim(),
            dorsal: dorsal ? Number(dorsal) : null
          });
          await cargar();
          avisar('aviso-admin', 'Jugador guardado.');
        } catch (error) {
          avisar('aviso-admin', `No se pudo guardar el jugador: ${error.message}`, true);
        } finally {
          submit.disabled = false;
        }
      });
    });

    container.querySelectorAll('[data-editar-jugador]').forEach((button) => {
      button.addEventListener('click', async () => {
        const player = jugadores.find((row) => row.id === button.dataset.editarJugador);
        if (!player) return;
        const name = prompt('Nombre y apellido:', player.nombre);
        if (name === null) return;
        const dorsalText = prompt('Dorsal (deja vacío si no tiene):', player.dorsal ?? '');
        if (dorsalText === null) return;
        const trimmedName = name.trim();
        const dorsal = dorsalText.trim() ? Number(dorsalText) : null;
        if (!trimmedName || (dorsal !== null && (!Number.isInteger(dorsal) || dorsal < 1 || dorsal > 99))) {
          avisar('aviso-admin', 'Ingresa un nombre y un dorsal válido entre 1 y 99.', true);
          return;
        }
        button.disabled = true;
        try {
          await actualizar('jugadores', player.id, { nombre: trimmedName, dorsal });
          await cargar();
          avisar('aviso-admin', 'Jugador actualizado.');
        } catch (error) {
          avisar('aviso-admin', `No se pudo actualizar el jugador: ${error.message}`, true);
        } finally {
          button.disabled = false;
        }
      });
    });

    container.querySelectorAll('[data-eliminar-equipo]').forEach((button) => {
      button.addEventListener('click', async () => {
        const team = equipos.find((row) => row.id === button.dataset.eliminarEquipo);
        if (!team) return;
        const relatedMatches = partidos.filter((match) =>
          match.equipo_local_id === team.id || match.equipo_visitante_id === team.id
        );
        const impacts = relatedMatches.length
          ? ` También se eliminarán ${relatedMatches.length} partido(s), sus incidencias y sanciones.`
          : '';
        if (!confirm(`¿Eliminar el equipo "${team.nombre}"? Se eliminarán también sus jugadores.${impacts} Esta acción no se puede deshacer.`)) return;

        button.disabled = true;
        try {
          await borrar('equipos', team.id);
          if (datos().partidoActivo &&
              (datos().partidoActivo.equipo_local_id === team.id || datos().partidoActivo.equipo_visitante_id === team.id)) {
            cerrarPlanilla();
          }
          await cargar();
          avisar('aviso-admin', `Equipo "${team.nombre}" eliminado.`);
        } catch (error) {
          button.disabled = false;
          avisar('aviso-admin', `No se pudo eliminar el equipo: ${error.message}`, true);
        }
      });
    });
  };

  // Conecta formularios y selectores con las operaciones de gestión.
  const vincularEventos = () => {
    document.getElementById('s-partido-local')?.addEventListener('change', () => renderPlantel('local'));
    document.getElementById('s-partido-visita')?.addEventListener('change', () => renderPlantel('visita'));
    document.getElementById('partido-categoria')?.addEventListener('change', () => {
      poblarSelects();
    });
    // Valida y registra un encuentro nuevo con sus equipos, capitanes y reloj inicial.
    document.getElementById('form-partido').addEventListener('submit', async (event) => {
      event.preventDefault();
      const { equipos } = datos();
      const localId = document.getElementById('s-partido-local').value;
      const visitanteId = document.getElementById('s-partido-visita').value;
      const categoria = document.getElementById('partido-categoria').value;
      if (!localId || !visitanteId || localId === visitanteId) {
        alert('Selecciona dos equipos distintos.');
        return;
      }
      const local = equipos.find((team) => team.id === localId);
      const visitante = equipos.find((team) => team.id === visitanteId);
      if (!categoria || !local || !visitante || local.categoria !== categoria || visitante.categoria !== categoria) {
        avisar('aviso-admin', 'Selecciona una categoría y dos equipos de esa misma categoría.', true);
        return;
      }
      const result = await guardar('partidos', {
        fase: document.getElementById('partido-fase').value.trim(),
        fecha_hora: new Date(document.getElementById('partido-fecha').value).toISOString(),
        categoria, genero: local.genero,
        equipo_local_id: localId, equipo_visitante_id: visitanteId,
        capitan_local_id: document.getElementById('s-cap-local').value || null,
        capitan_visitante_id: document.getElementById('s-cap-visita').value || null,
        reloj_segundos: 60, periodo: 1, estado: 'programado'
      });
      document.getElementById('form-partido').reset();
      document.getElementById('plantel-local').innerHTML = '';
      document.getElementById('plantel-visita').innerHTML = '';
      await cargar();
      const id = Array.isArray(result) ? result[0]?.id : result?.id;
      if (id) abrirPlanilla(id);
      avisar('aviso-admin', 'Partido programado exitosamente.');
    });
    const formEquipo = document.getElementById('form-equipo');
    // Registra un equipo; los integrantes se gestionan de forma compacta en su tarjeta.
    formEquipo.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = formEquipo.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        const result = await guardar('equipos', {
          nombre: document.getElementById('equipo-nombre').value.trim(),
          categoria: document.getElementById('equipo-categoria').value.trim(),
          genero: document.getElementById('equipo-genero').value,
          inscripcion_pagada: document.getElementById('equipo-inscripcion-pagada').checked
        });
        if (!Array.isArray(result) || !result[0]?.id) throw new Error('No se recibió confirmación del equipo guardado.');
        formEquipo.reset();
        await cargar();
        avisar('aviso-admin', 'Equipo guardado. Ya puedes añadir sus jugadores desde la tarjeta.');
      } catch (error) {
        try {
          await cargar();
        } catch (loadError) {
          avisar('aviso-admin', `Error al actualizar la lista: ${loadError.message}`, true);
        }
        avisar('aviso-admin', `No se pudo registrar el equipo: ${error.message}`, true);
      } finally {
        submit.disabled = false;
      }
    });
  };

  return { poblarSelects, renderRegistro, renderEquipos, vincularEventos, jugadorSuspendido };
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
