importScripts("shared.js");

let creatingOffscreen = null;
let sitesQueue = Promise.resolve();
let menuQueue = Promise.resolve();
let tabsCache = null;
let tabsTimer = 0;
let syncTimer = 0;
const saveTimers = new Map();
const historyPending = new Map();

async function hasOffscreen() {

	const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
	return contexts.length > 0;

}

async function ensureOffscreen() {

	if (await hasOffscreen()) return;
	creatingOffscreen ??= chrome.offscreen.createDocument({
		url: "offscreen.html",
		reasons: ["USER_MEDIA"],
		justification: "Processes captured tab audio for volume boosting, equalizer and effects.",
	}).finally(() => {
		creatingOffscreen = null;
	});
	await creatingOffscreen;

}

function toOffscreen(message) {
	return chrome.runtime.sendMessage({ target: "offscreen", ...message });
}

function toDirect(tabId, message) {
	return chrome.tabs.sendMessage(tabId, { target: "direct", ...message }, { frameId: 0 }).catch(() => null);
}

async function injectDirect(tabId) {

	const [probe] = await chrome.scripting.executeScript({ target: { tabId }, func: () => Boolean(globalThis.blackpillDirect) });
	if (probe?.result) return;
	await chrome.scripting.executeScript({ target: { tabId }, files: ["shared.js", "engine.js", "direct.js"] });

}

async function readStore() {

	const data = await chrome.storage.local.get(["last", "stacks", "sites", "prefs", "stats"]);
	return {
		last: data.last,
		stacks: Array.isArray(data.stacks) ? data.stacks : [],
		sites: data.sites && typeof data.sites === "object" ? data.sites : {},
		prefs: mergePrefs(data.prefs),
		stats: data.stats ?? {},
	};

}

async function loadTabs() {

	if (tabsCache) return tabsCache;
	const { tabs } = await chrome.storage.session.get("tabs");
	tabsCache ??= new Map(Object.entries(tabs ?? {}).map(([tabId, entry]) => [Number(tabId), entry]));
	return tabsCache;

}

function saveTabs(isImmediate) {

	clearTimeout(tabsTimer);
	const write = () => chrome.storage.session.set({ tabs: Object.fromEntries(tabsCache) });
	if (isImmediate) return write();
	tabsTimer = setTimeout(write, 150);

}

async function initialSettings(host) {

	const { last, stacks, sites, prefs, stats } = await readStore();
	if (host && sites[host]) return mergeSettings(sites[host]);

	for (const id of [stackIdForHost(host, prefs), prefs.newTabs]) {
		const stack = id && id !== "last" ? findStack(id, stacks) : null;
		if (stack && isUnlocked(stack, stats)) return stackSettings(stack);
	}
	return mergeSettings(last);

}

function updateSites(mutate) {

	sitesQueue = sitesQueue.then(async () => {
		const { sites } = await chrome.storage.local.get("sites");
		const next = sites && typeof sites === "object" ? sites : {};
		if (mutate(next) === false) return;
		await chrome.storage.local.set({ sites: next });
	}).catch(() => {});
	return sitesQueue;

}

function debounce(key, task, delay = 400) {

	clearTimeout(saveTimers.get(key));
	saveTimers.set(key, setTimeout(() => {
		saveTimers.delete(key);
		task();
	}, delay));

}

function persist(settings, host) {

	debounce("last", () => chrome.storage.local.set({ last: settings }));
	if (!host) return;

	debounce(`site:${host}`, () => updateSites(sites => {
		if (!sites[host]) return false;
		sites[host] = settings;
	}));

}

async function updateBadge(tabId, settings) {

	await Promise.all([
		chrome.action.setBadgeText({ tabId, text: settings.muted ? "M" : String(Math.round(settings.volume)) }),
		chrome.action.setBadgeBackgroundColor({ tabId, color: isHot(settings) ? "#D21F2B" : "#000000" }),
		chrome.action.setBadgeTextColor({ tabId, color: "#FFFFFF" }),
	]).catch(() => {});

}

function installFullscreenFix(tabId) {

	return chrome.scripting.executeScript({
		target: { tabId },
		func: () => {
			if (globalThis.blackpillFullscreen) return;
			globalThis.blackpillFullscreen = true;
			document.addEventListener("fullscreenchange", () => {
				chrome.runtime.sendMessage({ target: "worker", type: "fullscreen", isOn: Boolean(document.fullscreenElement) }).catch(() => {});
			});
		},
	}).catch(() => {});

}

function directError(reason) {

	const reasons = {
		"no-media": "Direct mode needs a video or audio player on the page. Switch the engine to Auto or Capture in settings.",
		protected: "This page's media is protected or from another site, so only Capture mode can boost it.",
		autoplay: "Press play on the page first, then try again.",
		blocked: "This page blocks Direct mode. Use Capture mode for it.",
	};
	return reasons[reason] ?? "Direct mode isn't available on this page.";

}

async function startTab(tabId, settings, info, options = {}) {

	const { prefs } = await readStore();
	const merged = mergeSettings(settings);
	const tabs = await loadTabs();
	const existing = tabs.get(tabId);
	if (existing && !options.mode) {
		existing.settings = merged;
		saveTabs();
		await toEngine(tabId, { type: "set", settings: merged });
		await updateBadge(tabId, merged);
		return { ok: true, mode: existing.mode };
	}

	const wantsCapture = options.mode === "capture" || (!options.mode && (options.sinkId || prefs.engineMode === "capture"));
	let mode = "capture";
	let reason = "";
	if (!wantsCapture) {
		try {
			await injectDirect(tabId);
			const result = await toDirect(tabId, { type: "start", settings: merged, isGuardEnabled: prefs.cpuGuard });
			if (result?.ok) mode = "direct";
			else reason = result?.reason ?? "unavailable";
		} catch {
			reason = "unavailable";
		}
		if (mode !== "direct" && (options.mode === "direct" || (!options.mode && prefs.engineMode === "direct"))) {
			return { ok: false, error: directError(reason) };
		}
	}

	if (mode === "capture") {
		if (!chrome.tabCapture) return { ok: false, error: directError(reason) };
		const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
		await ensureOffscreen();
		const result = await toOffscreen({ type: "start", tabId, streamId, settings: merged, info, sinkId: options.sinkId ?? "", isGuardEnabled: prefs.cpuGuard });
		if (result?.error) return { ok: false, error: result.error };
		installFullscreenFix(tabId);
	}

	tabs.set(tabId, { mode, settings: merged, info: info ?? {}, sinkId: options.sinkId ?? "", reason, compare: "boosted", isGuarded: false });
	await saveTabs(true);
	await updateBadge(tabId, merged);
	persist(merged, info?.host);
	return { ok: true, mode, reason };

}

async function stopTab(tabId) {

	const tabs = await loadTabs();
	const entry = tabs.get(tabId);
	if (entry?.mode === "direct") await toDirect(tabId, { type: "stop" });
	else if (await hasOffscreen()) await toOffscreen({ type: "stop", tabId });
	tabs.delete(tabId);
	await saveTabs(true);
	await chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});

}

async function toEngine(tabId, message) {

	const entry = (await loadTabs()).get(tabId);
	if (!entry) return null;
	if (entry.mode === "direct") return toDirect(tabId, message);
	if (!(await hasOffscreen())) return null;
	return toOffscreen({ ...message, tabId });

}

async function readHistory(tabId) {

	const key = `history:${tabId}`;
	return (await chrome.storage.session.get(key))[key] ?? { past: [], future: [] };

}

function writeHistory(tabId, history) {

	if (history.past.length > 50) history.past.splice(0, history.past.length - 50);
	if (history.future.length > 50) history.future.splice(0, history.future.length - 50);
	return chrome.storage.session.set({ [`history:${tabId}`]: history });

}

async function flushHistory(tabId) {

	const pending = historyPending.get(tabId);
	if (!pending) return;

	clearTimeout(pending.timer);
	historyPending.delete(tabId);
	const history = await readHistory(tabId);
	history.past.push(pending.before);
	history.future = [];
	await writeHistory(tabId, history);

}

function rememberHistory(tabId, before) {

	const pending = historyPending.get(tabId) ?? { before };
	clearTimeout(pending.timer);
	pending.timer = setTimeout(() => flushHistory(tabId), 700);
	historyPending.set(tabId, pending);

}

async function historyState(tabId) {

	const history = await readHistory(tabId);
	return { canUndo: history.past.length > 0 || historyPending.has(tabId), canRedo: history.future.length > 0 };

}

async function setTab(tabId, settings, host, isUser) {

	const merged = mergeSettings(settings);
	persist(merged, host);
	const entry = (await loadTabs()).get(tabId);
	if (!entry) return { ok: false };

	if (isUser) rememberHistory(tabId, entry.settings);
	entry.settings = merged;
	saveTabs();
	const result = await toEngine(tabId, { type: "set", settings: merged });
	await updateBadge(tabId, merged);
	return { ok: Boolean(result?.ok), ...(await historyState(tabId)) };

}

async function stepHistory(tabId, isUndo) {

	await flushHistory(tabId);
	const entry = (await loadTabs()).get(tabId);
	const history = await readHistory(tabId);
	const source = isUndo ? history.past : history.future;
	if (!entry || !source.length) return { ok: false, ...(await historyState(tabId)) };

	const next = mergeSettings(source.pop());
	(isUndo ? history.future : history.past).push(entry.settings);
	await writeHistory(tabId, history);
	await setTab(tabId, next, entry.info?.host, false);
	return { ok: true, settings: next, ...(await historyState(tabId)) };

}

async function readSlots(tabId) {

	const key = `ab:${tabId}`;
	return (await chrome.storage.session.get(key))[key] ?? { active: "A", other: null };

}

async function setCompare(tabId, mode) {

	const entry = (await loadTabs()).get(tabId);
	if (!entry) return { ok: false };

	entry.compare = mode;
	saveTabs();
	await toEngine(tabId, { type: "compare", mode });
	return { ok: true, compare: mode };

}

async function toggleRecord(tabId) {

	const result = await toEngine(tabId, { type: "record" });
	return { ok: Boolean(result?.ok), isRecording: Boolean(result?.isRecording) };

}

async function applyCommand(command, settings) {

	const { prefs, stacks, stats } = await readStore();
	const cap = () => maxVolume(settings, prefs);

	if (command.startsWith("stack:")) {
		const stack = findStack(command.slice(6), stacks);
		if (!stack || !isUnlocked(stack, stats)) return false;
		Object.assign(settings, stackSettings(stack));
		settings.volume = Math.min(settings.volume, cap());
		return true;
	}

	switch (command) {
		case "volume-up": {
			const step = settings.volume >= prefs.normalCap ? prefs.volumeStep * 10 : prefs.volumeStep;
			settings.volume = Math.min(cap(), settings.volume + step);
			settings.muted = false;
			return true;
		}
		case "volume-down": {
			const step = settings.volume > prefs.normalCap ? prefs.volumeStep * 10 : prefs.volumeStep;
			settings.volume = Math.max(0, settings.volume - step);
			settings.muted = false;
			return true;
		}
		case "volume-max":
			settings.volume = cap();
			settings.muted = false;
			return true;
		case "toggle-mute":
			settings.muted = !settings.muted;
			return true;
		case "toggle-distortion":
			settings.distortion = !settings.distortion;
			return true;
		case "toggle-automog":
			settings.agc = !settings.agc;
			return true;
		case "toggle-gigamog":
			settings.multiband = !settings.multiband;
			return true;
		case "toggle-ascend":
			settings.ultimate = !settings.ultimate;
			settings.volume = Math.min(settings.volume, cap());
			return true;
		case "next-stack": {
			const all = [...allBuiltInStacks.filter(stack => isUnlocked(stack, stats)), ...stacks];
			const { stackCursor = -1 } = await chrome.storage.session.get("stackCursor");
			const next = (stackCursor + 1) % all.length;
			await chrome.storage.session.set({ stackCursor: next });
			Object.assign(settings, stackSettings(all[next]));
			settings.volume = Math.min(settings.volume, cap());
			return true;
		}
		case "next-voice": {
			const presets = Object.values(voicePresets);
			const { voiceCursor = 0 } = await chrome.storage.session.get("voiceCursor");
			const next = (voiceCursor + 1) % presets.length;
			await chrome.storage.session.set({ voiceCursor: next });
			Object.assign(settings, presets[next].patch);
			return true;
		}
		case "reset-tab":
			Object.assign(settings, defaultSettings());
			return true;
		default:
			return false;
	}

}

async function runAction(action, tab) {

	if (!tab?.id) return;
	const tabId = tab.id;
	const host = hostOf(tab.url);
	const info = { title: tab.title, favIconUrl: tab.favIconUrl, host };
	const entry = (await loadTabs()).get(tabId);

	if (action === "toggle-power") {
		if (entry) await stopTab(tabId);
		else await startTab(tabId, await initialSettings(host), info);
		return;
	}
	if (action === "undo" || action === "redo") {
		if (entry) await stepHistory(tabId, action === "undo");
		return;
	}
	if (action === "toggle-original") {
		if (entry) await setCompare(tabId, entry.compare === "original" ? "boosted" : "original");
		return;
	}
	if (action === "toggle-record") {
		if (!entry && !(await startTab(tabId, await initialSettings(host), info)).ok) return;
		await toggleRecord(tabId);
		return;
	}

	const settings = entry ? { ...entry.settings } : await initialSettings(host);
	if (!(await applyCommand(action, settings))) return;
	if (entry) await setTab(tabId, settings, host, true);
	else await startTab(tabId, settings, info);

}

function rebuildMenus() {

	menuQueue = menuQueue.then(async () => {
		const { stacks, stats } = await readStore();
		const contexts = ["page", "video", "audio", "action"];
		const create = properties => new Promise(resolve => chrome.contextMenus.create({ ...properties, contexts }, () => resolve(chrome.runtime.lastError)));
		await chrome.contextMenus.removeAll();
		await create({ id: "toggle-power", title: "Start or stop mogging this tab" });
		await create({ id: "toggle-mute", title: "Ghost (mute) this tab" });
		await create({ id: "toggle-original", title: "Hear the original" });
		await create({ id: "toggle-record", title: "Record this tab" });
		await create({ id: "stacks", title: "Apply stack" });
		for (const stack of [...allBuiltInStacks.filter(item => isUnlocked(item, stats)), ...stacks]) {
			await create({ id: `stack:${stack.id}`, parentId: "stacks", title: stack.name });
		}
	}).catch(() => {});
	return menuQueue;

}

async function syncAutostart() {

	const { prefs } = await readStore();
	const isGranted = await chrome.permissions.contains({ origins: ["<all_urls>"] });
	const registered = await chrome.scripting.getRegisteredContentScripts({ ids: ["autostart"] });
	const shouldRun = prefs.autoStart && isGranted && prefs.engineMode !== "capture";
	if (shouldRun && !registered.length) {
		await chrome.scripting.registerContentScripts([{ id: "autostart", matches: ["<all_urls>"], js: ["autostart.js"], runAt: "document_idle" }]);
	} else if (!shouldRun && registered.length) {
		await chrome.scripting.unregisterContentScripts({ ids: ["autostart"] });
	}

}

async function syncPayload() {

	const { prefs, stacks } = await readStore();
	const codes = [];
	for (const stack of stacks) codes.push({ id: stack.id, code: await encodeShareCode(stack.settings, stack.name) });
	return { prefs, codes };

}

async function pushSync() {

	const payload = await syncPayload();
	if (!payload.prefs.sync) return;

	const hash = JSON.stringify(payload);
	const { syncHash } = await chrome.storage.local.get("syncHash");
	if (hash === syncHash) return;

	const items = { "bp:prefs": payload.prefs };
	for (const item of payload.codes) items[`bp:stack:${item.id}`] = item.code;
	const existing = Object.keys(await chrome.storage.sync.get(null)).filter(key => key.startsWith("bp:stack:") && !(key in items));
	await chrome.storage.local.set({ syncHash: hash });
	if (existing.length) await chrome.storage.sync.remove(existing);
	await chrome.storage.sync.set(items);

}

async function pullSync() {

	const { prefs: localPrefs } = await readStore();
	if (!localPrefs.sync) return;

	const remote = await chrome.storage.sync.get(null);
	if (!remote["bp:prefs"]) return;

	const codes = Object.entries(remote)
		.filter(([key]) => key.startsWith("bp:stack:"))
		.map(([key, code]) => ({ id: key.slice(9), code }))
		.sort((first, second) => first.id.localeCompare(second.id));
	const stacks = [];
	for (const item of codes) {
		try {
			const decoded = await decodeShareCode(item.code);
			stacks.push({ id: item.id, name: decoded.name || "Stack", settings: decoded.settings });
		} catch {
			continue;
		}
	}
	const prefs = mergePrefs({ ...remote["bp:prefs"], sync: true });
	const local = await syncPayload();
	const order = new Map(local.codes.map((item, index) => [item.id, index]));
	stacks.sort((first, second) => (order.get(first.id) ?? 1e9) - (order.get(second.id) ?? 1e9));

	const next = { prefs, codes: [] };
	for (const stack of stacks) next.codes.push({ id: stack.id, code: await encodeShareCode(stack.settings, stack.name) });
	const hash = JSON.stringify(next);
	if (hash === JSON.stringify(local)) {
		await chrome.storage.local.set({ syncHash: hash });
		return;
	}
	await chrome.storage.local.set({ syncHash: hash, stacks, prefs });

}

async function recordHeartbeat(entries) {

	const { stats } = await readStore();
	const next = { boostedMs: 0, ascendedMs: 0, smashedMs: 0, peakVolume: 0, ...stats };
	const live = entries.filter(entry => entry && !entry.muted);
	const before = allBuiltInStacks.filter(stack => isUnlocked(stack, next)).length;
	if (live.some(entry => entry.volume > 100)) next.boostedMs += 15000;
	if (live.some(entry => entry.ultimate)) next.ascendedMs += 15000;
	if (live.some(entry => entry.distortion)) next.smashedMs += 15000;
	next.peakVolume = Math.max(next.peakVolume, ...live.map(entry => entry.volume));
	await chrome.storage.local.set({ stats: next });
	if (allBuiltInStacks.filter(stack => isUnlocked(stack, next)).length > before) rebuildMenus();

}

async function broadcastGuard(isEnabled) {

	if (await hasOffscreen()) await toOffscreen({ type: "guard", isEnabled });
	for (const [tabId, entry] of await loadTabs()) {
		if (entry.mode === "direct") await toDirect(tabId, { type: "guard", isEnabled });
	}

}

const handlers = {

	async get({ tabId, host }) {

		const [entry, { sites }, slots, history] = await Promise.all([
			loadTabs().then(tabs => tabs.get(tabId)),
			readStore(),
			readSlots(tabId),
			historyState(tabId),
		]);
		const base = { isRemembered: Boolean(host && sites[host]), slot: slots.active, hasOther: Boolean(slots.other), ...history };
		if (!entry) return { ...base, isActive: false, settings: await initialSettings(host) };

		if (entry.mode === "capture") installFullscreenFix(tabId);
		updateBadge(tabId, entry.settings);
		return { ...base, isActive: true, mode: entry.mode, settings: entry.settings, compare: entry.compare ?? "boosted", sinkId: entry.sinkId ?? "", isGuarded: Boolean(entry.isGuarded), reason: entry.reason ?? "" };

	},

	start({ tabId, settings, info, mode, sinkId }) {
		return startTab(tabId, settings, info, { mode, sinkId });
	},

	set({ tabId, settings, host }) {
		return setTab(tabId, settings, host, true);
	},

	async stop({ tabId }) {

		await stopTab(tabId);
		return { ok: true };

	},

	async stopAll() {

		for (const tabId of [...(await loadTabs()).keys()]) await stopTab(tabId);
		return { ok: true };

	},

	undo({ tabId }) {
		return stepHistory(tabId, true);
	},

	redo({ tabId }) {
		return stepHistory(tabId, false);
	},

	async swapSlot({ tabId, settings, host }) {

		const slots = await readSlots(tabId);
		const current = mergeSettings(settings);
		const next = slots.other ? mergeSettings(slots.other) : current;
		slots.other = current;
		slots.active = slots.active === "A" ? "B" : "A";
		await chrome.storage.session.set({ [`ab:${tabId}`]: slots });
		const entry = (await loadTabs()).get(tabId);
		if (entry) await setTab(tabId, next, host, true);
		return { ok: true, settings: next, slot: slots.active, hasOther: true };

	},

	async copySlot({ tabId, settings }) {

		const slots = await readSlots(tabId);
		slots.other = mergeSettings(settings);
		await chrome.storage.session.set({ [`ab:${tabId}`]: slots });
		return { ok: true, slot: slots.active, hasOther: true };

	},

	compare({ tabId, mode }) {
		return setCompare(tabId, mode);
	},

	record({ tabId }) {
		return toggleRecord(tabId);
	},

	async sink({ tabId, sinkId, info }) {

		const entry = (await loadTabs()).get(tabId);
		if (!entry) return startTab(tabId, (await initialSettings(info?.host)), info, { mode: "capture", sinkId });
		if (entry.mode === "direct") {
			const settings = entry.settings;
			await stopTab(tabId);
			return startTab(tabId, settings, entry.info ?? info, { mode: "capture", sinkId });
		}
		const result = await toOffscreen({ type: "sink", tabId, sinkId });
		entry.sinkId = sinkId;
		saveTabs();
		return { ok: Boolean(result?.ok), mode: "capture" };

	},

	async switchMode({ tabId, mode, info }) {

		const entry = (await loadTabs()).get(tabId);
		const settings = entry?.settings ?? (await initialSettings(info?.host));
		const tabInfo = entry?.info ?? info;
		if (entry) await stopTab(tabId);
		const result = await startTab(tabId, settings, tabInfo, { mode });
		if (result.ok || mode !== "direct") return result;

		const fallback = await startTab(tabId, settings, tabInfo, { mode: "capture" });
		return { ...fallback, error: result.error };

	},

	async setVolume({ tabId, volume }) {

		const entry = (await loadTabs()).get(tabId);
		if (!entry) return { ok: false };
		return setTab(tabId, { ...entry.settings, volume, muted: false }, entry.info?.host, true);

	},

	async ghost({ tabId }) {

		const entry = (await loadTabs()).get(tabId);
		if (!entry) return { ok: false };
		return setTab(tabId, { ...entry.settings, muted: !entry.settings.muted }, entry.info?.host, true);

	},

	async applyAll({ settings }) {

		const tabs = await loadTabs();
		for (const [tabId, entry] of tabs) await setTab(tabId, settings, entry.info?.host, true);
		return { ok: true, count: tabs.size };

	},

	async remember({ host, settings, isOn }) {

		if (!host) return { ok: false };
		await updateSites(sites => {
			if (isOn) sites[host] = mergeSettings(settings);
			else delete sites[host];
		});
		return { ok: true };

	},

	async list() {

		return [...(await loadTabs())].map(([tabId, entry]) => ({
			tabId,
			mode: entry.mode,
			title: entry.info?.title ?? "Tab",
			favIconUrl: entry.info?.favIconUrl ?? "",
			host: entry.info?.host ?? "",
			volume: entry.settings.volume,
			isMuted: entry.settings.muted,
			isHot: isHot(entry.settings),
			isAscended: entry.settings.ultimate,
		}));

	},

	async focus({ tabId }) {

		const tab = await chrome.tabs.update(tabId, { active: true });
		await chrome.windows.update(tab.windowId, { focused: true });
		return { ok: true };

	},

	async fullscreen({ isOn }, sender) {

		const tabId = sender.tab?.id;
		const windowId = sender.tab?.windowId;
		if (tabId === undefined || windowId === undefined) return {};
		const key = `window:${windowId}`;

		if (!isOn) {
			const stored = (await chrome.storage.session.get(key))[key];
			if (!stored) return {};
			await chrome.storage.session.remove(key);
			await chrome.windows.update(windowId, { state: stored });
			return {};
		}

		const entry = (await loadTabs()).get(tabId);
		if (entry?.mode !== "capture") return {};
		const current = await chrome.windows.get(windowId);
		if (current.state === "fullscreen") return {};
		await chrome.storage.session.set({ [key]: current.state });
		await chrome.windows.update(windowId, { state: "fullscreen" });
		return {};

	},

	async download({ url, filename }) {

		await chrome.downloads.download({ url, filename, saveAs: false });
		return { ok: true };

	},

	async heartbeat({ entries }) {

		await recordHeartbeat(Array.isArray(entries) ? entries : []);
		return { ok: true };

	},

	async guarded({ tabId }, sender) {

		const entry = (await loadTabs()).get(tabId ?? sender.tab?.id);
		if (entry) {
			entry.isGuarded = true;
			saveTabs();
		}
		return { ok: true };

	},

	async ended({ tabId }) {

		const tabs = await loadTabs();
		if (tabs.get(tabId)?.mode === "capture") {
			tabs.delete(tabId);
			await saveTabs(true);
			await chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
		}
		return { ok: true };

	},

	async autostart(message, sender) {

		const tab = sender.tab;
		const host = hostOf(sender.url ?? tab?.url);
		const { prefs, sites, stacks, stats } = await readStore();
		if (!tab?.id || !host || !prefs.autoStart || prefs.engineMode === "capture") return { ok: false };

		const ruleStack = findStack(stackIdForHost(host, prefs), stacks);
		const settings = sites[host] ? mergeSettings(sites[host]) : ruleStack && isUnlocked(ruleStack, stats) ? stackSettings(ruleStack) : null;
		if (!settings) return { ok: false };

		await injectDirect(tab.id);
		await toDirect(tab.id, { type: "arm", settings, isGuardEnabled: prefs.cpuGuard });
		return { ok: true };

	},

	async directStarted({ settings }, sender) {

		const tab = sender.tab;
		if (!tab?.id) return { ok: false };
		const merged = mergeSettings(settings);
		const tabs = await loadTabs();
		tabs.set(tab.id, { mode: "direct", settings: merged, info: { title: tab.title, favIconUrl: tab.favIconUrl, host: hostOf(tab.url) }, sinkId: "", reason: "", compare: "boosted", isGuarded: false });
		await saveTabs(true);
		await updateBadge(tab.id, merged);
		return { ok: true };

	},

};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

	if (message?.target !== "worker") return;
	const handler = handlers[message.type];
	if (!handler) return;

	Promise.resolve()
		.then(() => handler(message, sender))
		.then(sendResponse, error => sendResponse({ ok: false, error: error?.message ?? String(error) }));
	return true;

});

chrome.commands.onCommand.addListener((command, tab) => {
	runAction(command, tab).catch(() => {});
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
	runAction(String(info.menuItemId), tab).catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
	rebuildMenus();
	syncAutostart().catch(() => {});
	pullSync().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
	rebuildMenus();
	syncAutostart().catch(() => {});
	pullSync().catch(() => {});
});

chrome.permissions.onAdded.addListener(() => {
	syncAutostart().catch(() => {});
});

chrome.permissions.onRemoved.addListener(() => {
	syncAutostart().catch(() => {});
});

chrome.storage.onChanged.addListener((changes, area) => {

	if (area === "sync") {
		if (Object.keys(changes).some(key => key.startsWith("bp:"))) debounce("pull", () => pullSync().catch(() => {}), 500);
		return;
	}
	if (area !== "local") return;
	if (changes.stacks || changes.stats) rebuildMenus();
	if (changes.prefs) {
		syncAutostart().catch(() => {});
		const before = mergePrefs(changes.prefs.oldValue);
		const after = mergePrefs(changes.prefs.newValue);
		if (before.cpuGuard !== after.cpuGuard) broadcastGuard(after.cpuGuard).catch(() => {});
	}
	if (changes.stacks || changes.prefs) {
		clearTimeout(syncTimer);
		syncTimer = setTimeout(() => pushSync().catch(() => {}), 800);
	}

});

chrome.tabs.onRemoved.addListener(async tabId => {

	const tabs = await loadTabs();
	if (tabs.delete(tabId)) await saveTabs(true);
	await chrome.storage.session.remove([`history:${tabId}`, `ab:${tabId}`]);

});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {

	if (changeInfo.status !== "complete") return;
	const tabs = await loadTabs();
	const entry = tabs.get(tabId);
	if (!entry) return;

	if (entry.mode === "direct") {
		const alive = await toDirect(tabId, { type: "ping" });
		if (!alive?.isActive) {
			tabs.delete(tabId);
			await saveTabs(true);
			await chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
			return;
		}
	}
	await updateBadge(tabId, entry.settings);

});
