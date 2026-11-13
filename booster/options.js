const state = {
	prefs: defaultPrefs(),
	stacks: [],
	sites: {},
	stats: {},
	hasAccess: false,
	last: defaultSettings(),
	editingId: "last",
	draft: defaultSettings(),
	draftName: "",
	isDirty: false,
	resetTimer: 0,
	colorTimer: 0,
};

const store = {
	get settings() {
		return state.draft;
	},
	change(patch) {
		Object.assign(state.draft, patch);
		state.isDirty = true;
		renderEditor();
	},
};

const editorUpdaters = [];
const element = id => document.getElementById(id);

function sanitizeStacks(list) {

	if (!Array.isArray(list)) return [];
	return list
		.filter(stack => stack && typeof stack.id === "string" && stack.id.startsWith("user:") && typeof stack.name === "string")
		.map(stack => ({ id: stack.id, name: stack.name.slice(0, 40), settings: mergeSettings(stack.settings) }));

}

function sanitizeSites(sites) {

	if (!sites || typeof sites !== "object") return {};
	return Object.fromEntries(Object.entries(sites).filter(([host]) => /^[a-z0-9.-]+$/i.test(host)).map(([host, settings]) => [host, mergeSettings(settings)]));

}

async function load() {

	const data = await chrome.storage.local.get(["prefs", "stacks", "sites", "last", "stats"]);
	state.prefs = mergePrefs(data.prefs);
	state.stacks = sanitizeStacks(data.stacks);
	state.sites = sanitizeSites(data.sites);
	state.last = mergeSettings(data.last);
	state.stats = data.stats ?? {};
	state.hasAccess = await chrome.permissions.contains({ origins: ["<all_urls>"] });

}

function savePrefs() {

	applyTheme(state.prefs);
	return chrome.storage.local.set({ prefs: state.prefs });

}

function fillStackSelect(select, includeLast) {

	select.replaceChildren();
	if (includeLast) select.add(new Option("Last used settings", "last"));

	const builtIn = el("optgroup");
	builtIn.label = "Built-in stacks";
	for (const stack of allBuiltInStacks.filter(item => isUnlocked(item, state.stats))) builtIn.append(new Option(stack.name, stack.id));
	select.append(builtIn);

	if (!state.stacks.length) return;
	const mine = el("optgroup");
	mine.label = "Your stacks";
	for (const stack of state.stacks) mine.append(new Option(stack.name, stack.id));
	select.append(mine);

}

function settingsFor(id) {

	if (id === "last") return mergeSettings(state.last);
	const stack = findStack(id, state.stacks);
	return stack ? stackSettings(stack) : mergeSettings(state.last);

}

function renderGeneral() {

	const prefs = state.prefs;
	fillStackSelect(element("newTabs"), true);
	element("newTabs").value = findStack(prefs.newTabs, state.stacks) ? prefs.newTabs : "last";
	element("volumeStep").value = prefs.volumeStep;
	element("normalCap").value = prefs.normalCap;
	element("ascendCap").value = prefs.ascendCap;
	element("showSpectrum").checked = prefs.showSpectrum;
	element("showTiers").checked = prefs.showTiers;
	element("accent").value = prefs.accent;
	element("hot").value = prefs.hot;
	element("engineMode").value = prefs.engineMode;
	element("cpuGuard").checked = prefs.cpuGuard;
	element("sync").checked = prefs.sync;
	element("autoStart").checked = prefs.autoStart && state.hasAccess;
	element("revokeAccess").hidden = !state.hasAccess;
	element("autoStartNote").textContent = state.hasAccess
		? "All-sites access is on. Auto-mog and Speed-maxx in embedded players are available."
		: "Auto-mog and Speed-maxx in embedded players need access to all sites. Chrome will ask once.";
	fillStackSelect(element("ruleStack"), false);
	renderRules();

}

function renderRules() {

	const rules = state.prefs.siteRules;
	element("ruleList").replaceChildren(...rules.map((rule, index) => {
		const row = el("li");
		const stack = findStack(rule.stackId, state.stacks);
		const remove = el("button", "ghost", "Delete");
		remove.type = "button";
		remove.addEventListener("click", () => {
			state.prefs.siteRules.splice(index, 1);
			savePrefs();
			renderRules();
		});
		row.append(el("span", "grow", rule.pattern), el("span", "hint", stack?.name ?? "Missing stack"), remove);
		return row;
	}));
	if (!rules.length) element("ruleList").append(el("li", "hint", "No rules yet."));

}

function renderStats() {

	const stats = { boostedMs: 0, ascendedMs: 0, smashedMs: 0, peakVolume: 0, ...state.stats };
	const minutes = value => `${Math.floor(value / 60000)} min`;
	element("statGrid").replaceChildren(...[
		[minutes(stats.boostedMs), "Time mogging"],
		[minutes(stats.ascendedMs), "Time ascended"],
		[minutes(stats.smashedMs), "Time bonesmashing"],
		[`${Math.round(stats.peakVolume)}%`, "Loudest volume used"],
	].map(([value, label]) => {
		const tile = el("div", "stat");
		tile.append(el("strong", "", value), el("span", "", label));
		return tile;
	}));

	element("unlockList").replaceChildren(...secretStacks.map(stack => {
		const row = el("li");
		const isOpen = isUnlocked(stack, stats);
		const bar = el("div", "progress");
		const fill = el("i");
		fill.style.width = `${Math.min(100, (stats[stack.unlock.stat] ?? 0) / stack.unlock.value * 100)}%`;
		bar.append(fill);
		row.append(el("span", isOpen ? "grow unlock is-unlocked" : "grow unlock", isOpen ? `${stack.name}: unlocked` : `${stack.name}: ${stack.unlock.text}`), bar);
		return row;
	}));

}

function selectStack(id) {

	state.editingId = findStack(id, state.stacks) || id === "last" ? id : "last";
	state.draft = settingsFor(state.editingId);
	state.draftName = state.editingId === "last" ? "Last used settings" : findStack(state.editingId, state.stacks)?.name ?? "";
	state.isDirty = false;
	element("editName").value = state.draftName;
	fillStackSelect(element("editStack"), true);
	element("editStack").value = state.editingId;
	renderEditor();

}

function renderEditor() {

	const id = state.editingId;
	const isUser = id.startsWith("user:");
	const isBuiltIn = id.startsWith("builtin:");
	const name = element("editName");
	const status = element("editorStatus");

	for (const update of editorUpdaters) update(state.draft);

	name.disabled = !isUser;
	element("saveEdit").disabled = isBuiltIn || !state.isDirty;
	element("deleteStack").hidden = !isUser;
	element("makeDefault").setAttribute("aria-pressed", String(state.prefs.newTabs === id));
	element("makeDefault").textContent = state.prefs.newTabs === id ? "Used for new tabs" : "Use for new tabs";
	status.textContent = state.isDirty ? (isBuiltIn ? "Edited. Save as a new stack to keep it." : "Unsaved changes") : "Saved";
	status.classList.toggle("is-dirty", state.isDirty);

}

async function saveEdit() {

	const id = state.editingId;
	const settings = mergeSettings(state.draft);
	if (id === "last") {
		state.last = settings;
		await chrome.storage.local.set({ last: settings });
	} else {
		const stack = state.stacks.find(item => item.id === id);
		if (!stack) return;
		stack.settings = settings;
		stack.name = state.draftName.trim().slice(0, 40) || stack.name;
		await chrome.storage.local.set({ stacks: state.stacks });
	}
	state.isDirty = false;
	selectStack(id);
	renderGeneral();

}

async function saveCopy() {

	const source = findStack(state.editingId, state.stacks);
	const baseName = state.editingId === "last" ? "My stack" : `${source?.name ?? "My stack"} copy`;
	const typed = state.draftName.trim();
	const stack = {
		id: `user:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
		name: (state.editingId.startsWith("user:") && typed && typed !== source?.name ? typed : baseName).slice(0, 40),
		settings: mergeSettings({ ...state.draft, muted: false }),
	};
	state.stacks.push(stack);
	await chrome.storage.local.set({ stacks: state.stacks });
	selectStack(stack.id);
	renderGeneral();

}

async function deleteStack() {

	const id = state.editingId;
	state.stacks = state.stacks.filter(stack => stack.id !== id);
	if (state.prefs.newTabs === id) state.prefs.newTabs = "last";
	await chrome.storage.local.set({ stacks: state.stacks, prefs: state.prefs });
	selectStack("last");
	renderGeneral();

}

async function toggleDefault() {

	state.prefs.newTabs = state.prefs.newTabs === state.editingId ? "last" : state.editingId;
	await savePrefs();
	renderGeneral();
	renderEditor();

}

function renderSites() {

	const hosts = Object.keys(state.sites).sort();
	element("sitesEmpty").hidden = hosts.length > 0;
	element("forgetAll").hidden = hosts.length === 0;
	element("siteList").replaceChildren(...hosts.map(host => {
		const row = el("li");
		const name = el("span", "grow", host);
		const level = el("span", "hint", `${Math.round(state.sites[host].volume)}%`);
		const forget = el("button", "ghost", "Forget");
		forget.type = "button";
		forget.addEventListener("click", async () => {
			delete state.sites[host];
			await chrome.storage.local.set({ sites: state.sites });
			renderSites();
		});
		row.append(name, level, forget);
		return row;
	}));

}

async function renderCommands() {

	const commands = await chrome.commands.getAll();
	element("commandList").replaceChildren(...commands.filter(command => command.description).map(command => {
		const row = el("li");
		row.append(el("span", "grow", command.description), el("span", command.shortcut ? "keys" : "keys is-empty", command.shortcut || "Not set"));
		return row;
	}));

}

function exportAll() {

	const data = { app: "blackpill-booster", version: 2, prefs: state.prefs, stacks: state.stacks, sites: state.sites, last: state.last };
	const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
	const link = el("a");
	link.href = url;
	link.download = `blackpill-booster-${new Date().toISOString().slice(0, 10)}.json`;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
	element("backupStatus").textContent = "Backup exported.";

}

async function importAll(file) {

	const status = element("backupStatus");
	try {
		const data = JSON.parse(await file.text());
		if (!data || typeof data !== "object") throw new Error("not a backup");
		const next = {
			prefs: mergePrefs(data.prefs),
			stacks: sanitizeStacks(data.stacks),
			sites: sanitizeSites(data.sites),
			last: mergeSettings(data.last),
		};
		await chrome.storage.local.set(next);
		await load();
		applyTheme(state.prefs);
		renderAll();
		status.textContent = `Imported ${next.stacks.length} stacks and ${Object.keys(next.sites).length} remembered sites.`;
	} catch {
		status.textContent = "That file isn't a Blackpill Booster backup.";
	}

}

async function resetEverything() {

	const button = element("resetEverything");
	if (!state.resetTimer) {
		button.textContent = "Click again to reset everything";
		state.resetTimer = setTimeout(() => {
			state.resetTimer = 0;
			button.textContent = "Reset everything";
		}, 4000);
		return;
	}

	clearTimeout(state.resetTimer);
	state.resetTimer = 0;
	button.textContent = "Reset everything";
	await chrome.storage.local.clear();
	await load();
	applyTheme(state.prefs);
	renderAll();
	element("backupStatus").textContent = "Everything is back to normie.";

}

function renderAll() {

	renderGeneral();
	selectStack(state.editingId);
	renderSites();
	renderStats();

}

function filterControls(query) {

	const words = query.trim().toLowerCase();
	for (const group of document.querySelectorAll("#editor .group")) {
		group.classList.toggle("is-filtered", Boolean(words) && !group.textContent.toLowerCase().includes(words));
	}

}

async function setAutoStart(isOn) {

	const status = element("engineStatus");
	if (isOn && !state.hasAccess) {
		const isGranted = await chrome.permissions.request({ origins: ["<all_urls>"] }).catch(() => false);
		state.hasAccess = isGranted;
		if (!isGranted) {
			status.textContent = "Chrome didn't grant all-sites access, so Auto-mog stays off.";
			renderGeneral();
			return;
		}
	}
	state.prefs.autoStart = isOn;
	await savePrefs();
	status.textContent = isOn ? "Auto-mog is on for remembered sites and site rules." : "Auto-mog is off.";
	renderGeneral();

}

function bindNumber(id, key) {

	element(id).addEventListener("change", event => {
		state.prefs[key] = Number(event.target.value);
		state.prefs = mergePrefs(state.prefs);
		event.target.value = state.prefs[key];
		savePrefs();
	});

}

function bindEvents() {

	element("newTabs").addEventListener("change", event => {
		state.prefs.newTabs = event.target.value;
		savePrefs();
		renderEditor();
	});
	bindNumber("volumeStep", "volumeStep");
	bindNumber("normalCap", "normalCap");
	bindNumber("ascendCap", "ascendCap");

	for (const key of ["showSpectrum", "showTiers"]) {
		element(key).addEventListener("change", event => {
			state.prefs[key] = event.target.checked;
			savePrefs();
		});
	}

	for (const key of ["accent", "hot"]) {
		element(key).addEventListener("input", event => {
			state.prefs[key] = event.target.value;
			applyTheme(state.prefs);
			clearTimeout(state.colorTimer);
			state.colorTimer = setTimeout(savePrefs, 300);
		});
	}

	element("resetColors").addEventListener("click", () => {
		const defaults = defaultPrefs();
		state.prefs.accent = defaults.accent;
		state.prefs.hot = defaults.hot;
		savePrefs();
		renderGeneral();
	});

	element("engineMode").addEventListener("change", event => {
		state.prefs.engineMode = event.target.value;
		savePrefs();
	});
	for (const key of ["cpuGuard", "sync"]) {
		element(key).addEventListener("change", event => {
			state.prefs[key] = event.target.checked;
			savePrefs();
		});
	}
	element("autoStart").addEventListener("change", event => setAutoStart(event.target.checked));
	element("revokeAccess").addEventListener("click", async () => {
		await chrome.permissions.remove({ origins: ["<all_urls>"] }).catch(() => false);
		state.hasAccess = false;
		state.prefs.autoStart = false;
		await savePrefs();
		element("engineStatus").textContent = "All-sites access removed.";
		renderGeneral();
	});
	element("deviceNames").addEventListener("click", async () => {
		const status = element("engineStatus");
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			for (const track of stream.getTracks()) track.stop();
			status.textContent = "Device names are on. Pick an output device in the popup. The booster never records your microphone.";
		} catch {
			status.textContent = "Chrome only shows device names after you allow microphone access once. Access was not granted.";
		}
	});

	element("ruleForm").addEventListener("submit", event => {
		event.preventDefault();
		const pattern = element("rulePattern").value.trim().toLowerCase();
		const stackId = element("ruleStack").value;
		if (!pattern || !stackId) return;
		state.prefs.siteRules = [...state.prefs.siteRules.filter(rule => rule.pattern !== pattern), { pattern, stackId }];
		element("rulePattern").value = "";
		savePrefs();
		renderRules();
	});

	element("copyEditorCode").addEventListener("click", async () => {
		const status = element("codeStatus");
		try {
			const code = await encodeShareCode(state.draft, state.draftName === "Last used settings" ? "" : state.draftName);
			await navigator.clipboard.writeText(code);
			status.textContent = `Copied a ${code.length}-character share code.`;
		} catch {
			status.textContent = "Couldn't copy the code.";
		}
	});
	element("loadEditorCode").addEventListener("click", async () => {
		const status = element("codeStatus");
		try {
			const decoded = await decodeShareCode(element("editorCode").value);
			state.draft = decoded.settings;
			if (decoded.name && state.editingId.startsWith("user:")) {
				state.draftName = decoded.name;
				element("editName").value = decoded.name;
			}
			state.isDirty = true;
			renderEditor();
			status.textContent = `Loaded ${decoded.name ? `"${decoded.name}"` : "the code"} into the editor. Save to keep it.`;
		} catch (error) {
			status.textContent = error.message;
		}
	});
	element("controlSearch").addEventListener("input", event => filterControls(event.target.value));

	element("editStack").addEventListener("change", event => selectStack(event.target.value));
	element("editName").addEventListener("input", event => {
		state.draftName = event.target.value;
		state.isDirty = true;
		renderEditor();
	});
	element("saveEdit").addEventListener("click", saveEdit);
	element("saveCopy").addEventListener("click", saveCopy);
	element("deleteStack").addEventListener("click", deleteStack);
	element("makeDefault").addEventListener("click", toggleDefault);

	element("forgetAll").addEventListener("click", async () => {
		state.sites = {};
		await chrome.storage.local.set({ sites: {} });
		renderSites();
	});

	element("editShortcuts").addEventListener("click", () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" }));
	element("exportAll").addEventListener("click", exportAll);
	element("importAll").addEventListener("change", event => {
		const [file] = event.target.files;
		if (file) importAll(file);
		event.target.value = "";
	});
	element("resetEverything").addEventListener("click", resetEverything);

	chrome.storage.onChanged.addListener(async (changes, area) => {
		if (area !== "local") return;
		await load();
		if (changes.prefs) {
			applyTheme(state.prefs);
			renderGeneral();
		}
		if (changes.stacks) {
			renderGeneral();
			fillStackSelect(element("editStack"), true);
			element("editStack").value = findStack(state.editingId, state.stacks) || state.editingId === "last" ? state.editingId : "last";
		}
		if (changes.sites) renderSites();
		if (changes.stats) {
			renderStats();
			renderGeneral();
		}
		renderEditor();
	});

}

async function init() {

	const levelSection = sections.find(section => section.id === "level");
	editorUpdaters.push(createSections(element("levelSection"), [levelSection], store));
	editorUpdaters.push(createEqualizer(element("editorEqualizer"), store));
	editorUpdaters.push(createSections(element("editorSections"), sections.filter(section => section !== levelSection), store));

	bindEvents();
	await load();
	applyTheme(state.prefs);
	renderAll();
	renderCommands();

}

init();
