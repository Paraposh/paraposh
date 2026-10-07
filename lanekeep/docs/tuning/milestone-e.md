# Milestone (e): hero and spells, what's tunable

## Spells (spells.json)
- `areaDamage` {cooldown, radius, damage, damageType, delay, hitsAir}: after `delay` seconds hits every enemy in `radius` with the same falloff as splash (`splashEdgeMult` at the rim). `hitsAir: false` skips flyers.
- `summonSoldiers` {cooldown, soldierId, count, lifetime}: spawns `count` soldiers around the target point. They guard the point, block and fight like barracks soldiers, and expire after `lifetime` seconds (no respawn).
- The level's `spells` list (levels/level-01.json) says which spells the player gets (`meteor`, `reinforcements`). Cooldowns are tracked per spell; the hero ability has its own (`hero:<spellId>`).

## Hero (heroes.json, levels `heroId` + `heroSpawn`)
- Click-to-move (`moveHero`). While moving it ignores enemies; on arrival it guards that spot and engages the furthest-along blockable enemy within `engageRadius` (flyers and `bypassBlockers` enemies are ignored), blocking it like a soldier. Idle hero regenerates `regenPerSec`.
- XP: the hero earns the enemy's `bounty` as XP only for enemies it kills itself or with its own ability. Player spells, towers and soldiers give it none, and summoned or split-off enemies give none.
- Levels: `levels[i]` describes level i + 2: `xpTotal` (cumulative), `hpMult`, `damageMult` on base stats. A level-up grants the extra max HP immediately. Level cap is `levels.length + 1`.
- Death: at 0 HP the hero is down for `reviveTime + reviveTimePerLevel * (level - 1)` seconds, then returns at `heroSpawn` with full HP. Orders are rejected while it is down.
- Ability (`heroAbility`): casts `ability.spellId` centred on the hero.

## Data knobs
| Knob | File |
|---|---|
| spell stats and cooldowns | spells.json |
| hero base stats, level table, revive times, ability | heroes.json |
| `militia` (reinforcement soldier) | soldiers.json |
| which spells and which hero a level uses, hero spawn | levels/level-01.json |

## Notes
- Hero stats and spell numbers are a first pass. The balance bot does not use spells or order the hero, but the hero guards `heroSpawn` near the road start, so level 1 is a little easier than in (d).
- Meta-progression upgrades (milestone g) will modify these stats; they are not wired yet.
