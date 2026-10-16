// GitHub simulado en memoria para probar la sincronización sin red: imita
// los endpoints de Gists que usa js/sync.js (listar, crear, leer, editar).

export function crearGitHub({ token = 'ghp_bueno', scopes = 'gist' } = {}) {
  const gists = new Map();
  const peticiones = [];
  let contador = 0;
  const estado = { token, scopes, sinConexion: false };

  const responder = (status, cuerpo, cabeceras = {}) => new Response(
    cuerpo === undefined ? null : JSON.stringify(cuerpo),
    { status, headers: { 'Content-Type': 'application/json', ...cabeceras } });

  async function fetchFn(url, opciones = {}) {
    const u = new URL(url);
    const metodo = opciones.method ?? 'GET';
    peticiones.push({ metodo, ruta: u.pathname, keepalive: Boolean(opciones.keepalive) });
    if (estado.sinConexion) throw new TypeError('Failed to fetch');
    if (opciones.headers?.Authorization !== `Bearer ${estado.token}`) return responder(401, { message: 'Bad credentials' });
    const cabeceras = estado.scopes === null ? {} : { 'X-OAuth-Scopes': estado.scopes };
    const conGist = estado.scopes === null || estado.scopes.split(',').map(s => s.trim()).includes('gist');

    if (u.pathname === '/gists' && metodo === 'GET') {
      const pagina = Number(u.searchParams.get('page') ?? 1);
      const lista = pagina > 1 ? [] : [...gists.values()].map(g => ({
        id: g.id, html_url: g.html_url, public: g.public,
        files: Object.fromEntries(Object.keys(g.files).map(f => [f, { filename: f }])),
      }));
      return responder(200, lista, cabeceras);
    }
    if (u.pathname === '/gists' && metodo === 'POST') {
      if (!conGist) return responder(404, { message: 'Not Found' });
      const datos = JSON.parse(opciones.body);
      const id = `gist${++contador}`;
      const g = { id, html_url: `https://gist.github.com/${id}`, public: datos.public, description: datos.description, files: datos.files };
      gists.set(id, g);
      return responder(201, g, cabeceras);
    }
    const m = /^\/gists\/(\w+)$/.exec(u.pathname);
    if (m) {
      const g = gists.get(m[1]);
      if (!g) return responder(404, { message: 'Not Found' });
      if (metodo === 'GET') {
        const files = Object.fromEntries(Object.entries(g.files).map(([k, f]) => [k, { ...f, filename: k, truncated: false }]));
        return responder(200, { ...g, files }, cabeceras);
      }
      if (metodo === 'PATCH') {
        if (!conGist) return responder(404, { message: 'Not Found' });
        Object.assign(g.files, JSON.parse(opciones.body).files);
        return responder(200, g, cabeceras);
      }
    }
    return responder(404, { message: 'Not Found' });
  }

  return {
    fetchFn,
    gists,
    peticiones,
    estado,
    /** Contenido (ya parseado) del archivo de la app en el único Gist. */
    progreso(archivo = 'ruso-podfak-progreso.json') {
      const [g] = gists.values();
      return g ? JSON.parse(g.files[archivo].content).progreso : null;
    },
  };
}
