// Prueba de integración de la Home: nivelación, resumen de progreso,
// exportar e importar. Guarda y restaura el progreso real (podfak_v1).

import { prueba, igual, cierto } from './mini.js';
import { CLAVE, hoy } from '../js/storage.js';

function abrir(url) {
  return new Promise(resolver => {
    const marco = document.createElement('iframe');
    marco.style.cssText = 'width:360px;height:640px;border:1px solid #888';
    marco.onload = () => resolver(marco);
    marco.src = url;
    document.body.append(marco);
  });
}

async function esperar(condicion, que = '', ms = 5000) {
  const inicio = performance.now();
  while (performance.now() - inicio < ms) {
    const v = condicion();
    if (v) return v;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`tiempo agotado esperando: ${que}`);
}

const guardado = () => JSON.parse(localStorage.getItem(CLAVE) ?? '{}');
const boton = (d, texto) => [...d.querySelectorAll('button')].find(b => b.textContent.trim() === texto);

prueba('Home: plan de nivelación, progreso y enlace a Ajustes', async () => {
  const copia = localStorage.getItem(CLAVE);
  const respaldo = localStorage.getItem(`${CLAVE}_antes_de_importar`);
  localStorage.setItem(CLAVE, JSON.stringify({
    version: 1,
    seleccion: { desde: 'clase_00_ejemplo', hasta: 'clase_00_ejemplo' },
    nivelacion: { claseGrupo: 'clase_02', ritmo: 1, plan: null },
    lector: { vistas: { clase_00_ejemplo: { 't1/f1': hoy() } } },
    actividad: { [hoy()]: true },
  }));
  const marco = await abrir('../index.html');
  try {
    let d = marco.contentDocument;
    const niv = await esperar(() => d.querySelector('.nivelacion'), 'paso 1');

    // Nivelación: la clase de ejemplo no cuenta; hoy toca la primera sin cubrir.
    cierto(niv.textContent.includes('El grupo va en Clase 2'), niv.textContent);
    cierto(niv.textContent.includes('0 de 2 cubiertas'), niv.textContent);
    igual([...niv.querySelectorAll('.plan-clase strong')].map(s => s.textContent)[0], 'Clase 1');
    igual(guardado().nivelacion.plan, { fecha: hoy(), clases: ['clase_01'] });

    // Resumen: racha de 1 día, aciertos sin datos.
    const resumen = d.querySelector('.progreso-resumen').textContent;
    cierto(resumen.includes('🔥 1 día') && resumen.includes('¡Hoy ya practicaste!'), resumen);

    // La Home enlaza con Ajustes (exportar, importar y sincronizar están allí).
    cierto(d.querySelector('a.enlace-tarjeta[href="ajustes.html"]'), 'falta el enlace a Ajustes');

    // Editar la nivelación: el grupo en «la última clase», 2 por día.
    boton(d, 'Cambiar').click();
    const dlg = d.querySelector('dialog.hoja[open]');
    dlg.querySelector('select').value = 'ultima';
    [...dlg.querySelectorAll('.segmentado button')].find(b => b.textContent === '2').click();
    boton(d, 'Guardar').click();
    await esperar(() => guardado().nivelacion.claseGrupo === 'ultima', 'paso 6');
    igual(guardado().nivelacion.ritmo, 2);
    d = marco.contentDocument;
    igual([...d.querySelectorAll('.nivelacion .plan-clase strong')].slice(0, 2).map(s => s.textContent), ['Clase 1', 'Clase 2']);
  } finally {
    marco.remove();
    if (copia === null) localStorage.removeItem(CLAVE);
    else localStorage.setItem(CLAVE, copia);
    if (respaldo === null) localStorage.removeItem(`${CLAVE}_antes_de_importar`);
    else localStorage.setItem(`${CLAVE}_antes_de_importar`, respaldo);
  }
});
