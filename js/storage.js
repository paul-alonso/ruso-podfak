// Ajustes y progreso del usuario en localStorage, bajo una única clave
// versionada. Si localStorage no está disponible (p. ej. modo privado
// estricto), se guarda en memoria y se pierde al cerrar la página.
//
// Exportar / importar: el progreso se descarga como JSON y se importa en otro
// dispositivo reemplazando o combinando (sin duplicar si se importa dos veces).

import { MODOS_TARJETAS } from './srs.js';
import { RITMOS } from './progreso.js';

export const CLAVE = 'podfak_v1';
export const VELOCIDADES = [0.6, 0.8, 1];
export const DIRECCIONES = ['ru-es', 'es-ru'];
export const MODOS_ESCUCHA = ['significado', 'dictado'];
/** Herramientas que guardan aciertos y fallos por frase. */
export const CON_RESULTADOS = ['traduccion', 'escucha'];
export const FORMATO_EXPORTACION = 'ruso-podfak/progreso';
const CLAVE_RESPALDO = `${CLAVE}_antes_de_importar`;

export const AJUSTES_INICIALES = Object.freeze({
  acentos: true,
  traducciones: false,
  primeroIntenta: false,
  velocidad: 0.8,
  direccion: 'ru-es',
  tecladoRuso: false,
  modoEscucha: 'significado',
  modoTarjetas: 'ru-es',
  audioAuto: true,
});

function estadoInicial() {
  return {
    version: 1,
    ajustes: { ...AJUSTES_INICIALES },
    seleccion: null,          // { desde: 'clase_03', hasta: 'clase_05' }
    tarjetas: {},             // clave → tarjeta añadida desde el Lector (anadidaEn: ms)
    tarjetasQuitadas: {},     // clave → ms en que se quitó (para que no vuelva al sincronizar)
    lector: { vistas: {} },   // claseId → { 't1/f2': 'AAAA-MM-DD' }
    // claseId → { '<frase>|<modo>': { ok, mal, ultima, ultimaOk } }, p. ej. 'p3|ru-es' o 't1/f2|dictado'
    traduccion: { resultados: {} },
    escucha: { resultados: {} },
    srs: { estados: {} },     // 'v_dom|ru-es' → estado de repaso (ver srs.js)
    estadisticas: { tarjetas: { ok: 0, mal: 0 } }, // respuestas en Tarjetas (ok = todo menos «Otra vez»)
    nivelacion: null,         // { claseGrupo: id | 'ultima', ritmo: 1–3, plan: { fecha, clases } | null }
    nivelacionEn: 0,          // ms del último cambio de configuración (gana el más reciente)
    actividad: {},            // 'AAAA-MM-DD' → true (para la racha)
  };
}

const esObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const esFecha = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const esEntero = v => Number.isInteger(v) && v >= 0;

/** Fecha local de hoy como AAAA-MM-DD. */
export function hoy(d = new Date()) {
  const dos = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// Validación (también protege de archivos importados dañados)
// ---------------------------------------------------------------------------

/** Deja solo las entradas { clave: valor } válidas. */
const filtrar = (obj, valida) => Object.fromEntries(
  Object.entries(esObjeto(obj) ? obj : {}).filter(([k, v]) => valida(v, k)));
/** { claseId: { clave: valor } } con solo los valores válidos. */
const filtrarPorClase = (obj, valida) => Object.fromEntries(
  Object.entries(esObjeto(obj) ? obj : {}).filter(([, v]) => esObjeto(v)).map(([k, v]) => [k, filtrar(v, valida)]));

const tarjetaValida = t => esObjeto(t) && typeof t.clave === 'string' && typeof t.ru === 'string' && typeof t.es === 'string';
const resultadoValido = r => esObjeto(r) && esEntero(r.ok) && esEntero(r.mal);
const estadoSrsValido = e => esObjeto(e) && esFecha(e.vence) && typeof e.ef === 'number' && esEntero(e.intervalo) && esEntero(e.reps);

function nivelacionValida(n) {
  if (!esObjeto(n) || typeof n.claseGrupo !== 'string' || !RITMOS.includes(n.ritmo)) return null;
  const p = n.plan;
  const plan = esObjeto(p) && esFecha(p.fecha) && Array.isArray(p.clases)
    ? { fecha: p.fecha, clases: p.clases.filter(c => typeof c === 'string') }
    : null;
  return { claseGrupo: n.claseGrupo, ritmo: n.ritmo, plan };
}

/** Combina lo guardado con los valores por defecto y descarta lo que no tenga la forma esperada. */
export function normalizar(datos) {
  const e = estadoInicial();
  if (!esObjeto(datos)) return e;
  // Las claves que esta versión no conoce se conservan tal cual.
  for (const k of Object.keys(datos)) if (!(k in e)) e[k] = datos[k];

  if (esObjeto(datos.ajustes)) {
    for (const k of Object.keys(e.ajustes)) {
      if (typeof datos.ajustes[k] === typeof AJUSTES_INICIALES[k]) e.ajustes[k] = datos.ajustes[k];
    }
  }
  if (!VELOCIDADES.includes(e.ajustes.velocidad)) e.ajustes.velocidad = AJUSTES_INICIALES.velocidad;
  if (!DIRECCIONES.includes(e.ajustes.direccion)) e.ajustes.direccion = AJUSTES_INICIALES.direccion;
  if (!MODOS_ESCUCHA.includes(e.ajustes.modoEscucha)) e.ajustes.modoEscucha = AJUSTES_INICIALES.modoEscucha;
  if (!MODOS_TARJETAS.includes(e.ajustes.modoTarjetas)) e.ajustes.modoTarjetas = AJUSTES_INICIALES.modoTarjetas;

  const s = datos.seleccion;
  if (esObjeto(s) && typeof s.desde === 'string' && typeof s.hasta === 'string') {
    e.seleccion = { desde: s.desde, hasta: s.hasta };
  }
  e.tarjetas = filtrar(datos.tarjetas, tarjetaValida);
  e.lector = { ...(esObjeto(datos.lector) ? datos.lector : {}), vistas: filtrarPorClase(datos.lector?.vistas, esFecha) };
  for (const k of CON_RESULTADOS) {
    e[k] = { ...(esObjeto(datos[k]) ? datos[k] : {}), resultados: filtrarPorClase(datos[k]?.resultados, resultadoValido) };
  }
  e.srs = { ...(esObjeto(datos.srs) ? datos.srs : {}), estados: filtrar(datos.srs?.estados, estadoSrsValido) };
  const t = datos.estadisticas?.tarjetas;
  if (esObjeto(t)) e.estadisticas.tarjetas = { ok: esEntero(t.ok) ? t.ok : 0, mal: esEntero(t.mal) ? t.mal : 0 };
  e.nivelacion = nivelacionValida(datos.nivelacion);
  e.nivelacionEn = esEntero(datos.nivelacionEn) ? datos.nivelacionEn : 0;
  e.tarjetasQuitadas = filtrar(datos.tarjetasQuitadas, esEntero);
  e.actividad = filtrar(datos.actividad, (v, k) => v === true && esFecha(k));
  return e;
}

// ---------------------------------------------------------------------------
// Exportar, importar y combinar
// ---------------------------------------------------------------------------

/** Une dos objetos; si la clave está en ambos, decide `resolver(local, importado)`. */
function unir(local, importado, resolver) {
  const r = { ...importado };
  for (const [k, v] of Object.entries(local)) r[k] = k in importado ? resolver(v, importado[k]) : v;
  return r;
}
const unirPorClase = (local, importado, resolver) => unir(local, importado, (a, b) => unir(a, b, resolver));
const masReciente = (a, b) => ((b.ultima ?? '') > (a.ultima ?? '') ? b : a);

/**
 * Combina el progreso de dos dispositivos. Se usa el máximo (no la suma)
 * de los contadores, para que importar dos veces el mismo archivo no
 * duplique nada. Ajustes y selección son de cada dispositivo: se quedan los
 * locales. Los borrados (tarjeta quitada, nivelación desactivada) llevan
 * marca de tiempo para que no «resuciten» al combinar.
 */
export function combinar(local, importado) {
  const a = normalizar(local);
  const b = normalizar(importado);
  const r = a;
  for (const k of Object.keys(b)) if (!(k in r)) r[k] = b[k];
  // Tarjetas: unión, salvo las quitadas después de añadirlas (en cualquiera de los dos).
  r.tarjetasQuitadas = unir(a.tarjetasQuitadas, b.tarjetasQuitadas, Math.max);
  r.tarjetas = unir(a.tarjetas, b.tarjetas, (x, y) => ((y.anadidaEn ?? 0) > (x.anadidaEn ?? 0) ? y : x));
  for (const [clave, t] of Object.entries(r.tarjetas)) {
    if ((r.tarjetasQuitadas[clave] ?? -1) > (t.anadidaEn ?? 0)) delete r.tarjetas[clave];
  }
  r.lector.vistas = unirPorClase(a.lector.vistas, b.lector.vistas, (x, y) => (x <= y ? x : y));
  for (const k of CON_RESULTADOS) {
    r[k].resultados = unirPorClase(a[k].resultados, b[k].resultados, (x, y) => {
      const ultimo = masReciente(x, y);
      return { ok: Math.max(x.ok, y.ok), mal: Math.max(x.mal, y.mal), ultima: ultimo.ultima, ultimaOk: ultimo.ultimaOk };
    });
  }
  r.srs.estados = unir(a.srs.estados, b.srs.estados, (x, y) => {
    if ((x.ultima ?? '') !== (y.ultima ?? '')) return masReciente(x, y);
    return y.reps > x.reps ? y : x;
  });
  r.estadisticas.tarjetas = {
    ok: Math.max(a.estadisticas.tarjetas.ok, b.estadisticas.tarjetas.ok),
    mal: Math.max(a.estadisticas.tarjetas.mal, b.estadisticas.tarjetas.mal),
  };
  // Nivelación: gana la configuración más reciente (también al desactivarla).
  if (b.nivelacionEn > a.nivelacionEn) r.nivelacion = b.nivelacion;
  else if (b.nivelacionEn === a.nivelacionEn) r.nivelacion = a.nivelacion ?? b.nivelacion;
  r.nivelacionEn = Math.max(a.nivelacionEn, b.nivelacionEn);
  r.actividad = { ...b.actividad, ...a.actividad };
  return r;
}

/** Lo que se descarga al exportar. */
export function paqueteExportacion(estado, ahora = new Date()) {
  return { formato: FORMATO_EXPORTACION, version: 1, exportado: ahora.toISOString(), progreso: estado };
}

/** Lee un archivo exportado. Devuelve { progreso, exportado } o { error }. */
export function leerPaquete(texto) {
  let d;
  try {
    d = JSON.parse(texto.replace(/^﻿/, ''));
  } catch {
    return { error: 'El archivo no es un JSON válido. ¿Es el que descargaste con «Exportar progreso»?' };
  }
  let progreso = null;
  if (esObjeto(d) && d.formato === FORMATO_EXPORTACION) progreso = d.progreso;
  else if (esObjeto(d) && d.version === 1 && esObjeto(d.ajustes)) progreso = d; // copia directa de localStorage
  if (!esObjeto(progreso)) return { error: 'Este archivo no es un progreso exportado de esta app.' };
  if (progreso.version !== 1) {
    return { error: `El archivo es de otra versión de la app (versión ${progreso.version}); esta usa la 1.` };
  }
  return { progreso: normalizar(progreso), exportado: typeof d.exportado === 'string' ? d.exportado : null };
}

// ---------------------------------------------------------------------------
// Almacén
// ---------------------------------------------------------------------------

function enMemoria() {
  const m = new Map();
  return {
    getItem: k => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
  };
}

function almacenamientoDelNavegador() {
  try {
    const ls = window.localStorage;
    ls.setItem('__podfak_prueba', '1');
    ls.removeItem('__podfak_prueba');
    return ls;
  } catch {
    console.warn('localStorage no disponible: el progreso no se guardará.');
    return enMemoria();
  }
}

/** Crea un almacén sobre `backend` (localStorage o cualquier objeto con getItem/setItem). */
export function crearAlmacen(backend = almacenamientoDelNavegador()) {
  function leer() {
    const texto = backend.getItem(CLAVE);
    if (texto === null) return estadoInicial();
    try {
      return normalizar(JSON.parse(texto));
    } catch {
      // No se pisa sin más: se guarda una copia para poder recuperarla a mano.
      try { backend.setItem(`${CLAVE}_corrupto`, texto); } catch { /* sin espacio */ }
      return estadoInicial();
    }
  }

  function escribir(e) {
    try {
      backend.setItem(CLAVE, JSON.stringify(e));
    } catch (err) {
      console.warn('No se pudo guardar el progreso:', err);
    }
  }

  // Avisos de cambios en el progreso (los usa la sincronización). Ajustes,
  // selección y plan del día son de cada dispositivo y no avisan.
  const oyentes = new Set();
  const avisar = () => oyentes.forEach(fn => fn());

  function actualizar(cambiar, { sincronizable = true } = {}) {
    const e = leer();
    cambiar(e);
    escribir(e);
    if (sincronizable) avisar();
    return e;
  }

  return {
    leer,
    /** Llama a `fn` tras cada cambio del progreso. Devuelve la función para dejar de oír. */
    alCambiar: fn => {
      oyentes.add(fn);
      return () => oyentes.delete(fn);
    },
    /** Escribe un estado ya combinado con el remoto, sin avisar (no hay nada nuevo que subir). */
    guardarSincronizado: estado => escribir(normalizar(estado)),

    ajustes: () => leer().ajustes,
    fijarAjuste: (clave, valor) => actualizar(e => { e.ajustes[clave] = valor; }, { sincronizable: false }),

    seleccion: () => leer().seleccion,
    fijarSeleccion: (desde, hasta) => actualizar(e => { e.seleccion = { desde, hasta }; }, { sincronizable: false }),

    tieneTarjeta: clave => Object.hasOwn(leer().tarjetas, clave),
    anadirTarjeta: tarjeta => actualizar(e => {
      e.tarjetas[tarjeta.clave] = { ...tarjeta, anadida: hoy(), anadidaEn: Date.now() };
      delete e.tarjetasQuitadas[tarjeta.clave];
    }),
    quitarTarjeta: clave => actualizar(e => {
      delete e.tarjetas[clave];
      e.tarjetasQuitadas[clave] = Date.now();
    }),

    /** Claves «t1/f2» de las frases de una clase cuya traducción ya se vio en el Lector. */
    frasesVistas: claseId => new Set(Object.keys(leer().lector.vistas[claseId] ?? {})),
    marcarVista: (claseId, clave) => actualizar(e => {
      const vistas = (e.lector.vistas[claseId] ??= {});
      vistas[clave] ??= hoy();
      e.actividad[hoy()] = true;
    }),

    /** Estados de repaso de todas las tarjetas: { 'v_dom|ru-es': { ef, intervalo, … } }. */
    estadosSrs: () => leer().srs.estados,
    guardarRepaso: (claveEstado, estado, acierto) => actualizar(e => {
      e.srs.estados[claveEstado] = estado;
      e.estadisticas.tarjetas[acierto ? 'ok' : 'mal']++;
      e.actividad[hoy()] = true;
    }),

    /** Resultados de una herramienta en una clase: { 'p3|ru-es': { ok, mal, ultima, ultimaOk } }. */
    resultados: (herramienta, claseId) => leer()[herramienta].resultados[claseId] ?? {},
    registrarResultado: (herramienta, claseId, clave, modo, acierto) => actualizar(e => {
      const clase = (e[herramienta].resultados[claseId] ??= {});
      const r = (clase[`${clave}|${modo}`] ??= { ok: 0, mal: 0 });
      if (acierto) r.ok++;
      else r.mal++;
      r.ultima = hoy();
      r.ultimaOk = acierto;
      e.actividad[hoy()] = true;
    }),

    /** Modo nivelación: null o { claseGrupo, ritmo, plan }. Cambiar la configuración rehace el plan. */
    nivelacion: () => leer().nivelacion,
    fijarNivelacion: config => actualizar(e => {
      e.nivelacion = config && { claseGrupo: config.claseGrupo, ritmo: config.ritmo, plan: null };
      e.nivelacionEn = Date.now();
    }),
    fijarPlan: (fecha, clases) => actualizar(e => {
      if (e.nivelacion) e.nivelacion.plan = { fecha, clases };
    }, { sincronizable: false }),

    exportar: () => paqueteExportacion(leer()),
    /** Importa un progreso ya leído con leerPaquete. modo: 'combinar' | 'reemplazar'. */
    importar: (progreso, modo) => {
      backend.setItem(CLAVE_RESPALDO, backend.getItem(CLAVE) ?? JSON.stringify(estadoInicial()));
      escribir(modo === 'combinar' ? combinar(leer(), progreso) : normalizar(progreso));
      avisar();
    },
    /** Vuelve al progreso de antes de la última importación. Devuelve false si no hay copia. */
    deshacerImportacion: () => {
      const copia = backend.getItem(CLAVE_RESPALDO);
      if (copia === null) return false;
      backend.setItem(CLAVE, copia);
      backend.removeItem?.(CLAVE_RESPALDO);
      avisar();
      return true;
    },
  };
}

export const almacen = crearAlmacen();
