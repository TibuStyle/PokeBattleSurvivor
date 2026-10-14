import {
  EQUIP_ITEMS,
  GACHA_POOL,
  TYPE_SYNERGIES,
  getEquippedItemModifiers,
  getGachaPokemon,
  getGachaMoveset,
  getPokemonSpriteUrl,
  rollNormalGacha,
  rollTenNormalGacha,
  rollShinyGacha,
} from '../data/gddSystems.js';
import { getUpgradeCost, PERMANENT_UPGRADES, RARITY_RATES } from '../data/economy.js';
import { REGIONS, STARTERS } from '../data/regions.js';
import { getStarterMoveset, STAB_MULTIPLIER, DAMAGE_SCALE } from '../data/moves.js';
import { describeEffectiveness, getSuperEffectiveTargets, getTypeColor } from '../data/typeChart.js';
import { MOUSE_LOOK, normalizeSensitivity } from '../game/cameraRig.js';

const pad2 = (value) => String(value).padStart(2, '0');
const SHAPE_LABELS = { beam: 'Haz', cone: 'Abanico', burst: 'Área' };

const BOSS_DEX_MAP = {
  Mewtwo: 150,
  'Ho-Oh / Lugia': 250,
  Groudon: 383,
};

const ENEMY_DEX_MAP = {
  Caterpie: 10,
  Weedle: 13,
  Spinarak: 167,
  Hoothoot: 163,
  Poochyena: 261,
  Numel: 322,
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

export class MenuController {
  constructor(
    root,
    flow,
    {
      onStartRun = () => {},
      onReturnToHub = () => {},
      onSetPause = () => {},
      onResume = () => {},
      onChooseRunUpgrade = () => {},
      onRerollRunUpgrade = () => {},
      onExtractRun = () => {},
      onMouseSensitivityChange = () => {},
    } = {},
  ) {
    this.root = root;
    this.flow = flow;
    this.onStartRun = onStartRun;
    this.onReturnToHub = onReturnToHub;
    this.onSetPause = onSetPause;
    this.onResume = onResume;
    this.onChooseRunUpgrade = onChooseRunUpgrade;
    this.onRerollRunUpgrade = onRerollRunUpgrade;
    this.onExtractRun = onExtractRun;
    this.onMouseSensitivityChange = onMouseSensitivityChange;
    this.mouseSensitivity = this.loadMouseSensitivity();
    this.pointerLocked = false;
    this.activeTab = 'regions';
    this.paused = false;
    this.levelUpChoices = null;
    this.equippedItemId = 'restos';
    this.selectedCompanionOverride = null;
    this.lastGachaBanner = null;
    this.lastGachaCards = [];
    this.hudState = this.createDefaultHudState();

    this.handleClick = this.handleClick.bind(this);
    this.handleInput = this.handleInput.bind(this);
    this.root.addEventListener('click', this.handleClick);
    this.root.addEventListener('input', this.handleInput);
    this.render();
  }

  createDefaultHudState() {
    return {
      elapsedSeconds: 0,
      wave: 1,
      status: 'running',
      hp: 100,
      maxHp: 100,
      level: 1,
      xp: 0,
      xpToNext: 40,
      kills: 0,
      eliteKills: 0,
      orbsCollected: 0,
      activeEnemies: 0,
      basicAttack: null,
      specialAttack: null,
      unlockedSkills: { special: false, dash: false },
      lastAttack: null,
      lastAttackSeq: 0,
      dashUnlocked: false,
      dashReady: false,
      dashCooldown: 0,
      activeUpgrades: [],
      pendingChoices: null,
      miniBoss: null,
      boss: null,
      rerollsRemaining: 2,
      coinsInRun: 0,
    };
  }

  render() {
    this.root.classList.toggle('is-in-game', this.flow.screen === 'run');

    switch (this.flow.screen) {
      case 'starter-select':
        this.root.innerHTML = this.renderStarterSelection();
        break;
      case 'region':
        this.root.innerHTML = this.renderRegionReady();
        break;
      case 'run':
        this.root.innerHTML = this.renderRunHud();
        break;
      case 'results':
        this.root.innerHTML = this.renderResults();
        break;
      case 'hub':
      default:
        this.root.innerHTML = this.renderHub();
        break;
    }
  }

  renderHub() {
    const { resources } = this.flow.profile;
    return `
      <div class="hub-shell">
        <header class="topbar">
          <button class="brand" type="button" aria-label="PokeBattle Survivor, inicio" data-action="tab" data-tab="regions">
            <span class="brand-mark"><span class="pokeball-badge"></span></span>
            <span class="brand-wordmark">
              <strong>PokéSurvivor 3D</strong>
              <small>MUNDO MISTERIOSO · ROGUELITE</small>
            </span>
          </button>
          <nav class="main-nav" aria-label="Menú principal">
            ${this.navButton('regions', '▶ Jugar')}
            ${this.navButton('pokedex', '🔴 Pokémon')}
            ${this.navButton('upgrades', '⬆️ Mejoras')}
            ${this.navButton('gacha', '🎰 Gacha')}
            ${this.navButton('guide', '📘 Guía')}
          </nav>
          <div class="wallet" aria-label="Recursos">
            <span class="wallet-chip wallet-chip--coin"><i class="wallet-icon coin">🪙</i><b>${resources.coins}</b><small>MON</small></span>
            <span class="wallet-chip wallet-chip--ticket"><i class="wallet-icon ticket">🎟️</i><b>${resources.tickets}</b><small>TIX</small></span>
            <span class="wallet-chip wallet-chip--gem"><i class="wallet-icon gem">💎</i><b>${resources.gems}</b><small>GEM</small></span>
          </div>
        </header>
        <main class="hub-content">
          ${this.renderHubTab()}
          <footer class="hub-footer">
            <span>PROTOTIPO 0.5 · POKÉSURVIVOR 3D EDITION</span>
            <span>Partida guardada en tu navegador · Sprites vía PokéAPI</span>
          </footer>
        </main>
      </div>
    `;
  }

  navButton(tab, label) {
    return `<button class="nav-button ${this.activeTab === tab ? 'is-active' : ''}" data-action="tab" data-tab="${tab}" ${this.activeTab === tab ? 'aria-current="page"' : ''}>${label}</button>`;
  }

  renderHubTab() {
    if (this.activeTab === 'guide') return this.renderGuide();
    if (this.activeTab === 'pokedex') return this.renderPokedex();
    if (this.activeTab === 'upgrades') return this.renderUpgrades();
    if (this.activeTab === 'gacha') return this.renderGacha();
    return this.renderRegions();
  }

  renderGuide() {
    return `
      <section class="page-heading page-heading--compact">
        <span class="eyebrow">📘 GUÍA DE ENTRENADOR · CONTROLES Y TABLA DE TIPOS</span>
        <h1>Cómo jugar</h1>
        <p>Sobrevive a las hordas de Pokémon salvajes, recoge gemas de experiencia y evoluciona tus movimientos. Las habilidades nuevas empiezan bloqueadas y se desbloquean subiendo de nivel.</p>
      </section>
      <div class="guide-layout">
        <section class="guide-panel guide-panel--steps" aria-label="Controles y progreso">
          <article class="guide-step"><span>01</span><div><h2>Mueve y mira</h2><p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> mueven a tu Pokémon según la cámara 3D. Haz clic en la arena para capturar el ratón (Pointer Lock); usa <kbd>Espacio</kbd> para saltar colinas o planear y <kbd>Esc</kbd> para pausar.</p></div></article>
          <article class="guide-step"><span>02</span><div><h2>Empieza con lo básico</h2><p>El ataque básico de tu compañero se lanza solo. El especial <kbd>Q</kbd>, el buff <kbd>E</kbd> (Danza Espada) y la esquiva <kbd>Shift</kbd> se activan al subir de nivel.</p></div></article>
          <article class="guide-step"><span>03</span><div><h2>Elige una de tres (o tira Reroll)</h2><p>Cada subida de nivel abre tres cartas estilo PokéSurvivor. Mientras Q y Shift estén bloqueados, saldrán prioritariamente. También puedes abrir <b>Cofres 3D</b> en el mapa para obtener <b>Baya Zidra</b> o <b>Pepitas</b>.</p></div></article>
          <article class="guide-step"><span>04</span><div><h2>Efectividad y STAB ×1,5</h2><p>Si tu ataque coincide con el tipo de tu Pokémon ganas <b>STAB ×1,5</b>. Además, los tipos Volador, Eléctrico, Hielo y Siniestro tienen pasivas elementales únicas.</p></div></article>
        </section>
        <aside class="guide-panel guide-settings">
          <span class="eyebrow">⚙️ AJUSTES DE CÁMARA 3D</span>
          <h2>Sensibilidad de cámara</h2>
          <p>Ajusta la velocidad de giro de la cámara en 3ª persona. Se guarda automáticamente.</p>
          ${this.renderSensitivityControl('guide')}
          <div class="guide-tip"><b>Consejo de Entrenador</b><span>Salta con Espacio cuando Mewtwo o Groudon marquen círculos rojos en el suelo para esquivar sus ondas expansivas.</span></div>
        </aside>
      </div>
    `;
  }

  renderSensitivityControl(prefix = 'settings') {
    const inputId = `${prefix}-mouse-sensitivity`;
    const outputId = `${prefix}-mouse-sensitivity-value`;
    return `
      <label class="sensitivity-control" for="${inputId}">
        <span><b>Sensibilidad</b><output id="${outputId}">${this.mouseSensitivity.toFixed(1)}×</output></span>
        <input id="${inputId}" type="range" min="${MOUSE_LOOK.minSensitivity}" max="${MOUSE_LOOK.maxSensitivity}" step="0.1" value="${this.mouseSensitivity}" data-setting="mouse-sensitivity" aria-label="Sensibilidad del ratón" />
        <small><span>Lenta</span><span>Rápida</span></small>
      </label>
    `;
  }

  loadMouseSensitivity() {
    try {
      const saved = globalThis.localStorage?.getItem('pokebattle-survivor:settings:v1');
      return saved == null ? MOUSE_LOOK.defaultSensitivity : normalizeSensitivity(saved);
    } catch {
      return MOUSE_LOOK.defaultSensitivity;
    }
  }

  saveMouseSensitivity() {
    try {
      globalThis.localStorage?.setItem('pokebattle-survivor:settings:v1', String(this.mouseSensitivity));
    } catch {
      // Ignorar
    }
  }

  handleInput(event) {
    const input = event.target?.closest?.('[data-setting="mouse-sensitivity"]');
    if (!input) return;
    this.mouseSensitivity = normalizeSensitivity(input.value);
    this.saveMouseSensitivity();
    for (const control of this.root.querySelectorAll?.('[data-setting="mouse-sensitivity"]') ?? []) {
      control.value = String(this.mouseSensitivity);
      const output = this.root.querySelector(`#${control.id}-value`);
      if (output) output.value = `${this.mouseSensitivity.toFixed(1)}×`;
    }
    this.onMouseSensitivityChange(this.mouseSensitivity);
  }

  setPointerLocked(locked, details = {}) {
    this.pointerLocked = Boolean(locked);
    const hint = this.root.querySelector('#pointer-lock-hint');
    if (!hint) return;
    hint.classList.toggle('is-visible', !this.pointerLocked);
    hint.textContent = details.unsupported
      ? 'Este navegador no admite captura del ratón; prueba con un navegador de escritorio.'
      : details.error
        ? 'No se pudo capturar el ratón. Haz clic en el campo para volver a intentarlo.'
        : 'Haz clic en la arena para capturar el ratón · Esc libera y pausa';
  }

  getActivePartnerInfo(suggestedRegion) {
    if (this.selectedCompanionOverride && this.flow.profile.unlockedPokemon.includes(this.selectedCompanionOverride)) {
      const gachaP = getGachaPokemon(this.selectedCompanionOverride);
      const starterP = STARTERS.find((s) => s.id === this.selectedCompanionOverride);
      if (gachaP) return gachaP;
      if (starterP) return starterP;
    }
    const chosenId = suggestedRegion && this.flow.getRegionProgress(suggestedRegion.id)?.starterId;
    const regionalStarter = chosenId ? suggestedRegion.starters.find((s) => s.id === chosenId) : null;
    if (regionalStarter) return regionalStarter;
    const firstUnlocked = this.flow.profile.unlockedPokemon[0];
    if (firstUnlocked) {
      return getGachaPokemon(firstUnlocked) ?? STARTERS.find((s) => s.id === firstUnlocked) ?? STARTERS[0];
    }
    return suggestedRegion?.starters?.[0] ?? STARTERS[0];
  }

  renderRegions() {
    const unlockedCount = REGIONS.filter((region) => this.flow.isRegionUnlocked(region.id)).length;
    const lastRegion = REGIONS.find((region) => this.flow.isRegionUnlocked(region.id) && !this.flow.getRegionProgress(region.id).cleared);
    const suggestedRegion = lastRegion ?? REGIONS.find((region) => this.flow.isRegionUnlocked(region.id)) ?? REGIONS[0];
    const chosen = suggestedRegion && this.flow.getRegionProgress(suggestedRegion.id)?.starterId;
    const partner = this.getActivePartnerInfo(suggestedRegion);
    const activeItem = getEquippedItemModifiers(this.equippedItemId);
    const totalUnlockedPokemon = this.flow.profile.unlockedPokemon.length;

    return `
      <section class="pokesurvivor-hub-hero">
        <div class="pokesurvivor-stage" style="--stage-color:${partner.color ?? '#78c6e5'}">
          <div class="stage-sky-badges">
            <span class="stage-pill">🌲 MAZMORRA ACTIVA: <b>${escapeHtml(suggestedRegion.mapName.toUpperCase())}</b></span>
            <span class="stage-pill stage-pill--gold">${escapeHtml( activeItem.icon ?? '🍎')} Objeto: <b>${escapeHtml(activeItem.name)}</b></span>
          </div>

          <div class="stage-meadow">
            <div class="stage-sunburst"></div>
            <div class="stage-pedestal"></div>
            <img
              class="stage-partner-sprite"
              src="${getPokemonSpriteUrl(partner.id)}"
              alt="${escapeHtml(partner.name)}"
            />
          </div>

          <div class="pmd-dialogue-box">
            <div class="pmd-dialogue-portrait">
              <img src="${getPokemonSpriteUrl(partner.id)}" alt="" />
            </div>
            <div class="pmd-dialogue-text">
              <div class="pmd-dialogue-head">
                <strong>${escapeHtml(partner.name)}</strong>
                <div class="type-row">${(partner.types ?? []).map((t) => this.typeChip(t)).join('')}</div>
              </div>
              <p>«¡Sobrevive a las hordas con tu compañero en 3D! Explora <b>${escapeHtml(suggestedRegion.mapName)}</b>, abre cofres con Bayas y derrota a <b>${escapeHtml(suggestedRegion.boss)}</b>.»</p>
            </div>
          </div>
        </div>

        <aside class="pokesurvivor-sidebar" aria-label="Menú estilo PokéSurvivor">
          <button class="ps-menu-btn ps-menu-btn--play" type="button" data-action="open-region" data-region-id="${suggestedRegion.id}">
            <span class="ps-menu-btn__icon">▶</span>
            <span class="ps-menu-btn__copy">
              <strong>Jugar</strong>
              <small>${chosen ? `Entrar a ${escapeHtml(suggestedRegion.mapName)}` : `Elegir inicial de ${escapeHtml(suggestedRegion.name)}`}</small>
            </span>
            <span class="ps-menu-btn__arrow">↗</span>
          </button>

          <button class="ps-menu-btn" type="button" data-action="tab" data-tab="pokedex">
            <span class="ps-menu-btn__icon">🔴</span>
            <span class="ps-menu-btn__copy">
              <strong>Pokémon</strong>
              <small>Tu colección · ${totalUnlockedPokemon} en la Pokédex</small>
            </span>
            <span class="ps-menu-btn__arrow">→</span>
          </button>

          <button class="ps-menu-btn" type="button" data-action="tab" data-tab="upgrades">
            <span class="ps-menu-btn__icon">⬆️</span>
            <span class="ps-menu-btn__copy">
              <strong>Mejoras</strong>
              <small>Haz que cada run sea más fuerte</small>
            </span>
            <span class="ps-menu-btn__arrow">→</span>
          </button>

          <button class="ps-menu-btn" type="button" data-action="tab" data-tab="gacha">
            <span class="ps-menu-btn__icon">🎰</span>
            <span class="ps-menu-btn__copy">
              <strong>Gacha</strong>
              <small>Tiradas ×1 y ×10 · Pokémon y Shinies</small>
            </span>
            <span class="ps-menu-btn__arrow">→</span>
          </button>

          <button class="ps-menu-btn" type="button" data-action="tab" data-tab="guide">
            <span class="ps-menu-btn__icon">📘</span>
            <span class="ps-menu-btn__copy">
              <strong>Guía y Ajustes</strong>
              <small>Controles 3D, tipos y sensibilidad</small>
            </span>
            <span class="ps-menu-btn__arrow">→</span>
          </button>
        </aside>
      </section>

      <section class="region-section">
        <div class="section-heading">
          <div>
            <span class="eyebrow">🗺️ SELECCIÓN DE MAZMORRA Y REGIÓN</span>
            <h2>Regiones Disponibles (${unlockedCount}/${REGIONS.length})</h2>
          </div>
          <span class="section-count">${String(unlockedCount).padStart(2, '0')} ABIERTA${unlockedCount === 1 ? '' : 'S'}</span>
        </div>
        <div class="region-grid">
          ${REGIONS.map((region) => this.renderRegionCard(region)).join('')}
        </div>
      </section>
    `;
  }

  renderRegionCard(region) {
    const progress = this.flow.getRegionProgress(region.id);
    const unlocked = this.flow.isRegionUnlocked(region.id);
    const starter = progress?.starterId ? region.starters.find((entry) => entry.id === progress.starterId) : null;
    const previous = REGIONS[REGIONS.indexOf(region) - 1];
    const stateLabel = !unlocked ? `🔒 Vence a ${previous?.boss ?? region.unlockHint}` : progress.cleared ? '★ REGIÓN SUPERADA' : '🟢 DISPONIBLE';
    const actionLabel = !unlocked ? 'Bloqueada' : starter ? '¡Entrar al Mapa!' : 'Elegir Inicial Gratis';
    const bossDex = BOSS_DEX_MAP[region.boss] ?? 150;

    return `
      <article class="region-card ${unlocked ? '' : 'is-locked'} ${progress?.cleared ? 'is-cleared' : ''}" style="--region-a:${region.palette[0]};--region-b:${region.palette[1]}">
        <div class="region-card__visual">
          <span class="region-card__gen">GEN ${String(region.generation).padStart(2, '0')} · ${escapeHtml(region.name.toUpperCase())}</span>
          <div class="region-card__sprites">
            ${region.enemies.map((enemyName) => {
              const eDex = ENEMY_DEX_MAP[enemyName] ?? 10;
              return `<img class="region-enemy-sprite" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${eDex}.png" alt="${escapeHtml(enemyName)}" title="Horda: ${escapeHtml(enemyName)}" />`;
            }).join('')}
            <img class="region-boss-sprite" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${bossDex}.png" alt="${escapeHtml(region.boss)}" title="Jefe: ${escapeHtml(region.boss)}" />
          </div>
          <span class="region-card__state">${escapeHtml(stateLabel)}</span>
        </div>
        <div class="region-card__body">
          <div class="region-card__title">
            <div>
              <h3>${escapeHtml(region.mapName)}</h3>
              <span>Región de ${escapeHtml(region.name)}</span>
            </div>
            ${progress?.cleared ? '<span class="clear-mark">🏆</span>' : ''}
          </div>
          <div class="region-card__meta">
            <span>JEFE LEGENDARIO <b>⚠️ ${escapeHtml(region.boss)}</b></span>
            <span>COMPAÑERO INICIAL <b>${starter ? escapeHtml(starter.name) : '🎁 Por reclamar'}</b></span>
          </div>
          <button class="button ${unlocked ? 'button--primary' : 'button--locked'}" data-action="open-region" data-region-id="${region.id}" ${unlocked ? '' : 'disabled'}>
            ${actionLabel} <span aria-hidden="true">${unlocked ? '▶' : '🔒'}</span>
          </button>
        </div>
      </article>
    `;
  }

  renderPokedex() {
    const starterIds = new Set(STARTERS.map((s) => s.id));
    const unlockedCount = this.flow.profile.unlockedPokemon.filter((id) => starterIds.has(id)).length;
    return `
      <section class="page-heading">
        <span class="eyebrow">🔴 ARCHIVO DE CAMPO · ${pad2(unlockedCount)} / ${pad2(STARTERS.length)} REGISTRADOS</span>
        <h1>Pokédex y Colección</h1>
        <p>El ataque <b>básico</b> se dispara solo. El <b>especial con Q</b> y la <b>esquiva con Shift</b> empiezan bloqueados y se desbloquean al subir de nivel. El tipo decide la eficacia y el STAB ×1,5 aplica cuando el movimiento coincide con el tipo del compañero.</p>
      </section>
      ${REGIONS.map((region) => this.renderPokedexRegion(region)).join('')}
      ${this.renderGachaPokedexSection()}
    `;
  }

  renderPokedexRegion(region) {
    const cards = region.starters.map((starter) => this.renderDexCard(starter, region)).join('');
    return `
      <section class="dex-region">
        <div class="section-heading">
          <div><span class="eyebrow">GEN ${pad2(region.generation)} · ${escapeHtml(region.name.toUpperCase())}</span><h2>Iniciales de ${escapeHtml(region.name)}</h2></div>
        </div>
        <div class="dex-grid">${cards}</div>
      </section>
    `;
  }

  renderDexCard(starter, region) {
    const unlocked = this.flow.isPokemonUnlocked(starter.id);
    const progress = this.flow.getRegionProgress(starter.regionId);
    const isStarter = progress?.starterId === starter.id;
    const number = STARTERS.findIndex((entry) => entry.id === starter.id) + 1;
    const moveset = getStarterMoveset(starter.id);
    const coverage = this.offensiveCoverage([moveset.basic, moveset.special]);
    const status = isStarter ? '★ INICIAL ELEGIDO' : unlocked ? '✓ REGISTRADO' : '🔒 POR DESBLOQUEAR';

    return `
      <article class="dex-card ${unlocked ? 'is-unlocked' : 'is-unknown'}" style="--creature-color:${starter.color};--creature-accent:${starter.accent}">
        <div class="dex-card__art">
          <span class="dex-index">#${pad2(number).padStart(3, '0')}</span>
          <span class="creature-orb" aria-hidden="true">
            <img class="poke-sprite" src="${getPokemonSpriteUrl(starter.id)}" alt="" loading="lazy" />
            <i></i>
          </span>
          ${unlocked ? '' : '<span class="dex-lock" aria-label="Sin registrar">🔒</span>'}
        </div>
        <div class="dex-card__body">
          <span class="eyebrow">${escapeHtml(region.name)} · INICIAL</span>
          <h3>${unlocked ? escapeHtml(starter.name) : 'Compañero sin registrar'}</h3>
          <div class="type-row">${starter.types.map((type) => this.typeChip(type)).join('')}</div>
          ${unlocked ? `
            <div class="dex-moves">
              ${this.renderDexMove(moveset.basic, 'Automático')}
              ${this.renderDexMove(moveset.special, 'Q · Especial', { lockedAtStart: true })}
            </div>
            ${coverage.length ? `<p class="dex-coverage"><span>Cobertura súper eficaz:</span> ${coverage.map((type) => this.typeChip(type)).join('')}</p>` : ''}
          ` : '<p class="dex-locked-note">Movimientos sin registrar. Elige este inicial en su región para verlos.</p>'}
          <span class="dex-status">${status}</span>
        </div>
      </article>
    `;
  }

  renderGachaPokedexSection() {
    const unlockedSet = new Set(this.flow.profile.unlockedPokemon);
    const unlockedGacha = GACHA_POOL.filter((p) => unlockedSet.has(p.id)).length;
    return `
      <section class="dex-region">
        <div class="section-heading">
          <div>
            <span class="eyebrow">🎰 RECLUTAMIENTO GACHAPÓN · ${pad2(unlockedGacha)} / ${pad2(GACHA_POOL.length)} DESBLOQUEADOS</span>
            <h2>Compañeros de las 9 Regiones y Legendarios</h2>
          </div>
        </div>
        <div class="dex-grid">
          ${GACHA_POOL.map((entry) => {
            const isUnlocked = unlockedSet.has(entry.id);
            const synergy = TYPE_SYNERGIES[entry.chassisType];
            return `
              <article class="dex-card ${isUnlocked ? 'is-unlocked' : 'is-unknown'}" style="--creature-color:${entry.color};--creature-accent:${entry.accent}">
                <div class="dex-card__art">
                  <span class="dex-index">#${String(entry.dex).padStart(3, '0')}</span>
                  <span class="creature-orb" aria-hidden="true">
                    <img class="poke-sprite" src="${getPokemonSpriteUrl(entry.id)}" alt="" loading="lazy" />
                    <i></i>
                  </span>
                  ${isUnlocked ? '' : '<span class="dex-lock" aria-label="Sin registrar">🔒</span>'}
                </div>
                <div class="dex-card__body">
                  <span class="eyebrow">${escapeHtml(entry.region)} · ${escapeHtml(entry.rarityLabel.toUpperCase())}</span>
                  <h3>${isUnlocked ? escapeHtml(entry.name) : 'Pokémon misterioso'}</h3>
                  <div class="type-row">${entry.types.map((t) => this.typeChip(t)).join('')}</div>
                  ${isUnlocked && synergy ? `<p class="dex-locked-note"><b>Pasiva (${escapeHtml(entry.chassisType)}):</b> ${escapeHtml(entry.isLegendary ? synergy.legendaryPassive.description : synergy.description)}</p>` : '<p class="dex-locked-note">Consigue Tickets derrotando jefes y desbloquéalo en el Gachapón.</p>'}
                  <span class="dex-status">${isUnlocked ? (entry.isLegendary ? '★ LEGENDARIO' : '✓ EN TU EQUIPO') : '🎰 EN GACHAPÓN'}</span>
                </div>
              </article>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  renderDexMove(move, slotLabel, { lockedAtStart = false } = {}) {
    if (!move) return '';
    const shape = SHAPE_LABELS[move.shape] ?? 'Haz';
    return `
      <div class="dex-move" style="--move-color:${move.color}">
        <div class="dex-move__head">
          <span class="dex-move__slot">${escapeHtml(slotLabel)}</span>
          <b>${escapeHtml(move.name)}</b>
          ${this.typeChip(move.type)}
        </div>
        <small>${shape} · potencia ${move.power} · enfriamiento ${move.cooldown.toFixed(1).replace('.', ',')} s</small>
        ${lockedAtStart ? '<small class="dex-move__locked">Bloqueado al inicio · se desbloquea al subir de nivel</small>' : ''}
        <small class="dex-move__desc">${escapeHtml(move.description)}</small>
      </div>
    `;
  }

  offensiveCoverage(moves) {
    const types = new Set();
    for (const move of moves) {
      for (const type of getSuperEffectiveTargets(move.type)) types.add(type);
    }
    return [...types];
  }

  typeChip(type, extraClass = '') {
    return `<span class="type-chip ${extraClass}" style="--type-color:${getTypeColor(type)}">${escapeHtml(type)}</span>`;
  }

  attackPreview(move, slot) {
    if (!move) return null;
    const stab = this.flow.activeRun?.starter?.types?.includes(move.type) ?? false;
    const unlocked = slot === 'basic' || Boolean(this.hudState?.specialAttack?.unlocked);
    return {
      slot,
      id: move.id,
      name: move.name,
      type: move.type,
      shape: move.shape,
      color: move.color,
      damage: Math.max(1, Math.round(move.power * DAMAGE_SCALE * (stab ? STAB_MULTIPLIER : 1))),
      stab,
      cooldown: move.cooldown,
      cooldownRemaining: 0,
      unlocked,
      ready: unlocked,
    };
  }

  renderAttackPanel(hud = {}, run = null) {
    const moveset = run ? (getGachaMoveset(run.starter.id) ?? getStarterMoveset(run.starter.id)) : null;
    const basic = hud.basicAttack ?? (moveset ? this.attackPreview(moveset.basic, 'basic') : null);
    const special = hud.specialAttack ?? (moveset ? this.attackPreview(moveset.special, 'special') : null);
    const last = hud.lastAttack;

    return `
      <div class="run-attack-panel" aria-label="Movimientos del compañero">
        ${basic ? this.renderAttackRow(basic, 'AUTO') : ''}
        ${special ? this.renderAttackRow(special, 'Q') : ''}
        <div class="run-last-hit ${last ? '' : 'is-empty'}">${last ? this.renderLastHit(last) : 'Sin impactos todavía'}</div>
      </div>
    `;
  }

  renderAttackRow(move, keyLabel) {
    const remaining = Math.max(0, Number(move.cooldownRemaining) || 0);
    const unlocked = move.unlocked !== false;
    const ready = unlocked && (move.ready ?? remaining <= 0);
    const cooldown = Math.max(0.0001, Number(move.cooldown) || 0.0001);
    const fill = unlocked ? (ready ? 100 : Math.max(0, Math.min(100, Math.round((1 - remaining / cooldown) * 100)))) : 0;
    const shape = SHAPE_LABELS[move.shape] ?? 'Haz';
    const rowClass = keyLabel === 'Q' ? 'run-attack-row--special' : 'run-attack-row--basic';
    return `
      <div class="run-attack-row ${rowClass} ${ready ? 'is-ready' : ''} ${unlocked ? '' : 'is-locked'}" style="--move-color:${move.color}" aria-label="${escapeHtml(move.name)}${unlocked ? '' : ', habilidad bloqueada'}">
        <span class="attack-key">${escapeHtml(keyLabel)}</span>
        <div class="attack-copy">
          <b>${escapeHtml(move.name)}</b>
          <small>${this.typeChip(move.type, 'type-chip--mini')} ${shape} · ${move.damage} daño${move.stab ? ' · STAB' : ''}${unlocked ? '' : ' · se desbloquea al subir de nivel'}</small>
          <div class="attack-cd-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${fill}"><i style="width:${fill}%"></i></div>
        </div>
        <span class="attack-cd-text">${unlocked ? (ready ? 'LISTO' : `${remaining.toFixed(1).replace('.', ',')} s`) : 'BLOQUEADO'}</span>
      </div>
    `;
  }

  renderLastHit(last) {
    const tone = last.effectiveness === 0 ? 'none' : (last.effectiveness > 1 ? 'super' : (last.effectiveness < 1 ? 'weak' : 'normal'));
    return `
      Último golpe: <b>${escapeHtml(last.moveName)}</b>
      <span class="eff eff--${tone}">${escapeHtml(describeEffectiveness(last.effectiveness))}${last.effectiveness > 0 && last.effectiveness !== 1 ? ` ×${String(last.effectiveness).replace('.', ',')}` : ''}</span>
      ${last.stab ? '<span class="eff eff--stab">STAB</span>' : ''}
      <small>${last.damage} daño${last.hitCount > 1 ? ` · ${last.hitCount} objetivos` : ''}</small>
    `;
  }

  renderUpgrades() {
    const { coins } = this.flow.profile.resources;
    return `
      <section class="page-heading page-heading--compact">
        <span class="eyebrow">⬆️ TIENDA POKÉMON · ${coins} POKÉMONEDAS DISPONIBLES</span>
        <h1>Mejoras de Entrenador</h1>
        <p>Invierte tus Pokémonedas en estadísticas permanentes estilo PokéSurvivor. Se aplican a todos tus Pokémon en cualquier mapa.</p>
      </section>
      <div class="upgrade-grid">
        ${PERMANENT_UPGRADES.map((upgrade) => {
          const level = this.flow.profile.upgrades[upgrade.id] ?? 0;
          const maxed = level >= upgrade.maxLevel;
          const cost = getUpgradeCost(upgrade, level);
          const canBuy = !maxed && coins >= cost;
          return `
            <article class="upgrade-card">
              <div class="upgrade-card__icon">${upgrade.icon}</div>
              <div class="upgrade-card__copy"><span class="eyebrow">NIVEL ${String(level).padStart(2, '0')} / ${upgrade.maxLevel}</span><h3>${escapeHtml(upgrade.name)}</h3><p>${escapeHtml(upgrade.detail)}</p></div>
              <div class="upgrade-card__action"><div class="level-track" aria-label="Rango ${level} de ${upgrade.maxLevel}">${Array.from({ length: upgrade.maxLevel }, (_, slot) => `<i class="${slot < level ? 'is-filled' : ''}"></i>`).join('')}</div><button class="button ${canBuy ? 'button--primary' : 'button--secondary'}" data-action="buy-upgrade" data-upgrade-id="${upgrade.id}" ${canBuy ? '' : 'disabled'}>${maxed ? '★ MÁXIMO' : `Mejorar · ${cost} 🪙`}</button></div>
            </article>
          `;
        }).join('')}
      </div>
      <p class="implementation-note"><span>!</span> Las mejoras permanentes potencian tus PS máximos, velocidad, enfriamiento de ataques, radio de imán y ganancia de XP en todas tus partidas.</p>
    `;
  }

  renderGacha() {
    const { tickets, gems } = this.flow.profile.resources;
    return `
      <section class="page-heading page-heading--compact">
        <span class="eyebrow">🎰 MÁQUINA GACHAPÓN · ${tickets} TICKETS · ${gems} GEMAS SHINY</span>
        <h1>Reclutamiento Pokémon</h1>
        <p>Usa tus Tickets para reclutar entre 28 Pokémon de todas las regiones (incluyendo Legendarios con pasivas únicas) o Gemas para desbloquear versiones Variocolor (Shiny).</p>
      </section>
      ${this.lastGachaBanner ? `<div class="unlock-banner" role="status">${escapeHtml(this.lastGachaBanner)}</div>` : ''}
      ${this.lastGachaCards.length > 0 ? `
        <div class="gacha-results-strip">
          ${this.lastGachaCards.map((card) => `
            <div class="gacha-pull-card" style="--rarity-border:${card.isShiny ? '#ff7be5' : (card.isLegendary ? '#ffd700' : '#4aa3ff')}">
              <img src="${getPokemonSpriteUrl(card.id, { shiny: Boolean(card.isShiny) })}" alt="${escapeHtml(card.name)}" />
              <strong>${card.isShiny ? '✨ ' : ''}${escapeHtml(card.name)}</strong>
              <small>${escapeHtml(card.rarityLabel ?? card.rarity)}</small>
            </div>
          `).join('')}
        </div>
      ` : ''}
      <div class="gacha-layout">
        <article class="gacha-panel gacha-panel--normal">
          <div class="gacha-panel__label">01 / GACHAPÓN REGIONAL</div>
          <div class="gacha-illustration"><img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/145.png" alt="Zapdos" style="width:68px;height:68px;" /></div>
          <h2>Reclutamiento Normal</h2>
          <p>Desbloquea Pokémon de Kanto a Paldea. La tirada ×10 garantiza al menos un Súper Raro o Legendario. Los repetidos dan +15 Pokémonedas.</p>
          <div class="rarity-list">${RARITY_RATES.map((rarity) => `<div class="rarity-row"><span><i style="--rarity-color:${rarity.color}"></i>${rarity.label}</span><b>${rarity.percent}%</b></div>`).join('')}</div>
          <div style="display:flex;gap:0.65rem;flex-wrap:wrap;margin-top:1.1rem;">
            <button class="button button--primary" type="button" data-action="gacha-normal" ${tickets >= 1 ? '' : 'disabled'}>
              Tirar ×1 · 1 🎟️
            </button>
            <button class="button button--secondary" type="button" data-action="gacha-ten" ${tickets >= 10 ? '' : 'disabled'} style="width:auto;">
              Tirar ×10 · 10 🎟️ (Épico+)
            </button>
          </div>
        </article>
        <article class="gacha-panel gacha-panel--shiny">
          <div class="gacha-panel__label">02 / GACHAPÓN VARIOCOLOR</div>
          <div class="gacha-illustration gacha-illustration--shiny"><img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/shiny/150.png" alt="Shiny Mewtwo" style="width:68px;height:68px;" /></div>
          <h2>Gachapón Shiny ✨</h2>
          <p>Exclusivo para entrenadores: entrega únicamente el aspecto Variocolor (Shiny) de Pokémon que ya hayas registrado en tu Pokédex.</p>
          <div class="shiny-note"><span>✨</span><div><b>Solo especies ya desbloqueadas</b><small>Posee el mismo sistema de rarezas (60% / 25% / 10% / 5%).</small></div></div>
          <div style="margin-top:1.1rem;">
            <button class="button button--primary" type="button" data-action="gacha-shiny" ${gems >= 3 ? '' : 'disabled'}>
              ${gems >= 3 ? 'Tirar Shiny · 3 💎 Gemas' : 'Necesitas 3 💎 Gemas'}
            </button>
          </div>
        </article>
      </div>
    `;
  }

  renderStarterSelection() {
    const region = this.flow.selectedRegion;
    if (!region) return this.renderHub();
    return `
      <main class="focus-screen">
        <header class="focus-header"><button class="text-button" data-action="back-to-hub">← Volver al menú principal</button><span class="focus-step">LABORATORIO DE ${escapeHtml(region.name.toUpperCase())} <i></i> PASO 01 / 02</span></header>
        <section class="starter-intro"><span class="eyebrow">🎁 ${escapeHtml(region.name.toUpperCase())} · ELECCIÓN DE INICIAL GRATUITA</span><h1>¡Elige a tu<br /><em>compañero Pokémon!</em></h1><p>Esta elección gratuita se ofrece al desbloquear ${escapeHtml(region.name)}. Comenzarás con el ataque básico automático; el especial y la esquiva se desbloquean al subir de nivel.</p></section>
        <section class="starter-grid" aria-label="Pokémon iniciales de ${escapeHtml(region.name)}">
          ${region.starters.map((starter, index) => `
            <article class="starter-card" style="--creature-color:${starter.color};--creature-accent:${starter.accent}">
              <div class="starter-card__number">#0${index + 1} <span>· ${starter.types.map(escapeHtml).join(' / ')}</span></div>
              <div class="starter-card__art"><div class="starter-orb" aria-hidden="true"><img class="poke-sprite" src="${getPokemonSpriteUrl(starter.id)}" alt="" loading="lazy" /><i></i></div><span class="starter-orbit starter-orbit--one"></span><span class="starter-orbit starter-orbit--two"></span></div>
              <div class="starter-card__copy"><h2>${escapeHtml(starter.name)}</h2><p>${this.starterFlavour(starter)}</p>${this.renderStarterMoves(starter)}</div>
              <button class="button button--primary starter-pick" data-action="pick-starter" data-starter-id="${starter.id}">¡Te elijo a ti, ${escapeHtml(starter.name)}! <span aria-hidden="true">▶</span></button>
            </article>
          `).join('')}
        </section>
        <p class="focus-footnote">Tu progreso se guarda automáticamente en el navegador al estilo PokéSurvivor.</p>
      </main>
    `;
  }

  renderStarterMoves(starter) {
    const moveset = getStarterMoveset(starter.id);
    return `
      <ul class="starter-moves" aria-label="Habilidades de ${escapeHtml(starter.name)}">
        <li><span>AUTO</span> ${escapeHtml(moveset.basic.name)} ${this.typeChip(moveset.basic.type, 'type-chip--mini')} <b class="skill-state skill-state--open">Disponible</b></li>
        <li class="is-locked"><span>Q · NV.</span> ${escapeHtml(moveset.special.name)} ${this.typeChip(moveset.special.type, 'type-chip--mini')} <b class="skill-state">Bloqueado</b></li>
        <li class="is-locked"><span>SHIFT</span> Esquiva <b class="skill-state">Bloqueada</b></li>
      </ul>
    `;
  }

  starterFlavour(starter) {
    const flavour = {
      bulbasaur: 'Crecimiento paciente, raíces firmes y control del terreno.',
      charmander: 'Mucho ritmo y una afinidad natural por el daño explosivo.',
      squirtle: 'Defensa estable y control seguro cuando la horda se cierra.',
      chikorita: 'Apoyo y aguante para convertir el bosque en tu territorio.',
      cyndaquil: 'Presión ofensiva y fuego constante para abrirte paso.',
      totodile: 'Empuje frontal y control de espacio a corta distancia.',
      treecko: 'Movilidad y precisión para atravesar los huecos de la horda.',
      torchic: 'Ráfagas rápidas y una escalada de daño agresiva.',
      mudkip: 'Equilibrio entre resistencia y control del campo.',
    };
    return flavour[starter.id] ?? 'Un compañero listo para la aventura.';
  }

  renderRegionReady() {
    const region = this.flow.selectedRegion;
    const progress = this.flow.selectedProgress;
    const starter = region?.starters.find((entry) => entry.id === progress?.starterId);
    if (!region || !starter) return this.renderStarterSelection();

    const activePartner = (this.selectedCompanionOverride && (getGachaPokemon(this.selectedCompanionOverride) ?? STARTERS.find((s) => s.id === this.selectedCompanionOverride))) || starter;
    const activeMoveset = getGachaMoveset(activePartner.id) ?? getStarterMoveset(activePartner.id);

    return `
      <main class="focus-screen region-ready-screen">
        <header class="focus-header"><button class="text-button" data-action="back-to-hub">← Volver al menú PokéSurvivor</button><span class="focus-step">${escapeHtml(region.name.toUpperCase())} <i></i> PREPARAR RUN</span></header>
        <section class="ready-layout">
          <div class="ready-copy">
            <span class="eyebrow"><span class="status-dot"></span> MAZMORRA 3D · GEN ${String(region.generation).padStart(2, '0')}</span>
            <h1>${escapeHtml(region.mapName)}<br /><em>te espera.</em></h1>
            <p>Enfréntate a las hordas de ${region.enemies.map(escapeHtml).join(' y ')} junto a ${escapeHtml(starter.name)} (${escapeHtml(getStarterMoveset(starter.id).special.name)}), abre cofres 3D con Bayas y derrota al jefe ${escapeHtml(region.boss)}.</p>
            <div class="ready-objectives">
              <div><small>HORDA SALVAJE</small><b>${region.enemies.map(escapeHtml).join(' · ')}</b></div>
              <div><small>JEFE FINAL</small><b class="boss-text">⚠️ ${escapeHtml(region.boss)}</b></div>
            </div>

            <div class="ready-companions" style="margin: 0.75rem 0;">
              <small style="display:block;margin-bottom:0.4rem;font-weight:700;color:#ffcb05;">CAMBIAR POKÉMON ACTIVO (${this.flow.profile.unlockedPokemon.length} DESBLOQUEADOS)</small>
              <div style="display:flex;gap:0.45rem;flex-wrap:wrap;max-height:115px;overflow-y:auto;padding:4px 0;">
                ${this.flow.profile.unlockedPokemon.map((pokeId) => {
                  const gachaEntry = getGachaPokemon(pokeId);
                  const starterEntry = STARTERS.find((s) => s.id === pokeId);
                  const display = gachaEntry ?? starterEntry;
                  if (!display) return '';
                  const isSelected = activePartner.id === display.id;
                  return `
                    <button type="button" class="button ${isSelected ? 'button--primary' : 'button--secondary'}" data-action="select-companion" data-companion-id="${display.id}" style="width:auto;padding:0.3rem 0.7rem;font-size:0.82rem;display:inline-flex;align-items:center;gap:6px;">
                      <img src="${getPokemonSpriteUrl(display.id)}" alt="" style="width:28px;height:28px;" />
                      ${escapeHtml(display.name)}
                    </button>
                  `;
                }).join('')}
              </div>
            </div>

            <div class="ready-items" style="margin: 0.85rem 0;">
              <small style="display:block;margin-bottom:0.4rem;font-weight:700;color:#ffcb05;">EQUIPAR OBJETO POKÉMON</small>
              <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                ${Object.values(EQUIP_ITEMS).map((item) => `
                  <button type="button" class="button ${this.equippedItemId === item.id ? 'button--primary' : 'button--secondary'}" data-action="select-item" data-item-id="${item.id}" style="width:auto;padding:0.4rem 0.8rem;font-size:0.82rem;">
                    ${escapeHtml(item.icon ?? '🍎')} ${escapeHtml(item.name)}
                  </button>
                `).join('')}
              </div>
              <small style="display:block;margin-top:0.35rem;color:#fff3b0;">${escapeHtml(getEquippedItemModifiers(this.equippedItemId).description)}</small>
            </div>

            <button class="button button--primary button--launch" data-action="enter-run">▶ ¡Entrar a la Mazmorra 3D! <span aria-hidden="true">↗</span></button>
            <p class="control-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> mover <span>·</span> <kbd>Espacio</kbd> saltar/planear <span>·</span> <kbd>Q</kbd> especial <span>·</span> <kbd>E</kbd> Danza Espada <span>·</span> <kbd>Shift</kbd> esquiva</p>
          </div>
          <aside class="partner-card" style="--creature-color:${activePartner.color};--creature-accent:${activePartner.accent}">
            <span class="eyebrow">COMPAÑERO SELECCIONADO</span>
            <div class="partner-art"><div class="starter-orb" aria-hidden="true"><img class="poke-sprite" src="${getPokemonSpriteUrl(activePartner.id)}" alt="" loading="lazy" /><i></i></div></div>
            <h2>${escapeHtml(activePartner.name)}</h2>
            <div class="type-row">${activePartner.types.map((type) => this.typeChip(type)).join('')}</div>
            <div class="partner-card__stat"><span>ATAQUE AUTOMÁTICO</span><b>${escapeHtml(activeMoveset.basic.name)} <small>· ${escapeHtml(activeMoveset.basic.type)} · ${SHAPE_LABELS[activeMoveset.basic.shape] ?? 'Haz'}</small></b></div>
            <div class="partner-card__stat"><span>ESPECIAL · Q · BLOQUEADO AL INICIO</span><b>${escapeHtml(activeMoveset.special.name)} <small>· ${escapeHtml(activeMoveset.special.type)} · se desbloquea al subir de nivel</small></b></div>
            <div class="partner-card__stat"><span>ESQUIVA · SHIFT · BLOQUEADA AL INICIO</span><b>Impulso evasivo <small>· invulnerabilidad temporal</small></b></div>
          </aside>
        </section>
      </main>
    `;
  }

  renderRunHud() {
    const run = this.flow.activeRun;
    if (!run) return '';
    const hud = this.hudState ?? this.createDefaultHudState();
    const hpPercent = Math.max(0, Math.min(100, Math.round((hud.hp / Math.max(1, hud.maxHp)) * 100)));
    const xpPercent = Math.max(0, Math.min(100, Math.round((hud.xp / Math.max(1, hud.xpToNext)) * 100)));
    const isLowHp = hpPercent <= 30;
    const choices = Array.isArray(this.levelUpChoices) && this.levelUpChoices.length > 0
      ? this.levelUpChoices
      : null;

    return `
      <div class="run-hud">
        <div class="tps-crosshair" aria-hidden="true"><span></span></div>
        <div class="megabonk-top-xp" role="progressbar" aria-label="Barra superior de experiencia" aria-valuenow="${xpPercent}">
          <div id="megabonk-top-xp-fill" class="megabonk-top-xp__fill" style="width:${xpPercent}%"></div>
        </div>
        <header class="run-hud__top">
          <div class="run-location">
            <img class="run-partner-mini" src="${getPokemonSpriteUrl(run.starter.id)}" alt="" />
            <div>
              <small>${escapeHtml(run.regionName)} · <span id="run-wave">OLEADA ${String(hud.wave).padStart(2, '0')}</span></small>
              <b>${escapeHtml(run.mapName)}</b>
            </div>
          </div>
          <div class="run-metrics">
            <div class="run-timer"><small>TIEMPO</small><b id="run-clock">${this.formatTime(hud.elapsedSeconds)}</b></div>
            <div class="run-timer"><small>DERROTADOS</small><b id="run-kills">${hud.kills}</b></div>
            <div class="run-timer"><small>ORBES XP</small><b id="run-orbs">${hud.orbsCollected}</b></div>
          </div>
          <button class="hud-pause" data-action="pause-run" aria-label="Pausar partida">Ⅱ</button>
        </header>

        <div id="pointer-lock-hint" class="pointer-lock-hint ${this.pointerLocked ? '' : 'is-visible'}" role="status">Haz clic en la arena para capturar el ratón · Esc libera y pausa</div>

        <aside class="run-vitals" aria-label="Estado del compañero">
          <div class="vital-block">
            <div class="vital-row">
              <span class="vital-label">♥ PS DE ${escapeHtml(run.starter.name.toUpperCase())}</span>
              <b id="run-hp-text">${hud.hp} / ${hud.maxHp} PS</b>
            </div>
            <div class="hud-bar hud-bar--hp ${isLowHp ? 'is-critical' : ''}" id="run-hp-bar">
              <div id="run-hp-fill" class="hud-bar__fill" style="width:${hpPercent}%"></div>
            </div>
          </div>

          <div class="vital-block">
            <div class="vital-row">
              <span id="run-level-badge" class="hud-level-badge">NV. ${String(hud.level).padStart(2, '0')}</span>
              <b id="run-xp-text">${hud.xp} / ${hud.xpToNext} XP</b>
            </div>
            <div class="hud-bar hud-bar--xp">
              <div id="run-xp-fill" class="hud-bar__fill" style="width:${xpPercent}%"></div>
            </div>
          </div>

          <div id="run-attack-slot">${this.renderAttackPanel(hud, run)}</div>

          <div class="run-skill-row ${hud.dashReady ? 'is-ready' : ''} ${hud.dashUnlocked ? '' : 'is-locked'}">
            <span>➤ ESQUIVA (SHIFT)</span>
            <b id="run-dash-text">${hud.dashUnlocked ? (hud.dashReady ? 'LISTA' : `${hud.dashCooldown.toFixed(1)} s`) : 'BLOQUEADA · SUBE NV.'}</b>
          </div>

          <div id="run-upgrades-strip" class="run-upgrades-strip">
            ${this.renderActiveUpgradesStrip(hud.activeUpgrades)}
          </div>
        </aside>

        <div id="run-mini-boss-banner" class="run-mini-boss-banner ${hud.miniBoss && !hud.boss ? 'is-visible' : ''}">
          ${this.renderMiniBossBanner(hud.miniBoss)}
        </div>

        <div id="run-boss-banner" class="run-boss-banner ${hud.boss ? 'is-visible' : ''}">
          ${this.renderBossBanner(hud.boss)}
        </div>

        <div class="run-hud__bottom">
          <span class="run-companion"><i style="--creature-color:${run.starter.color}"></i>${escapeHtml(run.starter.name)}${hud.eliteKills ? ` · <b>👑 ${hud.eliteKills} ÉLITE</b>` : ''}</span>
          <span class="run-control-line"><span><kbd>WASD</kbd> mover</span><span class="control-separator">·</span><span><kbd>Espacio</kbd> saltar/planear</span><span class="control-separator">·</span><span class="skill-control ${hud.specialAttack?.unlocked ? '' : 'is-locked'}"><kbd>Q</kbd> especial${hud.specialAttack?.unlocked ? '' : ' bloqueado'}</span><span class="control-separator">·</span><span class="skill-control ${hud.dashUnlocked ? '' : 'is-locked'}"><kbd>SHIFT</kbd> esquiva${hud.dashUnlocked ? '' : ' bloqueada'}</span></span>
          <button class="run-pause-text" data-action="pause-run">PAUSA <span>Ⅱ</span></button>
        </div>

        ${choices ? this.renderLevelUpModal(choices, hud.level, run.starter.name) : ''}

        ${this.paused && !choices ? `
          <div class="pause-backdrop">
            <section class="pause-dialog" role="dialog" aria-modal="true" aria-labelledby="pause-title">
              <span class="eyebrow">⏸️ PARTIDA EN PAUSA</span>
              <h2 id="pause-title">Descanso en el campamento</h2>
              <p>Ajusta la sensibilidad de cámara, continúa explorando o retírate al menú conservando tu botín.</p>
              ${this.renderSensitivityControl('pause')}
              <button class="button button--primary" data-action="resume-run">▶ Continuar Partida</button>
              <button class="button button--secondary pause-extract" data-action="extract-run">🎒 Retirarse con el botín</button>
              <button class="text-button pause-exit" data-action="return-hub">Volver al menú principal</button>
            </section>
          </div>
        ` : ''}
      </div>
    `;
  }

  renderActiveUpgradesStrip(activeUpgrades = []) {
    if (!Array.isArray(activeUpgrades) || activeUpgrades.length === 0) {
      return '<span class="upgrade-pill upgrade-pill--empty">Recoge gemas de XP o abre Cofres 3D</span>';
    }
    return activeUpgrades.map((upgrade) => `
      <span class="upgrade-pill" title="${escapeHtml(upgrade.name)}">
        <i>${escapeHtml(upgrade.icon)}</i>
        ${escapeHtml(upgrade.name)}
        <b>Nv.${upgrade.rank}</b>
      </span>
    `).join('');
  }

  renderMiniBossBanner(miniBoss) {
    if (!miniBoss) return '';
    const pct = Math.max(0, Math.min(100, Math.round((miniBoss.hp / Math.max(1, miniBoss.maxHp)) * 100)));
    return `
      <div class="boss-banner__row boss-banner__row--mini">
        <span>👑 POKÉMON CENTINELA · <strong>${escapeHtml(miniBoss.name)}</strong></span>
        <b>${miniBoss.hp} / ${miniBoss.maxHp} PS</b>
      </div>
      <div class="hud-bar hud-bar--miniboss">
        <div class="hud-bar__fill" style="width:${pct}%"></div>
      </div>
    `;
  }

  renderBossBanner(boss) {
    if (!boss) return '';
    const bossPct = Math.max(0, Math.min(100, Math.round((boss.hp / Math.max(1, boss.maxHp)) * 100)));
    return `
      <div class="boss-banner__row">
        <span>⚠️ JEFE LEGENDARIO · <strong>${escapeHtml(boss.name)}</strong></span>
        <b>${boss.hp} / ${boss.maxHp} PS</b>
      </div>
      <div class="hud-bar hud-bar--boss">
        <div class="hud-bar__fill" style="width:${bossPct}%"></div>
      </div>
    `;
  }

  renderLevelUpModal(choices, level, starterName) {
    return `
      <div class="levelup-backdrop">
        <section class="levelup-dialog" role="dialog" aria-modal="true" aria-labelledby="levelup-title">
          <header class="levelup-header">
            <span class="eyebrow">✨ ¡SUBIDA DE NIVEL! · NV. ${String(level).padStart(2, '0')}</span>
            <h2 id="levelup-title">¡Elige una recompensa para ${escapeHtml(starterName)}!</h2>
            <p>Haz clic en una carta o pulsa las teclas <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>.</p>
          </header>
          <div class="levelup-grid">
            ${choices.map((choice, index) => `
              <button
                type="button"
                class="levelup-card ${choice.unlockSkill ? 'levelup-card--unlock' : ''}"
                data-action="choose-run-upgrade"
                data-upgrade-id="${escapeHtml(choice.id)}"
              >
                <div class="levelup-card__top">
                  <span class="levelup-key">TECLA [${index + 1}] · ${escapeHtml(choice.category)}</span>
                  <span class="levelup-rank">NV. ${choice.currentRank} → ${choice.nextRank}/${choice.maxRank}</span>
                </div>
                <div class="levelup-card__icon">${escapeHtml(choice.icon)}</div>
                <h3>${escapeHtml(choice.name)}</h3>
                <p>${escapeHtml(choice.description)}</p>
                <span class="levelup-card__cta">${choice.unlockSkill ? '¡Desbloquear Movimiento!' : 'Elegir Mejora'} <span aria-hidden="true">▶</span></span>
              </button>
            `).join('')}
          </div>
          <div style="margin-top:1.1rem;display:flex;justify-content:center;">
            <button type="button" class="button button--secondary" data-action="reroll-run-upgrade" style="width:auto;" ${(this.hudState?.rerollsRemaining ?? 2) > 0 ? '' : 'disabled'}>
              🎲 Cambiar cartas (${this.hudState?.rerollsRemaining ?? 2} restantes)
            </button>
          </div>
        </section>
      </div>
    `;
  }

  renderResults() {
    const result = this.flow.lastRunSummary;
    if (!result) return this.renderHub();
    const region = REGIONS.find((entry) => entry.id === result.regionId);
    const kills = result.kills ?? 0;
    const level = result.level ?? 1;
    const orbs = result.orbsCollected ?? 0;

    return `
      <main class="focus-screen results-screen">
        <span class="eyebrow">🏁 RESUMEN DE EXPEDICIÓN · ${escapeHtml(region?.name ?? '')}</span>
        <h1>${result.victory ? '🏆 ¡Jefe Regional Derrotado!' : (result.extracted ? '🎒 ¡Retirada con Botín!' : '💫 Tu Pokémon cayó debilitado...')}</h1>
        <p>${result.victory ? '¡Victoria magistral!' : (result.extracted ? 'Regresaste al campamento con tus recursos' : 'La horda te rodeó')} · Tiempo: ${this.formatTime(result.elapsedSeconds)} · Derrotados: ${kills}${result.eliteKills ? ` (${result.eliteKills} con Corona Élite)` : ''} · Nivel NV. ${String(level).padStart(2, '0')} · ${orbs} gemas XP</p>
        <div class="results-grid">
          <div class="results-stat"><small>POKÉMONEDAS</small><b>+${result.rewards.coins} 🪙</b></div>
          <div class="results-stat"><small>TICKETS GACHA</small><b>+${result.rewards.tickets} 🎟️</b></div>
          <div class="results-stat"><small>GEMAS SHINY</small><b>+${result.rewards.gems} 💎</b></div>
        </div>
        ${result.unlockedRegionId ? `<p class="unlock-banner">🎉 ¡Nueva región desbloqueada: ${escapeHtml(REGIONS.find((entry) => entry.id === result.unlockedRegionId)?.name ?? result.unlockedRegionId)}!</p>` : ''}
        <div class="results-actions">
          <button class="button button--primary" data-action="back-to-hub">Volver al Menú Principal <span>▶</span></button>
          <button class="button button--secondary" data-action="results-upgrades">Ir a Mejoras <span>⬆️</span></button>
        </div>
      </main>
    `;
  }

  async handleClick(event) {
    const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!target || target.disabled) return;

    switch (target.dataset.action) {
      case 'tab':
        this.activeTab = target.dataset.tab ?? 'regions';
        this.render();
        break;
      case 'open-region':
        this.flow.selectRegion(target.dataset.regionId);
        this.render();
        break;
      case 'pick-starter':
        this.flow.chooseStarter(target.dataset.starterId);
        this.render();
        break;
      case 'select-companion': {
        const compId = target.dataset.companionId;
        if (compId && this.flow.profile.unlockedPokemon.includes(compId)) {
          this.selectedCompanionOverride = compId;
          this.render();
        }
        break;
      }
      case 'select-item': {
        const itemId = target.dataset.itemId;
        if (itemId && EQUIP_ITEMS[itemId]) {
          this.equippedItemId = itemId;
          this.render();
        }
        break;
      }
      case 'gacha-normal': {
        if (this.flow.profile.resources.tickets < 1) {
          this.showError('Necesitas 1 Ticket para tirar en el Gachapón Normal.');
          break;
        }
        this.flow.profile.resources.tickets -= 1;
        const reward = rollNormalGacha();
        const alreadyUnlocked = this.flow.profile.unlockedPokemon.includes(reward.id);
        if (!alreadyUnlocked) {
          this.flow.profile.unlockedPokemon.push(reward.id);
          this.lastGachaBanner = `🎉 ¡Nuevo Pokémon reclutado: ${reward.name} (${reward.rarityLabel ?? reward.rarity})!`;
        } else {
          this.flow.profile.resources.coins += 15;
          this.lastGachaBanner = `🔄 ${reward.name} repetido · Convertido en +15 Pokémonedas.`;
        }
        this.lastGachaCards = [reward];
        this.flow.store.save(this.flow.profile);
        this.render();
        break;
      }
      case 'gacha-ten': {
        if (this.flow.profile.resources.tickets < 10) {
          this.showError('Necesitas 10 Tickets para la tirada ×10.');
          break;
        }
        this.flow.profile.resources.tickets -= 10;
        const pulls = rollTenNormalGacha();
        let newCount = 0;
        let refundCoins = 0;
        for (const p of pulls) {
          if (!this.flow.profile.unlockedPokemon.includes(p.id)) {
            this.flow.profile.unlockedPokemon.push(p.id);
            newCount += 1;
          } else {
            refundCoins += 15;
          }
        }
        this.flow.profile.resources.coins += refundCoins;
        this.lastGachaCards = pulls;
        this.lastGachaBanner = `🎊 ¡Tirada ×10 completada! (${newCount} nuevos Pokémon, +${refundCoins} MON por duplicados)`;
        this.flow.store.save(this.flow.profile);
        this.render();
        break;
      }
      case 'gacha-shiny': {
        if (this.flow.profile.resources.gems < 3) {
          this.showError('Necesitas 3 Gemas para abrir el Gachapón Shiny.');
          break;
        }
        const shiny = rollShinyGacha(this.flow.profile.unlockedPokemon);
        if (!shiny) {
          this.showError('Recluta primero algún Pokémon del pool en el Gachapón Normal.');
          break;
        }
        this.flow.profile.resources.gems -= 3;
        this.lastGachaCards = [shiny];
        this.lastGachaBanner = `✨ ¡Aspecto SHINY Variocolor desbloqueado para ${shiny.name}!`;
        this.flow.store.save(this.flow.profile);
        this.render();
        break;
      }
      case 'reroll-run-upgrade':
        this.onRerollRunUpgrade?.();
        break;
      case 'enter-run': {
        const runConfig = this.flow.enterRun();
        if (!runConfig) {
          this.render();
          break;
        }
        if (this.selectedCompanionOverride && this.flow.profile.unlockedPokemon.includes(this.selectedCompanionOverride)) {
          const gachaComp = getGachaPokemon(this.selectedCompanionOverride);
          const starterComp = STARTERS.find((s) => s.id === this.selectedCompanionOverride);
          const chosenComp = gachaComp ?? starterComp;
          if (chosenComp) {
            runConfig.starter = {
              id: chosenComp.id,
              name: chosenComp.name,
              types: [...chosenComp.types],
              color: chosenComp.color,
              accent: chosenComp.accent,
              isLegendary: Boolean(chosenComp.isLegendary),
            };
          }
        }
        runConfig.equippedItemId = this.equippedItemId;
        runConfig.equippedItem = getEquippedItemModifiers(this.equippedItemId);
        this.paused = false;
        this.levelUpChoices = null;
        this.hudState = this.createDefaultHudState();
        this.render();
        try {
          await this.onStartRun(runConfig, this.mouseSensitivity);
        } catch (error) {
          this.flow.returnToHub();
          this.render();
          this.showError(`No se pudo iniciar WebGL: ${error.message}`);
        }
        break;
      }
      case 'buy-upgrade': {
        const result = this.flow.purchaseUpgrade(target.dataset.upgradeId);
        this.render();
        if (!result.ok) this.showError(result.reason === 'not-enough-coins' ? `Necesitas ${result.cost} monedas para esa mejora.` : 'Esa mejora ya está al máximo.');
        break;
      }
      case 'choose-run-upgrade': {
        const upgradeId = target.dataset.upgradeId;
        if (upgradeId) {
          this.onChooseRunUpgrade(upgradeId);
        }
        break;
      }
      case 'pause-run':
        if (this.levelUpChoices?.length) break;
        this.onSetPause(!this.paused);
        break;
      case 'resume-run':
        this.onSetPause(false);
        this.onResume();
        break;
      case 'extract-run':
        this.paused = false;
        this.levelUpChoices = null;
        this.onExtractRun();
        break;
      case 'results-upgrades':
        this.onReturnToHub();
        this.flow.returnToHub();
        this.activeTab = 'upgrades';
        this.paused = false;
        this.levelUpChoices = null;
        this.render();
        break;
      case 'return-hub':
      case 'back-to-hub':
        this.onReturnToHub();
        this.flow.returnToHub();
        this.activeTab = 'regions';
        this.paused = false;
        this.levelUpChoices = null;
        this.render();
        break;
      default:
        break;
    }
  }

  setPaused(paused) {
    this.paused = paused;
    if (this.flow.screen === 'run') this.render();
  }

  setLevelUpChoices(choices) {
    const normalized = Array.isArray(choices) && choices.length > 0 ? [...choices] : null;
    this.levelUpChoices = normalized;
    if (this.flow.screen === 'run') this.render();
  }

  finishRun(result) {
    this.paused = false;
    this.levelUpChoices = null;
    this.flow.completeRun(result);
    this.render();
  }

  updateHud(snapshot = {}) {
    this.hudState = {
      ...this.hudState,
      ...snapshot,
    };

    const clock = this.root.querySelector('#run-clock');
    if (clock) clock.textContent = this.formatTime(this.hudState.elapsedSeconds);

    const wave = this.root.querySelector('#run-wave');
    if (wave) wave.textContent = `OLEADA ${String(this.hudState.wave ?? 1).padStart(2, '0')}`;

    const kills = this.root.querySelector('#run-kills');
    if (kills) kills.textContent = String(this.hudState.kills ?? 0);

    const orbs = this.root.querySelector('#run-orbs');
    if (orbs) orbs.textContent = String(this.hudState.orbsCollected ?? 0);

    const hpText = this.root.querySelector('#run-hp-text');
    if (hpText) hpText.textContent = `${this.hudState.hp} / ${this.hudState.maxHp} PS`;

    const hpFill = this.root.querySelector('#run-hp-fill');
    const hpBar = this.root.querySelector('#run-hp-bar');
    if (hpFill) {
      const hpPct = Math.max(0, Math.min(100, Math.round((this.hudState.hp / Math.max(1, this.hudState.maxHp)) * 100)));
      hpFill.style.width = `${hpPct}%`;
      hpBar?.classList.toggle('is-critical', hpPct <= 30);
    }

    const levelBadge = this.root.querySelector('#run-level-badge');
    if (levelBadge) levelBadge.textContent = `NV. ${String(this.hudState.level ?? 1).padStart(2, '0')}`;

    const xpText = this.root.querySelector('#run-xp-text');
    if (xpText) xpText.textContent = `${this.hudState.xp} / ${this.hudState.xpToNext} XP`;

    const xpFill = this.root.querySelector('#run-xp-fill');
    const topXpFill = this.root.querySelector('#megabonk-top-xp-fill');
    if (xpFill || topXpFill) {
      const xpPct = Math.max(0, Math.min(100, Math.round((this.hudState.xp / Math.max(1, this.hudState.xpToNext)) * 100)));
      if (xpFill) xpFill.style.width = `${xpPct}%`;
      if (topXpFill) topXpFill.style.width = `${xpPct}%`;
    }

    const attackSlot = this.root.querySelector('#run-attack-slot');
    if (attackSlot && this.flow.activeRun) {
      attackSlot.innerHTML = this.renderAttackPanel(this.hudState, this.flow.activeRun);
    }

    const upgradesStrip = this.root.querySelector('#run-upgrades-strip');
    if (upgradesStrip) {
      upgradesStrip.innerHTML = this.renderActiveUpgradesStrip(this.hudState.activeUpgrades);
    }

    const dashText = this.root.querySelector('#run-dash-text');
    const dashRow = this.root.querySelector('.run-skill-row');
    if (dashText && dashRow) {
      dashText.textContent = !this.hudState.dashUnlocked
        ? 'BLOQUEADA · SUBE NV.'
        : this.hudState.dashReady
          ? 'LISTA'
          : `${(this.hudState.dashCooldown ?? 0).toFixed(1)} s`;
      dashRow.classList.toggle('is-ready', Boolean(this.hudState.dashReady));
      dashRow.classList.toggle('is-locked', !this.hudState.dashUnlocked);
    }

    const miniBossBanner = this.root.querySelector('#run-mini-boss-banner');
    if (miniBossBanner) {
      const showMini = Boolean(this.hudState.miniBoss) && !this.hudState.boss;
      miniBossBanner.classList.toggle('is-visible', showMini);
      miniBossBanner.innerHTML = this.renderMiniBossBanner(this.hudState.miniBoss);
    }

    const bossBanner = this.root.querySelector('#run-boss-banner');
    if (bossBanner) {
      bossBanner.classList.toggle('is-visible', Boolean(this.hudState.boss));
      bossBanner.innerHTML = this.renderBossBanner(this.hudState.boss);
    }
  }

  formatTime(seconds) {
    const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, '0');
    const remainder = (safeSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${remainder}`;
  }

  showError(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    this.root.appendChild(toast);
    window.setTimeout(() => toast.remove(), 4200);
  }

  dispose() {
    this.root.removeEventListener('click', this.handleClick);
    this.root.removeEventListener('input', this.handleInput);
  }
}
