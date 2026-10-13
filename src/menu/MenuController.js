import { EQUIP_ITEMS, GACHA_POOL, TYPE_SYNERGIES, getEquippedItemModifiers, getGachaPokemon, rollNormalGacha, rollShinyGacha } from '../data/gddSystems.js';
import { getUpgradeCost, PERMANENT_UPGRADES, RARITY_RATES } from '../data/economy.js';
import { REGIONS, STARTERS } from '../data/regions.js';
import { getStarterMoveset, STAB_MULTIPLIER, DAMAGE_SCALE } from '../data/moves.js';
import { describeEffectiveness, getSuperEffectiveTargets, getTypeColor } from '../data/typeChart.js';
import { MOUSE_LOOK, normalizeSensitivity } from '../game/cameraRig.js';

const pad2 = (value) => String(value).padStart(2, '0');
const SHAPE_LABELS = { beam: 'Haz', cone: 'Abanico', burst: 'Área' };

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
    this.onExtractRun = onExtractRun;
    this.onMouseSensitivityChange = onMouseSensitivityChange;
    this.mouseSensitivity = this.loadMouseSensitivity();
    this.pointerLocked = false;
    this.activeTab = 'regions';
    this.paused = false;
    this.levelUpChoices = null;
    this.equippedItemId = 'restos';
    this.lastGachaBanner = null;
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
            <span class="brand-mark">PB</span>
            <span class="brand-wordmark"><strong>POKEBATTLE</strong><small>SURVIVOR · 3D FIELD TEST</small></span>
          </button>
          <nav class="main-nav" aria-label="Menú principal">
            ${this.navButton('regions', 'Regiones')}
            ${this.navButton('guide', 'Guía')}
            ${this.navButton('pokedex', 'Pokédex')}
            ${this.navButton('upgrades', 'Mejoras')}
            ${this.navButton('gacha', 'Gachapón')}
          </nav>
          <div class="wallet" aria-label="Recursos">
            <span class="wallet-chip"><i class="wallet-icon coin">◆</i>${resources.coins}<small>MON</small></span>
            <span class="wallet-chip"><i class="wallet-icon ticket">▤</i>${resources.tickets}<small>TIX</small></span>
            <span class="wallet-chip"><i class="wallet-icon gem">✦</i>${resources.gems}<small>GEM</small></span>
          </div>
        </header>
        <main class="hub-content">
          ${this.renderHubTab()}
          <footer class="hub-footer"><span>PROTOTIPO 0.5</span><span>Partida local · progreso guardado en este navegador</span></footer>
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
        <span class="eyebrow">GUÍA DE CAMPO · CONTROLES Y PROGRESIÓN</span>
        <h1>Cómo jugar</h1>
        <p>Supervive, recoge experiencia y decide cuándo invertir cada subida de nivel. Las habilidades nuevas no están activas desde el inicio: primero tendrás que desbloquearlas.</p>
      </section>
      <div class="guide-layout">
        <section class="guide-panel guide-panel--steps" aria-label="Controles y progreso">
          <article class="guide-step"><span>01</span><div><h2>Mueve y mira</h2><p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> se orientan según la cámara. Haz clic en la arena para capturar el ratón (Pointer Lock); muévelo para girar la cámara detrás del compañero. <kbd>Esc</kbd> libera el ratón y pausa.</p></div></article>
          <article class="guide-step"><span>02</span><div><h2>Empieza con lo básico</h2><p>El ataque básico de tu inicial se dispara automáticamente. El especial <kbd>Q</kbd> y la esquiva <kbd>Shift</kbd> empiezan bloqueados: no se activan hasta elegir su desbloqueo al subir de nivel.</p></div></article>
          <article class="guide-step"><span>03</span><div><h2>Elige una de tres</h2><p>Cada nivel pausa la partida y ofrece tres mejoras distintas. Mientras estén bloqueadas, Q y Shift aparecen marcados en el HUD y sus desbloqueos se incluyen entre las opciones. Luego podrás mejorar el daño, el alcance o el enfriamiento del especial y la distancia/enfriamiento de la esquiva.</p></div></article>
          <article class="guide-step"><span>04</span><div><h2>Lee los tipos</h2><p>El STAB aumenta el daño cuando el movimiento comparte tipo con el compañero. La Pokédex muestra los movimientos, su forma, alcance y cobertura potencial por región.</p></div></article>
        </section>
        <aside class="guide-panel guide-settings">
          <span class="eyebrow">AJUSTES DE CONTROL</span>
          <h2>Sensibilidad de cámara</h2>
          <p>Ajusta cuánto gira la cámara por cada movimiento del ratón. El cambio se aplica al instante y se guarda en este navegador.</p>
          ${this.renderSensitivityControl('guide')}
          <div class="guide-tip"><b>Consejo</b><span>Si la cámara no se mueve, haz clic en el campo para volver a capturar el ratón.</span></div>
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
      // Si el navegador bloquea almacenamiento, el ajuste sigue activo durante la sesión.
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

  renderRegions() {
    const unlockedCount = REGIONS.filter((region) => this.flow.isRegionUnlocked(region.id)).length;
    const lastRegion = REGIONS.find((region) => this.flow.isRegionUnlocked(region.id) && !this.flow.getRegionProgress(region.id).cleared);
    const suggestedRegion = lastRegion ?? REGIONS.find((region) => this.flow.isRegionUnlocked(region.id)) ?? REGIONS[0];
    const chosen = suggestedRegion && this.flow.getRegionProgress(suggestedRegion.id)?.starterId;
    const chosenStarter = chosen ? suggestedRegion.starters.find((starter) => starter.id === chosen) : null;

    return `
      <section class="welcome-row">
        <div class="welcome-copy">
          <span class="eyebrow"><span class="status-dot"></span> PROTOCOLO DE CAMPO · REGIÓN ${String(suggestedRegion.generation).padStart(2, '0')}</span>
          <h1>Elige tu región.<br /><em>Sobrevive a la horda.</em></h1>
          <p>Tu compañero ataca con los movimientos de su tipo contra las oleadas regionales, recoge orbes de experiencia y elige una de tres mejoras al subir de nivel.</p>
          <div class="welcome-actions">
            <button class="button button--primary" data-action="open-region" data-region-id="${suggestedRegion.id}">
              ${chosenStarter ? 'Continuar expedición' : 'Elegir inicial'} <span aria-hidden="true">↗</span>
            </button>
            <span class="micro-copy">${unlockedCount}/${REGIONS.length} regiones disponibles</span>
          </div>
        </div>
        <aside class="dispatch-card">
          <div class="dispatch-card__top"><span>PRÓXIMA EXPEDICIÓN</span><span class="dispatch-pulse">● EN ESPERA</span></div>
          <div class="dispatch-map" style="--map-a:${suggestedRegion.palette[0]};--map-b:${suggestedRegion.palette[1]}">
            <span class="map-cross map-cross--one"></span><span class="map-cross map-cross--two"></span>
            <span class="map-coordinate">${suggestedRegion.name.toUpperCase()} / ZONA 01</span>
            <span class="map-pin">⌖</span>
            <span class="map-contour map-contour--one"></span><span class="map-contour map-contour--two"></span>
          </div>
          <div class="dispatch-card__body">
            <div><small>ESCENARIO</small><strong>${escapeHtml(suggestedRegion.mapName)}</strong></div>
            <div><small>COMPAÑERO</small><strong>${chosenStarter ? escapeHtml(chosenStarter.name) : 'Aún por elegir'}</strong></div>
          </div>
          <div class="dispatch-card__boss"><span>OBJETIVO DE REGIÓN</span><strong>⚠ ${escapeHtml(suggestedRegion.boss)}</strong></div>
        </aside>
      </section>

      <section class="region-section">
        <div class="section-heading">
          <div><span class="eyebrow">RUTA DE PROGRESIÓN</span><h2>Regiones</h2></div>
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
    const stateLabel = !unlocked ? `BLOQUEADA · ${previous?.boss ?? region.unlockHint}` : progress.cleared ? 'REGIÓN SUPERADA' : 'DISPONIBLE';
    const actionLabel = !unlocked ? 'Bloqueada' : starter ? 'Entrar' : 'Elegir inicial';

    return `
      <article class="region-card ${unlocked ? '' : 'is-locked'} ${progress?.cleared ? 'is-cleared' : ''}" style="--region-a:${region.palette[0]};--region-b:${region.palette[1]}">
        <div class="region-card__visual">
          <span class="region-card__gen">GEN ${String(region.generation).padStart(2, '0')}</span>
          <span class="region-glyph" aria-hidden="true">${region.name.slice(0, 1)}</span>
          <span class="region-card__state">${escapeHtml(stateLabel)}</span>
        </div>
        <div class="region-card__body">
          <div class="region-card__title"><div><h3>${escapeHtml(region.name)}</h3><span>${escapeHtml(region.mapName)}</span></div>${progress?.cleared ? '<span class="clear-mark">✓</span>' : ''}</div>
          <div class="region-card__meta"><span>JEFE <b>${escapeHtml(region.boss)}</b></span><span>INICIAL <b>${starter ? escapeHtml(starter.name) : '—'}</b></span></div>
          <button class="button ${unlocked ? 'button--secondary' : 'button--locked'}" data-action="open-region" data-region-id="${region.id}" ${unlocked ? '' : 'disabled'}>${actionLabel}<span aria-hidden="true">${unlocked ? '→' : '⌑'}</span></button>
        </div>
      </article>
    `;
  }

  renderPokedex() {
    const starterIds = new Set(STARTERS.map((s) => s.id));
    const unlockedCount = this.flow.profile.unlockedPokemon.filter((id) => starterIds.has(id)).length;
    return `
      <section class="page-heading">
        <span class="eyebrow">ARCHIVO DE CAMPO · ${pad2(unlockedCount)} / ${pad2(STARTERS.length)} REGISTRADOS</span>
        <h1>Pokédex</h1>
        <p>El ataque <b>básico</b> se dispara solo. El <b>especial con Q</b> y la <b>esquiva con Shift</b> empiezan bloqueados y se desbloquean como opciones de nivel; sus estados también se muestran en el HUD. El tipo decide la eficacia y el STAB ×1,5 aplica cuando el movimiento coincide con el tipo del compañero.</p>
      </section>
      ${REGIONS.map((region) => this.renderPokedexRegion(region)).join('')}
    `;
  }

  renderPokedexRegion(region) {
    const cards = region.starters.map((starter) => this.renderDexCard(starter, region)).join('');
    return `
      <section class="dex-region">
        <div class="section-heading">
          <div><span class="eyebrow">GEN ${pad2(region.generation)} · ${escapeHtml(region.name.toUpperCase())}</span><h2>${escapeHtml(region.name)}</h2></div>
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
    const status = isStarter ? '★ INICIAL ELEGIDO' : unlocked ? 'REGISTRADO' : 'POR DESBLOQUEAR';

    return `
      <article class="dex-card ${unlocked ? 'is-unlocked' : 'is-unknown'}" style="--creature-color:${starter.color};--creature-accent:${starter.accent}">
        <div class="dex-card__art">
          <span class="dex-index">#${pad2(number).padStart(3, '0')}</span>
          <span class="creature-orb" aria-hidden="true"><i></i></span>
          ${unlocked ? '' : '<span class="dex-lock" aria-label="Sin registrar">⌑</span>'}
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
            ${coverage.length ? `<p class="dex-coverage"><span>Cobertura potencial (incluye el especial)</span> ${coverage.map((type) => this.typeChip(type)).join('')}</p>` : ''}
          ` : '<p class="dex-locked-note">Movimientos sin registrar. Elige este inicial en su región para verlos.</p>'}
          <span class="dex-status">${status}</span>
        </div>
      </article>
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

  /** Tipos defensores que reciben ×2 de al menos uno de los movimientos (sin repetir). */
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

  /** Estado del ataque para el HUD; si aún no hay datos de partida, usa la previsión del movimiento. */
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
    const moveset = run ? getStarterMoveset(run.starter.id) : null;
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
        <span class="eyebrow">PROGRESIÓN PERMANENTE · ${coins} MONEDAS</span>
        <h1>Mejoras</h1>
        <p>Gasta monedas de expedición en mejoras globales. Los rangos se conservan al cambiar de compañero.</p>
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
              <div class="upgrade-card__copy"><span class="eyebrow">RANGO ${String(level).padStart(2, '0')} / ${upgrade.maxLevel}</span><h3>${escapeHtml(upgrade.name)}</h3><p>${escapeHtml(upgrade.detail)}</p></div>
              <div class="upgrade-card__action"><div class="level-track" aria-label="Rango ${level} de ${upgrade.maxLevel}">${Array.from({ length: upgrade.maxLevel }, (_, slot) => `<i class="${slot < level ? 'is-filled' : ''}"></i>`).join('')}</div><button class="button button--secondary" data-action="buy-upgrade" data-upgrade-id="${upgrade.id}" ${canBuy ? '' : 'disabled'}>${maxed ? 'Rango máximo' : `Mejorar · ${cost} ◆`}</button></div>
            </article>
          `;
        }).join('')}
      </div>
      <p class="implementation-note"><span>i</span> Las mejoras permanentes se aplican directamente a tu vida máxima, velocidad, cadencia de ataques, imán de orbes y experiencia ganada en cada partida.</p>
    `;
  }

  renderGacha() {
    const { tickets, gems } = this.flow.profile.resources;
    return `
      <section class="page-heading page-heading--compact">
        <span class="eyebrow">RECLUTAMIENTO · ${tickets} TICKETS · ${gems} GEMAS</span>
        <h1>Gachapón</h1>
        <p>El gacha amplía tu Pokédex; no bloquea regiones ni vende poder. Las probabilidades son visibles antes de cada tirada.</p>
      </section>
      ${this.lastGachaBanner ? `<p class="unlock-banner" role="status">${escapeHtml(this.lastGachaBanner)}</p>` : ''}
      <div class="gacha-layout">
        <article class="gacha-panel gacha-panel--normal">
          <div class="gacha-panel__label">01 / GACHA NORMAL</div>
          <div class="gacha-illustration">✳</div>
          <h2>Encuentros regionales</h2>
          <p>Usa tickets ganados jugando y derrotando jefes para desbloquear nuevos Pokémon base.</p>
          <div class="rarity-list">${RARITY_RATES.map((rarity) => `<div class="rarity-row"><span><i style="--rarity-color:${rarity.color}"></i>${rarity.label}</span><b>${rarity.percent}%</b></div>`).join('')}</div>
          <button class="button button--primary" type="button" data-action="gacha-normal" ${tickets >= 1 ? '' : 'disabled'}>
            ${tickets >= 1 ? 'Tirar Gachapón · 1 ▤ Ticket' : 'Sin Tickets (1 ▤ requerido)'}
          </button>
        </article>
        <article class="gacha-panel gacha-panel--shiny">
          <div class="gacha-panel__label">02 / GACHA SHINY</div>
          <div class="gacha-illustration gacha-illustration--shiny">✦</div>
          <h2>Variocolor</h2>
          <p>Las gemas abren el Gachapón Exclusivo Shiny de Pokémon que ya hayas desbloqueado; posee el mismo sistema de rarezas.</p>
          <div class="shiny-note"><span>◆</span><div><b>Prestigio estético</b><small>Solo otorga la Skin Shiny de especies ya registradas en tu Pokédex.</small></div></div>
          <button class="button button--secondary" type="button" data-action="gacha-shiny" ${gems >= 3 ? '' : 'disabled'}>
            ${gems >= 3 ? 'Tirar Shiny · 3 ✦ Gemas' : 'Necesitas 3 ✦ Gemas'}
          </button>
        </article>
      </div>
    `;
  }

  renderStarterSelection() {
    const region = this.flow.selectedRegion;
    if (!region) return this.renderHub();
    return `
      <main class="focus-screen">
        <header class="focus-header"><button class="text-button" data-action="back-to-hub">← Volver al mapa</button><span class="focus-step">PASO 01 <i></i> 02</span></header>
        <section class="starter-intro"><span class="eyebrow">${escapeHtml(region.name.toUpperCase())} · PRIMERA EXPEDICIÓN</span><h1>Elige a tu<br /><em>compañero inicial.</em></h1><p>Esta elección gratuita se ofrece una sola vez al abrir una región. Comenzarás con el ataque básico automático; el especial y la esquiva se desbloquean al subir de nivel.</p></section>
        <section class="starter-grid" aria-label="Pokémon iniciales de ${escapeHtml(region.name)}">
          ${region.starters.map((starter, index) => `
            <article class="starter-card" style="--creature-color:${starter.color};--creature-accent:${starter.accent}">
              <div class="starter-card__number">0${index + 1} <span>· ${starter.types.map(escapeHtml).join(' / ')}</span></div>
              <div class="starter-card__art"><div class="starter-orb" aria-hidden="true"><i></i></div><span class="starter-orbit starter-orbit--one"></span><span class="starter-orbit starter-orbit--two"></span></div>
              <div class="starter-card__copy"><h2>${escapeHtml(starter.name)}</h2><p>${this.starterFlavour(starter)}</p>${this.renderStarterMoves(starter)}</div>
              <button class="button button--primary starter-pick" data-action="pick-starter" data-starter-id="${starter.id}">Elegir ${escapeHtml(starter.name)} <span aria-hidden="true">↗</span></button>
            </article>
          `).join('')}
        </section>
        <p class="focus-footnote">La selección se guarda automáticamente en este navegador. No necesitas una cuenta para probar el prototipo.</p>
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

    return `
      <main class="focus-screen region-ready-screen">
        <header class="focus-header"><button class="text-button" data-action="back-to-hub">← Volver al mapa</button><span class="focus-step">${escapeHtml(region.name.toUpperCase())} <i></i> EXPEDICIÓN</span></header>
        <section class="ready-layout">
          <div class="ready-copy"><span class="eyebrow"><span class="status-dot"></span> REGIÓN DISPONIBLE · GEN ${String(region.generation).padStart(2, '0')}</span><h1>${escapeHtml(region.mapName)}<br /><em>te espera.</em></h1><p>Sobrevive a las hordas de ${region.enemies.map(escapeHtml).join(' y ')}, usa los movimientos de ${escapeHtml(starter.name)}, absorbe orbes de XP y elige entre tres mejoras por nivel antes de enfrentarte a ${escapeHtml(region.boss)}.</p>
            <div class="ready-objectives"><div><small>ENEMIGOS DETECTADOS</small><b>${region.enemies.map(escapeHtml).join(' · ')}</b></div><div><small>JEFE DE REGIÓN</small><b class="boss-text">${escapeHtml(region.boss)}</b></div></div>
            <div class="ready-items" style="margin: 0.85rem 0;">
              <small style="display:block;margin-bottom:0.4rem;opacity:0.8;">OBJETO DE EQUIPO (GDD)</small>
              <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                ${Object.values(EQUIP_ITEMS).map((item) => `
                  <button type="button" class="button ${this.equippedItemId === item.id ? 'button--primary' : 'button--secondary'}" data-action="select-item" data-item-id="${item.id}" style="padding:0.4rem 0.75rem;font-size:0.82rem;">
                    ${escapeHtml(item.name)}
                  </button>
                `).join('')}
              </div>
              <small style="display:block;margin-top:0.35rem;color:#c5ee88;">${escapeHtml(getEquippedItemModifiers(this.equippedItemId).description)}</small>
            </div>
            <button class="button button--primary button--launch" data-action="enter-run">Entrar a la partida <span aria-hidden="true">↗</span></button>
            <p class="control-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> relativo a cámara <span>·</span> clic + ratón mirar <span>·</span> <kbd>Q</kbd>/<kbd>SHIFT</kbd> desbloqueables <span>·</span> <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> mejoras</p>
          </div>
          <aside class="partner-card" style="--creature-color:${starter.color};--creature-accent:${starter.accent}"><span class="eyebrow">COMPAÑERO DE ESTA REGIÓN</span><div class="partner-art"><div class="starter-orb" aria-hidden="true"><i></i></div></div><h2>${escapeHtml(starter.name)}</h2><div class="type-row">${starter.types.map((type) => `<span class="type-chip">${escapeHtml(type)}</span>`).join('')}</div><div class="partner-card__stat"><span>ATAQUE AUTOMÁTICO</span><b>${escapeHtml(getStarterMoveset(starter.id).basic.name)} <small>· ${escapeHtml(getStarterMoveset(starter.id).basic.type)} · ${SHAPE_LABELS[getStarterMoveset(starter.id).basic.shape] ?? 'Haz'}</small></b></div><div class="partner-card__stat"><span>ESPECIAL · Q · BLOQUEADO AL INICIO</span><b>${escapeHtml(getStarterMoveset(starter.id).special.name)} <small>· ${escapeHtml(getStarterMoveset(starter.id).special.type)} · se desbloquea con una mejora de nivel</small></b></div><div class="partner-card__stat"><span>ESQUIVA · SHIFT · BLOQUEADA AL INICIO</span><b>Impulso evasivo <small>· se desbloquea con una mejora de nivel</small></b></div><div class="partner-card__stat"><span>PROGRESIÓN EN PARTIDA</span><b>Orbes de XP <small>· elige 1 de 3 mejoras por nivel</small></b></div></aside>
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
        <header class="run-hud__top">
          <div class="run-location">
            <span class="run-emblem">${escapeHtml(run.regionName.slice(0, 1))}</span>
            <div>
              <small>${escapeHtml(run.regionName)} · <span id="run-wave">OLEADA ${String(hud.wave).padStart(2, '0')}</span></small>
              <b>${escapeHtml(run.mapName)}</b>
            </div>
          </div>
          <div class="run-metrics">
            <div class="run-timer"><small>TIEMPO</small><b id="run-clock">${this.formatTime(hud.elapsedSeconds)}</b></div>
            <div class="run-timer"><small>BAJAS</small><b id="run-kills">${hud.kills}</b></div>
            <div class="run-timer"><small>ORBES</small><b id="run-orbs">${hud.orbsCollected}</b></div>
          </div>
          <button class="hud-pause" data-action="pause-run" aria-label="Pausar partida">Ⅱ</button>
        </header>

        <div id="pointer-lock-hint" class="pointer-lock-hint ${this.pointerLocked ? '' : 'is-visible'}" role="status">Haz clic en la arena para capturar el ratón · Esc libera y pausa</div>

        <aside class="run-vitals" aria-label="Estado del compañero">
          <div class="vital-block">
            <div class="vital-row">
              <span class="vital-label">♥ VIDA</span>
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
          <span class="run-companion"><i style="--creature-color:${run.starter.color}"></i>${escapeHtml(run.starter.name)}${hud.eliteKills ? ` · <b>${hud.eliteKills} ÉLITE</b>` : ''}</span>
          <span class="run-control-line"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> mover según cámara</span><span class="control-separator">·</span><span class="skill-control ${hud.specialAttack?.unlocked ? '' : 'is-locked'}"><kbd>Q</kbd> especial${hud.specialAttack?.unlocked ? '' : ' bloqueado'}</span><span class="control-separator">·</span><span class="skill-control ${hud.dashUnlocked ? '' : 'is-locked'}"><kbd>SHIFT</kbd> esquiva${hud.dashUnlocked ? '' : ' bloqueada'}</span><span class="control-separator">·</span><span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> mejoras</span></span>
          <button class="run-pause-text" data-action="pause-run">PAUSA <span>Ⅱ</span></button>
        </div>

        ${choices ? this.renderLevelUpModal(choices, hud.level, run.starter.name) : ''}

        ${this.paused && !choices ? `
          <div class="pause-backdrop">
            <section class="pause-dialog" role="dialog" aria-modal="true" aria-labelledby="pause-title">
              <span class="eyebrow">PARTIDA EN PAUSA</span>
              <h2 id="pause-title">Toma aire.</h2>
              <p>La horda espera. Puedes continuar, ajustar la cámara, retirarte con el botín o volver al mapa.</p>
              ${this.renderSensitivityControl('pause')}
              <button class="button button--primary" data-action="resume-run">Volver a la partida <span>↗</span></button>
              <button class="button button--secondary pause-extract" data-action="extract-run">Retirarse con botín <span>→</span></button>
              <button class="text-button pause-exit" data-action="return-hub">Abandonar expedición</button>
            </section>
          </div>
        ` : ''}
      </div>
    `;
  }

  renderActiveUpgradesStrip(activeUpgrades = []) {
    if (!Array.isArray(activeUpgrades) || activeUpgrades.length === 0) {
      return '<span class="upgrade-pill upgrade-pill--empty">Recoge orbes de XP para elegir mejoras</span>';
    }
    return activeUpgrades.map((upgrade) => `
      <span class="upgrade-pill" title="${escapeHtml(upgrade.name)}">
        <i>${escapeHtml(upgrade.icon)}</i>
        ${escapeHtml(upgrade.name)}
        <b>N${upgrade.rank}</b>
      </span>
    `).join('');
  }

  renderMiniBossBanner(miniBoss) {
    if (!miniBoss) return '';
    const pct = Math.max(0, Math.min(100, Math.round((miniBoss.hp / Math.max(1, miniBoss.maxHp)) * 100)));
    return `
      <div class="boss-banner__row boss-banner__row--mini">
        <span>⌖ CENTINELA · <strong>${escapeHtml(miniBoss.name)}</strong></span>
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
        <span>⚠ JEFE REGIONAL · <strong>${escapeHtml(boss.name)}</strong></span>
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
            <span class="eyebrow"><span class="status-dot"></span> SUBIDA DE NIVEL · NV. ${String(level).padStart(2, '0')}</span>
            <h2 id="levelup-title">Elige una de tres mejoras.</h2>
            <p>Potencia a ${escapeHtml(starterName)} para resistir la siguiente oleada. Haz clic en una tarjeta o pulsa <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>.</p>
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
                  <span class="levelup-key">[${index + 1}] · ${escapeHtml(choice.category)}</span>
                  <span class="levelup-rank">RANGO ${choice.currentRank} → ${choice.nextRank}/${choice.maxRank}</span>
                </div>
                <div class="levelup-card__icon">${escapeHtml(choice.icon)}</div>
                <h3>${escapeHtml(choice.name)}</h3>
                <p>${escapeHtml(choice.description)}</p>
                <span class="levelup-card__cta">${choice.unlockSkill ? 'Desbloquear habilidad' : 'Elegir mejora'} <span aria-hidden="true">↗</span></span>
              </button>
            `).join('')}
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
        <span class="eyebrow">INFORME DE EXPEDICIÓN · ${escapeHtml(region?.name ?? '')}</span>
        <h1>${result.victory ? 'Región superada.' : (result.extracted ? 'Retirada exitosa.' : 'Expedición terminada.')}</h1>
        <p>${result.victory ? 'Victoria' : (result.extracted ? 'Has extraído al compañero con el botín parcial' : 'La horda ha superado al compañero')} · Tiempo de campo: ${this.formatTime(result.elapsedSeconds)} · Bajas: ${kills}${result.eliteKills ? ` (${result.eliteKills} de élite)` : ''} · Nivel NV. ${String(level).padStart(2, '0')} · ${orbs} orbes XP${result.miniBossDefeated ? ' · Centinela abatido' : ''}</p>
        <div class="results-grid">
          <div class="results-stat"><small>MONEDAS GANADAS</small><b>+${result.rewards.coins} ◆</b></div>
          <div class="results-stat"><small>TICKETS DE RECLUTAMIENTO</small><b>+${result.rewards.tickets} ▤</b></div>
          <div class="results-stat"><small>GEMAS VARIOCOLOR</small><b>+${result.rewards.gems} ✦</b></div>
        </div>
        ${result.unlockedRegionId ? `<p class="unlock-banner">Nueva región disponible: ${escapeHtml(REGIONS.find((entry) => entry.id === result.unlockedRegionId)?.name ?? result.unlockedRegionId)}</p>` : ''}
        <div class="results-actions">
          <button class="button button--primary" data-action="back-to-hub">Volver al mapa <span>↗</span></button>
          <button class="button button--secondary" data-action="results-upgrades">Invertir monedas en Mejoras <span>→</span></button>
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
          this.lastGachaBanner = `¡Nuevo Pokémon reclutado: ${reward.name} (${reward.rarity.toUpperCase()})!`;
        } else {
          this.flow.profile.resources.coins += 15;
          this.lastGachaBanner = `${reward.name} repetido · Convertido en +15 Monedas.`;
        }
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
        this.lastGachaBanner = `✨ ¡Aspecto SHINY Variocolor desbloqueado para ${shiny.name}!`;
        this.flow.store.save(this.flow.profile);
        this.render();
        break;
      }
      case 'enter-run': {
        const runConfig = this.flow.enterRun();
        if (!runConfig) {
          this.render();
          break;
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
    if (xpFill) {
      const xpPct = Math.max(0, Math.min(100, Math.round((this.hudState.xp / Math.max(1, this.hudState.xpToNext)) * 100)));
      xpFill.style.width = `${xpPct}%`;
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
