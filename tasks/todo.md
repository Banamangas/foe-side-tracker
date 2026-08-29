# FoE Side Tracker — Standalone Building/Diamond Tracker Extension

## Goal
Create a **standalone** browser extension (MV3) that replicates the FoE Helper
`BuildingTracker` module (diamond badge + tracked GB levels + bonus building
counts) **without depending on any FoE Helper code**. It must load directly into
the browser and work on `https://*.forgeofempires.com/game*`.

## How FoE Helper gets the data (findings)
- `js/foeproxy.js` runs in **MAIN world at document_start**, hooks
  `XMLHttpRequest` + `WebSocket`, targets two endpoints:
  - `game/json?h=` → game JSON-RPC (array of `{requestClass,requestMethod,requestId,responseData}`)
  - `metadata?id=<name>-<hash>` → static metadata (e.g. `city_entities`, `building_entity_lookup`)
- `MainParser` holds state: `CityMapData`, `CityEntities`, `Inventory`, `CityBuildingsData`, `InnoCDN`.
- `srcLinks` fetches the game's `ForgeHX` script, slices out a `FileList` JSON
  `{path: hash}` after the `baseUrl,` marker → builds `<InnoCDN>assets<path>-<hash>.png`.
- Diamond = production entry with `type==="resources" && resources.premium`:
  - modern: `state.productionOption.products[].playerResources.resources.premium` (live)
    or `components[era].production.options[].products[].playerResources.resources.premium` (capability)
  - legacy: `state.current_product.product.resources.premium` (live)
    or `available_products[].product.resources.premium` / `abilities[].additionalResources[era|AllAge].resources.premium` (capability)
- Era via `getEraName(entityId, level)` = `entityId.split('_')[1]`; MultiAge → `InnoEraNames[level]`.
- Modern entity metadata: `building_entity_lookup` metadata → list of `{identifier,url}` → fetch each per-building JSON (in-memory cache by hash).
- Player id from `StartupService.getData` → `responseData.user_data.player_id`; era from `.user_data.era`.

## Architecture (standalone)
Single self-contained MAIN-world content script `content.js` (no chrome.* APIs needed):
1. Hook XHR + WS at document_start → capture game RPC + metadata + CDN base.
2. Maintain in-memory state (CityEntities, CityMapData, Inventory, InnoCDN, FileList).
3. Parse `city_entities` (bulk) AND `building_entity_lookup` (modern per-building fetch).
4. Fetch `ForgeHX` → parse FileList for icon hashes.
5. Detect diamonds (live state + metadata capability, modern + legacy).
6. Render fixed widget (faithful CSS): title, diamond badge, 5 GB levels, 3 bonus building counts.
7. Update on every CityMap/Inventory change.

## Files to create (in /home/born/Github/foe-side-tracker/)
- [ ] `manifest.json` — MV3, MAIN-world content script, host perms for forgeofempires.com
- [ ] `content.js` — all logic (proxy + state + diamond detection + UI)
- [ ] `icons/app16.png`, `icons/app48.png`, `icons/app128.png` — toolbar icons
- [ ] `README.md` — load-unpacked install instructions + feature list

## Implementation steps
- [ ] Verify icon tooling & generate icons
- [ ] Write manifest.json
- [ ] Write content.js (proxy + data handlers)
- [ ] Add entity metadata fetcher (both formats)
- [ ] Add srcLinks/ForgeHX FileList parser
- [ ] Add diamond detection (modern + legacy, live + capability)
- [ ] Add widget UI + CSS injection
- [ ] Syntax-check with node
- [ ] Write README

## Verification
- [x] `node --check content.js` passes
- [x] manifest.json valid JSON
- [x] Self-review: would a staff engineer approve? Elegant? Faithful to original behaviour?

## Notes
- Original module: `js/web/buildingtracker/js/buildingtracker.js` (324 lines).
- Config (GB ids, Easter/Expedition/Summer ids + summer kits) copied verbatim.

## Debug payload inspection (added)
- `content.js` now logs every JSON-RPC payload that feeds Great Building levels to the DevTools console.
- Sources logged:
  - `StartupService.getData` (`responseData.city_map.entities`)
  - `CityMapService.getEntities`
  - `CityMapService.moveEntity / moveEntities / updateEntity / placeBuilding`
- Each log group shows:
  - Full payload object
  - Any tracked GB entries found inside it
  - Key list of the first GB entry so you can see which fields are available
- A global debug object is exposed at `window.__foeSideTrackerDebug` with `getTrackedGBs()`, `logCurrentGBs()`, and `enableLogging()`.
- GB payload logging defaults to `false`; call `__foeSideTrackerDebug.enableLogging()` to inspect payloads.

## Review
Standalone MV3 extension built at `/home/born/Github/foe-side-tracker/`.
Files: `manifest.json` (MV3, single MAIN-world content script at document_start),
`content.js` (759 lines, self-contained), `icons/` (16/48/128 px), `README.md`.

How it replicates the original without FoE Helper:
- XHR + WebSocket hooks (MAIN world, document_start) capture `game/json?h=` RPC +
  `metadata?id=` files + CDN base from the Portraits request — same mechanism as
  `js/foeproxy.js`, reimplemented from scratch.
- In-memory state mirrors `MainParser`: `CityMapData`, `CityEntities`, `Inventory`,
  `InnoCDN`, plus a `FileList` parsed from the game's `ForgeHX` script (replaces
  `srcLinks`) and an IndexedDB metadata cache (replaces `IndexDB`/`CityEntityBuilder`).
- Game-service handlers for Startup/CityMap/CityProduction/Inventory reproduce the
  `addFoeHelperHandler('CityMapUpdated'/'InventoryUpdated')` triggers.
- Diamond detection checks live state (`state.productionOption.products` /
  `state.current_product.product`) AND metadata capability
  (`components[era].production.options` / `available_products` /
  `abilities.additionalResources`) for `resources.premium` — covering modern +
  legacy building formats.
- Config (5 GBs, Easter/Expedition/Summer ids + summer-kit math) copied verbatim.
- UI/CSS faithfully re-implements the widget; adds a minimize button and a
  click-the-badge diamond-building list (standalone-friendly, since there is no
  Productions module to link to).

Verified: `node --check` passes; manifest is valid JSON. Logic reviewed against
original sources (`buildingtracker.js`, `foeproxy.js`, `_main.js`, `citymap.js`,
`technologies.js`, `srcLinks.js`).

## Task 2: Capture social counts from game services

- [x] Step 1: Add `updateSocialCounts(list)` helper after existing helper functions
- [x] Step 2: Update `StartupService|getData` handler to parse `socialbar_list`
- [x] Step 3: Add `OtherPlayerService` handlers (`getNeighborList`, `getFriendsList`, `getClanMemberList`, `getSocialList`)
- [x] Step 4: Add `on('social', scheduleUpdate)` event listener
- [x] Step 5: Verify syntax with `node --check content.js`
- [x] Step 6: Commit changes
- [x] Step 7: Write task-2-report.md

## Task 3: Add GB stat calculation helpers

- [x] Step 1: Add `getGBStat(b)` helper
- [x] Step 2: Add `GBStatProviders` object and `getGBProductionValue`
- [x] Step 3: Wire GB stat into event handler for payload logging
- [x] Step 4: Verify syntax with `node --check content.js`
- [x] Step 5: Commit changes
- [x] Step 6: Write task-3-report.md

## Task 4: Add expand button and render extended stats

- [x] Step 1: Update `renderGBs` to show the stat when extended
- [x] Step 2: Add expand button to the widget header
- [x] Step 3: Wire the expand button click handler
- [x] Step 4: Set the expand button initial text and update it on toggle
- [x] Step 5: Verify syntax with `node --check content.js`
- [x] Step 6: Commit changes
- [x] Step 7: Write task-4-report.md

## Task 5: Add CSS for extended mode

- [x] Step 1: Add CSS rules for `.st-expand-btn`, `.st-gb-extended`, and `.st-gb-stat`
- [x] Step 2: Verify syntax with `node --check content.js`
- [x] Step 3: Commit changes
- [x] Step 4: Write task-5-report.md

## Task 6: Extended GB stats smoke-test & documentation

- [x] Step 1: Final syntax check with `node --check content.js`
- [x] Step 2: Validate GB stat calculation helpers against `extract.json`
- [x] Step 3: Clean up temporary test script `/tmp/opencode/gb-stats-test.js`
- [x] Step 4: Document feature in `tasks/todo.md`
- [x] Step 5: Commit changes
- [x] Step 6: Self-review
- [x] Step 7: Write task-6-report.md

### Extended GB stats feature

The widget now displays a per-GB computed stat when expanded. The stat is shown
next to each Great Building entry and is calculated from the live `bonus` data
on the city-map entity plus the cached social counts.

Supported GBs and stat formulas:
- `X_FutureEra_Landmark1` (Arc) → `bonus.value` as a percentage
- `X_ProgressiveEra_Landmark2` (Chateau Frontenac) → `bonus.value` as a percentage
- `X_OceanicFuture_Landmark3` (Blue Galaxy) → `bonus.amount @ bonus.value%`
- `X_ArcticFuture_Landmark3` (Seed Vault) → expected diamonds:
  `(neighbors + friends + guildMembers) * (bonus.value / 100) * 0.01 * 50`
- `X_AllAge_Expedition` (Temple of Relics) → expected FoY per week:
  `(bonus.value / 100) * (bonus.amount / 100) * 80 * 0.15`
- Social counts exclude the player's own `player_id`.

### Smoke-test results

`node --check content.js` passed with no errors.

Temporary test script copied the calculation helpers and ran them against
`/home/born/Github/foe-side-tracker/extract.json` using sample social counts
`{ neighbors: 70, friends: 80, guildMembers: 60 }`:

```
X_FutureEra_Landmark1       level=180 stat=100%
X_ProgressiveEra_Landmark2  level=180 stat=1000%
X_OceanicFuture_Landmark3   level=126 stat=15 @ 74%
X_ArcticFuture_Landmark3    level=173 stat=24.53
X_AllAge_Expedition         level=174 stat=1.14
```

All tracked GBs were found in the sample extract and produced the expected stat
values. No `content.js` changes were required.

## Fix: OtherPlayerService social counts clobber + stat numeric validation

- [x] Step 1: Add `updateSocialCount(category, list)` helper
- [x] Step 2: Keep `updateSocialCounts(list)` for mixed `socialbar_list`
- [x] Step 3: Update `OtherPlayerService` handlers to use `updateSocialCount`
- [x] Step 4: Validate numeric fields in `getSeedVaultStat`
- [x] Step 5: Validate numeric fields in `getTempleOfRelicsStat`
- [x] Step 6: Run `node --check content.js`
- [x] Step 7: Re-run Task 6 smoke test and clean up
- [x] Step 8: Commit changes
- [x] Step 9: Self-review
- [x] Step 10: Write social-count-fix-report.md
