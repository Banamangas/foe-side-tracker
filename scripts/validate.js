#!/usr/bin/env node
/* CI validation for the FoE Side Tracker extension.
 * Run with: node scripts/validate.js
 * Exits non-zero on any failure. No external dependencies. */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const fail = (msg) => { console.error('✗ ' + msg); process.exitCode = 1; };
const ok = (msg) => { console.log('✓ ' + msg); };

let hadError = false;
const check = (cond, msg) => { if (cond) ok(msg); else { fail(msg); hadError = true; } };

// 1. content.js syntax (belt-and-braces alongside `node --check`)
try {
	new Function(read('content.js'));
	check(true, 'content.js parses as a function body');
} catch (e) {
	fail('content.js parse error: ' + e.message);
	hadError = true;
}

// 2. content.js contains expected core tokens (guards against accidental deletion)
const src = read('content.js');
const required = [
	['XMLHttpRequest.prototype', 'XHR hook'],
	['WebSocket.prototype', 'WebSocket hook'],
	['foe-side-tracker', 'widget id'],
	["'/game'", "game-path guard"]
];
for (const [token, label] of required) {
	if (src.includes(token)) ok('content.js has ' + label);
	else { fail('content.js missing ' + label + ' (token: ' + token + ')'); hadError = true; }
}

// 3. manifest.json is valid MV3 with required fields
let manifest;
try {
	manifest = JSON.parse(read('manifest.json'));
} catch (e) {
	fail('manifest.json is not valid JSON: ' + e.message);
	process.exit(hadError ? 1 : 0);
}

const mErrs = [];
if (manifest.manifest_version !== 3) mErrs.push('manifest_version must be 3, got ' + manifest.manifest_version);
if (!manifest.name) mErrs.push('missing name');
if (!manifest.version) mErrs.push('missing version');
if (!Array.isArray(manifest.content_scripts) || manifest.content_scripts.length === 0) mErrs.push('missing content_scripts');
for (const cs of manifest.content_scripts || []) {
	if (!Array.isArray(cs.matches) || cs.matches.length === 0) mErrs.push('content_script missing matches');
	if (!Array.isArray(cs.js) || cs.js.length === 0) mErrs.push('content_script missing js');
	if (cs.world && cs.world !== 'MAIN' && cs.world !== 'ISOLATED') mErrs.push('invalid world: ' + cs.world);
}
if (mErrs.length) { mErrs.forEach((e) => fail('manifest: ' + e)); hadError = true; }
else ok('manifest.json is valid MV3');

// 4. All files referenced by manifest actually exist
const missing = [];
const checkFile = (p) => { if (!p.includes('*') && !exists(p)) missing.push(p); };
for (const cs of manifest.content_scripts || []) for (const j of cs.js || []) checkFile(j);
if (manifest.action) {
	if (typeof manifest.action.default_icon === 'string') checkFile(manifest.action.default_icon);
	else if (manifest.action.default_icon) for (const k of Object.keys(manifest.action.default_icon)) checkFile(manifest.action.default_icon[k]);
}
if (manifest.icons) for (const k of Object.keys(manifest.icons)) checkFile(manifest.icons[k]);
for (const war of manifest.web_accessible_resources || []) for (const r of war.resources || []) checkFile(r);
if (missing.length) { missing.forEach((p) => fail('missing file referenced in manifest: ' + p)); hadError = true; }
else ok('all manifest-referenced files present');

// 5. No obvious secrets committed (skip this scanner file itself)
const allFiles = ['.gitignore', 'manifest.json', 'README.md', 'content.js', '.github/workflows/ci.yml'];
const secretRe = /(gho_|ghp_|ghs_|github_pat_|AKIA|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)/;
let secretFound = false;
for (const f of allFiles) {
	if (!exists(f)) continue;
	if (secretRe.test(read(f))) { fail('possible secret in ' + f); secretFound = true; }
}
if (!secretFound) ok('no obvious secrets detected');

if (hadError) {
	console.error('\nValidation FAILED');
	process.exit(1);
} else {
	console.log('\nAll checks passed');
}
