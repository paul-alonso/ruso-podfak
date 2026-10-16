// Lector interactivo: los textos de las clases seleccionadas, frase por frase.
// Tocar una palabra abre su ficha; el botón de cada frase la lee en voz alta y
// muestra u oculta su traducción.
//
// Enlace directo a una frase (lo usará Escucha):
//   lector.html?clase=clase_00_ejemplo&frase=t2-f3

import {
  h, icono, iniciarPagina, nombreClase, tituloClase, avisoVoz, crearHoja, tieneCirilico,
} from './comun.js';
import { segmentar, idVocabulario } from './data.js';
import { almacen, VELOCIDADES } from './storage.js';
import { hablar } from './tts.js';

const ajustes = almacen.ajustes();
let enlace = new URLSearchParams(location.search);
let textosRuso = [];  // { el, a, t }: textos que cambian con «Acentos»
let frases = [];      // controladores de cada frase { el, fijar }
let hablando = null;  // elemento de la frase que está sonando
let palabraActiva = null;

const ficha = crearHoja('Ficha de la palabra');
ficha.addEventListener('close', () => palabraActiva?.classList.remove('activa'));

iniciarPagina({ pagina: 'lector', renderizar });

function renderizar(ctx, cont) {
  textosRuso = [];
  frases = [];
  const idEnlace = enlace.get('clase');
  const directa = idEnlace ? ctx.porId.get(idEnlace) : null;
  const clases = directa ? [directa] : ctx.seleccion;

  cont.append(barraControles());
  avisoVoz().then(av => av && cont.prepend(av));

  if (idEnlace) {
    cont.append(directa
      ? h('p', { class: 'aviso' }, `Viendo solo ${nombreClase(directa.id)}. `,
        h('a', { href: 'lector.html' }, 'Volver a tu selección'))
      : h('p', { class: 'aviso error' }, `La clase «${idEnlace}» no existe o tiene errores. Se muestra tu selección.`));
  }
  if (!clases.length) {
    cont.append(h('div', { class: 'tarjeta' },
      h('h1', {}, 'No hay textos para mostrar'),
      h('p', {}, 'Elige otras clases con el botón de arriba, o añade una clase en data/clases/ y en data/index.json.')));
    return;
  }

  for (const c of clases) cont.append(seccionClase(c, ctx));
  aplicarAcentos();

  if (directa && enlace.get('frase')) destacar(`frase-${directa.id}-${enlace.get('frase')}`);
  // El enlace directo vale solo para la primera vista; al cambiar la selección se olvida.
  if (idEnlace) {
    enlace = new URLSearchParams();
    history.replaceState(null, '', 'lector.html');
  }
}

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------

function barraControles() {
  const interruptor = (clave, texto, alCambiar) => {
    const b = h('button', { type: 'button', class: 'interruptor', 'aria-pressed': String(ajustes[clave]) }, texto);
    b.addEventListener('click', () => {
      ajustes[clave] = !ajustes[clave];
      almacen.fijarAjuste(clave, ajustes[clave]);
      b.setAttribute('aria-pressed', String(ajustes[clave]));
      alCambiar?.();
    });
    return b;
  };

  const botonesVelocidad = VELOCIDADES.map(v => h('button', {
    type: 'button',
    'aria-pressed': String(ajustes.velocidad === v),
    onclick: () => {
      ajustes.velocidad = v;
      almacen.fijarAjuste('velocidad', v);
      botonesVelocidad.forEach((b, i) => b.setAttribute('aria-pressed', String(VELOCIDADES[i] === v)));
    },
  }, `${String(v).replace('.', ',')}×`));

  return h('div', { class: 'controles' },
    interruptor('acentos', 'Acentos', aplicarAcentos),
    interruptor('traducciones', 'Todas las traducciones',
      () => frases.forEach(f => f.fijar(ajustes.traducciones ? 'visible' : 'oculta'))),
    interruptor('primeroIntenta', 'Primero intenta'),
    h('div', { class: 'segmentado', role: 'group', 'aria-label': 'Velocidad de la voz' }, botonesVelocidad));
}

function registrarRuso(el, a, t) {
  textosRuso.push({ el, a, t });
  return el;
}

function aplicarAcentos() {
  for (const x of textosRuso) x.el.textContent = ajustes.acentos ? x.a : x.t;
}

function reproducir(texto, el = null) {
  hablando?.classList.remove('hablando');
  hablando = el;
  hablar(texto, {
    velocidad: ajustes.velocidad,
    alEmpezar: () => el?.classList.add('hablando'),
    alTerminar: () => {
      el?.classList.remove('hablando');
      if (hablando === el) hablando = null;
    },
  });
}

const botonEscuchar = (texto, el, etiqueta) => h('button', {
  type: 'button', class: 'boton-icono', 'aria-label': etiqueta, onclick: () => reproducir(texto, el),
}, icono('altavoz'));

// ---------------------------------------------------------------------------
// Clase, gramática y vocabulario
// ---------------------------------------------------------------------------

function seccionClase(c, ctx) {
  const total = c.textos.reduce((n, t) => n + t.frases.length, 0);
  const claves = new Set(c.textos.flatMap(t => t.frases.map(f => `${t.id}/${f.id}`)));
  const vistas = new Set([...almacen.frasesVistas(c.id)].filter(k => claves.has(k)));
  const contador = h('span', { class: 'chip' });
  const pintarContador = () => { contador.textContent = `${vistas.size}/${total} leídas`; };
  pintarContador();

  const marcarVista = (t, f, el) => {
    const clave = `${t.id}/${f.id}`;
    el.classList.add('vista');
    if (vistas.has(clave)) return;
    vistas.add(clave);
    almacen.marcarVista(c.id, clave);
    pintarContador();
  };

  return h('section', { class: 'clase', 'aria-labelledby': `titulo-${c.id}` },
    h('header', { class: 'clase-cabeza' },
      h('h2', { id: `titulo-${c.id}` }, tituloClase(c)),
      // El título completo (si el visible usa tema_corto) y el profesor.
      (c.tema_corto && c.tema_corto !== c.titulo || c.profesor) && h('p', { class: 'sub' },
        [c.tema_corto && c.tema_corto !== c.titulo && c.titulo, c.profesor && `Profesor/a: ${c.profesor}`].filter(Boolean).join(' · ')),
      total > 0 && contador),
    c.gramatica.length > 0 && plegableGramatica(c),
    c.vocabulario.length > 0 && plegableVocabulario(c),
    c.textos.map(t => h('article', { class: 'texto' },
      h('h3', {}, h('span', { lang: tieneCirilico(t.titulo) ? 'ru' : null }, t.titulo), etiquetas(t)),
      t.frases.map(f => crearFrase(c, t, f, ctx, vistas.has(`${t.id}/${f.id}`), marcarVista)))),
    c.textos.length === 0 && h('p', { class: 'sub' }, 'Esta clase no tiene textos.'));
}

/**
 * Etiquetas discretas de procedencia: «Libro» (fuente: "libro") y «Repaso»
 * (repaso: true). «clase» es lo normal y no se marca. `heredada` es la fuente
 * del texto que contiene una frase: si ya es «libro», la frase no la repite.
 */
function etiquetas({ fuente, repaso }, heredada = null) {
  return [
    fuente === 'libro' && heredada !== 'libro' && h('span', { class: 'etiqueta-fuente', title: 'Material del libro' }, 'Libro'),
    repaso === true && h('span', { class: 'etiqueta-fuente repaso', title: 'Repaso de lo visto en clases anteriores' }, 'Repaso'),
  ];
}

function plegableGramatica(c) {
  return h('details', { class: 'plegable' },
    h('summary', {}, `Gramática (${c.gramatica.length})`),
    c.gramatica.map(g => h('div', { class: 'gramatica' },
      h('h4', {}, g.tema, etiquetas(g)),
      h('p', {}, g.explicacion),
      g.ejemplos.length > 0 && h('ul', {}, g.ejemplos.map(e => h('li', {}, e))))));
}

function plegableVocabulario(c) {
  const GENERO = { m: 'masc.', f: 'fem.', n: 'neutro', pl: 'plural' };
  return h('details', { class: 'plegable' },
    h('summary', {}, `Vocabulario (${c.vocabulario.length})`),
    h('ul', { class: 'vocabulario' }, c.vocabulario.map(v => h('li', {},
      botonEscuchar(v.ru, null, `Escuchar «${v.ru}»`),
      h('div', {},
        registrarRuso(h('span', { class: 'vocab-ru', lang: 'ru' }), v.ru_acento, v.ru),
        ` — ${v.es}`,
        h('small', { class: 'sub' }, ' · ', [v.tipo, GENERO[v.genero]].filter(Boolean).join(', ')),
        etiquetas(v),
        v.nota && h('small', { class: 'nota' }, v.nota))))));
}

// ---------------------------------------------------------------------------
// Frases
// ---------------------------------------------------------------------------

function crearFrase(c, t, f, ctx, yaVista, marcarVista) {
  const idDom = `frase-${c.id}-${t.id}-${f.id}`;
  const linea = h('p', { class: 'frase-ru', lang: 'ru' });
  const { segmentos } = segmentar(f.ru, f.tokens.map(tk => tk.t)); // ya validado en data.js
  for (const s of segmentos) {
    if (s.token === undefined) {
      linea.append(s.texto);
      continue;
    }
    const tk = f.tokens[s.token];
    const b = h('button', { type: 'button', class: 'palabra' });
    b.addEventListener('click', () => abrirFicha(tk, c, ctx, b));
    linea.append(registrarRuso(b, tk.a, tk.t));
  }

  const trad = h('div', { class: 'frase-trad', id: `${idDom}-trad`, hidden: true });
  const boton = h('button', {
    type: 'button', class: 'boton-icono boton-frase', 'aria-controls': trad.id, 'aria-expanded': 'false',
    'aria-label': 'Escuchar la frase y mostrar u ocultar su traducción',
  }, icono('altavoz'));
  const el = h('div', { class: yaVista ? 'frase vista' : 'frase', id: idDom }, boton, h('div', { class: 'frase-cuerpo' }, linea, etiquetas(f, t.fuente), trad));

  let estado = 'oculta';
  function fijar(nuevo) {
    estado = nuevo;
    boton.setAttribute('aria-expanded', String(nuevo !== 'oculta'));
    trad.hidden = nuevo === 'oculta';
    const repetir = botonEscuchar(f.ru, el, 'Repetir el audio');
    if (nuevo === 'visible') {
      trad.replaceChildren(h('span', { class: 'traduccion' }, f.es), repetir);
    } else if (nuevo === 'intento') {
      trad.replaceChildren(
        h('span', { class: 'intento' }, '¿Qué significa? Piénsalo y luego…'),
        h('button', { type: 'button', class: 'boton', onclick: () => { fijar('visible'); marcarVista(t, f, el); } }, 'Revelar'),
        repetir);
    }
  }
  boton.addEventListener('click', () => {
    if (estado !== 'oculta') {
      fijar('oculta');
      return;
    }
    if (ajustes.primeroIntenta) fijar('intento');
    else {
      fijar('visible');
      marcarVista(t, f, el);
    }
    reproducir(f.ru, el);
  });

  if (ajustes.traducciones) fijar('visible');
  frases.push({ el, fijar });
  return el;
}

function destacar(idDom) {
  const frase = frases.find(f => f.el.id === idDom);
  if (!frase) return;
  frase.fijar('visible');
  frase.el.classList.add('destacada');
  frase.el.scrollIntoView({ block: 'center' });
}

// ---------------------------------------------------------------------------
// Ficha de palabra
// ---------------------------------------------------------------------------

/** Datos de la tarjeta que se guarda: la palabra del vocabulario o, si no tiene, la forma de la frase. */
function datosTarjeta(tk, vocab, c) {
  if (vocab) {
    return { clave: vocab.id, vocab_id: vocab.id, ru: vocab.ru, ru_acento: vocab.ru_acento, es: vocab.es, clase: vocab.clase };
  }
  const propio = tk.lema[0] !== tk.lema[0].toLowerCase(); // nombres propios: Антон
  const ru = propio ? tk.t : tk.t.toLowerCase();
  return {
    clave: `forma_${idVocabulario(ru).slice(2)}`,
    ru,
    ru_acento: propio ? tk.a : tk.a.toLowerCase(),
    es: tk.es,
    nota: `${tk.gram} · forma base: ${tk.lema}`,
    clase: c.id,
  };
}

const dato = (titulo, ...valor) => [h('dt', {}, titulo), h('dd', {}, ...valor)];

function abrirFicha(tk, c, ctx, boton) {
  const vocab = (tk.vocab_id && ctx.vocabulario.get(tk.vocab_id)) || null;
  const deLema = vocab?.ru === tk.lema ? vocab : ctx.vocabPorRu.get(tk.lema);
  const tarjeta = datosTarjeta(tk, vocab, c);

  const botonTarjeta = h('button', { type: 'button', class: 'boton ancho' });
  const pintarTarjeta = () => {
    const guardada = almacen.tieneTarjeta(tarjeta.clave);
    botonTarjeta.textContent = guardada ? '✓ En tus tarjetas · Quitar' : 'Añadir a flashcards';
    botonTarjeta.classList.toggle('primario', !guardada);
  };
  botonTarjeta.addEventListener('click', () => {
    if (almacen.tieneTarjeta(tarjeta.clave)) almacen.quitarTarjeta(tarjeta.clave);
    else almacen.anadirTarjeta(tarjeta);
    pintarTarjeta();
  });
  pintarTarjeta();

  ficha.replaceChildren(h('div', { class: 'hoja-contenido' },
    h('div', { class: 'hoja-cabeza' },
      h('span', { class: 'ficha-palabra', lang: 'ru' }, tk.a),
      botonEscuchar(tk.t, null, 'Escuchar la palabra'),
      h('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', onclick: () => ficha.close() }, icono('cerrar'))),
    h('dl', { class: 'datos' },
      dato('Traducción', tk.es),
      dato('Forma base', h('span', { lang: 'ru' }, deLema?.ru_acento ?? tk.lema)),
      dato('Gramática', tk.gram),
      vocab && dato(`Vocabulario · ${nombreClase(vocab.clase)}`,
        h('span', { lang: 'ru' }, vocab.ru_acento), ` — ${vocab.es}`,
        vocab.nota && h('small', { class: 'nota' }, vocab.nota))),
    botonTarjeta));

  palabraActiva?.classList.remove('activa');
  palabraActiva = boton;
  boton.classList.add('activa');
  ficha.showModal();
}
