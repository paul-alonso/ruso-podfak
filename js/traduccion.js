// Práctica de traducción RU→ES / ES→RU con las frases de práctica y de los
// textos de las clases seleccionadas. Se practica por rondas; primero salen
// las frases falladas la última vez, luego las nuevas y luego el resto.

import { h, icono, iniciarPagina, nombreClase } from './comun.js';
import { comparar, pista, letrasLatinas } from './compare.js';
import { reunirFrases, ordenarPorResultados } from './frases.js';
import { almacen } from './storage.js';
import { crearTeclado } from './teclado.js';
import { hablar } from './tts.js';

const POR_RONDA = 15;
const ajustes = almacen.ajustes();
let frases = [];   // todas las frases de la selección
let ronda = null;  // { cola, pos, aciertos, fallos, falladas }
let area = null;   // contenedor del ejercicio
let actual = null; // { alCambiarTeclado, alCambiarAcentos } de la frase en pantalla

iniciarPagina({ pagina: 'traducir', renderizar });

function renderizar(ctx, cont) {
  frases = reunirFrases(ctx.seleccion);
  area = h('div', { class: 'ejercicio-area' });
  cont.append(h('h1', { class: 'titulo-pagina' }, 'Traducir'), controles(), area);
  if (!frases.length) {
    area.append(h('div', { class: 'tarjeta' },
      h('p', {}, 'Las clases elegidas no tienen frases para traducir. Elige otras con el botón de arriba.')));
    return;
  }
  empezarRonda(ordenar(frases));
}

function ordenar(lista) {
  return ordenarPorResultados(lista, ajustes.direccion, claseId => almacen.resultados('traduccion', claseId));
}

function empezarRonda(lista) {
  ronda = { cola: lista.slice(0, POR_RONDA), pos: 0, aciertos: 0, fallos: 0, falladas: [] };
  mostrarFrase();
}

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------

function controles() {
  const botonesDir = [['ru-es', 'Ruso → Español'], ['es-ru', 'Español → Ruso']].map(([dir, texto]) => h('button', {
    type: 'button', 'aria-pressed': String(ajustes.direccion === dir),
    onclick: () => {
      if (ajustes.direccion === dir) return;
      ajustes.direccion = dir;
      almacen.fijarAjuste('direccion', dir);
      botonesDir.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.dir === dir)));
      teclado.hidden = dir !== 'es-ru';
      if (frases.length) empezarRonda(ordenar(frases));
    },
    'data-dir': dir,
  }, texto));

  const interruptor = (clave, texto, alCambiar) => {
    const b = h('button', { type: 'button', class: 'interruptor', 'aria-pressed': String(ajustes[clave]) }, texto);
    b.addEventListener('click', () => {
      ajustes[clave] = !ajustes[clave];
      almacen.fijarAjuste(clave, ajustes[clave]);
      b.setAttribute('aria-pressed', String(ajustes[clave]));
      alCambiar();
    });
    return b;
  };
  const teclado = interruptor('tecladoRuso', 'Teclado ruso', () => actual?.alCambiarTeclado());
  teclado.hidden = ajustes.direccion !== 'es-ru';

  return h('div', { class: 'controles' },
    h('div', { class: 'segmentado', role: 'group', 'aria-label': 'Dirección' }, botonesDir),
    interruptor('acentos', 'Acentos', () => actual?.alCambiarAcentos()),
    teclado);
}

// ---------------------------------------------------------------------------
// Ejercicio
// ---------------------------------------------------------------------------

function reproducir(texto) {
  hablar(texto, { velocidad: ajustes.velocidad });
}

const botonAudio = (texto, etiqueta) => h('button', {
  type: 'button', class: 'boton-icono', 'aria-label': etiqueta, onclick: () => reproducir(texto),
}, icono('altavoz'));

function mostrarFrase() {
  if (ronda.pos >= ronda.cola.length) {
    mostrarResumen();
    return;
  }
  const f = ronda.cola[ronda.pos];
  const haciaRu = ajustes.direccion === 'es-ru';
  const idioma = haciaRu ? 'ru' : 'es';
  const aceptadas = haciaRu
    ? [{ texto: f.ru, mostrar: f.ru_acento }, ...f.alt_ru]
    : [f.es, ...f.alt_es];
  const conAcento = () => (ajustes.acentos && f.ru_acento) || f.ru;

  const enunciado = h('p', { class: 'enunciado', lang: haciaRu ? 'es' : 'ru' }, haciaRu ? f.es : conAcento());
  const campo = h('textarea', {
    id: 'respuesta', class: 'respuesta', rows: '2', lang: idioma,
    autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    placeholder: haciaRu ? 'Escribe en ruso…' : 'Escribe tu traducción…',
  });
  const teclado = crearTeclado(campo);
  teclado.activar(haciaRu && ajustes.tecladoRuso);
  const avisoCampo = h('p', { class: 'aviso-campo', role: 'status' });
  const textoPista = h('p', { class: 'pista', lang: idioma, hidden: true });
  const resultado = h('div', { class: 'resultado', tabindex: '-1' });
  let usoPista = false;

  const botonPista = h('button', {
    type: 'button', class: 'boton',
    onclick: () => {
      usoPista = true;
      textoPista.textContent = `Pista: ${pista(haciaRu ? f.ru : f.es)}`;
      textoPista.hidden = false;
      botonPista.disabled = true;
      campo.focus();
    },
  }, 'Pista');
  const botonNoSe = h('button', { type: 'button', class: 'boton', onclick: () => resolver(null) }, 'No lo sé');
  const botonComprobar = h('button', { type: 'button', class: 'boton primario', onclick: () => resolver(campo.value) }, 'Comprobar');
  const acciones = h('div', { class: 'acciones' }, botonPista, botonNoSe, botonComprobar);

  campo.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !campo.readOnly) {
      e.preventDefault();
      resolver(campo.value);
    }
  });
  campo.addEventListener('input', () => { avisoCampo.textContent = ''; });

  function resolver(respuesta) {
    if (respuesta !== null && !respuesta.trim()) {
      avisoCampo.textContent = 'Escribe tu traducción o pulsa «No lo sé».';
      campo.focus();
      return;
    }
    campo.readOnly = true;
    acciones.hidden = true;
    teclado.activar(false);

    if (respuesta === null) {
      pintarResultado(resultado, { f, haciaRu, conAcento, cmp: null });
      registrar(f, false);
      return;
    }
    const cmp = comparar(respuesta, aceptadas, idioma);
    pintarResultado(resultado, {
      f, haciaRu, conAcento, cmp, usoPista,
      latinas: haciaRu && letrasLatinas(respuesta),
      alAutoevaluar: ok => registrar(f, ok),
    });
    if (cmp.exacta) registrar(f, true);
  }

  actual = {
    alCambiarTeclado: () => { if (!campo.readOnly) teclado.activar(haciaRu && ajustes.tecladoRuso); },
    alCambiarAcentos: () => { if (!haciaRu) enunciado.textContent = conAcento(); },
  };

  const lugar = f.origen === 'Práctica' ? 'frase de práctica' : `texto «${f.origen}»`;
  area.replaceChildren(
    h('p', { class: 'marcador' },
      h('span', {}, `Frase ${ronda.pos + 1} de ${ronda.cola.length}`),
      h('span', {}, `✓ ${ronda.aciertos} · ✗ ${ronda.fallos}`)),
    h('section', { class: 'tarjeta ejercicio', 'aria-label': 'Ejercicio' },
      h('p', { class: 'etiqueta' }, `${haciaRu ? 'Traduce al ruso' : 'Traduce al español'} · ${nombreClase(f.clase)}, ${lugar}`),
      h('div', { class: 'enunciado-fila' }, enunciado, !haciaRu && botonAudio(f.ru, 'Escuchar la frase')),
      h('label', { class: 'oculto', for: 'respuesta' }, 'Tu traducción'),
      campo, avisoCampo, teclado.elemento, textoPista, acciones, resultado));
  campo.focus({ preventScroll: true });
}

function pintarResultado(resultado, { f, haciaRu, conAcento, cmp, usoPista, latinas, alAutoevaluar }) {
  const idioma = haciaRu ? 'ru' : 'es';
  const ruso = h('div', { class: 'enunciado-fila' },
    h('span', { lang: 'ru', class: 'resultado-ru' }, conAcento()),
    botonAudio(f.ru, 'Escuchar la frase en ruso'));
  const enlace = f.lector && h('a', { href: `lector.html?clase=${f.clase}&frase=${f.lector}` }, 'Ver la frase en el Lector');
  const otras = (haciaRu ? f.alt_ru : f.alt_es);
  const listaOtras = otras.length > 0 && h('p', { class: 'sub' }, 'También vale: ',
    h('span', { lang: idioma }, [haciaRu ? f.ru : f.es, ...otras].filter((t, i) => i !== (cmp?.indice ?? 0)).join(' · ')));

  const botonSiguiente = h('button', {
    type: 'button', class: 'boton primario ancho',
    onclick: () => { ronda.pos++; mostrarFrase(); },
  }, ronda.pos + 1 < ronda.cola.length ? 'Siguiente →' : 'Ver resultado');

  const piezas = [];
  if (!cmp) {
    piezas.push(h('h2', { class: 'veredicto mal' }, 'La respuesta era:'),
      haciaRu ? ruso : h('p', { class: 'diff', lang: 'es' }, f.es));
  } else if (cmp.exacta) {
    piezas.push(h('h2', { class: 'veredicto ok' }, usoPista ? '✓ ¡Correcto! (con pista)' : '✓ ¡Correcto!'));
  } else {
    piezas.push(
      h('h2', { class: 'veredicto' }, cmp.casi ? 'Muy cerca: revisa las letras marcadas' : 'Compara tu respuesta'),
      h('p', { class: 'diff-etiqueta' }, 'Tu respuesta'),
      pintarDiff(cmp.usuario, idioma),
      h('p', { class: 'diff-etiqueta' }, 'Respuesta correcta'),
      pintarDiff(cmp.esperada, idioma),
      h('p', { class: 'leyenda' },
        h('span', { class: 'w-casi' }, 'casi'), ' ', h('span', { class: 'w-mal' }, 'distinta'), ' ',
        h('span', { class: 'w-sobra' }, 'sobra'), ' ', h('span', { class: 'w-falta' }, 'falta')),
      latinas && h('p', { class: 'aviso' }, 'Tu respuesta tiene letras latinas (a, o, e, c…) que parecen cirílicas. Usa el teclado ruso.'));
  }
  // Siempre se puede volver a oír la frase rusa junto a su traducción.
  if (cmp) {
    piezas.push(haciaRu ? ruso : h('div', { class: 'enunciado-fila' },
      h('p', { class: 'sub' }, h('span', { lang: 'ru' }, conAcento()), ` = ${f.es}`),
      botonAudio(f.ru, 'Escuchar la frase en ruso')));
  }
  piezas.push(listaOtras, enlace && h('p', {}, enlace));

  if (cmp && !cmp.exacta) {
    const autoevaluacion = h('div', { class: 'acciones autoevaluacion' },
      h('button', { type: 'button', class: 'boton bien', onclick: () => elegir(true) }, 'Lo tenía bien'),
      h('button', { type: 'button', class: 'boton mal', onclick: () => elegir(false) }, 'Me equivoqué'));
    const elegir = ok => {
      alAutoevaluar(ok);
      autoevaluacion.replaceWith(botonSiguiente);
      botonSiguiente.focus();
    };
    piezas.push(h('p', { class: 'sub' }, 'Puede haber otras traducciones correctas. ¿Cómo te fue?'), autoevaluacion);
    resultado.replaceChildren(...piezas.filter(Boolean));
    resultado.focus();
  } else {
    resultado.replaceChildren(...piezas.filter(Boolean), botonSiguiente);
    botonSiguiente.focus();
  }
}

function pintarDiff(trozos, idioma) {
  return h('p', { class: 'diff', lang: idioma },
    trozos.map(t => (t.estado ? h('span', { class: `w-${t.estado}` }, t.texto) : t.texto)));
}

function registrar(f, ok) {
  almacen.registrarResultado('traduccion', f.clase, f.clave, ajustes.direccion, ok);
  if (ok) ronda.aciertos++;
  else {
    ronda.fallos++;
    ronda.falladas.push(f);
  }
  const marcador = area.querySelector('.marcador span:last-child');
  if (marcador) marcador.textContent = `✓ ${ronda.aciertos} · ✗ ${ronda.fallos}`;
}

function mostrarResumen() {
  actual = null;
  const { aciertos, fallos, falladas } = ronda;
  const total = aciertos + fallos;
  area.replaceChildren(h('section', { class: 'tarjeta resumen' },
    h('h2', {}, 'Ronda terminada'),
    h('p', { class: 'cifra' }, `${aciertos} de ${total}`),
    h('p', { class: 'sub' }, fallos ? `Fallaste ${fallos === 1 ? '1 frase' : `${fallos} frases`}: saldrán primero la próxima vez.` : '¡Todas bien!'),
    h('div', { class: 'acciones' },
      falladas.length > 0 && h('button', { type: 'button', class: 'boton primario', onclick: () => empezarRonda(falladas) }, 'Repetir las falladas'),
      h('button', { type: 'button', class: falladas.length ? 'boton' : 'boton primario', onclick: () => empezarRonda(ordenar(frases)) }, 'Otra ronda'))));
  area.querySelector('.resumen .boton')?.focus();
}
