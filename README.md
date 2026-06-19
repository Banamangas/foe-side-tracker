# FoE Side Tracker

A **standalone** browser extension for [Forge of Empires](https://en.forgeofempires.com/)
that tracks diamond-producing buildings (in city and in inventory) and selected Great Building levels — directly in the game screen.

It **does not depend on FoE Helper** in any way. It works on its own.

## Features

- **Diamond badge** — a live count of buildings in your city that produce diamonds in the next harvest.
- **Tracked Great Buildings** — current level of 5 selected Great Buildings
  (Future Era Landmark, Progressive Era Landmark, Oceanic Future Landmark,
  Arctic Future Landmark, AllAge Expedition).
- **Bonus building counts** — city count and inventory count (in parentheses) for
  Easter Bonus, Expedition, and Summer Bonus buildings. Summer Bonus also counts
  complete selection/upgrade kits toward the inventory total (8 kits = 1 building).
- **Minimize** the widget with the `–` button; click the title for the description.

The widget appears at the top-right of the game screen whenever you are in your
city. It updates automatically as you place, move, upgrade, or collect from
buildings.

## How it works

The extension injects a content script into the game page (in the page's main
world, before the game loads). It hooks `XMLHttpRequest` and `WebSocket` to read
the game's own network traffic — the same technique used by FoE Helper — and
parses the relevant game services:

- `StartupService.getData`, `CityMapService.*`, `CityProductionService.*` → your city
- `InventoryService.*` → your inventory
- `metadata?id=city_entities` / `metadata?id=building_entity_lookup` → building
  definitions (used for icons, names, and diamond-production detection)

Building icons are loaded from the game's CDN by reading the asset hash list
embedded in the game's `ForgeHX` bootstrap script. Building metadata is cached in
IndexedDB so reloads are fast. No data ever leaves your browser.

## Installation (load unpacked)

1. Download or clone this folder so you have the `foe-side-tracker` directory
   containing `manifest.json`, `content.js`, and `icons/`.
2. Open your browser's extensions page:
   - **Chrome / Edge / Brave / Opera:** `chrome://extensions`
   - **Firefox:** `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on"
     (Firefox uses the same MV3 manifest here; pick the `manifest.json` file).
3. Enable **Developer mode** (top-right toggle) — for Chromium browsers.
4. Click **Load unpacked** and select the `foe-side-tracker` folder.
5. Open Forge of Empires and enter your city. The tracker widget appears at the
   top-right.

> The extension has no special permissions beyond access to
> `*.forgeofempires.com`. It stores nothing outside your browser.

## Compatibility

- Manifest V3, Chromium-based browsers (Chrome 111+, Edge, Brave, …).
- Firefox: load as a temporary add-on (MV3 support is included).
- Only active on `https://*.forgeofempires.com/game*`.

## Limitations

- Diamond detection covers modern (`GenericCityEntity`) and legacy building
  metadata formats, checking both the live production state and the building's
  declared production capabilities. Edge-case buildings with unusual reward
  structures may not be counted.
- Icon URLs depend on the game's `ForgeHX` asset manifest. If the game changes
  that script's format, icons fall back to a `♦` / `★` / `◆` placeholder until
  the parser is updated.

## License

This project is independent and not affiliated with InnoGames or the FoE Helper
team. Use at your own risk and in accordance with the game's terms of service.
