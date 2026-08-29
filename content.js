(function () {
	'use strict';

	try {

		if (window.__foeSideTrackerLoaded) return;
		window.__foeSideTrackerLoaded = true;

		if (location.pathname.indexOf('/game') === -1) return;

		const InnoEraNames = {
			0: 'StoneAge', 1: 'BronzeAge', 2: 'IronAge', 3: 'EarlyMiddleAge',
			4: 'HighMiddleAge', 5: 'LateMiddleAge', 6: 'ColonialAge', 7: 'IndustrialAge',
			8: 'ProgressiveEra', 9: 'ModernEra', 10: 'PostModernEra', 11: 'ContemporaryEra',
			12: 'TomorrowEra', 13: 'FutureEra', 14: 'ArcticFuture', 15: 'OceanicFuture',
			16: 'VirtualFuture', 17: 'SpaceAgeMars', 18: 'SpaceAgeAsteroidBelt',
			19: 'SpaceAgeVenus', 20: 'SpaceAgeJupiterMoon', 21: 'SpaceAgeTitan',
			22: 'SpaceAgeSpaceHub'
		};

		const i18nDict = {
			'Boxes.BuildingTracker.Title': 'Tracker',
			'Boxes.BuildingTracker.City': 'City',
			'Boxes.BuildingTracker.Inventory': 'Inventory',
			'Boxes.BuildingTracker.Level': 'Lv.',
			'Menu.BuildingTracker.Title': 'Building Tracker',
			'Menu.BuildingTracker.Desc': 'Shows tracked GB levels, building counts, and diamond production status'
		};
		const i18n = (k) => i18nDict[k] != null ? i18nDict[k] : k;

		const Config = {
			GreatBuildings: [
				'X_FutureEra_Landmark1',
				'X_AllAge_Expedition',
				'X_ProgressiveEra_Landmark2',
				'X_OceanicFuture_Landmark3',
				'X_ArcticFuture_Landmark3'
			],
			EasterBonus: {
				icon: 'W_AllAge_EasterBonus1',
				ids: ['W_AllAge_EasterBonus1', 'W_AllAge_EasterBonus1Small']
			},
			Expedition: {
				icon: 'W_AllAge_Expedition16',
				ids: ['W_AllAge_Expedition16', 'W_AllAge_Expedition16Small', 'W_AllAge_Expedition24Tiny']
			},
			SummerBonus: {
				icon: 'R_MultiAge_SummerBonus19h',
				ids: ['R_MultiAge_SummerBonus19h'],
				specialKitIds: [
					'selection_kit_crows_nest',
					'upgrade_kit_crows_nest',
					'selection_kit_epic_SUM25',
					'selection_kit_epic_SUM24',
					'selection_kit_epic_SUM23'
				],
				kitsPerBuilding: 8
			}
		};

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

		State.ExtendedMode = loadExtended();

		const Debug = {
			logGBPayloads: true
		};

		function isGreatBuilding(b) {
			return b && b.cityentity_id && b.type === 'greatbuilding';
		}

		function filterGBs(list) {
			if (!Array.isArray(list)) return [];
			return list.filter((b) => isGreatBuilding(b) && Config.GreatBuildings.indexOf(b.cityentity_id) !== -1);
		}

		function logGBPayload(source, fullPayload, gbBuildings) {
			if (!Debug.logGBPayloads) return;
			const gbs = Array.isArray(gbBuildings) ? gbBuildings : filterGBs(gbBuildings);
			console.groupCollapsed('[FoE Side Tracker] GB payload — ' + source + (gbs.length ? ' (' + gbs.length + ' tracked GB' + (gbs.length === 1 ? '' : 's') + ')' : ''));
			console.log('Source:', source);
			console.log('Full payload:', fullPayload);
			if (gbs.length) {
				console.log('Great Building entries found:', gbs);
				console.log('GB fields (first entry):', Object.keys(gbs[0]));
			}
			console.groupEnd();
		}

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

		function fmt2(n) {
			if (n == null || isNaN(n)) return '—';
			return (Math.round(n * 100) / 100).toFixed(2);
		}

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
			const foy = (bonus.value / 100) * (bonus.amount / 100) * 80 * 0.01;
			return fmt2(foy);
		}

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

		const events = {};
		const on = (name, cb) => { (events[name] || (events[name] = [])).push(cb); };
		const emit = (name) => { const list = events[name]; if (!list) return; for (const cb of list) { try { cb(); } catch (e) {} } };

		const getEraName = (entityId, level) => {
			const eraName = entityId.split('_')[1];
			if (eraName === 'MultiAge') return InnoEraNames[level] || 'AllAge';
			return eraName;
		};

		const escapeAttr = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

		const getAssetUrl = (filename) => {
			if (!State.FileList) return '';
			const hash = State.FileList[filename];
			if (!hash) return '';
			const parts = filename.split('.');
			const base = parts[0];
			const ext = parts[1] || 'png';
			return State.InnoCDN + 'assets' + base + '-' + hash + '.' + ext;
		};

		const iconPathFor = (id) => '/city/buildings/' + id.replace(/^(\D_)(.*?)/, '$1SS_$2') + '.png';

		const getBuildingIconUrl = (entityId) => {
			if (!entityId) return [];
			const ent = State.CityEntities[entityId];
			const candidates = [];
			if (ent && ent.asset_id && ent.asset_id !== entityId) candidates.push(ent.asset_id);
			candidates.push(entityId);
			const urls = [];
			for (const id of candidates) {
				const url = getAssetUrl(iconPathFor(id));
				if (url) urls.push(url);
			}
			return urls;
		};

		const getPremiumIconUrl = () => getAssetUrl('/shared/icons/premium.png');



		const origOpen = XMLHttpRequest.prototype.open;
		const origSend = XMLHttpRequest.prototype.send;
		const xhrState = new WeakMap();

		XMLHttpRequest.prototype.open = function (method, url) {
			xhrState.set(this, { url: url });
			return origOpen.apply(this, arguments);
		};

		XMLHttpRequest.prototype.send = function (body) {
			const st = xhrState.get(this);
			if (st) {
				st.body = body;
				this.addEventListener('load', onXhrLoad, { passive: true });
			}
			return origSend.apply(this, arguments);
		};

		function onXhrLoad() {
			const st = xhrState.get(this);
			if (!st) return;
			try {
				const url = st.url || '';
				const portraitsIdx = url.indexOf('/assets/shared/avatars/Portraits');
				if (portraitsIdx !== -1) {
					State.InnoCDN = url.substring(0, portraitsIdx + 1);
				}
				if (url.indexOf('metadata?id=') !== -1) {
					handleMetadata(this.responseText, url);
				} else if (url.indexOf('game/json?h=') !== -1) {
					handleGameJson(this.responseText, st.body);
				}
			} catch (e) {}
		}

		const oldWSSend = WebSocket.prototype.send;
		const observedWS = new WeakSet();
		WebSocket.prototype.send = function (data) {
			oldWSSend.call(this, data);
			if (!observedWS.has(this)) {
				observedWS.add(this);
				this.addEventListener('message', onWsMessage, { passive: true });
			}
		};

		function onWsMessage(evt) {
			let data = evt.data;
			if (data instanceof Blob) {
				data.text().then(handleWsText).catch(() => {});
				return;
			}
			if (typeof data !== 'string') {
				try { data = new TextDecoder().decode(data); } catch (e) { return; }
			}
			handleWsText(data);
		}

		function handleWsText(text) {
			let parsed;
			try { parsed = JSON.parse(text); } catch (e) { return; }
			const arr = Array.isArray(parsed) ? parsed : [parsed];
			for (const entry of arr) {
				if (!entry || !entry.requestClass) continue;
				const key = entry.requestClass + '|' + entry.requestMethod;
				const h = Handlers[key];
				if (h) { try { h(entry, null); } catch (e) {} }
			}
		}


		function fetchText(url) {
			return new Promise((resolve, reject) => {
				const xhr = new XMLHttpRequest();
				origOpen.call(xhr, 'GET', url, true);
				xhr.onreadystatechange = function () {
					if (xhr.readyState === 4) {
						if (xhr.status === 200) resolve(xhr.responseText);
						else reject(new Error(String(xhr.status)));
					}
				};
				xhr.onerror = () => reject(new Error('error'));
				origSend.call(xhr);
			});
		}


		function handleMetadata(responseText, url) {
			const idx = url.indexOf('metadata?id=');
			const rest = url.substring(idx + 'metadata?id='.length);
			const meta = rest.split('-', 1)[0];
			if (meta === 'city_entities') {
				try {
					const arr = JSON.parse(responseText);
					if (Array.isArray(arr)) {
						const map = {};
						for (const e of arr) if (e && e.id) map[e.id] = e;
						State.CityEntities = map;
						correctBuildingTypes();
						emit('entities');
					}
				} catch (e) {}
			} else if (meta === 'building_entity_lookup') {
				try {
					const arr = JSON.parse(responseText);
					if (Array.isArray(arr)) {
						const urlMap = {};
						for (const it of arr) {
							if (!it || !it.identifier || !it.url) continue;
							const id = it.identifier.replace(/^building_entity_/, '');
							const hash = (it.url.match(/[^-]+$/) || [''])[0];
							urlMap[id] = { url: it.url, hash: hash };
						}
						State.entityUrlMap = urlMap;
						emit('lookup');
					}
				} catch (e) {}
			}
		}

		function correctBuildingTypes() {
			for (const id in State.CityEntities) {
				if (!State.CityEntities.hasOwnProperty(id)) continue;
				const e = State.CityEntities[id];
				if (!e.type && e.components && e.components.AllAge && e.components.AllAge.tags && e.components.AllAge.tags.tags) {
					const t = e.components.AllAge.tags.tags.find((v) => v && v.hasOwnProperty('buildingType'));
					if (t) e.type = t.buildingType;
				}
			}
		}


		function handleGameJson(responseText, postDataRaw) {
			let resp;
			try { resp = JSON.parse(responseText); } catch (e) { return; }
			const list = Array.isArray(resp) ? resp : (resp && resp.requestClass ? [resp] : null);
			if (!list) return;

			let reqs = [];
			if (postDataRaw) {
				try {
					let pd = postDataRaw;
					if (pd instanceof ArrayBuffer || pd instanceof Uint8Array) {
						if (pd[0] === 31 && pd[1] === 139 && pd[2] === 8) pd = null;
						else pd = JSON.parse(new TextDecoder().decode(pd));
					} else if (typeof pd === 'string') {
						pd = JSON.parse(pd);
					}
					if (Array.isArray(pd)) reqs = pd;
				} catch (e) { reqs = []; }
			}

			for (const entry of list) {
				if (!entry || !entry.requestClass) continue;
				if (entry.requestClass === 'StartupService' && entry.requestMethod === 'getData') {
					try { Handlers['StartupService|getData'](entry, null); } catch (e) {}
				}
			}
			for (const entry of list) {
				if (!entry || !entry.requestClass) continue;
				if (entry.requestClass === 'StartupService' && entry.requestMethod === 'getData') continue;
				const req = reqs.find((r) => r && r.requestId != null && r.requestId === entry.requestId) || null;
				const key = entry.requestClass + '|' + entry.requestMethod;
				const h = Handlers[key];
				if (h) { try { h(entry, req); } catch (e) {} }
			}
		}


		function mergeCityBuildings(buildings) {
			if (!Array.isArray(buildings)) return;
			let changed = false;
			for (const b of buildings) {
				if (!b || b.id == null) continue;
				if (State.PlayerID && b.player_id !== undefined && b.player_id !== State.PlayerID) continue;
				State.CityMapData[b.id] = b;
				changed = true;
			}
			if (changed) emit('citymap');
		}

		function mergeInventory(items) {
			if (!Array.isArray(items)) return;
			let changed = false;
			for (const it of items) {
				if (it && it.id != null) { State.Inventory[it.id] = it; changed = true; }
			}
			if (changed) emit('inventory');
		}

		const Handlers = {
			'StartupService|getData': (entry) => {
				const rd = entry.responseData;
				if (rd && rd.city_map && Array.isArray(rd.city_map.entities)) {
					logGBPayload('StartupService.getData', entry, rd.city_map.entities);
				}
				if (rd && rd.user_data) {
					State.PlayerID = rd.user_data.player_id || 0;
					let era = rd.user_data.era;
					if (era && era.era) era = era.era;
					State.CurrentEra = era;
				}
				if (rd && Array.isArray(rd.socialbar_list)) {
					updateSocialCounts(rd.socialbar_list);
				}
				if (rd && rd.city_map && Array.isArray(rd.city_map.entities)) {
					State.CityMapData = {};
					for (const e of rd.city_map.entities) State.CityMapData[e.id] = e;
					emit('citymap');
				}
			},
			'CityMapService|getEntities': (entry, req) => {
				const isMain = !req || !Array.isArray(req.requestData) || req.requestData[0] === 'main';
				if (!isMain) return;
				if (Array.isArray(entry.responseData)) {
					logGBPayload('CityMapService.getEntities', entry, entry.responseData);
					State.CityMapData = {};
					for (const e of entry.responseData) State.CityMapData[e.id] = e;
					emit('citymap');
				}
			},
			'CityMapService|moveEntity': (entry) => {
				logGBPayload('CityMapService.moveEntity', entry, entry.responseData);
				mergeCityBuildings(entry.responseData);
			},
			'CityMapService|moveEntities': (entry) => {
				logGBPayload('CityMapService.moveEntities', entry, entry.responseData);
				mergeCityBuildings(entry.responseData);
			},
			'CityMapService|updateEntity': (entry) => {
				logGBPayload('CityMapService.updateEntity', entry, entry.responseData);
				mergeCityBuildings(entry.responseData);
			},
			'CityMapService|placeBuilding': (entry) => {
				logGBPayload('CityMapService.placeBuilding', entry, entry.responseData);
				mergeCityBuildings(entry.responseData);
			},
			'CityMapService|removeBuilding': (entry, req) => {
				const id = req && Array.isArray(req.requestData) && req.requestData[0];
				if (id && State.CityMapData[id]) { delete State.CityMapData[id]; emit('citymap'); }
			},
			'CityProductionService|pickupProduction': (entry) => mergeCityBuildings(entry.responseData && entry.responseData.updatedEntities),
			'CityProductionService|pickupAll': (entry) => mergeCityBuildings(entry.responseData && entry.responseData.updatedEntities),
			'CityProductionService|startProduction': (entry) => mergeCityBuildings(entry.responseData && entry.responseData.updatedEntities),
			'CityProductionService|cancelProduction': (entry) => mergeCityBuildings(entry.responseData && entry.responseData.updatedEntities),
			'InventoryService|getItems': (entry) => mergeInventory(entry.responseData),
			'InventoryService|getItemsByType': (entry) => mergeInventory(entry.responseData),
			'InventoryService|getItem': (entry) => mergeInventory([entry.responseData]),
			'InventoryService|getItemAmount': (entry) => {
				const rd = entry.responseData;
				if (Array.isArray(rd) && State.Inventory[rd[0]]) {
					State.Inventory[rd[0]].inStock = rd[1];
					emit('inventory');
				}
			},
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
			}
		};



		const DB_NAME = 'foe_side_tracker';
		const STORE = 'building_meta';
		let dbPromise = null;
		function getDB() {
			if (dbPromise) return dbPromise;
			dbPromise = new Promise((resolve) => {
				try {
					const req = indexedDB.open(DB_NAME, 1);
					req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
					req.onsuccess = () => resolve(req.result);
					req.onerror = () => resolve(null);
				} catch (e) { resolve(null); }
			});
			return dbPromise;
		}
		async function dbLoadAll() {
			const db = await getDB();
			if (!db) return;
			return new Promise((resolve) => {
				try {
					const tx = db.transaction(STORE, 'readonly');
					const req = tx.objectStore(STORE).getAll();
					req.onsuccess = () => {
						for (const r of req.result) {
							let json = r.json;
							if (typeof json === 'string') { try { json = JSON.parse(json); } catch (e) { json = null; } }
							if (json) State.entityCache[r.id] = { hash: r.hash, json: json };
						}
						resolve();
					};
					req.onerror = () => resolve();
				} catch (e) { resolve(); }
			});
		}
		async function dbPut(entry) {
			const db = await getDB();
			if (!db) return;
			return new Promise((resolve) => {
				try {
					const tx = db.transaction(STORE, 'readwrite');
					tx.objectStore(STORE).put(entry);
					tx.oncomplete = () => resolve();
					tx.onerror = () => resolve();
				} catch (e) { resolve(); }
			});
		}


		function neededEntityIds() {
			const ids = new Set();
			Config.GreatBuildings.forEach((id) => ids.add(id));
			ids.add(Config.EasterBonus.icon);
			Config.EasterBonus.ids.forEach((id) => ids.add(id));
			ids.add(Config.Expedition.icon);
			Config.Expedition.ids.forEach((id) => ids.add(id));
			ids.add(Config.SummerBonus.icon);
			Config.SummerBonus.ids.forEach((id) => ids.add(id));
			for (const b of Object.values(State.CityMapData)) {
				if (b && b.cityentity_id) ids.add(b.cityentity_id);
			}
			return Array.from(ids);
		}

		function ensureEntities(ids) {
			if (!State.entityUrlMap) return;
			for (const id of ids) {
				if (State.CityEntities[id]) continue;
				if (State.inflight.has(id)) continue;
				const meta = State.entityUrlMap[id];
				if (!meta) continue;
				const cached = State.entityCache[id];
				if (cached && cached.hash === meta.hash) {
					let json = cached.json;
					if (typeof json === 'string') { try { json = JSON.parse(json); } catch (e) { json = null; } }
					if (json) {
						State.CityEntities[id] = json;
						State.entityCache[id] = { hash: cached.hash, json: json };
						emit('entities');
					}
					continue;
				}
				State.inflight.add(id);
				fetchEntity(id, meta);
			}
		}

		function fetchEntity(id, meta) {
			fetchText(meta.url).then((text) => {
				let json;
				try { json = JSON.parse(text); } catch (e) { json = null; }
				if (json) {
					State.CityEntities[id] = json;
					State.entityCache[id] = { hash: meta.hash, json: json };
					dbPut({ id: id, hash: meta.hash, json: text });
					emit('entities');
				}
			}).catch(() => {}).then(() => State.inflight.delete(id));
		}


		async function initSrcLinks() {
			const script = await waitForForgeHX();
			if (!script) return;
			try {
				const txt = await fetchText(script.src);
				const marker = 'baseUrl,';
				let start = txt.indexOf(marker);
				if (start === -1) return;
				start += marker.length;
				const rest = txt.substring(start);
				const end = rest.indexOf('}') + 1;
				if (end <= 0) return;
				State.FileList = JSON.parse(rest.substring(0, end));
				emit('filelist');
			} catch (e) {}
		}

		function waitForForgeHX() {
			return new Promise((resolve) => {
				let tries = 0;
				const tick = () => {
					const s = document.querySelector('script[src*="ForgeHX"]');
					if (s) return resolve(s);
					if (tries++ > 600) return resolve(null);
					setTimeout(tick, 100);
				};
				tick();
			});
		}



		function currentStateHasDiamonds(b) {
			const s = b.state;
			if (!s) return false;
			if (s.productionOption && Array.isArray(s.productionOption.products)) {
				for (const p of s.productionOption.products) {
					if (p.type === 'resources' && p.playerResources && p.playerResources.resources && p.playerResources.resources.premium) return true;
					if (p.type === 'guildResources' && p.guildResources && p.guildResources.resources && p.guildResources.resources.premium) return true;
				}
			}
			if (s.current_product) {
				const cp = s.current_product;
				if (cp.product && cp.product.resources && cp.product.resources.premium) return true;
				if (cp.guildProduct && cp.guildProduct.resources && cp.guildProduct.resources.premium) return true;
			}
			return false;
		}

		function metadataHasDiamonds(entity, era) {
			if (!entity) return false;
			const comps = entity.components;
			if (comps) {
				const checkProd = (prod) => {
					if (!prod || !Array.isArray(prod.options)) return false;
					for (const opt of prod.options) {
						const products = opt.products || (opt.product ? [opt.product] : []);
						for (const pr of products) {
							if (!pr) continue;
							if (pr.type === 'resources' && pr.playerResources && pr.playerResources.resources && pr.playerResources.resources.premium) return true;
							if (pr.type === 'guildResources' && pr.guildResources && pr.guildResources.resources && pr.guildResources.resources.premium) return true;
						}
					}
					return false;
				};
				if (comps[era] && checkProd(comps[era].production)) return true;
				if (comps.AllAge && checkProd(comps.AllAge.production)) return true;
				const chain = comps.AllAge && comps.AllAge.chain;
				if (chain && chain.config && Array.isArray(chain.config.bonuses)) {
					for (const bonus of chain.config.bonuses) {
						for (const prod of (bonus.productions || [])) {
							if (prod && prod.playerResources && prod.playerResources.resources && prod.playerResources.resources.premium) return true;
						}
					}
				}
			}
			if (Array.isArray(entity.available_products)) {
				for (const ap of entity.available_products) {
					if (ap && ap.product && ap.product.resources && ap.product.resources.premium) return true;
				}
			}
			if (Array.isArray(entity.abilities)) {
				for (const ab of entity.abilities) {
					const ar = ab && ab.additionalResources;
					if (ar) {
						if (ar[era] && ar[era].resources && ar[era].resources.premium) return true;
						if (ar.AllAge && ar.AllAge.resources && ar.AllAge.resources.premium) return true;
					}
				}
			}
			return false;
		}

		function buildingProducesDiamonds(b) {
			if (!b || !b.cityentity_id) return false;
			if (currentStateHasDiamonds(b)) return true;
			const entity = State.CityEntities[b.cityentity_id];
			const era = getEraName(b.cityentity_id, b.level);
			return metadataHasDiamonds(entity, era);
		}

		function countDiamonds() {
			let n = 0;
			for (const b of Object.values(State.CityMapData)) {
				if (State.PlayerID && b.player_id !== undefined && b.player_id !== State.PlayerID) continue;
				if (buildingProducesDiamonds(b)) n++;
			}
			return n;
		}

		function diamondBuildingNames() {
			const out = [];
			for (const b of Object.values(State.CityMapData)) {
				if (State.PlayerID && b.player_id !== undefined && b.player_id !== State.PlayerID) continue;
				if (buildingProducesDiamonds(b)) {
					const e = State.CityEntities[b.cityentity_id];
					out.push((e && e.name) || b.cityentity_id);
				}
			}
			return out;
		}

		function diamondBuildingIds() {
			const out = [];
			for (const b of Object.values(State.CityMapData)) {
				if (State.PlayerID && b.player_id !== undefined && b.player_id !== State.PlayerID) continue;
				if (buildingProducesDiamonds(b)) out.push(b.id);
			}
			return out;
		}



		function countCity(cityBuildings, ids) {
			let n = 0;
			for (const b of cityBuildings) if (ids.indexOf(b.cityentity_id) !== -1) n++;
			return n;
		}

		function countInv(inv, ids) {
			let n = 0;
			for (const it of inv) {
				const ce = it.item && it.item.cityEntityId;
				if (ids.indexOf(ce) !== -1) n += (it.inStock || 0);
			}
			return n;
		}

		function iconHtml(urls, fallback) {
			const list = Array.isArray(urls) ? urls : (urls ? [urls] : []);
			if (list.length === 0) return '<span class="st-icon st-icon-fallback">' + (fallback || '♦') + '</span>';
			let html = '<span class="st-icon-wrap">';
			for (let i = 0; i < list.length; i++) {
				const onerr = "this.style.display='none';var n=this.nextElementSibling;if(n)n.style.display='';";
				html += '<img class="st-icon" src="' + escapeAttr(list[i]) + '" alt="" style="display:' + (i === 0 ? '' : 'none') + '" onerror="' + onerr + '" />';
			}
			html += '<span class="st-icon st-icon-fallback" style="display:none">' + (fallback || '♦') + '</span>';
			html += '</span>';
			return html;
		}

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

		function renderBuildings() {
			const cityBuildings = Object.values(State.CityMapData);
			const inv = Object.values(State.Inventory);
			let html = '';

			html += renderBuildingItem('Easter Bonus', Config.EasterBonus.icon, countCity(cityBuildings, Config.EasterBonus.ids), countInv(inv, Config.EasterBonus.ids));
			html += renderBuildingItem('Expedition', Config.Expedition.icon, countCity(cityBuildings, Config.Expedition.ids), countInv(inv, Config.Expedition.ids));

			const summerCity = countCity(cityBuildings, Config.SummerBonus.ids);
			let summerInv = countInv(inv, Config.SummerBonus.ids);
			const kitCount = inv.reduce((s, it) => {
				const kitId = (it.item && (it.item.selectionKitId || it.item.upgradeItemId)) || null;
				return Config.SummerBonus.specialKitIds.indexOf(kitId) !== -1 ? s + (it.inStock || 0) : s;
			}, 0);
			summerInv += Math.floor(kitCount / Config.SummerBonus.kitsPerBuilding);
			html += renderBuildingItem('Summer Bonus', Config.SummerBonus.icon, summerCity, summerInv);

			return html;
		}

		function renderBuildingItem(title, iconEntityId, city, inv) {
			const icon = getBuildingIconUrl(iconEntityId);
			return '<div class="st-building-item" title="' + escapeAttr(title) + '">' +
				iconHtml(icon, '◆') +
				'<span class="st-building-count">' + city + ' (' + inv + ')</span>' +
				'</div>';
		}


		const CSS = `
#foe-side-tracker {
	position: fixed; top: 40px; right: 70px; z-index: 999999;
	background: rgba(30,30,40,0.92); border: 1px solid #8c6b3f; border-radius: 4px;
	padding: 6px 10px; color: #e0d0b0; font-size: 12px; min-width: 180px; max-width: 300px;
	font-family: sans-serif; line-height: 1.4; user-select: none;
}
#foe-side-tracker.st-hidden { display: none !important; }
.st-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #8c6b3f; padding-bottom: 4px; margin-bottom: 6px; cursor: move; }
.st-title { font-weight: bold; font-size: 13px; color: #f0e0c0; cursor: move; }
.st-diamond-badge { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border: 2px solid #cc3333; border-radius: 4px; background: rgba(0,0,0,0.5); position: relative; cursor: pointer; }
.st-diamond-badge.active { border-color: #33cc33; }
.st-diamond-badge .st-icon-wrap { width: 18px; height: 18px; }
.st-diamond-badge .st-icon { width: 18px; height: 18px; background: none; padding: 0; border-radius: 0; }
.st-diamond-badge .st-icon-fallback { width: 18px; height: 18px; font-size: 14px; }
.st-diamond-badge .st-count { position: absolute; top: -7px; right: -7px; background: #cc3333; color: white; font-size: 10px; font-weight: bold; padding: 0 4px; border-radius: 8px; min-width: 14px; text-align: center; line-height: 14px; }
.st-diamond-badge.active .st-count { background: #33cc33; }
.st-body { display: flex; flex-direction: column; gap: 8px; }
.st-section { display: flex; justify-content: space-around; gap: 8px; flex-wrap: wrap; }
.st-gb-item, .st-building-item { display: flex; flex-direction: column; align-items: center; min-width: 40px; }
.st-icon-wrap { position: relative; width: 32px; height: 32px; }
.st-icon { width: 32px; height: 32px; object-fit: contain; background: rgba(0,0,0,0.3); border-radius: 3px; padding: 2px; box-sizing: border-box; }
.st-icon-fallback { display: flex; align-items: center; justify-content: center; color: #9ab; font-size: 16px; }
.st-gb-lvl, .st-building-count { font-size: 14px; margin-top: 2px; font-weight: bold; }
.st-gb-lvl { color: #f0e0c0; }
.st-building-count { color: #e0d0b0; }
.st-diamond-list { margin-top: 6px; border-top: 1px solid #8c6b3f; padding-top: 6px; font-size: 11px; color: #c0b090; max-height: 160px; overflow-y: auto; }
.st-diamond-list.st-dl-hidden { display: none; }
.st-diamond-list div { padding: 1px 0; }
.st-min-btn { cursor: pointer; color: #c0a060; font-weight: bold; padding: 0 4px; }
`;

		let widgetBuilt = false;
		let updateScheduled = false;
		let minimized = false;
		let dlHidden = true;

		const POS_KEY = 'foe_side_tracker_pos';

		function loadPos() {
			try {
				const raw = localStorage.getItem(POS_KEY);
				if (!raw) return null;
				const p = JSON.parse(raw);
				if (p && typeof p.x === 'number' && typeof p.y === 'number') return p;
			} catch (e) {}
			return null;
		}

		function savePos(x, y) {
			try { localStorage.setItem(POS_KEY, JSON.stringify({ x: x, y: y })); } catch (e) {}
		}

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

		function applyPos(root, x, y) {
			const w = root.offsetWidth, h = root.offsetHeight;
			const maxX = window.innerWidth - w;
			const maxY = window.innerHeight - h;
			x = Math.max(0, Math.min(x, maxX));
			y = Math.max(0, Math.min(y, maxY));
			root.style.left = x + 'px';
			root.style.top = y + 'px';
			root.style.right = 'auto';
			return { x: x, y: y };
		}

		function makeDraggable(root) {
			const header = root.querySelector('.st-header');
			if (!header) return;
			let dragging = false;
			let startX = 0, startY = 0, originX = 0, originY = 0;

			header.addEventListener('mousedown', (e) => {
				if (e.target.closest('.st-min-btn') || e.target.closest('.st-expand-btn') || e.target.closest('.st-diamond-badge')) return;
				dragging = true;
				startX = e.clientX;
				startY = e.clientY;
				const rect = root.getBoundingClientRect();
				originX = rect.left;
				originY = rect.top;
				e.preventDefault();
			});

			document.addEventListener('mousemove', (e) => {
				if (!dragging) return;
				const dx = e.clientX - startX;
				const dy = e.clientY - startY;
				const pos = applyPos(root, originX + dx, originY + dy);
				savePos(pos.x, pos.y);
			});

			document.addEventListener('mouseup', () => { dragging = false; });
		}

		function ensureWidget() {
			if (widgetBuilt) return;
			if (!document.body) return;
			widgetBuilt = true;
			injectCSS();
			const root = document.createElement('div');
			root.id = 'foe-side-tracker';
			root.innerHTML =
				'<div class="st-header">' +
					'<span class="st-title" id="st-title">' + escapeAttr(i18n('Boxes.BuildingTracker.Title')) + '</span>' +
					'<span style="display:flex;align-items:center;gap:6px;">' +
						'<span class="st-expand-btn" id="st-expand-btn" title="Expand">+</span>' +
						'<span class="st-min-btn" id="st-min-btn" title="Minimize">–</span>' +
						'<span class="st-diamond-badge" id="st-badge" data-count="0">' +
							iconHtml(getPremiumIconUrl(), '♦') +
							'<span class="st-count">0</span>' +
						'</span>' +
					'</span>' +
				'</div>' +
				'<div class="st-body" id="st-body">' +
					'<div class="st-section st-gbs" id="st-gbs"></div>' +
					'<div class="st-section st-buildings" id="st-buildings"></div>' +
					'<div class="st-diamond-list st-dl-hidden" id="st-dlist"></div>' +
				'</div>';
			document.body.appendChild(root);

			const saved = loadPos();
			if (saved) applyPos(root, saved.x, saved.y);
			makeDraggable(root);

			document.getElementById('st-min-btn').addEventListener('click', () => {
				minimized = !minimized;
				const body = document.getElementById('st-body');
				if (body) body.style.display = minimized ? 'none' : '';
				document.getElementById('st-min-btn').textContent = minimized ? '+' : '–';
			});
			const expandBtn = document.getElementById('st-expand-btn');
			if (expandBtn) {
				expandBtn.addEventListener('click', () => {
					State.ExtendedMode = !State.ExtendedMode;
					saveExtended(State.ExtendedMode);
					scheduleUpdate();
				});
			}
			document.getElementById('st-badge').addEventListener('click', () => {
				if (typeof Productions !== 'undefined' && Productions && typeof Productions.ShowOnMap === 'function') {
					const ids = diamondBuildingIds();
					if (ids.length > 0) {
						try { Productions.ShowOnMap(ids); return; } catch (e) {}
					}
				}
				dlHidden = !dlHidden;
				const dl = document.getElementById('st-dlist');
				if (dl) dl.classList.toggle('st-dl-hidden', dlHidden);
				renderDiamondList();
			});
			const title = document.getElementById('st-title');
			if (title) title.title = i18n('Menu.BuildingTracker.Desc');
		}

		function injectCSS() {
			const style = document.createElement('style');
			style.textContent = CSS;
			(document.head || document.documentElement).appendChild(style);
		}

		function scheduleUpdate() {
			ensureWidget();
			ensureEntities(neededEntityIds());
			if (updateScheduled) return;
			updateScheduled = true;
			queueMicrotask(() => { updateScheduled = false; render(); });
		}

		function render() {
			if (!widgetBuilt) return;
			const gbs = document.getElementById('st-gbs');
			if (gbs) gbs.innerHTML = renderGBs();
			const bld = document.getElementById('st-buildings');
			if (bld) bld.innerHTML = renderBuildings();
			const badge = document.getElementById('st-badge');
			const count = countDiamonds();
			if (badge) {
				badge.setAttribute('data-count', String(count));
				badge.classList.toggle('active', count > 0);
				const cnt = badge.querySelector('.st-count');
				if (cnt) cnt.textContent = String(count);
				badge.title = count + ' building' + (count === 1 ? '' : 's') + ' producing diamonds' +
					(typeof Productions !== 'undefined' && Productions && typeof Productions.ShowOnMap === 'function' ? ' — click to highlight on city map' : ' — click to list');
				const oldIcon = badge.querySelector('.st-icon-wrap, .st-icon-fallback');
				const premiumUrl = getPremiumIconUrl();
				if (oldIcon && premiumUrl) {
					const newIcon = iconHtml(premiumUrl, '♦');
					if (oldIcon.outerHTML !== newIcon) oldIcon.outerHTML = newIcon;
				}
			}
			if (!dlHidden) renderDiamondList();
			const expandBtn = document.getElementById('st-expand-btn');
			if (expandBtn) expandBtn.textContent = State.ExtendedMode ? '−' : '+';
		}

		function renderDiamondList() {
			const dl = document.getElementById('st-dlist');
			if (!dl) return;
			const names = diamondBuildingNames();
			if (!names.length) { dl.innerHTML = '<div>No diamond buildings</div>'; return; }
			dl.innerHTML = names.map((n) => '<div>' + escapeAttr(n) + '</div>').join('');
		}


		on('citymap', scheduleUpdate);
		on('inventory', scheduleUpdate);
		on('entities', scheduleUpdate);
		on('lookup', scheduleUpdate);
		on('filelist', scheduleUpdate);
		on('social', scheduleUpdate);

		dbLoadAll().then(() => { emit('entities'); });

		initSrcLinks();

		window.__foeSideTrackerDebug = {
			State,
			Config,
			Debug,
			getTrackedGBs: () => Object.values(State.CityMapData).filter((b) =>
				b && b.type === 'greatbuilding' && Config.GreatBuildings.indexOf(b.cityentity_id) !== -1
			),
			logCurrentGBs: () => {
				const gbs = window.__foeSideTrackerDebug.getTrackedGBs();
				console.log('[FoE Side Tracker] Current tracked GBs:', gbs);
				return gbs;
			}
		};

		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', scheduleUpdate, { once: true });
		} else {
			scheduleUpdate();
		}

	} catch (e) {
		console.error('FoE Side Tracker init failed:', e);
	}
})();
