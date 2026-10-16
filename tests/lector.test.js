// Prueba de integración: abre el Lector en un iframe y simula toques.
// Guarda y restaura el progreso real (podfak_v1) para no alterarlo.

import { prueba, igual, cierto } from './mini.js';
import { CLAVE } from '../js/storage.js';

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
  throw new Error('tiempo agotado esperando al Lector');
}

async function conProgresoAislado(fn) {
  const copia = localStorage.getItem(CLAVE);
  localStorage.removeItem(CLAVE);
  try {
    await fn();
  } finally {
    if (copia === null) localStorage.removeItem(CLAVE);
    else localStorage.setItem(CLAVE, copia);
  }
}

const guardado = () => JSON.parse(localStorage.getItem(CLAVE) ?? '{}');
const boton = (d, texto) => [...d.querySelectorAll('button')].find(b => b.textContent.trim() === texto);

prueba('Lector: ficha de palabra, traducción, acentos y «primero intenta»', () => conProgresoAislado(async () => {
  const marco = await abrir('../lector.html?clase=clase_00_ejemplo');
  try {
    const d = marco.contentDocument;
    await esperar(() => d.querySelector('.frase'));
    igual(d.querySelectorAll('.frase').length, 13, 'frases');

    // Tocar una palabra abre la ficha; se puede añadir a flashcards.
    const palabra = d.querySelector('.palabra');
    igual(palabra.textContent, 'Э́то');
    palabra.click();
    const hoja = d.querySelector('dialog.hoja[open]');
    cierto(hoja, 'no se abrió la ficha');
    cierto(hoja.textContent.includes('esta es') && hoja.textContent.includes('partícula demostrativa'), hoja.textContent);
    boton(d, 'Añadir a flashcards').click();
    cierto(guardado().tarjetas?.v_eto, 'no se guardó la tarjeta');
    cierto(boton(d, '✓ En tus tarjetas · Quitar'), 'el botón no cambió');
    hoja.close();

    // Botón de frase: muestra la traducción y la marca como leída.
    const [f1, f2] = d.querySelectorAll('.frase');
    f1.querySelector('.boton-frase').click();
    const trad = f1.querySelector('.frase-trad');
    cierto(!trad.hidden && trad.textContent.includes('Esta es mi casa.'), 'traducción no visible');
    igual(Object.keys(guardado().lector.vistas.clase_00_ejemplo), ['t1/f1']);
    f1.querySelector('.boton-frase').click();
    cierto(trad.hidden, 'la traducción no se ocultó');

    // Interruptor de acentos.
    boton(d, 'Acentos').click();
    igual(palabra.textContent, 'Это');
    igual(guardado().ajustes.acentos, false);

    // «Primero intenta»: la traducción espera a «Revelar».
    boton(d, 'Primero intenta').click();
    f2.querySelector('.boton-frase').click();
    const trad2 = f2.querySelector('.frase-trad');
    cierto(!trad2.textContent.includes('Aquí está la ventana.'), 'se mostró antes de revelar');
    boton(d, 'Revelar').click();
    cierto(trad2.textContent.includes('Aquí está la ventana.'), 'no se reveló');

    // «Todas las traducciones».
    boton(d, 'Todas las traducciones').click();
    cierto([...d.querySelectorAll('.frase-trad')].every(t => !t.hidden), 'no se mostraron todas');
  } finally {
    marco.remove();
  }
}));

prueba('Lector: enlace directo a una frase', () => conProgresoAislado(async () => {
  const marco = await abrir('../lector.html?clase=clase_00_ejemplo&frase=t2-f3');
  try {
    const d = marco.contentDocument;
    const frase = await esperar(() => d.getElementById('frase-clase_00_ejemplo-t2-f3'));
    cierto(frase.classList.contains('destacada'), 'no se destacó');
    cierto(frase.querySelector('.frase-trad').textContent.includes('¿Cómo se llama?'), 'traducción no visible');
  } finally {
    marco.remove();
  }
}));

prueba('Home: muestra la clase y el avance del Lector', () => conProgresoAislado(async () => {
  localStorage.setItem(CLAVE, JSON.stringify({
    seleccion: { desde: 'clase_00_ejemplo', hasta: 'clase_00_ejemplo' },
    lector: { vistas: { clase_00_ejemplo: { 't1/f1': '2026-10-15', 't9/f9': '2026-10-15' } } } }));
  const marco = await abrir('../index.html');
  try {
    const d = marco.contentDocument;
    await esperar(() => d.querySelector('.clase-item'));
    cierto(d.querySelector('.portada h1').textContent === 'Clase 0 (ejemplo)', 'selección');
    // La frase que ya no existe (t9/f9) no cuenta.
    cierto(d.querySelector('.clase-item').textContent.includes('Lectura 1/13'), d.querySelector('.clase-item').textContent);
  } finally {
    marco.remove();
  }
}));
