# Milestone (d): waves, economy, upgrades

## Wave flow
- Wave 1's `preDelay` counts from level start. Wave N+1's `preDelay` counts from the moment wave N **finishes spawning** (its last group entry). Waves may overlap on the road.
- `callWave` starts the pending wave now and pays `min(floor(secondsSkipped * earlyCallGoldPerSec), earlyCallMaxBonus)`. It is rejected while a wave is still spawning.
- The level is won when every wave has started, all spawns are done and no enemy is alive. It is lost at 0 lives. Stars come from lives left (`config.stars`); 0 on a loss.

## Economy
- Bounty on kill (enemies.json `bounty`). Starting gold: levels `startGold`.
- Upgrades: tier 1 is the build cost; `upgradeTower` buys the next entry of `tiers[]` (cost = that entry's `cost`). After the last base tier, `specialize` picks one of exactly two `specializations`, which override fields of the last tier (cost is paid once).
- `invested` = every gold spent on the tower. Selling refunds `floor(invested * sellRefundPct)` (70%), frees the spot and removes a barracks's soldiers.
- Upgrading or specializing a barracks replaces its soldiers immediately with the new type and count.

## Data knobs
| Knob | File |
|---|---|
| `preDelay`, `groups[].enemyId/count/interval/startDelay` | waves/level-01.waves.json |
| `startGold`, `buildSpots` | levels/level-01.json |
| `bounty`, `livesCost` | enemies.json |
| `tiers[]`, `specializations` (exactly two per tower) | towers.json |
| `earlyCallGoldPerSec`, `earlyCallMaxBonus`, `sellRefundPct`, `stars[]` | config.json |

## Balance status (level 1)
Guard rails in `tests/balance.test.ts` use a fixed-build-order bot (`tests/bot.ts`): no defense loses, a mixed barracks/archer/mage build wins on seeds 1 to 3, and results are deterministic. Reference runs from tuning: archers-only wins with ~5 lives (1 star), the mixed build wins with 4 to 14 lives (1 to 2 stars). 3 stars needs better play than the bot. Numbers are a first pass, expect tuning.

## Deviation from the approved proposal
Tiers are written out in full instead of inheriting unlisted fields from the previous tier; specializations do inherit from the last tier. Enemy traits and boss phases are not in milestones (a) to (g); they land as a follow-up milestone after (d).
