import { prueba, igual, cierto } from './mini.js';
import { normalizar, normalizarPalabra, comparar, pista, letrasLatinas, distancia } from '../js/compare.js';
import { crearTeclado } from '../js/teclado.js';
import { crearAlmacen, normalizar as normalizarEstado } from '../js/storage.js';

const estados = trozos => trozos.filter(t => t.palabra !== undefined).map(t => `${t.texto}:${t.estado}`);

// --- compare.js: normalización ---

prueba('normalizar: mayúsculas, puntuación y espacios extra', () => {
  igual(normalizar('  ¿Qué   es ESTO?! ', 'es'), 'que es esto');
  igual(normalizar('Нет,   мама  там!!', 'ru'), 'нет мама там');
  igual(normalizar('Кто он? — Он врач.', 'ru'), 'кто он он врач');
});

prueba('normalizar: en ruso е = ё y sin acentos, pero й ≠ и', () => {
  igual(normalizar('Э́то её ёж.', 'ru'), 'это ее еж');
  igual(normalizarPalabra('мой', 'ru'), 'мой');
  cierto(normalizarPalabra('мой', 'ru') !== normalizarPalabra('мои', 'ru'), 'й e и deben ser distintas');
});

prueba('normalizar: en español se ignoran las tildes', () => {
  igual(normalizar('Habitación, mamá, CAMIÓN', 'es'), 'habitacion mama camion');
});

// --- compare.js: comparación ---

prueba('comparar: coincidencia exacta tras normalizar', () => {
  const r = comparar('esta es mi casa', ['Esta es mi casa.'], 'es');
  cierto(r.exacta, 'debería ser exacta');
  igual(estados(r.esperada), ['Esta:ok', 'es:ok', 'mi:ok', 'casa:ok']);
});

prueba('comparar: elige la alternativa más parecida', () => {
  const r = comparar('Cual es su nombre', ['¿Cómo se llama usted?', '¿Cuál es su nombre?'], 'es');
  cierto(r.exacta, 'debería ser exacta');
  igual(r.indice, 1);
});

prueba('comparar: palabra que falta y palabra que sobra', () => {
  const falta = comparar('es mi casa', ['Esta es mi casa.'], 'es');
  cierto(!falta.exacta && !falta.casi, 'no es exacta');
  igual(estados(falta.esperada), ['Esta:falta', 'es:ok', 'mi:ok', 'casa:ok']);
  const sobra = comparar('esta es mi casa grande', ['Esta es mi casa.'], 'es');
  igual(estados(sobra.usuario), ['esta:ok', 'es:ok', 'mi:ok', 'casa:ok', 'grande:sobra']);
});

prueba('comparar: errata pequeña («casi») y palabra distinta', () => {
  const casi = comparar('Это мой дон', ['Это мой дом.'], 'ru');
  cierto(casi.casi, 'debería ser «casi»');
  igual(estados(casi.usuario), ['Это:ok', 'мой:ok', 'дон:casi']);
  const mal = comparar('это твой дом', ['Это мой дом.'], 'ru');
  igual(estados(mal.usuario), ['это:ok', 'твой:mal', 'дом:ok']);
  igual(estados(mal.esperada), ['Это:ok', 'мой:falta', 'дом:ok']);
});

prueba('comparar: muestra la respuesta correcta con acentos', () => {
  const r = comparar('это мой дом', [{ texto: 'Это мой дом.', mostrar: 'Э́то мо́й до́м.' }], 'ru');
  cierto(r.exacta, 'debería ser exacta');
  igual(r.esperada.map(t => t.texto).join(''), 'Э́то мо́й до́м.');
});

prueba('pista: primera letra de cada palabra', () => {
  igual(pista('Это мой дом.'), 'Э__ м__ д__.');
  igual(pista('¿Cómo se llama?'), '¿C___ s_ l____?');
});

prueba('letrasLatinas y distancia', () => {
  cierto(letrasLatinas('Этo'), 'la o latina debería detectarse');
  cierto(!letrasLatinas('Это'), 'todo cirílico');
  igual(distancia('дом', 'дон'), 1);
  igual(distancia('', 'кот'), 3);
});

// --- teclado.js ---

prueba('teclado: teclas en pantalla, borrar y teclado físico por posición', () => {
  const campo = document.createElement('textarea');
  document.body.append(campo);
  const teclado = crearTeclado(campo);
  document.body.append(teclado.elemento);
  try {
    teclado.activar(true);
    cierto(!teclado.elemento.hidden, 'debería verse');
    igual(campo.getAttribute('inputmode'), 'none');
    const tecla = l => [...teclado.elemento.querySelectorAll('.tecla')].find(b => b.dataset.accion === l);
    tecla('д').click();
    tecla('а').click();
    tecla(' ').click();
    igual(campo.value, 'да ');
    tecla('borrar').click();
    igual(campo.value, 'да');

    const pulsar = (code, key, shiftKey = false) => campo.dispatchEvent(new KeyboardEvent('keydown', { code, key, shiftKey, bubbles: true, cancelable: true }));
    pulsar('KeyQ', 'q');
    pulsar('Semicolon', 'ñ', false);
    pulsar('KeyA', 'A', true);
    igual(campo.value, 'дайжФ');
    pulsar('KeyQ', 'й'); // el sistema ya escribe en ruso: no se toca
    igual(campo.value, 'дайжФ');

    teclado.activar(false);
    cierto(teclado.elemento.hidden && !campo.hasAttribute('inputmode'), 'debería ocultarse');
    pulsar('KeyQ', 'q');
    igual(campo.value, 'дайжФ');
  } finally {
    campo.remove();
    teclado.elemento.remove();
  }
});

// --- storage.js ---

prueba('registrarResultado cuenta aciertos y fallos por herramienta y modo', () => {
  const m = new Map();
  const a = crearAlmacen({ getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) });
  a.registrarResultado('traduccion', 'clase_01', 'p3', 'ru-es', true);
  a.registrarResultado('traduccion', 'clase_01', 'p3', 'ru-es', false);
  a.registrarResultado('traduccion', 'clase_01', 'p3', 'es-ru', true);
  a.registrarResultado('escucha', 'clase_01', 'p3', 'dictado', false);
  igual(a.resultados('escucha', 'clase_01')['p3|dictado'].mal, 1);
  igual(a.resultados('escucha', 'clase_02'), {});
  const r = a.resultados('traduccion', 'clase_01');
  igual([r['p3|ru-es'].ok, r['p3|ru-es'].mal, r['p3|ru-es'].ultimaOk], [1, 1, false]);
  igual(r['p3|es-ru'].ok, 1);
  igual(normalizarEstado({ ajustes: { direccion: 'xx' } }).ajustes.direccion, 'ru-es');
});
