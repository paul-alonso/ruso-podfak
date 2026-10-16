// Ajustes: sincronización con un Gist de GitHub y copia manual del progreso
// (exportar / importar).

import { h, iniciarPagina, estadoInstalacion, instalar } from './comun.js';
import { almacen, hoy, leerPaquete } from './storage.js';
import { sync, URL_CREAR_TOKEN } from './sync.js';

let mensajeDatos = null; // aviso de la última importación: { tipo, texto, deshacer }
let mensajeSync = null;  // error al conectar

iniciarPagina({ pagina: 'ajustes', renderizar });

function renderizar(ctx, cont) {
  cont.append(
    h('h1', { class: 'titulo-pagina' }, 'Ajustes'),
    seccionInstalar(ctx),
    seccionSync(ctx),
    seccionDatos(ctx),
    h('p', { class: 'pie' }, h('a', { href: 'validar.html' }, 'Validar los datos de las clases')));
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

function cuando(ms) {
  if (!ms) return 'nunca';
  const d = new Date(ms);
  const mismoDia = hoy(d) === hoy();
  return mismoDia
    ? `hoy a las ${d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
}

// ---------------------------------------------------------------------------
// Instalar la app
// ---------------------------------------------------------------------------

function seccionInstalar(ctx) {
  const estado = estadoInstalacion();
  const titulo = h('h2', { id: 'titulo-instalar' }, 'Instalar la app');
  let cuerpo;
  if (estado === 'instalada') {
    cuerpo = [h('p', { class: 'aviso ok' }, '✓ Estás usando la app instalada. Funciona sin conexión.')];
  } else if (estado === 'disponible') {
    cuerpo = [
      h('p', { class: 'sub' }, 'Instálala para abrirla desde la pantalla de inicio, a pantalla completa y sin conexión.'),
      h('button', {
        type: 'button', class: 'boton primario',
        onclick: async () => { await instalar(); ctx.redibujar(); },
      }, 'Instalar la app'),
    ];
  } else if (estado === 'ios') {
    cuerpo = [
      h('ol', { class: 'pasos-instalar' },
        h('li', {}, 'Pulsa el botón ', h('strong', {}, 'Compartir'), ' (el cuadrado con la flecha hacia arriba).'),
        h('li', {}, 'Elige ', h('strong', {}, 'Añadir a pantalla de inicio'), ' y pulsa ', h('strong', {}, 'Añadir'), '.'),
        h('li', {}, 'Abre la app desde el icono: se abrirá a pantalla completa.')),
      h('p', { class: 'aviso' }, 'En iPhone la app instalada tiene su propio almacenamiento, separado de Safari: conecta la sincronización (y estudia) desde la app instalada, no desde Safari.'),
    ];
  } else {
    cuerpo = [h('p', { class: 'sub' }, 'En Chrome o Edge: menú ⋮ → «Instalar aplicación» (o «Añadir a pantalla de inicio» en Android).')];
  }
  return h('section', { class: 'tarjeta instalar', 'aria-labelledby': 'titulo-instalar' }, titulo, cuerpo);
}

// ---------------------------------------------------------------------------
// Sincronización con GitHub
// ---------------------------------------------------------------------------

function pasosToken() {
  return h('details', { class: 'pasos-token' },
    h('summary', {}, '¿Cómo creo el token?'),
    h('ol', {},
      h('li', {}, 'Abre ', h('a', { href: URL_CREAR_TOKEN, target: '_blank', rel: 'noopener' }, 'este enlace a GitHub'),
        ' (inicia sesión si te lo pide). Ya viene marcado solo el permiso «gist».'),
      h('li', {}, 'En «Expiration» elige cuánto durará (p. ej. 90 días; luego tendrás que crear otro).'),
      h('li', {}, 'Comprueba que la única casilla marcada es «gist» y pulsa «Generate token».'),
      h('li', {}, 'Copia el token (empieza por ghp_). GitHub solo lo enseña una vez.'),
      h('li', {}, 'Pégalo aquí abajo y pulsa «Conectar». Repite este paso en cada dispositivo.')),
    h('p', { class: 'sub' }, 'Más detalles en DEPLOY.md.'));
}

function seccionSync(ctx) {
  const seccion = h('section', { class: 'tarjeta ajustes-sync', 'aria-labelledby': 'titulo-sync' });
  // replaceChildren (a diferencia de h) no descarta null/false: se filtran aquí.
  const pintar = () => seccion.replaceChildren(...contenidoSync(ctx, pintar).filter(Boolean));
  pintar();
  // El estado cambia solo (subidas, conexión…): se repinta sin recargar la página.
  const dejar = sync.alCambiarEstado(() => {
    if (!seccion.isConnected) return dejar();
    if (!seccion.contains(document.activeElement) || document.activeElement.tagName !== 'INPUT') pintar();
  });
  return seccion;
}

function contenidoSync(ctx, pintar) {
  const info = sync.info();
  const titulo = h('h2', { id: 'titulo-sync' }, 'Sincronizar con GitHub');

  if (!info.conectado) {
    const campo = h('input', {
      id: 'token', type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
      placeholder: 'ghp_…', class: 'campo-texto',
    });
    const boton = h('button', { type: 'button', class: 'boton primario' }, 'Conectar');
    const conectar = async () => {
      boton.disabled = true;
      boton.textContent = 'Conectando…';
      mensajeSync = null;
      try {
        await sync.conectar(campo.value);
      } catch (e) {
        mensajeSync = e.message;
      }
      pintar();
      ctx.redibujar?.();
    };
    boton.addEventListener('click', conectar);
    campo.addEventListener('keydown', e => { if (e.key === 'Enter') conectar(); });
    return [
      titulo,
      h('p', { class: 'sub' }, 'Opcional. Guarda tu progreso en un Gist secreto de tu cuenta de GitHub y lo combina automáticamente entre tus dispositivos (PC, móvil…).'),
      pasosToken(),
      h('label', { class: 'campo', for: 'token' }, 'Token de GitHub (solo permiso «gist»)'),
      h('div', { class: 'fila-token' }, campo, boton),
      mensajeSync && h('p', { class: 'aviso error', role: 'alert' }, mensajeSync),
      h('p', { class: 'sub pequeno' }, 'El token se guarda solo en este dispositivo y no se incluye al exportar. Un Gist secreto no sale en búsquedas ni en tu perfil, pero quien tenga su dirección puede leerlo.'),
    ];
  }

  return [
    titulo,
    h('p', { class: 'estado-sync', 'data-sync': info.estado, role: 'status' },
      h('span', { class: 'punto-sync', 'aria-hidden': 'true' }),
      h('strong', {}, info.texto)),
    info.detalle && info.estado !== 'sincronizado' && h('p', { class: 'sub' }, info.detalle),
    h('p', { class: 'sub' }, `Última sincronización: ${cuando(info.ultimaSync)}.`),
    info.avisoPermisos && h('p', { class: 'aviso' }, info.avisoPermisos),
    info.estado === 'error-token' && h('p', { class: 'aviso error' },
      'Desconecta y vuelve a conectar con un token nuevo. Tu progreso de este dispositivo no se pierde.'),
    h('div', { class: 'acciones' },
      h('button', {
        type: 'button', class: 'boton primario',
        disabled: info.estado === 'sincronizando',
        onclick: () => sync.sincronizar(),
      }, 'Sincronizar ahora'),
      info.gistUrl && h('a', { class: 'boton', href: info.gistUrl, target: '_blank', rel: 'noopener' }, 'Ver el Gist'),
      h('button', {
        type: 'button', class: 'boton',
        onclick: () => { sync.desconectar(); mensajeSync = null; pintar(); },
      }, 'Desconectar')),
    h('p', { class: 'sub pequeno' }, 'Desconectar borra el token de este dispositivo. Tu progreso y el Gist no se borran.'),
  ];
}

// ---------------------------------------------------------------------------
// Exportar / importar
// ---------------------------------------------------------------------------

function resumenProgreso(p) {
  const vistas = Object.values(p.lector.vistas).reduce((n, v) => n + Object.keys(v).length, 0);
  const respuestas = ['traduccion', 'escucha'].reduce((n, k) =>
    n + Object.values(p[k].resultados).reduce((m, cl) => m + Object.values(cl).reduce((s, r) => s + r.ok + r.mal, 0), 0), 0);
  return [
    plural(vistas, 'frase leída', 'frases leídas'),
    plural(respuestas, 'respuesta', 'respuestas'),
    plural(Object.keys(p.srs.estados).length, 'tarjeta empezada', 'tarjetas empezadas'),
    plural(Object.keys(p.actividad).length, 'día de práctica', 'días de práctica'),
  ].join(', ');
}

function exportar() {
  const paquete = almacen.exportar();
  const blob = new Blob([JSON.stringify(paquete, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `podfak-progreso-${hoy()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function seccionDatos(ctx) {
  const zona = h('div', { class: 'datos-zona', role: 'status' });
  const archivo = h('input', { type: 'file', accept: '.json,application/json', id: 'importar-archivo', class: 'oculto' });

  const mostrarMensaje = () => {
    if (!mensajeDatos) return zona.replaceChildren();
    zona.replaceChildren(h('p', { class: `aviso ${mensajeDatos.tipo}` }, mensajeDatos.texto,
      mensajeDatos.deshacer && h('button', {
        type: 'button', class: 'boton enlace',
        onclick: () => {
          const ok = almacen.deshacerImportacion();
          mensajeDatos = { tipo: ok ? 'ok' : 'error', texto: ok ? 'Se deshizo la importación.' : 'No hay nada que deshacer.' };
          ctx.redibujar();
        },
      }, 'Deshacer')));
  };

  archivo.addEventListener('change', async () => {
    const f = archivo.files[0];
    archivo.value = '';
    if (!f) return;
    const { progreso, exportado, error } = leerPaquete(await f.text());
    if (error) {
      mensajeDatos = { tipo: 'error', texto: error };
      mostrarMensaje();
      return;
    }
    const fecha = exportado ? new Date(exportado).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : 'fecha desconocida';
    const importar = modo => {
      almacen.importar(progreso, modo);
      mensajeDatos = { tipo: 'ok', texto: modo === 'combinar' ? '✓ Progreso combinado. ' : '✓ Progreso reemplazado. ', deshacer: true };
      ctx.redibujar();
    };
    mensajeDatos = null;
    zona.replaceChildren(h('div', { class: 'confirmar-importacion' },
      h('p', {}, h('strong', {}, `Archivo exportado el ${fecha}`)),
      h('p', { class: 'sub' }, `Contiene: ${resumenProgreso(progreso)}.`),
      h('p', { class: 'sub' }, `En este dispositivo: ${resumenProgreso(almacen.leer())}.`),
      h('div', { class: 'acciones' },
        h('button', { type: 'button', class: 'boton primario', onclick: () => importar('combinar') }, 'Combinar'),
        h('button', { type: 'button', class: 'boton', onclick: () => importar('reemplazar') }, 'Reemplazar'),
        h('button', { type: 'button', class: 'boton', onclick: () => zona.replaceChildren() }, 'Cancelar')),
      h('p', { class: 'sub pequeno' }, 'Combinar une lo de ambos dispositivos (recomendado si usas los dos). Reemplazar deja este dispositivo exactamente como el archivo.')));
  });

  mostrarMensaje();
  return h('section', { class: 'tarjeta datos', 'aria-labelledby': 'titulo-datos' },
    h('h2', { id: 'titulo-datos' }, 'Copia manual del progreso'),
    h('p', { class: 'sub' }, 'Sin GitHub también puedes pasar el progreso a otro dispositivo: expórtalo aquí e impórtalo allí.'),
    h('div', { class: 'acciones' },
      h('button', { type: 'button', class: 'boton', onclick: exportar }, 'Exportar progreso'),
      h('button', { type: 'button', class: 'boton', onclick: () => archivo.click() }, 'Importar progreso…'),
      archivo),
    zona);
}
