import { guardar, actualizar, borrar } from './supabase.js';
import { esc, avisar } from './app.js';

// Prepara las vistas y acciones de equipos usando los datos del panel principal.
export function crearModuloEquipos({ datos, cargar, cerrarPlanilla }) {
  // Dibuja cada equipo, sus jugadores, estado de inscripción y controles.
  const render = () => {
    const container = document.getElementById('equipos-registrados');
    const { equipos, jugadores } = datos();
    // Filtra la plantilla por equipo y la convierte en una tarjeta administrativa.
    container.innerHTML = equipos.length ? equipos.map((equipo) => {
      const integrantes = jugadores.filter((jugador) => jugador.equipo_id === equipo.id);
      return `<article class="equipo-admin-card">
        <div class="equipo-admin-header"><div>
          <strong>${esc(equipo.nombre)}</strong>
          <small>${esc(equipo.categoria)} · ${esc(equipo.genero)} · ${integrantes.length} jugador${integrantes.length === 1 ? '' : 'es'}</small>
        </div><label class="pago-equipo">
          <input type="checkbox" data-inscripcion="${equipo.id}" ${equipo.inscripcion_pagada ? 'checked' : ''}>
          <span>Inscripción ${equipo.inscripcion_pagada ? 'pagada' : 'pendiente'}</span>
        </label></div>
        <ul class="equipo-admin-integrantes">${integrantes.map((jugador) =>
          `<li><span>${jugador.dorsal ? `#${jugador.dorsal} ` : ''}${esc(jugador.nombre)}</span>
          <button type="button" class="btn btn-sm btn-out" data-editar-jugador="${jugador.id}">Editar</button></li>`
        ).join('') || '<li class="muted">Sin jugadores</li>'}</ul>
        <details class="equipo-agregar-jugador"><summary>+ Añadir jugador</summary>
          <form data-agregar-jugador="${equipo.id}" class="jugador-rapido-form">
            <input name="nombre" aria-label="Nombre del jugador" placeholder="Nombre y apellido" required>
            <input name="dorsal" type="number" min="1" max="99" aria-label="Dorsal" placeholder="Dorsal">
            <button type="submit" class="btn btn-sm">Guardar</button>
          </form>
        </details>
        <button type="button" class="btn btn-sm btn-red equipo-eliminar" data-eliminar-equipo="${equipo.id}">Eliminar equipo</button>
      </article>`;
    }).join('') : '<p class="empty">No hay equipos registrados.</p>';
  };

  // Conecta los formularios y botones con las operaciones de equipos y jugadores.
  const vincularEventos = () => {
    const container = document.getElementById('equipos-registrados');
    // Guarda el estado de pago y restaura la casilla si ocurre un error.
    container.addEventListener('change', async (event) => {
      // La delegación permite atender casillas creadas de nuevo al renderizar tarjetas.
      const checkbox = event.target.closest('[data-inscripcion]');
      if (!checkbox) return;
      const equipo = datos().equipos.find((row) => row.id === checkbox.dataset.inscripcion);
      if (!equipo) return;
      const paid = checkbox.checked;
      checkbox.disabled = true;
      try {
        // Persiste el cambio antes de actualizar el estado compartido en memoria.
        await actualizar('equipos', equipo.id, { inscripcion_pagada: paid });
        equipo.inscripcion_pagada = paid;
        checkbox.parentElement.querySelector('span').textContent = `Inscripción ${paid ? 'pagada' : 'pendiente'}`;
        avisar('aviso-admin', `Inscripción de ${equipo.nombre}: ${paid ? 'pagada' : 'pendiente'}.`);
      } catch (error) {
        checkbox.checked = Boolean(equipo.inscripcion_pagada);
        checkbox.parentElement.querySelector('span').textContent = `Inscripción ${equipo.inscripcion_pagada ? 'pagada' : 'pendiente'}`;
        avisar('aviso-admin', `No se pudo actualizar el pago de inscripción: ${error.message}`, true);
      } finally {
        checkbox.disabled = false;
      }
    });

    // Añade un jugador a la plantilla del equipo indicado por el formulario.
    container.addEventListener('submit', async (event) => {
      const form = event.target.closest('[data-agregar-jugador]');
      if (!form) return;
      event.preventDefault();
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      try {
        // FormData lee los campos del formulario sin buscar cada input por separado.
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
        button.disabled = false;
      }
    });

    // Edita jugadores o elimina un equipo con sus dependencias relacionadas.
    container.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-editar-jugador], [data-eliminar-equipo]');
      if (!button) return;
      if (button.dataset.editarJugador) {
        // Solicita los nuevos datos y valida nombre y dorsal antes de enviarlos.
        const jugador = datos().jugadores.find((row) => row.id === button.dataset.editarJugador);
        if (!jugador) return;
        const nombre = prompt('Nombre y apellido:', jugador.nombre);
        if (nombre === null) return;
        const dorsalText = prompt('Dorsal (deja vacío si no tiene):', jugador.dorsal ?? '');
        if (dorsalText === null) return;
        const trimmedName = nombre.trim();
        const dorsal = dorsalText.trim() ? Number(dorsalText) : null;
        if (!trimmedName || (dorsal !== null && (!Number.isInteger(dorsal) || dorsal < 1 || dorsal > 99))) {
          avisar('aviso-admin', 'Ingresa un nombre y un dorsal válido entre 1 y 99.', true);
          return;
        }
        button.disabled = true;
        try {
          await actualizar('jugadores', jugador.id, { nombre: trimmedName, dorsal });
          await cargar();
          avisar('aviso-admin', 'Jugador actualizado.');
        } catch (error) {
          avisar('aviso-admin', `No se pudo actualizar el jugador: ${error.message}`, true);
        } finally {
          button.disabled = false;
        }
        return;
      }

      const equipo = datos().equipos.find((row) => row.id === button.dataset.eliminarEquipo);
      if (!equipo) return;
      // Calcula el impacto en partidos para advertir qué relaciones pueden borrarse en cascada.
      const partidos = datos().partidos.filter((partido) =>
        partido.equipo_local_id === equipo.id || partido.equipo_visitante_id === equipo.id
      );
      const impactos = partidos.length
        ? ` También se eliminarán ${partidos.length} partido(s), sus incidencias y sanciones.` : '';
      if (!confirm(`¿Eliminar el equipo "${equipo.nombre}"? Se eliminarán también sus jugadores.${impactos} Esta acción no se puede deshacer.`)) return;
      button.disabled = true;
      try {
        // Si el partido abierto involucra al equipo eliminado, cierra esa planilla antes de recargar.
        await borrar('equipos', equipo.id);
        const activo = datos().partidoActivo;
        if (activo && (activo.equipo_local_id === equipo.id || activo.equipo_visitante_id === equipo.id)) cerrarPlanilla();
        await cargar();
        avisar('aviso-admin', `Equipo "${equipo.nombre}" eliminado.`);
      } catch (error) {
        button.disabled = false;
        avisar('aviso-admin', `No se pudo eliminar el equipo: ${error.message}`, true);
      }
    });

    // Registra un equipo nuevo y actualiza la lista visible.
    const formEquipo = document.getElementById('form-equipo');
    formEquipo.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = formEquipo.querySelector('[type="submit"]');
      button.disabled = true;
      try {
        // Toma los valores del formulario y guarda el registro principal del equipo.
        const result = await guardar('equipos', {
          nombre: document.getElementById('equipo-nombre').value.trim(),
          categoria: document.getElementById('equipo-categoria').value.trim(),
          genero: document.getElementById('equipo-genero').value,
          inscripcion_pagada: document.getElementById('equipo-inscripcion-pagada').checked
        });
        // Comprueba que la API devolvió el equipo creado antes de limpiar el formulario.
        if (!Array.isArray(result) || !result[0]?.id) throw new Error('No se recibió confirmación del equipo guardado.');
        formEquipo.reset();
        await cargar();
        avisar('aviso-admin', 'Equipo guardado. Ya puedes añadir sus jugadores desde la tarjeta.');
      } catch (error) {
        avisar('aviso-admin', `No se pudo registrar el equipo: ${error.message}`, true);
      } finally {
        button.disabled = false;
      }
    });
  };

  return { render, vincularEventos };
}
