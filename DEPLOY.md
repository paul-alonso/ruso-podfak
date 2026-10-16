# Despliegue, instalación y sincronización

Guía para publicar la app en GitHub Pages, instalarla en el móvil y activar la sincronización opcional del progreso con GitHub.

Dirección de la app: **https://paul-alonso.github.io/ruso-podfak/**

---

## 1. Publicar en GitHub Pages (sin instalar Git)

Se publica **solo el contenido de la carpeta `ruso-podfak`**. Los PDFs del libro y de las clases (`LIBRO PRINCIPAL`, `PDF DE CADA CLASE DIARIA`, `WEB`) están fuera de ella y no se suben.

> **Antes de empezar**: con una cuenta gratuita, GitHub Pages solo publica repositorios **públicos**. Todo lo que subas (incluidos los JSON de `data/clases/`, que contienen frases y vocabulario del libro y de las clases) podrá verlo cualquiera. Si prefieres que no sea público, hace falta GitHub Pro (Pages en repositorio privado) u otro alojamiento.

### Primera publicación

1. Entra en **https://github.com/new** con tu cuenta `paul-alonso`.
2. **Repository name**: `ruso-podfak` (este nombre forma la dirección de la app). **Public**. No marques «Add a README» ni nada más. Pulsa **Create repository**.
3. En la página del repositorio vacío, pulsa el enlace **uploading an existing file**.
4. En el Explorador de Windows, abre la carpeta `ruso-podfak`, selecciona **todo su contenido** (Ctrl+A: carpetas `css`, `data`, `herramientas`, `iconos`, `js`, `tests` y los archivos sueltos, incluido `.nojekyll`) y arrástralo a la zona de subida de GitHub.
   - Arrastra el **contenido**, no la carpeta `ruso-podfak` en sí: `index.html` tiene que quedar en la raíz del repositorio.
   - Espera a que la lista termine de cargar (unos 60 archivos).
5. Abajo, en **Commit changes**, escribe un mensaje (p. ej. «Primera versión») y pulsa **Commit changes**.
6. Ve a **Settings → Pages**. En **Build and deployment → Source** elige **Deploy from a branch**; en **Branch**, `main` y carpeta `/ (root)`; pulsa **Save**.
7. Espera uno o dos minutos y abre **https://paul-alonso.github.io/ruso-podfak/**. En **Actions** del repositorio puedes ver el progreso de la publicación (círculo amarillo → marca verde).

### Actualizar (clases nuevas o cambios)

1. En el repositorio: **Add file → Upload files**.
2. Arrastra solo los archivos que cambiaron. Para que queden en su carpeta, arrastra la **carpeta** que los contiene (p. ej. arrastra `data` entera: se suben `data/index.json` y `data/clases/…` y los que no cambiaron se quedan igual).
3. **Commit changes**. En uno o dos minutos está publicado.

La app pide siempre la versión actual de los archivos, así que basta con abrirla (o cambiar de pestaña dentro de ella) para ver las clases nuevas; sin conexión sigue usando la última copia.

> Si actualizas a menudo, **GitHub Desktop** (https://desktop.github.com) permite publicar los cambios con un botón, sin línea de comandos.

La app usa solo rutas relativas, así que funciona igual en GitHub Pages y en el servidor local (`herramientas\servir.ps1`). Para añadir una clase basta con subir su JSON a `data/clases/` y actualizar `data/index.json`; no hay que tocar código.

---

## 2. Sincronización con GitHub (opcional)

Sin sincronizar, el progreso vive solo en el navegador de cada dispositivo (y se puede pasar a mano con **Ajustes → Exportar / Importar progreso**). Con la sincronización, la app guarda el progreso en un **Gist secreto** de tu cuenta y lo combina sola entre tus dispositivos:

- **Al abrir la app**, descarga el progreso del Gist y lo combina con el del dispositivo (la misma lógica que «Combinar» al importar: nada se pierde ni se duplica).
- **Al estudiar**, sube los cambios unos segundos después de que dejes de tocar la app.
- **Al salir o pasar a otra app**, sube lo que quede pendiente.
- **Sin conexión**, la app funciona igual; lo pendiente se sube cuando vuelve la conexión o la próxima vez que la abras.

Se sincroniza el progreso (frases leídas, resultados, tarjetas, racha, nivelación). **No** se sincronizan los ajustes ni las clases elegidas: son de cada dispositivo.

### 2.1 Crear el token (paso a paso)

El token es una contraseña limitada que permite a la app escribir **solo** en tus Gists. Crea uno con el permiso «gist» y nada más:

1. En el navegador, inicia sesión en GitHub.
2. Abre este enlace, que ya trae marcado solo el permiso «gist»:
   **https://github.com/settings/tokens/new?scopes=gist&description=Ruso%20Podfak**
   (o a mano: foto de perfil → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)** → **Generate new token** → **Generate new token (classic)**).
3. **Note**: un nombre para reconocerlo, por ejemplo «Ruso Podfak».
4. **Expiration**: cuánto tiempo vale. 90 días es un buen equilibrio; cuando caduque, la app mostrará «Error de token» y bastará con crear otro y volver a conectar.
5. **Select scopes**: comprueba que **solo** está marcada la casilla **gist**. No marques `repo` ni ninguna otra.
6. Pulsa **Generate token** al final de la página.
7. **Copia el token ahora** (empieza por `ghp_`). GitHub solo lo muestra una vez; si lo pierdes, crea otro.

Si prefieres un token «fine-grained»: **Fine-grained tokens → Generate new token**, en **Account permissions** pon **Gists: Read and write** y deja todo lo demás sin acceso. También funciona; la app no puede comprobar sus permisos, así que asegúrate de no darle más.

### 2.2 Conectar la app

En **cada dispositivo**:

1. Abre la app y entra en **Ajustes** (el engranaje de la cabecera).
2. En **Sincronizar con GitHub**, pega el token y pulsa **Conectar**.
3. El primer dispositivo crea el Gist; los siguientes lo encuentran solos y combinan su progreso con el que ya hay.

### 2.3 El indicador de estado

El punto de color sobre el engranaje (y el detalle en Ajustes) indica:

| Color | Estado | Qué significa |
|---|---|---|
| Verde | Sincronizado | Todo está subido. |
| Ámbar | Pendiente / Sincronizando | Hay cambios que se subirán en unos segundos. |
| Gris | Sin conexión | La app sigue funcionando; sincronizará al volver la conexión. |
| Rojo | Error de token | El token caducó, se revocó o no tiene el permiso «gist». Crea otro y vuelve a conectar. |
| Rojo | Error al sincronizar | Fallo de GitHub; se reintenta solo al cabo de un minuto. |

**Desconectar** borra el token de ese dispositivo. No borra tu progreso local ni el Gist.

### 2.4 Seguridad y privacidad

- **El token se guarda solo en el dispositivo** donde lo pegas (en el almacenamiento del navegador). No va en el progreso, ni en el Gist, ni en los archivos que descargas con «Exportar progreso».
- **Un Gist secreto no es privado del todo**: no aparece en tu perfil ni en búsquedas, pero cualquiera que tenga su dirección puede leerlo. Contiene solo tu progreso de estudio (qué frases has leído, aciertos, tarjetas…), nada más.
- **Origen compartido en GitHub Pages**: todas tus páginas de proyecto (`paul-alonso.github.io/lo-que-sea/`) comparten el mismo almacenamiento del navegador, así que cualquier otra página tuya publicada ahí podría leer el token. Publica en esa cuenta solo código en el que confíes. Como el token solo tiene el permiso «gist», lo peor que se podría hacer con él es leer o modificar tus Gists.
- **Si pierdes un dispositivo**: en GitHub, **Settings → Developer settings → Personal access tokens → Tokens (classic)**, borra el token (**Delete**). Después crea otro y conéctalo en los dispositivos que sigas usando.
- **Limitación conocida**: los contadores de aciertos se combinan quedándose con el máximo (para que importar o sincronizar dos veces no duplique nada). Si respondes la misma frase en dos dispositivos, el total de intentos puede quedar algo por debajo del real. El resto del progreso se combina sin pérdidas.

### 2.5 Reiniciar el progreso

**Ajustes → Reiniciar progreso** borra el progreso de una clase, solo el de las tarjetas (repaso espaciado) o todo. Antes descarga una copia (`podfak-respaldo-AAAA-MM-DD-HHMM.json`). Los ajustes, el token y las clases elegidas no se borran.

Con la sincronización activada, el reinicio llega a todos tus dispositivos: se guarda una marca con la hora del reinicio y, al combinar, se descarta todo lo anterior a ella, venga del Gist o de otro dispositivo. Lo que estudies después del reinicio, en cualquier dispositivo, sí se conserva.

Para deshacerlo, pulsa **Deshacer** justo después, o más tarde **Importar progreso** con el archivo de respaldo y elige **Reemplazar**. Importar es una decisión explícita: los datos del archivo se recuperan aunque sean anteriores al reinicio, y se sincronizan como nuevos.

---

## 3. Instalar la app en iPhone

1. Abre **Safari** y entra en **https://paul-alonso.github.io/ruso-podfak/**. Desde iOS 16.4 también puedes hacerlo desde Chrome o Edge.
2. Pulsa el botón **Compartir** (el cuadrado con la flecha hacia arriba).
3. Desliza hacia abajo y elige **Añadir a pantalla de inicio**.
4. Cambia el nombre si quieres y pulsa **Añadir**.
5. Abre la app desde el icono de la pantalla de inicio.

### En iPhone, el token se configura dentro de la app instalada

La app instalada en la pantalla de inicio **tiene su propio almacenamiento, separado del de Safari**. Si conectaste la sincronización (o estudiaste) en Safari, la app instalada no lo verá. Por eso:

1. Instala primero la app (pasos de arriba).
2. Ábrela **desde el icono**, entra en **Ajustes** y pega ahí el token.

Para tener el token en el portapapeles del iPhone, lo más sencillo es crearlo en el propio iPhone: en Safari, inicia sesión en GitHub, sigue los pasos de la sección 2.1, copia el token y pégalo en la app instalada. Si lo pasas desde el ordenador (Notas, AirDrop…), borra después esa copia.

Dos ventajas más de usar la app instalada en iPhone:

- Safari puede borrar los datos de una web que no visitas en 7 días; las apps de la pantalla de inicio no están sujetas a esa regla de la misma forma (cuentan sus propios días de uso). Aun así, la sincronización es la mejor copia de seguridad.
- Funciona sin conexión una vez abierta por primera vez.

La app instalada se abre **a pantalla completa**, sin la barra de Safari. Como no hay botón «atrás» del navegador, muévete con la barra inferior (Lector, Traducir, Escuchar, Tarjetas), el título «Podfak» (vuelve a Inicio) y el engranaje (Ajustes). Los enlaces externos (GitHub, el Gist) se abren en Safari.

Si añadiste el icono **antes** de esta versión, bórralo de la pantalla de inicio y vuelve a añadirlo desde Safari para que se abra a pantalla completa.

**Audio en iPhone**: si no oyes la voz rusa, ve a **Ajustes del iPhone → Accesibilidad → Contenido leído → Voces → Ruso** y descarga una voz.

---

## 4. Instalar la app en Android

1. Abre la dirección de la app en **Chrome**.
2. Menú **⋮** → **Instalar aplicación** (o **Añadir a pantalla de inicio**).
3. Igual que en iPhone, abre la app instalada, entra en **Ajustes** y conecta la sincronización con tu token.

**Audio en Android**: Ajustes → Sistema → Idiomas y entrada → Salida de texto a voz → motor «Servicios de voz de Google» → ⚙ → Instalar datos de voz → Ruso.
