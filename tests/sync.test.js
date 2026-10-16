// Sincronización con Gist contra un GitHub simulado (sin red ni token real).

import { prueba, igual, cierto } from './mini.js';
import { crearAlmacen, combinar, normalizar, CLAVE } from '../js/storage.js';
import { crearSync, contenido, CLAVE_SYNC, ARCHIVO } from '../js/sync.js';
import { crearGitHub } from './github-falso.js';

const espera = ms => new Promise(r => setTimeout(r, ms));

function memoria() {
  const m = new Map();
  return { m, getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

/** Un «dispositivo»: su propio almacenamiento, almacén y sincronización. */
function dispositivo(github, { retardo = 20 } = {}) {
  const backend = memoria();
  const almacen = crearAlmacen(backend);
  const sync = crearSync({ almacen, backend, fetchFn: github.fetchFn, retardo });
  almacen.alCambiar(sync.programarSubida); // lo que hace sync.iniciar() en la app
  return { backend, almacen, sync };
}

const vistas = d => Object.keys(d.almacen.leer().lector.vistas).sort();

prueba('sync: conectar crea un Gist secreto con el progreso; el token no va en el progreso ni al exportar', async () => {
  const github = crearGitHub();
  const a = dispositivo(github);
  a.almacen.marcarVista('clase_01', 't1/f1');
  await a.sync.conectar(' ghp_bueno ');
  igual(github.gists.size, 1);
  const [g] = github.gists.values();
  igual([g.public, Object.keys(g.files)], [false, [ARCHIVO]]);
  igual(Object.keys(github.progreso().lector.vistas), ['clase_01']);
  igual(a.sync.info().estado, 'sincronizado');
  igual(JSON.parse(a.backend.getItem(CLAVE_SYNC)).token, 'ghp_bueno');
  cierto(!a.backend.getItem(CLAVE).includes('ghp_bueno'), 'el token está en el progreso');
  cierto(!JSON.stringify(a.almacen.exportar()).includes('ghp_bueno'), 'el token está en el archivo exportado');
  cierto(!g.files[ARCHIVO].content.includes('ghp_bueno'), 'el token está en el Gist');
});

prueba('sync: otro dispositivo encuentra el mismo Gist y se combina en los dos sentidos', async () => {
  const github = crearGitHub();
  const a = dispositivo(github);
  a.almacen.marcarVista('clase_01', 't1/f1');
  await a.sync.conectar('ghp_bueno');

  const b = dispositivo(github);
  b.almacen.marcarVista('clase_02', 't1/f1');
  b.almacen.fijarAjuste('velocidad', 1);
  await b.sync.conectar('ghp_bueno');
  igual(github.gists.size, 1);
  igual(vistas(b), ['clase_01', 'clase_02']);
  igual(Object.keys(github.progreso().lector.vistas).sort(), ['clase_01', 'clase_02']);

  const r = await a.sync.sincronizar();
  igual(r.cambioLocal, true);
  igual(vistas(a), ['clase_01', 'clase_02']);
  // Los ajustes son de cada dispositivo.
  igual([a.almacen.ajustes().velocidad, b.almacen.ajustes().velocidad], [0.8, 1]);
  // Sin cambios, no se vuelve a subir.
  const patches = github.peticiones.filter(p => p.metodo === 'PATCH').length;
  igual((await a.sync.sincronizar()).cambioLocal, false);
  igual(github.peticiones.filter(p => p.metodo === 'PATCH').length, patches);
});

prueba('sync: al estudiar marca «pendiente» y sube una sola vez tras el retardo', async () => {
  const github = crearGitHub();
  const a = dispositivo(github, { retardo: 40 });
  await a.sync.conectar('ghp_bueno');
  const antes = github.peticiones.filter(p => p.metodo === 'PATCH').length;
  a.almacen.marcarVista('clase_01', 't1/f1');
  a.almacen.marcarVista('clase_01', 't1/f2');
  a.almacen.registrarResultado('traduccion', 'clase_01', 'p1', 'ru-es', true);
  igual(a.sync.info().estado, 'pendiente');
  cierto(JSON.parse(a.backend.getItem(CLAVE_SYNC)).pendiente, 'pendiente no se guardó');
  // Cambiar ajustes o la selección no es progreso: no marca pendiente.
  await espera(150);
  igual(github.peticiones.filter(p => p.metodo === 'PATCH').length, antes + 1);
  igual(a.sync.info().estado, 'sincronizado');
  igual(Object.keys(github.progreso().lector.vistas.clase_01), ['t1/f1', 't1/f2']);
  a.almacen.fijarAjuste('acentos', false);
  a.almacen.fijarSeleccion('clase_01', 'clase_01');
  igual(a.sync.info().estado, 'sincronizado');
});

prueba('sync: sin conexión todo sigue funcionando y se sube al volver (también tras cerrar la app)', async () => {
  const github = crearGitHub();
  const a = dispositivo(github, { retardo: 20 });
  await a.sync.conectar('ghp_bueno');
  github.estado.sinConexion = true;
  a.almacen.marcarVista('clase_03', 't1/f1');
  await espera(80);
  igual(a.sync.info().estado, 'sin-conexion');
  igual(vistas(a), ['clase_03']);
  cierto(JSON.parse(a.backend.getItem(CLAVE_SYNC)).pendiente, 'debe quedar pendiente');

  // «Cerrar y volver a abrir»: otra instancia sobre el mismo almacenamiento recuerda lo pendiente.
  const reabierta = crearSync({ almacen: a.almacen, backend: a.backend, fetchFn: github.fetchFn });
  igual(reabierta.info().estado, 'pendiente');
  github.estado.sinConexion = false;
  await reabierta.sincronizar();
  igual(reabierta.info().estado, 'sincronizado');
  igual(Object.keys(github.progreso().lector.vistas), ['clase_03']);
});

prueba('sync: al salir sube con keepalive, sin descargar antes y una sola vez', async () => {
  const github = crearGitHub();
  const a = dispositivo(github, { retardo: 60000 });
  await a.sync.conectar('ghp_bueno');
  a.almacen.marcarVista('clase_01', 't2/f1');
  const desde = github.peticiones.length;
  await Promise.all([a.sync.subirAlSalir(), a.sync.subirAlSalir()]); // visibilitychange + pagehide
  const nuevas = github.peticiones.slice(desde);
  igual(nuevas.map(p => [p.metodo, p.keepalive]), [['PATCH', true]]);
  igual(a.sync.info().estado, 'sincronizado');
  igual(Object.keys(github.progreso().lector.vistas), ['clase_01']);
  // Sin nada pendiente no hace nada.
  await a.sync.subirAlSalir();
  igual(github.peticiones.length, desde + 1);
});

prueba('sync: lo que pisa una subida al salir se recupera en la siguiente sincronización', async () => {
  const github = crearGitHub();
  const a = dispositivo(github, { retardo: 60000 });
  const b = dispositivo(github, { retardo: 60000 });
  await a.sync.conectar('ghp_bueno');
  await b.sync.conectar('ghp_bueno');
  a.almacen.marcarVista('clase_01', 't1/f1');
  await a.sync.sincronizar();
  b.almacen.marcarVista('clase_02', 't1/f1');
  await b.sync.subirAlSalir(); // sube sin descargar: el Gist pierde momentáneamente lo de A
  igual(Object.keys(github.progreso().lector.vistas), ['clase_02']);
  await a.sync.sincronizar();  // A combina y vuelve a subir lo suyo
  igual(Object.keys(github.progreso().lector.vistas).sort(), ['clase_01', 'clase_02']);
});

prueba('sync: errores de token claros y sin guardar el token', async () => {
  const github = crearGitHub();
  const a = dispositivo(github);
  let error = null;
  try { await a.sync.conectar('ghp_malo'); } catch (e) { error = e; }
  igual(error?.estado, 'error-token');
  igual([a.backend.getItem(CLAVE_SYNC), a.sync.info().conectado], [null, false]);

  github.estado.scopes = 'repo';
  error = null;
  try { await a.sync.conectar('ghp_bueno'); } catch (e) { error = e; }
  cierto(error?.message.includes('«gist»'), error?.message);

  github.estado.scopes = 'gist, repo';
  await a.sync.conectar('ghp_bueno');
  cierto(a.sync.info().avisoPermisos?.includes('repo'), 'debería avisar de permisos de más');

  // Token revocado después de conectar.
  github.estado.token = 'ghp_otro';
  await a.sync.sincronizar();
  igual(a.sync.info().estado, 'error-token');
});

prueba('sync: desconectar borra el token del dispositivo y conserva el progreso', async () => {
  const github = crearGitHub();
  const a = dispositivo(github);
  a.almacen.marcarVista('clase_01', 't1/f1');
  await a.sync.conectar('ghp_bueno');
  a.sync.desconectar();
  igual([a.backend.getItem(CLAVE_SYNC), a.sync.info().estado], [null, 'desconectado']);
  igual(vistas(a), ['clase_01']);
  igual(github.gists.size, 1);
  // Desconectado, estudiar no intenta subir nada.
  const n = github.peticiones.length;
  a.almacen.marcarVista('clase_01', 't1/f2');
  await espera(60);
  igual(github.peticiones.length, n);
});

prueba('sync: una tarjeta quitada no vuelve y desactivar la nivelación se propaga', async () => {
  const github = crearGitHub();
  const a = dispositivo(github, { retardo: 60000 });
  const b = dispositivo(github, { retardo: 60000 });
  a.almacen.anadirTarjeta({ clave: 'forma_x', ru: 'х', es: 'x', clase: 'clase_01' });
  a.almacen.fijarNivelacion({ claseGrupo: 'clase_03', ritmo: 2 });
  await a.sync.conectar('ghp_bueno');
  await b.sync.conectar('ghp_bueno');
  cierto(b.almacen.tieneTarjeta('forma_x') && b.almacen.nivelacion(), 'B debería recibirlas');

  await espera(5);
  b.almacen.quitarTarjeta('forma_x');
  b.almacen.fijarNivelacion(null);
  await b.sync.sincronizar();
  await a.sync.sincronizar();
  cierto(!a.almacen.tieneTarjeta('forma_x'), 'la tarjeta quitada volvió');
  igual(a.almacen.nivelacion(), null);

  // Volver a añadirla después sí cuenta.
  await espera(5);
  a.almacen.anadirTarjeta({ clave: 'forma_x', ru: 'х', es: 'x', clase: 'clase_01' });
  await a.sync.sincronizar();
  await b.sync.sincronizar();
  cierto(b.almacen.tieneTarjeta('forma_x'), 'la tarjeta añadida de nuevo no llegó');
});

prueba('sync: si el Gist se borró en GitHub, se vuelve a crear', async () => {
  const github = crearGitHub();
  const a = dispositivo(github);
  a.almacen.marcarVista('clase_01', 't1/f1');
  await a.sync.conectar('ghp_bueno');
  github.gists.clear();
  await a.sync.sincronizar();
  igual(github.gists.size, 1);
  igual(a.sync.info().estado, 'sincronizado');
  igual(Object.keys(github.progreso().lector.vistas), ['clase_01']);
});

prueba('sync: el contenido comparado no depende del orden ni de lo propio del dispositivo', () => {
  const x = normalizar({ ajustes: { velocidad: 1 }, actividad: { '2026-10-01': true, '2026-10-02': true } });
  const y = normalizar({ ajustes: { velocidad: 0.6 }, actividad: { '2026-10-02': true, '2026-10-01': true } });
  igual(contenido(x), contenido(y));
  igual(contenido(combinar(combinar(x, y), y)), contenido(combinar(x, y)));
});
