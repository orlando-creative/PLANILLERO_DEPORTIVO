# Guía de exposición para tres estudiantes

La lógica de la aplicación se organiza en **tres archivos JavaScript para repartir entre los estudiantes**. El cliente técnico [js/supabase.js](./js/supabase.js) es infraestructura compartida y queda expresamente fuera de esta división: no se asigna a ningún estudiante como parte de la exposición.

## Introducción sugerida

> Nuestro proyecto es un planillero web para un campeonato de futsal. La interfaz usa HTML, CSS y JavaScript nativo, y organiza sus responsabilidades en tres módulos: páginas públicas, módulos funcionales de administración y coordinación de la planilla en vivo. Los datos persistentes y la autenticación se conectan mediante un cliente técnico separado, que no forma parte del reparto de exposición.

## Reparto de archivos

### Estudiante 1 — Utilidades y experiencia pública

**Archivo:** [js/app.js](./js/app.js)

**Qué debe explicar**

1. `esc` prepara texto para insertarlo como contenido HTML; `fmtFecha` y `fmtReloj` mantienen formatos consistentes.
2. `avisar` muestra mensajes temporales y `montarNavegacion` construye el encabezado y el pie compartidos.
3. `iniciarIndex` carga y muestra partidos, tabla de posiciones y goleadores. Los filtros permiten seleccionar categoría y rama.
4. `iniciarSanciones` presenta las sanciones; la pantalla ofrece controles administrativos cuando la sesión tiene ese permiso.
5. Este módulo se concentra en las páginas públicas y utilidades que comparten las pantallas; los módulos administrativos de negocio están separados en `app-modulos.js`.

**Demostración sugerida**

- Abrir la página de inicio, aplicar un filtro y mostrar las tablas.
- Abrir la página de sanciones y comparar la vista pública con la vista administrativa.
- Explicar cómo se reutiliza la navegación entre páginas.

**Pregunta guía:** ¿Por qué se escapa el texto antes de construir HTML?  
Para tratar los valores como texto y evitar que datos introducidos se interpreten como marcado HTML.

### Estudiante 2 — Funciones administrativas por módulo

**Archivo:** [js/app-modulos.js](./js/app-modulos.js)

**Qué debe explicar**

1. `crearModuloFinanzas` calcula ingresos cobrados, montos pendientes, gastos de arbitraje y saldo; también conecta los controles para actualizar tarifas y pagos.
2. `crearModuloGestion` maneja plantillas, jugadores suspendidos, capitanes, formularios de equipo y jugador, y el registro de partidos.
3. `crearModuloPenales` mantiene los tiros de ambos equipos, valida los turnos, determina el ganador y permite deshacer o reiniciar la tanda.
4. `renderizarReloj` representa el tiempo y activa o desactiva controles de acuerdo con el estado del partido.
5. Cada módulo recibe datos y funciones mediante parámetros para colaborar con el panel sin duplicar la carga principal de información.
6. Los tiros de penales se conservan asociados al partido para poder recuperarlos al volver a abrir la planilla.

**Demostración sugerida**

- Mostrar el balance financiero y explicar la fórmula: `inscripciones cobradas + multas cobradas - arbitrajes pagados`.
- Mostrar el formulario de partido y la lista de jugadores/capitanes.
- Explicar la alternancia de tiros y cómo se determina al ganador por penales.

**Pregunta guía:** ¿Por qué se separan finanzas, gestión y penales en módulos?  
Cada parte resuelve una responsabilidad distinta y recibe solo las funciones/datos que necesita.

### Estudiante 3 — Coordinación de la planilla en vivo

**Archivo:** [js/app-admin.js](./js/app-admin.js)

**Qué debe explicar**

1. `iniciarAdmin` verifica el acceso administrativo y conecta la planilla con los módulos de gestión, finanzas y penales.
2. `cargar` recupera los datos usados por el panel y actualiza las vistas.
3. `abrirPlanilla` restaura el partido seleccionado, su marcador y el historial de incidencias.
4. `segsActuales` y `arrancarReloj` coordinan la cuenta regresiva y las transiciones de estado; la representación visual se delega a `renderizarReloj` en `app-modulos.js`.
5. `registrarIncidencia`, `eliminarIncidencia` y `sincronizarGolesPartido` mantienen alineados los eventos y el marcador.
6. Los controles permiten iniciar, pausar, avanzar y finalizar el partido; un empate puede habilitar tiempo extra y, si persiste, penales.

**Demostración sugerida**

- Abrir un partido y presentar marcador, reloj e incidencias.
- Registrar un gol o tarjeta y mostrar su actualización en la planilla.
- Explicar el recorrido de los periodos y cuándo se habilitan prórroga y penales.

**Pregunta guía:** ¿De dónde sale el marcador?  
Se cuenta el número de eventos de tipo gol por equipo. La aplicación vuelve a sincronizar esos valores y la base de datos también mantiene su consistencia.

## Recorrido conjunto recomendado

1. Inicio público: filtros, partidos, posiciones y goleadores.
2. Gestión: equipos, jugadores, capitanes y programación de un encuentro.
3. Planilla: reloj, marcador, goles y tarjetas.
4. Desempate: condiciones de tiempo extra y tanda de penales.
5. Finanzas y sanciones: multas, pagos y arbitrajes.
6. Persistencia: explicar brevemente que la aplicación guarda sus datos en Supabase y que el detalle del cliente de conexión no está incluido en la división de los tres estudiantes.

## Conceptos que conviene compartir

- **Evento:** registro de una acción de cancha, como gol o tarjeta.
- **Estado del partido:** determina qué controles están disponibles en cada momento.
- **Vista:** consulta de base de datos que calcula información como posiciones o goleadores.
- **Trigger:** función de base de datos que se ejecuta automáticamente al cambiar un evento.
- **RLS:** políticas de PostgreSQL que limitan las operaciones sobre los datos según permisos.
- **Cascada:** al borrar un partido, también se eliminan las incidencias y sanciones asociadas.

## Cierre sugerido

> Dividimos la lógica de la aplicación en tres partes para hacerla más clara al estudiar y mantener: presentación pública, módulos funcionales de administración y coordinación de la planilla en vivo. Los eventos del partido ayudan a mantener relacionados el marcador, las estadísticas y las sanciones; las finanzas resumen pagos y costos del campeonato.
