// Sincronización opcional del progreso con un Gist secreto de GitHub.
//
// - Conectar: con un token (solo permiso «gist») se busca el Gist de la app
//   (por el nombre del archivo) o se crea.
// - Al abrir la app: se descarga y se combina con lo local (misma lógica que
//   «Combinar» al importar) y se sube el resultado si cambió.
// - Al estudiar: cada cambio marca «pendiente» y se sube tras RETARDO_SUBIDA
//   sin cambios. Antes de subir se vuelve a descargar y combinar.
// - Al salir (visibilitychange → hidden y pagehide; beforeunload no es fiable
//   en iOS) se sube lo pendiente con keepalive, sin descargar antes. Si otro
//   dispositivo había subido algo, no se pierde: ese dispositivo lo vuelve a
//   combinar y subir en su próxima sincronización (todo se une, nada se resta).
// - Sin conexión la app sigue igual; «pendiente» se guarda y se sube al volver.
//
// El token se guarda solo en este dispositivo (clave podfak_sync), nunca en
// el progreso ni en los archivos exportados.

import {
  almacen as almacenApp, combinar, normalizar, leerPaquete, paqueteExportacion,
} from './storage.js';

export const CLAVE_SYNC = 'podfak_sync';
export const ARCHIVO = 'ruso-podfak-progreso.json';
export const URL_CREAR_TOKEN = 'https://github.com/settings/tokens/new?scopes=gist&description=Ruso%20Podfak';
export const RETARDO_SUBIDA = 10000;
const DESCRIPCION = 'Progreso de Ruso Podfak (lo usa la app para sincronizar; no lo borres)';
const API = 'https://api.github.com';
const LIMITE_KEEPALIVE = 60000; // los navegadores limitan keepalive a 64 KB
const REINTENTO_MS = 60000;
const RESINCRONIZAR_AL_VOLVER_MS = 30000;

/** Textos de cada estado (para el indicador y Ajustes). */
export const TEXTOS_ESTADO = {
  desconectado: 'Sin sincronizar',
  sincronizado: 'Sincronizado',
  sincronizando: 'Sincronizando…',
  pendiente: 'Cambios pendientes de subir',
  'sin-conexion': 'Sin conexión: se sincronizará al volver',
  'error-token': 'Error de token: vuelve a conectar',
  error: 'Error al sincronizar: se reintentará',
};

export class ErrorSync extends Error {
  constructor(estado, mensaje, status = null) {
    super(mensaje);
    this.estado = estado;
    this.status = status;
  }
}

/** JSON con las claves ordenadas: dos estados iguales dan el mismo texto. */
export function estable(v) {
  if (Array.isArray(v)) return `[${v.map(estable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${estable(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/** Lo que se compara al sincronizar: todo menos lo propio de cada dispositivo. */
export function contenido(estado) {
  const { ajustes, seleccion, ...resto } = normalizar(estado);
  if (resto.nivelacion) resto.nivelacion = { ...resto.nivelacion, plan: null };
  return estable(resto);
}

const textoGist = estado => JSON.stringify(paqueteExportacion(normalizar(estado)));

/**
 * Solo para las pruebas: tests.html abre la app en iframes y define
 * podfakFetchPrueba (un GitHub simulado) para que nunca se llegue a la red.
 * Fuera de un iframe de la misma web no tiene ningún efecto.
 */
function fetchDePruebas() {
  try {
    return window.parent !== window ? window.parent.podfakFetchPrueba : undefined;
  } catch {
    return undefined; // padre de otro origen
  }
}

export function crearSync({
  almacen = almacenApp,
  backend = globalThis.localStorage,
  fetchFn = (...args) => (fetchDePruebas() ?? globalThis.fetch)(...args),
  retardo = RETARDO_SUBIDA,
  ahora = () => Date.now(),
} = {}) {
  let config = leerConfig(); // { token, gistId, gistUrl, ultimaSync, pendiente, avisoPermisos }
  let estado = !config ? 'desconectado' : config.pendiente ? 'pendiente' : 'sincronizado';
  let detalle = '';
  let temporizador = null;
  let reintento = null;
  let cola = Promise.resolve();
  let cambios = 0;            // cuenta los cambios locales (para no perder los hechos durante una subida)
  let subidaAlSalir = null;
  let iniciado = false;
  const oyentesEstado = new Set();
  const oyentesRemoto = new Set();

  function leerConfig() {
    try {
      const c = JSON.parse(backend.getItem(CLAVE_SYNC));
      return c && typeof c.token === 'string' && typeof c.gistId === 'string' ? c : null;
    } catch {
      return null;
    }
  }

  function guardarConfig() {
    if (config) backend.setItem(CLAVE_SYNC, JSON.stringify(config));
    else backend.removeItem(CLAVE_SYNC);
  }

  function info() {
    return {
      estado, detalle, texto: TEXTOS_ESTADO[estado], conectado: Boolean(config),
      ultimaSync: config?.ultimaSync ?? null, gistUrl: config?.gistUrl ?? null,
      avisoPermisos: config?.avisoPermisos ?? null,
    };
  }

  function fijarEstado(nuevo, texto = '') {
    estado = nuevo;
    detalle = texto;
    oyentesEstado.forEach(fn => fn(info()));
  }

  // -------------------------------------------------------------------------
  // API de GitHub
  // -------------------------------------------------------------------------

  async function api(token, ruta, { method = 'GET', body, keepalive = false } = {}) {
    let r;
    try {
      r = await fetchFn(API + ruta, {
        method,
        keepalive,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ErrorSync('sin-conexion', 'No hay conexión con GitHub.');
    }
    if (r.status === 401) {
      throw new ErrorSync('error-token', 'GitHub no acepta el token: puede estar mal copiado, caducado o revocado.', 401);
    }
    if (r.status === 403 && r.headers.get('x-ratelimit-remaining') === '0') {
      throw new ErrorSync('error', 'Demasiadas peticiones a GitHub; se reintentará más tarde.', 403);
    }
    if (!r.ok) throw new ErrorSync(r.status === 404 ? 'no-encontrado' : 'error', `GitHub respondió ${r.status}.`, r.status);
    return r;
  }

  /** Busca el Gist de la app entre los del usuario. Devuelve { gist, scopes }. */
  async function buscarGist(token) {
    let scopes = null;
    for (let pagina = 1; pagina <= 10; pagina++) {
      const r = await api(token, `/gists?per_page=100&page=${pagina}`);
      if (pagina === 1) scopes = r.headers.get('x-oauth-scopes');
      const lista = await r.json();
      const gist = lista.find(g => g.files && Object.hasOwn(g.files, ARCHIVO));
      if (gist || lista.length < 100) return { gist: gist ?? null, scopes };
    }
    return { gist: null, scopes };
  }

  async function crearGist(token, estadoLocal) {
    try {
      const r = await api(token, '/gists', {
        method: 'POST',
        body: { description: DESCRIPCION, public: false, files: { [ARCHIVO]: { content: textoGist(estadoLocal) } } },
      });
      return await r.json();
    } catch (e) {
      // Sin el permiso «gist», GitHub responde 404 (o 403) al crear.
      if (e.status === 404 || e.status === 403) {
        throw new ErrorSync('error-token', 'El token no tiene el permiso «gist». Crea uno marcando solo «gist».', e.status);
      }
      throw e;
    }
  }

  /** Progreso guardado en el Gist, o null si no hay (o no es válido y se puede pisar). */
  async function descargar(c) {
    const gist = await (await api(c.token, `/gists/${c.gistId}`)).json();
    const archivo = gist.files?.[ARCHIVO];
    if (!archivo) return null;
    let texto = archivo.content;
    if (archivo.truncated || typeof texto !== 'string') {
      try {
        texto = await (await fetchFn(archivo.raw_url, { cache: 'no-store' })).text();
      } catch {
        throw new ErrorSync('sin-conexion', 'No hay conexión con GitHub.');
      }
    }
    const { progreso, error } = leerPaquete(texto);
    if (error && error.includes('versión')) throw new ErrorSync('error', `El Gist es de otra versión de la app. ${error}`);
    if (error) {
      console.warn('El Gist no tiene un progreso válido; se sustituirá por el local.', error);
      return null;
    }
    return progreso;
  }

  async function subir(c, estadoLocal, { keepalive = false } = {}) {
    const body = { files: { [ARCHIVO]: { content: textoGist(estadoLocal) } } };
    const usarKeepalive = keepalive && JSON.stringify(body).length < LIMITE_KEEPALIVE;
    try {
      await api(c.token, `/gists/${c.gistId}`, { method: 'PATCH', body, keepalive: usarKeepalive });
    } catch (e) {
      // Algunos navegadores no admiten keepalive con la petición previa CORS: se reintenta sin él.
      if (!usarKeepalive || e.estado !== 'sin-conexion') throw e;
      await api(c.token, `/gists/${c.gistId}`, { method: 'PATCH', body });
    }
  }

  /** Descarga; si el Gist ya no existe, lo busca o lo vuelve a crear. */
  async function descargarORecuperar() {
    try {
      return await descargar(config);
    } catch (e) {
      if (e.estado !== 'no-encontrado') throw e;
      const { gist } = await buscarGist(config.token);
      const g = gist ?? await crearGist(config.token, almacen.leer());
      config.gistId = g.id;
      config.gistUrl = g.html_url;
      guardarConfig();
      return gist ? descargar(config) : almacen.leer();
    }
  }

  // -------------------------------------------------------------------------
  // Sincronizar
  // -------------------------------------------------------------------------

  function manejarError(e) {
    if (!(e instanceof ErrorSync)) {
      console.error(e);
      e = new ErrorSync('error', e?.message ?? String(e));
    }
    if (!config) return { error: e };
    const visible = e.estado === 'no-encontrado' ? 'error' : e.estado;
    fijarEstado(visible, e.message);
    if (visible === 'error') {
      clearTimeout(reintento);
      reintento = setTimeout(() => sincronizar(), REINTENTO_MS);
    }
    return { error: e };
  }

  /** Descarga, combina y sube si hace falta. Devuelve { cambioLocal } o { error }. */
  function sincronizar() {
    cola = cola.then(async () => {
      if (!config) return { cambioLocal: false };
      clearTimeout(temporizador);
      temporizador = null;
      const cambiosAlEmpezar = cambios;
      fijarEstado('sincronizando');
      try {
        const remoto = await descargarORecuperar();
        const local = almacen.leer();
        const fusion = remoto ? combinar(local, remoto) : local;
        const cambioLocal = contenido(fusion) !== contenido(local);
        if (cambioLocal) almacen.guardarSincronizado(fusion);
        if (!remoto || contenido(fusion) !== contenido(remoto)) await subir(config, fusion);

        config.ultimaSync = ahora();
        // Si se estudió mientras tanto, sigue pendiente.
        config.pendiente = cambios !== cambiosAlEmpezar;
        guardarConfig();
        if (config.pendiente) programarTemporizador();
        fijarEstado(config.pendiente ? 'pendiente' : 'sincronizado');
        if (cambioLocal) oyentesRemoto.forEach(fn => fn());
        return { cambioLocal };
      } catch (e) {
        return manejarError(e);
      }
    });
    return cola;
  }

  function programarTemporizador() {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => sincronizar(), retardo);
  }

  /** Tras cada cambio local: marca pendiente y sube cuando pase `retardo` sin cambios. */
  function programarSubida() {
    if (!config) return;
    cambios++;
    if (!config.pendiente) {
      config.pendiente = true;
      guardarConfig();
    }
    if (!['sin-conexion', 'error-token', 'sincronizando'].includes(estado)) fijarEstado('pendiente');
    if (estado !== 'error-token') programarTemporizador();
  }

  /** Al ocultar o cerrar la página: sube lo pendiente ya, con keepalive y sin descargar antes. */
  function subirAlSalir() {
    if (!config?.pendiente || estado === 'error-token' || subidaAlSalir) return subidaAlSalir;
    clearTimeout(temporizador);
    temporizador = null;
    const c = config;
    const cambiosAlEmpezar = cambios;
    subidaAlSalir = subir(c, almacen.leer(), { keepalive: true })
      .then(() => {
        if (config !== c) return;
        config.ultimaSync = ahora();
        config.pendiente = cambios !== cambiosAlEmpezar;
        guardarConfig();
        fijarEstado(config.pendiente ? 'pendiente' : 'sincronizado');
      })
      .catch(manejarError)
      .finally(() => { subidaAlSalir = null; });
    return subidaAlSalir;
  }

  async function conectar(tokenEscrito) {
    const token = tokenEscrito.trim();
    if (!token) throw new ErrorSync('error-token', 'Pega el token de GitHub.');
    if (/\s/.test(token)) throw new ErrorSync('error-token', 'El token no puede tener espacios: revisa que lo copiaste entero.');
    try {
      const { gist, scopes } = await buscarGist(token);
      // Tokens clásicos: GitHub dice sus permisos. Los de grano fino no (scopes = null).
      let avisoPermisos = null;
      if (scopes !== null) {
        const lista = scopes.split(',').map(s => s.trim()).filter(Boolean);
        if (!lista.includes('gist')) {
          throw new ErrorSync('error-token', 'El token no tiene el permiso «gist». Crea uno marcando solo «gist».');
        }
        const sobran = lista.filter(s => s !== 'gist');
        if (sobran.length) {
          avisoPermisos = `Este token tiene más permisos de los necesarios (${sobran.join(', ')}). Funciona, pero es más seguro uno con solo «gist».`;
        }
      }
      const g = gist ?? await crearGist(token, almacen.leer());
      config = { token, gistId: g.id, gistUrl: g.html_url, ultimaSync: null, pendiente: false, avisoPermisos };
      guardarConfig();
    } catch (e) {
      const error = e instanceof ErrorSync ? e : new ErrorSync('error', e?.message ?? String(e));
      fijarEstado('desconectado', error.message);
      throw error;
    }
    // Ya está conectado: si la primera sincronización falla (p. ej. se cortó la
    // red), lo dice el estado y se reintentará; no es un error al conectar.
    return sincronizar();
  }

  function desconectar() {
    clearTimeout(temporizador);
    clearTimeout(reintento);
    config = null;
    guardarConfig();
    fijarEstado('desconectado');
  }

  /** Conecta la sincronización con la página (una vez): cambios, salida, vuelta y conexión. */
  function iniciar() {
    if (iniciado) return;
    iniciado = true;
    almacen.alCambiar(programarSubida);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') subirAlSalir();
      else if (config && (!config.ultimaSync || ahora() - config.ultimaSync > RESINCRONIZAR_AL_VOLVER_MS)) sincronizar();
    });
    window.addEventListener('pagehide', () => subirAlSalir());
    window.addEventListener('online', () => { if (config) sincronizar(); });
    window.addEventListener('offline', () => { if (config) fijarEstado('sin-conexion', 'Sin conexión.'); });
  }

  return {
    info,
    conectado: () => Boolean(config),
    conectar,
    desconectar,
    sincronizar,
    programarSubida,
    subirAlSalir,
    iniciar,
    alCambiarEstado: fn => {
      oyentesEstado.add(fn);
      return () => oyentesEstado.delete(fn);
    },
    /** Avisa cuando una sincronización trae cambios de otro dispositivo. */
    alRecibirRemoto: fn => {
      oyentesRemoto.add(fn);
      return () => oyentesRemoto.delete(fn);
    },
  };
}

export const sync = crearSync();
