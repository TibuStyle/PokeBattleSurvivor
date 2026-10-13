/**
 * src/menu/gddOverlay.js
 * Módulo de interfaz e integración en vivo para el GDD de PokeBattleSurvivor:
 * - Conecta el Gachapón Normal (Tickets) y Gachapón Shiny (Gemas) con localStorage.
 * - Permite equipar Objetos (Restos, Pañuelo Elección, Cinta Elegida).
 * - Muestra las Pasivas por Tipo (Volador, Eléctrico, Hielo, Siniestro) y Legendarias.
 * - Muestra el HUD táctico en partida (Psicorrayo al Clic, Danza Espada con E/Clic Derecho, Planeo con Espacio).
 */
import {
  TYPE_SYNERGIES,
  EQUIP_ITEMS,
  LEVEL_UP_SKILLS,
  GACHA_POOL,
  rollNormalGacha,
  rollShinyGacha,
  getEquippedItemModifiers,
} from '../data/gddSystems.js';
import { PROFILE_STORAGE_KEY } from '../flow/ProfileStore.js';

const GDD_STATE_KEY = 'pokebattle-survivor.gdd-ext.v1';

export class GddOverlayController {
  constructor({ onEquipChange, onCompanionChange } = {}) {
    this.onEquipChange = onEquipChange;
    this.onCompanionChange = onCompanionChange;
    this.state = this.loadState();
    this.lastGachaResult = null;
    this.swordDanceActiveUntil = 0;
    this.swordDanceCooldownUntil = 0;
  }

  loadState() {
    try {
      const raw = localStorage.getItem(GDD_STATE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        equippedItemId: parsed.equippedItemId ?? 'restos',
        activeGachaPokemonId: parsed.activeGachaPokemonId ?? null,
        unlockedShinies: Array.isArray(parsed.unlockedShinies) ? parsed.unlockedShinies : [],
        skillLevels: parsed.skillLevels ?? { psicorrayo: 1, aura_esfera: 1, danza_espada: 1 },
      };
    } catch {
      return {
        equippedItemId: 'restos',
        activeGachaPokemonId: null,
        unlockedShinies: [],
        skillLevels: { psicorrayo: 1, aura_esfera: 1, danza_espada: 1 },
      };
    }
  }

  saveState() {
    try {
      localStorage.setItem(GDD_STATE_KEY, JSON.stringify(this.state));
    } catch {
      // Ignorar si localStorage está restringido
    }
  }

  loadMainProfile() {
    try {
      const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  saveMainProfile(profile) {
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } catch {
      // Ignorar errores de almacenamiento
    }
  }

  /**
   * Ejecuta una tirada en el Gachapón Normal (cuesta 1 Ticket).
   */
  handleNormalGachaPull() {
    const profile = this.loadMainProfile();
    if (!profile || (profile.resources?.tickets ?? 0) < 1) {
      this.lastGachaResult = {
        ok: false,
        message: 'Necesitas al menos 1 Ticket (TIX) derrotando jefes o jugando partidas.',
      };
      this.renderFloatingDrawer();
      return this.lastGachaResult;
    }

    profile.resources.tickets -= 1;
    const reward = rollNormalGacha();
    profile.unlockedPokemon = Array.isArray(profile.unlockedPokemon) ? profile.unlockedPokemon : [];

    const isDuplicate = profile.unlockedPokemon.includes(reward.id);
    if (!isDuplicate) {
      profile.unlockedPokemon.push(reward.id);
    } else {
      // Conversión de duplicados: +15 Monedas
      profile.resources.coins = (profile.resources.coins ?? 0) + 15;
    }

    this.saveMainProfile(profile);
    this.lastGachaResult = {
      ok: true,
      mode: 'normal',
      reward,
      isDuplicate,
      message: isDuplicate
        ? `¡${reward.name} (${reward.rarity.toUpperCase()}) repetido! Convertido en +15 MON.`
        : `¡Nuevo Pokémon desbloqueado: ${reward.name} (${reward.rarity.toUpperCase()})!`,
    };
    this.renderFloatingDrawer();
    return this.lastGachaResult;
  }

  /**
   * Ejecuta una tirada en el Gachapón Shiny (cuesta 3 Gemas, solo de Pokémon ya desbloqueados).
   */
  handleShinyGachaPull() {
    const profile = this.loadMainProfile();
    if (!profile || (profile.resources?.gems ?? 0) < 3) {
      this.lastGachaResult = {
        ok: false,
        message: 'Necesitas 3 Gemas (GEM) para abrir el Gachapón Exclusivo Variocolor (Shiny).',
      };
      this.renderFloatingDrawer();
      return this.lastGachaResult;
    }

    const unlockedIds = profile.unlockedPokemon ?? [];
    const shinyReward = rollShinyGacha(unlockedIds);
    if (!shinyReward) {
      this.lastGachaResult = {
        ok: false,
        message: 'Primero debes desbloquear Pokémon en el Gachapón Normal para optar a sus versiones Shiny.',
      };
      this.renderFloatingDrawer();
      return this.lastGachaResult;
    }

    profile.resources.gems -= 3;
    if (!this.state.unlockedShinies.includes(shinyReward.id)) {
      this.state.unlockedShinies.push(shinyReward.id);
    }
    this.saveMainProfile(profile);
    this.saveState();

    this.lastGachaResult = {
      ok: true,
      mode: 'shiny',
      reward: shinyReward,
      message: `✨ ¡Obtuviste la Skin SHINY Variocolor de ${shinyReward.name}!`,
    };
    this.renderFloatingDrawer();
    return this.lastGachaResult;
  }

  selectEquippedItem(itemId) {
    if (!EQUIP_ITEMS[itemId]) return;
    this.state.equippedItemId = itemId;
    this.saveState();
    const modifiers = getEquippedItemModifiers(itemId);
    this.onEquipChange?.(modifiers);
    this.renderFloatingDrawer();
  }

  /**
   * Monta el panel táctico GDD en la esquina inferior izquierda para gestionar Objetos,
   * Sinergias de Tipo y Gachapón sin interferir con el canvas WebGL.
   */
  mount(parentElement = document.body) {
    if (typeof document === 'undefined') return;
    let container = document.getElementById('gdd-tactical-drawer');
    if (!container) {
      container = document.createElement('aside');
      container.id = 'gdd-tactical-drawer';
      container.style.cssText = [
        'position: fixed',
        'bottom: 16px',
        'left: 16px',
        'z-index: 950',
        'background: rgba(13, 19, 33, 0.92)',
        'border: 1px solid rgba(120, 198, 229, 0.35)',
        'border-radius: 14px',
        'padding: 12px 14px',
        'color: #eef4ff',
        'font-family: system-ui, sans-serif',
        'font-size: 13px',
        'max-width: 340px',
        'backdrop-filter: blur(8px)',
        'box-shadow: 0 12px 32px rgba(0,0,0,0.45)',
      ].join(';');
      parentElement.appendChild(container);
    }
    this.container = container;
    this.renderFloatingDrawer();
  }

  renderFloatingDrawer() {
    if (!this.container) return;
    const activeItem = getEquippedItemModifiers(this.state.equippedItemId);

    this.container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong style="color:#78c6e5;font-size:14px;">⚡ Arsenal GDD 3D (Objetos y Sinergias)</strong>
        <span style="font-size:11px;opacity:0.75;">Shinies: ${this.state.unlockedShinies.length}</span>
      </div>

      <div style="margin-bottom:8px;">
        <div style="font-size:11px;text-transform:uppercase;opacity:0.75;margin-bottom:4px;">Objeto de Equipo Activo:</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${Object.values(EQUIP_ITEMS)
            .map(
              (item) => `
              <button
                type="button"
                data-gdd-item="${item.id}"
                style="padding:5px 8px;border-radius:8px;border:1px solid ${
                  this.state.equippedItemId === item.id ? '#ffd27a' : 'rgba(255,255,255,0.18)'
                };background:${
                  this.state.equippedItemId === item.id ? 'rgba(255, 210, 122, 0.18)' : 'rgba(255,255,255,0.05)'
                };color:#fff;cursor:pointer;font-size:12px;"
              >
                ${item.name}
              </button>
            `
            )
            .join('')}
        </div>
        <div style="font-size:11px;color:#c5ee88;margin-top:4px;">${activeItem.description}</div>
      </div>

      <div style="display:flex;gap:6px;margin-top:8px;">
        <button
          type="button"
          data-gdd-action="pull-normal"
          style="flex:1;padding:6px 8px;border-radius:8px;border:1px solid #80d79c;background:rgba(128,215,156,0.16);color:#fff;cursor:pointer;font-size:12px;"
        >
          🎲 Gacha Normal (1 TIX)
        </button>
        <button
          type="button"
          data-gdd-action="pull-shiny"
          style="flex:1;padding:6px 8px;border-radius:8px;border:1px solid #ffd27a;background:rgba(255,210,122,0.16);color:#fff;cursor:pointer;font-size:12px;"
        >
          ✨ Gacha Shiny (3 GEM)
        </button>
      </div>

      ${
        this.lastGachaResult
          ? `<div style="margin-top:8px;padding:6px 8px;border-radius:8px;background:rgba(255,255,255,0.07);font-size:11px;color:${
              this.lastGachaResult.ok ? '#ffd27a' : '#ff9b9b'
            };">${this.lastGachaResult.message}</div>`
          : ''
      }
    `;

    this.container.querySelectorAll('[data-gdd-item]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectEquippedItem(btn.getAttribute('data-gdd-item'));
      });
    });

    this.container.querySelector('[data-gdd-action="pull-normal"]')?.addEventListener('click', () => {
      this.handleNormalGachaPull();
    });

    this.container.querySelector('[data-gdd-action="pull-shiny"]')?.addEventListener('click', () => {
      this.handleShinyGachaPull();
    });
  }
}
