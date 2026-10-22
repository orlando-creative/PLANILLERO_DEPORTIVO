# Guía de exposición: base de datos y Supabase

Guía detallada para presentar la base de datos del Planillero de Futsal entre tres personas. Está basada en la implementación de [sql/esquema_futsal.sql](./sql/esquema_futsal.sql), el cliente web [js/supabase.js](./js/supabase.js) y los módulos que consultan esos datos.

## Objetivo de la exposición

Explicar cómo la aplicación guarda y consulta la información del campeonato, cómo se relacionan sus tablas, cómo se generan automáticamente resultados y sanciones, y cómo se controla el acceso administrativo.

### Reparto sugerido

| Expositor | Tema principal | Contenido adicional |
|---|---|---|
| **Persona 1** | Cliente [js/supabase.js](./js/supabase.js) | API REST, operaciones CRUD, comunicación con la interfaz, errores y seguridad general |
| **Persona 2** | Estructura de la base de datos | Tablas, vistas, claves, relaciones, automatizaciones, mapeo entre pantallas y datos |
| **Persona 3** | Autenticación y usuarios | Supabase Auth, creación de usuarios, perfiles, roles, inicio/cierre de sesión y RLS |

**Duración orientativa:** 4 a 6 minutos por persona, más una demostración conjunta. Se recomienda que cada expositor presente su tema y luego conecte su explicación con el tema de la siguiente persona.

## Introducción para iniciar

> Nuestro sistema es un planillero web de futsal. La información persistente se almacena en PostgreSQL, dentro de Supabase. JavaScript se comunica con esa base mediante la API REST de Supabase. Las tablas guardan la información original; las claves foráneas conectan los registros; las funciones y los triggers automatizan tareas; y las políticas RLS autorizan o bloquean operaciones según el usuario.

### Recorrido de un dato

1. Una persona interactúa con una pantalla, por ejemplo, agrega un jugador o registra un gol.
2. El módulo JavaScript de esa pantalla valida la acción y llama una función del cliente compartido `supabase.js`.
3. `supabase.js` envía una petición HTTP a Supabase, con los datos y la autenticación correspondiente.
4. Supabase verifica la petición y aplica las reglas RLS antes de leer o cambiar una fila.
5. PostgreSQL almacena el cambio y, cuando corresponde, ejecuta automatizaciones y mantiene las relaciones.
6. La respuesta vuelve a JavaScript, que actualiza la pantalla o muestra un error.

---

## Persona 1 — `supabase.js`: conexión y operaciones con los datos

**Archivo principal:** [js/supabase.js](./js/supabase.js)

### ¿Qué responsabilidad tiene?

`supabase.js` concentra la comunicación entre la aplicación web y Supabase. Los otros módulos no necesitan construir cada solicitud HTTP por su cuenta: importan funciones compartidas para leer, insertar, actualizar o eliminar información. El mismo archivo gestiona la sesión que el navegador conserva y contiene el proceso de inicio de sesión administrativa.

El proyecto usa `fetch` directamente contra la API REST de Supabase; este archivo funciona como un cliente pequeño y compartido. No es una copia de la base de datos ni sustituye a PostgreSQL: traduce las operaciones de la aplicación a peticiones que Supabase entiende.

### Dirección del proyecto y clave pública

El archivo contiene la URL del proyecto y la clave pública `anon`, necesarias para dirigir las peticiones al proyecto Supabase correcto. La clave `anon` puede estar en una aplicación de navegador; **no** es una contraseña de administrador. La protección de los datos depende de las políticas RLS y de que nunca se publique una clave secreta `service_role`.

### Funciones de sesión y permisos locales

| Función | Qué hace |
|---|---|
| `obtenerSesion()` | Lee de `localStorage` la sesión JSON guardada con la clave `futsal_auth_sesion`. Si no hay sesión válida o no se puede interpretar el contenido, devuelve `null`. |
| `obtenerUsuario()` | Devuelve los datos de usuario guardados en la sesión o `null` si no existe sesión. |
| `esAdmin()` | Comprueba si el objeto de usuario tiene `rol === 'administrador'`. Se utiliza para adaptar la interfaz. |
| `cerrarSesion()` | Quita la sesión de `localStorage` y redirige a `index.html`. En la implementación actual no llama al endpoint remoto de cierre de sesión de Auth. |

La comprobación `esAdmin()` es útil para mostrar u ocultar controles, pero no constituye la barrera definitiva de seguridad: una persona podría alterar el JavaScript o el almacenamiento local. Supabase vuelve a comprobar los permisos en el servidor con RLS.

### Cabeceras de las solicitudes

La función interna `headers()` prepara las cabeceras que usa la API REST:

- `apikey`: identifica el proyecto y la clave pública de la aplicación.
- `Authorization`: usa el token de acceso de la sesión cuando está disponible; para las lecturas públicas puede usar la clave pública.
- `Content-Type`: indica que los datos enviados tienen formato JSON.
- `Prefer: return=representation`: solicita que las operaciones de escritura devuelvan los registros afectados, cuando la API lo permite.

El token de acceso representa una sesión autenticada. La clave pública, por sí sola, no otorga permisos de administrador.

### Las cuatro operaciones de datos

Estas operaciones corresponden al CRUD: crear, leer, actualizar y eliminar.

| Función JavaScript | Verbo HTTP / operación | Qué hace en este proyecto |
|---|---|---|
| `leer(tabla, campoOrden)` | `GET` / `SELECT` | Consulta los registros de una tabla o vista. Solicita sus columnas y opcionalmente ordena de forma descendente por el campo indicado. |
| `guardar(tabla, datos)` | `POST` / `INSERT` | Inserta un objeto o una lista de objetos. Si recibe un solo objeto, lo envuelve en una lista JSON para enviarlo. |
| `actualizar(tabla, id, datos)` | `PATCH` / `UPDATE` | Cambia los campos enviados para el registro cuyo `id` coincide con el identificador indicado. |
| `borrar(tabla, id)` | `DELETE` / `DELETE` | Elimina el registro cuyo `id` coincide. Las claves foráneas de PostgreSQL determinan qué información dependiente también se elimina. |

Los verbos HTTP son métodos del protocolo de comunicación; `SELECT`, `INSERT`, `UPDATE` y `DELETE` son operaciones equivalentes del lenguaje SQL. `POST` no significa automáticamente “guardar” en todas las API, pero aquí se usa para insertar y para autenticar según el endpoint llamado.

#### Ejemplos del recorrido en la aplicación

- La pantalla pública lee `equipos`, `partidos`, `posiciones` y `goleadores`.
- La administración lee `equipos`, `jugadores`, `partidos` y `sanciones`.
- La programación crea un partido con `guardar('partidos', ...)`, edita sus datos con `actualizar(...)` o lo elimina con `borrar(...)`.
- La planilla registra goles y tarjetas en `eventos_partido`. Al guardar un evento, el trigger SQL actualiza el marcador y puede generar una sanción.
- La gestión de equipos registra equipos en `equipos` y jugadores en `jugadores`.

### Errores y respuesta del servidor

Después de cada petición, el cliente revisa `res.ok`, que indica si el servidor respondió con un estado HTTP exitoso. Si la petición falla, trata de leer el mensaje de error de Supabase y lanza una excepción; los módulos de interfaz pueden capturarla con `try/catch` y mostrarla.

Un error puede indicar, por ejemplo, que no se tiene permiso RLS, que un valor infringe una restricción, que no existe el registro indicado o que faltan datos obligatorios. La respuesta HTTP también incluye un código de estado, como `401` para falta de autenticación o `403` para acceso denegado, aunque el cliente utiliza principalmente el mensaje descriptivo.

### Reinicio de campeonato: precaución especial

`reiniciarCampeonato()` envía un `DELETE` a `partidos` con un filtro diseñado para abarcar los partidos existentes. Al borrar partidos, PostgreSQL elimina también los eventos y las sanciones relacionadas mediante las reglas de cascada. **No borra equipos ni jugadores.** La interfaz pide confirmación antes de llamar a esta operación.

El esquema SQL también define la función `public.reiniciar_campeonato()`, que incluye una comprobación de administrador. Sin embargo, la función JavaScript actual realiza el borrado mediante la API REST de `partidos`; la protección en esa ruta viene de la política RLS para administradores.

### Guion breve para explicar

> `supabase.js` es la puerta de comunicación entre la página y Supabase. Los módulos llaman a `leer`, `guardar`, `actualizar` y `borrar`, y el cliente convierte esas acciones en peticiones `GET`, `POST`, `PATCH` y `DELETE`. La sesión proporciona un token para las peticiones administrativas. La pantalla puede comprobar el rol para mostrar botones, pero la autorización real se aplica en Supabase con RLS. Si una petición falla, el cliente devuelve un error para que la interfaz pueda comunicarlo.

**Transición a la persona 2:** “Ya vimos cómo llega una petición a Supabase. Ahora veremos dónde se guardan esos datos y cómo están conectados.”

**Pregunta posible:** Si el navegador tiene la clave `anon`, ¿cualquier persona puede modificar la base de datos?

**Respuesta:** No debería. La clave identifica el proyecto, pero las políticas RLS controlan qué puede hacer cada rol. En este esquema la lectura es pública y las operaciones de escritura requieren una sesión autenticada con perfil de administrador.

---

## Persona 2 — Tablas, relaciones, vistas y mapeo de datos

**Archivo principal:** [sql/esquema_futsal.sql](./sql/esquema_futsal.sql)

### Mapa general del modelo

```text
auth.users
    │ 1 a 1 (el perfil usa el mismo UUID)
    ▼
perfiles

equipos ── 1 a muchos ── jugadores
   │                         │
   │                         ├── capitanes referenciados por partidos
   │                         └── sanciones
   │
   ├── 1 a muchos ── partidos (como equipo local)
   ├── 1 a muchos ── partidos (como equipo visitante)
   └── 1 a muchos ── eventos_partido

partidos ── 1 a muchos ── eventos_partido ── 0 o 1 ── sanciones
    │                          │
    └── alimenta posiciones    └── goles alimentan goleadores
```

Una relación **uno a muchos** significa que un registro principal puede vincularse con varios registros dependientes: por ejemplo, un equipo tiene varios jugadores. Una clave foránea guarda el identificador del registro relacionado y hace que PostgreSQL valide que la relación exista.

### Tablas principales

| Tabla | Qué representa y qué información importante guarda |
|---|---|
| `perfiles` | Perfil de aplicación vinculado con una cuenta de `auth.users`. Su clave primaria `usuario_id` es también una clave foránea al usuario de Supabase Auth. Guarda `nombre`, `rol` (`administrador` o `espectador`) y `creado_en`. No guarda contraseñas. |
| `configuracion_finanzas` | Configuración global de multas y cobros: `multa_amarilla`, `multa_roja`, `costo_arbitraje`, `monto_inscripcion` y `actualizado_en`. La restricción `CHECK (id = 1)` limita la configuración a una fila identificada por `id = 1`. El script crea esa fila inicial si todavía no existe. |
| `equipos` | Datos de cada equipo: `nombre`, `categoria`, `genero`, `monto_inscripcion`, `inscripcion_pagada`, `activo` y `creado_en`. El género solo permite `varones` o `mujeres`; nombre, categoría y género deben ser únicos en conjunto. |
| `jugadores` | Plantilla de cada equipo: `equipo_id`, `nombre`, `dorsal`, `activo` y `creado_en`. El dorsal, si se informa, debe estar entre 1 y 99; no se repite el mismo dorsal dentro de un equipo. |
| `partidos` | Programación y acta resumida: fase, fecha y hora, categoría, género, equipos local y visitante, capitanes, goles, estado, periodo, reloj, tanda de penales y pagos de arbitraje. Contiene dos claves foráneas a `equipos` (local y visitante), y puede referenciar a dos capitanes de `jugadores`. |
| `eventos_partido` | Incidencias individuales del partido: gol o tarjeta amarilla/roja, equipo y jugador relacionados, periodo, segundo del partido y fecha de creación. Cada evento pertenece a un partido y a un equipo; el jugador puede quedar sin asignar. |
| `sanciones` | Deuda o consecuencia disciplinaria asociada a una tarjeta: evento, partido, jugador, tarjeta, monto, pago, estado, nota y fecha. Su `evento_id` es único: como máximo se genera una sanción por evento. |

### Claves, reglas y restricciones importantes

- **UUID:** identificador único empleado como clave primaria en la mayoría de las tablas. Los UUID nuevos se generan con `gen_random_uuid()`.
- **Clave primaria (PK):** identifica de manera única una fila. Por ejemplo, `equipos.id`.
- **Clave foránea (FK):** enlaza con una clave primaria de otra tabla. Por ejemplo, `jugadores.equipo_id` enlaza con `equipos.id`.
- **`NOT NULL`:** exige un valor, como el nombre del equipo o el equipo de un jugador.
- **`DEFAULT`:** asigna un valor automáticamente cuando no se indica otro, por ejemplo `activo = true`.
- **`CHECK`:** limita los valores aceptados, por ejemplo, los estados permitidos del partido o que sus dos equipos sean distintos.
- **`UNIQUE`:** impide duplicados. Puede aplicarse a una columna o a una combinación, como `(equipo_id, dorsal)`.
- **`ON DELETE CASCADE`:** al borrar la fila principal, PostgreSQL elimina filas dependientes relacionadas.
- **`ON DELETE SET NULL`:** al borrar la fila referenciada, conserva la fila dependiente y deja en `NULL` su referencia opcional.

En `partidos`, por ejemplo, los dos equipos son obligatorios y no pueden ser el mismo equipo. El marcador no puede ser negativo; el periodo está limitado a 1–4 y el reloj no puede tener segundos negativos. Los estados permitidos son `programado`, `en_juego`, `descanso`, `finalizado`, `suspendido`, `postergado`, `tiempo_extra` y `penales`.

### Relaciones y comportamiento al eliminar

1. **Usuario → perfil:** `perfiles.usuario_id` referencia `auth.users.id`. Si se elimina una cuenta de Auth, su perfil se elimina por cascada.
2. **Equipo → jugadores:** cada jugador requiere un equipo. Al eliminar el equipo, se eliminan sus jugadores.
3. **Equipo → partidos:** cada partido tiene un equipo local y uno visitante. Al eliminar cualquiera de esos equipos, los partidos que lo referencian se eliminan por cascada.
4. **Jugador → capitán:** las referencias de capitanes en partidos son opcionales. Si se elimina el jugador, el partido permanece y el campo del capitán queda en `NULL`.
5. **Partido → eventos:** cada evento pertenece a un partido. Al eliminar el partido, se eliminan sus eventos.
6. **Jugador/equipo → evento:** el evento referencia al equipo; si se elimina el equipo, desaparecen los eventos de ese equipo. La referencia al jugador es opcional y queda en `NULL` si se elimina el jugador.
7. **Evento/partido/jugador → sanción:** una sanción depende de un evento, partido y jugador. Si se elimina cualquiera de esos registros relacionados, la sanción se elimina en cascada.

Por estas dependencias, borrar un equipo puede tener más consecuencias que borrar su fila: también puede retirar jugadores, partidos y datos derivados de esos partidos. Por eso la interfaz debe confirmar una eliminación y la base debe aplicar las reglas de integridad correspondientes.

### Vistas: datos calculados para mostrar

Una **vista** es una consulta SQL guardada que se presenta como una fuente de lectura. No se usa aquí para introducir resultados manuales: calcula información desde las tablas relacionadas.

- **`posiciones`:** forma estadísticas para equipos activos a partir de partidos finalizados. Calcula partidos jugados (`pj`), ganados (`pg`), empatados (`pe`), perdidos (`pp`), goles a favor (`gf`), goles en contra (`gc`), diferencia (`dg`) y puntos (`pts`). Asigna 3 puntos por victoria, 1 por empate y 0 por derrota. Incluye equipos sin partidos con valores en cero.
- **`goleadores`:** cuenta los eventos de tipo `gol` asociados a jugadores en partidos finalizados. También devuelve nombre y dorsal del jugador, equipo, categoría y género.

Ambas vistas se definen con `security_invoker = true`, por lo que la lectura aplica los permisos del usuario que consulta. Los resultados se recalculan a partir de las tablas; no son una copia independiente que deba actualizarse manualmente.

### Funciones y trigger: automatizaciones de PostgreSQL

Un **trigger** es una acción automática que PostgreSQL ejecuta cuando ocurre un evento sobre una tabla.

#### Sincronización del marcador y sanciones

El trigger `evento_actualiza_partido` se ejecuta después de insertar, actualizar o eliminar filas en `eventos_partido`. Llama a `sincronizar_evento_partido()`, que:

1. Identifica el partido afectado.
2. Cuenta los eventos `gol` de cada equipo en ese partido.
3. Actualiza `goles_local` y `goles_visitante` de la tabla `partidos`.
4. Si se inserta una tarjeta amarilla o roja que tiene jugador, busca su multa en `configuracion_finanzas`.
5. Crea una fila `sanciones` en estado `pendiente` y sin pagar.

Esta automatización hace que el marcador se derive del registro de goles y no dependa solamente de que una pantalla incremente manualmente el resultado. Si se elimina un gol, el trigger vuelve a contar los goles y actualiza el marcador. La sanción se crea al insertar una tarjeta con jugador; si la tarjeta no tiene jugador, no hay sanción que asociar.

#### Perfiles al crear usuarios

El trigger `on_auth_user_created` se ejecuta después de insertar una cuenta en `auth.users`. Llama a `manejar_nuevo_usuario()`, que crea el perfil relacionado. El primer usuario recibe rol `administrador` si todavía no existe un perfil con ese rol; los usuarios siguientes reciben rol `espectador`.

#### Otras funciones SQL

- `es_administrador()` comprueba si el usuario autenticado (`auth.uid()`) tiene perfil con rol de administrador.
- `asignar_admin_por_email(correo)` permite a una persona autorizada promover a administrador un usuario que ya existe. Si no encuentra el correo devuelve un mensaje indicándolo.
- `reiniciar_campeonato()` elimina los partidos y verifica el rol antes de hacerlo. Al eliminarlos se activan las cascadas de sus eventos y sanciones.

### Mapeo: de las pantallas a las tablas y vistas

| Parte de la aplicación | Tablas o vistas que consulta/modifica | Ejemplo de datos |
|---|---|---|
| Inicio público | Lee `equipos`, `partidos`, `posiciones` y `goleadores`. | Filtros por categoría y género, calendario, tabla de posiciones y goleadores. |
| Gestión de equipos | Lee y modifica `equipos`; lee, agrega y modifica `jugadores`. | Inscripción pagada, nombre de equipo, plantilla y dorsal. |
| Programación de partidos | Lee equipos y jugadores; crea, modifica o elimina `partidos`. | Fecha, fase, categoría, equipos y capitanes. |
| Planilla en vivo | Lee `eventos_partido`; inserta o elimina incidencias; actualiza campos de `partidos`. | Goles, tarjetas, periodo, reloj, estado, pagos y tiros de penales. |
| Página de sanciones | Lee `sanciones` junto con jugadores, equipos y partidos; modifica el pago o estado de la sanción. | Multa, tarjeta, si fue pagada y si está pendiente o cumplida. |
| Acceso administrativo | Supabase Auth autentica; la aplicación consulta `perfiles`. | El rol y el nombre asociados a `auth.users.id`. |

### Guion breve para explicar

> Las tablas almacenan los datos del torneo y las claves foráneas describen sus relaciones. Un equipo tiene jugadores y partidos; cada partido tiene eventos; y algunas tarjetas originan sanciones. Las vistas calculan posiciones y goleadores desde esos datos. Además, un trigger mantiene el marcador sincronizado y puede crear multas automáticamente. Así evitamos duplicar cálculos en distintas pantallas.

**Transición a la persona 3:** “El esquema también relaciona cada cuenta autenticada con un perfil y un rol. Ahora veremos cómo se crea esa cuenta y cómo se comprueba el permiso.”

**Pregunta posible:** ¿Por qué registrar cada gol como un evento si el partido ya tiene un marcador?

**Respuesta:** El evento conserva el detalle del acta (quién, equipo, periodo y momento). El trigger cuenta esos eventos para mantener el marcador. La vista `goleadores` también usa esos mismos registros para elaborar las estadísticas individuales.

---

## Persona 3 — Autenticación, alta de usuarios y perfiles

### Dos piezas distintas: cuenta y perfil

La autenticación se divide en dos conceptos:

- **`auth.users`:** tabla administrada por Supabase Auth. Guarda las cuentas y credenciales de autenticación. La aplicación no debe leer ni almacenar contraseñas en la tabla `perfiles`.
- **`public.perfiles`:** tabla propia del proyecto. Guarda información de aplicación, como nombre y rol, y usa `usuario_id` como clave primaria y referencia a `auth.users.id`.

La contraseña se entrega al endpoint de autenticación de Supabase por HTTPS; no se guarda en `localStorage` ni en `perfiles`. El perfil permite que el sistema relacione una cuenta válida con permisos propios del campeonato.

### ¿Cómo se crea un usuario?

La implementación descrita aquí **no incluye un formulario de registro ni una función `signUp`** en el sitio. El formulario de [inicio-sesion.html](./inicio-sesion.html) sirve para iniciar sesión con correo y contraseña; no crea una cuenta.

En una instalación nueva, una persona responsable crea la cuenta desde las herramientas de administración de Supabase Auth (o mediante un flujo de alta seguro que se habilite aparte). Cuando Auth inserta la cuenta en `auth.users`, el trigger `on_auth_user_created` crea automáticamente el perfil correspondiente:

1. Comprueba si ya existe un perfil de administrador.
2. Si no existe, asigna el rol `administrador` al primer usuario.
3. Si ya existe un administrador, asigna el rol `espectador` al nuevo usuario.
4. Obtiene el nombre desde los metadatos de Auth cuando se suministra; como alternativa utiliza la parte del correo anterior a `@`.

Este comportamiento del primer usuario facilita la preparación inicial del proyecto, pero requiere controlar quién crea esa primera cuenta. Para despliegues existentes se debe revisar y asignar el rol deliberadamente, en lugar de asumir que una nueva cuenta será administradora.

### Flujo de inicio de sesión

1. La persona introduce su correo y contraseña en `inicio-sesion.html`.
2. La página llama a `iniciarSesion(email, password)` en `supabase.js`.
3. La función normaliza el correo (quita espacios al principio/final y lo pasa a minúsculas) y solicita a Supabase Auth iniciar sesión mediante el flujo de contraseña.
4. Supabase valida las credenciales y devuelve los datos de usuario y un `access_token`.
5. Con ese token, la aplicación consulta `perfiles` para obtener `rol` y `nombre`.
6. Si el perfil no existe o no contiene rol `administrador`, la aplicación rechaza el acceso administrativo.
7. Si el rol es administrador, guarda localmente la sesión con los datos de usuario enriquecidos con rol y nombre; luego la página redirige a `administracion.html`.

En el código, cuando falta un perfil legible, se toma `espectador` como rol predeterminado y se deniega el acceso al panel. No se debe interpretar el mensaje de éxito de Auth como aprobación administrativa: la aplicación exige además un perfil con rol `administrador`.

### Flujo de cierre de sesión

La acción de salir llama a `cerrarSesion()`, que borra `futsal_auth_sesion` de `localStorage` y vuelve a `index.html`. En el estado actual no invoca el endpoint remoto de cierre de sesión de Supabase Auth; por tanto, la explicación debe distinguir entre borrar la sesión que conserva esta aplicación y solicitar la revocación de una sesión al servidor.

### Roles y autorización real

- **`administrador`:** puede utilizar las funciones de gestión del campeonato, sujeto a las políticas RLS.
- **`espectador`:** cuenta autenticada que no recibe permisos administrativos de escritura.
- **`anon`:** rol de solicitudes públicas no autenticadas.
- **`authenticated`:** rol de solicitudes que incluyen una sesión autenticada válida.

RLS (Row Level Security o seguridad a nivel de fila) está habilitada en las siete tablas públicas. El esquema define políticas para permitir `SELECT` a los roles `anon` y `authenticated`, y políticas de modificación para `authenticated` que exigen que `es_administrador()` sea verdadero. Así, la lectura puede ser pública, pero las escrituras están restringidas a administradores.

La interfaz usa `esAdmin()` para mostrar u ocultar opciones. La base de datos usa RLS y `es_administrador()` para tomar la decisión de seguridad en el servidor. **La segunda comprobación es la que protege realmente los datos**, ya que el navegador no es un entorno confiable.

### Promoción de un usuario a administrador

Si ya existe un usuario y hace falta concederle el rol de administrador, se debe utilizar el mecanismo autorizado `public.asignar_admin_por_email(correo)` desde una sesión con permisos adecuados, siguiendo la política de acceso del proyecto. La función busca el correo en `auth.users` y crea o actualiza su fila en `perfiles`. El correo debe corresponder a una cuenta que ya exista.

No se debe convertir un usuario en administrador editando solo el estado visual de la página o el contenido de `localStorage`: eso no cambia el rol en la base de datos y RLS seguirá denegando las operaciones protegidas.

### Recomendaciones de seguridad para mencionar

- No publicar la clave `service_role` ni usarla desde código que se descarga al navegador.
- Tratar la clave `anon` como pública y mantener políticas RLS correctas.
- No guardar contraseñas en el perfil, en archivos del sitio ni en `localStorage`.
- Verificar rol en el servidor mediante RLS para cada operación protegida.
- Limitar quién puede crear usuarios durante la configuración inicial, porque el primer perfil puede recibir el rol de administrador.
- Para mejorar el cierre de sesión, una versión futura podría invocar el cierre de sesión de Auth además de quitar los datos locales.

### Guion breve para explicar

> Supabase Auth administra la cuenta y valida la contraseña. Nuestra tabla `perfiles` no guarda credenciales: conecta el UUID de Auth con el nombre y el rol del campeonato. Al crear una cuenta, un trigger crea su perfil; al iniciar sesión, el sitio consulta el perfil y deja entrar al panel solo al administrador. La interfaz oculta controles para otros roles, pero RLS vuelve a comprobar el permiso en la base de datos.

**Pregunta posible:** Si una persona cambia `rol` en el navegador, ¿se convierte en administradora?

**Respuesta:** No. Ese cambio solo altera lo que ve localmente. Las políticas RLS consultan el perfil real de la base de datos y rechazan las operaciones si el usuario autenticado no es administrador.

---

## Demostración conjunta sugerida

Utilicen datos de prueba o un proyecto de demostración. No eliminen información real de un campeonato.

1. **Persona 1:** mostrar la pantalla pública y explicar que los módulos llaman a `leer()` para obtener tablas y vistas. Abrir el código de `supabase.js` y señalar `leer`, `guardar`, `actualizar` y `borrar`.
2. **Persona 2:** enseñar un equipo con jugadores y un partido; seguir las relaciones hasta sus eventos. Explicar que al registrar un gol se almacena un evento y PostgreSQL recalcula el marcador.
3. **Persona 3:** mostrar el formulario de acceso y explicar que no es un formulario de registro. Indicar dónde consultar `auth.users` y `perfiles` en Supabase y cómo se evalúa el rol.
4. Si el entorno lo permite, registrar una tarjeta de prueba asociada a un jugador y mostrar la sanción creada automáticamente. No es necesario probar borrados para explicar cascadas.
5. Cerrar mostrando las vistas `posiciones` y `goleadores` y explicar qué tablas alimentan sus resultados.

### Secuencia de la demostración de un gol

```text
Acción en planilla
  → guardar('eventos_partido', incidencia)
  → INSERT en eventos_partido (API REST / POST)
  → trigger evento_actualiza_partido
  → recuento de goles por equipo
  → UPDATE de goles_local y goles_visitante
  → interfaz vuelve a leer o presenta el marcador actualizado
```

Para una tarjeta con jugador, la misma inserción puede generar además una fila en `sanciones`. No se debe insertar manualmente una sanción duplicada para esa misma tarjeta.

---

## Vocabulario de conceptos clave

| Concepto | Explicación | Ejemplo en este proyecto |
|---|---|---|
| **Base de datos** | Sistema persistente que organiza la información y permite consultarla y modificarla. | PostgreSQL almacena equipos, partidos, incidencias y sanciones. |
| **PostgreSQL** | Sistema gestor de bases de datos relacional que ejecuta SQL. | Es la base de datos utilizada por Supabase. |
| **Supabase** | Plataforma que ofrece PostgreSQL, autenticación y API para interactuar con el proyecto. | La aplicación llama a Auth y a la API REST del proyecto. |
| **Esquema** | Organización lógica que agrupa objetos de la base, como tablas, vistas y funciones. | Las tablas propias del torneo se encuentran en el esquema `public`. |
| **Tabla** | Estructura de filas y columnas donde se almacenan datos del mismo tipo. | `equipos` contiene un registro por equipo. |
| **Fila / registro** | Una entrada individual de una tabla. | Una fila de `jugadores` representa a un jugador. |
| **Columna / campo** | Una propiedad almacenada para cada fila. | `nombre` es una columna de `equipos`. |
| **Modelo relacional** | Forma de estructurar datos en tablas conectadas mediante claves. | `jugadores.equipo_id` relaciona jugadores con equipos. |
| **PK (Primary Key / clave primaria)** | Columna o combinación de columnas que identifica una fila de forma única. | `equipos.id`. |
| **FK (Foreign Key / clave foránea)** | Columna que referencia una fila de otra tabla y protege la integridad de la relación. | `partidos.equipo_local_id` referencia `equipos.id`. |
| **UUID** | Identificador único de 128 bits, común para referencias entre sistemas. | Se usa como identificador en equipos, jugadores y partidos. |
| **Integridad referencial** | Reglas que evitan referencias a registros inexistentes y definen el efecto de borrar datos relacionados. | Un jugador no puede apuntar a un equipo que no existe. |
| **Relación 1:N** | Un registro del lado “1” puede estar relacionado con muchos del lado “N”. | Un equipo puede tener varios jugadores. |
| **Restricción** | Regla que limita los valores o combinaciones aceptadas. | El dorsal está entre 1 y 99; local y visitante deben ser distintos. |
| **`NOT NULL`** | Regla que exige un valor en una columna. | Un partido siempre debe tener fecha y hora. |
| **`DEFAULT`** | Valor que se asigna si el cliente no proporciona uno. | Un nuevo partido empieza con estado `programado`. |
| **`CHECK`** | Regla que acepta solo valores que cumplan una condición. | El tipo de evento debe ser gol, amarilla o roja. |
| **`UNIQUE`** | Regla que prohíbe duplicados para una columna o grupo de columnas. | Un equipo no puede repetir dorsal dentro de su plantilla. |
| **Cascada (`ON DELETE CASCADE`)** | Elimina automáticamente filas que dependen de la fila principal eliminada. | Al borrar un partido se borran sus eventos. |
| **`SET NULL`** | Deja vacía una referencia dependiente cuando desaparece el registro referenciado. | Al borrar un capitán, el campo de capitán del partido queda nulo. |
| **Vista** | Consulta almacenada que presenta datos calculados de una o varias tablas. | `posiciones` calcula puntos y resultados desde partidos finalizados. |
| **Consulta** | Solicitud para obtener o cambiar información de la base. | Leer la vista de goleadores es una consulta. |
| **SQL** | Lenguaje para definir tablas y consultar o modificar bases de datos relacionales. | El esquema crea tablas, funciones, triggers y políticas con SQL. |
| **API** | Interfaz definida para que un programa solicite operaciones a otro sistema. | La API REST de Supabase expone tablas y vistas. |
| **REST** | Estilo de API que usa recursos y métodos HTTP para interactuar con ellos. | `/rest/v1/equipos` representa el recurso de equipos. |
| **JSON** | Formato de texto estructurado para intercambiar objetos y listas. | El navegador envía los campos de un nuevo equipo en JSON. |
| **HTTP** | Protocolo de comunicación empleado entre el navegador y el servidor. | `fetch` envía solicitudes HTTP a Supabase. |
| **`fetch`** | Función del navegador para realizar solicitudes de red de forma asíncrona. | `supabase.js` usa `fetch` para consultar la API. |
| **Token de acceso (`access_token`)** | Credencial temporal que representa una sesión autenticada ante el servidor. | Se envía en `Authorization` para consultar el perfil tras iniciar sesión. |
| **Autenticación** | Comprobación de la identidad de una persona o cuenta. | Supabase Auth valida correo y contraseña. |
| **Autorización** | Decisión sobre las operaciones que una identidad autenticada puede realizar. | RLS permite escrituras solo al administrador. |
| **Rol** | Categoría de permisos asociada a la cuenta. | `administrador` o `espectador` en `perfiles`. |
| **RLS** | Seguridad a nivel de fila: reglas de PostgreSQL que limitan qué filas y operaciones puede usar cada rol. | Permite lecturas públicas y restringe escrituras a administradores. |
| **Política (`POLICY`)** | Regla RLS que define quién puede ejecutar una operación y bajo qué condición. | `equipos_admin` requiere que `es_administrador()` sea verdadero. |
| **Función SQL** | Código almacenado en la base de datos que puede devolver un valor o realizar operaciones. | `es_administrador()` verifica el rol del usuario actual. |
| **Trigger** | Automatización que ejecuta una función ante una operación de base de datos. | Al guardar una tarjeta con jugador se puede crear una sanción. |
| **Transacción** | Conjunto de operaciones que la base procesa como una unidad coherente. | La inserción de un evento y el efecto de su trigger ocurren en el contexto de la operación de base. |
| **CRUD** | Sigla para Create, Read, Update, Delete: crear, leer, actualizar y eliminar. | `guardar`, `leer`, `actualizar` y `borrar`. |
| **`localStorage`** | Almacenamiento local del navegador que conserva valores entre recargas. | Esta aplicación guarda allí los datos de sesión para reconocer la interfaz administrativa. |
| **`anon`** | Clave/rol público usado para solicitudes no autenticadas en Supabase. | Permite leer datos según las políticas; no es una clave secreta de administrador. |
| **`service_role`** | Clave secreta de alto privilegio que puede omitir controles RLS. | Nunca debe ponerse en JavaScript descargado al navegador. |

## Vocabulario de métodos HTTP: GET, POST, PATCH y DELETE

| Método | Significado práctico | Operación equivalente habitual | Uso aquí |
|---|---|---|---|
| **GET** | Solicita y recibe datos; normalmente no modifica el recurso. | `SELECT` | `leer('equipos')` consulta filas de `equipos`. |
| **POST** | Envía información para crear un recurso o iniciar una acción definida por la API. | `INSERT` (según el endpoint) | `guardar('jugadores', datos)` crea jugadores; iniciar sesión también usa `POST`, pero contra el endpoint de Auth. |
| **PATCH** | Cambia parcialmente un recurso existente, enviando solo campos que se quieren modificar. | `UPDATE` parcial | `actualizar('partidos', id, { estado: 'finalizado' })`. |
| **DELETE** | Solicita eliminar un recurso o las filas que coincidan con un filtro autorizado. | `DELETE` | `borrar('eventos_partido', id)` elimina una incidencia y el trigger sincroniza el marcador. |

Los métodos HTTP no reemplazan las reglas de seguridad. Una petición `DELETE` solo debe afectar los registros que el endpoint y las políticas permiten; RLS y las restricciones de la base siguen siendo obligatorias.

## Cierre sugerido

> La base de datos no es solo un lugar donde guardar información. Su estructura define las relaciones, las restricciones protegen la consistencia, las vistas calculan estadísticas, los triggers automatizan procesos y RLS controla el acceso. `supabase.js` conecta la interfaz con estas capacidades, mientras Auth y `perfiles` distinguen quién inició sesión y qué papel tiene en el campeonato.
