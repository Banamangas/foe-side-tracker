# Extended Great Building Stats — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an expandable mode to the FoE Side Tracker widget that displays extra per-Great-Building statistics derived from data already captured by the extension.

**Architecture:** Extend the single `content.js` content script with new state (`SocialCounts`, `ExtendedMode`), new game-service handlers (`OtherPlayerService`), calculation helpers for each GB, and conditional inline rendering in the GB row. Persistence and CSS are kept inside the same file to match the existing self-contained style.

**Tech Stack:** Vanilla JavaScript (MV3 content script), no build step.

## Global Constraints
- Target file: `/home/born/Github/foe-side-tracker/content.js`.
- All code must pass `node --check content.js`.
- No external dependencies.
- Keep the existing single-file, MAIN-world content-script architecture.
- Extended-mode state is persisted under `localStorage` key `foe_side_tracker_extended`.
- Number formatting: Arc/Frontenac/Blue-Galaxy `%` value shown as-is with `%`; Temple of Relics FoY/week and Seed Vault diamonds rounded to 2 decimal places.

---

### Task 1: Add extended-mode and social-count state + persistence

**Files:**
- Modify: `/home/born/Github/foe-side-tracker/content.js`

**Interfaces:**
- Consumes: none
- Produces:
  - `State.SocialCounts = { neighbors: 0, friends: 0, guildMembers: 0 }`
  - `State.ExtendedMode` boolean
  - `loadExtended()` → boolean
  - `saveExtended(value)`

- [ ] **Step 1: Add state fields after the existing `State` object**

Locate the existing `State` object (around line 61) and add:

```javascript
const State = {
    CityEntities: {},
    CityMapData: {},
    Inventory: {},
    InnoCDN: 'https://foede.innogamescdn.com/',
    FileList: null,
    PlayerID: 0,
    CurrentEra: null,
    entityUrlMap: null,
    entityCache: {},
    inflight: new Set(),
    SocialCounts: { neighbors: 0, friends: 0, guildMembers: 0 },
    ExtendedMode: false
};
```

- [ ] **Step 2: Add persistence helpers near the existing `POS_KEY`**

The existing position helpers are around line 700. Add nearby:

```javascript
const EXTENDED_KEY = 'foe_side_tracker_extended';

function loadExtended() {
    try {
        const raw = localStorage.getItem(EXTENDED_KEY);
        if (raw === 'true') return true;
        if (raw === 'false') return false;
    } catch (e) {}
    return false;
}

function saveExtended(value) {
    try { localStorage.setItem(EXTENDED_KEY, value ? 'true' : 'false'); } catch (e) {}
}
```

- [ ] **Step 3: Initialize `State.ExtendedMode` from storage**

After defining `State`, set:

```javascript
State.ExtendedMode = loadExtended();
```

- [ ] **Step 4: Verify syntax**

Run: `node --check /home/born/Github/foe-side-tracker/content.js`
Expected: no output (success).

- [ ] **Step 5: Commit**

```bash
git add /home/born/Github/foe-side-tracker/content.js
git commit -m "feat: add SocialCounts and ExtendedMode state with localStorage persistence"
```

---

### Task 2: Capture social counts from game services

**Files:**
- Modify: `/home/born/Github/foe-side-tracker/content.js`

**Interfaces:**
- Consumes: `entry.responseData` from `StartupService.getData` and `OtherPlayerService`
- Produces: updates `State.SocialCounts`

- [ ] **Step 1: Add a helper to count social list entries**

Add after the existing helper functions:

```javascript
function updateSocialCounts(list) {
    if (!Array.isArray(list)) return;
    let n = 0, f = 0, g = 0;
    for (const p of list) {
        if (!p) continue;
        if (p.is_neighbor) n++;
        if (p.is_friend) f++;
        if (p.is_guild_member) g++;
    }
    let changed = false;
    if (n !== State.SocialCounts.neighbors) { State.SocialCounts.neighbors = n; changed = true; }
    if (f !== State.SocialCounts.friends) { State.SocialCounts.friends = f; changed = true; }
    if (g !== State.SocialCounts.guildMembers) { State.SocialCounts.guildMembers = g; changed = true; }
    if (changed) emit('social');
}
```

- [ ] **Step 2: Update `StartupService|getData` handler to parse `socialbar_list`**

In the `Handlers` object, update the existing `'StartupService|getData'` entry. After processing `user_data`, add:

```javascript
if (rd && Array.isArray(rd.socialbar_list)) {
    updateSocialCounts(rd.socialbar_list);
}
```

- [ ] **Step 3: Add `OtherPlayerService` handlers**

Add to the `Handlers` object:

```javascript
'OtherPlayerService|getNeighborList': (entry) => {
    if (Array.isArray(entry.responseData)) updateSocialCounts(entry.responseData);
    else if (Array.isArray(entry.responseData.neighbours)) updateSocialCounts(entry.responseData.neighbours);
},
'OtherPlayerService|getFriendsList': (entry) => {
    if (Array.isArray(entry.responseData)) updateSocialCounts(entry.responseData);
    else if (Array.isArray(entry.responseData.friends)) updateSocialCounts(entry.responseData.friends);
},
'OtherPlayerService|getClanMemberList': (entry) => {
    if (Array.isArray(entry.responseData)) updateSocialCounts(entry.responseData);
    else if (Array.isArray(entry.responseData.guildMembers)) updateSocialCounts(entry.responseData.guildMembers);
},
'OtherPlayerService|getSocialList': (entry) => {
    const rd = entry.responseData;
    if (!rd) return;
    if (Array.isArray(rd.neighbours)) updateSocialCounts(rd.neighbours);
    if (Array.isArray(rd.friends)) updateSocialCounts(rd.friends);
    if (Array.isArray(rd.guildMembers)) updateSocialCounts(rd.guildMembers);
},
```

- [ ] **Step 4: Add social-change event listener**

Find the existing event subscriptions near the bottom (around line 853):

```javascript
on('citymap', scheduleUpdate);
on('inventory', scheduleUpdate);
on('entities', scheduleUpdate);
on('lookup', scheduleUpdate);
on('filelist', scheduleUpdate);
```

Add:

```javascript
on('social', scheduleUpdate);
```

- [ ] **Step 5: Verify syntax**

Run: `node --check /home/born/Github/foe-side-tracker/content.js`
Expected: no output (success).

- [ ] **Step 6: Commit**

```bash
git add /home/born/Github/foe-side-tracker/content.js
git commit -m "feat: capture neighbor/friend/guild counts from Startup and OtherPlayerService"
```

---

### Task 3: Add GB stat calculation helpers

**Files:**
- Modify: `/home/born/Github/foe-side-tracker/content.js`

**Interfaces:**
- Consumes: GB city-map entity `b` and `State.SocialCounts`
- Produces: formatted stat strings

- [ ] **Step 1: Add a formatting helper**

Add after `updateSocialCounts`:

```javascript
function fmt2(n) {
    if (n == null || isNaN(n)) return '—';
    return (Math.round(n * 100) / 100).toFixed(2);
}
```

- [ ] **Step 2: Add per-GB stat functions**

Add after `fmt2`:

```javascript
function getGBBonus(b) {
    return b && b.bonus ? b.bonus : null;
}

function getArcStat(b) {
    const bonus = getGBBonus(b);
    if (!bonus) return '—';
    return bonus.value + '%';
}

function getFrontenacStat(b) {
    const bonus = getGBBonus(b);
    if (!bonus) return '—';
    return bonus.value + '%';
}

function getBlueGalaxyStat(b) {
    const bonus = getGBBonus(b);
    if (!bonus) return '—';
    return bonus.amount + ' @ ' + bonus.value + '%';
}

function getSeedVaultStat(b) {
    const bonus = getGBBonus(b);
    if (!bonus) return '—';
    const totalPeople = State.SocialCounts.neighbors + State.SocialCounts.friends + State.SocialCounts.guildMembers;
    const diamonds = totalPeople * (bonus.value / 100) * 0.01 * 50;
    return fmt2(diamonds);
}

function getTempleOfRelicsStat(b) {
    const bonus = getGBBonus(b);
    if (!bonus) return '—';
    const foy = (bonus.value / 100) * (bonus.amount / 100) * 80 * 0.15;
    return fmt2(foy);
}
```

- [ ] **Step 3: Add a dispatcher that maps GB id to stat function**

Add after the per-GB functions:

```javascript
const GBStatProviders = {
    'X_FutureEra_Landmark1': getArcStat,
    'X_ProgressiveEra_Landmark2': getFrontenacStat,
    'X_OceanicFuture_Landmark3': getBlueGalaxyStat,
    'X_ArcticFuture_Landmark3': getSeedVaultStat,
    'X_AllAge_Expedition': getTempleOfRelicsStat
};

function getGBStat(b) {
    const provider = GBStatProviders[b && b.cityentity_id];
    return provider ? provider(b) : '';
}
```

- [ ] **Step 4: Verify syntax**

Run: `node --check /home/born/Github/foe-side-tracker/content.js`
Expected: no output (success).

- [ ] **Step 5: Commit**

```bash
git add /home/born/Github/foe-side-tracker/content.js
git commit -m "feat: add GB stat calculation helpers"
```

---

### Task 4: Add expand button and render extended stats

**Files:**
- Modify: `/home/born/Github/foe-side-tracker/content.js`

**Interfaces:**
- Consumes: `State.ExtendedMode`, `getGBStat(b)`
- Produces: updated widget HTML and event handlers

- [ ] **Step 1: Update `renderGBs` to show the stat when extended**

Locate `renderGBs` (around line 616) and replace it with:

```javascript
function renderGBs() {
    const cityBuildings = Object.values(State.CityMapData);
    let html = '';
    for (const gbId of Config.GreatBuildings) {
        const gb = cityBuildings.find((b) => b.cityentity_id === gbId && b.type === 'greatbuilding');
        const level = gb ? gb.level : 0;
        const name = (State.CityEntities[gbId] && State.CityEntities[gbId].name) || gbId;
        const icon = getBuildingIconUrl(gbId);
        const stat = State.ExtendedMode ? getGBStat(gb) : '';
        html += '<div class="st-gb-item' + (State.ExtendedMode ? ' st-gb-extended' : '') + '" title="' + escapeAttr(name) + '">' +
            iconHtml(icon, '★') +
            '<span class="st-gb-lvl">' + level + '</span>' +
            (stat ? '<span class="st-gb-stat">' + escapeAttr(stat) + '</span>' : '') +
            '</div>';
    }
    return html;
}
```

- [ ] **Step 2: Add expand button to the widget header**

Locate `ensureWidget` (around line 754). In the header HTML, add the expand button between the title and the minimize button:

```javascript
'<span style="display:flex;align-items:center;gap:6px;">' +
    '<span class="st-expand-btn" id="st-expand-btn" title="Expand">+</span>' +
    '<span class="st-min-btn" id="st-min-btn" title="Minimize">–</span>' +
    ...
```

- [ ] **Step 3: Wire the expand button click handler**

In `ensureWidget`, after the minimize button listener, add:

```javascript
const expandBtn = document.getElementById('st-expand-btn');
if (expandBtn) {
    expandBtn.addEventListener('click', () => {
        State.ExtendedMode = !State.ExtendedMode;
        saveExtended(State.ExtendedMode);
        scheduleUpdate();
    });
}
```

- [ ] **Step 4: Set the expand button initial text and update it on toggle**

At the end of `render()`, add:

```javascript
const expandBtn = document.getElementById('st-expand-btn');
if (expandBtn) expandBtn.textContent = State.ExtendedMode ? '−' : '+';
```

Use U+2212 minus so it matches the existing minimize button style, or just `'-'`.

- [ ] **Step 5: Verify syntax**

Run: `node --check /home/born/Github/foe-side-tracker/content.js`
Expected: no output (success).

- [ ] **Step 6: Commit**

```bash
git add /home/born/Github/foe-side-tracker/content.js
git commit -m "feat: add expand button and extended GB stat rendering"
```

---

### Task 5: Add CSS for extended mode

**Files:**
- Modify: `/home/born/Github/foe-side-tracker/content.js`

**Interfaces:**
- Consumes: `.st-gb-extended` and `.st-gb-stat` classes
- Produces: styled extended GB items

- [ ] **Step 1: Add CSS rules to the `CSS` template**

Locate the `CSS` template (around line 661). Add the following rules inside the template string:

```css
.st-expand-btn { cursor: pointer; color: #c0a060; font-weight: bold; padding: 0 4px; }
.st-gb-extended { min-width: 56px; }
.st-gb-stat { font-size: 10px; color: #c0b090; margin-top: 1px; font-weight: normal; text-align: center; line-height: 1.2; }
```

- [ ] **Step 2: Verify syntax**

Run: `node --check /home/born/Github/foe-side-tracker/content.js`
Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add /home/born/Github/foe-side-tracker/content.js
git commit -m "feat: add CSS for extended GB stat display"
```

---

### Task 6: Smoke-test with the provided extract.json

**Files:**
- Modify: `/home/born/Github/foe-side-tracker/content.js`
- Read: `/home/born/Github/foe-side-tracker/extract.json`

**Interfaces:**
- Consumes: `extract.json` sample data
- Produces: manual verification that calculations match expectations

- [ ] **Step 1: Verify syntax one final time**

Run: `node --check /home/born/Github/foe-side-tracker/content.js`
Expected: no output (success).

- [ ] **Step 2: Use a small Node script to validate calculation helpers against extract.json**

Because `content.js` is a browser content script, the helpers cannot be directly imported. Create a temporary test script `/tmp/opencode/gb-stats-test.js` that copies the calculation logic and feeds it the relevant entries from `extract.json`.

Example test script:

```javascript
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('/home/born/Github/foe-side-tracker/extract.json', 'utf8'));
const gbIds = ['X_FutureEra_Landmark1', 'X_ProgressiveEra_Landmark2', 'X_OceanicFuture_Landmark3', 'X_ArcticFuture_Landmark3', 'X_AllAge_Expedition'];

function fmt2(n) {
    if (n == null || isNaN(n)) return '—';
    return (Math.round(n * 100) / 100).toFixed(2);
}

const social = { neighbors: 70, friends: 80, guildMembers: 60 };

for (const id of gbIds) {
    const b = data.find((e) => e.cityentity_id === id && e.type === 'greatbuilding');
    if (!b) { console.log(id, 'not found'); continue; }
    const bonus = b.bonus;
    let stat = '';
    switch (id) {
        case 'X_FutureEra_Landmark1': stat = bonus.value + '%'; break;
        case 'X_ProgressiveEra_Landmark2': stat = bonus.value + '%'; break;
        case 'X_OceanicFuture_Landmark3': stat = bonus.amount + ' @ ' + bonus.value + '%'; break;
        case 'X_ArcticFuture_Landmark3':
            stat = fmt2((social.neighbors + social.friends + social.guildMembers) * (bonus.value / 100) * 0.01 * 50);
            break;
        case 'X_AllAge_Expedition':
            stat = fmt2((bonus.value / 100) * (bonus.amount / 100) * 80 * 0.15);
            break;
    }
    console.log(id, 'level=' + b.level, 'stat=' + stat);
}
```

Run: `node /tmp/opencode/gb-stats-test.js`
Expected output (values depend on sample social counts):
```
X_FutureEra_Landmark1 level=180 stat=100%
X_ProgressiveEra_Landmark2 level=180 stat=1000%
X_OceanicFuture_Landmark3 level=126 stat=15 @ 74%
X_ArcticFuture_Landmark3 level=173 stat=...
X_AllAge_Expedition level=174 stat=0.08
```

- [ ] **Step 3: Clean up temporary test file**

Run: `rm /tmp/opencode/gb-stats-test.js`

- [ ] **Step 4: Update `tasks/todo.md`**

Add a new section documenting the extended GB stats feature.

- [ ] **Step 5: Commit**

```bash
git add /home/born/Github/foe-side-tracker/content.js /home/born/Github/foe-side-tracker/tasks/todo.md
git commit -m "feat: extended GB stats smoke-tested and documented"
```

---

## Self-review checklist

- [ ] Spec coverage: every requirement (toggle, layout, formatting, social counts, calculations, persistence) maps to a task.
- [ ] No placeholders: every step contains exact code or exact commands.
- [ ] Type consistency: `State.SocialCounts` fields and `getGBStat` signature are used consistently across tasks.
