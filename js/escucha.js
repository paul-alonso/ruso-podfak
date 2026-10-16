// Comprensión auditiva: se oye una frase en ruso sin ver el texto.
//   - Significado: elegir la traducción entre 4 opciones (las incorrectas
//     salen de la misma clase o de clases anteriores).
//   - Dictado: escribir en cirílico lo que se oye.
// Tras responder se muestran el texto, la traducción y el enlace al Lector.

import { h, icono, iniciarPagina, nombreClase, avisoVoz } from './comun.js';
import { comparar, letrasLatinas } from './compare.js';
import { reunirFrases, ordenarPorResultados, elegirDistractores, barajar } from './frases.js';
import { almacen, VELOCIDADES } from './storage.js';
import { crearTeclado } from './teclado.js';
import { hablar } from './tts.js';

const POR_RONDA = 15;
const OPCIONES = 4;
const ajustes = almacen.ajustes();
let frases = [];      // frases de la selección
let candidatas = [];  // frases de todas las clases (para las opciones incorrectas)
let ordenClases = [];
let ronda = null;     // { cola, pos, aciertos, fallos, falladas }
let area = null;
let actual = null;    // { alCambiarTeclado, teclaNumero(n) } de la frase en pantalla

iniciarPagina({ pagina: 'escuchar', renderizar });

document.addEventListener('keydown', e => {
  // Atajos 1–4 para elegir opción (si no se está escribiendo en un campo).
  if (e.ctrlKey || e.metaKey || e.altKey || /^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName)) return;
  if (/^[1-9]$/.test(e.key) && actual?.teclaNumero(Number(e.key))) e.preventDefault();
});

function renderizar(ctx, cont) {
  frases = reunirFrases(ctx.seleccion);
  candidatas = reunirFrases(ctx.clases);
  ordenClases = ctx.indice.map(e => e.id);
  area = h('div', { class: 'ejercicio-area' });
  cont.append(h('h1', { class: 'titulo-pagina' }, 'Escuchar'), controles(), area);
  avisoVoz().then(av => av && cont.prepend(av));
  if (!frases.length) {
    area.append(h('div', { class: 'tarjeta' },
      h('p', {}, 'Las clases elegidas no tienen frases para escuchar. Elige otras con el botón de arriba.')));
    return;
  }
  empezarRonda(ordenar(frases), false);
}

function ordenar(lista) {
  return ordenarPorResultados(lista, ajustes.modoEscucha, claseId => almacen.resultados('escucha', claseId));
}

/** `sonar`: reproducir la primera frase ya (solo tras un toque: el navegador lo exige). */
function empezarRonda(lista, sonar = true) {
  ronda = { cola: lista.slice(0, POR_RONDA), pos: 0, aciertos: 0, fallos: 0, falladas: [] };
  mostrarFrase(sonar);
}

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------

function segmentado(etiqueta, valores, actualValor, alElegir) {
  const botones = valores.map(([valor, texto]) => h('button', {
    type: 'button', 'aria-pressed': String(actualValor() === valor),
    onclick: () => {
      if (actualValor() === valor) return;
      alElegir(valor);
      botones.forEach((b, i) => b.setAttribute('aria-pressed', String(valores[i][0] === valor)));
    },
  }, texto));
  return h('div', { class: 'segmentado', role: 'group', 'aria-label': etiqueta }, botones);
}

function controles() {
  const teclado = h('button', { type: 'button', class: 'interruptor', 'aria-pressed': String(ajustes.tecladoRuso) }, 'Teclado ruso');
  teclado.hidden = ajustes.modoEscucha !== 'dictado';
  teclado.addEventListener('click', () => {
    ajustes.tecladoRuso = !ajustes.tecladoRuso;
    almacen.fijarAjuste('tecladoRuso', ajustes.tecladoRuso);
    teclado.setAttribute('aria-pressed', String(ajustes.tecladoRuso));
    actual?.alCambiarTeclado();
  });

  return h('div', { class: 'controles' },
    segmentado('Modo', [['significado', 'Significado'], ['dictado', 'Dictado']], () => ajustes.modoEscucha, modo => {
      ajustes.modoEscucha = modo;
      almacen.fijarAjuste('modoEscucha', modo);
      teclado.hidden = modo !== 'dictado';
      if (frases.length) empezarRonda(ordenar(frases));
    }),
    segmentado('Velocidad de la voz', VELOCIDADES.map(v => [v, `${String(v).replace('.', ',')}×`]), () => ajustes.velocidad, v => {
      ajustes.velocidad = v;
      almacen.fijarAjuste('velocidad', v);
    }),
    teclado);
}

// ---------------------------------------------------------------------------
// Ejercicio
// ---------------------------------------------------------------------------

/** Velocidad del botón «Lento»: más lenta que la elegida. */
const velocidadLenta = () => (ajustes.velocidad > 0.6 ? 0.6 : 0.45);

function mostrarFrase(sonar) {
  if (ronda.pos >= ronda.cola.length) {
    mostrarResumen();
    return;
  }
  const f = ronda.cola[ronda.pos];
  const dictado = ajustes.modoEscucha === 'dictado';
  const resultado = h('div', { class: 'resultado', tabindex: '-1' });

  const botonOir = h('button', { type: 'button', class: 'boton primario boton-oir' }, icono('altavoz'), 'Escuchar');
  const reproducir = velocidad => {
    botonOir.classList.add('sonando');
    hablar(f.ru, { velocidad, alTerminar: () => botonOir.classList.remove('sonando') });
    botonOir.lastChild.textContent = 'Repetir';
  };
  botonOir.addEventListener('click', () => reproducir(ajustes.velocidad));
  const botonLento = h('button', { type: 'button', class: 'boton', onclick: () => reproducir(velocidadLenta()) }, 'Lento');

  const cuerpo = dictado ? cuerpoDictado(f, resultado) : cuerpoSignificado(f, resultado);
  actual = cuerpo.actual;

  area.replaceChildren(
    h('p', { class: 'marcador' },
      h('span', {}, `Frase ${ronda.pos + 1} de ${ronda.cola.length}`),
      h('span', {}, `✓ ${ronda.aciertos} · ✗ ${ronda.fallos}`)),
    h('section', { class: 'tarjeta ejercicio', 'aria-label': 'Ejercicio' },
      h('p', { class: 'etiqueta' }, `${dictado ? 'Escribe lo que oyes' : '¿Qué significa?'} · ${nombreClase(f.clase)}`),
      h('div', { class: 'acciones controles-audio' }, botonOir, botonLento),
      cuerpo.elemento,
      resultado));
  if (sonar) reproducir(ajustes.velocidad);
  cuerpo.alMostrar?.();
}

function cuerpoSignificado(f, resultado) {
  const distractores = elegirDistractores(f, candidatas, ordenClases, OPCIONES - 1);
  const opciones = barajar([f, ...distractores]);
  let respondida = false;

  const botones = opciones.map((o, i) => h('button', {
    type: 'button', class: 'opcion',
    onclick: () => elegir(i),
  }, h('span', { class: 'opcion-num', 'aria-hidden': 'true' }, String(i + 1)), h('span', {}, o.es)));

  function elegir(i) {
    if (respondida) return;
    respondida = true;
    const ok = opciones[i] === f;
    botones.forEach((b, k) => {
      b.disabled = true;
      if (opciones[k] === f) b.classList.add('correcta');
      else if (k === i) b.classList.add('elegida-mal');
    });
    registrar(f, ok);
    pintarResultado(resultado, f, h('h2', { class: ok ? 'veredicto ok' : 'veredicto mal' }, ok ? '✓ ¡Correcto!' : '✗ No era esa'));
  }

  const elemento = h('div', {},
    distractores.length < OPCIONES - 1 && h('p', { class: 'aviso' },
      'Hay pocas frases en estas clases para inventar opciones incorrectas. Prueba el modo Dictado o elige más clases.'),
    h('div', { class: 'opciones', role: 'group', 'aria-label': 'Opciones' }, botones));
  return {
    elemento,
    actual: {
      alCambiarTeclado: () => {},
      teclaNumero: n => {
        if (respondida || n > botones.length) return false;
        elegir(n - 1);
        return true;
      },
    },
  };
}

function cuerpoDictado(f, resultado) {
  const campo = h('textarea', {
    id: 'respuesta', class: 'respuesta', rows: '2', lang: 'ru',
    autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'Escribe en ruso…',
  });
  const teclado = crearTeclado(campo);
  teclado.activar(ajustes.tecladoRuso);
  const aviso = h('p', { class: 'aviso-campo', role: 'status' });
  const botonNoSe = h('button', { type: 'button', class: 'boton', onclick: () => resolver(null) }, 'No lo sé');
  const botonComprobar = h('button', { type: 'button', class: 'boton primario', onclick: () => resolver(campo.value) }, 'Comprobar');
  const acciones = h('div', { class: 'acciones' }, botonNoSe, botonComprobar);

  campo.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !campo.readOnly) {
      e.preventDefault();
      resolver(campo.value);
    }
  });
  campo.addEventListener('input', () => { aviso.textContent = ''; });

  function resolver(respuesta) {
    if (respuesta !== null && !respuesta.trim()) {
      aviso.textContent = 'Escribe lo que oyes o pulsa «No lo sé».';
      campo.focus();
      return;
    }
    campo.readOnly = true;
    acciones.hidden = true;
    teclado.activar(false);

    if (respuesta === null) {
      registrar(f, false);
      pintarResultado(resultado, f, h('h2', { class: 'veredicto mal' }, 'La frase era:'));
      return;
    }
    // Se compara solo con lo que se oyó (no con traducciones alternativas).
    const cmp = comparar(respuesta, [{ texto: f.ru, mostrar: f.ru_acento }], 'ru');
    const latinas = letrasLatinas(respuesta) && h('p', { class: 'aviso' },
      'Tu respuesta tiene letras latinas (a, o, e, c…) que parecen cirílicas. Usa el teclado ruso.');
    if (cmp.exacta) {
      registrar(f, true);
      pintarResultado(resultado, f, h('h2', { class: 'veredicto ok' }, '✓ ¡Correcto!'));
      return;
    }
    const diff = [
      h('h2', { class: 'veredicto' }, cmp.casi ? 'Muy cerca: revisa las letras marcadas' : 'Compara lo que escribiste'),
      h('p', { class: 'diff-etiqueta' }, 'Tu respuesta'), pintarDiff(cmp.usuario),
      h('p', { class: 'diff-etiqueta' }, 'La frase'), pintarDiff(cmp.esperada),
      latinas,
    ];
    if (cmp.casi) {
      // Erratas pequeñas: decide el alumno (la voz sintética a veces no se entiende bien).
      pintarResultado(resultado, f, diff, { autoevaluar: ok => registrar(f, ok) });
    } else {
      registrar(f, false);
      pintarResultado(resultado, f, diff);
    }
  }

  return {
    elemento: h('div', {},
      h('label', { class: 'oculto', for: 'respuesta' }, 'Lo que oyes'),
      campo, aviso, teclado.elemento, acciones),
    alMostrar: () => campo.focus({ preventScroll: true }),
    actual: {
      alCambiarTeclado: () => { if (!campo.readOnly) teclado.activar(ajustes.tecladoRuso); },
      teclaNumero: () => false,
    },
  };
}

function pintarDiff(trozos) {
  return h('p', { class: 'diff', lang: 'ru' },
    trozos.map(t => (t.estado ? h('span', { class: `w-${t.estado}` }, t.texto) : t.texto)));
}

/** Muestra el veredicto, el texto ruso, la traducción y el enlace al Lector. */
function pintarResultado(resultado, f, veredicto, { autoevaluar } = {}) {
  const botonSiguiente = h('button', {
    type: 'button', class: 'boton primario ancho',
    onclick: () => { ronda.pos++; mostrarFrase(true); },
  }, ronda.pos + 1 < ronda.cola.length ? 'Siguiente →' : 'Ver resultado');

  const piezas = [
    veredicto,
    h('div', { class: 'revelado' },
      h('p', { class: 'resultado-ru', lang: 'ru' }, f.ru_acento || f.ru),
      h('p', { class: 'traduccion' }, f.es),
      f.alt_es.length > 0 && h('p', { class: 'sub' }, 'También: ', f.alt_es.join(' · ')),
      f.lector && h('p', {}, h('a', { href: `lector.html?clase=${f.clase}&frase=${f.lector}` }, 'Ver la frase en el Lector'))),
  ];

  if (autoevaluar) {
    const botones = h('div', { class: 'acciones autoevaluacion' },
      h('button', { type: 'button', class: 'boton bien', onclick: () => elegir(true) }, 'Lo tenía bien'),
      h('button', { type: 'button', class: 'boton mal', onclick: () => elegir(false) }, 'Me equivoqué'));
    const elegir = ok => {
      autoevaluar(ok);
      botones.replaceWith(botonSiguiente);
      botonSiguiente.focus();
    };
    resultado.replaceChildren(...[piezas, h('p', { class: 'sub' }, '¿Lo entendiste bien?'), botones].flat(Infinity).filter(Boolean));
    resultado.focus();
  } else {
    resultado.replaceChildren(...piezas.flat(Infinity).filter(Boolean), botonSiguiente);
    botonSiguiente.focus();
  }
}

function registrar(f, ok) {
  almacen.registrarResultado('escucha', f.clase, f.clave, ajustes.modoEscucha, ok);
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
  area.replaceChildren(h('section', { class: 'tarjeta resumen' },
    h('h2', {}, 'Ronda terminada'),
    h('p', { class: 'cifra' }, `${aciertos} de ${aciertos + fallos}`),
    h('p', { class: 'sub' }, fallos ? `Fallaste ${fallos === 1 ? '1 frase' : `${fallos} frases`}: saldrán primero la próxima vez.` : '¡Todas bien!'),
    h('div', { class: 'acciones' },
      falladas.length > 0 && h('button', { type: 'button', class: 'boton primario', onclick: () => empezarRonda(falladas) }, 'Repetir las falladas'),
      h('button', { type: 'button', class: falladas.length ? 'boton' : 'boton primario', onclick: () => empezarRonda(ordenar(frases)) }, 'Otra ronda'))));
  area.querySelector('.resumen .boton')?.focus();
}
