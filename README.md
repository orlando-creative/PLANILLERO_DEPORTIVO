# Planillero Oficial de Futsal - U.E. Luz del Mundo A

Sistema web profesional, minimalista y de codigo limpio disenado especificamente para el registro oficial de campeonatos de Futsal escolar e institucional. Incluye mesa de planilla en tiempo real, cronometro de primer y segundo tiempo, registro de goles con autores en cancha, capitanes de equipo, tribunal de disciplina/sanciones y modulo de rendicion de cuentas y control financiero.

---

## 1. Arquitectura del Proyecto

El sistema ha sido estructurado para utilizar la menor cantidad posible de archivos, sin dependencias pesadas de Node/npm, funcionando directamente con estandares nativos web (HTML5, Vanilla CSS y modulos ES de JavaScript).

### Archivos de Interfaz (HTML):
- `index.html`: Pagina principal de acceso publico. Muestra el resumen del campeonato (partidos registrados, goles, equipos), el registro general de partidos jugados con resultados, la tabla de posiciones oficial calculada matematicamente, la tabla de maximos goleadores y filtros por categoria y rama (varones/mujeres).
- `inicio-sesion.html`: Formulario seguro de inicio de sesion para el administrador mediante Supabase Auth.
- `administracion.html`: Panel administrativo privado que contiene la Mesa de Planilla Oficial, el tablero de cronometro digital en tiempo real, registro de incidencias en cancha, programacion de partidos, alta de equipos y jugadores, el modulo de Rendicion de Cuentas y el boton de Reinicio de Campeonato.
- `sanciones.html`: Tribunal de disciplina. Lista los jugadores amonestados con tarjeta amarilla y roja, montos de multa, estado de pago y acciones para suspender o retirar la sancion.
- `reglamento.html`: Reglamento oficial resumido y orientado exclusivamente a las reglas del Futsal.

### Hojas de Estilo (CSS):
- `css/estilos.css`: Hoja de estilos centralizada y responsive para todo el proyecto. Contiene variables de color, diseno de la planilla digital, reloj digital, marcador deportivo y tablas adaptables a moviles.

### Logica de Negocio (JavaScript):
- `js/supabase.js`: Cliente REST nativo y ligero que se comunica directamente con la API de Supabase mediante fetch(). Gestiona lecturas (SELECT), escrituras (INSERT), actualizaciones (PATCH), eliminaciones (DELETE), consultas de finanzas y autenticacion por JWT.
- `js/app.js`: Controlador principal de la aplicacion. Gestiona la navegacion, la logica del cronometro en vivo, marcador, apertura de planilla, registro de incidencias, calculo del balance financiero y renderizado de tablas.

### Base de Datos (SQL):
- `sql/esquema_futsal.sql`: Script SQL completo, blindado e idempotente que crea todas las tablas, vistas, triggers, funciones y politicas de seguridad RLS en PostgreSQL/Supabase.

---

## 2. Modelo de Base de Datos y Supabase

El esquema de base de datos esta compuesto por:

### Tablas Principales:
1. `perfiles`: Almacena el usuario autenticado y su rol (`administrador` o `espectador`).
2. `configuracion_finanzas`: Parametros globales del campeonato (multa por tarjeta amarilla, multa por tarjeta roja, costo base de arbitraje por partido y monto base de inscripcion por equipo).
3. `equipos`: Registro de cursos o equipos (nombre, categoria, rama varones/mujeres, monto de inscripcion y si la inscripcion esta pagada).
4. `jugadores`: Plantilla de jugadores vinculados a cada equipo mediante `equipo_id` con numero de dorsal.
5. `partidos`: Registro de cada encuentro. Almacena fase, fecha/hora, categoria, genero, equipo local, equipo visitante, capitanes designados, goles de cada equipo, costo de arbitraje, estado de pago al arbitro, estado del partido (`programado`, `en_juego`, `descanso`, `finalizado`) y estado del cronometro.
6. `eventos_partido`: Incidencias registradas en cancha (goles, tarjetas amarillas y tarjetas rojas) vinculadas al partido, equipo, jugador que anoto o fue amonestado, periodo (1T o 2T) y segundo exacto de juego.
7. `sanciones`: Tabla disciplinaria generada automaticamente por cada tarjeta amarilla o roja registrada. Contiene el monto de la multa economica, si la multa fue pagada y su estado disciplinario (`pendiente`, `suspendida`, `cumplida`, `retirada`).

### Vistas Calculadas (Views):
- `public.posiciones`: Calcula en tiempo real la tabla de clasificacion de todos los equipos participantes utilizando unicamente los partidos con estado `finalizado`. Genera automaticamente:
  - Partidos Jugados (PJ)
  - Partidos Ganados (PG), Empatados (PE), Perdidos (PP)
  - Goles a Favor (GF), Goles en Contra (GC), Diferencia de Gol (DG)
  - Puntos Totales (Pts: 3 por victoria, 1 por empate, 0 por derrota)
- `public.goleadores`: Agrupa y cuenta los goles anotados por cada jugador en partidos finalizados, ordenandolos de mayor a menor.

### Triggers y Automatizaciones:
- `sincronizar_evento_partido()`: Cada vez que se anota o borra un gol, actualiza de inmediato el marcador de `goles_local` y `goles_visitante` en la tabla de partidos. Asimismo, al registrar una tarjeta amarilla o roja, crea de inmediato la sancion con el monto correspondiente tomado de `configuracion_finanzas`.
- `on_auth_user_created`: Asigna de forma automatica el rol de `administrador` al primer usuario que se registre en Supabase Authentication.

---

## 3. Modulo Financiero y Rendicion de Cuentas

Disenado para que la comision organizadora tenga un control total y transparente del dinero del campeonato:

### A. Tarifas Base del Campeonato:
El administrador puede modificar en cualquier momento las tarifas base desde la pestana "Rendicion de Cuentas":
- Multa por Tarjeta Amarilla (ej. Bs. 10.00)
- Multa por Tarjeta Roja (ej. Bs. 20.00)
- Monto de Inscripcion por Equipo (ej. Bs. 50.00)
- Costo de Arbitraje por Partido (ej. Bs. 30.00)

### B. Control de Inscripciones por Equipo:
- Permite ver la lista completa de equipos inscritos.
- Permite ajustar el monto de inscripcion individual de cualquier equipo y guardarlo.
- Permite registrar con un clic si la inscripcion esta "Pagada" o "Pendiente".

### C. Control de Arbitraje por Partido:
- Al programar cada partido se define el costo de arbitraje del encuentro.
- Tanto en la planilla en vivo como en la rendicion de cuentas, se puede marcar si el arbitraje ya fue "Pagado al Arbitro" o continua "Pendiente".

### D. Balance General en Tiempo Real:
Calcula automaticamente:
- Total Ingresos por Inscripciones (Cobradas y Pendientes).
- Total Ingresos por Multas de Tarjetas (Cobradas y Pendientes).
- Total Egresos por Arbitrajes (Pagados y Pendientes).
- **Saldo Disponible en Caja**:
  `Saldo = (Inscripciones Cobradas + Multas Cobradas) - Arbitrajes Pagados`

---

## 4. Mesa de Planilla Oficial (Control en Vivo)

El administrador cuenta con una planilla digital completa:
- **Marcador en Vivo**: Goles de local y visitante en numeros grandes.
- **Capitanes de Equipo**: Muestra el nombre y dorsal del capitan designado de cada equipo con la insignia `(C) Capitan`.
- **Cronometro de Futsal**:
  - Muestra el tiempo reglamentario de 20 minutos (20:00).
  - Boton "Iniciar / Continuar": arranca el cronometro sincronizado.
  - Boton "Pausar": detiene el cronometro temporalmente.
  - Boton "2do Tiempo (20:00)": reinicia el reloj a 20:00 y cambia el periodo a segundo tiempo.
  - Boton "Finalizar Partido": consolida el resultado final y actualiza las posiciones del torneo.
- **Registro en Cancha**: Selector rapido de incidencia (Gol, Amarilla o Roja), seleccion del equipo y del jugador que realizo la accion en cancha. Guarda el segundo exacto del partido.
- **Historial de Incidencias**: Lista cronologica con boton para eliminar incidencias en caso de anotacion erronea.

---

## 5. Reinicio del Campeonato (Comenzar Nuevo Torneo)

En la pestana "Registro de Partidos" del panel de administracion se encuentra el boton:
**"Reiniciar Campeonato (Eliminar Partidos)"**

Al confirmarlo:
1. Se eliminan todos los partidos disputados de la base de datos.
2. Por eliminacion en cascada (`ON DELETE CASCADE`), se borran todos los goles, tarjetas y sanciones de dichos partidos.
3. La tabla de posiciones y goleadores queda en cero.
4. **Se conservan todos los equipos y jugadores inscritos**, listos para disputar el nuevo torneo sin tener que volver a registrarlos.

---

## 6. Puesta en Marcha Paso a Paso

### Paso 1: Ejecutar el Script en Supabase
1. Ingresa a tu proyecto en [Supabase](https://supabase.com).
2. Ve al menu lateral izquierdo y selecciona **SQL Editor**.
3. Copia todo el contenido del archivo `sql/esquema_futsal.sql`.
4. Pegalo en el editor y presiona el boton **Run**.
5. El script se ejecutara limpiamente creando todas las tablas, politicas de seguridad RLS y funciones.

### Paso 2: Crear el Usuario Administrador
1. En Supabase, ve a **Authentication** -> **Users**.
2. Haz clic en **Add User** -> **Create User**.
3. Ingresa tu correo electronico (ej. `admin@colegio.edu`) y una contrasena segura.
4. Al crearlo, el trigger automatico le asignara el rol de `administrador`.
5. *(Opcional)* Si ya tenias un usuario creado y deseas asegurarte de que sea admin, corre en SQL Editor:
   ```sql
   SELECT public.asignar_admin_por_email('tu-correo@ejemplo.com');
   ```

### Paso 3: Abrir la Aplicacion
1. Abre `inicio-sesion.html` en tu navegador.
2. Ingresa con tu correo y contrasena de administrador.
3. Ya tienes acceso total a la Mesa de Planilla, registro de partidos y rendicion de cuentas.

---

## 7. Ejecucion Local

Dado que el proyecto utiliza modulos estandares de JavaScript (ES Modules):
- Sirve la carpeta con cualquier servidor HTTP local (por ejemplo la extension **Live Server** de VS Code, o corriendo en la terminal `npx serve` o `python -m http.server 8000`).
- No abras los archivos mediante el protocolo `file://`, ya que los navegadores bloquean la carga de modulos JavaScript locales por politicas de seguridad CORS.
# PLANILLERO_DEPORTIVO
