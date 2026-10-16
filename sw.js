// Service worker: la app funciona sin conexión tras la primera carga.
//
// Estrategia «primero la red»: se pide siempre la versión actual (revalidando
// con el servidor, para no mezclar archivos viejos y nuevos tras publicar), así
// las clases nuevas y los cambios se ven enseguida, y se guarda una copia. Sin
// conexión, o si la red tarda más de ESPERA_RED_MS, se usa la copia.
//
// Al instalar se descargan BASE y las clases de data/index.json, porque la
// primera visita ocurre antes de que el service worker controle la página.
// Después, todo lo que se carga (p. ej. una clase nueva) se guarda al vuelo.
// Si cambia BASE, sube la versión de CACHE.
//
// Las peticiones a api.github.com (sincronización) no pasan por aquí.

const CACHE = 'podfak-v9';
const ESPERA_RED_MS = 3000;
const BASE = [
  './',
  'index.html', 'lector.html', 'traduccion.html', 'escucha.html', 'flashcards.html', 'ajustes.html',
  'manifest.json',
  'css/styles.css',
  'js/comun.js', 'js/data.js', 'js/storage.js', 'js/tts.js',
  'js/home.js', 'js/lector.js',
  'js/traduccion.js', 'js/compare.js', 'js/teclado.js',
  'js/escucha.js', 'js/frases.js',
  'js/flashcards.js', 'js/srs.js', 'js/progreso.js',
  'js/ajustes.js', 'js/sync.js',
  'iconos/icono-192.png', 'iconos/icono-512.png', 'iconos/icono-maskable-512.png',
  'iconos/apple-touch-icon.png', 'iconos/favicon-32.png',
  'data/index.json',
];
const FUENTES = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

/**
 * Safari no deja servir a una página una respuesta que vino de una
 * redirección: se guarda una copia «limpia» del contenido.
 */
async function sinRedireccion(resp) {
  if (!resp.redirected) return resp;
  return new Response(await resp.blob(), { status: resp.status, statusText: resp.statusText, headers: resp.headers });
}

async function guardar(cache, clave, resp) {
  await cache.put(clave, await sinRedireccion(resp));
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(BASE.map(async u => {
      const resp = await fetch(new Request(u, { cache: 'reload' }));
      if (!resp.ok) throw new Error(`No se pudo guardar ${u} (${resp.status})`);
      await guardar(cache, u, resp);
    }));
    await guardarClases(cache);
    await self.skipWaiting();
  })());
});

/** Guarda cada clase del índice. Una clase que falte o falle no impide la instalación. */
async function guardarClases(cache) {
  try {
    const indice = await (await cache.match('data/index.json')).json();
    await Promise.all(indice.map(async e => {
      const u = `data/clases/${e.id}.json`;
      try {
        const resp = await fetch(new Request(u, { cache: 'reload' }));
        if (resp.ok) await guardar(cache, u, resp);
      } catch { /* esa clase se guardará cuando se cargue */ }
    }));
  } catch {
    // index.json mal formado: la app ya muestra el error; no hay clases que guardar.
  }
}

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const nombre of await caches.keys()) if (nombre !== CACHE) await caches.delete(nombre);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin === location.origin) e.respondWith(primeroLaRed(e));
  else if (FUENTES.includes(url.origin)) e.respondWith(primeroLaCopia(e.request));
});

async function primeroLaRed(e) {
  const req = e.request;
  const navegacion = req.mode === 'navigate';
  // Las páginas se guardan sin la consulta (?clase=…): es el mismo HTML.
  const clave = navegacion ? req.url.split('?')[0] : req;

  // no-cache: revalida con el servidor aunque el navegador tenga una copia
  // (GitHub Pages permite guardarla 10 minutos).
  const deRed = fetch(req, { cache: 'no-cache' }).then(resp => {
    if (resp.ok) {
      const copia = resp.clone();
      e.waitUntil(caches.open(CACHE).then(c => guardar(c, clave, copia)));
    }
    return resp;
  });
  e.waitUntil(deRed.catch(() => {}));

  const guardada = await caches.match(clave);
  if (!guardada) {
    try {
      return await deRed;
    } catch {
      return (navegacion && await caches.match('index.html')) || Response.error();
    }
  }
  const tiempo = new Promise(r => setTimeout(() => r(guardada), ESPERA_RED_MS));
  const red = deRed.then(resp => (resp.status >= 500 ? guardada : resp), () => guardada);
  return Promise.race([red, tiempo]);
}

async function primeroLaCopia(req) {
  const guardada = await caches.match(req);
  if (guardada) return guardada;
  const resp = await fetch(req);
  if (resp.ok || resp.type === 'opaque') {
    const cache = await caches.open(CACHE);
    await cache.put(req, resp.clone());
  }
  return resp;
}
