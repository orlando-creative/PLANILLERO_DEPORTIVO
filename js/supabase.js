// ============================================================================
// CLIENTE DIRECTO Y LIGERO DE SUPABASE
// U.E. Luz del Mundo A - Planillero de Futsal
// ============================================================================

// URL principal del proyecto Supabase
export const SUPABASE_URL = 'https://tvcnucxitutpccyumqof.supabase.co';

// Clave publica (Anon Key) para consultas y operaciones autorizadas por RLS
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2Y251Y3hpdHV0cGNjeXVtcW9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NDkwNjAsImV4cCI6MjEwNjIyNTA2MH0.ZxdT5nMRyWvlC_7obn-SmcFRdQtJIxKW_5WNRLI0TJQ';

// Clave utilizada para persistir los datos de sesion en el almacenamiento local del navegador
const CLAVE_SESION = 'futsal_auth_sesion';

/**
 * Obtiene la sesion activa del usuario almacenada en localStorage
 * @returns {Object|null} Objeto con access_token y datos del usuario, o null si no hay sesion
 */
export function obtenerSesion() {
  try {
    // localStorage guarda JSON; se convierte de nuevo a objeto para usar sus propiedades.
    const s = localStorage.getItem(CLAVE_SESION);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

/**
 * Retorna los datos del usuario actualmente autenticado
 * @returns {Object|null} Datos del usuario o null
 */
export function obtenerUsuario() {
  // La sesión puede no existir, por eso se devuelve null en ese caso.
  return obtenerSesion()?.user || null;
}

/**
 * Verifica si el usuario actual tiene el rol de administrador
 * @returns {boolean} true si es administrador, false en caso contrario
 */
export function esAdmin() {
  const u = obtenerUsuario();
  return Boolean(u && u.rol === 'administrador');
}

/**
 * Genera las cabeceras HTTP requeridas por PostgREST para autenticar la peticion
 * @param {string|null} token Token JWT opcional; si no se especifica usa el de la sesion o anonKey
 * @returns {Object} Cabeceras apikey, Authorization y Content-Type
 */
function headers(token = null) {
  const t = token || obtenerSesion()?.access_token || SUPABASE_ANON_KEY;
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${t}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
}

/**
 * Realiza una consulta SELECT a una tabla o vista de Supabase
 * @param {string} tabla Nombre de la tabla o vista
 * @param {string|null} campoOrden Campo por el cual ordenar de manera descendente
 * @returns {Promise<Array>} Lista de registros obtenidos
 */
export async function leer(tabla, campoOrden = null) {
  // PostgREST devuelve todas las columnas; el orden descendente es opcional.
  let url = `${SUPABASE_URL}/rest/v1/${tabla}?select=*`;
  if (campoOrden) url += `&order=${campoOrden}.desc`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    // Convierte el error HTTP en una excepción legible para el módulo que llamó.
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Error al leer ${tabla}`);
  }
  return await res.json();
}

/**
 * Inserta uno o varios registros en una tabla de Supabase (INSERT)
 * @param {string} tabla Nombre de la tabla destino
 * @param {Object|Array} datos Objeto o array de objetos a insertar
 * @returns {Promise<Array>} Registros insertados
 */
export async function guardar(tabla, datos) {
  // La API espera una colección, incluso cuando se inserta un solo objeto.
  const body = Array.isArray(datos) ? datos : [datos];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabla}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Error al guardar en ${tabla}`);
  }
  return await res.json();
}

/**
 * Actualiza un registro existente por su identificador UUID (UPDATE)
 * @param {string} tabla Nombre de la tabla
 * @param {string} id UUID del registro a modificar
 * @param {Object} datos Campos y valores a actualizar
 * @returns {Promise<Array>} Registro actualizado
 */
export async function actualizar(tabla, id, datos) {
  // El filtro por ID limita el PATCH al registro solicitado.
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabla}?id=eq.${id}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify(datos)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Error al actualizar en ${tabla}`);
  }
  return await res.json();
}

/**
 * Elimina un registro de una tabla por su identificador UUID (DELETE)
 * @param {string} tabla Nombre de la tabla
 * @param {string} id UUID del registro a eliminar
 * @returns {Promise<boolean>} true si se elimino correctamente
 */
export async function borrar(tabla, id) {
  // Elimina solo el registro cuyo ID coincide; la base gestiona relaciones en cascada.
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabla}?id=eq.${id}`, {
    method: 'DELETE',
    headers: headers()
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Error al eliminar en ${tabla}`);
  }
  return true;
}

/**
 * Reinicia el campeonato eliminando todos los partidos disputados.
 * Debido a las relaciones en cascada (ON DELETE CASCADE), se eliminan
 * automaticamente los eventos de gol, tarjetas y sanciones asociadas.
 * @returns {Promise<boolean>} true al completar la eliminacion
 */
export async function reiniciarCampeonato() {
  // El filtro neq con un UUID inexistente selecciona todos los partidos.
  const res = await fetch(`${SUPABASE_URL}/rest/v1/partidos?id=neq.00000000-0000-0000-0000-000000000000`, {
    method: 'DELETE',
    headers: headers()
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'No se pudieron reiniciar los partidos.');
  }
  return true;
}

/**
 * Inicia sesion mediante el endpoint oficial de Supabase Auth
 * y comprueba el rol administrativo en la tabla perfiles
 * @param {string} email Correo electronico
 * @param {string} password Contrasena
 * @returns {Promise<Object>} Objeto de sesion autenticada
 */
export async function iniciarSesion(email, password) {
  // Normaliza el correo y solicita a Supabase Auth una sesión con contraseña.
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.message || 'Error de credenciales');

  // Verificar el rol del usuario en la tabla perfiles
  const perfilRes = await fetch(`${SUPABASE_URL}/rest/v1/perfiles?usuario_id=eq.${data.user.id}&select=rol,nombre`, {
    headers: headers(data.access_token)
  });
  const perfiles = await perfilRes.json().catch(() => []);
  const rol = perfiles[0]?.rol || 'espectador';

  // La sesión administrativa no se guarda si el perfil no tiene permisos suficientes.
  if (rol !== 'administrador') {
    throw new Error('Esta cuenta no tiene permisos de administrador.');
  }

  // Guardar sesion enriquecida con el rol en localStorage
  const sesion = { ...data, user: { ...data.user, rol, nombre: perfiles[0]?.nombre || data.user.email } };
  localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
  return sesion;
}

/**
 * Cierra la sesion del usuario y redirige a la pagina de inicio
 */
export function cerrarSesion() {
  // Borra la sesión local antes de regresar a la página pública.
  localStorage.removeItem(CLAVE_SESION);
  window.location.href = 'index.html';
}
