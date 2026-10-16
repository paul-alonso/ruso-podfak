// Home: modo nivelación, la selección actual, el resumen de progreso, las
// herramientas y el avance de cada clase. Exportar, importar y sincronizar
// están en Ajustes (js/ajustes.js).

import {
  h, icono, iniciarPagina, nombreClase, fechaLegible, etiquetaSeleccion, crearHoja,
} from './comun.js';
import { almacen, hoy } from './storage.js';
import { mazoDeEstudio, colaDelDia } from './srs.js';
import {
  avances, resumenPalabras, aciertos, racha, planNivelacion, clasesHastaGrupo, esEjemplo,
  UMBRAL_CUBIERTA, RITMOS, ULTIMA,
} from './progreso.js';

const HERRAMIENTAS = [
  { href: 'lector.html', icono: 'libro', titulo: 'Lector', desc: 'Lee los textos palabra por palabra, con audio y traducción.' },
  { href: 'traduccion.html', icono: 'lapiz', titulo: 'Traducir', desc: 'Traduce frases del ruso al español y al revés.' },
  { href: 'escucha.html', icono: 'auriculares', titulo: 'Escuchar', desc: 'Escucha frases y elige su significado o escríbelas.' },
  { href: 'flashcards.html', icono: 'tarjetas', titulo: 'Tarjetas', desc: 'Repaso espaciado del vocabulario.' },
];

iniciarPagina({ pagina: 'inicio', renderizar });

const contarFrases = c => c.textos.reduce((n, t) => n + t.frases.length, 0);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const pct = x => `${Math.round(x * 100)} %`;

function barra(fraccion, etiqueta, clase = '') {
  const valor = Math.round(Math.min(1, fraccion) * 100);
  return h('div', {
    class: `barra ${clase}`, role: 'progressbar', 'aria-label': etiqueta,
    'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(valor),
  }, h('span', { style: `width: ${valor}%` }));
}

/** Tarjetas pendientes hoy (repasos + nuevas hasta el límite) en el modo elegido en Tarjetas. */
function tarjetasPendientes(ctx, estado) {
  const modo = estado.ajustes.modoTarjetas;
  const mazo = mazoDeEstudio({
    seleccion: ctx.seleccion, todas: ctx.clases, anadidas: estado.tarjetas,
    vocabulario: ctx.vocabulario, estados: estado.srs.estados, modo,
  });
  const { repasos, nuevas } = colaDelDia(mazo, estado.srs.estados, modo, hoy());
  return { repasos: repasos.length, nuevas: nuevas.length, total: repasos.length + nuevas.length };
}

/** Ir a estudiar unas clases: las elige y abre el Lector. */
function estudiar(desde, hasta = desde) {
  almacen.fijarSeleccion(desde, hasta);
  location.href = 'lector.html';
}

function renderizar(ctx, cont) {
  if (!ctx.clases.length) {
    cont.append(h('section', { class: 'tarjeta' },
      h('h1', {}, 'Aún no hay clases'),
      h('p', {}, 'Copia el JSON de cada clase a data/clases/ y añádela a data/index.json.'),
      h('p', {}, h('a', { href: 'validar.html' }, 'Abrir el validador'))),
    enlaceAjustes());
    return;
  }
  const estado = almacen.leer();
  const mapa = avances(ctx.clases, estado);
  const pendientes = tarjetasPendientes(ctx, estado);

  cont.append(
    seccionNivelacion(ctx, estado, mapa, pendientes),
    portada(ctx, pendientes),
    seccionProgreso(ctx, estado, mapa),
    h('h2', {}, 'Herramientas'),
    h('div', { class: 'herramientas' }, HERRAMIENTAS.map(t => h('a', { class: 'herramienta', href: t.href },
      icono(t.icono),
      h('strong', {}, t.titulo),
      h('span', { class: 'sub' }, t.desc),
      t.href === 'flashcards.html' && pendientes.total > 0 && h('span', { class: 'chip chip-pendientes' }, `${pendientes.total} para hoy`)))),
    h('h2', {}, 'Clases'),
    h('ul', { class: 'lista-clases' }, ctx.clases.map(c => itemClase(c, ctx, mapa.get(c.id)))),
    enlaceAjustes(),
    h('p', { class: 'pie' }, h('a', { href: 'validar.html' }, 'Validar los datos de las clases')));
}

// ---------------------------------------------------------------------------
// Selección actual
// ---------------------------------------------------------------------------

function portada(ctx, pendientes) {
  const sel = ctx.seleccion;
  const textos = sel.reduce((n, c) => n + c.textos.length, 0);
  const frases = sel.reduce((n, c) => n + contarFrases(c), 0);
  const palabras = sel.reduce((n, c) => n + c.vocabulario.length, 0);
  return h('section', { class: 'tarjeta portada' },
    h('p', { class: 'etiqueta' }, 'Estás estudiando'),
    h('h1', {}, etiquetaSeleccion(ctx.idsSeleccion)),
    sel.length === 1 && h('p', { class: 'sub' }, h('span', { lang: 'ru' }, `Урок ${sel[0].urok}`), ` · ${sel[0].titulo}`),
    h('p', { class: 'sub' }, [plural(textos, 'texto', 'textos'), plural(frases, 'frase', 'frases'), plural(palabras, 'palabra', 'palabras')].join(' · ')),
    h('div', { class: 'acciones' },
      h('a', { class: 'boton primario', href: 'lector.html' }, icono('libro'), 'Abrir el Lector'),
      h('button', { type: 'button', class: 'boton', onclick: ctx.abrirSelector }, 'Cambiar clases')),
    h('a', { class: 'pendientes', href: 'flashcards.html' }, icono('tarjetas'),
      pendientes.total
        ? h('span', {}, h('strong', {}, plural(pendientes.total, 'tarjeta', 'tarjetas')), ' para hoy',
          h('small', { class: 'sub' }, ` (${pendientes.repasos} repasos, ${pendientes.nuevas} nuevas)`))
        : h('span', {}, 'Tarjetas al día: no hay nada pendiente hoy')));
}

// ---------------------------------------------------------------------------
// Modo nivelación
// ---------------------------------------------------------------------------

function seccionNivelacion(ctx, estado, mapa, pendientes) {
  const niv = estado.nivelacion;
  const reales = ctx.clases.filter(c => !esEjemplo(c.id));
  if (!niv) {
    if (!reales.length) return null;
    return h('section', { class: 'tarjeta nivelacion inactiva' },
      h('h2', {}, '¿Vas por detrás del grupo?'),
      h('p', { class: 'sub' }, 'Indica en qué clase va tu grupo y te propongo un plan diario para alcanzarlo.'),
      h('button', { type: 'button', class: 'boton', onclick: () => editarNivelacion(ctx, null) }, 'Activar el modo nivelación'));
  }

  const plan = planNivelacion(ctx.clases, mapa, niv, hoy());
  if (plan.planNuevo) almacen.fijarPlan(hoy(), plan.clasesHoy);
  const objetivo = clasesHastaGrupo(ctx.clases, niv.claseGrupo);
  const grupo = objetivo.at(-1);
  const textoGrupo = niv.claseGrupo === ULTIMA ? `la última clase (${grupo ? nombreClase(grupo.id) : '—'})` : nombreClase(niv.claseGrupo);

  const cabeza = h('div', { class: 'nivelacion-cabeza' },
    h('div', {},
      h('h2', {}, 'Nivelación'),
      h('p', { class: 'sub' }, `El grupo va en ${textoGrupo} · ${plural(niv.ritmo, 'clase', 'clases')} por día`)),
    h('button', { type: 'button', class: 'boton', onclick: () => editarNivelacion(ctx, niv) }, 'Cambiar'));

  const avanceTotal = h('div', { class: 'progreso' },
    barra(plan.objetivo ? plan.cubiertas / plan.objetivo : 0, 'Clases cubiertas hasta el grupo'),
    h('small', { class: 'sub' }, `${plan.cubiertas} de ${plan.objetivo} cubiertas`));

  if (plan.alDia) {
    return h('section', { class: 'tarjeta nivelacion' }, cabeza, avanceTotal,
      h('p', { class: 'aviso ok' }, '🎉 ¡Has alcanzado al grupo! Sigue con las clases nuevas y el repaso de tarjetas.'));
  }

  const filas = plan.clasesHoy.map(id => {
    const c = ctx.porId.get(id);
    const a = mapa.get(id);
    return h('li', { class: a.cubierta ? 'plan-clase cubierta' : 'plan-clase' },
      h('div', { class: 'plan-texto' },
        h('strong', {}, `${a.cubierta ? '✓ ' : ''}${nombreClase(id)}`),
        h('span', { class: 'sub' }, c.titulo),
        h('div', { class: 'progreso' }, barra(a.avance, `Avance de ${nombreClase(id)}`), h('small', { class: 'sub' }, pct(a.avance)))),
      h('button', { type: 'button', class: a.cubierta ? 'boton' : 'boton primario', onclick: () => estudiar(id) }, 'Estudiar'));
  });

  const ids = ctx.indice.map(e => e.id);
  const ordenHoy = [...plan.clasesHoy].sort((x, y) => ids.indexOf(x) - ids.indexOf(y));
  const fin = plan.dias <= 1
    ? 'Con el plan de hoy alcanzas al grupo.'
    : `Faltan ${plural(plan.pendientes, 'clase', 'clases')}: a este ritmo alcanzas al grupo en ${plan.dias} días (${fechaLegible(plan.fechaFin)}).`;

  return h('section', { class: 'tarjeta nivelacion' }, cabeza, avanceTotal,
    h('h3', {}, plan.completadoHoy ? '✓ Plan de hoy completado' : 'Hoy'),
    h('ul', { class: 'plan' }, filas,
      h('li', { class: 'plan-clase' },
        h('div', { class: 'plan-texto' },
          h('strong', {}, '+ Repaso de tarjetas'),
          h('span', { class: 'sub' }, pendientes.total ? `${plural(pendientes.total, 'tarjeta', 'tarjetas')} para hoy` : 'Al día')),
        h('a', { class: 'boton', href: 'flashcards.html' }, 'Repasar'))),
    h('div', { class: 'acciones' },
      plan.clasesHoy.length > 1 && !plan.completadoHoy && h('button', {
        type: 'button', class: 'boton', onclick: () => estudiar(ordenHoy[0], ordenHoy.at(-1)),
      }, 'Estudiar las de hoy juntas'),
      plan.completadoHoy && plan.siguiente && h('button', {
        type: 'button', class: 'boton primario',
        onclick: () => { almacen.fijarPlan(hoy(), [...plan.clasesHoy, plan.siguiente]); ctx.redibujar(); },
      }, `Adelantar ${nombreClase(plan.siguiente)}`)),
    h('p', { class: 'sub' }, fin),
    h('p', { class: 'sub pequeno' }, `Una clase está cubierta al llegar al ${pct(UMBRAL_CUBIERTA)} de su avance.`));
}

function editarNivelacion(ctx, actual) {
  const dlg = crearHoja('Modo nivelación');
  dlg.addEventListener('close', () => dlg.remove());
  const reales = ctx.clases.filter(c => !esEjemplo(c.id));
  const grupo = h('select', { id: 'niv-grupo' },
    h('option', { value: ULTIMA }, 'La última clase disponible (se actualiza sola)'),
    reales.map(c => h('option', { value: c.id }, `${nombreClase(c.id)} — ${c.titulo}`)));
  grupo.value = actual?.claseGrupo ?? ULTIMA;
  let ritmo = actual?.ritmo ?? 2;
  const botonesRitmo = RITMOS.map(r => h('button', {
    type: 'button', 'aria-pressed': String(r === ritmo),
    onclick: () => {
      ritmo = r;
      botonesRitmo.forEach((b, i) => b.setAttribute('aria-pressed', String(RITMOS[i] === r)));
    },
  }, String(r)));

  dlg.append(h('div', { class: 'hoja-contenido' },
    h('div', { class: 'hoja-cabeza' },
      h('h2', {}, 'Modo nivelación'),
      h('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', onclick: () => dlg.close() }, icono('cerrar'))),
    h('label', { class: 'campo', for: 'niv-grupo' }, '¿En qué clase va el grupo?'), grupo,
    h('p', { class: 'campo', id: 'niv-ritmo' }, 'Clases nuevas por día'),
    h('div', { class: 'segmentado', role: 'group', 'aria-labelledby': 'niv-ritmo' }, botonesRitmo),
    h('p', { class: 'sub' }, 'Cada día te propongo las primeras clases que aún no tienes cubiertas, más el repaso de tarjetas.'),
    h('button', {
      type: 'button', class: 'boton primario ancho',
      onclick: () => { almacen.fijarNivelacion({ claseGrupo: grupo.value, ritmo }); dlg.close(); ctx.redibujar(); },
    }, 'Guardar'),
    actual && h('button', {
      type: 'button', class: 'boton ancho',
      onclick: () => { almacen.fijarNivelacion(null); dlg.close(); ctx.redibujar(); },
    }, 'Desactivar el modo nivelación')));
  dlg.showModal();
}

// ---------------------------------------------------------------------------
// Resumen de progreso
// ---------------------------------------------------------------------------

function seccionProgreso(ctx, estado, mapa) {
  const reales = ctx.clases.filter(c => !esEjemplo(c.id));
  const cubiertas = reales.filter(c => mapa.get(c.id).cubierta).length;
  const palabras = resumenPalabras(reales, estado);
  const r = racha(estado.actividad, hoy());
  const ac = aciertos(estado);

  const textoRacha = r.hoy ? '¡Hoy ya practicaste!'
    : r.dias ? 'Practica hoy para no perderla' : 'Practica hoy para empezarla';
  const filaAciertos = (nombre, { ok, mal }) => {
    const total = ok + mal;
    return h('li', {},
      h('span', {}, nombre),
      total ? barra(ok / total, `Aciertos en ${nombre}`, 'barra-aciertos') : h('span', { class: 'barra-vacia' }),
      h('span', { class: 'sub' }, total ? `${pct(ok / total)} · ${ok}/${total}` : 'sin datos'));
  };

  return h('section', { class: 'progreso-resumen', 'aria-labelledby': 'titulo-progreso' },
    h('h2', { id: 'titulo-progreso' }, 'Tu progreso'),
    h('div', { class: 'cifras' },
      h('div', { class: 'cifra-tarjeta' },
        h('span', { class: 'etiqueta' }, 'Racha'),
        h('strong', {}, `🔥 ${plural(r.dias, 'día', 'días')}`),
        h('span', { class: 'sub' }, textoRacha)),
      h('div', { class: 'cifra-tarjeta' },
        h('span', { class: 'etiqueta' }, 'Clases cubiertas'),
        h('strong', {}, `${cubiertas} de ${reales.length}`),
        h('span', { class: 'sub' }, `≥ ${pct(UMBRAL_CUBIERTA)} de avance`)),
      h('div', { class: 'cifra-tarjeta ancha' },
        h('span', { class: 'etiqueta' }, 'Palabras'),
        h('strong', {}, `${palabras.aprendidas} aprendidas`, h('span', { class: 'sub' }, ` · ${palabras.aprendiendo + palabras.sinEmpezar} pendientes`)),
        palabras.total > 0 && h('div', { class: 'barra apilada', role: 'img', 'aria-label': `${palabras.aprendidas} aprendidas, ${palabras.aprendiendo} aprendiendo, ${palabras.sinEmpezar} sin empezar` },
          h('span', { class: 'aprendidas', style: `width: ${(palabras.aprendidas / palabras.total) * 100}%` }),
          h('span', { class: 'aprendiendo', style: `width: ${(palabras.aprendiendo / palabras.total) * 100}%` })),
        h('span', { class: 'sub leyenda-palabras' },
          h('i', { class: 'punto aprendidas' }), `${palabras.aprendidas} aprendidas `,
          h('i', { class: 'punto aprendiendo' }), `${palabras.aprendiendo} aprendiendo `,
          h('i', { class: 'punto' }), `${palabras.sinEmpezar} sin empezar`)),
      h('div', { class: 'cifra-tarjeta ancha' },
        h('span', { class: 'etiqueta' }, 'Aciertos por herramienta'),
        h('ul', { class: 'aciertos' },
          filaAciertos('Traducir', ac.traduccion),
          filaAciertos('Escuchar', ac.escucha),
          filaAciertos('Tarjetas', ac.tarjetas)),
        h('span', { class: 'sub' }, `Lector: ${plural(ac.lector, 'frase leída', 'frases leídas')} · ${plural(r.total, 'día', 'días')} de práctica en total`))),
    h('details', { class: 'como-se-calcula' },
      h('summary', {}, '¿Cómo se calcula?'),
      h('p', {}, `El avance de una clase es la media de: frases de sus textos leídas en el Lector, frases acertadas al menos una vez en Traducir o Escuchar, y palabras de su vocabulario empezadas en Tarjetas. Con un ${pct(UMBRAL_CUBIERTA)} la clase está cubierta.`),
      h('p', {}, 'Una palabra está aprendida cuando su próximo repaso queda a 3 días o más (dos repasos buenos seguidos en días distintos). La clase de ejemplo no cuenta.')));
}

// ---------------------------------------------------------------------------
// Clases
// ---------------------------------------------------------------------------

function itemClase(c, ctx, a) {
  const elegida = ctx.idsSeleccion.includes(c.id);
  const parte = (nombre, p) => p.total > 0 && `${nombre} ${p.hechas}/${p.total}`;
  return h('li', { class: elegida ? 'clase-item elegida' : 'clase-item' },
    h('div', { class: 'clase-item-cabeza' },
      h('strong', {}, nombreClase(c.id)),
      h('span', { class: 'chip', lang: 'ru' }, `Урок ${c.urok}`),
      a.cubierta && h('span', { class: 'chip chip-cubierta' }, '✓ Cubierta'),
      h('span', { class: 'sub' }, fechaLegible(c.fecha))),
    h('p', {}, c.titulo),
    h('div', { class: 'progreso' },
      barra(a.avance, `Avance de ${nombreClase(c.id)}`, a.cubierta ? 'completa' : ''),
      h('small', { class: 'sub' }, pct(a.avance))),
    h('p', { class: 'sub desglose' },
      [parte('Lectura', a.lectura), parte('Práctica', a.practica), parte('Palabras', a.vocabulario)].filter(Boolean).join(' · ')),
    h('div', { class: 'acciones' },
      h('button', { type: 'button', class: 'boton', onclick: () => estudiar(c.id) }, 'Leer'),
      !elegida && h('button', { type: 'button', class: 'boton', onclick: () => ctx.cambiarSeleccion(c.id, c.id) }, 'Elegir')));
}

function enlaceAjustes() {
  return h('a', { class: 'tarjeta enlace-tarjeta', href: 'ajustes.html' },
    icono('ajustes'),
    h('span', {}, h('strong', {}, 'Ajustes'),
      h('span', { class: 'sub' }, 'Sincronizar con GitHub, exportar e importar el progreso')));
}