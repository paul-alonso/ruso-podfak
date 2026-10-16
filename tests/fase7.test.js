// PWA: manifest, iconos, etiquetas de iPhone y lista de archivos del service worker.

import { prueba, igual, cierto } from './mini.js';

const PAGINAS = ['index.html', 'lector.html', 'traduccion.html', 'escucha.html', 'flashcards.html', 'ajustes.html'];
const texto = async ruta => {
  const r = await fetch(`../${ruta}`, { cache: 'no-store' });
  cierto(r.ok, `no existe ${ruta} (${r.status})`);
  return r.text();
};

function tamanoImagen(url) {
  return new Promise((resolver, rechazar) => {
    const img = new Image();
    img.onload = () => resolver(`${img.naturalWidth}x${img.naturalHeight}`);
    img.onerror = () => rechazar(new Error(`no se pudo cargar ${url}`));
    img.src = url;
  });
}

prueba('manifest: instalable a pantalla completa, con rutas relativas e iconos del tamaño declarado', async () => {
  const m = JSON.parse(await texto('manifest.json'));
  igual([m.display, m.start_url, m.scope, m.lang], ['standalone', './', './', 'es']);
  cierto(m.name && m.short_name && m.theme_color && m.background_color, 'faltan campos');
  cierto(m.icons.some(i => i.sizes === '192x192') && m.icons.some(i => i.sizes === '512x512' && i.purpose === 'any'), 'faltan iconos 192/512');
  cierto(m.icons.some(i => i.purpose === 'maskable'), 'falta el icono maskable');
  for (const i of m.icons) {
    cierto(!i.src.startsWith('/') && !i.src.includes('://'), `ruta no relativa: ${i.src}`);
    igual(await tamanoImagen(`../${i.src}`), i.sizes, i.src);
  }
  for (const s of m.shortcuts ?? []) await texto(s.url);
});

prueba('páginas: manifest, iconos y etiquetas de iPhone para pantalla completa', async () => {
  for (const p of PAGINAS) {
    const doc = new DOMParser().parseFromString(await texto(p), 'text/html');
    const attr = (sel, a) => doc.querySelector(sel)?.getAttribute(a);
    igual(attr('link[rel="manifest"]', 'href'), 'manifest.json', p);
    igual(attr('meta[name="apple-mobile-web-app-capable"]', 'content'), 'yes', p);
    cierto(attr('meta[name="apple-mobile-web-app-title"]', 'content'), `${p}: falta el título para iPhone`);
    cierto(attr('meta[name="viewport"]', 'content').includes('viewport-fit=cover'), `${p}: viewport-fit`);
    igual(await tamanoImagen(`../${attr('link[rel="apple-touch-icon"]', 'href')}`), '180x180', p);
    // Nada de rutas absolutas: la app vive en /ruso-podfak/ en GitHub Pages.
    for (const el of doc.querySelectorAll('[href], [src]')) {
      const url = el.getAttribute('href') ?? el.getAttribute('src');
      cierto(!url.startsWith('/'), `${p}: ruta absoluta ${url}`);
    }
  }
});

prueba('service worker: todos los archivos de BASE existen y están todas las páginas y módulos', async () => {
  const sw = await texto('sw.js');
  const base = [...sw.match(/const BASE = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  for (const ruta of base) {
    const r = await fetch(new URL(`../${ruta}`, location.href), { cache: 'no-store' });
    cierto(r.ok, `${ruta} está en BASE pero no existe (${r.status})`);
  }
  for (const p of PAGINAS) cierto(base.includes(p), `falta ${p} en BASE`);
  // Cada módulo que importan las páginas (directa o indirectamente) debe estar en BASE.
  const vistos = new Set();
  const pendientes = PAGINAS.map(p => p);
  while (pendientes.length) {
    const ruta = pendientes.pop();
    if (vistos.has(ruta)) continue;
    vistos.add(ruta);
    const contenido = await texto(ruta);
    const dir = ruta.includes('/') ? ruta.slice(0, ruta.lastIndexOf('/') + 1) : '';
    const refs = ruta.endsWith('.html')
      ? [...contenido.matchAll(/<script type="module" src="([^"]+)"/g)].map(m => m[1])
      : [...contenido.matchAll(/from '(\.[^']+)'/g)].map(m => new URL(m[1], `http://x/${dir}`).pathname.slice(1));
    for (const r of refs) {
      cierto(base.includes(r), `${r} (usado por ${ruta}) no está en BASE de sw.js`);
      pendientes.push(r);
    }
  }
});
