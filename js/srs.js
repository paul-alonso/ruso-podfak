// Repaso espaciado (SM-2 simplificado) y mazo de tarjetas. Funciones puras:
// el estado de cada tarjeta se guarda en storage.js (srs.estados).
//
// Estado de una tarjeta en un modo:
//   { ef, intervalo (días), reps, lapsos, vence, ultima, primera } (fechas AAAA-MM-DD)
//
// Notas:  otra   → se repite hoy, vuelve a empezar y baja la facilidad (ef)
//         dificil, bien, facil → el intervalo crece (poco, ×ef, ×ef×1,3)

export const NOTAS = ['otra', 'dificil', 'bien', 'facil'];
export const MODOS_TARJETAS = ['ru-es', 'es-ru', 'audio-es'];
export const NUEVAS_POR_DIA = 20;

const EF_INICIAL = 2.5;
const EF_MINIMO = 1.3;
const CAMBIO_EF = { otra: -0.2, dificil: -0.15, bien: 0, facil: 0.15 };
// Primeros pasos fijos (en días) antes de empezar a multiplicar por ef.
const PRIMER_REPASO = { dificil: 1, bien: 1, facil: 4 };
const SEGUNDO_REPASO = { dificil: 2, bien: 3, facil: 6 };

export function sumarDias(fecha, dias) {
  const [a, m, d] = fecha.split('-').map(Number);
  const f = new Date(a, m - 1, d + dias);
  const dos = n => String(n).padStart(2, '0');
  return `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())}`;
}

/** Días hasta el próximo repaso si se responde `nota` (0 = hoy otra vez). */
export function siguienteIntervalo(estado, nota) {
  if (nota === 'otra') return 0;
  const reps = estado?.reps ?? 0;
  if (reps === 0) return PRIMER_REPASO[nota];
  if (reps === 1) return SEGUNDO_REPASO[nota];
  const previo = estado.intervalo;
  const ef = estado.ef;
  const base = { dificil: previo * 1.2, bien: previo * ef, facil: previo * ef * 1.3 }[nota];
  return Math.max(previo + 1, Math.round(base));
}

/** Nuevo estado tras responder `nota` el día `fecha`. No modifica `estado`. */
export function repasar(estado, nota, fecha) {
  if (!NOTAS.includes(nota)) throw new Error(`nota desconocida: ${nota}`);
  const e = { ef: EF_INICIAL, intervalo: 0, reps: 0, lapsos: 0, primera: fecha, ...estado };
  e.intervalo = siguienteIntervalo(estado, nota);
  e.ef = Math.max(EF_MINIMO, Math.round((e.ef + CAMBIO_EF[nota]) * 100) / 100);
  if (nota === 'otra') {
    e.reps = 0;
    e.lapsos++;
  } else {
    e.reps++;
  }
  e.vence = sumarDias(fecha, e.intervalo);
  e.ultima = fecha;
  return e;
}

/** «hoy», «1 día», «12 días», «2 meses»… para la etiqueta de cada botón. */
export function textoIntervalo(dias) {
  if (dias === 0) return 'hoy';
  if (dias === 1) return '1 día';
  if (dias < 30) return `${dias} días`;
  const meses = Math.round(dias / 30);
  return meses === 1 ? '1 mes' : `${meses} meses`;
}

// ---------------------------------------------------------------------------
// Mazo y cola del día
// ---------------------------------------------------------------------------

/**
 * Tarjetas: el vocabulario de `clases` (en orden) más las añadidas desde el
 * Lector, sin repetir. Una añadida con vocab_id usa los datos actuales del
 * vocabulario (`vocabulario`: Map id → entrada con su clase).
 */
export function reunirTarjetas(clases, anadidas, vocabulario = new Map()) {
  const mazo = new Map();
  for (const c of clases) {
    for (const v of c.vocabulario) {
      if (!mazo.has(v.id)) mazo.set(v.id, { ...v, clave: v.id, clase: c.id, origen: 'vocabulario' });
    }
  }
  for (const t of Object.values(anadidas)) {
    if (mazo.has(t.clave)) continue;
    const v = t.vocab_id && vocabulario.get(t.vocab_id);
    mazo.set(t.clave, v ? { ...v, clave: t.clave, origen: 'lector' } : { ...t, origen: 'lector' });
  }
  return [...mazo.values()];
}

export const claveEstado = (clave, modo) => `${clave}|${modo}`;

/**
 * Mazo para estudiar en `modo`: las tarjetas de la selección (de donde salen
 * las nuevas) más las ya empezadas de cualquier clase, para que sus repasos
 * no se pierdan al cambiar de clases.
 */
export function mazoDeEstudio({ seleccion, todas, anadidas, vocabulario, estados, modo }) {
  const mazo = reunirTarjetas(seleccion, anadidas, vocabulario);
  const claves = new Set(mazo.map(t => t.clave));
  for (const t of reunirTarjetas(todas, {}, vocabulario)) {
    if (!claves.has(t.clave) && estados[claveEstado(t.clave, modo)]) mazo.push(t);
  }
  return mazo;
}

/** Cuántas tarjetas se estudiaron por primera vez en `fecha` (para el límite diario). */
export function nuevasEmpezadas(estados, modo, fecha) {
  return Object.entries(estados).filter(([k, e]) => k.endsWith(`|${modo}`) && e.primera === fecha).length;
}

/**
 * Lo que toca hoy: repasos vencidos (los más atrasados antes) y nuevas hasta
 * el límite diario. `extra` permite estudiar más nuevas que el límite.
 */
export function colaDelDia(mazo, estados, modo, fecha, { limite = NUEVAS_POR_DIA, extra = 0 } = {}) {
  const repasos = [];
  const nuevas = [];
  for (const t of mazo) {
    const e = estados[claveEstado(t.clave, modo)];
    if (!e) nuevas.push(t);
    else if (e.vence <= fecha) repasos.push({ t, vence: e.vence });
  }
  repasos.sort((a, b) => a.vence.localeCompare(b.vence));
  const cupo = Math.max(0, limite - nuevasEmpezadas(estados, modo, fecha)) + extra;
  return {
    repasos: repasos.map(x => x.t),
    nuevas: nuevas.slice(0, cupo),
    nuevasRestantes: Math.max(0, nuevas.length - cupo),
  };
}

/** Reparte las nuevas entre los repasos para que no salgan todas juntas al final. */
export function intercalar(repasos, nuevas) {
  if (!repasos.length || !nuevas.length) return [...repasos, ...nuevas];
  const cola = [];
  const paso = (repasos.length + nuevas.length) / nuevas.length;
  let r = 0;
  nuevas.forEach((n, i) => {
    const hasta = Math.round(paso * (i + 1)) - (i + 1);
    while (r < hasta && r < repasos.length) cola.push(repasos[r++]);
    cola.push(n);
  });
  while (r < repasos.length) cola.push(repasos[r++]);
  return cola;
}
