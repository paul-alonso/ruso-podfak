// Tarjetas con repaso espaciado: el vocabulario de las clases seleccionadas
// más las palabras añadidas desde el Lector. Modos RU→ES, ES→RU y audio→ES,
// cada uno con su propio calendario de repaso. Atajos: Espacio/Enter para
// mostrar la respuesta y 1–4 para responder.

import { h, icono, iniciarPagina, nombreClase, avisoVoz } from './comun.js';
import {
  mazoDeEstudio, colaDelDia, intercalar, repasar, siguienteIntervalo, textoIntervalo,
  claveEstado, sumarDias, NOTAS, NUEVAS_POR_DIA,
} from './srs.js';
import { almacen, hoy } from './storage.js';
import { hablar } from './tts.js';

const MODOS = [['ru-es', 'RU → ES'], ['es-ru', 'ES → RU'], ['audio-es', [icono('altavoz'), ' → ES']]];
const ETIQUETAS = { otra: 'Otra vez', dificil: 'Difícil', bien: 'Bien', facil: 'Fácil' };
const GENERO = { m: 'masculino', f: 'femenino', n: 'neutro', pl: 'plural' };
const EXTRA = 10;

const ajustes = almacen.ajustes();
let ctxActual = null;
let area = null;
let sesion = null; // { cola, pos, hechas, nuevasRestantes, notas }
let extra = 0;     // nuevas por encima del límite diario pedidas en esta visita
let actual = null; // { revelar(), responder(nota) } de la tarjeta en pantalla

iniciarPagina({ pagina: 'tarjetas', renderizar });

document.addEventListener('keydown', e => {
  if (!actual || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName)) return;
  if ((e.key === ' ' || e.key === 'Enter') && e.target.tagName !== 'BUTTON' && actual.revelar()) {
    e.preventDefault();
  } else if (/^[1-4]$/.test(e.key) && actual.responder(NOTAS[Number(e.key) - 1])) {
    e.preventDefault();
  }
});

function renderizar(ctx, cont) {
  ctxActual = ctx;
  extra = 0;
  area = h('div', { class: 'ejercicio-area' });
  cont.append(h('h1', { class: 'titulo-pagina' }, 'Tarjetas'), controles(), area, seccionAnadidas());
  avisoVoz().then(av => av && cont.prepend(av));
  empezar(false);
}

/** `sonar`: reproducir el audio de la primera tarjeta ya (solo tras un toque). */
function empezar(sonar) {
  const estado = almacen.leer();
  const mazo = mazoDeEstudio({
    seleccion: ctxActual.seleccion, todas: ctxActual.clases, anadidas: estado.tarjetas,
    vocabulario: ctxActual.vocabulario, estados: estado.srs.estados, modo: ajustes.modoTarjetas,
  });
  if (!mazo.length) {
    actual = null;
    area.replaceChildren(h('div', { class: 'tarjeta' },
      h('p', {}, 'No hay tarjetas: las clases elegidas no tienen vocabulario.'),
      h('p', { class: 'sub' }, 'Elige otras clases o añade palabras desde el ',
        h('a', { href: 'lector.html' }, 'Lector'), ' (toca una palabra y pulsa «Añadir a flashcards»).')));
    return;
  }
  const { repasos, nuevas, nuevasRestantes } = colaDelDia(mazo, almacen.estadosSrs(), ajustes.modoTarjetas, hoy(), { extra });
  sesion = {
    mazo, cola: intercalar(repasos, nuevas), pos: 0, hechas: 0, nuevasRestantes,
    notas: Object.fromEntries(NOTAS.map(n => [n, 0])),
  };
  mostrar(sonar);
}

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------

function controles() {
  const botones = MODOS.map(([modo, texto]) => h('button', {
    type: 'button', 'aria-pressed': String(ajustes.modoTarjetas === modo),
    'aria-label': { 'ru-es': 'Ruso a español', 'es-ru': 'Español a ruso', 'audio-es': 'Audio a español' }[modo],
    onclick: () => {
      if (ajustes.modoTarjetas === modo) return;
      ajustes.modoTarjetas = modo;
      almacen.fijarAjuste('modoTarjetas', modo);
      botones.forEach((b, i) => b.setAttribute('aria-pressed', String(MODOS[i][0] === modo)));
      extra = 0;
      empezar(true);
    },
  }, texto));

  const audio = h('button', { type: 'button', class: 'interruptor', 'aria-pressed': String(ajustes.audioAuto) }, 'Audio automático');
  audio.addEventListener('click', () => {
    ajustes.audioAuto = !ajustes.audioAuto;
    almacen.fijarAjuste('audioAuto', ajustes.audioAuto);
    audio.setAttribute('aria-pressed', String(ajustes.audioAuto));
  });

  return h('div', { class: 'controles' },
    h('div', { class: 'segmentado', role: 'group', 'aria-label': 'Modo' }, botones),
    audio);
}

// ---------------------------------------------------------------------------
// Tarjeta
// ---------------------------------------------------------------------------

const ruso = t => (ajustes.acentos && t.ru_acento) || t.ru;
const sonar = t => hablar(t.ru, { velocidad: ajustes.velocidad });
const botonAudio = (t, clase = 'boton-icono') => h('button', {
  type: 'button', class: clase, 'aria-label': `Escuchar «${t.ru}»`, onclick: () => sonar(t),
}, icono('altavoz'));

function descripcion(t) {
  return [t.tipo, GENERO[t.genero]].filter(Boolean).join(', ');
}

function contadores() {
  const estados = almacen.estadosSrs();
  const quedan = sesion.cola.slice(sesion.pos);
  const nuevas = quedan.filter(t => !estados[claveEstado(t.clave, ajustes.modoTarjetas)]).length;
  return h('p', { class: 'marcador' },
    h('span', {}, h('span', { class: 'cuenta-nuevas' }, `Nuevas ${nuevas}`), ' · ',
      h('span', { class: 'cuenta-repasos' }, `Repasos ${quedan.length - nuevas}`)),
    h('span', {}, `Hechas ${sesion.hechas}`));
}

function mostrar(sonarYa) {
  if (sesion.pos >= sesion.cola.length) {
    mostrarFin();
    return;
  }
  const t = sesion.cola[sesion.pos];
  const modo = ajustes.modoTarjetas;
  const clave = claveEstado(t.clave, modo);
  const estado = almacen.estadosSrs()[clave];
  const origen = t.origen === 'lector' ? `${nombreClase(t.clase)} · añadida desde el Lector` : `${nombreClase(t.clase)} · vocabulario`;

  let frente;
  if (modo === 'ru-es') {
    frente = h('div', { class: 'cara' }, h('p', { class: 'tarjeta-ru', lang: 'ru' }, ruso(t)), botonAudio(t));
  } else if (modo === 'es-ru') {
    frente = h('div', { class: 'cara' },
      h('p', { class: 'tarjeta-es' }, t.es),
      descripcion(t) && h('p', { class: 'sub' }, descripcion(t)));
  } else {
    frente = h('div', { class: 'cara' },
      h('button', { type: 'button', class: 'boton boton-oir', onclick: () => sonar(t) }, icono('altavoz'), 'Escuchar'));
  }

  const reverso = h('div', { class: 'reverso', hidden: true },
    modo !== 'ru-es' && h('div', { class: 'cara' }, h('p', { class: 'tarjeta-ru', lang: 'ru' }, ruso(t)), botonAudio(t)),
    modo !== 'es-ru' && h('p', { class: 'tarjeta-es' }, t.es),
    modo !== 'es-ru' && descripcion(t) && h('p', { class: 'sub' }, descripcion(t)),
    t.nota && h('p', { class: 'nota' }, t.nota));

  const separador = h('hr', { class: 'separador', hidden: true });
  const botonRevelar = h('button', { type: 'button', class: 'boton primario ancho', onclick: () => revelar() }, 'Mostrar respuesta');
  const notas = h('div', { class: 'notas', role: 'group', 'aria-label': '¿Cómo te fue?', hidden: true },
    NOTAS.map((n, i) => h('button', { type: 'button', class: `boton nota-${n}`, onclick: () => responder(n) },
      h('strong', {}, ETIQUETAS[n]),
      h('small', {}, `${i + 1} · ${textoIntervalo(siguienteIntervalo(estado, n))}`))));

  let revelada = false;
  let respondida = false;
  function revelar() {
    if (revelada) return false;
    revelada = true;
    reverso.hidden = false;
    separador.hidden = false;
    botonRevelar.hidden = true;
    notas.hidden = false;
    notas.querySelector('.nota-bien').focus({ preventScroll: true });
    if (modo === 'es-ru' && ajustes.audioAuto) sonar(t);
    return true;
  }
  function responder(nota) {
    if (!revelada || respondida) return false;
    respondida = true;
    almacen.guardarRepaso(clave, repasar(estado, nota, hoy()), nota !== 'otra');
    sesion.notas[nota]++;
    sesion.hechas++;
    // «Otra vez»: vuelve a salir dentro de unas tarjetas.
    if (nota === 'otra') sesion.cola.splice(Math.min(sesion.pos + 4, sesion.cola.length), 0, t);
    sesion.pos++;
    mostrar(true);
    return true;
  }
  actual = { revelar, responder };

  area.replaceChildren(
    contadores(),
    h('section', { class: 'tarjeta flashcard', 'aria-label': 'Tarjeta' },
      h('p', { class: 'etiqueta' }, estado ? origen : `Nueva · ${origen}`),
      frente,
      separador,
      reverso,
      botonRevelar,
      notas));

  if (sonarYa && (modo === 'audio-es' || (modo === 'ru-es' && ajustes.audioAuto))) sonar(t);
}

function mostrarFin() {
  actual = null;
  const { mazo, hechas, notas, nuevasRestantes } = sesion;
  const estados = almacen.estadosSrs();
  const manana = sumarDias(hoy(), 1);
  const paraManana = mazo.filter(t => {
    const e = estados[claveEstado(t.clave, ajustes.modoTarjetas)];
    return e && e.vence <= manana;
  }).length;

  area.replaceChildren(h('section', { class: 'tarjeta resumen' },
    h('h2', {}, hechas ? '¡Listo por hoy!' : 'No hay tarjetas pendientes hoy'),
    hechas > 0 && h('p', { class: 'cifra' }, `${hechas}`),
    hechas > 0 && h('p', { class: 'sub' }, NOTAS.filter(n => notas[n]).map(n => `${ETIQUETAS[n]}: ${notas[n]}`).join(' · ')),
    h('p', { class: 'sub' }, paraManana ? `Mañana te esperan ${paraManana === 1 ? '1 tarjeta' : `${paraManana} tarjetas`}.` : 'Mañana no hay repasos pendientes.'),
    nuevasRestantes > 0 && h('div', { class: 'acciones' },
      h('button', {
        type: 'button', class: 'boton primario',
        onclick: () => { extra += EXTRA; empezar(true); },
      }, `Estudiar ${Math.min(EXTRA, nuevasRestantes)} nuevas más`)),
    nuevasRestantes > 0 && h('p', { class: 'sub' }, `Quedan ${nuevasRestantes} sin empezar (máximo ${NUEVAS_POR_DIA} nuevas al día, para no acumular repasos).`)));
  area.querySelector('.resumen .boton')?.focus();
}

// ---------------------------------------------------------------------------
// Palabras añadidas desde el Lector
// ---------------------------------------------------------------------------

function seccionAnadidas() {
  const anadidas = Object.values(almacen.leer().tarjetas);
  const resumen = h('summary', {});
  const pintarResumen = n => { resumen.textContent = `Añadidas desde el Lector (${n})`; };
  pintarResumen(anadidas.length);
  const lista = h('ul', { class: 'vocabulario' }, anadidas.map(t => {
    const li = h('li', {},
      botonAudio(t),
      h('div', {}, h('span', { class: 'vocab-ru', lang: 'ru' }, ruso(t)), ` — ${t.es}`),
      h('button', {
        type: 'button', class: 'boton quitar',
        onclick: () => {
          almacen.quitarTarjeta(t.clave);
          li.remove();
          pintarResumen(lista.children.length);
        },
      }, 'Quitar'));
    return li;
  }));
  return h('details', { class: 'plegable anadidas' }, resumen,
    anadidas.length
      ? [h('p', { class: 'sub' }, 'Salen en tus tarjetas aunque su clase no esté elegida. Quitar una no borra su historial de repaso.'), lista]
      : h('p', { class: 'sub' }, 'En el Lector, toca una palabra y pulsa «Añadir a flashcards».'));
}
