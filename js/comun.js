// Estructura común de todas las páginas: cabecera con el selector de clases,
// navegación inferior, carga de datos, aviso de clases con errores, aviso de
// voz rusa y registro del service worker.

import { cargarIndice, cargarClases, nombreClase, fechaCorta, tituloClase } from './data.js';
import { almacen } from './storage.js';
import { estadoVoz } from './tts.js';
import { sync } from './sync.js';

// ---------------------------------------------------------------------------
// Utilidades de DOM
// ---------------------------------------------------------------------------

/** Crea un elemento: h('button', { class: 'x', onclick: fn }, 'texto', otroNodo). */
export function h(etiqueta, props = {}, ...hijos) {
  const el = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...hijos.flat(Infinity).filter(c => c != null && c !== false && c !== 0));
  return el;
}

const TRAZOS = {
  libro: '<path d="M12 6.5C10 5 7.5 4.5 4 4.5v14c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2v-14c-3.5 0-6 .5-8 2z"/><path d="M12 6.5v14"/>',
  lapiz: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-4-4L4 16z"/><path d="M14 6l4 4"/>',
  auriculares: '<path d="M4 16v-4a8 8 0 0 1 16 0v4"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/>',
  tarjetas: '<rect x="3" y="8" width="13" height="12" rx="2"/><path d="M8 4h11a2 2 0 0 1 2 2v10"/>',
  altavoz: '<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  cerrar: '<path d="M6 6l12 12M18 6L6 18"/>',
  abajo: '<path d="M6 9l6 6 6-6"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};

export function icono(nombre) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icono');
  svg.innerHTML = TRAZOS[nombre];
  return svg;
}

export const tieneCirilico = s => /\p{Script=Cyrillic}/u.test(s);

// ---------------------------------------------------------------------------
// Instalación como app
// ---------------------------------------------------------------------------

// Chrome/Edge/Android avisan una sola vez, al cargar, de que la app se puede
// instalar: se guarda el aviso para ofrecer el botón en Ajustes.
let avisoInstalar = null;
window.addEventListener('beforeinstallprompt', e => { avisoInstalar = e; });
window.addEventListener('appinstalled', () => { avisoInstalar = null; });

/**
 * 'instalada' (abierta desde la pantalla de inicio, a pantalla completa),
 * 'disponible' (se puede instalar con un botón), 'ios' (Safari de iPhone/iPad:
 * se instala a mano) o 'manual'.
 */
export function estadoInstalacion() {
  if (matchMedia('(display-mode: standalone)').matches || navigator.standalone === true) return 'instalada';
  if (avisoInstalar) return 'disponible';
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios ? 'ios' : 'manual';
}

/** Muestra el diálogo de instalación del navegador. Devuelve true si se aceptó. */
export async function instalar() {
  if (!avisoInstalar) return false;
  const aviso = avisoInstalar;
  avisoInstalar = null;
  await aviso.prompt();
  return (await aviso.userChoice).outcome === 'accepted';
}

// ---------------------------------------------------------------------------
// Nombres y selección de clases
// ---------------------------------------------------------------------------

// Los nombres y títulos de clase viven en data.js (los usa también validar.html).
export { nombreClase, fechaCorta, tituloClase };

const RE_CLASE = /^clase_(\d+)(?:_(.+))?$/;

export function etiquetaSeleccion(ids) {
  if (!ids.length) return 'Sin clases';
  if (ids.length === 1) return nombreClase(ids[0]);
  const num = id => RE_CLASE.exec(id)?.[1] ?? id;
  return `Clases ${Number(num(ids[0]))}–${Number(num(ids.at(-1)))}`;
}

/**
 * Ids (en orden del índice) que cubre la selección guardada. Si la selección
 * no existe o ya no es válida, se usa `porDefecto` (la última clase válida).
 */
export function rangoSeleccion(ids, seleccion, porDefecto = ids.at(-1)) {
  let i = seleccion ? ids.indexOf(seleccion.desde) : -1;
  let j = seleccion ? ids.indexOf(seleccion.hasta) : -1;
  if (i === -1 || j === -1) i = j = ids.indexOf(porDefecto);
  if (i === -1) return [];
  if (i > j) [i, j] = [j, i];
  return ids.slice(i, j + 1);
}

export function fechaLegible(fecha) {
  if (!fecha) return 'sin fecha';
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

async function cargarDatos() {
  const { indice, informe: informeIndice } = await cargarIndice();
  const { clases, informes } = await cargarClases(indice);
  // Primera definición de cada palabra del vocabulario, con la clase que la define.
  const vocabulario = new Map();
  const vocabPorRu = new Map();
  for (const c of clases) {
    for (const v of c.vocabulario) {
      const entrada = { ...v, clase: c.id };
      if (!vocabulario.has(v.id)) vocabulario.set(v.id, entrada);
      if (!vocabPorRu.has(v.ru)) vocabPorRu.set(v.ru, entrada);
    }
  }
  return { indice, informeIndice, clases, informes, vocabulario, vocabPorRu, porId: new Map(clases.map(c => [c.id, c])) };
}

function avisoErrores({ informeIndice, informes }) {
  const conErrores = [informeIndice, ...informes].filter(i => !i.ok);
  if (!conErrores.length) return null;

  const sinIndice = informeIndice.errores.some(p => p.ruta === '(archivo)');
  const nClases = informes.filter(i => !i.ok).length;
  const partes = [];
  if (sinIndice) partes.push('No se pudo leer la lista de clases (data/index.json).');
  else if (!informeIndice.ok) partes.push('data/index.json tiene entradas con errores.');
  if (nClases) partes.push(`${nClases === 1 ? '1 clase no se pudo cargar' : `${nClases} clases no se pudieron cargar`}; las demás funcionan con normalidad.`);

  const MAX = 8;
  const lineas = conErrores.flatMap(inf => {
    const l = inf.errores.slice(0, MAX).map(p => `${inf.origen} → ${p.ruta}: ${p.mensaje}`);
    if (inf.errores.length > MAX) l.push(`${inf.origen}: … y ${inf.errores.length - MAX} errores más`);
    return l;
  });
  return h('div', { class: 'aviso error', role: 'alert' },
    h('p', {}, h('strong', {}, partes.join(' '))),
    h('details', {},
      h('summary', {}, 'Ver qué falla'),
      h('ul', { class: 'lista-errores' }, lineas.map(l => h('li', {}, l))),
      h('p', {}, h('a', { href: 'validar.html' }, 'Abrir el validador'), ' para ver el informe completo.')));
}

/** Aviso con instrucciones si no hay voz rusa. Devuelve null si la voz está bien. */
export async function avisoVoz() {
  const estado = await estadoVoz();
  if (estado === 'ok') return null;
  const titulo = {
    'no-soportado': 'Este navegador no puede leer en voz alta. Usa Chrome o Edge.',
    'sin-voz': 'No hay ninguna voz rusa instalada: el audio puede no sonar.',
    desconocido: '¿No oyes el audio? Puede que falte la voz rusa.',
  }[estado];
  return h('details', { class: 'aviso aviso-voz' },
    h('summary', {}, titulo),
    h('ul', {},
      h('li', {}, h('strong', {}, 'Android: '), 'Ajustes → Sistema → Idiomas y entrada → Salida de texto a voz → motor «Servicios de voz de Google» → ⚙ → Instalar datos de voz → Ruso. Después cierra y abre Chrome.'),
      h('li', {}, h('strong', {}, 'Windows: '), 'Configuración → Hora e idioma → Voz → Agregar voces → Ruso. Después reinicia el navegador. (Edge ya trae voces rusas en línea.)'),
      h('li', {}, h('strong', {}, 'iPhone / iPad: '), 'Ajustes → Accesibilidad → Contenido leído → Voces → Ruso.')));
}

// ---------------------------------------------------------------------------
// Cabecera, navegación y selector
// ---------------------------------------------------------------------------

const PESTANAS = [
  { pagina: 'lector', href: 'lector.html', texto: 'Lector', icono: 'libro' },
  { pagina: 'traducir', href: 'traduccion.html', texto: 'Traducir', icono: 'lapiz' },
  { pagina: 'escuchar', href: 'escucha.html', texto: 'Escuchar', icono: 'auriculares' },
  { pagina: 'tarjetas', href: 'flashcards.html', texto: 'Tarjetas', icono: 'tarjetas' },
];

/** Enlace a Ajustes con un punto que indica el estado de la sincronización. */
function enlaceAjustes(pagina) {
  const enlace = h('a', { class: 'enlace-ajustes', href: 'ajustes.html', 'aria-current': pagina === 'ajustes' ? 'page' : null },
    icono('ajustes'), h('span', { class: 'punto-sync', 'aria-hidden': 'true' }));
  const pintar = ({ estado, texto, conectado }) => {
    enlace.dataset.sync = estado;
    const titulo = conectado ? `Ajustes · Sincronización: ${texto}` : 'Ajustes';
    enlace.setAttribute('aria-label', titulo);
    enlace.title = titulo;
  };
  pintar(sync.info());
  sync.alCambiarEstado(pintar);
  return enlace;
}

function montarCabecera(pagina) {
  const texto = h('span', { class: 'selector-texto' }, '…');
  const boton = h('button', { type: 'button', class: 'selector-clase', 'aria-haspopup': 'dialog', disabled: true },
    texto, icono('abajo'));
  document.body.prepend(h('header', { class: 'cabecera' },
    h('a', { class: 'marca', href: 'index.html' }, 'Podfak ', h('span', { lang: 'ru' }, 'РКИ')),
    h('div', { class: 'cabecera-derecha' }, enlaceAjustes(pagina), boton)));
  return { boton, texto };
}

function montarNavegacion(pagina) {
  document.body.append(h('nav', { class: 'pestanas', 'aria-label': 'Herramientas' },
    PESTANAS.map(p => h('a', { href: p.href, 'aria-current': p.pagina === pagina ? 'page' : null },
      icono(p.icono), h('span', {}, p.texto)))));
}

/** Diálogo inferior (bottom sheet) que se cierra al tocar fuera. */
export function crearHoja(etiqueta) {
  const dlg = h('dialog', { class: 'hoja', 'aria-label': etiqueta });
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg);
  return dlg;
}

/**
 * Clases del índice agrupadas por урок (de menor a mayor), manteniendo su
 * orden dentro de cada grupo: [[urok, [{ c, valida }]], …]. Se usan los datos
 * de la clase si es válida (tiene tema_corto, fecha…) y si no, los del índice.
 */
export function gruposPorUrok({ indice, porId }) {
  const grupos = new Map();
  for (const e of indice) {
    const c = porId.get(e.id) ?? e;
    if (!grupos.has(c.urok)) grupos.set(c.urok, []);
    grupos.get(c.urok).push({ c, valida: porId.has(e.id) });
  }
  return [...grupos].sort(([a], [b]) => a - b);
}

function abrirSelector(datos, idsActuales, alAplicar) {
  const dlg = crearHoja('Elegir clases');
  dlg.addEventListener('close', () => dlg.remove());
  const opciones = () => gruposPorUrok(datos).map(([urok, clases]) => h('optgroup', { label: `Урок ${urok}` },
    clases.map(({ c, valida }) => h('option', { value: c.id },
      `${tituloClase(c, { urok: false })}${valida ? '' : ' (con errores)'}`))));
  const desde = h('select', { id: 'sel-desde' }, opciones());
  const hasta = h('select', { id: 'sel-hasta' }, opciones());
  desde.value = idsActuales[0];
  hasta.value = idsActuales.at(-1);
  // Con grupos por урок el orden de las opciones no es el de las clases: el
  // rango se compara por la posición en el índice.
  const ids = datos.indice.map(e => e.id);
  const pos = sel => ids.indexOf(sel.value);
  desde.addEventListener('change', () => { if (pos(desde) > pos(hasta)) hasta.value = desde.value; });
  hasta.addEventListener('change', () => { if (pos(hasta) < pos(desde)) desde.value = hasta.value; });

  const ultima = datos.clases.at(-1)?.id;
  const fijar = (a, b) => { desde.value = a; hasta.value = b; };
  dlg.append(h('div', { class: 'hoja-contenido' },
    h('div', { class: 'hoja-cabeza' },
      h('h2', {}, 'Elegir clases'),
      h('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', onclick: () => dlg.close() }, icono('cerrar'))),
    h('p', { class: 'sub' }, 'Una sola clase (Desde = Hasta) o un rango para repasar varias. Se recuerda en todas las herramientas.'),
    h('label', { class: 'campo', for: 'sel-desde' }, 'Desde'), desde,
    h('label', { class: 'campo', for: 'sel-hasta' }, 'Hasta'), hasta,
    h('div', { class: 'acciones' },
      ultima && h('button', { type: 'button', class: 'boton', onclick: () => fijar(ultima, ultima) }, 'Solo la última'),
      h('button', { type: 'button', class: 'boton', onclick: () => fijar(datos.indice[0].id, datos.indice.at(-1).id) }, 'Todas')),
    h('button', { type: 'button', class: 'boton primario ancho', onclick: () => { alAplicar(desde.value, hasta.value); dlg.close(); } }, 'Aplicar')));
  dlg.showModal();
}

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const registrar = () => navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service worker:', e));
  if (document.readyState === 'complete') registrar();
  else window.addEventListener('load', registrar);
}

/**
 * Monta la página y llama a `renderizar(ctx, contenedor)` con los datos
 * cargados, y de nuevo cada vez que cambia la selección de clases.
 *
 * ctx: { indice, clases, porId, vocabulario, vocabPorRu, idsSeleccion,
 *        seleccion, cambiarSeleccion(desde, hasta), abrirSelector(), redibujar() }
 */
export async function iniciarPagina({ pagina, renderizar }) {
  registrarServiceWorker();
  const main = document.querySelector('main');
  const cabecera = montarCabecera(pagina);
  montarNavegacion(pagina);

  // Sincronización: se descarga a la vez que se cargan las clases y se espera
  // un poco para pintar ya con lo combinado; si llega más tarde, se avisa.
  sync.iniciar();
  const sincronizando = sync.conectado() ? sync.sincronizar() : null;
  let pintada = false;
  sync.alRecibirRemoto(() => {
    if (!pintada) return;
    if (pagina === 'inicio' || pagina === 'ajustes') dibujar();
    else avisarRemoto();
  });
  const avisarRemoto = () => {
    if (main.querySelector('.aviso-remoto')) return;
    main.prepend(h('p', { class: 'aviso aviso-remoto', role: 'status' }, 'Llegó progreso de otro dispositivo. ',
      h('button', { type: 'button', class: 'boton enlace', onclick: () => dibujar() }, 'Actualizar')));
  };

  const datos = await cargarDatos();
  if (sincronizando) await Promise.race([sincronizando, new Promise(r => setTimeout(r, 1500))]);
  const ids = datos.indice.map(e => e.id);
  const aviso = avisoErrores(datos);

  const dibujar = () => {
    const idsSeleccion = rangoSeleccion(ids, almacen.seleccion(), datos.clases.at(-1)?.id);
    const ctx = {
      ...datos,
      idsSeleccion,
      seleccion: idsSeleccion.map(id => datos.porId.get(id)).filter(Boolean),
      cambiarSeleccion: (desde, hasta) => { almacen.fijarSeleccion(desde, hasta); dibujar(); },
      redibujar: () => dibujar(),
      abrirSelector: () => abrirSelector(datos, idsSeleccion, ctx.cambiarSeleccion),
    };
    cabecera.texto.textContent = etiquetaSeleccion(idsSeleccion);
    cabecera.boton.disabled = !ids.length;
    cabecera.boton.onclick = ctx.abrirSelector;
    const cuerpo = h('div', { class: 'cuerpo' });
    main.replaceChildren(...[aviso, cuerpo].filter(Boolean));
    renderizar(ctx, cuerpo);
  };
  dibujar();
  pintada = true;
}
