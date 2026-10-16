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
    lector: { vistas: {} },   // claseId → { 't1/f2': instante ISO (antes: 'AAAA-MM-DD') }
    // claseId → { '<frase>|<modo>': { ok, mal, ultima, ultimaOk, en } }, p. ej. 'p3|ru-es' o 't1/f2|dictado'
    traduccion: { resultados: {} },
    escucha: { resultados: {} },
    srs: { estados: {} },     // 'v_dom|ru-es' → estado de repaso (ver srs.js) + en
    // Respuestas en Tarjetas (ok = todo menos «Otra vez»), contadas desde el último reinicio.
    estadisticas: { tarjetas: { ok: 0, mal: 0, desde: 0 } },
    nivelacion: null,         // { claseGrupo: id | 'ultima', ritmo: 1–3, plan: { fecha, clases } | null }
    nivelacionEn: 0,          // ms del último cambio de configuración (gana el más reciente)
    actividad: {},            // 'AAAA-MM-DD' → ms de la última actividad de ese día (antes: true)
    // Marcas de reinicio (ms). Al combinar se descarta todo dato anterior a su marca.
    // clases: claseId → { en, claves: claves de tarjeta de esa clase }.
    reinicios: { todo: 0, tarjetas: 0, clases: {} },
  };
}
// «en» (ms): cuándo se escribió cada dato. Los datos sin «en» son de antes de
// que existiera el reinicio y cuentan como anteriores a cualquier marca.

const esObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const esFecha = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const esEntero = v => Number.isInteger(v) && v >= 0;
/** Fecha AAAA-MM-DD (datos antiguos) o instante ISO completo. */
const esInstante = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z)?$/.test(v);

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

function reiniciosValidos(r) {
  const clases = filtrar(r?.clases, c => esObjeto(c) && esEntero(c.en) && Array.isArray(c.claves));
  return {
    todo: esEntero(r?.todo) ? r.todo : 0,
    tarjetas: esEntero(r?.tarjetas) ? r.tarjetas : 0,
    clases: Object.fromEntries(Object.entries(clases).map(([id, c]) =>
      [id, { en: c.en, claves: c.claves.filter(k => typeof k === 'string') }])),
  };
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
  e.lector = { ...(esObjeto(datos.lector) ? datos.lector : {}), vistas: filtrarPorClase(datos.lector?.vistas, esInstante) };
  for (const k of CON_RESULTADOS) {
    e[k] = { ...(esObjeto(datos[k]) ? datos[k] : {}), resultados: filtrarPorClase(datos[k]?.resultados, resultadoValido) };
  }
  e.srs = { ...(esObjeto(datos.srs) ? datos.srs : {}), estados: filtrar(datos.srs?.estados, estadoSrsValido) };
  const t = datos.estadisticas?.tarjetas;
  if (esObjeto(t)) {
    e.estadisticas.tarjetas = { ok: esEntero(t.ok) ? t.ok : 0, mal: esEntero(t.mal) ? t.mal : 0, desde: esEntero(t.desde) ? t.desde : 0 };
  }
  e.nivelacion = nivelacionValida(datos.nivelacion);
  e.nivelacionEn = esEntero(datos.nivelacionEn) ? datos.nivelacionEn : 0;
  e.tarjetasQuitadas = filtrar(datos.tarjetasQuitadas, esEntero);
  e.actividad = filtrar(datos.actividad, (v, k) => (v === true || esEntero(v)) && esFecha(k));
  e.reinicios = reiniciosValidos(datos.reinicios);
  return e;
}

// ---------------------------------------------------------------------------
// Reiniciar
// ---------------------------------------------------------------------------

/** Momento (ms) de un dato; -Infinity si no lo tiene (dato antiguo: anterior a cualquier reinicio). */
const momento = v => (typeof v === 'number' ? v : -Infinity);
const momentoVista = v => (v.length > 10 ? Date.parse(v) : -Infinity);

/** Une las marcas de reinicio de dos estados: gana la más reciente de cada alcance. */
export function unirReinicios(a, b) {
  const clases = { ...b.clases };
  for (const [id, c] of Object.entries(a.clases)) {
    const otra = clases[id];
    clases[id] = otra
      ? { en: Math.max(c.en, otra.en), claves: [...new Set([...c.claves, ...otra.claves])] }
      : { en: c.en, claves: [...c.claves] };
  }
  return { todo: Math.max(a.todo, b.todo), tarjetas: Math.max(a.tarjetas, b.tarjetas), clases };
}

/**
 * Aplica las marcas de `e.reinicios` a `e` (lo modifica): descarta todo dato
 * escrito antes de su marca. Con `rescatarEn` (ms), esos datos no se
 * descartan sino que se les pone esa hora: es lo que pasa al importar un
 * respaldo, que es una decisión explícita de recuperarlos.
 */
export function aplicarReinicios(e, { rescatarEn = null } = {}) {
  const { todo, tarjetas, clases } = e.reinicios;
  const filtrarDatos = (obj, marca, instante, sellar) => {
    if (!marca) return obj;
    const r = {};
    for (const [k, v] of Object.entries(obj)) {
      if (instante(v) > marca) r[k] = v;
      else if (rescatarEn !== null) r[k] = sellar(v);
    }
    return r;
  };
  const marcaClase = id => Math.max(todo, clases[id]?.en ?? 0);

  for (const id of Object.keys(e.lector.vistas)) {
    e.lector.vistas[id] = filtrarDatos(e.lector.vistas[id], marcaClase(id), momentoVista, () => new Date(rescatarEn).toISOString());
  }
  for (const k of CON_RESULTADOS) {
    for (const id of Object.keys(e[k].resultados)) {
      e[k].resultados[id] = filtrarDatos(e[k].resultados[id], marcaClase(id), r => momento(r.en), r => ({ ...r, en: rescatarEn }));
    }
  }

  // Tarjetas: la marca de una clave es la de «todo», «tarjetas» o la de su clase.
  const porTarjeta = new Map();
  for (const c of Object.values(clases)) {
    for (const clave of c.claves) porTarjeta.set(clave, Math.max(porTarjeta.get(clave) ?? 0, c.en));
  }
  const base = Math.max(todo, tarjetas);
  const estados = {};
  for (const [k, est] of Object.entries(e.srs.estados)) {
    const marca = Math.max(base, porTarjeta.get(k.slice(0, k.lastIndexOf('|'))) ?? 0);
    if (!marca || momento(est.en) > marca) estados[k] = est;
    else if (rescatarEn !== null) estados[k] = { ...est, en: rescatarEn };
  }
  e.srs.estados = estados;

  e.tarjetas = filtrarDatos(e.tarjetas, todo, t => momento(t.anadidaEn), t => ({ ...t, anadidaEn: rescatarEn }));
  e.actividad = filtrarDatos(e.actividad, todo, momento, () => rescatarEn);
  const t = e.estadisticas.tarjetas;
  if (base && t.desde < base) {
    e.estadisticas.tarjetas = rescatarEn !== null ? { ...t, desde: rescatarEn } : { ok: 0, mal: 0, desde: base };
  }
  return e;
}

/**
 * Reinicia `e` en `ms` (lo modifica). alcance:
 *   { tipo: 'todo' } | { tipo: 'tarjetas' } | { tipo: 'clase', clase, claves }
 * (claves: las de las tarjetas de esa clase, para reiniciar su repaso).
 * Ajustes, selección, nivelación y palabras quitadas no se tocan.
 */
export function reiniciarEstado(e, alcance, ms) {
  const r = e.reinicios;
  if (alcance.tipo === 'todo') r.todo = Math.max(r.todo, ms);
  else if (alcance.tipo === 'tarjetas') r.tarjetas = Math.max(r.tarjetas, ms);
  else if (alcance.tipo === 'clase') {
    const previa = r.clases[alcance.clase];
    r.clases[alcance.clase] = {
      en: Math.max(previa?.en ?? 0, ms),
      claves: [...new Set([...(previa?.claves ?? []), ...alcance.claves])],
    };
  } else {
    throw new Error(`alcance de reinicio desconocido: ${alcance.tipo}`);
  }
  return aplicarReinicios(e);
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
  // Reinicios: primero se unen las marcas y se aplican a los dos lados, para
  // que el progreso anterior a un reinicio no vuelva desde el otro.
  const marcas = unirReinicios(a.reinicios, b.reinicios);
  a.reinicios = marcas;
  b.reinicios = unirReinicios(marcas, marcas);
  aplicarReinicios(a);
  aplicarReinicios(b);
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
      const en = Math.max(momento(x.en), momento(y.en));
      return {
        ok: Math.max(x.ok, y.ok), mal: Math.max(x.mal, y.mal), ultima: ultimo.ultima, ultimaOk: ultimo.ultimaOk,
        ...(en > -Infinity ? { en } : {}),
      };
    });
  }
  r.srs.estados = unir(a.srs.estados, b.srs.estados, (x, y) => {
    if (typeof x.en === 'number' && typeof y.en === 'number' && x.en !== y.en) return y.en > x.en ? y : x;
    if ((x.ultima ?? '') !== (y.ultima ?? '')) return masReciente(x, y);
    return y.reps > x.reps ? y : x;
  });
  r.estadisticas.tarjetas = {
    ok: Math.max(a.estadisticas.tarjetas.ok, b.estadisticas.tarjetas.ok),
    mal: Math.max(a.estadisticas.tarjetas.mal, b.estadisticas.tarjetas.mal),
    desde: Math.max(a.estadisticas.tarjetas.desde, b.estadisticas.tarjetas.desde),
  };
  // Nivelación: gana la configuración más reciente (también al desactivarla).
  if (b.nivelacionEn > a.nivelacionEn) r.nivelacion = b.nivelacion;
  else if (b.nivelacionEn === a.nivelacionEn) r.nivelacion = a.nivelacion ?? b.nivelacion;
  r.nivelacionEn = Math.max(a.nivelacionEn, b.nivelacionEn);
  r.actividad = unir(a.actividad, b.actividad, (x, y) =>
    (typeof x === 'number' || typeof y === 'number' ? Math.max(momento(x), momento(y)) : true));
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

  /** Marca el día de hoy como practicado (con la hora, para los reinicios). */
  const anotarActividad = e => { e.actividad[hoy()] = Date.now(); };

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
      vistas[clave] ??= new Date().toISOString();
      anotarActividad(e);
    }),

    /** Estados de repaso de todas las tarjetas: { 'v_dom|ru-es': { ef, intervalo, … } }. */
    estadosSrs: () => leer().srs.estados,
    guardarRepaso: (claveEstado, estado, acierto) => actualizar(e => {
      e.srs.estados[claveEstado] = { ...estado, en: Date.now() };
      e.estadisticas.tarjetas[acierto ? 'ok' : 'mal']++;
      anotarActividad(e);
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
      r.en = Date.now();
      anotarActividad(e);
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
    /**
     * Importa un progreso ya leído con leerPaquete. modo: 'combinar' | 'reemplazar'.
     * Importar es una decisión explícita: lo que un reinicio descartaría (p. ej.
     * el respaldo descargado antes de reiniciar) se recupera con la hora actual.
     */
    importar: (progreso, modo) => {
      backend.setItem(CLAVE_RESPALDO, backend.getItem(CLAVE) ?? JSON.stringify(estadoInicial()));
      const actual = leer();
      const traido = normalizar(progreso);
      traido.reinicios = unirReinicios(actual.reinicios, traido.reinicios);
      aplicarReinicios(traido, { rescatarEn: Date.now() });
      escribir(modo === 'combinar' ? combinar(actual, traido) : traido);
      avisar();
    },
    /** Reinicia el progreso (ver reiniciarEstado). Se sincroniza como cualquier cambio. */
    reiniciar: alcance => actualizar(e => reiniciarEstado(e, alcance, Date.now())),
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
