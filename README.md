# PokeBattle Survivor — prototipo 3D

Un action roguelite de hordas en navegador al estilo *Vampire Survivors*. El vertical slice actual (v0.5) conserva región → inicial → partida, movimientos propios, combate por tipos, hordas y progresión. La cámara de tercera persona usa **Pointer Lock** y WASD relativo a cámara; al empezar solo está disponible el ataque básico. El especial (`Q`) y la esquiva (`Shift`) se desbloquean eligiendo una de tres mejoras al subir de nivel y después reciben mejoras propias.

> Los acompañantes y enemigos de la escena son formas geométricas procedurales originales. No se incorporan modelos GLB/GLTF, texturas ni extracciones de juegos.

## Ejecutar en local

Requiere Node.js 20.19+ (se recomienda Node 22).

```bash
npm install
npm run dev
```

Para verificar el proyecto:

```bash
npm test
npm run build
npm run preview
```

## Qué funciona ahora

- Mapa inicial con Kanto disponible y Johto/Hoenn bloqueados.
- Selección gratuita de un inicial la primera vez que se abre cada región; la elección queda guardada en `localStorage` y no se puede volver a reclamar como gratuita.
- Flujo independiente del render: elegir región → elegir inicial → entrar a partida → informe de expedición.
- Escena Three.js con cámara de **tercera persona detrás del compañero**, bosque procedural, familiar elemental geométrico original, hordas regionales y orbes de experiencia 3D.
- `WASD` o flechas se mueven **según el yaw de cámara**. Haz clic en el campo para capturar el ratón con **Pointer Lock**; el ratón gira yaw/pitch de la cámara y el Pokémon orienta su cuerpo suavemente hacia el movimiento o el ataque. La sensibilidad ajustable se guarda localmente y también aparece en pausa.
- Al empezar solo está disponible el **ataque básico automático**. `Q` y `Shift` quedan bloqueados hasta elegir **Despertar especial** o **Despertar de esquiva** al subir de nivel; los bloqueos se ven en HUD, selección y guía, y no se pueden activar por teclado ni por API antes de desbloquearlos.
- Las elecciones de nivel conservan **tres opciones únicas**. Tras desbloquear el especial, aparecen mejoras dedicadas de **daño**, **alcance** y **enfriamiento**; la esquiva puede mejorar distancia y enfriamiento. `1-3` selecciona una carta.
- Movimientos propios de los nueve iniciales (p. ej. Charmander: **Ascuas** automática y **Lanzallamas** desbloqueable en `Q`). Tres formas de ataque: **haz** perforante, **abanico** y **área**.
- Tabla de tipos de 18 tipos: ×2, ×0,5 y ×0 (inmunidad), efectividad doble multiplicada y **STAB ×1,5**. El HUD informa daño, enfriamientos y eficacia del último golpe.
- Nueva **Guía de campo** con controles, estados de desbloqueo y sensibilidad; Pokédex regional con movimientos, formas, estadísticas, cobertura potencial y registro de cada compañero.
- Hordas por oleadas con especies y tipos regionales, **enemigos élite** con auras, un **centinela regional** a los 4 minutos y el **jefe regional** al cumplir las condiciones de expedición.
- Sistema de vida (`PS`), ventana de gracia, retirada táctica, resultados/recompensas, orbes de XP, mejoras permanentes, regiones y escaparate del gachapón.
- Persistencia local con normalización defensiva del perfil y notas de versión en [`PATCH_NOTES.md`](./PATCH_NOTES.md).
- Pruebas de Node para flujo regional, hordas, combate, desbloqueos y mejoras de habilidades, cámara/mouse look, Pokédex e interfaz.
- Build estático de Vite preparado para publicarse en GitHub Pages.

## Arquitectura

```text
index.html
PATCH_NOTES.md
src/
  main.js                    # composición: conecta menú, flujo y motor
  data/
    regions.js               # regiones, jefes, enemigos e iniciales
    economy.js               # rarezas y tabla de mejoras permanentes
    combat.js                # perfiles de hordas (con tipos), élites, centinelas y mejoras
    typeChart.js             # tipos, tabla de eficacia, STAB y colores
    moves.js                 # catálogo de movimientos y movesets de los nueve iniciales
  flow/
    ProfileStore.js          # perfil persistente, con validación/migración básica
    RegionFlow.js            # state machine independiente de Three/DOM
  menu/
    MenuController.js        # mapa, Pokédex, mejoras, gacha, HUD, centinela/jefe y modal de nivel
  game/
    RunSession.js            # simulación pura: hordas, habilidades bloqueadas, desbloqueos, combate y mejoras
    attacks.js               # geometría pura de haces, abanicos y áreas
    cameraRig.js             # cámara, Pointer Lock, sensibilidad y movimiento relativo (sin Three.js)
    GameApp.js               # escena Three.js, modelos procedurales, loop, cámara, enemigos y efectos
    HybridControls.js        # WASD, Pointer Lock, salto, habilidades desbloqueables y atajos 1-3
tests/
  region-flow.test.js
  combat-v02.test.js
  combat-v03.test.js
  typechart-v04.test.js
  moves-v04.test.js
  attacks-v04.test.js
  camera-v04.test.js
  pokedex-v04.test.js
  skills-v05.test.js
```

**Regla de dependencia:** el menú no importa Three.js. `RegionFlow` devuelve un `runConfig` serializable; `GameApp` consume esa configuración. Así se puede sustituir el motor o probar el flujo en Node sin abrir WebGL.

### Flujo de regiones

```js
flow.selectRegion('kanto');           // starter-select en una región nueva
flow.chooseStarter('charmander');     // una única elección gratuita
const runConfig = flow.enterRun();    // datos para el motor 3D
if (runConfig) game.start(runConfig);

// Hook futuro de victoria/recompensas:
flow.completeRun({
  victory: true,
  elapsedSeconds: 720,
  rewards: { coins: 80, tickets: 2, gems: 1 },
});
```

`completeRun()` es el punto donde una victoria marca la región y abre la siguiente. La recompensa por derrota y extracción aún necesita una decisión de diseño; por ahora no se finge que el prototipo ya la calcule.

### Controles de tercera persona (v0.5)

`HybridControls` solicita Pointer Lock con un clic en el lienzo y consume `movementX/movementY` para girar el yaw/pitch de cámara; `Esc` libera el puntero y pausa. El yaw transforma WASD a movimiento de mundo. El ataque apunta hacia la proyección horizontal de la cámara, mientras que `RunSession` interpola el yaw del compañero hacia el movimiento o el ataque con el arco angular más corto. Por eso el ratón no impone una rotación instantánea del modelo.

La cámara permanece detrás del compañero y sigue su posición con amortiguación. `MOUSE_LOOK` define la sensibilidad base y sus límites; un multiplicador de usuario (0,4×–2,4×) se guarda localmente y puede ajustarse antes de la partida o desde el menú de pausa. Geometría, inclinación y suavizado viven en `src/game/cameraRig.js` (`CAMERA_RIG`).

### Movimientos y daño (v0.4)

`RunSession` calcula el daño de cada impacto como:

```text
daño = round(potencia × 0,5 × (1 + 0,25 × rango de poder) × STAB × efectividad × repetición)
```

- **STAB ×1,5** si el tipo del movimiento coincide con un tipo del compañero.
- **Efectividad** según la tabla de tipos (`typeChart.js`): ×2, ×0,5 o ×0. Un enemigo inmune no participa en el ataque.
- **Repetición ×0,5** si un haz perforante vuelve a golpear al mismo enemigo.
- **Formas**: `beam` (haz perforante), `cone` (abanico que alcanza hasta `maxTargets`) y `burst` (área alrededor del compañero).
- El básico automático está activo desde el inicio. Especial y esquiva se guardan como habilidades de la partida; Q/Shift y sus llamadas de simulación se rechazan hasta elegir el desbloqueo en una subida de nivel.
- Tras abrir el especial aparecen opciones específicas de +25% de daño, +15% de alcance y −12% de enfriamiento por rango. La mejora de esquiva amplía su distancia y reduce su enfriamiento.
- Cada subida mantiene tres cartas distintas; los desbloqueos pendientes se priorizan para aparecer siempre entre las opciones.

## Análisis de diseño y mejoras sugeridas

### 1. Separar la campaña del gachapón

El desbloqueo de regiones debe ser determinista: **vencer al jefe abre la región siguiente** y entrega la elección inicial gratuita. El gachapón amplía variedad y personalización, pero nunca debe ser requisito para completar la campaña ni entregar una ventaja estadística imprescindible. Así se evita que una mala racha de tickets bloquee el progreso.

- La primera visita a una región ofrece tres iniciales y registra solo uno como regalo. Si el jugador quiere cambiar de inicial más tarde, que use uno ya desbloqueado, no una segunda elección gratuita.
- Al superar Kanto se habilita Johto y al superar Johto se habilita Hoenn. El mismo evento otorga una recompensa garantizada (ticket + moneda) aunque se pierda el combate final pero se alcance un hito de supervivencia.
- Recomiendo que las especies comunes funcionen como skins del arquetipo de tipo; rarezas altas desbloquean variaciones jugables, pero manteniendo el mismo presupuesto de poder.
- Duplicados del gacha deberían convertirse en fragmentos de especie. Añadir una garantía de rareza tras una cantidad visible de intentos evita rachas frustrantes.
- El gacha shiny debería consultar solo especies ya desbloqueadas. Si sale repetido, entregar fragmentos cosméticos; nada de daño, vida o velocidad extra.
- Monedas para mejoras permanentes con niveles limitados y coste creciente. Las gemas deben ser mucho menos frecuentes y exclusivamente estéticas.

### 2. Hacer que cada partida tenga un arco y una salida

Para que la extracción importe sin competir con el bucle de Vampire Survivors, probaría partidas de 10–12 minutos con hitos legibles: mini-jefe alrededor del minuto 4, evento/mapa en el 7 y jefe regional al 10–12. La extracción opcional permite asegurar una parte de las recompensas; quedarse arriesga ese botín por una recompensa de jefe mayor. Ajusta estos tiempos con pruebas, no como valores definitivos.

La derrota puede conservar una fracción de monedas y tickets por tiempo sobrevivido, mientras que la primera victoria de cada región entrega un premio fijo. Esto hace que una partida corta siga sintiéndose útil sin devaluar el triunfo.

### 3. Caos físico, pero con lectura clara

Toma de Megabonk el retroceso, las colisiones, las explosiones y los enemigos que se desplazan entre sí; conserva de Vampire Survivors la presión creciente de la horda. Para que el caos sea justo:

- Cada golpe grande tiene un tell inequívoco en el suelo, color distinto por patrón y una ventana de escape consistente.
- El knockback debe modificar la posición, no quitar al jugador el control del input durante demasiado tiempo.
- Mantén una colisión simple por enemigo; limita cuerpos físicos completos y usa instancing para hordas grandes.
- Mantén el salto útil para leer/evitar ataques, no como invulnerabilidad permanente. El planeo Volador reduce la caída, pero no elimina las zonas de impacto.

En el vertical slice uso movimiento directo, no un solver físico. Cuando el bucle se sienta bien, Rapier 3D puede aportar impulsos y colisiones; no hace falta simular cada proyectil como un rigid body.

### 4. Estructura de interfaz propuesta

El sitio de referencia funciona bien como acceso rápido a una partida, catálogo por regiones, controles sencillos y elección de una entre tres mejoras al subir de nivel. La guía pública destaca movimiento WASD, ataques automáticos, las cartas de nivel y lectura de telegráficos; su Pokédex organiza compañeros por región y adquisición. Este prototipo lleva esas ideas a un hub de expedición, una selección 3D previa a la partida y pantallas separadas de Pokédex, mejoras y gachapón:

1. **Hub**: Región / Pokédex / Mejoras / Gachapón, con recursos siempre visibles.
2. **Región**: escenario, jefe, estado de desbloqueo y compañero asignado.
3. **Elección de inicial**: tres tarjetas grandes, gratuita solo en la primera entrada a la región.
4. **Partida**: HUD reducido; las subidas de nivel pausan el juego y muestran tres cartas comparables.
5. **Informe**: tiempo, jefe, botín ganado y siguiente objetivo.

Referencia analizada: [guía pública de PokéSurvivor](https://pokesurvivor.com/en/guide/) y [Pokédex por regiones](https://pokesurvivor.com/en/pokedex/).

## Modelos y licencias de assets

La versión actual no incluye archivos GLB/GLTF ni texturas de terceros. No añadí modelos descargados porque no confirmé una licencia concreta que permita incorporar y redistribuir en este repositorio modelos de criaturas reconocibles. En su lugar, la escena combina primitivas y geometría procedural original en `src/game/GameApp.js`; no se copiaron assets de PokéSurvivor ni de juegos comerciales y no hay atribuciones de terceros pendientes. El inventario está en [`ASSET_LICENSES.md`](./ASSET_LICENSES.md).

Esta decisión evita atribuir una licencia que no se ha verificado, pero no otorga permisos sobre los nombres, diseños o marcas de Pokémon que ya aparecen en el prototipo. Para una publicación pública/comercial habría que obtener las licencias correspondientes o reemplazar también esos elementos por criaturas y nombres propios.

Si se incorporan modelos en el futuro, cada archivo deberá incluir en `ASSET_LICENSES.md` autor, URL de origen, licencia, atribución requerida y fecha de descarga, y la licencia deberá permitir expresamente redistribución dentro del juego/repo.

## GitHub Pages

`npm run build` genera `dist/`, y `vite.config.js` configura `/PokeBattleSurvivor/` como base durante un build de Actions y `/` en local. El repositorio incluye `.github/workflows/deploy.yml`, que en cada push a `main`:

1. Instala dependencias con `npm ci`.
2. Ejecuta `npm test`.
3. Ejecuta `npm run build`.
4. Publica el contenido de `dist/` en GitHub Pages usando `actions/deploy-pages`.

En **Settings → Pages** asegúrate de que **Source** esté en **GitHub Actions** (no en una rama). Si el repositorio cambia de nombre, actualiza la ruta en `vite.config.js`.
