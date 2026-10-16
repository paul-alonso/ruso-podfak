// Frases con las que practican Traducción y Escucha: reunirlas sin repetir,
// ordenarlas según los resultados anteriores y elegir opciones incorrectas.

import { normalizar, palabras } from './compare.js';

/**
 * Frases de práctica y de los textos, sin repetir. Una frase que está en
 * ambos sitios se une: alternativas de la práctica + enlace al Lector.
 * Cada frase: { clase, clave, origen, ru, ru_acento, es, alt_es, alt_ru, lector }.
 */
export function reunirFrases(clases) {
  const porRu = new Map();
  const anadirAlternativa = (lista, principal, texto, idioma) => {
    const n = normalizar(texto, idioma);
    if (n !== normalizar(principal, idioma) && !lista.some(t => normalizar(t, idioma) === n)) lista.push(texto);
  };
  for (const c of clases) {
    for (const p of c.frases_practica) {
      const clave = normalizar(p.ru, 'ru');
      if (porRu.has(clave)) continue;
      porRu.set(clave, {
        clase: c.id, clave: p.id, origen: 'Práctica',
        ru: p.ru, ru_acento: p.ru_acento ?? null, es: p.es,
        alt_es: [...(p.alternativas_es ?? [])], alt_ru: [...(p.alternativas_ru ?? [])], lector: null,
      });
    }
    for (const t of c.textos) {
      for (const f of t.frases) {
        const existente = porRu.get(normalizar(f.ru, 'ru'));
        if (existente) {
          existente.ru_acento ??= f.ru_acento;
          if (existente.clase === c.id) existente.lector ??= `${t.id}-${f.id}`;
          anadirAlternativa(existente.alt_es, existente.es, f.es, 'es');
          continue;
        }
        porRu.set(normalizar(f.ru, 'ru'), {
          clase: c.id, clave: `${t.id}/${f.id}`, origen: t.titulo,
          ru: f.ru, ru_acento: f.ru_acento, es: f.es, alt_es: [], alt_ru: [], lector: `${t.id}-${f.id}`,
        });
      }
    }
  }
  return [...porRu.values()];
}

export function barajar(lista, azar = Math.random) {
  const l = [...lista];
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]];
  }
  return l;
}

/**
 * Falladas la última vez → nunca hechas → el resto (las más antiguas antes),
 * al azar dentro de cada grupo. `resultadosDe(claseId)` devuelve los
 * resultados guardados de la herramienta; la clave es «<frase>|<modo>».
 */
export function ordenarPorResultados(lista, modo, resultadosDe) {
  const cache = new Map();
  const resultado = f => {
    if (!cache.has(f.clase)) cache.set(f.clase, resultadosDe(f.clase));
    return cache.get(f.clase)[`${f.clave}|${modo}`];
  };
  return lista
    .map(f => {
      const r = resultado(f);
      return { f, grupo: !r ? 1 : r.ultimaOk ? 2 : 0, fecha: r?.ultima ?? '', azar: Math.random() };
    })
    .sort((a, b) => a.grupo - b.grupo || (a.grupo === 2 && a.fecha.localeCompare(b.fecha)) || a.azar - b.azar)
    .map(x => x.f);
}

/**
 * Elige `n` significados incorrectos para `objetivo`: de su misma clase y, si
 * no bastan, de las clases anteriores (según `ordenClases`); de las
 * posteriores solo como último recurso. Se prefieren frases de longitud
 * parecida y nunca una que signifique lo mismo.
 */
export function elegirDistractores(objetivo, candidatas, ordenClases, n = 3, azar = Math.random) {
  const posObjetivo = ordenClases.indexOf(objetivo.clase);
  const prohibidas = new Set([objetivo.es, ...objetivo.alt_es].map(t => normalizar(t, 'es')));
  const ruObjetivo = normalizar(objetivo.ru, 'ru');
  const largo = palabras(objetivo.es).length;

  const vistas = new Set();
  const validas = [];
  for (const c of candidatas) {
    const es = normalizar(c.es, 'es');
    if (prohibidas.has(es) || vistas.has(es) || normalizar(c.ru, 'ru') === ruObjetivo) continue;
    if ([...c.alt_es].some(t => prohibidas.has(normalizar(t, 'es')))) continue;
    vistas.add(es);
    const pos = ordenClases.indexOf(c.clase);
    validas.push({
      c,
      grupo: c.clase === objetivo.clase ? 0 : pos < posObjetivo ? 1 : 2,
      dif: Math.abs(palabras(c.es).length - largo),
      azar: azar(),
    });
  }
  validas.sort((a, b) => a.grupo - b.grupo || a.dif - b.dif || a.azar - b.azar);
  const permitidas = validas.filter(x => x.grupo < 2);
  const base = permitidas.length >= n ? permitidas : validas;
  // Entre las más parecidas, al azar, para que no salgan siempre las mismas.
  return barajar(base.slice(0, n * 2), azar).slice(0, n).map(x => x.c);
}
