// Prueba de integración de Ajustes: sincronización (contra un GitHub
// simulado), exportar e importar. Guarda y restaura el progreso real.

import { prueba, igual, cierto } from './mini.js';
import { CLAVE, hoy, normalizar } from '../js/storage.js';
import { CLAVE_SYNC } from '../js/sync.js';
import { crearGitHub } from './github-falso.js';

function abrir(url) {
  return new Promise(resolver => {
    const marco = document.createElement('iframe');
    marco.style.cssText = 'width:360px;height:640px;border:1px solid #888';
    marco.onload = () => resolver(marco);
    marco.src = url;
    document.body.append(marco);
  });
}

async function esperar(condicion, que, ms = 5000) {
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

/** Ejecuta `fn` con este progreso y, si se da, con un GitHub simulado para las páginas de la app. */
async function conProgreso(estado, fn, github = null) {
  const copias = [CLAVE, CLAVE_SYNC, `${CLAVE}_antes_de_importar`].map(k => [k, localStorage.getItem(k)]);
  localStorage.removeItem(CLAVE_SYNC);
  localStorage.setItem(CLAVE, JSON.stringify(estado));
  if (github) window.podfakFetchPrueba = github.fetchFn; // ver fetchDePruebas en js/sync.js
  try {
    await fn();
  } finally {
    window.podfakFetchPrueba = window.sinRedEnPruebas;
    for (const [k, v] of copias) {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    }
  }
}

const BASE = {
  version: 1,
  seleccion: { desde: 'clase_00_ejemplo', hasta: 'clase_00_ejemplo' },
  lector: { vistas: { clase_00_ejemplo: { 't1/f1': hoy() } } },
  actividad: { [hoy()]: true },
};

const githubConectar = crearGitHub({ token: 'ghp_prueba' });

prueba('Ajustes: conectar con un token, indicador de estado, sin conexión y desconectar', () => conProgreso(BASE, async () => {
  const github = githubConectar;
  const marco = await abrir('../ajustes.html');
  try {
    const w = marco.contentWindow;
    const d = marco.contentDocument;
    const campo = await esperar(() => d.getElementById('token'), 'campo del token');
    const indicador = d.querySelector('.enlace-ajustes');
    igual(indicador.dataset.sync, 'desconectado');
    cierto(d.querySelector('.pasos-token a').href.includes('scopes=gist'), 'el enlace no pide solo «gist»');
    const sinBasura = () => cierto(!/null|false|undefined/.test(d.querySelector('.ajustes-sync').textContent), d.querySelector('.ajustes-sync').textContent);
    sinBasura();

    // Token equivocado: error claro y nada guardado.
    campo.value = 'ghp_otro';
    boton(d, 'Conectar').click();
    await esperar(() => d.querySelector('.ajustes-sync .aviso.error'), 'error de token');
    igual(localStorage.getItem(CLAVE_SYNC), null);

    // Token bueno: crea el Gist y queda sincronizado.
    d.getElementById('token').value = 'ghp_prueba';
    boton(d, 'Conectar').click();
    await esperar(() => d.querySelector('.estado-sync[data-sync="sincronizado"]'), 'sincronizado');
    igual(indicador.dataset.sync, 'sincronizado');
    cierto(indicador.getAttribute('aria-label').includes('Sincronizado'), indicador.getAttribute('aria-label'));
    sinBasura();
    igual(Object.keys(github.progreso().lector.vistas), ['clase_00_ejemplo']);
    cierto(!localStorage.getItem(CLAVE).includes('ghp_prueba'), 'el token no debe ir en el progreso');

    // Sin conexión: la app sigue y el indicador lo dice; al volver la conexión, sincroniza.
    github.estado.sinConexion = true;
    boton(d, 'Sincronizar ahora').click();
    await esperar(() => indicador.dataset.sync === 'sin-conexion', 'sin conexión');
    github.estado.sinConexion = false;
    w.dispatchEvent(new w.Event('online'));
    await esperar(() => indicador.dataset.sync === 'sincronizado', 'vuelta de la conexión');

    // Desconectar: borra el token del dispositivo, el progreso sigue.
    boton(d, 'Desconectar').click();
    igual(localStorage.getItem(CLAVE_SYNC), null);
    igual(indicador.dataset.sync, 'desconectado');
    cierto(d.getElementById('token'), 'debería volver a pedir el token');
    igual(Object.keys(guardado().lector.vistas), ['clase_00_ejemplo']);
  } finally {
    marco.remove();
  }
}, githubConectar));

const githubAbrir = crearGitHub({ token: 'ghp_prueba' });

prueba('Ajustes: al abrir la app conectada se descarga y combina el progreso del Gist', () => conProgreso(BASE, async () => {
  const github = githubAbrir;
  // Otro dispositivo ya subió una frase leída de la clase 2.
  const otro = normalizar({ version: 1, lector: { vistas: { clase_02: { 't1/f1': '2026-10-12' } } } });
  github.gists.set('gist9', {
    id: 'gist9', html_url: 'https://gist.github.com/gist9', public: false,
    files: { 'ruso-podfak-progreso.json': { content: JSON.stringify({ formato: 'ruso-podfak/progreso', version: 1, progreso: otro }) } },
  });
  localStorage.setItem(CLAVE_SYNC, JSON.stringify({ token: 'ghp_prueba', gistId: 'gist9', gistUrl: '', ultimaSync: null, pendiente: false }));

  const marco = await abrir('../index.html');
  try {
    const d = marco.contentDocument;
    await esperar(() => d.querySelector('.enlace-ajustes')?.dataset.sync === 'sincronizado', 'indicador');
    igual(Object.keys(guardado().lector.vistas).sort(), ['clase_00_ejemplo', 'clase_02']);
    igual(Object.keys(github.progreso().lector.vistas).sort(), ['clase_00_ejemplo', 'clase_02']);
    // La Home se pinta ya con lo combinado: la frase de la clase 2 cuenta en su avance.
    await esperar(() => [...d.querySelectorAll('.clase-item')].some(li => li.textContent.includes('Clase 2') && li.textContent.includes('Lectura 1/')), 'Home combinada');
  } finally {
    marco.remove();
  }
}, githubAbrir));

prueba('Ajustes: exportar, importar (combinar), deshacer y archivo ajeno', () => conProgreso(BASE, async () => {
  const marco = await abrir('../ajustes.html');
  try {
    const w = marco.contentWindow;
    const d = marco.contentDocument;
    await esperar(() => boton(d, 'Exportar progreso'), 'botón exportar');

    // Exportar: se captura el archivo en vez de descargarlo.
    let blob = null;
    w.URL.createObjectURL = b => { blob = b; return 'blob:prueba'; };
    w.HTMLAnchorElement.prototype.click = function () { this.dataset.pulsado = this.download; };
    boton(d, 'Exportar progreso').click();
    cierto(blob, 'no se generó el archivo');
    const paquete = JSON.parse(await blob.text());
    igual(paquete.formato, 'ruso-podfak/progreso');
    igual(paquete.progreso, normalizar(guardado()));

    // Importar (combinar) un archivo de «otro dispositivo» con otra frase leída.
    paquete.progreso.lector.vistas.clase_02 = { 't1/f1': '2026-10-12' };
    const dt = new w.DataTransfer();
    dt.items.add(new w.File([JSON.stringify(paquete)], 'progreso.json', { type: 'application/json' }));
    const input = d.getElementById('importar-archivo');
    input.files = dt.files;
    input.dispatchEvent(new w.Event('change'));
    await esperar(() => d.querySelector('.confirmar-importacion'), 'confirmación');
    cierto(d.querySelector('.confirmar-importacion').textContent.includes('2 frases leídas'), d.querySelector('.confirmar-importacion').textContent);
    boton(d, 'Combinar').click();
    await esperar(() => d.querySelector('.datos-zona .aviso.ok'), 'importado');
    igual(Object.keys(guardado().lector.vistas).sort(), ['clase_00_ejemplo', 'clase_02']);

    boton(d, 'Deshacer').click();
    await esperar(() => d.querySelector('.datos-zona')?.textContent.includes('Se deshizo'), 'deshecho');
    igual(Object.keys(guardado().lector.vistas), ['clase_00_ejemplo']);

    const dt2 = new w.DataTransfer();
    dt2.items.add(new w.File(['{"hola": 1}'], 'otro.json'));
    const input2 = d.getElementById('importar-archivo'); // la página se volvió a pintar al deshacer
    input2.files = dt2.files;
    input2.dispatchEvent(new w.Event('change'));
    await esperar(() => d.querySelector('.datos-zona .aviso.error'), 'error de archivo');
  } finally {
    marco.remove();
  }
}));
