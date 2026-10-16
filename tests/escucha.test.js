// Prueba de integración: abre Escucha en un iframe, intercepta la voz para
// saber qué frase sonó y responde. Guarda y restaura el progreso real.

import { prueba, igual, cierto } from './mini.js';
import { CLAVE } from '../js/storage.js';

const ejemplo = await (await fetch('../data/clases/clase_00_ejemplo.json')).json();
// Traducción principal de cada frase rusa (la de práctica manda si está en ambos sitios).
const traduccionDe = new Map();
for (const f of [...ejemplo.frases_practica, ...ejemplo.textos.flatMap(t => t.frases)]) {
  if (!traduccionDe.has(f.ru)) traduccionDe.set(f.ru, f.es);
}

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
  throw new Error('tiempo agotado esperando a Escucha');
}

const guardado = () => JSON.parse(localStorage.getItem(CLAVE) ?? '{}');
const contar = campo => Object.values(guardado().escucha?.resultados?.clase_00_ejemplo ?? {})
  .reduce((n, r) => n + r[campo], 0);
const boton = (d, texto) => [...d.querySelectorAll('button')].find(b => b.textContent.trim() === texto);

prueba('Escucha: significado (toque y atajo), dictado exacto y con errata', async () => {
  const copia = localStorage.getItem(CLAVE);
  localStorage.setItem(CLAVE, JSON.stringify({
    seleccion: { desde: 'clase_00_ejemplo', hasta: 'clase_00_ejemplo' },
    ajustes: { modoEscucha: 'significado', tecladoRuso: false },
  }));
  const marco = await abrir('../escucha.html');
  try {
    const d = marco.contentDocument;
    const sintesis = marco.contentWindow.speechSynthesis;
    cierto(sintesis, 'el navegador no tiene speechSynthesis');
    const dichas = [];
    sintesis.speak = u => { dichas.push(u.text); setTimeout(() => u.onend?.(), 10); };
    const oirFrase = async () => {
      const antes = dichas.length;
      await esperar(() => dichas.length > antes);
      return dichas.at(-1);
    };

    await esperar(() => d.querySelector('.opcion'));
    igual(d.querySelectorAll('.opcion').length, 4);
    cierto(!d.querySelector('.revelado'), 'el texto no debe verse antes de responder');

    // 1. Significado: toque en la opción correcta.
    let oida = oirFrase();
    boton(d, 'Escuchar').click();
    let ru = await oida;
    const correcta = traduccionDe.get(ru);
    cierto(correcta, `frase desconocida: ${ru}`);
    const opciones = [...d.querySelectorAll('.opcion')];
    igual(opciones.filter(o => o.textContent.slice(1) === correcta).length, 1, 'la opción correcta debe salir una vez');
    opciones.find(o => o.textContent.slice(1) === correcta).click();
    cierto(d.querySelector('.veredicto.ok'), 'debería ser correcto');
    cierto(d.querySelector('.revelado').textContent.includes(correcta), 'falta la traducción');
    igual(contar('ok'), 1);

    // 2. La siguiente suena sola; se elige una incorrecta con el atajo de teclado.
    oida = oirFrase();
    boton(d, 'Siguiente →').click();
    ru = await oida;
    const opciones2 = [...d.querySelectorAll('.opcion')];
    const mala = opciones2.findIndex(o => o.textContent.slice(1) !== traduccionDe.get(ru));
    d.dispatchEvent(new KeyboardEvent('keydown', { key: String(mala + 1), bubbles: true }));
    cierto(d.querySelector('.veredicto.mal'), 'debería ser incorrecto');
    cierto(d.querySelector('.opcion.correcta') && d.querySelector('.opcion.elegida-mal'), 'faltan las marcas');
    igual(contar('mal'), 1);

    // 3. Dictado exacto (sin mayúsculas ni puntuación).
    oida = oirFrase();
    boton(d, 'Dictado').click();
    ru = await oida;
    const campo = await esperar(() => d.getElementById('respuesta'));
    campo.value = ru.toLowerCase().replace(/[.,!?—]/g, '');
    boton(d, 'Comprobar').click();
    cierto(d.querySelector('.veredicto.ok'), `no se reconoció «${ru}»`);
    igual(guardado().escucha.resultados.clase_00_ejemplo[Object.keys(guardado().escucha.resultados.clase_00_ejemplo).find(k => k.endsWith('|dictado'))].ok, 1);

    // 4. Dictado con una errata: decide el alumno.
    oida = oirFrase();
    boton(d, 'Siguiente →').click();
    ru = await oida;
    const larga = ru.match(/[\p{L}]{3,}/gu).sort((a, b) => b.length - a.length)[0];
    const errata = ru.replace(larga, larga.slice(0, -1) + (larga.at(-1) === 'ж' ? 'ш' : 'ж'));
    d.getElementById('respuesta').value = errata;
    boton(d, 'Comprobar').click();
    cierto(d.querySelector('.diff .w-casi'), `no se marcó la errata en «${errata}»`);
    const okAntes = contar('ok');
    boton(d, 'Lo tenía bien').click();
    igual(contar('ok'), okAntes + 1);

    // 5. «Lento» reproduce otra vez la misma frase.
    oida = oirFrase();
    boton(d, 'Siguiente →').click();
    ru = await oida;
    oida = oirFrase();
    boton(d, 'Lento').click();
    igual(await oida, ru);
  } finally {
    marco.remove();
    if (copia === null) localStorage.removeItem(CLAVE);
    else localStorage.setItem(CLAVE, copia);
  }
});
