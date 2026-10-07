# Milestone (c): barracks + soldier AI, what's tunable

## Rules as built
- A barracks has `soldierCount` slots. Each slot holds one soldier; an empty slot refills after the tier's `respawn` seconds. Soldiers spawn at the tower and walk to formation spots around the rally point.
- Rally point: defaults to the nearest point on any path if within `rallyRange`, otherwise just below the tower. `setRally` moves it and clamps it to `rallyRange`.
- Acquire: a free soldier picks an enemy within `engageRadius` of the **rally point** (keeps it until the enemy is 1.5x that far away). Among candidates it takes the one furthest along the path.
- Contact: once within `reach`, the soldier is in contact. The enemy stops while any soldier is in contact and swings at the first soldier that touched it, if the enemy has a `melee` block. Enemies without `melee` still stop but do not hit back.
- Up to `maxSoldiersPerEnemy` soldiers (default 2) may target one enemy; extra soldiers pick other enemies.
- Flyers and enemies with the `bypassBlockers` trait cannot be blocked (`cave_bat`, `arcane_wisp`).
- Idle soldiers regenerate `regenPerSec`. Soldier/enemy melee damage uses the same `dmg * (1 - resist)` formula. Soldier kills pay the enemy's bounty.

## Data knobs
| Knob | File |
|---|---|
| `soldierCount`, `rallyRange`, `respawn`, `cost` | towers.json (barracks tier) |
| `hp`, `armor`, `magicResist`, `speed`, `damage`, `cooldown`, `regenPerSec`, `engageRadius`, `reach` | soldiers.json |
| `melee.damage / damageType / cooldown`, `traits: [{type: "bypassBlockers"}]` | enemies.json |
| `maxSoldiersPerEnemy`, `soldierFormationRadius` | config.json |

## Not yet
- Soldier tiers/upgrades (barracks has tier 1 only), spell reinforcements (milestone e), ranged enemies, selling a barracks (removes its soldiers).
