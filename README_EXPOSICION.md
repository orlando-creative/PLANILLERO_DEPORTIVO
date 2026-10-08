# Guía de exposición para tres estudiantes

Esta guía reparte los cuatro archivos de lógica del navegador entre tres expositores. El primer estudiante explica conjuntamente la parte pública y la administración de equipos; el cliente técnico compartido [js/supabase.js](./js/supabase.js) se menciona como apoyo, pero no se asigna como exposición aparte.

## Presentación general

> Nuestro proyecto es un planillero web para un campeonato de futsal. Está hecho con HTML, CSS y JavaScript nativo. La aplicación organiza sus responsabilidades en módulos: páginas públicas, equipos, partidos y planilla en vivo. Los módulos consultan y guardan datos en Supabase mediante un cliente compartido.

Antes de comenzar, conviene explicar el recorrido de una operación: el usuario interactúa con un control HTML, JavaScript escucha el evento, valida la acción, llama al módulo de datos y actualiza la pantalla con la respuesta.

## Estudiante 1 — Páginas públicas, utilidades y equipos

**Archivos:** [js/app.js](./js/app.js) y [js/app-equipos.js](./js/app-equipos.js)

### En `app.js`

- `esc(text)` convierte un valor en texto seguro antes de insertarlo en una plantilla HTML.
- `fmtFecha(date)` convierte una fecha al formato local que muestran las pantallas.
- `fmtReloj(seconds)` convierte segundos a minutos y segundos.
- `avisar(id, message, error)` muestra un aviso accesible temporal de éxito o error.
- `sincronizarNavegacion()` muestra u oculta los accesos de administración y sesión según el usuario autenticado.
- `iniciarIndex()` consulta equipos, partidos, posiciones y goleadores; crea las opciones de filtro y dibuja las tablas públicas.
- La función interna `render` vuelve a dibujar las tablas cuando cambia categoría o rama. La función `visible` comprueba si una fila cumple ambos filtros.
- `iniciarSanciones()` presenta las sanciones y, si el usuario es administrador, añade controles para registrar pagos y cambiar su estado.

### En `app-equipos.js`

- `crearModuloEquipos(...)` recibe funciones y datos del panel; así el módulo de equipos comparte la carga y el estado de la aplicación sin duplicarlos.
- `render()` crea una tarjeta por equipo, presenta jugadores y muestra acciones de inscripción, edición, adición y eliminación.
- `vincularEventos()` conecta los formularios y botones con sus operaciones.
- El evento `change` de inscripción actualiza el pago del equipo y restaura el valor anterior si falla el guardado.
- El evento `submit` para añadir jugador obtiene los campos del formulario, guarda el jugador y recarga la vista.
- El evento `click` permite editar un jugador o eliminar el equipo. Antes de eliminarlo informa sobre los datos relacionados, pide confirmación y actualiza la planilla si el partido activo involucra a ese equipo.
- El formulario `form-equipo` valida la respuesta del servidor, registra el equipo y vuelve a dibujar la lista.

### Demostración sugerida

1. En inicio, aplicar los filtros y explicar el cambio de las tablas.
2. En administración, mostrar un equipo con su lista de jugadores y explicar cómo agregar uno.
3. Presentar el botón **Eliminar equipo** y seguir el flujo descrito en [README_PRACTICA.md](./README_PRACTICA.md). Usar datos de prueba.

**Pregunta guía:** ¿Por qué se usa `esc()` al construir una plantilla HTML?

**Respuesta:** Para mostrar los datos como texto, sin interpretar como HTML el contenido que viene de la base de datos.

## Estudiante 2 — Programación y administración de partidos

**Archivo:** [js/app-partidos.js](./js/app-partidos.js)

- `crearModuloPartidos(...)` recibe los datos y las operaciones compartidas que necesita para programar, mostrar y administrar partidos.
- `renderPlantel(lado)` muestra la plantilla del equipo local o visitante y marca jugadores suspendidos; además construye la lista de capitanes disponibles.
- `poblarSelects()` filtra los equipos por categoría y actualiza los selectores de ambos lados.
- `renderRegistro()` dibuja cada partido con marcador, fecha, fase, pagos de arbitraje, estado y botones de acción.
- `vincularEventos()` registra los listeners de categoría, equipo, formulario de programación y botones del registro.
- Al enviar `form-partido`, el módulo valida que existan dos equipos distintos de la categoría seleccionada, guarda el partido y abre su planilla.
- El listener de `lista-partidos-admin` delega los botones para abrir, editar o eliminar el partido seleccionado.
- El botón de reinicio confirma la acción, llama a `reiniciarCampeonato()`, cierra la planilla activa y carga nuevamente los datos. El reinicio conserva los equipos y jugadores.

### Demostración sugerida

1. Seleccionar una categoría y mostrar que los selectores solo ofrecen equipos compatibles.
2. Programar un partido entre equipos distintos y observarlo en el registro.
3. Mostrar los controles de abrir, editar y eliminar; explicar por qué el botón de reinicio requiere una confirmación especial.

**Pregunta guía:** ¿Qué hace la validación antes de guardar un partido?

**Respuesta:** Evita guardar un partido sin equipos, con el mismo equipo en ambos lados o con equipos que no pertenecen a la categoría seleccionada.

## Estudiante 3 — Planilla, reloj, incidencias y penales

**Archivo:** [js/app-planilla.js](./js/app-planilla.js)

- `renderizarReloj(partido, segundos, penales)` presenta el tiempo y habilita o bloquea controles según el periodo, el estado y el marcador.
- `crearModuloPenales(...)` encapsula las operaciones de la tanda. `ganador()` determina si existe un ganador; `guardarTiros()` persiste los tiros; `render()` actualiza la pantalla; `registrar()` valida el turno; `iniciar()` limpia y comienza una tanda.
- `iniciarAdmin()` verifica permisos, carga los datos y coordina los otros módulos.
- `cargar()` vuelve a consultar los datos y refresca las listas del panel.
- `segsActuales()` calcula el tiempo restante a partir de los segundos guardados y la hora de inicio.
- `arrancarReloj()` actualiza el reloj cada segundo y procesa el final del periodo, el tiempo extra o el inicio de penales.
- `sincronizarGolesPartido(partidoId)` cuenta los eventos de gol y actualiza el marcador del partido.
- `abrirPlanilla(id, scroll)` carga el partido y sus eventos, restaura reloj y penales, y actualiza nombres, marcador, jugadores e incidencias en pantalla.
- `registrarIncidencia(equipoId, tipo, jugadorId)` guarda un gol o una tarjeta, actualiza el marcador y vuelve a cargar las sanciones.
- `eliminarIncidencia(eventoId)` elimina una incidencia con confirmación y sincroniza el acta y el marcador.
- `restarUltimoGolEquipo(equipoId)` localiza el gol más reciente del equipo y lo elimina usando el flujo común de incidencias.
- Los listeners de reloj inician, pausan, avanzan periodos, comienzan tiempo extra y finalizan el partido. Los de arbitraje guardan el pago de cada equipo por separado.
- `cerrarPlanilla()` limpia el partido activo y detiene el intervalo del reloj.

### Demostración sugerida

1. Abrir un partido y explicar el marcador, los nombres, el reloj y el historial de incidencias.
2. Registrar un gol y mostrar que el marcador se sincroniza desde los eventos.
3. Presentar la condición de empate al final del segundo tiempo y el botón **Tiempo Extra**.
4. Explicar que, si el tiempo extra termina empatado, se habilita la tanda de penales.

**Pregunta guía:** ¿Por qué el marcador se calcula desde los eventos?

**Respuesta:** Porque cada gol queda registrado como una incidencia; contar esos eventos mantiene el resultado ligado al acta del partido.

## Vocabulario de programación

| Término | Explicación sencilla | Ejemplo del proyecto |
|---|---|---|
| **Función** | Bloque reutilizable que realiza una tarea. Puede recibir parámetros y devolver un resultado. | `fmtReloj(seconds)` recibe segundos y devuelve `MM:SS`. |
| **Parámetro** | Dato que una función recibe para trabajar. | `equipoId` indica qué equipo actualizar. |
| **Retorno** | Valor que una función entrega al terminar. | `ganador()` devuelve el ID del equipo ganador o `null`. |
| **Función asíncrona (`async`)** | Función que puede esperar operaciones externas sin bloquear la interfaz. | `cargar()` espera las consultas a Supabase. |
| **`await`** | Espera el resultado de una promesa dentro de una función `async`. | `await guardar(...)` espera a que se guarde un equipo. |
| **Callback** | Función que se entrega para ejecutarse cuando ocurre algo. | La función pasada a `addEventListener('click', ...)`. |
| **Evento** | Acción del usuario o del navegador que activa un callback. | `click`, `submit` o `change`. |
| **Listener** | Función registrada para atender un evento. | El listener del botón de tiempo extra. |
| **DOM** | Representación de los elementos HTML que JavaScript puede consultar y modificar. | `document.getElementById(...)`. |
| **Renderizar** | Crear o actualizar la parte visible de la página con los datos actuales. | `renderRegistro()` actualiza la lista de partidos. |
| **Módulo** | Archivo que agrupa responsabilidades y comparte funciones mediante `import`/`export`. | `app-equipos.js` administra equipos y jugadores. |
| **`try/catch`** | Manejo de operaciones que pueden fallar para informar el error. | Guardar y eliminar registros de Supabase. |
| **API** | Interfaz por la que el navegador solicita o modifica datos en un servicio. | `supabase.js` usa la API REST de Supabase. |
| **Base de datos** | Lugar persistente donde se conservan los equipos, partidos y eventos. | PostgreSQL en Supabase. |
| **Vista** | Consulta guardada que calcula datos a partir de tablas relacionadas. | `posiciones` y `goleadores`. |
| **Trigger** | Rutina de base de datos que se ejecuta automáticamente ante un cambio. | El trigger de eventos actualiza el marcador y puede crear sanciones. |
| **RLS** | Reglas de PostgreSQL que controlan qué datos puede leer o modificar cada usuario. | Solo el administrador autenticado puede escribir. |
| **Cascada** | Regla de relación que elimina datos dependientes al borrar el registro principal. | Eliminar un partido elimina sus incidencias y sanciones relacionadas. |

## Cierre sugerido

> Repartimos la exposición según la responsabilidad de cada archivo. `app.js` concentra utilidades y páginas públicas; los módulos de equipos y partidos administran sus registros; y `app-planilla.js` coordina el reloj y las acciones en cancha. Los módulos usan funciones compartidas para consultar y guardar los datos, y la base de datos aplica permisos y mantiene las relaciones.
