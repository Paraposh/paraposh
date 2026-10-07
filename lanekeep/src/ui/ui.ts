import type { Campaign } from '../game/campaign';
import { isUnlocked, type StarMap } from '../game/campaign';
import type { LevelResult } from '../game/flow';
import type { Sim } from '../sim/sim';
import { buyBlock, rankOf, starsAvailable, type MetaRanks, type MetaTree } from '../meta/meta';
import type { Progress } from '../game/progress';
import { buildOptions, heroModel, hudModel, spellButtons, towerPanel } from './viewModels';

export interface UiCallbacks {
  onPlay(): void;
  onSelectLevel(id: string): void;
  onBackToMenu(): void;
  onRetry(): void;
  onContinue(): void;
  onQuitLevel(): void;
  onBuild(spotId: string, towerId: string): void;
  onUpgrade(towerId: number): void;
  onSpecialize(towerId: number, specId: string): void;
  onSell(towerId: number): void;
  onCallWave(): void;
  onSpeed(speed: number): void;
  onSpell(key: string, needsTarget: boolean): void;
  onMute(muted: boolean): void;
  onOpenUpgrades(): void;
  onCloseUpgrades(): void;
  onBuyUpgrade(id: string): void;
  onRespec(): void;
  onResetSave(): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const starRow = (n: number, of = 3) => '★'.repeat(n) + '☆'.repeat(Math.max(0, of - n));

/** DOM overlay for menus and HUD. Rebuilds a panel only when its model text changes. */
export class Ui {
  private readonly root: HTMLElement;
  private readonly cache = new Map<string, string>();
  private popup: { kind: 'build'; spotId: string } | { kind: 'tower'; towerId: number } | null = null;
  armedSpell: string | null = null;
  /** First click on Reset progress arms it; a second click confirms. */
  confirmReset = false;
  speed = 1;
  muted = false;

  constructor(
    root: HTMLElement,
    private readonly cb: UiCallbacks,
  ) {
    this.root = root;
    root.addEventListener('click', (ev) => {
      const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!el || el.hasAttribute('disabled')) return;
      this.act(el.dataset.act!, el.dataset);
    });
  }

  private act(act: string, d: DOMStringMap): void {
    const cb = this.cb;
    switch (act) {
      case 'play': return cb.onPlay();
      case 'level': return cb.onSelectLevel(d.id!);
      case 'menu': return cb.onBackToMenu();
      case 'retry': return cb.onRetry();
      case 'continue': return cb.onContinue();
      case 'quit': return cb.onQuitLevel();
      case 'build': return cb.onBuild(d.spot!, d.tower!);
      case 'upgrade': return cb.onUpgrade(Number(d.tid));
      case 'spec': return cb.onSpecialize(Number(d.tid), d.spec!);
      case 'sell': return cb.onSell(Number(d.tid));
      case 'call': return cb.onCallWave();
      case 'speed': return cb.onSpeed(Number(d.speed));
      case 'spell': return cb.onSpell(d.key!, d.needs === '1');
      case 'mute': this.muted = !this.muted; return cb.onMute(this.muted);
      case 'upgrades': return cb.onOpenUpgrades();
      case 'closeupgrades': return cb.onCloseUpgrades();
      case 'buyup': return cb.onBuyUpgrade(d.id!);
      case 'respec': return cb.onRespec();
      case 'resetsave': return cb.onResetSave();
      case 'closepopup': this.popup = null; return;
    }
  }

  private set(id: string, html: string, parentClass = ''): void {
    let el = this.root.querySelector<HTMLElement>(`#${id}`);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      this.root.appendChild(el);
    }
    if (parentClass && el.className !== parentClass) el.className = parentClass;
    el.style.display = html === '' ? 'none' : '';
    if (this.cache.get(id) === html) return;
    this.cache.set(id, html);
    el.innerHTML = html;
  }

  private hide(...ids: string[]): void {
    for (const id of ids) this.set(id, '');
  }

  showBuildPopup(spotId: string): void {
    this.popup = { kind: 'build', spotId };
  }
  showTowerPopup(towerId: number): void {
    this.popup = { kind: 'tower', towerId };
  }
  closePopup(): void {
    this.popup = null;
  }
  get selectedTowerId(): number | null {
    return this.popup?.kind === 'tower' ? this.popup.towerId : null;
  }

  menu(): void {
    this.hide('map', 'hud', 'popup', 'spells', 'hero', 'results', 'upgrades');
    this.set('menu', `<div class="card center"><h1>Lanekeep</h1><p class="sub">Hold the lanes. Hold the keep.</p><button data-act="play" class="big">Play</button><button data-act="mute" class="ghost">${this.muted ? 'Sound: off' : 'Sound: on'}</button><button data-act="resetsave" class="ghost">${this.confirmReset ? 'Click again to erase progress' : 'Reset progress'}</button></div>`, 'screen');
  }

  map(campaign: Campaign, stars: StarMap, avail = 0): void {
    this.hide('menu', 'hud', 'popup', 'spells', 'hero', 'results', 'upgrades');
    const nodes = campaign.levels
      .map((l) => {
        const open = isUnlocked(campaign, l.id, stars);
        const got = stars[l.id] ?? 0;
        return `<button class="node ${open ? '' : 'locked'}" ${open ? '' : 'disabled'} data-act="level" data-id="${esc(l.id)}" style="left:${l.mapPos[0] * 100}%;top:${l.mapPos[1] * 100}%"><b>${esc(l.name)}</b><span class="stars">${open ? starRow(got) : 'Locked'}</span></button>`;
      })
      .join('');
    const total = Object.values(stars).reduce((a, b) => a + b, 0);
    this.set('map', `<div class="mapview"><div class="maptitle">Campaign map <span class="stars">★ ${total}</span></div>${nodes}<button data-act="menu" class="ghost back">Back</button><button data-act="upgrades" class="upbtn">Upgrades${avail > 0 ? ` <span class="stars">★${avail}</span>` : ''}</button></div>`, 'screen');
  }

  upgrades(tree: MetaTree, progress: Progress, ranks: MetaRanks): void {
    this.hide('menu', 'map', 'hud', 'popup', 'spells', 'hero', 'results');
    const branches = [...new Set(tree.upgrades.map((u) => u.branch))];
    const cols = branches
      .map((b) => {
        const items = tree.upgrades
          .filter((u) => u.branch === b)
          .map((u) => {
            const rank = rankOf(ranks, u.id);
            const block = buyBlock(tree, progress, ranks, u.id);
            const label = block === 'maxed' ? 'Max' : block === 'locked' ? 'Locked' : `${u.costs[rank]}★`;
            return `<button class="up" data-act="buyup" data-id="${esc(u.id)}" ${block ? 'disabled' : ''}><b>${esc(u.name)}</b><span class="stars">${'●'.repeat(rank)}${'○'.repeat(u.maxRank - rank)}</span><small>${esc(u.description)}</small><small>${label}${u.requires && block === 'locked' ? ` · needs ${esc(tree.upgrades.find((x) => x.id === u.requires!.id)?.name ?? '')} ${u.requires.rank}` : ''}</small></button>`;
          })
          .join('');
        return `<div class="branch"><h3>${esc(b)}</h3>${items}</div>`;
      })
      .join('');
    this.set('upgrades', `<div class="card"><h2>Upgrades <span class="stars">★ ${starsAvailable(tree, progress, ranks)} to spend</span></h2><div class="branches">${cols}</div><div class="row"><button data-act="respec" class="ghost">Refund all</button><button data-act="closeupgrades" class="big">Done</button></div></div>`, 'screen');
  }

  results(r: LevelResult, name: string, newStars: number, hasNext: boolean): void {
    this.hide('hud', 'popup', 'spells', 'hero');
    const title = r.won ? 'Victory' : 'Defeat';
    const sub = r.won ? `${r.livesLeft} lives left${newStars > 0 ? ` · +${newStars} new star${newStars > 1 ? 's' : ''}` : ''}` : 'The lane was overrun.';
    this.set('results', `<div class="card center ${r.won ? 'win' : 'lose'}"><h2>${title}</h2><p class="sub">${esc(name)}</p><div class="bigstars">${r.won ? starRow(r.stars) : '☆☆☆'}</div><p>${sub}</p><div class="row"><button data-act="retry">Retry</button><button data-act="continue" class="big">${r.won && hasNext ? 'Next' : 'Map'}</button></div></div>`, 'screen');
  }

  /** Per-frame HUD refresh while a level runs. */
  level(sim: Sim): void {
    this.hide('menu', 'map', 'results');
    const h = hudModel(sim);
    const speedBtn = (s: number, label: string) => `<button data-act="speed" data-speed="${s}" class="${this.speed === s ? 'on' : ''}">${label}</button>`;
    const call = h.canCallWave ? `<button data-act="call" class="call">Call wave early${h.callBonus > 0 ? ` +${h.callBonus}g` : ''}</button>` : '';
    this.set(
      'hud',
      `<div class="pill">🪙 ${h.gold}</div><div class="pill ${h.lives <= 5 ? 'danger' : ''}">❤ ${h.lives}</div><div class="pill wide">${h.waveText}</div>${call}<span class="grow"></span>${speedBtn(0, '❚❚')}${speedBtn(1, '1x')}${speedBtn(2, '2x')}<button data-act="mute" class="ghost">${this.muted ? '🔇' : '🔊'}</button><button data-act="quit" class="ghost">Quit</button>`,
      'bar',
    );
    this.set(
      'spells',
      spellButtons(sim)
        .map((b) => `<button data-act="spell" data-key="${esc(b.key)}" data-needs="${b.needsTarget ? 1 : 0}" ${b.enabled ? '' : 'disabled'} class="spell ${this.armedSpell === b.key ? 'armed' : ''}"><span class="cd" style="height:${Math.round(b.cooldownFraction * 100)}%"></span><b>${esc(b.label)}</b><i>${b.ready ? b.hotkey : `${b.secondsLeft}s`}</i></button>`)
        .join(''),
      'dock',
    );
    const hero = heroModel(sim);
    this.set(
      'hero',
      hero
        ? `<b>${esc(hero.name)}</b> Lv ${hero.level}<div class="meter"><span style="width:${hero.down ? 0 : Math.round((hero.hp / hero.maxHp) * 100)}%"></span></div>${hero.down ? `<small>Down · back in ${hero.reviveSeconds}s</small>` : `<small>${hero.hp}/${hero.maxHp} HP${hero.xpToNext !== null ? ` · XP ${hero.xp}/${hero.xpToNext}` : ' · max level'}</small>`}`
        : '',
      'herobox',
    );
    this.renderPopup(sim);
  }

  private renderPopup(sim: Sim): void {
    const p = this.popup;
    if (!p) return this.hide('popup');
    if (p.kind === 'build') {
      const spot = sim.data.level.buildSpots.find((s) => s.id === p.spotId);
      const opts = buildOptions(sim, p.spotId);
      if (!spot || opts.length === 0) return (this.popup = null), this.hide('popup');
      const items = opts.map((o) => `<button data-act="build" data-spot="${esc(p.spotId)}" data-tower="${esc(o.towerId)}" ${o.affordable ? '' : 'disabled'}>${esc(o.name)}<small>${o.cost}g</small></button>`).join('');
      return this.place('popup', `<div class="menu">${items}</div>`, spot.x, spot.y, sim);
    }
    const panel = towerPanel(sim, p.towerId);
    const tower = sim.towers.get(p.towerId);
    if (!panel || !tower) return (this.popup = null), this.hide('popup');
    const acts = panel.actions
      .map((a) => {
        if (a.kind === 'upgrade') return `<button data-act="upgrade" data-tid="${p.towerId}" ${a.enabled ? '' : 'disabled'}>${esc(a.label)}<small>${a.cost}g</small></button>`;
        if (a.kind === 'specialize') return `<button data-act="spec" data-tid="${p.towerId}" data-spec="${esc(a.specId)}" ${a.enabled ? '' : 'disabled'}>${esc(a.label)}<small>${a.cost}g</small></button>`;
        return `<button data-act="sell" data-tid="${p.towerId}" class="sell">Sell<small>+${a.refund}g</small></button>`;
      })
      .join('');
    this.place('popup', `<div class="tip"><b>${esc(panel.title)}</b>${panel.stats.map((s) => `<div>${esc(s)}</div>`).join('')}</div><div class="menu">${acts}</div>`, tower.x, tower.y, sim);
  }

  private place(id: string, html: string, wx: number, wy: number, sim: Sim): void {
    const { width, height } = sim.data.level.world;
    const above = wy > height * 0.55;
    this.set(id, `<div class="pop ${above ? 'up' : 'down'}" style="left:${(wx / width) * 100}%;top:${(wy / height) * 100}%">${html}</div>`, 'popwrap');
  }
}
