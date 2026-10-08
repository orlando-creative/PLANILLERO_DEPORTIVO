import {
  guardar, actualizar, borrar, reiniciarCampeonato
} from './supabase.js';
import { esc, fmtFecha, avisar } from './app.js';

// Prepara la programación, el registro y las acciones de administración de partidos.
export function crearModuloPartidos({ datos, cargar, abrirPlanilla, cerrarPlanilla, jugadorSuspendido }) {
  // Muestra la plantilla seleccionada y ofrece capitanes que no estén suspendidos.
  const renderPlantel = (lado) => {
    const { jugadores, sanciones } = datos();
    const equipoId = document.getElementById(`s-partido-${lado === 'local' ? 'local' : 'visita'}`).value;
    const lista = document.getElementById(`plantel-${lado}`);
    const capitan = document.getElementById(`s-cap-${lado}`);
    const plantilla = jugadores.filter((jugador) => jugador.equipo_id === equipoId);
    // Sin equipo o sin jugadores, deja una instrucción y no ofrece capitanes.
    if (!equipoId || !plantilla.length) {
      lista.innerHTML = `<p class="muted" style="font-size:.85rem;padding:8px">${equipoId ? 'Este equipo no tiene jugadores registrados' : 'Selecciona un equipo para ver su plantel'}</p>`;
      capitan.innerHTML = '<option value="">Sin designar</option>';
      return;
    }
    lista.innerHTML = `<div class="plantel-lista">${plantilla.map((jugador) => {
      const suspendido = jugadorSuspendido(jugador.id);
      // Cuenta tarjetas por jugador para resumir su historial junto al nombre.
      const amarillas = sanciones.filter((row) => row.jugador_id === jugador.id && row.tarjeta === 'amarilla').length;
      const rojas = sanciones.filter((row) => row.jugador_id === jugador.id && row.tarjeta === 'roja').length;
      return `<div class="plantel-jugador ${suspendido ? 'plantel-suspendido' : ''}">
        <div class="plantel-info"><strong>${jugador.dorsal ? `#${jugador.dorsal} ` : ''}${esc(jugador.nombre)}</strong>
        ${suspendido ? '<span class="tag-suspension">SUSPENDIDO</span>' : ''}</div>
        <div class="plantel-tarjetas">${amarillas ? `<span class="badge-mini-tarj amarilla">${amarillas}</span>` : ''}
        ${rojas ? `<span class="badge-mini-tarj roja">${rojas}</span>` : ''}</div></div>`;
    }).join('')}</div>`;
    capitan.innerHTML = '<option value="">Sin designar</option>' + plantilla.map((jugador) => {
      const suspendido = jugadorSuspendido(jugador.id);
      return `<option value="${jugador.id}" ${suspendido ? 'disabled' : ''}>${esc(jugador.nombre)} ${jugador.dorsal ? `(#${jugador.dorsal})` : ''} ${suspendido ? '[SUSPENDIDO]' : ''}</option>`;
    }).join('');
  };

  // Llena los selectores con equipos de la categoría escogida.
  const poblarSelects = () => {
    const { equipos } = datos();
    const categoria = document.getElementById('partido-categoria').value;
    const compatibles = equipos.filter((equipo) => !categoria || equipo.categoria === categoria);
    const opciones = '<option value="">Seleccionar equipo</option>' + compatibles.map((equipo) =>
      `<option value="${equipo.id}">${esc(equipo.nombre)} · ${esc(equipo.categoria)} (${esc(equipo.genero)})</option>`
    ).join('');
    ['local', 'visita'].forEach((lado) => {
      const selector = document.getElementById(`s-partido-${lado === 'local' ? 'local' : 'visita'}`);
      const value = selector.value;
      selector.innerHTML = opciones;
      // Conserva la selección si aún pertenece a la categoría; si no, la limpia.
      selector.value = compatibles.some((equipo) => equipo.id === value) ? value : '';
      selector.disabled = !categoria;
      renderPlantel(lado);
    });
  };

  // Dibuja el registro de partidos con marcador, estado y controles disponibles.
  const renderRegistro = () => {
    const container = document.getElementById('lista-partidos-admin');
    const { equipos, partidos } = datos();
    const names = Object.fromEntries(equipos.map((equipo) => [equipo.id, equipo.nombre]));
    // Traduce estados internos y calcula la clase visual de cada encuentro.
    container.innerHTML = partidos.length ? partidos.map((partido) => {
      const enCurso = ['en_juego', 'tiempo_extra', 'penales'].includes(partido.estado);
      const clase = enCurso ? 'juego' : partido.estado === 'finalizado' ? 'fin' : partido.estado === 'postergado' ? 'desc' : 'prog';
      const estado = ({ en_juego: 'En Juego', tiempo_extra: 'Tiempo Extra', penales: 'Penales', postergado: 'Postergado' })[partido.estado] || partido.estado;
      const penales = partido.penales_local != null && partido.penales_visitante != null
        ? `<small class="registro-penales">Penales: ${partido.penales_local} - ${partido.penales_visitante}</small>` : '';
      return `<article class="registro-partido">
        <div class="registro-partido-info">
          <strong class="registro-partido-marcador">${esc(names[partido.equipo_local_id] || 'Local')}
            <span>${partido.goles_local} - ${partido.goles_visitante}</span>
            ${esc(names[partido.equipo_visitante_id] || 'Visitante')}</strong>
          ${penales}
          <small class="registro-pagos-arbitraje">Arbitraje: ${esc(names[partido.equipo_local_id] || 'Local')} ${partido.arbitraje_local_pagado ? 'pagó' : 'no pagó'} · ${esc(names[partido.equipo_visitante_id] || 'Visitante')} ${partido.arbitraje_visitante_pagado ? 'pagó' : 'no pagó'}</small>
          <small class="registro-partido-meta">${esc(partido.fase)} · ${esc(partido.categoria)} (${esc(partido.genero)}) · ${fmtFecha(partido.fecha_hora)}</small>
        </div>
        <div class="registro-partido-acciones"><span class="tag tag-${clase}">${esc(estado)}</span>
        <button class="btn btn-sm" data-abrir-reg="${partido.id}">Abrir Planilla</button>
        <button class="btn btn-sm btn-out" data-editar-reg="${partido.id}">Editar</button>
        <button class="btn btn-sm btn-red" data-borrar-reg="${partido.id}">Eliminar</button></div></article>`;
    }).join('') : '<p class="empty">No hay partidos en el campeonato.</p>';
  };

  // Conecta la programación, edición, apertura, eliminación y reinicio del torneo.
  const vincularEventos = () => {
    // Actualiza equipos y plantillas cuando cambia la categoría o un equipo.
    document.getElementById('partido-categoria').addEventListener('change', poblarSelects);
    document.getElementById('s-partido-local').addEventListener('change', () => renderPlantel('local'));
    document.getElementById('s-partido-visita').addEventListener('change', () => renderPlantel('visita'));
    document.getElementById('form-partido').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const { equipos } = datos();
      const localId = document.getElementById('s-partido-local').value;
      const visitaId = document.getElementById('s-partido-visita').value;
      const categoria = document.getElementById('partido-categoria').value;
      const local = equipos.find((equipo) => equipo.id === localId);
      const visita = equipos.find((equipo) => equipo.id === visitaId);
      if (!localId || !visitaId || localId === visitaId) {
        avisar('aviso-admin', 'Selecciona dos equipos distintos.', true);
        return;
      }
      if (!categoria || !local || !visita || local.categoria !== categoria || visita.categoria !== categoria) {
        avisar('aviso-admin', 'Selecciona una categoría y dos equipos de esa misma categoría.', true);
        return;
      }
      try {
        // Guarda datos del encuentro y su estado inicial antes de refrescar el panel.
        const resultado = await guardar('partidos', {
          fase: document.getElementById('partido-fase').value.trim(),
          fecha_hora: new Date(document.getElementById('partido-fecha').value).toISOString(),
          categoria, genero: local.genero, equipo_local_id: localId, equipo_visitante_id: visitaId,
          capitan_local_id: document.getElementById('s-cap-local').value || null,
          capitan_visitante_id: document.getElementById('s-cap-visita').value || null,
          reloj_segundos: 60, periodo: 1, estado: 'programado'
        });
        form.reset();
        await cargar();
        // Si la API devolvió el ID, abre directamente la planilla recién creada.
        const id = Array.isArray(resultado) ? resultado[0]?.id : resultado?.id;
        if (id) abrirPlanilla(id);
        avisar('aviso-admin', 'Partido programado exitosamente.');
      } catch (error) {
        avisar('aviso-admin', `No se pudo programar el partido: ${error.message}`, true);
      }
    });

    // Atiende los botones del registro: abrir, editar o borrar un partido.
    document.getElementById('lista-partidos-admin').addEventListener('click', async (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      const match = datos().partidos.find((partido) =>
        [button.dataset.abrirReg, button.dataset.editarReg, button.dataset.borrarReg]
          .includes(partido.id));
      if (!match) return;
      try {
        // Cada botón tiene su propio atributo de datos; solo se ejecuta una acción.
        if (button.dataset.abrirReg) {
          await abrirPlanilla(match.id);
          document.querySelector('[data-tab="sec-planilla"]').click();
        } else if (button.dataset.editarReg) {
          // Pide fase y fecha, valida la fecha y conserva la fase previa si queda vacía.
          const fase = prompt('Fase del partido:', match.fase);
          if (fase === null) return;
          const fecha = prompt('Fecha y hora (YYYY-MM-DDTHH:MM):', new Date(match.fecha_hora).toISOString().slice(0, 16));
          if (fecha === null) return;
          const date = new Date(fecha);
          if (!Number.isFinite(date.getTime())) {
            avisar('aviso-admin', 'Ingresa una fecha y hora válidas.', true);
            return;
          }
          await actualizar('partidos', match.id, { fase: fase.trim() || match.fase, fecha_hora: date.toISOString() });
          await cargar();
          avisar('aviso-admin', 'Partido editado correctamente.');
        } else if (button.dataset.borrarReg) {
          if (!confirm('¿Deseas eliminar este partido y sus incidencias?')) return;
          // Cierra la vista activa si corresponde y recarga las listas tras borrar.
          await borrar('partidos', match.id);
          if (datos().partidoActivo?.id === match.id) cerrarPlanilla();
          await cargar();
        }
      } catch (error) {
        avisar('aviso-admin', `No se pudo completar la acción del partido: ${error.message}`, true);
      }
    });

    // Reinicia los partidos y estadísticas dependientes, conservando equipos y jugadores.
    document.getElementById('btn-reiniciar-campeonato').addEventListener('click', async () => {
      // La confirmación explica el alcance destructivo antes de llamar al servicio.
      if (!confirm('ATENCION: ¿Deseas REINICIAR EL CAMPEONATO?\n\n- Se eliminarán TODOS los partidos disputados.\n- Se reiniciará la tabla de posiciones y goleadores a cero.\n- Se eliminarán los goles y sanciones registradas.\n- Se mantendrán tus equipos y jugadores inscritos para el nuevo torneo.\n\n¿Deseas continuar?')) return;
      try {
        await reiniciarCampeonato();
        cerrarPlanilla();
        await cargar();
        avisar('aviso-admin', 'Campeonato reiniciado con éxito. Listo para el nuevo torneo.');
      } catch (error) {
        avisar('aviso-admin', `Error al reiniciar: ${error.message}`, true);
      }
    });
  };

  return { poblarSelects, renderRegistro, vincularEventos };
}
