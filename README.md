# Planillero Oficial de Futsal

Aplicación web para administrar el campeonato de futsal de la U.E. Luz del Mundo A. Permite consultar partidos y estadísticas, registrar equipos y jugadores, llevar la planilla durante los encuentros y gestionar sanciones y disciplina del torneo.

## Contenido

- [Qué hace el proyecto](#qué-hace-el-proyecto)
- [Tecnologías y arquitectura](#tecnologías-y-arquitectura)
- [Estructura de archivos](#estructura-de-archivos)
- [Flujo de uso](#flujo-de-uso)
- [Modelo de datos](#modelo-de-datos)
- [Funciones principales del sistema](#funciones-principales-del-sistema)
- [Configuración y ejecución](#configuración-y-ejecución)
- [Seguridad y permisos](#seguridad-y-permisos)
- [Guía para estudiar y exponer](#guía-para-estudiar-y-exponer)

## Qué hace el proyecto

El sitio ofrece dos tipos de experiencia:

- **Público:** consultar el calendario y resultados, filtrar por categoría y rama, ver la clasificación y revisar la tabla de goleadores. La página de sanciones también es visible públicamente.
- **Administración:** iniciar sesión y gestionar equipos, jugadores, capitanes, partidos, cronómetro, incidencias, penales y sanciones.

El sistema está pensado para un campeonato escolar, pero su modelo de equipos, jugadores y partidos permite adaptarlo a otros torneos.

## Tecnologías y arquitectura

- **HTML5:** estructura de las páginas y formularios.
- **CSS:** estilos adaptables en `css/estilos.css`.
- **JavaScript nativo con módulos ES:** lógica del navegador, sin framework ni instalación de dependencias npm.
- **Supabase:** PostgreSQL, autenticación, API REST y políticas de acceso.
- **Vercel:** configuración de publicación estática en `vercel.json`.

El navegador importa módulos ES desde archivos locales y accede a Supabase con `fetch`. Por eso se debe abrir la aplicación desde un servidor HTTP, no desde una ruta `file://`.

## Estructura de archivos

| Ruta | Responsabilidad |
|---|---|
| [index.html](./index.html) | Inicio público: partidos, clasificación y goleadores. |
| [inicio-sesion.html](./inicio-sesion.html) | Formulario de acceso de administración. |
| [administracion.html](./administracion.html) | Programación y planilla, registro de partidos, equipos y jugadores. |
| [sanciones.html](./sanciones.html) | Consulta y gestión de sanciones. |
| [reglamento.html](./reglamento.html) | Reglas resumidas para el torneo. |
| [css/estilos.css](./css/estilos.css) | Estilos compartidos y diseño adaptable. |
| [js/supabase.js](./js/supabase.js) | Cliente REST, sesión, autenticación y operaciones de datos. |
| [js/app.js](./js/app.js) | Utilidades compartidas, navegación y páginas públicas. |
| [js/app-planilla.js](./js/app-planilla.js) | Planilla en vivo, reloj, incidencias y tanda de penales. |
| [js/app-partidos.js](./js/app-partidos.js) | Programación, edición y registro de partidos. |
| [js/app-equipos.js](./js/app-equipos.js) | Gestión de equipos, jugadores e inscripciones. |
| [sql/esquema_futsal.sql](./sql/esquema_futsal.sql) | Tablas, vistas, triggers, funciones y políticas RLS. |
| [vercel.json](./vercel.json) | Configuración para servir el sitio estático en Vercel. |

### Cómo se conectan los módulos

1. Cada página HTML carga el módulo que necesita con `<script type="module">`.
2. Las páginas públicas llaman funciones de `app.js`.
3. `app-planilla.js` administra la planilla en vivo; `app-partidos.js` y `app-equipos.js` se ocupan de sus respectivas pantallas de administración.
4. Los módulos del navegador usan las operaciones exportadas por `supabase.js`, que envía solicitudes a la API REST y agrega la clave pública y, cuando hay sesión, el token del usuario.
5. PostgreSQL aplica las reglas de seguridad y mantiene las estadísticas derivadas mediante vistas y triggers.

## Flujo de uso

1. Un administrador crea equipos, añade varios integrantes y marca si se pagó la inscripción.
2. Programa un partido con fecha, categoría, equipos y capitanes. Las categorías disponibles son `1ro a 3ro` y `4to a 6to`; los equipos se filtran por la categoría seleccionada.
3. Abre la planilla y usa el reloj para controlar los periodos.
4. Registra goles y tarjetas; el marcador se basa en los eventos de gol.
5. Si el encuentro sigue empatado, puede jugarse tiempo extra y luego la tanda de penales.
6. Las tarjetas generan sanciones disciplinarias en la base de datos.
7. En la planilla se registra por separado el pago de arbitraje de cada equipo; el estado queda visible en el registro del partido.
8. La página pública presenta resultados finalizados, tabla de posiciones y goleadores.

## Modelo de datos

El esquema completo y las relaciones están definidos en [sql/esquema_futsal.sql](./sql/esquema_futsal.sql).

| Tabla o vista | Propósito |
|---|---|
| `perfiles` | Vincula al usuario de Supabase Auth con su nombre y rol (`administrador` o `espectador`). |
| `equipos` | Almacena nombre, categoría, rama y estado de pago de inscripción. |
| `jugadores` | Guarda las plantillas y dorsales, vinculados a un equipo. |
| `partidos` | Registra la programación, marcador, estado, reloj, tanda de penales y pagos de arbitraje por equipo. |
| `eventos_partido` | Guarda cada gol y tarjeta, con equipo, jugador, periodo y segundo del partido. |
| `sanciones` | Contiene el estado disciplinario asociado a eventos de tarjeta. |
| `posiciones` (vista) | Calcula partidos jugados, ganados, empatados, perdidos, goles y puntos a partir de partidos finalizados. |
| `goleadores` (vista) | Cuenta los goles de jugadores en partidos finalizados. |

### Relaciones y automatizaciones

- Cada jugador pertenece a un equipo. Al eliminar un equipo, PostgreSQL elimina sus jugadores asociados por cascada.
- Los eventos pertenecen a un partido y un equipo; borrar un partido elimina sus eventos y sanciones asociadas por cascada.
- El trigger `sincronizar_evento_partido()` recalcula el marcador a partir de los eventos y genera la sanción cuando se registra una tarjeta con jugador.
- Las vistas de posiciones y goleadores solo contabilizan partidos con estado `finalizado`.
- La función `manejar_nuevo_usuario()` crea un perfil: el primer usuario recibe rol de administrador si todavía no existe uno; los siguientes se crean como espectadores.

## Funciones principales del sistema

### Inicio público

`iniciarIndex()` obtiene equipos, partidos, posiciones y goleadores; dibuja las tablas y permite filtrar por categoría y rama. Las posiciones se ordenan por puntos, diferencia de goles y goles a favor.

### Acceso y sesión

`iniciarSesion()` valida las credenciales mediante Supabase Auth, consulta el perfil y permite entrar al panel solo si el rol es `administrador`. La sesión queda en `localStorage`; `cerrarSesion()` la elimina.

### Planilla y cronómetro

- Los partidos pueden estar programados, en juego, en descanso, en tiempo extra, en penales, finalizados u otros estados contemplados por la base de datos.
- El cronómetro usa segundos guardados y una marca de inicio. La pantalla se actualiza cada segundo y persiste los cambios de estado.
- Al registrar o eliminar un gol, el sistema vuelve a sincronizar el resultado con los eventos del partido.
- Si el segundo tiempo acaba empatado se habilita una prórroga de 10 minutos. Si la prórroga también termina empatada, comienza la tanda de penales.
- La tanda alterna turnos, permite deshacer/reiniciar y conserva los tiros en la base de datos.

### Sanciones

Una tarjeta amarilla o roja asociada a un jugador origina una sanción mediante un trigger. El administrador puede marcar si fue pagada o no y cambiar el estado disciplinario. Las sanciones en estado `suspendida` se reflejan en la selección de capitanes y jugadores de la planilla.

### Reinicio del campeonato

La acción de reinicio elimina los partidos y sus datos dependientes, por lo que la vista de posiciones y goleadores vuelve a calcularse sin esos encuentros. Equipos y jugadores se conservan. La operación requiere confirmación desde el panel y permiso de administrador en la base de datos.

## Configuración y ejecución

### 1. Configurar Supabase

1. Crea un proyecto en Supabase.
2. Abre **SQL Editor** y ejecuta el contenido de [sql/esquema_futsal.sql](./sql/esquema_futsal.sql).
3. Revisa en `js/supabase.js` que `SUPABASE_URL` y `SUPABASE_ANON_KEY` correspondan al proyecto.
4. No coloques una clave `service_role` en el código del navegador. El cliente debe usar la clave pública `anon`; las autorizaciones de escritura dependen de las políticas RLS y del rol autenticado.

El trigger asigna administrador automáticamente al primer usuario creado en un proyecto recién configurado. Si ya hay usuarios, verifica sus perfiles en Supabase y asigna el rol de administrador mediante una cuenta con permisos adecuados. El esquema incluye `public.asignar_admin_por_email(correo)` para esa promoción.

### 2. Ejecutar en local

Inicia un servidor web estático desde la carpeta del proyecto. Por ejemplo:

```powershell
python -m http.server 8000
```

Después abre `http://localhost:8000` en el navegador. También se puede usar Live Server en VS Code. No es necesario ejecutar `npm install`.

### 3. Publicar

El proyecto es estático y contiene una configuración de Vercel en [vercel.json](./vercel.json). Configura el proyecto de publicación para servir la raíz del repositorio y verifica las URL de Supabase antes de desplegar.

## Seguridad y permisos

- Todas las tablas tienen Row Level Security (RLS).
- Las políticas permiten lectura pública; las operaciones de escritura requieren un usuario autenticado cuyo perfil tenga rol de administrador.
- La verificación de rol en la interfaz mejora la experiencia, pero la autorización real la aplica RLS en Supabase.
- La clave `anon` es pública y no sustituye las políticas RLS. Nunca se debe publicar la clave `service_role`.
- La sesión se guarda en `localStorage`; al salir se borra desde la aplicación.

## Guías para estudiar y exponer

- [README_EXPOSICION.md](./README_EXPOSICION.md) contiene el reparto para tres estudiantes, el vocabulario de funciones y una explicación de los módulos.
- [README_PRACTICA.md](./README_PRACTICA.md) detalla cómo presentar la construcción de los botones para eliminar equipos, reiniciar el campeonato e iniciar el tiempo extra.

El cliente técnico [js/supabase.js](./js/supabase.js) es compartido por los módulos y no se asigna como exposición independiente.
