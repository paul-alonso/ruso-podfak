// Reiniciar progreso: alcances, marcas de reinicio al combinar, propagación
// por la sincronización y la página de Ajustes.

import { prueba, igual, cierto } from './mini.js';
import { crearAlmacen, combinar, normalizar, CLAVE, hoy } from '../js/storage.js';
import { repasar } from '../js/srs.js';
import { crearSync, contenido, CLAVE_SYNC } from '../js/sync.js';
import { crearGitHub } from './github-falso.js';

const espera = ms => new Promise(r => setTimeout(r, ms));

function memoria() {
  const m = new Map();
  return { m, getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

/** Un almacén con progreso en dos clases, tarjetas y ajustes propios. */
function conProgreso() {
  const a = crearAlmacen(memoria());
  a.fijarAjuste('velocidad', 1);
  a.fijarSeleccion('clase_01', 'clase_02');
  a.fijarNivelacion({ claseGrupo: 'clase_03', ritmo: 2 });
  a.marcarVista('clase_01', 't1/f1');
  a.marcarVista('clase_02', 't1/f1');
  a.registrarResultado('traduccion', 'clase_01', 'p1', 'ru-es', true);
  a.registrarResultado('escucha', 'clase_02', 'p1', 'dictado', false);
  a.guardarRepaso('v_dom|ru-es', repasar(undefined, 'bien', hoy()), true);
  a.guardarRepaso('v_kot|ru-es', repasar(undefined, 'bien', hoy()), true);
  a.anadirTarjeta({ clave: 'forma_x', ru: 'х', es: 'x', clase: 'clase_01' });
  return a;
}

const claves = obj => Object.keys(obj).sort();

// --- alcances ---

prueba('reinicio: «todo» borra el progreso y conserva ajustes, selección y nivelación', () => {
  const a = conProgreso();
  a.reiniciar({ tipo: 'todo' });
  const e = a.leer();
  igual([claves(e.lector.vistas.clase_01 ?? {}), claves(e.lector.vistas.clase_02 ?? {})], [[], []]);
  igual(Object.values(e.traduccion.resultados).flatMap(Object.keys), []);
  igual([e.srs.estados, e.tarjetas, e.actividad], [{}, {}, {}]);
  igual([e.estadisticas.tarjetas.ok, e.estadisticas.tarjetas.mal], [0, 0]);
  cierto(e.reinicios.todo > 0 && e.estadisticas.tarjetas.desde === e.reinicios.todo, 'falta la marca de reinicio');
  igual([e.ajustes.velocidad, e.seleccion, e.nivelacion.claseGrupo], [1, { desde: 'clase_01', hasta: 'clase_02' }, 'clase_03']);
});

prueba('reinicio: «tarjetas» solo borra el repaso espaciado', () => {
  const a = conProgreso();
  a.reiniciar({ tipo: 'tarjetas' });
  const e = a.leer();
  igual([e.srs.estados, e.estadisticas.tarjetas.ok], [{}, 0]);
  igual([claves(e.lector.vistas), claves(e.tarjetas)], [['clase_01', 'clase_02'], ['forma_x']]);
  igual(claves(e.traduccion.resultados.clase_01), ['p1|ru-es']);
});

prueba('reinicio: «una clase» borra solo esa clase y el repaso de sus palabras', () => {
  const a = conProgreso();
  a.reiniciar({ tipo: 'clase', clase: 'clase_01', claves: ['v_dom', 'forma_x'] });
  const e = a.leer();
  igual([claves(e.lector.vistas.clase_01), claves(e.lector.vistas.clase_02)], [[], ['t1/f1']]);
  igual([claves(e.traduccion.resultados.clase_01), claves(e.escucha.resultados.clase_02)], [[], ['p1|dictado']]);
  igual(claves(e.srs.estados), ['v_kot|ru-es']);
  igual(claves(e.tarjetas), ['forma_x']); // la palabra añadida se queda; su repaso no
  igual(e.reinicios.clases.clase_01.claves, ['v_dom', 'forma_x']);
});

// --- combinar con marcas ---

prueba('reinicio: al combinar, lo anterior a la marca no vuelve y lo posterior sí (en los dos sentidos)', async () => {
  const a = conProgreso();
  const viejo = a.leer();               // lo que tiene el Gist u otro dispositivo
  await espera(3);
  a.reiniciar({ tipo: 'clase', clase: 'clase_01', claves: ['v_dom'] });
  await espera(3);
  const otro = crearAlmacen(memoria());  // otro dispositivo estudia la clase 1 después del reinicio
  otro.guardarSincronizado(viejo);
  otro.registrarResultado('traduccion', 'clase_01', 'p2', 'ru-es', true);

  for (const c of [combinar(a.leer(), otro.leer()), combinar(otro.leer(), a.leer())]) {
    igual(claves(c.traduccion.resultados.clase_01), ['p2|ru-es']);
    igual(claves(c.lector.vistas.clase_01 ?? {}), []);
    igual(claves(c.lector.vistas.clase_02), ['t1/f1']);
    igual(claves(c.srs.estados), ['v_kot|ru-es']);
  }
  const c = combinar(a.leer(), otro.leer());
  igual(contenido(combinar(c, otro.leer())), contenido(c));
  igual(contenido(combinar(c, viejo)), contenido(c));
});

prueba('reinicio: los datos antiguos sin hora cuentan como anteriores a la marca', () => {
  const antiguo = normalizar({
    lector: { vistas: { clase_01: { 't1/f1': '2026-10-01' } } },
    traduccion: { resultados: { clase_01: { 'p1|ru-es': { ok: 3, mal: 0, ultima: '2026-10-01' } } } },
    srs: { estados: { 'v_dom|ru-es': { ef: 2.5, intervalo: 3, reps: 2, lapsos: 0, vence: '2026-10-04', ultima: '2026-10-01' } } },
    estadisticas: { tarjetas: { ok: 9, mal: 1 } },
    actividad: { '2026-10-01': true },
  });
  const a = crearAlmacen(memoria());
  a.reiniciar({ tipo: 'todo' });
  const c = combinar(a.leer(), antiguo);
  igual([c.lector.vistas.clase_01, c.traduccion.resultados.clase_01, c.srs.estados, c.actividad], [{}, {}, {}, {}]);
  igual([c.estadisticas.tarjetas.ok, c.estadisticas.tarjetas.mal], [0, 0]);
});

prueba('reinicio: importar el respaldo recupera el progreso y no lo vuelve a borrar el Gist viejo', async () => {
  const a = conProgreso();
  const respaldo = a.exportar().progreso;
  const viejo = a.leer();
  await espera(3);
  a.reiniciar({ tipo: 'todo' });
  await espera(3);
  a.importar(respaldo, 'reemplazar');
  const e = a.leer();
  igual([claves(e.lector.vistas), claves(e.srs.estados), claves(e.tarjetas)], [['clase_01', 'clase_02'], ['v_dom|ru-es', 'v_kot|ru-es'], ['forma_x']]);
  cierto(e.reinicios.todo > 0, 'la marca debe seguir (para descartar datos viejos de otros dispositivos)');
  const c = combinar(e, viejo);
  igual([claves(c.lector.vistas.clase_01), claves(c.srs.estados)], [['t1/f1'], ['v_dom|ru-es', 'v_kot|ru-es']]);
});

// --- sincronización ---

function dispositivo(github) {
  const backend = memoria();
  const almacen = crearAlmacen(backend);
  const sync = crearSync({ almacen, backend, fetchFn: github.fetchFn, retardo: 60000 });
  return { almacen, sync };
}

prueba('reinicio: se propaga por el Gist a otro dispositivo y lo estudiado después sí llega', async () => {
  const github = crearGitHub();
  const a = dispositivo(github);
  const b = dispositivo(github);
  a.almacen.marcarVista('clase_01', 't1/f1');
  a.almacen.marcarVista('clase_02', 't1/f1');
  a.almacen.guardarRepaso('v_dom|ru-es', repasar(undefined, 'bien', hoy()), true);
  await a.sync.conectar('ghp_bueno');
  await b.sync.conectar('ghp_bueno');
  igual(claves(b.almacen.leer().lector.vistas), ['clase_01', 'clase_02']);

  // A reinicia la clase 1: el Gist y B la pierden; la clase 2 se queda.
  await espera(3);
  a.almacen.reiniciar({ tipo: 'clase', clase: 'clase_01', claves: ['v_dom'] });
  await a.sync.sincronizar();
  await b.sync.sincronizar();
  igual([claves(b.almacen.leer().lector.vistas.clase_01 ?? {}), claves(b.almacen.leer().lector.vistas.clase_02)], [[], ['t1/f1']]);
  igual(b.almacen.leer().srs.estados, {});
  igual(claves(github.progreso().lector.vistas.clase_01 ?? {}), []);

  // B vuelve a estudiar la clase 1: llega a A.
  await espera(3);
  b.almacen.marcarVista('clase_01', 't2/f1');
  await b.sync.sincronizar();
  await a.sync.sincronizar();
  igual(claves(a.almacen.leer().lector.vistas.clase_01), ['t2/f1']);

  // B reinicia todo: A se queda sin progreso, pero con sus ajustes.
  a.almacen.fijarAjuste('acentos', false);
  await espera(3);
  b.almacen.reiniciar({ tipo: 'todo' });
  await b.sync.sincronizar();
  await a.sync.sincronizar();
  const ea = a.almacen.leer();
  igual([Object.values(ea.lector.vistas).flatMap(Object.keys), ea.srs.estados, ea.ajustes.acentos], [[], {}, false]);
});

// --- página de Ajustes ---

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

prueba('Ajustes: reiniciar una clase (con respaldo descargado y deshacer) y reiniciar todo', async () => {
  const copias = [CLAVE, CLAVE_SYNC, `${CLAVE}_antes_de_importar`].map(k => [k, localStorage.getItem(k)]);
  localStorage.removeItem(CLAVE_SYNC);
  localStorage.setItem(CLAVE, JSON.stringify({
    version: 1,
    ajustes: { velocidad: 1 },
    seleccion: { desde: 'clase_00_ejemplo', hasta: 'clase_00_ejemplo' },
    lector: { vistas: { clase_00_ejemplo: { 't1/f1': '2026-10-15' }, clase_02: { 't1/f1': '2026-10-15' } } },
  }));
  const guardado = () => JSON.parse(localStorage.getItem(CLAVE));
  const marco = await abrir('../ajustes.html');
  try {
    const w = marco.contentWindow;
    const d = marco.contentDocument;
    const boton = (texto, dentro = d) => [...dentro.querySelectorAll('button')].find(b => b.textContent.trim() === texto);
    await esperar(() => boton('Reiniciar progreso…'), 'sección de reinicio');
    const descargas = [];
    w.URL.createObjectURL = b => { descargas.push(b); return 'blob:prueba'; };
    w.HTMLAnchorElement.prototype.click = function () { descargas.at(-1).nombre = this.download; };

    // Por defecto: una clase, la elegida (clase 0).
    igual(d.querySelector('input[name="alcance-reinicio"]:checked').value, 'clase');
    igual(d.getElementById('reiniciar-clase').value, 'clase_00_ejemplo');
    boton('Reiniciar progreso…').click();
    const dlg = await esperar(() => d.querySelector('dialog.hoja[open]'), 'confirmación');
    cierto(dlg.textContent.includes('Se borrará: 1 frase leída'), dlg.textContent);
    boton('Sí, reiniciar', dlg).click();
    igual(d.querySelectorAll('dialog.hoja').length, 0, 'el diálogo debe desaparecer');
    await esperar(() => d.querySelector('.zona-peligro .aviso.ok'), 'reiniciado');

    igual(descargas.length, 1);
    cierto(/^podfak-respaldo-\d{4}-\d{2}-\d{2}-\d{4}\.json$/.test(descargas[0].nombre), descargas[0].nombre);
    const respaldo = JSON.parse(await descargas[0].text());
    igual(Object.keys(respaldo.progreso.lector.vistas.clase_00_ejemplo), ['t1/f1']);
    igual([Object.keys(guardado().lector.vistas.clase_00_ejemplo), Object.keys(guardado().lector.vistas.clase_02)], [[], ['t1/f1']]);
    igual(guardado().ajustes.velocidad, 1);

    // Deshacer devuelve la clase.
    boton('Deshacer').click();
    await esperar(() => d.querySelector('.zona-peligro')?.textContent.includes('Se recuperó'), 'deshecho');
    igual(Object.keys(guardado().lector.vistas.clase_00_ejemplo), ['t1/f1']);

    // Todo.
    d.querySelector('input[name="alcance-reinicio"][value="todo"]').click();
    cierto(d.getElementById('reiniciar-clase').disabled, 'la clase no aplica a «todo»');
    boton('Reiniciar progreso…').click();
    await esperar(() => d.querySelector('dialog.hoja[open]')?.textContent.includes('¿Reiniciar todo'), 'confirmación de todo');
    boton('Sí, reiniciar', d.querySelector('dialog.hoja[open]')).click();
    await esperar(() => guardado().reinicios.todo > 0, 'reinicio total');
    igual(Object.values(guardado().lector.vistas).flatMap(Object.keys), []);
    igual([guardado().ajustes.velocidad, guardado().seleccion.desde], [1, 'clase_00_ejemplo']);
    igual(descargas.length, 2);
  } finally {
    marco.remove();
    for (const [k, v] of copias) {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    }
  }
});
