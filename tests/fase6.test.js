import { prueba, igual, cierto } from './mini.js';
import {
  avanceClase, avances, frasesAcertadas, resumenPalabras, aciertos, racha, planNivelacion, ULTIMA,
} from '../js/progreso.js';
import { normalizar, combinar, leerPaquete, crearAlmacen, paqueteExportacion } from '../js/storage.js';
import { mazoDeEstudio, sumarDias } from '../js/srs.js';

const ejemplo = await (await fetch('../data/clases/clase_00_ejemplo.json')).json();
const HOY = '2026-10-15';

function memoria() {
  const m = new Map();
  return { m, getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

const srsEstado = (intervalo, ultima = HOY) => ({ ef: 2.5, intervalo, reps: intervalo ? 1 : 0, lapsos: 0, vence: sumarDias(ultima, intervalo), ultima, primera: ultima });

/** Clase mínima para las pruebas de nivelación. */
const clase = (id, extra = {}) => ({ id, urok: 1, titulo: id, fecha: HOY, gramatica: [], vocabulario: [], textos: [], frases_practica: [], ...extra });

// --- avance y cobertura ---

prueba('avance: media de lectura, práctica y vocabulario; cubierta con ≥ 70 %', () => {
  const vistas = Object.fromEntries(ejemplo.textos.flatMap(t => t.frases.map(f => [`${t.id}/${f.id}`, HOY])));
  let estado = normalizar({ lector: { vistas: { clase_00_ejemplo: vistas } } });
  let a = avanceClase(ejemplo, estado, frasesAcertadas([ejemplo], estado));
  igual([a.lectura.hechas, a.lectura.total, a.practica.hechas, a.vocabulario.hechas], [13, 13, 0, 0]);
  igual(Math.round(a.avance * 100), 33);

  // Todas las frases acertadas: 2/3 → aún no cubierta.
  const resultados = Object.fromEntries([
    ...ejemplo.frases_practica.map(p => [`${p.id}|ru-es`, { ok: 1, mal: 0 }]),
    ...ejemplo.textos.flatMap(t => t.frases.map(f => [`${t.id}/${f.id}|dictado`, { ok: 1, mal: 2 }])),
  ]);
  estado = normalizar({ ...estado, traduccion: { resultados: { clase_00_ejemplo: resultados } } });
  a = avanceClase(ejemplo, estado, frasesAcertadas([ejemplo], estado));
  igual([a.practica.hechas, a.practica.total, a.cubierta], [17, 17, false]);

  // Dos palabras empezadas: (1 + 1 + 2/15) / 3 = 71 % → cubierta. «Otra vez» no cuenta como empezada.
  estado.srs.estados = { 'v_dom|ru-es': srsEstado(1), 'v_mama|es-ru': srsEstado(3), 'v_papa|ru-es': srsEstado(0) };
  a = avanceClase(ejemplo, estado, frasesAcertadas([ejemplo], estado));
  igual([a.vocabulario.hechas, Math.round(a.avance * 100), a.cubierta], [2, 71, true]);
});

prueba('avance: una frase acertada desde otra clase cuenta en las dos', () => {
  const frase = { id: 'p1', ru: 'Кто это?', es: '¿Quién es?' };
  const a = clase('clase_01', { frases_practica: [frase] });
  const b = clase('clase_02', { frases_practica: [{ ...frase, id: 'p7' }] });
  const estado = normalizar({ escucha: { resultados: { clase_01: { 'p1|significado': { ok: 1, mal: 0 } } } } });
  const mapa = avances([a, b], estado);
  igual([mapa.get('clase_01').practica.hechas, mapa.get('clase_02').practica.hechas], [1, 1]);
});

prueba('resumenPalabras: aprendidas (intervalo ≥ 3), aprendiendo y sin empezar', () => {
  const estado = normalizar({
    srs: { estados: { 'v_dom|ru-es': srsEstado(8), 'v_dom|es-ru': srsEstado(1), 'v_mama|ru-es': srsEstado(1), 'forma_x|ru-es': srsEstado(3) } },
    tarjetas: { forma_x: { clave: 'forma_x', ru: 'х', es: 'x' } },
  });
  igual(resumenPalabras([ejemplo], estado), { aprendidas: 2, aprendiendo: 1, sinEmpezar: 13, total: 16 });
});

prueba('aciertos suma todos los intentos por herramienta', () => {
  const estado = normalizar({
    traduccion: { resultados: { c1: { 'p1|ru-es': { ok: 2, mal: 1 } }, c2: { 'p1|es-ru': { ok: 1, mal: 0 } } } },
    estadisticas: { tarjetas: { ok: 5, mal: 2 } },
    lector: { vistas: { c1: { 't1/f1': HOY, 't1/f2': HOY } } },
  });
  const a = aciertos(estado);
  igual([a.traduccion, a.escucha, a.tarjetas, a.lector], [{ ok: 3, mal: 1 }, { ok: 0, mal: 0 }, { ok: 5, mal: 2 }, 2]);
});

prueba('racha: días seguidos; si hoy aún no hay actividad, cuenta desde ayer', () => {
  const dias = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [sumarDias(HOY, -i), true]));
  igual(racha(dias(3), HOY), { dias: 3, hoy: true, total: 3 });
  const sinHoy = { [sumarDias(HOY, -1)]: true, [sumarDias(HOY, -2)]: true, [sumarDias(HOY, -5)]: true };
  igual(racha(sinHoy, HOY), { dias: 2, hoy: false, total: 3 });
  igual(racha({ [sumarDias(HOY, -3)]: true }, HOY).dias, 0);
});

// --- nivelación ---

const clases = ['clase_00_ejemplo', 'clase_01', 'clase_02', 'clase_03', 'clase_04', 'clase_05'].map(id => clase(id));
const mapaCon = cubiertas => new Map(clases.map(c => [c.id, { cubierta: cubiertas.includes(c.id), avance: 0 }]));

prueba('nivelación: plan del día con las primeras clases sin cubrir (sin la de ejemplo)', () => {
  const plan = planNivelacion(clases, mapaCon(['clase_01']), { claseGrupo: 'clase_04', ritmo: 2, plan: null }, HOY);
  igual([plan.objetivo, plan.cubiertas, plan.pendientes], [4, 1, 3]);
  igual(plan.clasesHoy, ['clase_02', 'clase_03']);
  igual([plan.planNuevo, plan.dias, plan.fechaFin, plan.alDia], [true, 2, sumarDias(HOY, 1), false]);
  igual(planNivelacion(clases, mapaCon([]), { claseGrupo: ULTIMA, ritmo: 1, plan: null }, HOY).objetivo, 5);
});

prueba('nivelación: el plan de hoy se mantiene, se completa y se puede adelantar', () => {
  const niv = { claseGrupo: 'clase_04', ritmo: 2, plan: { fecha: HOY, clases: ['clase_02', 'clase_03'] } };
  let plan = planNivelacion(clases, mapaCon(['clase_01', 'clase_02']), niv, HOY);
  igual([plan.clasesHoy, plan.planNuevo, plan.completadoHoy], [['clase_02', 'clase_03'], false, false]);
  plan = planNivelacion(clases, mapaCon(['clase_01', 'clase_02', 'clase_03']), niv, HOY);
  igual([plan.completadoHoy, plan.siguiente], [true, 'clase_04']);
  // Un plan de ayer no vale: se rehace.
  plan = planNivelacion(clases, mapaCon(['clase_01', 'clase_02', 'clase_03']), { ...niv, plan: { fecha: '2026-10-14', clases: ['clase_02'] } }, HOY);
  igual([plan.clasesHoy, plan.planNuevo], [['clase_04'], true]);
  igual(planNivelacion(clases, mapaCon(['clase_01', 'clase_02', 'clase_03', 'clase_04']), niv, HOY).alDia, true);
});

// --- tarjetas: repasos de clases no elegidas ---

prueba('mazoDeEstudio: las tarjetas empezadas de otras clases siguen saliendo', () => {
  const otra = clase('clase_09', { vocabulario: [{ id: 'v_kot', ru: 'кот', ru_acento: 'ко́т', es: 'gato', tipo: 'sustantivo', genero: 'm' }] });
  const base = { seleccion: [ejemplo], todas: [ejemplo, otra], anadidas: {}, vocabulario: new Map(), modo: 'ru-es' };
  igual(mazoDeEstudio({ ...base, estados: {} }).length, 15);
  igual(mazoDeEstudio({ ...base, estados: { 'v_kot|ru-es': srsEstado(1) } }).length, 16);
  igual(mazoDeEstudio({ ...base, estados: { 'v_kot|es-ru': srsEstado(1) } }).length, 15);
});

// --- exportar, importar y combinar ---

const progresoA = () => normalizar({
  ajustes: { velocidad: 0.6 },
  seleccion: { desde: 'clase_01', hasta: 'clase_01' },
  lector: { vistas: { clase_01: { 't1/f1': '2026-10-10' } } },
  traduccion: { resultados: { clase_01: { 'p1|ru-es': { ok: 2, mal: 1, ultima: '2026-10-10', ultimaOk: true } } } },
  srs: { estados: { 'v_dom|ru-es': srsEstado(3, '2026-10-10') } },
  estadisticas: { tarjetas: { ok: 4, mal: 1 } },
  actividad: { '2026-10-10': true },
});
const progresoB = () => normalizar({
  ajustes: { velocidad: 1 },
  lector: { vistas: { clase_01: { 't1/f1': '2026-10-12', 't1/f2': '2026-10-12' } } },
  traduccion: { resultados: { clase_01: { 'p1|ru-es': { ok: 1, mal: 3, ultima: '2026-10-12', ultimaOk: false } } } },
  srs: { estados: { 'v_dom|ru-es': srsEstado(8, '2026-10-12'), 'v_mama|ru-es': srsEstado(1, '2026-10-12') } },
  estadisticas: { tarjetas: { ok: 2, mal: 6 } },
  actividad: { '2026-10-12': true },
  tarjetas: { forma_x: { clave: 'forma_x', ru: 'х', es: 'x' } },
});

prueba('combinar: une el progreso, quedan los ajustes locales y no duplica', () => {
  const c = combinar(progresoA(), progresoB());
  igual(c.ajustes.velocidad, 0.6);
  igual(c.seleccion, { desde: 'clase_01', hasta: 'clase_01' });
  igual(c.lector.vistas.clase_01, { 't1/f1': '2026-10-10', 't1/f2': '2026-10-12' });
  igual(c.traduccion.resultados.clase_01['p1|ru-es'], { ok: 2, mal: 3, ultima: '2026-10-12', ultimaOk: false });
  igual([c.srs.estados['v_dom|ru-es'].intervalo, Object.keys(c.srs.estados).length], [8, 2]);
  igual(c.estadisticas.tarjetas, { ok: 4, mal: 6 });
  igual(Object.keys(c.actividad).sort(), ['2026-10-10', '2026-10-12']);
  igual(Object.keys(c.tarjetas), ['forma_x']);
  // Importar dos veces lo mismo no cambia nada.
  igual(combinar(c, progresoB()), c);
});

prueba('leerPaquete: acepta exportaciones y rechaza archivos ajenos o dañados', () => {
  cierto(leerPaquete('{roto').error.includes('JSON'), 'JSON roto');
  cierto(leerPaquete('{"hola": 1}').error.includes('no es un progreso'), 'objeto ajeno');
  cierto(leerPaquete(JSON.stringify(paqueteExportacion({ version: 2 }))).error.includes('versión 2'), 'versión');
  const { progreso, exportado } = leerPaquete(JSON.stringify(paqueteExportacion(progresoA(), new Date('2026-10-15T10:00:00Z'))));
  igual([progreso, exportado], [progresoA(), '2026-10-15T10:00:00.000Z']);
  igual(leerPaquete(JSON.stringify(progresoA())).progreso, progresoA()); // copia directa de localStorage
  // Valores dañados se descartan sin romper nada.
  const danado = { ...progresoA(), traduccion: { resultados: { clase_01: { 'p1|ru-es': { ok: 'x' } }, clase_02: 5 } }, srs: { estados: { 'v|ru-es': { ef: 'no' } } } };
  const p = leerPaquete(JSON.stringify(paqueteExportacion(danado))).progreso;
  igual([p.traduccion.resultados, p.srs.estados], [{ clase_01: {} }, {}]);
});

prueba('exportar en un dispositivo e importar en otro reproduce el mismo progreso; deshacer vuelve atrás', () => {
  const pc = crearAlmacen(memoria());
  pc.importar(progresoA(), 'reemplazar');
  pc.marcarVista('clase_01', 't2/f1');
  const archivo = JSON.stringify(pc.exportar());

  const movil = crearAlmacen(memoria());
  movil.marcarVista('clase_05', 't1/f1');
  const antes = movil.leer();
  const { progreso } = leerPaquete(archivo);
  movil.importar(progreso, 'reemplazar');
  igual(movil.leer(), pc.leer());
  cierto(movil.deshacerImportacion(), 'debería poder deshacer');
  igual(movil.leer(), antes);

  movil.importar(progreso, 'combinar');
  cierto(movil.leer().lector.vistas.clase_05 && movil.leer().lector.vistas.clase_01, 'combinar conserva ambos');
});
