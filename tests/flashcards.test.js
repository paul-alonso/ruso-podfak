// Prueba de integración: abre Tarjetas y la Home en un iframe.
// Guarda y restaura el progreso real (podfak_v1) para no alterarlo.

import { prueba, igual, cierto } from './mini.js';
import { CLAVE, hoy } from '../js/storage.js';
import { sumarDias } from '../js/srs.js';

const ZOVUT = { clave: 'forma_zovut', ru: 'зовут', ru_acento: 'зову́т', es: 'llaman', clase: 'clase_00_ejemplo' };
const BASE = {
  seleccion: { desde: 'clase_00_ejemplo', hasta: 'clase_00_ejemplo' },
  ajustes: { modoTarjetas: 'ru-es', audioAuto: false, acentos: true },
  tarjetas: { forma_zovut: ZOVUT },
};

function abrir(url) {
  return new Promise(resolver => {
    const marco = document.createElement('iframe');
    marco.style.cssText = 'width:360px;height:640px;border:1px solid #888';
    marco.onload = () => resolver(marco);
    marco.src = url;
    document.body.append(marco);
  });
}

async function esperar(condicion, ms = 5000) {
  const inicio = performance.now();
  while (performance.now() - inicio < ms) {
    const v = condicion();
    if (v) return v;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('tiempo agotado');
}

async function conProgreso(estado, fn) {
  const copia = localStorage.getItem(CLAVE);
  localStorage.setItem(CLAVE, JSON.stringify(estado));
  try {
    await fn();
  } finally {
    if (copia === null) localStorage.removeItem(CLAVE);
    else localStorage.setItem(CLAVE, copia);
  }
}

const guardado = () => JSON.parse(localStorage.getItem(CLAVE) ?? '{}');
const marcador = d => d.querySelector('.marcador').textContent;

prueba('Tarjetas: revelar, responder, «otra vez», modos, audio y quitar', () => conProgreso(BASE, async () => {
  const marco = await abrir('../flashcards.html');
  try {
    const d = marco.contentDocument;
    await esperar(() => d.querySelector('.flashcard'));
    // 15 palabras del vocabulario + 1 añadida desde el Lector.
    cierto(marcador(d).includes('Nuevas 16 · Repasos 0'), marcador(d));
    cierto(d.querySelector('.flashcard .tarjeta-ru'), 'el frente RU→ES muestra la palabra rusa');
    cierto(d.querySelector('.reverso').hidden, 'la respuesta empieza oculta');

    // Espacio revela; «Bien» programa la tarjeta para mañana.
    d.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    cierto(!d.querySelector('.reverso').hidden, 'Espacio debería revelar');
    cierto(d.querySelector('.nota-bien').textContent.includes('1 día'), d.querySelector('.nota-bien').textContent);
    d.querySelector('.nota-bien').click();
    const estados = () => guardado().srs.estados;
    const [clave1] = Object.keys(estados());
    igual(estados()[clave1].vence, sumarDias(hoy(), 1));
    cierto(clave1.endsWith('|ru-es'), clave1);
    cierto(marcador(d).includes('Nuevas 15') && marcador(d).includes('Hechas 1'), marcador(d));

    // «Otra vez» (tecla 1): vence hoy y vuelve a la cola como repaso.
    [...d.querySelectorAll('button')].find(b => b.textContent === 'Mostrar respuesta').click();
    d.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
    const clave2 = Object.keys(estados()).find(k => k !== clave1);
    igual([estados()[clave2].vence, estados()[clave2].lapsos], [hoy(), 1]);
    cierto(marcador(d).includes('Nuevas 14 · Repasos 1'), marcador(d));

    // ES→RU: otro calendario, empieza de cero.
    d.querySelector('button[aria-label="Español a ruso"]').click();
    cierto(d.querySelector('.flashcard .tarjeta-es'), 'el frente ES→RU muestra el español');
    cierto(marcador(d).includes('Nuevas 16'), marcador(d));

    // Audio→ES: suena al empezar y no se ve la palabra.
    const dichas = [];
    marco.contentWindow.speechSynthesis.speak = u => { dichas.push(u.text); setTimeout(() => u.onend?.(), 10); };
    d.querySelector('button[aria-label="Audio a español"]').click();
    await esperar(() => dichas.length);
    cierto(d.querySelector('.reverso').hidden && d.querySelector('.reverso .tarjeta-ru'), 'la palabra rusa debe estar oculta');
    igual(dichas[0], d.querySelector('.reverso .tarjeta-ru').textContent.replace(/́/g, ''));

    // Quitar una palabra añadida desde el Lector.
    [...d.querySelectorAll('.anadidas .boton.quitar')][0].click();
    igual(guardado().tarjetas, {});
  } finally {
    marco.remove();
  }
}));

prueba('Home: contador de tarjetas pendientes hoy', () => conProgreso({
  ...BASE,
  srs: { estados: {
    'v_dom|ru-es': { ef: 2.5, intervalo: 1, reps: 1, lapsos: 0, vence: sumarDias(hoy(), 1), primera: hoy(), ultima: hoy() },
    'v_mama|ru-es': { ef: 2.5, intervalo: 3, reps: 2, lapsos: 0, vence: hoy(), primera: '2026-01-01', ultima: '2026-01-01' },
  } },
}, async () => {
  const marco = await abrir('../index.html');
  try {
    const d = marco.contentDocument;
    const pendientes = await esperar(() => d.querySelector('.pendientes'));
    // 1 repaso (мама) + 14 nuevas (16 − дом − мама); дом se empezó hoy pero el límite (20) no se alcanza.
    cierto(pendientes.textContent.includes('15 tarjetas para hoy') && pendientes.textContent.includes('1 repasos, 14 nuevas'), pendientes.textContent);
    igual(d.querySelector('.chip-pendientes').textContent, '15 para hoy');
  } finally {
    marco.remove();
  }
}));
