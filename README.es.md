<p align="center">
  <img src="docs/assets/hero.gif" width="100%" alt="ÁMBAR, una mascota de gel ámbar, junto al título AMBAR y el cabezal de una línea de tiempo">
</p>

<p align="center">
  <b>Video</b> &nbsp;·&nbsp; <b>Presentaciones</b> &nbsp;·&nbsp; <b>Documentos</b> &nbsp;·&nbsp; desde HTML
  <br><br>
  <a href="README.md">Read in English</a>
</p>

AMBAR Studio convierte páginas web en piezas terminadas. Escribes una escena en HTML, CSS y JavaScript; AMBAR la renderiza cuadro a cuadro en Chrome sin interfaz y la codifica con ffmpeg, con narración, música y efectos de sonido mezclados. Las mismas páginas se convierten en presentaciones y en documentos listos para imprimir.

Se apoya en una sola regla: **cada cuadro es una función del tiempo.** Una escena expone `render(t)` y no depende de nada más, así que cualquier momento se renderiza exactamente igual, en cualquier orden y las veces que quieras. Por eso el resultado es repetible, se revisa en git y se ajusta fácil después de cambiar un texto.

Todo lo que ves en este README lo renderizó AMBAR.

### `// 01` Qué trae

| | |
|---|---|
| **Video determinista** | Chrome recorre `render(t)` y lo envía a ffmpeg. 1080p a 30 fps por defecto, o el tamaño y la tasa que definas. |
| **La narración manda en la línea de tiempo** | Cada línea de narración es una marca. Las escenas cuelgan de las marcas, así que al editar una línea su escena se mueve con ella. |
| **Una mezcla de verdad** | La voz en sus marcas, música que baja cuando entra la voz y efectos sintetizados. Sin muestras ni licencias. |
| **Un estudio** | Una línea de tiempo en el navegador con marcas de narración, avance cuadro a cuadro, zonas seguras y la mezcla sincronizada. |
| **Presentaciones y documentos** | Decks con presentador en el navegador y un PDF por deck; documentos A4 exportados tal cual se diseñaron. |
| **Tutoriales de producto** | Capturas de una app real con los datos privados difuminados, y luego cámara, cursor, tecleo y anotaciones que apuntan a los elementos por nombre. |
| **ÁMBAR** | La mascota, dibujada en SVG en cada cuadro, con expresiones, mirada, parpadeo y chispas. |

### `// 02` Para empezar

Requiere Node 20+ y `ffmpeg` (`brew install ffmpeg` en macOS).

```bash
git clone https://github.com/4mser/ambar-studio.git
cd ambar-studio
npm install
npm link                      # deja disponible el comando `ambar`

ambar studio examples/launch  # abre el video de lanzamiento en el estudio
ambar render examples/launch  # → examples/launch/out/launch.mp4
```

Un proyecto propio:

```bash
ambar new mi-video            # o: ambar new mi-deck --deck · ambar new mi-doc --doc
ambar studio mi-video
```

### `// 03` Una escena

Una composición es una carpeta con un `index.html`. Este es todo el contrato:

```html
<link rel="stylesheet" href="/@ambar/runtime/ambar.css">
<div id="stage"><h1 id="title"></h1></div>

<script type="module">
  import { video, cue, words, rise } from '/@ambar/runtime/ambar.js'

  let title

  video({
    setup () {
      title = words(document.getElementById('title'), 'Hola, {mundo}.')
    },
    render (t) {
      rise(title, t, cue('hello', 0.8).start)   // las palabras suben cuando la narración dice «hello»
    }
  })
</script>
```

El runtime trae lo necesario para que el movimiento se sienta bien: curvas de easing (`out`, `inOut`, `outBack`, `spring`, …), `span` para lo que entra, se queda y sale, `keys` para keyframes, `rise` y `fadeUp` para texto, `type` para escritura, `count` para números y `hash` para partículas deterministas.

<p align="center">
  <img src="docs/assets/launch-scenes.png" width="100%" alt="Cuatro escenas del video de lanzamiento: el título AMBAR, código que se escribe solo, tres tarjetas y tres formatos de salida">
</p>

### `// 04` Narración y sonido

`ambar.json` va junto a la escena. Las líneas se convierten en marcas, y los efectos se ubican en segundos o relativos a una marca:

```json
{
  "voice": { "provider": "say", "name": "Samantha" },
  "lines": [
    { "id": "hello", "text": "Meet Ambar." },
    { "id": "time",  "text": "Every frame is a pure function of time.", "pause": 1.4 }
  ],
  "music": { "file": "music.mp3", "gain": 0.6 },
  "sfx": [
    { "type": "impact", "at": 0.35, "gain": 0.45 },
    { "type": "whoosh", "at": "time-0.5", "gain": 0.14 },
    { "type": "tap",    "at": "time+0.6", "repeat": 12, "every": 0.11 }
  ]
}
```

| Voz | Notas |
|---|---|
| `say` | Voces de macOS, sin conexión ni clave. Sirve para borradores. |
| `gemini` | Texto a voz de Gemini. Lee `AMBAR_GEMINI_API_KEY` y ninguna otra clave. |

Las grabaciones quedan en caché por texto y voz, así que solo se vuelven a grabar las líneas que cambian. Los efectos son `whoosh`, `tap`, `tick`, `impact` y `riser`, sintetizados con ruido y ondas seno a partir de una semilla fija: la misma configuración siempre suena igual. La mezcla final se normaliza a −16 LUFS.

### `// 05` El estudio

`ambar studio <proyecto>` abre la composición en un estudio local: recorres la línea de tiempo, avanzas cuadro a cuadro, saltas a cualquier marca de narración, activas las zonas seguras y reproduces la mezcla sincronizada.

<p align="center">
  <img src="docs/assets/studio.png" width="100%" alt="AMBAR Studio con el video de lanzamiento, las zonas seguras activas y cinco marcas de narración en la línea de tiempo">
</p>

### `// 06` Tutoriales sobre apps reales

`ambar capture` recorre una app web con Chrome sin interfaz, siguiendo los pasos de `capture.json`, y guarda una captura por paso más la posición de cada elemento que nombres. Todo lo que coincida con `redact` se difumina en el navegador antes de la captura, así que los datos privados nunca llegan a un PNG.

```json
{
  "url": "app/index.html",
  "redact": ["[data-private]"],
  "shots": [
    { "name": "login", "boxes": { "email": "#email", "signin": "#signin" } },
    { "name": "board", "actions": [{ "type": "#email", "text": "alex@harbor.example" }, { "click": "#signin" }, { "waitFor": "#list" }],
      "boxes": { "list": "#list", "user": "[data-private]" } }
  ]
}
```

`runtime/screen.js` convierte esas capturas en un screencast dentro de un notebook, un navegador o un teléfono. Cámara, cursor, tecleo, focos y anotaciones son funciones del tiempo como todo lo demás, y apuntan a los elementos por nombre (`'login.email'`), no por píxel.

```js
const sc = screencast(stage, await loadShots(), { device: 'laptop' })
sc.show(t, [[0, 'login'], [signin.start + 4.6, 'board']])
sc.camera(t, [[signin.start, 1, [720, 450]], [signin.start + 0.6, 1.55, 'login.card']])
sc.cursor(t, [[signin.start + 0.85, 'login.email'], [signin.start + 4.35, 'login.signin']], clicks)
sc.type(t, { box: 'login.email', text: 'alex@harbor.example', at: signin.start + 1.1 })
sc.callout(t, { box: 'board.user', text: 'Private data is blurred', from: board.start + 3.2 })
```

<p align="center">
  <img src="docs/assets/tutorial.png" width="100%" alt="Cuatro momentos del tutorial de Harbor: el correo tecleándose, el tablero con la dirección difuminada, el diálogo de nueva tarea y la tarea guardada">
</p>

### `// 07` Presentaciones y documentos

Cada `<section class="slide">` es una lámina. Abre el HTML para presentar (flechas, espacio, `F` para pantalla completa) o expórtalo:

```bash
ambar slides examples/deck/deck.html   # → out/deck.pdf + un PNG por lámina
ambar doc examples/report/report.html  # → out/report.pdf (A4)
```

<p align="center">
  <img src="docs/assets/deck.png" width="100%" alt="Seis láminas del deck de ejemplo en tonos ámbar">
</p>

<p align="center">
  <img src="docs/assets/report.png" width="78%" alt="Dos páginas A4 del informe de ejemplo: una portada oscura con ÁMBAR y una página clara con la tabla de comandos">
</p>

### `// 08` Comandos

| Comando | Qué hace |
|---|---|
| `ambar studio <proyecto>` | Estudio con línea de tiempo en el navegador |
| `ambar render <proyecto>` | Narración, mezcla, cuadros y codificación → `out/<nombre>.mp4` |
| `ambar render <proyecto> --frames 0,1.5,3` | Imágenes PNG en esos segundos |
| `ambar render <proyecto> --gif out.gif` | Un GIF en loop (`--from`, `--to`, `--gif-fps`, `--width`) |
| `ambar voice <proyecto>` | Graba la narración y escribe las marcas |
| `ambar mix <proyecto>` | Narración, música y efectos → `out/mix.wav` |
| `ambar capture <proyecto>` | Capturas y posiciones de elementos de una app, según `capture.json` |
| `ambar slides <deck.html>` | PDF y PNG de un deck |
| `ambar doc <doc.html>` | PDF A4 de un documento |
| `ambar new <carpeta>` | Un video nuevo, `--deck` o `--doc`, desde una plantilla |

### `// 09` Cómo funciona

```
bin/ambar.js            CLI
src/commands/           studio · render · voice · mix · capture · slides · doc · new
src/lib/                servidor local, Chrome sin interfaz, ffmpeg, línea de tiempo, efectos sintetizados, WAV
runtime/                lo que importan las escenas: ambar.js (tiempo, easing, texto) · screen.js (screencasts) · estilos de láminas y documentos
studio/                 el estudio con línea de tiempo
mascot/ambar.js         ÁMBAR, un SVG por cuadro
examples/               video de lanzamiento · hero · tutorial · deck · informe
```

Un servidor local publica el proyecto en `/` y AMBAR en `/@ambar/`, así una escena importa el runtime igual sin importar dónde esté. `ambar render` graba la narración, abre la escena en Chrome sin interfaz, llama a `render(f / fps)` en cada cuadro, envía las capturas a ffmpeg (H.264, CRF 17), mezcla el audio y une ambos.

Medido en un Apple M5 Pro: el video de lanzamiento de 24 segundos en 1080p, con cinco líneas de narración y doce efectos, se renderiza en 28,7 segundos.

### `// 10` ÁMBAR

ÁMBAR es la mascota: gel ámbar con un núcleo de miel oscura y ojos de cápsula. `mascot()` la dibuja en SVG para el cuadro actual, así que se mueve con la escena y se renderiza como todo lo demás.

```js
mascot({ x: 960, y: 520, R: 180, t, expr: 'feliz', mira: [0.4, 0], chispas: 0.8 })
```

Expresiones: `normal`, `feliz`, `pensativa`, `sorprendida`, `enojada`, `triste`, `dormida`, o una mezcla de ellas con `pesos`.

### `// 11` Desarrollo

```bash
npm test                # matemática del runtime, línea de tiempo, efectos, WAV y captura
npm run readme-assets   # vuelve a renderizar todas las imágenes de este README
```
