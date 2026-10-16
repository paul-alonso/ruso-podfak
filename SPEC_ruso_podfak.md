# SPEC — Herramientas web de estudio de ruso (Podfak)

> Documento de especificación para Claude Code. **Primero evalúa la viabilidad y propón un plan; luego implementa por fases.**

## 1. Contexto

- Alumno hispanohablante, curso preparatorio (podfak), nivel inicial absoluto.
- Libro base: **Беликова, Шутова, Ерофеева — «Русский язык: первые шаги», Часть 1** (Златоуст, 6.ª ed., 2020). 11 уroks:
  | Урок | Contenido principal |
  |---|---|
  | 1 | Fonética: vocales а о у э ы и, consonantes, sonorización/ensordecimiento, о átona, entonación |
  | 2 | Entonación de preguntas, género, й, vocales я ю е ё, мой/моя/моё, «Меня зовут…» |
  | 3 | Sustantivos en -ь, х ц щ, plural, posesivos, чей?, verbo знать (grupo 1) |
  | 4 | «У меня есть…», verbos grupo 2, adjetivos, adjetivo vs adverbio, ordinales |
  | 5 | Acusativo (что?), transitivos, expresión del tiempo, чувствовать, estilo directo/indirecto |
  | 6 | «Сколько стоит?», этот, pasado, быть en pasado, futuro compuesto |
  | 7 | Preposicional (где? о ком?), мочь |
  | 8 | Acusativo animado (кого?), идти–ходить, ехать–ездить, поэтому / так как |
  | 9 | Genitivo, preposiciones |
  | 10 | Dativo, instrumental, «кому сколько лет», «кому нужно» |
  | 11 | Repaso |
- Ya existe un chat de Claude Code que procesa las clases diarias (PDF). Este proyecto añade **datos estructurados + web de práctica**.
- Dificultad principal del alumno: **traducir y comprender** (lectura y escucha).

## 2. Restricciones

- **Solo frontend:** HTML, CSS y JavaScript vanilla. Sin frameworks, sin backend, sin build step.
- Debe funcionar abriendo con un servidor local simple (`python -m http.server`) y desplegado en GitHub Pages o un subdominio propio.
- **Mobile-first** y **PWA instalable** que funcione offline.
- Interfaz en español; contenido en ruso.
- Sin APIs de pago. Audio con Web Speech API (`speechSynthesis`, voz `ru-RU`).

## 3. Arquitectura

```
ruso-podfak/
├── index.html            # Home: elegir lección y herramienta + resumen de progreso
├── lector.html
├── traduccion.html
├── escucha.html
├── flashcards.html
├── css/styles.css
├── js/
│   ├── data.js           # Carga y valida lecciones
│   ├── storage.js        # Progreso en localStorage + export/import JSON
│   ├── srs.js            # Algoritmo de repaso espaciado
│   ├── tts.js            # Wrapper de speechSynthesis
│   └── compare.js        # Normalización y comparación de respuestas
├── data/
│   ├── index.json        # Lista de clases disponibles
│   └── clases/clase_01.json, clase_02.json, ...
├── manifest.json
└── sw.js                 # Service worker (cache offline)
```

La unidad de datos es la **clase** (sesión diaria), y cada clase indica a qué урок del libro pertenece.

## 4. Formato de datos (contrato principal)

El chat existente de Claude Code generará un JSON por clase con este esquema. **Las herramientas solo leen estos archivos.**

```json
{
  "id": "clase_02",
  "fecha": "2026-10-13",
  "urok": 1,
  "titulo": "Sonidos и, ы; entonación",
  "gramatica": [
    { "tema": "Ensordecimiento final", "explicacion": "Al final de palabra б→п, д→т, з→с...", "ejemplos": ["хлеб [хлеп]", "сад [сат]"] }
  ],
  "vocabulario": [
    {
      "id": "v_dom",
      "ru": "дом",
      "ru_acento": "до́м",
      "es": "casa",
      "tipo": "sustantivo",
      "genero": "m",
      "nota": ""
    }
  ],
  "textos": [
    {
      "id": "t1",
      "titulo": "Диалог",
      "frases": [
        {
          "id": "f1",
          "ru": "Это мой дом.",
          "ru_acento": "Э́то мо́й до́м.",
          "es": "Esta es mi casa.",
          "tokens": [
            { "t": "Это", "lema": "это", "es": "esto/este es", "gram": "partícula demostrativa" },
            { "t": "мой", "lema": "мой", "es": "mi", "gram": "posesivo, masc. sing." },
            { "t": "дом", "lema": "дом", "es": "casa", "gram": "sust. masc., nominativo sing.", "vocab_id": "v_dom" }
          ]
        }
      ]
    }
  ],
  "frases_practica": [
    { "id": "p1", "ru": "Как вас зовут?", "es": "¿Cómo se llama usted?", "alternativas_es": ["¿Cuál es su nombre?"] }
  ]
}
```

Reglas:
- `ru_acento` marca la sílaba tónica con acento agudo (´). `ё` siempre se escribe como ё.
- La puntuación no se tokeniza.
- `data/index.json`: `[{ "id": "clase_02", "urok": 1, "titulo": "...", "fecha": "..." }]`.
- Incluir `data/clases/clase_00_ejemplo.json` con 2 textos y 15 palabras para probar.
- Crear `PROMPT_GENERAR_JSON.md` con el prompt que el chat existente usará para convertir el PDF de cada clase en este JSON, validándolo contra el esquema.

## 5. Herramientas (por prioridad)

### 5.1 Lector interactivo — PRIORIDAD 1
- Muestra los textos de la clase frase por frase.
- **Tocar una palabra** abre una tarjeta inferior (bottom sheet en móvil) con: palabra con acento, lema, traducción, análisis gramatical, botón 🔊 y botón «Añadir a flashcards».
- **Tocar el botón de una frase** muestra u oculta su traducción y la reproduce en audio.
- Interruptores: mostrar acentos, mostrar todas las traducciones, velocidad de voz (0.6× / 0.8× / 1×).
- Modo **«primero intenta»**: la traducción de la frase permanece oculta hasta que el usuario pulsa «Revelar».

### 5.2 Práctica de traducción — PRIORIDAD 2
- Dirección seleccionable: RU→ES o ES→RU.
- Muestra una frase (de `frases_practica` y de los textos) y el usuario escribe su traducción.
- Al comprobar: se muestra la respuesta correcta junto a la del usuario, con diferencias resaltadas por palabra.
- Normalización (en `compare.js`): ignorar mayúsculas, puntuación y espacios extra; en ruso, tratar е/ё como equivalentes e ignorar acentos; en español, ignorar tildes.
- Como la traducción ES admite variantes, si la coincidencia no es exacta, el usuario se autoevalúa con «Lo tenía bien» o «Me equivoqué». Ese resultado alimenta el progreso.
- Botón de pista: muestra la primera letra de cada palabra.

### 5.3 Comprensión auditiva — PRIORIDAD 3
- Reproduce una frase en ruso sin mostrar el texto.
- Modo A: elegir el significado entre 4 opciones. Las incorrectas se toman de otras frases de la misma clase o de clases anteriores.
- Modo B (dictado): escribir lo que se escucha en cirílico.
- Botones para repetir el audio y reproducirlo lento.
- Tras responder, se muestran el texto ruso, la traducción y un enlace a la frase en el Lector.
- Si el navegador no tiene voz `ru-RU`, mostrar un aviso con instrucciones (en Android, instalar la voz rusa de Google TTS).

### 5.4 Flashcards SRS — PRIORIDAD 4
- Fuente: el vocabulario de las clases seleccionadas más las palabras añadidas desde el Lector.
- Modos: RU→ES, ES→RU y audio→ES.
- Algoritmo SM-2 simplificado con botones Otra vez / Difícil / Bien / Fácil.
- Contador de tarjetas pendientes hoy en la Home.

## 6. Progreso y modo nivelación

- Todo se guarda en `localStorage` bajo una única clave versionada (`podfak_v1`).
- Botones **Exportar progreso** (descarga `.json`) e **Importar progreso**, para sincronizar PC y celular manualmente.
- La Home muestra: clases cubiertas, palabras aprendidas frente a pendientes, aciertos por herramienta y racha de días.
- **Modo nivelación:** el usuario indica la clase en la que va el grupo y la Home propone un plan diario (por ejemplo, «Hoy: clases 3, 4 y 5 + repaso SRS») con barra de avance hasta alcanzar al grupo.

## 7. UI / UX

- Mobile-first, legible a 360 px de ancho; objetivos táctiles de al menos 44 px.
- Fuente con buen soporte de cirílico (por ejemplo, PT Sans o Noto Sans de Google Fonts, con fallback del sistema).
- Modo claro y oscuro según el sistema.
- Navegación inferior con 4 pestañas: Lector, Traducir, Escuchar, Tarjetas.
- Selector de clase o rango de clases persistente entre herramientas.

## 8. Fases de implementación

1. **Datos:** esquema, `clase_00_ejemplo.json`, `data.js` con validación y mensajes de error claros, `PROMPT_GENERAR_JSON.md`.
2. **Lector** + `tts.js` + estructura base, navegación y estilos.
3. **Traducción** + `compare.js`.
4. **Escucha.**
5. **Flashcards** + `srs.js`.
6. **Progreso**, export/import y modo nivelación.
7. **PWA** (manifest, service worker, íconos) y guía de despliegue en GitHub Pages.

## 9. Criterios de aceptación

- Funciona sin conexión tras la primera carga en Chrome Android.
- Añadir una clase nueva solo requiere copiar su JSON a `data/clases/` y actualizar `index.json`, sin tocar código.
- Un JSON mal formado muestra un error claro que indica qué campo falla, sin romper la app.
- Exportar en un dispositivo e importar en otro reproduce el mismo progreso.
- El audio funciona en Chrome de escritorio y de Android con voz rusa.

## 10. Fuera de alcance (por ahora)

- Backend, cuentas de usuario o sincronización automática.
- Reconocimiento de voz para evaluar la pronunciación (posible fase futura con `SpeechRecognition`).
- Traducción automática en vivo: todo el contenido viene del JSON.
