// Normalización y comparación de respuestas escritas (Traducción y, en la
// fase 4, el dictado de Escucha). Compara palabra por palabra:
//   - ignora mayúsculas, puntuación y espacios extra;
//   - en ruso, е = ё y se ignoran los acentos (pero й ≠ и);
//   - en español, se ignoran las tildes.

const RE_PALABRA = /[\p{L}\p{N}\p{M}]+(?:[-'’][\p{L}\p{N}\p{M}]+)*/gu;
const MARCAS_ACENTO = /[̀́]/g;

/** Divide un texto en palabras ({ texto, palabra: n }) y lo que hay entre ellas ({ texto }). */
export function trozos(texto) {
  const res = [];
  let pos = 0;
  let n = 0;
  for (const m of texto.matchAll(RE_PALABRA)) {
    if (m.index > pos) res.push({ texto: texto.slice(pos, m.index) });
    res.push({ texto: m[0], palabra: n++ });
    pos = m.index + m[0].length;
  }
  if (pos < texto.length) res.push({ texto: texto.slice(pos) });
  return res;
}

export const palabras = texto => [...texto.normalize('NFC').matchAll(RE_PALABRA)].map(m => m[0]);

export function normalizarPalabra(p, idioma) {
  const s = p.normalize('NFC').toLowerCase().replace(/[-'’]/g, '');
  if (idioma === 'ru') return s.replace(MARCAS_ACENTO, '').replace(/ё/g, 'е');
  return s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
}

/** Forma normalizada de un texto completo: «¿Qué es ESTO?» → «que es esto». */
export const normalizar = (texto, idioma) => palabras(texto).map(p => normalizarPalabra(p, idioma)).join(' ');

export const letrasLatinas = texto => /\p{Script=Latin}/u.test(texto);

export function distancia(a, b) {
  const x = [...a];
  const y = [...b];
  let previa = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const fila = [i];
    for (let j = 1; j <= y.length; j++) {
      fila[j] = Math.min(previa[j] + 1, fila[j - 1] + 1, previa[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    previa = fila;
  }
  return previa[y.length];
}

/** Una errata pequeña: 1 letra en palabras de 3 a 5 letras, 2 en las más largas. */
function parecidas(a, b) {
  const largo = Math.max([...a].length, [...b].length);
  const tolerancia = largo >= 6 ? 2 : largo >= 3 ? 1 : 0;
  return distancia(a, b) <= tolerancia;
}

/**
 * Alinea dos listas de palabras normalizadas (subsecuencia común más larga).
 * Estados del usuario: ok | casi | mal (en lugar de otra) | sobra.
 * Estados de la correcta: ok | casi | falta.
 */
function alinear(a, b) {
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const usuario = new Array(n);
  const correcta = new Array(m);
  let iguales = 0;
  let casi = 0;
  let sobran = [];
  let faltan = [];
  // Entre dos palabras iguales, empareja en orden lo que sobra con lo que falta.
  const cerrarHueco = () => {
    sobran.forEach((i, k) => {
      const j = faltan[k];
      if (j !== undefined && parecidas(a[i], b[j])) {
        usuario[i] = correcta[j] = 'casi';
        casi++;
      } else {
        usuario[i] = j === undefined ? 'sobra' : 'mal';
      }
    });
    for (const j of faltan) correcta[j] ??= 'falta';
    sobran = [];
    faltan = [];
  };

  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      cerrarHueco();
      usuario[i] = correcta[j] = 'ok';
      iguales++;
      i++;
      j++;
    } else if (j >= m || (i < n && lcs[i + 1][j] >= lcs[i][j + 1])) {
      sobran.push(i++);
    } else {
      faltan.push(j++);
    }
  }
  cerrarHueco();

  const total = n + m;
  return {
    usuario,
    correcta,
    exacta: iguales === n && iguales === m,
    soloCasi: iguales + casi === n && iguales + casi === m,
    similitud: total ? (2 * iguales + 1.5 * casi) / total : 1,
  };
}

/**
 * Compara la respuesta con las aceptadas (textos o { texto, mostrar }, donde
 * `mostrar` es la versión con acentos para enseñar). Usa la más parecida.
 *
 * Devuelve { exacta, casi, indice, similitud, usuario, esperada }:
 * `usuario` y `esperada` son trozos con `estado` en cada palabra.
 */
export function comparar(respuesta, aceptadas, idioma) {
  const tus = trozos(respuesta.normalize('NFC'));
  const tusNorm = tus.filter(t => t.palabra !== undefined).map(t => normalizarPalabra(t.texto, idioma));

  let mejor = null;
  aceptadas.forEach((a, indice) => {
    const opcion = typeof a === 'string' ? { texto: a } : a;
    const norm = palabras(opcion.texto).map(p => normalizarPalabra(p, idioma));
    const al = alinear(tusNorm, norm);
    if (!mejor || al.similitud > mejor.al.similitud) mejor = { al, indice, opcion, norm };
  });

  const { al, indice, opcion, norm } = mejor;
  const mostrar = opcion.mostrar && palabras(opcion.mostrar).length === norm.length ? opcion.mostrar : opcion.texto;
  const marcar = (ts, estados) => ts.map(t => (t.palabra === undefined ? t : { ...t, estado: estados[t.palabra] }));
  return {
    exacta: al.exacta,
    casi: !al.exacta && al.soloCasi,
    indice,
    similitud: al.similitud,
    usuario: marcar(tus, al.usuario),
    esperada: marcar(trozos(mostrar.normalize('NFC')), al.correcta),
  };
}

/** Pista: la primera letra de cada palabra. «Это мой дом.» → «Э__ м__ д__.» */
export function pista(texto) {
  return trozos(texto.normalize('NFC').replace(MARCAS_ACENTO, ''))
    .map(t => (t.palabra === undefined ? t.texto : [...t.texto].map((c, k) => (k === 0 || c === '-' ? c : '_')).join('')))
    .join('');
}
