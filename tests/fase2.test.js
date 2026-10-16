import { prueba, igual, cierto } from './mini.js';
import { crearAlmacen, normalizar, hoy, CLAVE, AJUSTES_INICIALES } from '../js/storage.js';
import { elegirVoz } from '../js/tts.js';
import { nombreClase, etiquetaSeleccion, rangoSeleccion } from '../js/comun.js';

function memoria(inicial = {}) {
  const m = new Map(Object.entries(inicial));
  return { m, getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
}

// --- storage.js ---

prueba('almacén vacío devuelve los ajustes por defecto', () => {
  const a = crearAlmacen(memoria());
  igual(a.ajustes(), { ...AJUSTES_INICIALES });
  igual(a.seleccion(), null);
});

prueba('los cambios se guardan bajo la clave podfak_v1', () => {
  const b = memoria();
  const a = crearAlmacen(b);
  a.fijarAjuste('velocidad', 0.6);
  a.fijarSeleccion('clase_03', 'clase_05');
  const otro = crearAlmacen(b);
  igual(otro.ajustes().velocidad, 0.6);
  igual(otro.seleccion(), { desde: 'clase_03', hasta: 'clase_05' });
  cierto(JSON.parse(b.m.get(CLAVE)).version === 1, 'falta version');
});

prueba('normalizar descarta valores con forma incorrecta y conserva claves desconocidas', () => {
  const e = normalizar({ ajustes: { velocidad: 2, acentos: 'sí', primeroIntenta: true }, seleccion: { desde: 1 }, futuro: { x: 1 } });
  igual(e.ajustes.velocidad, AJUSTES_INICIALES.velocidad);
  igual(e.ajustes.acentos, AJUSTES_INICIALES.acentos);
  igual(e.ajustes.primeroIntenta, true);
  igual(e.seleccion, null);
  igual(e.futuro, { x: 1 });
});

prueba('un JSON corrupto no rompe y se guarda una copia', () => {
  const b = memoria({ [CLAVE]: '{roto' });
  const a = crearAlmacen(b);
  igual(a.ajustes(), { ...AJUSTES_INICIALES });
  igual(b.m.get(`${CLAVE}_corrupto`), '{roto');
});

prueba('añadir y quitar tarjetas', () => {
  const a = crearAlmacen(memoria());
  a.anadirTarjeta({ clave: 'v_dom', ru: 'дом', es: 'casa' });
  cierto(a.tieneTarjeta('v_dom'), 'no se añadió');
  igual(a.leer().tarjetas.v_dom.anadida, hoy());
  a.quitarTarjeta('v_dom');
  cierto(!a.tieneTarjeta('v_dom'), 'no se quitó');
});

prueba('frases vistas y actividad del día', () => {
  const a = crearAlmacen(memoria());
  a.marcarVista('clase_01', 't1/f1');
  a.marcarVista('clase_01', 't1/f1');
  a.marcarVista('clase_01', 't2/f3');
  igual([...a.frasesVistas('clase_01')], ['t1/f1', 't2/f3']);
  igual(a.frasesVistas('clase_02').size, 0);
  igual(a.leer().actividad[hoy()], true);
});

prueba('hoy() usa la fecha local AAAA-MM-DD', () => {
  igual(hoy(new Date(2026, 0, 5)), '2026-01-05');
});

// --- tts.js ---

const voz = (name, lang, localService = true) => ({ name, lang, localService });

prueba('elegirVoz: null si no hay voz rusa', () => {
  igual(elegirVoz([voz('David', 'en-US'), voz('Helena', 'es-ES')]), null);
});

prueba('elegirVoz: acepta ru_RU y prefiere voces naturales con conexión', () => {
  const voces = [voz('Microsoft Irina', 'ru-RU'), voz('Microsoft Svetlana Online (Natural)', 'ru-RU', false), voz('Inglés', 'en-US')];
  igual(elegirVoz(voces).name, 'Microsoft Svetlana Online (Natural)');
  igual(elegirVoz([voz('ruso', 'ru_RU')]).name, 'ruso');
});

prueba('elegirVoz: sin conexión prefiere voces instaladas', () => {
  const voces = [voz('Google русский', 'ru-RU', false), voz('Microsoft Irina', 'ru-RU', true)];
  igual(elegirVoz(voces, { enLinea: false }).name, 'Microsoft Irina');
  igual(elegirVoz(voces, { enLinea: true }).name, 'Google русский');
});

// --- comun.js ---

prueba('nombreClase y etiquetaSeleccion', () => {
  igual(nombreClase('clase_07'), 'Clase 7');
  igual(nombreClase('clase_00_ejemplo'), 'Clase 0 (ejemplo)');
  igual(etiquetaSeleccion(['clase_03']), 'Clase 3');
  igual(etiquetaSeleccion(['clase_03', 'clase_04', 'clase_05']), 'Clases 3–5');
  igual(etiquetaSeleccion([]), 'Sin clases');
});

prueba('rangoSeleccion: rango, orden invertido y valores por defecto', () => {
  const ids = ['clase_01', 'clase_02', 'clase_03', 'clase_04'];
  igual(rangoSeleccion(ids, { desde: 'clase_02', hasta: 'clase_03' }), ['clase_02', 'clase_03']);
  igual(rangoSeleccion(ids, { desde: 'clase_03', hasta: 'clase_01' }), ['clase_01', 'clase_02', 'clase_03']);
  igual(rangoSeleccion(ids, null), ['clase_04']);
  igual(rangoSeleccion(ids, { desde: 'clase_09', hasta: 'clase_02' }, 'clase_03'), ['clase_03']);
  igual(rangoSeleccion([], null), []);
});
