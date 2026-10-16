# Prompt: convertir una clase (PDF) en JSON para ruso-podfak

> Copia todo lo que hay debajo de la línea en el chat que procesa las clases,
> junto con el PDF de la clase. El resultado es **un archivo JSON por clase**.
> Referencia completa y válida: `data/clases/clase_00_ejemplo.json`.
> Referencia de todos los campos y reglas: `SCHEMA.md`.

---

Vas a convertir el material de una clase de ruso (curso preparatorio, nivel inicial, libro «Русский язык: первые шаги», ч. 1) en un archivo JSON para una web de práctica. El alumno es hispanohablante; todas las explicaciones y traducciones van en **español**.

## Qué debes entregar

1. El archivo `data/clases/clase_NN.json` (NN = número de la clase con dos cifras: `clase_01`, `clase_02`, …).
2. Una entrada nueva en `data/index.json` (es una lista; añádela al final):
   `{ "id": "clase_NN", "urok": <número>, "titulo": "<igual que en la clase>", "fecha": "AAAA-MM-DD" }`
   (si la clase no tiene fecha, omite `fecha` en los dos sitios)
3. Valida con `powershell -ExecutionPolicy Bypass -File herramientas\validar.ps1` y corrige hasta que no haya **errores** (✗). Revisa también los **avisos** (⚠): casi siempre son acentos sin marcar o ids mal formados.

Archivo en UTF-8. Responde solo con JSON válido: sin comentarios, sin comas finales y con comillas dobles.

## Esquema (versión 1)

```json
{
  "schema_version": 1,
  "id": "clase_NN",
  "fecha": "AAAA-MM-DD",
  "urok": 1,
  "titulo": "Tema principal de la clase, en español",
  "tema_corto": "Tema en pocas palabras",
  "profesor": "Ирина Петровна",
  "gramatica": [
    { "tema": "…", "explicacion": "…", "ejemplos": ["…", "…"], "fuente": "clase", "repaso": false }
  ],
  "vocabulario": [
    { "id": "v_dom", "ru": "дом", "ru_acento": "до́м", "es": "casa", "tipo": "sustantivo", "genero": "m", "nota": "", "fuente": "clase" }
  ],
  "textos": [
    {
      "id": "t1",
      "titulo": "Диалог",
      "fuente": "libro",
      "repaso": false,
      "frases": [
        {
          "id": "f1",
          "ru": "Это мой дом.",
          "ru_acento": "Э́то мо́й до́м.",
          "es": "Esta es mi casa.",
          "tokens": [
            { "t": "Это", "a": "Э́то", "lema": "это", "es": "esta es", "gram": "partícula demostrativa (invariable)", "vocab_id": "v_eto" },
            { "t": "мой", "a": "мо́й", "lema": "мой", "es": "mi", "gram": "posesivo, masc. sing.", "vocab_id": "v_moy" },
            { "t": "дом", "a": "до́м", "lema": "дом", "es": "casa", "gram": "sust. masc., nominativo sing.", "vocab_id": "v_dom" }
          ]
        }
      ]
    }
  ],
  "frases_practica": [
    { "id": "p1", "ru": "Как вас зовут?", "ru_acento": "Ка́к ва́с зову́т?", "es": "¿Cómo se llama usted?",
      "alternativas_es": ["¿Cuál es su nombre?"], "alternativas_ru": [] }
  ]
}
```

### Campos de la clase

| Campo | Obligatorio | Regla |
|---|---|---|
| `schema_version` | sí | Siempre `1` (número). |
| `id` | sí | `clase_NN`, idéntico al nombre del archivo. |
| `fecha` | no (recomendado) | Fecha de la clase, `AAAA-MM-DD`. Omítela solo si no se sabe (p. ej. una clase reconstruida del libro); la app mostrará «sin fecha». |
| `urok` | sí | Número del урок del libro (1–11) al que pertenece la clase. |
| `titulo` | sí | En español; puede incluir una frase rusa y las páginas del libro. |
| `tema_corto` | no (recomendado) | El tema en pocas palabras (**40 caracteres como máximo**), sin páginas ni paréntesis. La app titula cada clase «Clase N · DD mmm · Урок X · tema_corto». Si el `titulo` pasa de 50 caracteres y no hay `tema_corto`, el validador avisa. |
| `profesor` | no | Nombre del profesor o profesora, si aparece en el material. |
| `gramatica` | sí (puede estar vacía) | Cada tema: `tema`, `explicacion` (clara, para principiantes absolutos) y `ejemplos` (lista de textos; formato libre, p. ej. `"сад [сат]"`). Opcionales: `fuente` y `repaso` (ver abajo). |
| `vocabulario` | sí | Palabras **nuevas** de esta clase (ver abajo). |
| `textos` | sí | Textos y diálogos de la clase, divididos en frases con tokens. |
| `frases_practica` | sí | Frases útiles o de ejercicios para practicar traducción. |

### Vocabulario

| Campo | Obligatorio | Regla |
|---|---|---|
| `id` | sí | `v_` + transliteración del campo `ru` (tabla abajo). |
| `ru` | sí | Forma de diccionario, **sin acento** (sustantivo en nominativo singular, verbo en infinitivo, adjetivo en masculino). En minúscula salvo nombres propios. |
| `ru_acento` | sí | Igual que `ru`, con el acento marcado. |
| `es` | sí | Traducción; si hay varias, sepáralas con coma: `"allí, ahí"`. |
| `tipo` | sí | Uno de: `sustantivo`, `verbo`, `adjetivo`, `adverbio`, `pronombre`, `numeral`, `preposicion`, `conjuncion`, `particula`, `interjeccion`, `expresion` (sin tildes). |
| `genero` | solo sustantivos | `m`, `f`, `n` o `pl` (solo plural). Omítelo en lo demás. |
| `nota` | no | Pronunciación irregular, formas, uso. P. ej. `"Se pronuncia [што]."`, `"мой (m), моя (f), моё (n), мои (pl)."` |

Para expresiones fijas («Меня зовут…», «У меня есть…») usa `tipo: "expresion"`.

### Procedencia: `fuente` y `repaso`

Marca de dónde sale cada cosa; el Lector lo muestra con etiquetas discretas «Libro» y «Repaso».

| Campo | En | Valores |
|---|---|---|
| `fuente` | gramática, vocabulario, textos y frases de los textos | `"clase"` si se vio en la clase (lo normal) o `"libro"` si lo añades tú desde el libro (textos, ejercicios o palabras que el PDF de la clase no trae). |
| `repaso` | gramática y textos | `true` si repasa lo visto en clases anteriores. |

- Si todo es de la clase, puedes omitir `fuente`: se entiende `"clase"`.
- Las frases heredan la `fuente` de su texto. Ponla en una frase solo si difiere (p. ej. una frase del libro añadida a un diálogo de la clase).
- No uses otros valores: el validador da error.

### Frases de los textos

| Campo | Obligatorio | Regla |
|---|---|---|
| `id` | sí | `f1`, `f2`, … (se reinicia en cada texto). Los textos son `t1`, `t2`, … |
| `ru` | sí | La frase tal como aparece, **sin acentos**, con su puntuación. |
| `ru_acento` | sí | La misma frase con acentos. Quitando los acentos debe quedar exactamente `ru`. |
| `es` | sí | Traducción natural (no palabra por palabra). |
| `tokens` | sí | Una entrada por palabra, en orden (ver abajo). |

Para diálogos, pon cada réplica como una frase, **sin la raya inicial** (—).

### Tokens

| Campo | Obligatorio | Regla |
|---|---|---|
| `t` | sí | La palabra exactamente como aparece en `ru` (mismas mayúsculas, sin acento). |
| `a` | sí | La misma palabra con su acento, exactamente como aparece en `ru_acento`. Si la palabra no lleva acento (и, а, в…), `a` = `t`. |
| `lema` | sí | Forma de diccionario sin acento (`моя` → `мой`, `зовут` → `звать`, `его` → `он`). |
| `es` | sí | Significado **en esta frase**. |
| `gram` | sí | Análisis breve con el formato de la tabla de abreviaturas. Aquí van también pronunciaciones especiales: `"…; se pronuncia [ево]"`. |
| `vocab_id` | no | Si la palabra (por su lema) está en el vocabulario de esta clase o de una anterior, su id. |

Reglas de tokenización:
- **Cada palabra es un token y todas las palabras deben tener token.** El validador comprueba que los tokens, en orden, reconstruyan `ru` (y que los `a` reconstruyan `ru_acento`).
- La puntuación **no** se tokeniza (ni `.,!?:;«»—`).
- Las palabras con guion son un solo token: `по-русски`, `что-то`.
- Los números escritos con cifras son un token.
- Las expresiones de varias palabras («у меня есть») se tokenizan palabra por palabra; explica la expresión en `gram` de la palabra principal.

### Frases de práctica

| Campo | Obligatorio | Regla |
|---|---|---|
| `id` | sí | `p1`, `p2`, … |
| `ru` | sí | Sin acentos. |
| `ru_acento` | recomendado | Con acentos. |
| `es` | sí | Traducción principal. |
| `alternativas_es` | no | Otras traducciones correctas al español (se aceptan como acierto). |
| `alternativas_ru` | no | Otros órdenes o formulaciones rusas correctas (para la dirección ES→RU). |

Incluye entre 5 y 15 frases de práctica: las frases modelo de la clase, preguntas y respuestas típicas y frases de los ejercicios.

## Acentos (lo más importante)

- El acento se marca con el **carácter combinante U+0301** escrito **justo después de la vocal tónica**: `до́м`, `сестра́`, `Э́то`.
- **Nunca** uses vocales latinas con tilde (á, ó, é), ni apóstrofos (`ма'ма`), ni el signo suelto `´`. El validador lo detecta como error.
- Marca el acento en toda palabra con acento propio, **incluidos los monosílabos** (`до́м`, `мо́й`, `кто́`).
- No lleves acento en las palabras átonas: preposiciones de una sílaba (в, на, с, к, о, у), conjunciones и, а, но, partículas не, ли, же, бы.
- La `ё` siempre se escribe `ё` (nunca `е`) y **no lleva** marca de acento: siempre es tónica.
- Si el PDF no marca los acentos, ponlos tú con cuidado. Si dudas de uno, indícalo en la `nota` del vocabulario o en `gram`.
- Los campos sin acento (`ru`, `t`, `lema`, `alternativas_ru`) **no** llevan U+0301.

## ids del vocabulario: transliteración

`id` = `v_` + `ru` en minúscula, transliterado con esta tabla; los espacios y guiones se convierten en `_`.

| а | б | в | г | д | е | ё | ж | з | и | й | к | л | м | н | о | п |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| a | b | v | g | d | e | yo | zh | z | i | y | k | l | m | n | o | p |

| р | с | т | у | ф | х | ц | ч | ш | щ | ъ | ы | ь | э | ю | я |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| r | s | t | u | f | kh | ts | ch | sh | shch | — | y | — | e | yu | ya |

Ejemplos: дом → `v_dom`, что → `v_chto`, объявление → `v_obyavlenie`, Меня зовут → `v_menya_zovut`, по-русски → `v_po_russki`.

- La misma palabra en clases distintas tiene **el mismo id**: así la app la trata como una sola tarjeta.
- Si una palabra ya apareció en el vocabulario de una clase anterior, **no la repitas**; enlázala desde los tokens con `vocab_id`.
- Homónimos con significado distinto: añade un sufijo, `v_zamok_castillo` y `v_zamok_cerradura`.

## Abreviaturas para `gram`

Usa siempre este estilo, para que sea consistente entre clases:

- Sustantivo: `sust. masc./fem./neutro, <caso> sing./pl.` → `"sust. fem., nominativo sing."`
- Casos: nominativo, acusativo, genitivo, dativo, instrumental, preposicional.
- Verbo: `verbo <infinitivo>, <persona> pers. sing./pl. presente/pasado/futuro` → `"verbo знать, 1.ª pers. sing. presente"`. Añade «grupo 1/2» si la clase lo trata.
- Adjetivo: `adj. masc./fem./neutro/pl., <caso>`.
- Pronombre: `pronombre personal/posesivo/interrogativo/demostrativo, …`.
- Otros: `adverbio de lugar/tiempo/modo`, `preposición + <caso>`, `conjunción`, `partícula …`.

## Lista de comprobación antes de entregar

- [ ] `schema_version` es `1` y `id` coincide con el nombre del archivo.
- [ ] Cada `ru_acento` sin acentos es idéntico a su `ru`; cada `a` sin acentos es idéntico a su `t`.
- [ ] Los tokens cubren todas las palabras de la frase, en orden, sin puntuación.
- [ ] Ninguna palabra rusa contiene letras latinas.
- [ ] ids únicos: `t1…`, `f1…` dentro de cada texto, `p1…`, y `v_…` según la tabla.
- [ ] La entrada de `data/index.json` tiene el mismo `urok`, `titulo` y `fecha` (o ninguno de los dos lleva `fecha`).
- [ ] Hay `tema_corto` (≤ 40 caracteres) si el `titulo` es largo.
- [ ] Lo añadido desde el libro lleva `"fuente": "libro"`; lo que repasa clases anteriores, `"repaso": true`.
- [ ] `herramientas\validar.ps1` termina sin errores.
