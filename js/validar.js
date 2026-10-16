// Página de validación: revisa las clases publicadas y permite comprobar un
// JSON antes de copiarlo a data/clases/. Con ?cli deja un informe en texto
// plano que lee herramientas/validar.ps1.

import {
  Informe, cargarIndice, cargarClases, validarReferencias, tituloClase,
  parsearJSON, validarClase, validarIndice,
} from './data.js';

const $ = sel => document.querySelector(sel);

function pintarInforme(contenedor, informe, detalle = null) {
  const art = document.createElement('article');
  const nErr = informe.errores.length;
  const nAv = informe.avisos.length;
  art.className = nErr ? 'error' : nAv ? 'aviso' : 'ok';

  const h = document.createElement('h3');
  const partes = [nErr && `${nErr} error${nErr > 1 ? 'es' : ''}`, nAv && `${nAv} aviso${nAv > 1 ? 's' : ''}`].filter(Boolean);
  h.textContent = `${nErr ? '✗' : '✓'} ${informe.origen}${partes.length ? ` — ${partes.join(', ')}` : ' — sin problemas'}`;
  art.append(h);
  if (detalle) {
    const p = document.createElement('p');
    p.className = 'detalle';
    p.textContent = detalle;
    art.append(p);
  }

  if (nErr || nAv) {
    const ul = document.createElement('ul');
    for (const [marca, lista] of [['✗', informe.errores], ['⚠', informe.avisos]]) {
      for (const p of lista) {
        const li = document.createElement('li');
        const ruta = document.createElement('code');
        ruta.textContent = p.ruta;
        li.append(`${marca} `, ruta, `: ${p.mensaje}`);
        ul.append(li);
      }
    }
    art.append(ul);
  }
  contenedor.append(art);
}

async function revisarPublicadas() {
  const { indice, informe } = await cargarIndice();
  const { clases, informes } = await cargarClases(indice);
  const todos = [informe, ...informes, validarReferencias(clases)];

  const cont = $('#publicadas');
  cont.replaceChildren();
  const porId = new Map(clases.map(c => [c.id, c]));
  todos.forEach(i => pintarInforme(cont, i, porId.has(i.origen) ? resumenClase(porId.get(i.origen)) : null));

  const errores = todos.reduce((n, i) => n + i.errores.length, 0);
  const avisos = todos.reduce((n, i) => n + i.avisos.length, 0);
  const resumen = `${clases.length} de ${indice.length} clases válidas · ${errores} errores · ${avisos} avisos`;
  $('#resumen').textContent = resumen;

  const plano = todos.flatMap(i => (i.lineas().length ? i.lineas() : [`✓ ${i.origen}`]));
  $('#texto-plano').textContent = [...plano, '', resumen].join('\n');
  document.body.dataset.errores = errores;
  document.body.dataset.estado = 'listo';
}

function revisarPegado(texto, nombreArchivo = '') {
  const { datos, problema } = parsearJSON(texto);
  let informe;
  if (problema) {
    informe = new Informe(nombreArchivo || 'JSON pegado');
    informe.error('(archivo)', problema);
  } else if (Array.isArray(datos)) {
    informe = validarIndice(datos);
  } else {
    const idEsperado = nombreArchivo ? nombreArchivo.replace(/\.json$/i, '') : null;
    informe = validarClase(datos, { idEsperado });
  }
  const cont = $('#resultado-pegado');
  cont.replaceChildren();
  pintarInforme(cont, informe);
}

$('#comprobar').addEventListener('click', () => revisarPegado($('#json').value));
$('#archivo').addEventListener('change', async e => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  const texto = await archivo.text();
  $('#json').value = texto;
  revisarPegado(texto, archivo.name);
});
$('#recargar').addEventListener('click', revisarPublicadas);

if (new URLSearchParams(location.search).has('cli')) $('#texto-plano').hidden = false;
revisarPublicadas();

/** Cómo se verá la clase en la app y qué tiene marcado como «Libro» o «Repaso». */
function resumenClase(c) {
  const contar = (lista, cond) => lista.filter(cond).length;
  const frases = c.textos.flatMap(t => t.frases.map(f => ({ ...f, fuente: f.fuente ?? t.fuente })));
  const partes = [
    ['textos del libro', contar(c.textos, t => t.fuente === 'libro')],
    ['frases del libro', contar(frases, f => f.fuente === 'libro')],
    ['temas de gramática del libro', contar(c.gramatica, g => g.fuente === 'libro')],
    ['palabras del libro', contar(c.vocabulario, v => v.fuente === 'libro')],
    ['textos de repaso', contar(c.textos, t => t.repaso === true)],
    ['temas de gramática de repaso', contar(c.gramatica, g => g.repaso === true)],
  ].filter(([, n]) => n > 0).map(([texto, n]) => `${texto}: ${n}`);
  return `Título: «${tituloClase(c)}»${c.profesor ? ` · Profesor/a: ${c.profesor}` : ''}${partes.length ? ` · ${partes.join(', ')}` : ''}`;
}
