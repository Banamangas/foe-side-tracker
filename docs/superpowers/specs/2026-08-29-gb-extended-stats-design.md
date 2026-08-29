# FoE Side Tracker — Extended Great Building Stats

## Goal
Add an expandable mode to the tracker widget that displays extra per-Great-Building information derived from data already captured by the extension.

## User choices
- Toggle: dedicated expand/collapse button in the header, next to the minimize button.
- Layout: stats shown inline, below each GB icon/level.
- Persistence: expanded/collapsed state saved in `localStorage` and restored on reload.
- Number formatting:
  - Arc/Frontenac boost: raw `bonus.value` followed by `%` (no forced decimals).
  - Blue Galaxy `%` value: raw `bonus.value` followed by `%` (no forced decimals).
  - Temple of Relics expected FoY/week and Seed Vault expected diamonds: rounded to 2 decimal places.

## Data sources

### GB bonus data
Each GB city-map entity already contains a `bonus` object:

```json
{
  "value": 27.12,
  "type": "totem_drop",
  "amount": 35,
  ...
}
```

This object is available from all existing CityMap payloads.

### Social counts for Seed Vault
Seed Vault’s expected diamond calculation needs the total number of neighbors + friends + guild members.

These counts come from:

1. `StartupService.getData` → `responseData.socialbar_list`
   - Count entries where `is_neighbor === true`.
   - Count entries where `is_friend === true`.
   - Count entries where `is_guild_member === true`.
2. `OtherPlayerService` updates:
   - `getNeighborList` → `responseData.neighbours`
   - `getFriendsList` → `responseData.friends`
   - `getClanMemberList` → `responseData.guildMembers`
   - `getSocialList` → may contain any of `neighbours`, `guildMembers`, `friends`

## Calculations

### Temple of Relics (`X_AllAge_Expedition`)
```
expectedFoYPerWeek = (bonus.value / 100) * (bonus.amount / 100) * 80 * 0.15
```
Display: rounded to 2 decimals.

Example from extract.json (`value: 27.12`, `amount: 35`):
`(27.12 / 100) * (35 / 100) * 80 * 0.15 = 1.13904` → display `1.14`.

### Seed Vault (`X_ArcticFuture_Landmark3`)
```
expectedDiamonds = (neighbors + friends + guildMembers) * (bonus.value / 100) * 0.01 * 50
```
Display: rounded to 2 decimals.

### Frontenac (`X_ProgressiveEra_Landmark2`)
Display `bonus.value` followed by `%`.

Example from extract.json (`value: 1000`): display `1000%`.

### Arc (`X_FutureEra_Landmark1`)
Display `bonus.value` followed by `%`.

Example from extract.json (`value: 100`): display `100%`.

### Blue Galaxy (`X_OceanicFuture_Landmark3`)
Display `bonus.amount @ bonus.value%`.

Example from extract.json (`amount: 15`, `value: 74`): display `15 @ 74%`.

## UI changes

### Header
Add an expand/collapse button next to the minimize button.
- Collapsed icon: `+` or `▼`.
- Expanded icon: `–` or `▲`.

### GB item rendering
In extended mode, each GB item renders as:

```
[icon]
Lv. 180
<stat>
```

The stat line uses a smaller font and a slightly muted color.

### CSS
- Add `.st-gb-stat` class for the computed stat line.
- Adjust `.st-gb-item` to stack vertically with a small gap.
- Ensure the widget can grow taller without breaking layout.

## State additions
- `State.SocialCounts = { neighbors: 0, friends: 0, guildMembers: 0 }`
- `State.ExtendedMode = false` (loaded from `localStorage`)

## Handler additions
- `StartupService|getData`: parse `socialbar_list` into `SocialCounts`.
- `OtherPlayerService|getNeighborList`: update `SocialCounts.neighbors`.
- `OtherPlayerService|getFriendsList`: update `SocialCounts.friends`.
- `OtherPlayerService|getClanMemberList`: update `SocialCounts.guildMembers`.
- `OtherPlayerService|getSocialList`: update any provided sub-lists.

## Persistence
- Key: `foe_side_tracker_extended`
- Save on toggle.
- Load during init.

## Files to modify
- `content.js` — all logic and UI.
- `tasks/todo.md` — update with implementation notes.
