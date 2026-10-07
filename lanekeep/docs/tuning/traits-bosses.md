# Enemy traits and boss phases, what's tunable

Not part of the (a) to (g) list; added after (d) because the brief called for them.

## Traits (enemies.json, `traits[]`, each validated by type)
| Trait | Fields | Behaviour |
|---|---|---|
| `healsAllies` | radius, hpPerSec | Heals every other enemy in radius each tick, capped at max HP. Not itself. |
| `summons` | enemyId, count, interval | Every `interval` seconds spawns `count` enemies just behind the summoner. |
| `splitsOnDeath` | enemyId, count | Spawns `count` enemies at the death position. |
| `ranged` | range, damage, damageType, cooldown | Shoots the nearest soldier in range while still walking. Uses the soldier's armor/resist. |
| `enrage` | hpThreshold, speedMult, damageMult | Once, when HP fraction drops to the threshold. |
| `bypassBlockers` | none | Walks through soldiers (milestone c). |

"Stops to fight blockers" is the default for every blockable ground enemy, so there is no separate trait: `bypassBlockers` (and flying) opt out of it.
Summoned and split-off enemies pay **no bounty** (`spawned` flag), so they can't be farmed.

## Bosses (waves file, `bosses{}` + a group with `bossId`)
- A boss is an ordinary enemy (`enemyId`, with its stats in enemies.json) plus a phase script.
- A phase is active while HP fraction is above its `hpAbove`; `hpAbove` must strictly decrease across phases (validated). Phases only move forward, even if the boss heals.
- `onEnter` actions: `summon {enemyId,count}`, `enrage {speedMult,damageMult}`. Phase modifiers while active: `speedMult`, `armorDelta`, `magicResistDelta` (added to the boss's resist; negative lowers it).

## Level 1 content
Wave 2 adds a goblin shaman, wave 4 two goblin archers, wave 5 an ogre and a brood mother, and a new wave 6 is the Warlord boss (3 phases: plain, summons plus 25% faster, then enrage plus lower armor plus archers). Wave 5's goblin/brute/bat counts were trimmed to keep level 1 winnable by the bot on seeds 1 to 5 (`tests/balance.test.ts`).
