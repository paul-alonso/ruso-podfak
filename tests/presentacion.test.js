// Presentación de las clases: título visible, campos nuevos del esquema
// (tema_corto, profesor, fecha opcional, fuente, repaso), selector agrupado
// por урок, etiquetas del Lector y resumen del validador.

import { prueba, igual, cierto } from './mini.js';
import { fechaCorta, tituloClase, nombreClase, validarClase, validarIndice } from '../js/data.js';
import { gruposPorUrok } from '../js/comun.js';
import { CLAVE } from '../js/storage.js';

const ejemplo = await (await fetch('../data/clases/clase_00_ejemplo.json')).json();
const copia = () => JSON.parse(JSON.stringify(ejemplo));
const validarCon = cambiar => { const c = copia(); cambiar(c); return validarClase(c, { idEsperado: 'clase_00_ejemplo' }); };
const hay = (lista, ruta, texto) => lista.some(p => p.ruta === ruta && p.mensaje.includes(texto));

// --- título visible ---

prueba('título: «Clase N · DD mmm · Урок X · tema», con tema_corto o titulo y «sin fecha»', () => {
  igual([fechaCorta('2026-10-07'), fechaCorta('2026-01-31'), fechaCorta(undefined), fechaCorta('7 oct')], ['07 oct', '31 ene', 'sin fecha', 'sin fecha']);
  igual(tituloClase({ id: 'clase_02', fecha: '2026-10-11', urok: 1, titulo: 'Título largo', tema_corto: 'Кто это?' }), 'Clase 2 · 11 oct · Урок 1 · Кто это?');
  igual(tituloClase({ id: 'clase_07', urok: 3, titulo: 'Genitivo' }), 'Clase 7 · sin fecha · Урок 3 · Genitivo');
  igual(tituloClase({ id: 'clase_07', urok: 3, titulo: 'Genitivo' }, { urok: false }), 'Clase 7 · sin fecha · Genitivo');
  igual(nombreClase('clase_00_ejemplo'), 'Clase 0 (ejemplo)');
  igual(tituloClase(ejemplo), 'Clase 0 (ejemplo) · 01 oct · Урок 2 · Это мой дом');
});

// --- esquema ---

prueba('esquema: la clase de ejemplo, con todos los campos nuevos, es válida y sin avisos', () => {
  const inf = validarClase(copia(), { idEsperado: 'clase_00_ejemplo' });
  igual([inf.errores, inf.avisos], [[], []]);
});

prueba('esquema: fecha opcional en la clase y en el índice', () => {
  igual(validarCon(c => { delete c.fecha; }).errores, []);
  igual(validarIndice([{ id: 'clase_01', urok: 1, titulo: 'x' }]).errores, []);
  cierto(hay(validarCon(c => { c.fecha = '11/10/2026'; }).errores, 'fecha', 'AAAA-MM-DD'), 'una fecha mal escrita sigue siendo error');
});

prueba('esquema: fuente solo «clase» o «libro»; repaso solo true/false y solo en gramática y textos', () => {
  cierto(hay(validarCon(c => { c.textos[0].fuente = 'manual'; }).errores, 'textos[0].fuente', '"clase" o "libro"'), 'fuente de texto');
  cierto(hay(validarCon(c => { c.vocabulario[0].fuente = 'Libro'; }).errores, 'vocabulario[0].fuente', '"clase" o "libro"'), 'fuente de palabra');
  cierto(hay(validarCon(c => { c.textos[0].frases[0].fuente = 3; }).errores, 'textos[0].frases[0].fuente', 'texto'), 'fuente de frase');
  cierto(hay(validarCon(c => { c.gramatica[0].repaso = 'sí'; }).errores, 'gramatica[0].repaso', 'true o false'), 'repaso de gramática');
  const inf = validarCon(c => { c.vocabulario[0].repaso = true; });
  cierto(inf.ok && hay(inf.avisos, 'vocabulario[0].repaso', 'campo desconocido'), 'repaso en una palabra es un campo desconocido');
  igual(validarCon(c => { c.gramatica[0].fuente = 'clase'; c.textos[0].repaso = false; c.textos[0].frases[1].fuente = 'clase'; }).errores, []);
});

prueba('esquema: avisos de tema_corto largo o de titulo largo sin tema_corto; profesor es texto', () => {
  cierto(hay(validarCon(c => { c.tema_corto = 'x'.repeat(41); }).avisos, 'tema_corto', '41 caracteres'), 'tema_corto largo');
  cierto(hay(validarCon(c => { delete c.tema_corto; c.titulo = 'y'.repeat(51); }).avisos, 'tema_corto', 'añade un tema_corto'), 'titulo largo');
  igual(validarCon(c => { delete c.tema_corto; c.titulo = 'Corto'; }).avisos, []);
  cierto(hay(validarCon(c => { c.profesor = 5; }).errores, 'profesor', 'texto'), 'profesor debe ser texto');
});

// --- selector agrupado por урок ---

prueba('selector: grupos por урок de menor a mayor, con el orden de las clases dentro de cada grupo', () => {
  const indice = [
    { id: 'clase_00_ejemplo', urok: 2, titulo: 'e' },
    { id: 'clase_01', urok: 1, titulo: 'a' },
    { id: 'clase_02', urok: 1, titulo: 'b' },
    { id: 'clase_03', urok: 2, titulo: 'c' },
    { id: 'clase_04', urok: 3, titulo: 'mal' },
  ];
  const porId = new Map(indice.slice(0, 4).map(e => [e.id, { ...e, tema_corto: `tema ${e.id}` }]));
  const grupos = gruposPorUrok({ indice, porId });
  igual(grupos.map(([u, cs]) => [u, cs.map(x => x.c.id)]), [[1, ['clase_01', 'clase_02']], [2, ['clase_00_ejemplo', 'clase_03']], [3, ['clase_04']]]);
  igual(grupos[0][1][0].c.tema_corto, 'tema clase_01'); // datos de la clase válida
  igual(grupos[2][1][0].valida, false);                // la que tiene errores usa el índice
});

// --- páginas ---

function abrir(url) {
  return new Promise(resolver => {
    const marco = document.createElement('iframe');
    marco.style.cssText = 'width:360px;height:640px;border:1px solid #888';
    marco.onload = () => resolver(marco);
    marco.src = url;
    document.body.append(marco);
  });
}

async function esperar(condicion, que, ms = 6000) {
  const inicio = performance.now();
  while (performance.now() - inicio < ms) {
    const v = condicion();
    if (v) return v;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`tiempo agotado esperando: ${que}`);
}

async function conSeleccion(desde, hasta, fn) {
  const copiaProgreso = localStorage.getItem(CLAVE);
  localStorage.setItem(CLAVE, JSON.stringify({ version: 1, seleccion: { desde, hasta } }));
  try {
    await fn();
  } finally {
    if (copiaProgreso === null) localStorage.removeItem(CLAVE);
    else localStorage.setItem(CLAVE, copiaProgreso);
  }
}

const etiquetasDe = el => [...el.querySelectorAll('.etiqueta-fuente')].map(e => e.textContent);

prueba('Lector: título con el formato nuevo, profesor y etiquetas «Libro» y «Repaso»', () => conSeleccion('clase_00_ejemplo', 'clase_00_ejemplo', async () => {
  const marco = await abrir('../lector.html');
  try {
    const d = marco.contentDocument;
    const h2 = await esperar(() => d.querySelector('.clase-cabeza h2'), 'cabecera de la clase');
    igual(h2.textContent, 'Clase 0 (ejemplo) · 01 oct · Урок 2 · Это мой дом');
    const sub = d.querySelector('.clase-cabeza .sub').textContent;
    cierto(sub.includes('Ejemplo: Это мой дом') && sub.includes('Profesor/a: Ирина Петровна'), sub);

    const [t1, t2] = d.querySelectorAll('.texto');
    igual([etiquetasDe(t1.querySelector('h3')), etiquetasDe(t2.querySelector('h3'))], [[], ['Libro', 'Repaso']]);
    // t1/f5 es del libro dentro de un texto de clase; las frases de t2 heredan «libro» y no lo repiten.
    igual(etiquetasDe(d.getElementById('frase-clase_00_ejemplo-t1-f5')), ['Libro']);
    igual(etiquetasDe(d.getElementById('frase-clase_00_ejemplo-t1-f1')), []);
    igual([...t2.querySelectorAll('.frase')].flatMap(etiquetasDe), []);
    const temas = [...d.querySelectorAll('.gramatica h4')];
    igual(temas.map(etiquetasDe), [[], [], ['Libro', 'Repaso']]);
    const net = [...d.querySelectorAll('.vocabulario li')].find(li => li.textContent.includes('не́т') || li.textContent.includes('нет'));
    igual(etiquetasDe(net), ['Libro']);
  } finally {
    marco.remove();
  }
}));

prueba('selector: agrupado por урок, sin repetir el урок en cada opción, y rango por orden de clases', () => conSeleccion('clase_02', 'clase_02', async () => {
  const marco = await abrir('../index.html');
  try {
    const d = marco.contentDocument;
    const boton = await esperar(() => d.querySelector('.selector-clase:not([disabled])'), 'selector');
    boton.click();
    const desde = await esperar(() => d.getElementById('sel-desde'), 'diálogo del selector');
    const hasta = d.getElementById('sel-hasta');
    const etiquetas = [...desde.querySelectorAll('optgroup')].map(g => g.label);
    igual(etiquetas, [...etiquetas].sort());
    cierto(etiquetas.every(e => /^Урок \d+$/.test(e)), etiquetas.join(' | '));
    // Cada opción es «Clase N · DD mmm · tema»: sin el segmento «· Урок X ·» (el tema puede mencionar un урок).
    cierto([...desde.options].every(o => /^Clase \d+[^·]* · (\d{2} [a-z]{3}|sin fecha) · /.test(o.textContent) && !/^[^·]+· [^·]+· Урок \d+ ·/.test(o.textContent)),
      [...desde.options].map(o => o.textContent).join(' | '));
    igual(d.querySelector('#sel-desde optgroup[label="Урок 2"] option').value, 'clase_00_ejemplo');

    // «Hasta» antes que «Desde» en el orden de clases (aunque esté en otro grupo): Desde se ajusta.
    hasta.value = 'clase_00_ejemplo';
    hasta.dispatchEvent(new Event('change'));
    igual(desde.value, 'clase_00_ejemplo');
    // Y al revés: Desde después de Hasta → Hasta se ajusta.
    desde.value = 'clase_02';
    desde.dispatchEvent(new Event('change'));
    igual(hasta.value, 'clase_02');

    const item = [...d.querySelectorAll('.clase-item .titulo-clase')].find(s => s.textContent.startsWith('Clase 0'));
    igual(item.textContent, 'Clase 0 (ejemplo) · 01 oct · Урок 2 · Это мой дом');
  } finally {
    marco.remove();
  }
}));

prueba('validar.html: muestra el título de cada clase y lo marcado como «Libro» o «Repaso»', async () => {
  const marco = await abrir('../validar.html');
  try {
    const d = marco.contentDocument;
    await esperar(() => d.body.dataset.estado === 'listo', 'validador');
    const detalle = [...d.querySelectorAll('.detalle')].map(p => p.textContent).find(t => t.includes('Clase 0'));
    cierto(detalle?.includes('Título: «Clase 0 (ejemplo) · 01 oct · Урок 2 · Это мой дом»'), detalle);
    cierto(detalle.includes('Profesor/a: Ирина Петровна') && detalle.includes('textos del libro: 1') && detalle.includes('frases del libro: 9'), detalle);
    cierto(detalle.includes('temas de gramática de repaso: 1'), detalle);
  } finally {
    marco.remove();
  }
});
