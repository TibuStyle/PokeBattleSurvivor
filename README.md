# PokeBattle Survivor — prototipo 3D

Un primer vertical slice para un action roguelite de hordas en navegador. El objetivo de esta iteración es validar **flujo de región → inicial → partida**, una escena 3D ligera y el control híbrido antes de añadir el combate completo, enemigos, experiencia o modelos finales.

> La escena usa una criatura geométrica original como placeholder; no incluye modelos ni texturas extraídas de Pokémon.

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
- Flujo independiente del render: elegir región → elegir inicial → entrar a partida.
- Escena Three.js en perspectiva isométrica suave, con bosque procedural y un companion placeholder hecho con geometría.
- `WASD` o flechas para moverse, ratón para apuntar sobre el suelo 3D, clic izquierdo para disparar el rayo de prueba, `Espacio` para saltar y `Esc` para pausar.
- El control ya deja preparado el deslizamiento al mantener Espacio en compañeros de tipo Volador.
- Pokédex de los nueve iniciales regionales, pantalla de mejoras permanentes y escaparate del gachapón con las probabilidades del GDD. La compra de mejoras y el guardado están conectados; la entrada de monedas/tickets/gemas llegará con recompensas de partida.
- Persistencia local con normalización defensiva del perfil.
- Pruebas de Node para la selección, bloqueo/desbloqueo de regiones, guardado y compra de mejoras.
- Build estático de Vite preparado para publicarse en GitHub Pages; la automatización de despliegue puede añadirse como workflow de Actions.

## Arquitectura

```text
index.html
src/
  main.js                    # composición: conecta menú, flujo y motor
  data/
    regions.js               # regiones, jefes, enemigos e iniciales
    economy.js               # rarezas y tabla de mejoras
  flow/
    ProfileStore.js          # perfil persistente, con validación/migración básica
    RegionFlow.js            # state machine independiente de Three/DOM
  menu/
    MenuController.js        # mapa, Pokédex, mejoras, gacha, starter pick y HUD
  game/
    GameApp.js               # escena Three.js, loop, cámara y efectos
    HybridControls.js        # teclado, raycast del mouse, salto y pausa
tests/
  region-flow.test.js
.github/workflows/deploy.yml
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

### Controles híbridos

`HybridControls` convierte la posición de pantalla del cursor a coordenadas normalizadas, lanza un rayo desde la cámara y busca su intersección con el plano `y = 0`. La diferencia entre ese punto y la posición del jugador produce la dirección horizontal de apuntado. El loop consulta el vector de movimiento y vuelve a calcular el objetivo cuando la cámara sigue al jugador.

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

## Recursos y licencias de assets

### Para un prototipo comercialmente más seguro

- [Kenney Assets](https://kenney.nl/assets): paquetes para UI, prototipos y props; comprueba la licencia indicada en cada paquete (muchos son CC0).
- [Quaternius](https://quaternius.com/assets.html): modelos low-poly y packs de entorno publicados como CC0 según su catálogo.
- [Poly Haven](https://polyhaven.com/): modelos, HDRI y texturas CC0; especialmente útil para el bosque, rocas, suelo y props, no para criaturas Pokémon.
- [Sketchfab](https://sketchfab.com/): catálogo grande, pero la licencia se define **por modelo**; filtra y revisa atribución, uso comercial y redistribución antes de descargar.

### Para datos o inspiración fan

- [PokeAPI en GitHub](https://github.com/PokeAPI) y su [repositorio de datos](https://github.com/PokeAPI/api-data): datos estructurados para prototipos y búsquedas; no son un permiso para redistribuir personajes, marcas o artwork oficial.
- [The Models Resource](https://www.models-resource.com/): puede servir para investigación de formatos y referencia de modelos de juegos. No asumir que un archivo descargable tiene licencia para publicarlo en un juego o en GitHub Pages; muchos recursos de esa clase son extracciones de juegos comerciales.

**Aviso de IP:** Pokémon, sus nombres, personajes, marcas y assets oficiales pertenecen a sus titulares. Que un proyecto sea gratuito o se etiquete como fan game no equivale a una licencia de redistribución. Para un lanzamiento público/comercial, la opción más segura es reemplazarlos por criaturas, nombres y siluetas originales, o conseguir permisos/licencias explícitos. El prototipo actual no empaqueta modelos ni artwork de Pokémon.

### Formato recomendado

Para WebGL usa GLB/glTF, una textura atlas por criatura cuando sea posible, rigs sencillos y LOD para jefes/enemigos. Guarda un `ASSET_LICENSES.md` con autor, URL, licencia, atribución requerida y fecha de descarga de cada asset que incorpores. Para una primera prueba de rendimiento, apunta a modelos estilizados de bajo recuento de polígonos y limita el tamaño de texturas.

## GitHub Pages

`npm run build` genera `dist/`, y `vite.config.js` configura `/PokeBattleSurvivor/` como base durante un build de Actions y `/` en local. En **Settings → Pages** puedes seleccionar **GitHub Actions** y publicar `dist/`. Si el repositorio cambia de nombre, actualiza la ruta en `vite.config.js`.

Este PR no incluye un workflow de despliegue automático: el GitHub App conectado no autorizó crear/modificar archivos de Actions sin el permiso `workflows`. Para añadir ese workflow, reconecta GitHub en Arena con el permiso correspondiente o agrégalo después desde una integración autorizada.
