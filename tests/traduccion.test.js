// Prueba de integración: abre Traducción en un iframe y responde frases.
// Guarda y restaura el progreso real (podfak_v1) para no alterarlo.

import { prueba, igual, cierto } from './mini.js';
import { CLAVE } from '../js/storage.js';

const ejemplo = await (await fetch('../data/clases/clase_00_ejemplo.json')).json();
const frasesEjemplo = [...ejemplo.frases_practica, ...ejemplo.textos.flatMap(t => t.frases)];

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
  throw new Error('tiempo agotado esperando a Traducción');
}

const guardado = () => JSON.parse(localStorage.getItem(CLAVE) ?? '{}');
const boton = (d, texto) => [...d.querySelectorAll('button')].find(b => b.textContent.trim() === texto);
const contar = campo => Object.values(guardado().traduccion?.resultados?.clase_00_ejemplo ?? {})
  .reduce((n, r) => n + r[campo], 0);

prueba('Traducción: acierto, autoevaluación, «No lo sé», ES→RU y teclado ruso', async () => {
  const copia = localStorage.getItem(CLAVE);
  localStorage.setItem(CLAVE, JSON.stringify({
    seleccion: { desde: 'clase_00_ejemplo', hasta: 'clase_00_ejemplo' },
    ajustes: { direccion: 'ru-es', acentos: false, tecladoRuso: false },
  }));
  const marco = await abrir('../traduccion.html');
  try {
    const d = marco.contentDocument;
    await esperar(() => d.querySelector('.enunciado'));
    // 5 de práctica + 13 de los textos, con «Кто это?» repetida → 17; la ronda es de 15.
    cierto(d.querySelector('.marcador').textContent.includes('Frase 1 de 15'), d.querySelector('.marcador').textContent);

    // Respuesta correcta: se reconoce sola.
    const ru = d.querySelector('.enunciado').textContent;
    const frase = frasesEjemplo.find(f => f.ru === ru);
    cierto(frase, `frase desconocida: ${ru}`);
    d.getElementById('respuesta').value = frase.es.toUpperCase();
    boton(d, 'Comprobar').click();
    cierto(d.querySelector('.veredicto.ok'), 'no se reconoció la respuesta correcta');
    igual(contar('ok'), 1);
    boton(d, 'Siguiente →').click();

    // Respuesta distinta: autoevaluación.
    d.getElementById('respuesta').value = 'algo que no tiene nada que ver';
    boton(d, 'Comprobar').click();
    cierto(d.querySelector('.diff .w-sobra, .diff .w-mal'), 'no hay diferencias marcadas');
    boton(d, 'Me equivoqué').click();
    igual(contar('mal'), 1);
    cierto(d.querySelector('.marcador').textContent.includes('✓ 1 · ✗ 1'), d.querySelector('.marcador').textContent);
    boton(d, 'Siguiente →').click();

    // «No lo sé» cuenta como fallo y enseña la respuesta.
    boton(d, 'No lo sé').click();
    cierto(d.querySelector('.veredicto.mal'), 'no se mostró la respuesta');
    igual(contar('mal'), 2);

    // ES→RU con el teclado ruso.
    boton(d, 'Español → Ruso').click();
    cierto(d.querySelector('.marcador').textContent.includes('Frase 1 de 15'), 'no empezó una ronda nueva');
    const interruptor = boton(d, 'Teclado ruso');
    cierto(interruptor && !interruptor.hidden, 'falta el interruptor del teclado');
    cierto(d.querySelector('.teclado').hidden, 'el teclado debería estar oculto al principio');
    interruptor.click();
    cierto(!d.querySelector('.teclado').hidden, 'el teclado no se mostró');
    igual(d.getElementById('respuesta').getAttribute('inputmode'), 'none');
    const tecla = l => [...d.querySelectorAll('.tecla')].find(b => b.dataset.accion === l);
    tecla('д').click();
    tecla('а').click();
    igual(d.getElementById('respuesta').value, 'да');
    igual(guardado().ajustes.tecladoRuso, true);

    // La respuesta rusa correcta también se reconoce (sin acentos, con е por ё).
    const es = d.querySelector('.enunciado').textContent;
    const fraseRu = frasesEjemplo.find(f => f.es === es);
    d.getElementById('respuesta').value = fraseRu.ru.toLowerCase().replace(/ё/g, 'е');
    boton(d, 'Comprobar').click();
    cierto(d.querySelector('.veredicto.ok'), `no se reconoció «${fraseRu.ru}»`);
    cierto(d.querySelector('.teclado').hidden, 'el teclado debería ocultarse tras comprobar');
  } finally {
    marco.remove();
    if (copia === null) localStorage.removeItem(CLAVE);
    else localStorage.setItem(CLAVE, copia);
  }
});
