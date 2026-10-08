# Guía práctica: presentar la creación de tres botones

Los botones descritos aquí ya están incorporados en el proyecto. La actividad consiste en explicar y reconstruir su lógica paso a paso durante la exposición, no en volver a añadirla encima del código existente. Para practicar sin alterar la versión funcional, trabajen en una copia temporal, una rama de prueba o expliquen los cambios señalando los puntos de inserción.

## Preparación común

1. Abrir el proyecto desde un servidor web local y entrar al panel como administrador.
2. Identificar primero el elemento HTML, después el listener JavaScript y finalmente la función de datos que persiste el cambio.
3. Explicar el flujo antes de escribir: **control → evento → validación/confirmación → operación de datos → actualización de pantalla → aviso**.
4. Para probar, usar datos de demostración. Nunca ejecutar acciones destructivas contra el campeonato real.
5. Al terminar la demostración, revisar el diff o descartar únicamente la copia/branch temporal. No sobrescribir trabajo ajeno.

## Estudiante 1 — Botón «Eliminar equipo»

**Archivo principal:** [js/app-equipos.js](./js/app-equipos.js)  
**Elemento relacionado:** contenedor `#equipos-registrados` en [administracion.html](./administracion.html).

El botón se crea dentro de la plantilla que construye `render()`. Como cada tarjeta representa un equipo diferente, el botón lleva el ID del equipo en `data-eliminar-equipo`. El listener delegado de `click` identifica cuál tarjeta originó el clic.

### Pasos para construirlo

1. Dentro de la tarjeta renderizada, agregar un `<button type="button">` con el texto **Eliminar equipo** y un atributo de datos que contenga `equipo.id`.
2. Asegurarse de que el contenedor de tarjetas tenga un único listener de clic. Usar `event.target.closest(...)` permite que el botón continúe funcionando aunque se haga clic en un elemento dentro de él.
3. En el listener, reconocer `data-eliminar-equipo` y buscar el equipo correspondiente en `datos().equipos`. Si no existe, detener la operación.
4. Antes de borrar, buscar partidos que incluyan al equipo y explicar al usuario qué información relacionada también podría eliminarse. Pedir confirmación porque la acción no se puede deshacer.
5. Deshabilitar el botón durante la operación y llamar a `borrar('equipos', equipo.id)`. La base de datos elimina jugadores relacionados en cascada; partidos relacionados también pueden desaparecer según las relaciones del esquema.
6. Si el partido activo involucra al equipo, cerrar esa planilla; luego llamar a `cargar()` y mostrar un aviso de éxito. Si falla, mostrar el error y volver a habilitar el botón.

### Cómo probar y qué explicar

- Usar un equipo de demostración con al menos un jugador y, si se quiere mostrar el aviso de dependencias, un partido de prueba.
- Cancelar una primera confirmación para comprobar que no se elimina nada.
- Confirmar solo con datos de prueba y verificar que la lista se vuelve a cargar.
- Explicar `render`, `vincularEventos`, `event.target.closest`, `dataset`, `confirm`, `borrar` y `cargar`.

## Estudiante 2 — Botón «Reiniciar campeonato»

**Archivo principal:** [js/app-partidos.js](./js/app-partidos.js)  
**Elemento HTML:** `#btn-reiniciar-campeonato` en [administracion.html](./administracion.html).  
**Operación de datos:** `reiniciarCampeonato()` en [js/supabase.js](./js/supabase.js).

Este control borra los partidos y los datos dependientes del torneo, pero conserva equipos y jugadores. Es una operación destructiva; durante la exposición basta con explicar el flujo y probarlo en un entorno aislado.

### Pasos para construirlo

1. Añadir un botón de tipo `button` en la pantalla de administración con un ID estable, por ejemplo `btn-reiniciar-campeonato`.
2. En `vincularEventos()`, localizar el botón por su ID y registrar un listener `click`.
3. Mostrar una confirmación que enumere claramente qué se elimina y qué se conserva. Si se cancela, finalizar sin llamar a la base de datos.
4. Crear o reutilizar una función de acceso a datos que elimine los partidos mediante la API de Supabase. No eliminar equipos ni jugadores.
5. Después de completar la operación, cerrar la planilla activa, recargar listas y estadísticas derivadas con `cargar()` y mostrar un mensaje de éxito.
6. Envolver la operación asíncrona en `try/catch` para comunicar errores sin presentar un falso éxito.

### Cómo probar y qué explicar

- No pulsar la confirmación en producción ni en una base con datos que deban conservarse.
- Probar en una base de desarrollo con partidos ficticios; verificar que los partidos desaparecen y los equipos/jugadores siguen allí.
- Explicar `addEventListener`, `confirm`, `async/await`, `reiniciarCampeonato`, `try/catch`, `cerrarPlanilla` y `cargar`.
- Aclarar que la confirmación en la interfaz evita errores accidentales, mientras que los permisos de administrador y RLS protegen la operación en Supabase.

## Estudiante 3 — Botón «Tiempo Extra»

**Archivo principal:** [js/app-planilla.js](./js/app-planilla.js)  
**Elemento HTML:** `#btn-reloj-extra` en [administracion.html](./administracion.html).

El botón no debe iniciar la prórroga en cualquier momento: solo corresponde si el segundo tiempo terminó, el reloj está en cero y el marcador está empatado. Al iniciar, la planilla guarda periodo 3, estado `tiempo_extra`, 600 segundos (10 minutos) y la hora de inicio.

### Pasos para construirlo

1. Añadir un botón con `type="button"` e ID `btn-reloj-extra` al grupo de controles del cronómetro.
2. En `renderizarReloj(...)`, calcular si puede iniciarse la prórroga comprobando partido activo, periodo 2, estado de descanso, reloj en cero y empate; usar ese resultado para habilitar o deshabilitar el botón.
3. En `iniciarAdmin()`, registrar el listener `click` para el botón y repetir las validaciones antes de cambiar datos. La validación del listener protege la operación aunque el estado visual estuviera desactualizado.
4. Pedir confirmación. Si se acepta, detener un intervalo previo, preparar 600 segundos y guardar el estado `tiempo_extra`, el periodo 3 y la marca de inicio mediante `actualizar('partidos', ...)`.
5. Actualizar el partido activo en memoria, iniciar el reloj con `arrancarReloj()`, volver a dibujar el registro y mostrar un aviso.
6. Explicar qué ocurre al terminar la prórroga: si sigue el empate, se pasa a penales; si no, el partido queda en descanso para que el administrador pueda finalizarlo.

### Cómo probar y qué explicar

- Preparar un partido de prueba empatado al final del segundo tiempo, con el reloj en cero.
- Mostrar que el botón se deshabilita si el reloj no terminó o si hay un ganador.
- Con datos de prueba, iniciar la prórroga y verificar periodo, estado y cuenta regresiva.
- Explicar `renderizarReloj`, `segsActuales`, `arrancarReloj`, `actualizar`, `setInterval`, estado del partido y validación de condiciones.

## Lista de verificación final

- El HTML y JavaScript usan exactamente el mismo ID o atributo de datos.
- La acción valida su contexto y muestra errores de forma visible.
- Se deshabilita el control mientras se guarda para evitar envíos repetidos.
- La vista se vuelve a renderizar después de guardar.
- Las pruebas destructivas se hacen solo con información de prueba.
- El grupo puede describir qué datos guarda cada botón y qué datos dependientes afecta.
