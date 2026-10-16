// Cálculos de progreso (funciones puras sobre el estado de storage.js):
// avance y cobertura de cada clase, palabras aprendidas, aciertos por
// herramienta, racha de días y plan del modo nivelación.
//
// Avance de una clase = media de las partes que tenga:
//   - lectura:    frases de sus textos leídas en el Lector;
//   - práctica:   frases (práctica + textos) acertadas al menos una vez en
//                 Traducir o Escuchar (cuenta aunque se practicaran desde otra
//                 clase que repite la frase);
//   - vocabulario: palabras empezadas en Tarjetas (algún modo con un repaso bueno).
// Una clase está cubierta con un avance ≥ 70 %.

import { normalizar } from './compare.js';
import { reunirFrases } from './frases.js';
import { reunirTarjetas, sumarDias } from './srs.js';

export const UMBRAL_CUBIERTA = 0.7;
/** Días de intervalo a partir de los cuales una palabra cuenta como aprendida. */
export const INTERVALO_APRENDIDA = 3;
export const RITMOS = [1, 2, 3];
/** El grupo va en «la última clase disponible»: se actualiza al añadir clases. */
export const ULTIMA = 'ultima';

/** La clase de ejemplo no cuenta para el progreso ni para la nivelación. */
export const esEjemplo = id => /_ejemplo$/.test(id);

/** Estados de repaso de una tarjeta en todos los modos. */
function estadosDe(clave, estados) {
  return Object.entries(estados).filter(([k]) => k.startsWith(`${clave}|`)).map(([, e]) => e);
}

/** Frases (rusas, normalizadas) acertadas al menos una vez en Traducir o Escuchar, en cualquier clase. */
export function frasesAcertadas(clases, estado) {
  const acertadas = new Set();
  for (const c of clases) {
    const porClave = new Map(reunirFrases([c]).map(f => [f.clave, normalizar(f.ru, 'ru')]));
    for (const herramienta of ['traduccion', 'escucha']) {
      for (const [k, r] of Object.entries(estado[herramienta].resultados[c.id] ?? {})) {
        const ru = porClave.get(k.slice(0, k.lastIndexOf('|')));
        if (ru && r.ok > 0) acertadas.add(ru);
      }
    }
  }
  return acertadas;
}

/** { lectura, practica, vocabulario } (cada una { hechas, total }), avance (0–1) y cubierta. */
export function avanceClase(c, estado, acertadas) {
  const textos = c.textos.flatMap(t => t.frases.map(f => `${t.id}/${f.id}`));
  const vistas = estado.lector.vistas[c.id] ?? {};
  const frases = reunirFrases([c]);
  const empezada = v => estadosDe(v.id, estado.srs.estados).some(e => e.reps > 0 || e.intervalo > 0);

  const partes = {
    lectura: { hechas: textos.filter(k => vistas[k]).length, total: textos.length },
    practica: { hechas: frases.filter(f => acertadas.has(normalizar(f.ru, 'ru'))).length, total: frases.length },
    vocabulario: { hechas: c.vocabulario.filter(empezada).length, total: c.vocabulario.length },
  };
  const conContenido = Object.values(partes).filter(p => p.total > 0);
  const avance = conContenido.length
    ? conContenido.reduce((s, p) => s + p.hechas / p.total, 0) / conContenido.length
    : 0;
  return { ...partes, avance, cubierta: avance >= UMBRAL_CUBIERTA };
}

/** Map id → avance de cada clase. */
export function avances(clases, estado) {
  const acertadas = frasesAcertadas(clases, estado);
  return new Map(clases.map(c => [c.id, avanceClase(c, estado, acertadas)]));
}

/** Palabras de `clases` + añadidas: aprendidas, aprendiendo y sin empezar. */
export function resumenPalabras(clases, estado) {
  const r = { aprendidas: 0, aprendiendo: 0, sinEmpezar: 0, total: 0 };
  for (const t of reunirTarjetas(clases, estado.tarjetas)) {
    const es = estadosDe(t.clave, estado.srs.estados);
    r.total++;
    if (!es.length) r.sinEmpezar++;
    else if (es.some(e => e.intervalo >= INTERVALO_APRENDIDA)) r.aprendidas++;
    else r.aprendiendo++;
  }
  return r;
}

/** Aciertos y fallos de Traducir y Escuchar (sumando todos los intentos) y de Tarjetas. */
export function aciertos(estado) {
  const sumar = herramienta => {
    const total = { ok: 0, mal: 0 };
    for (const clase of Object.values(estado[herramienta].resultados)) {
      for (const r of Object.values(clase)) {
        total.ok += r.ok;
        total.mal += r.mal;
      }
    }
    return total;
  };
  return {
    lector: Object.values(estado.lector.vistas).reduce((n, v) => n + Object.keys(v).length, 0),
    traduccion: sumar('traduccion'),
    escucha: sumar('escucha'),
    tarjetas: { ...estado.estadisticas.tarjetas },
  };
}

/**
 * Días seguidos con actividad. Si hoy aún no se ha practicado, la racha
 * sigue viva desde ayer. { dias, hoy (practicó hoy), total }.
 */
export function racha(actividad, fecha) {
  const practicoHoy = Boolean(actividad[fecha]);
  let dia = practicoHoy ? fecha : sumarDias(fecha, -1);
  let dias = 0;
  while (actividad[dia]) {
    dias++;
    dia = sumarDias(dia, -1);
  }
  return { dias, hoy: practicoHoy, total: Object.keys(actividad).length };
}

// ---------------------------------------------------------------------------
// Modo nivelación
// ---------------------------------------------------------------------------

/** Clases (sin la de ejemplo) hasta la del grupo, inclusive. */
export function clasesHastaGrupo(clases, claseGrupo) {
  const reales = clases.filter(c => !esEjemplo(c.id));
  if (claseGrupo === ULTIMA) return reales;
  const i = reales.findIndex(c => c.id === claseGrupo);
  return i === -1 ? reales : reales.slice(0, i + 1);
}

/**
 * Plan del día. Las clases de hoy se fijan al calcularse (`plan` guardado
 * con la fecha) para que no cambien a medida que se cubren.
 * Devuelve { objetivo, cubiertas, pendientes, clasesHoy, planNuevo, alDia,
 *            completadoHoy, siguiente, dias, fechaFin }.
 */
export function planNivelacion(clases, mapaAvances, nivelacion, fecha) {
  const objetivo = clasesHastaGrupo(clases, nivelacion.claseGrupo);
  const pendientes = objetivo.filter(c => !mapaAvances.get(c.id)?.cubierta);
  const ids = new Set(objetivo.map(c => c.id));

  const guardado = nivelacion.plan?.fecha === fecha ? nivelacion.plan.clases.filter(id => ids.has(id)) : null;
  const clasesHoy = guardado?.length ? guardado : pendientes.slice(0, nivelacion.ritmo).map(c => c.id);
  const completadoHoy = clasesHoy.length > 0 && clasesHoy.every(id => mapaAvances.get(id)?.cubierta);
  const siguiente = pendientes.find(c => !clasesHoy.includes(c.id))?.id ?? null;
  const dias = Math.ceil(pendientes.length / nivelacion.ritmo);

  return {
    objetivo: objetivo.length,
    cubiertas: objetivo.length - pendientes.length,
    pendientes: pendientes.length,
    clasesHoy,
    planNuevo: !guardado?.length && clasesHoy.length > 0,
    alDia: objetivo.length > 0 && pendientes.length === 0,
    completadoHoy,
    siguiente,
    dias,
    fechaFin: dias > 0 ? sumarDias(fecha, dias - 1) : fecha,
  };
}
