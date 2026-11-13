const quickToggles = [
	{ key: "ultimate", label: "ASCEND", isHot: true, title: "Raises the volume cap. Protect your ears." },
	{ key: "agc", label: "Auto-mog", title: "Keeps every video at the same loudness" },
	{ key: "multiband", label: "Gigamog", title: "3-band maximizer" },
	{ key: "clip", label: "Clip-maxx", title: "Shaves peaks before the limiter" },
	{ key: "punch", label: "Punch-maxx", title: "Snappier hits" },
	{ key: "phantom", label: "Phantom bass", title: "Bass you can hear on small speakers" },
	{ key: "sub", label: "Jaw drop", title: "Sub-octave bass" },
	{ key: "exciter", label: "Hunter eyes", title: "Sharper, clearer highs" },
	{ key: "monoBass", label: "Bass mono", title: "Bass in the center, louder on speakers" },
	{ key: "deesser", label: "Tongue posture", title: "De-esser" },
	{ key: "distortion", label: "BONESMASH", isHot: true, title: "Distortion" },
	{ key: "limiter", label: "Cope limiter", title: "Off lets audio clip at full scale" },
];

const state = {
	tab: null,
	host: "",
	isActive: false,
	mode: "",
	isRemembered: false,
	settings: defaultSettings(),
	prefs: defaultPrefs(),
	stacks: [],
	stats: {},
	compare: "boosted",
	slot: "A",
	hasOther: false,
	canUndo: false,
	canRedo: false,
	sinkId: "",
	isGuarded: false,
	recordingSince: 0,
	speed: 1,
	isSpeedAvailable: true,
	hasHostAccess: false,
	starting: null,
	isSendQueued: false,
	isSpeedQueued: false,
	levelTimer: 0,
	meterPeak: -Infinity,
	meterReduction: 0,
	spectrumView: "after",
	peaks: [],
	lastTier: "",
	panel: "mog",
	speedControl: null,
};

const store = {
	get settings() {
		return state.settings;
	},
	change(patch) {
		change(patch);
	},
};

const updaters = [];
const quickButtons = [];
const builtInButtons = [];
const userStackRows = [];
const element = id => document.getElementById(id);

function worker(type, data = {}) {
	return chrome.runtime.sendMessage({ target: "worker", type, ...data });
}

function tabInfo() {
	return { title: state.tab.title, favIconUrl: state.tab.favIconUrl, host: state.host };
}

function animate(name) {

	if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
	const big = element("big");
	big.classList.remove("is-ascending", "is-shattering");
	void big.offsetWidth;
	big.classList.add(name);

}

function change(patch) {

	const before = state.settings;
	state.settings = { ...before, ...patch };
	state.settings.volume = Math.min(state.settings.volume, maxVolume(state.settings, state.prefs));
	if (!before.ultimate && state.settings.ultimate) animate("is-ascending");
	if ((!before.distortion && state.settings.distortion && state.settings.distDrive >= 40) || (before.limiter && !state.settings.limiter)) animate("is-shattering");
	render();
	commit(true);

}

function updateHistory(response) {

	if (!response || typeof response.canUndo !== "boolean") return;
	state.canUndo = response.canUndo;
	state.canRedo = response.canRedo;
	renderTools();

}

function commit(canStart) {

	if (!state.isActive) {
		if (canStart) start();
		else worker("set", { tabId: state.tab.id, settings: state.settings, host: state.host }).catch(() => {});
		return;
	}
	if (state.isSendQueued) return;

	state.isSendQueued = true;
	requestAnimationFrame(() => {
		state.isSendQueued = false;
		worker("set", { tabId: state.tab.id, settings: state.settings, host: state.host }).then(updateHistory).catch(() => {});
	});

}

function start(options = {}) {

	if (state.starting) return state.starting;

	state.starting = (async () => {
		try {
			const result = await worker("start", { tabId: state.tab.id, settings: state.settings, info: tabInfo(), ...options });
			if (!result?.ok) throw new Error(result?.error ?? "unknown error");

			state.isActive = true;
			state.mode = result.mode;
			state.compare = "boosted";
			showError("");
			startLevels();
		} catch (error) {
			state.isActive = false;
			showError(describeError(error));
		} finally {
			state.starting = null;
			render();
			refreshTabs();
		}
	})();
	renderStatus();
	return state.starting;

}

async function stop() {

	await worker("stop", { tabId: state.tab.id }).catch(() => {});
	state.isActive = false;
	state.mode = "";
	state.recordingSince = 0;
	stopLevels();
	render();
	refreshTabs();

}

function describeError(error) {

	const message = String(error?.message ?? error);
	if (/active stream/i.test(message)) return "Another extension is already capturing this tab's audio. Turn it off for this tab, then try again.";
	if (/chrome pages|cannot be captured|not been invoked|web store|cannot access|chrome:\/\//i.test(message)) return "Chrome doesn't allow mogging browser pages or the Chrome Web Store. Open a regular website tab.";
	if (/^(Direct mode|This page|Press play)/.test(message)) return message;
	return `Mogging couldn't start: ${message}`;

}

function showError(message) {

	const banner = element("banner");
	banner.textContent = message;
	banner.hidden = !message;

}

function renderStatus() {

	const settings = state.settings;
	const status = element("status");
	const chip = element("modeChip");
	let text = "Off";
	let tone = "";
	if (state.starting) {
		text = "Ascending";
	} else if (state.isActive) {
		if (settings.muted) text = "It's over";
		else if (state.compare === "original") text = "Original";
		else if (!settings.limiter) [text, tone] = ["No cope", "is-hot"];
		else if (settings.ultimate) [text, tone] = ["Ascended", "is-hot"];
		else [text, tone] = ["Mogging", "is-on"];
	}

	element("power").checked = state.isActive || Boolean(state.starting);
	status.textContent = text;
	status.className = `status ${tone}`;
	chip.hidden = !state.isActive;
	chip.textContent = state.mode === "direct" ? "Direct" : "Capture";
	chip.title = state.mode === "direct"
		? "Direct mode: fullscreen works and there's no delay. Click to switch to Capture if a site sounds wrong."
		: "Capture mode: works on every site. Click to try Direct mode for fullscreen and zero delay.";

}

function renderVolume() {

	const settings = state.settings;
	const cap = maxVolume(settings, state.prefs);
	const fader = element("volume");
	const big = element("big");
	const tier = element("tier");
	const tierName = tierFor(settings);

	fader.max = cap;
	fader.step = cap > 1000 ? 25 : 5;
	fader.value = settings.volume;
	fader.style.setProperty("--h", Math.min(100, 100 / cap * 100));
	fader.style.setProperty("--p", settings.volume / cap * 100);
	element("volumeValue").textContent = Math.round(settings.volume);
	element("volumeDb").textContent = settings.volume === 0 ? "Silent" : formats.db(20 * Math.log10(settings.volume / 100));
	big.classList.toggle("is-hot", isHot(settings));
	big.classList.toggle("is-muted", settings.muted);
	tier.hidden = !state.prefs.showTiers;
	tier.textContent = tierName;
	tier.classList.toggle("is-hot", settings.volume > 600);
	if (state.lastTier && state.lastTier !== tierName && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
		tier.classList.remove("is-pulsing");
		void tier.offsetWidth;
		tier.classList.add("is-pulsing");
	}
	state.lastTier = tierName;

	for (const chip of element("volumeChips").children) {
		if (chip.hasAttribute("data-mute")) {
			chip.setAttribute("aria-pressed", String(settings.muted));
			chip.textContent = settings.muted ? "Unghost" : "Ghost";
			continue;
		}
		const target = chip.dataset.volume === "max" ? cap : Number(chip.dataset.volume);
		chip.setAttribute("aria-pressed", String(!settings.muted && settings.volume === target));
		chip.title = `${target}%`;
	}

}

function renderTools() {

	for (const button of element("compare").children) {
		button.setAttribute("role", "radio");
		button.setAttribute("aria-checked", String(button.dataset.value === state.compare));
		button.disabled = !state.isActive;
	}
	element("undo").disabled = !state.isActive || !state.canUndo;
	element("redo").disabled = !state.isActive || !state.canRedo;
	element("slotA").setAttribute("aria-pressed", String(state.slot === "A"));
	element("slotB").setAttribute("aria-pressed", String(state.slot === "B"));

	const record = element("record");
	const isRecording = state.isActive && state.recordingSince > 0;
	record.classList.toggle("is-recording", isRecording);
	record.setAttribute("aria-pressed", String(isRecording));
	if (!isRecording) {
		record.textContent = "Record";
		return;
	}
	const seconds = Math.max(0, Math.floor((Date.now() - state.recordingSince) / 1000));
	record.textContent = `Stop ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

}

function renderQuick() {

	for (const [toggle, button] of quickButtons) {
		const isOn = state.settings[toggle.key];
		button.setAttribute("aria-pressed", String(isOn));
		button.classList.toggle("is-warning", toggle.key === "limiter" && !isOn);
		button.textContent = toggle.key === "limiter" && !isOn ? "No cope" : toggle.label;
	}

}

function stackProgress(stack) {

	const value = state.stats[stack.unlock.stat] ?? 0;
	const minutes = milliseconds => Math.floor(milliseconds / 60000);
	return `${stack.unlock.text} (${minutes(value)} of ${minutes(stack.unlock.value)} min)`;

}

function renderStacks() {

	for (const [stack, button, detail] of builtInButtons) {
		const isLocked = !isUnlocked(stack, state.stats);
		button.disabled = isLocked;
		button.classList.toggle("is-locked", isLocked);
		detail.textContent = isLocked ? stackProgress(stack) : stack.description;
		button.setAttribute("aria-pressed", String(!isLocked && settingsMatch(stackSettings(stack), state.settings)));
	}
	for (const [stack, row, star] of userStackRows) {
		row.classList.toggle("is-active", settingsMatch(stackSettings(stack), state.settings));
		star.setAttribute("aria-pressed", String(state.prefs.newTabs === stack.id));
	}

	const remember = element("remember");
	remember.checked = state.isRemembered;
	remember.disabled = !state.host;
	element("rememberText").textContent = state.host ? `Remember these settings on ${state.host}.` : "Site memory works on regular websites only.";

}

function render() {

	renderStatus();
	renderVolume();
	renderTools();
	renderQuick();
	for (const update of updaters) update(state.settings);
	renderStacks();

}

function buildQuick() {

	const container = element("quick");
	for (const toggle of quickToggles) {
		const button = el("button", toggle.isHot ? "is-hot" : "", toggle.label);
		button.type = "button";
		button.title = toggle.title;
		button.addEventListener("click", () => change({ [toggle.key]: !state.settings[toggle.key] }));
		container.append(button);
		quickButtons.push([toggle, button]);
	}

}

function buildPanels() {

	updaters.push(createEqualizer(element("equalizer"), store));
	updaters.push(createSections(element("panel-eq"), sections.filter(section => section.panel === "eq"), store));

	const presets = createPresetChips(voicePresets, store);
	element("voicePresets").append(presets.element);
	updaters.push(presets.update);

	const voicePanel = element("panel-voice");
	const speedGroup = element("speed").parentElement;
	updaters.push(createSections(voicePanel, sections.filter(section => section.panel === "voice"), store));
	voicePanel.append(speedGroup);

	const speedStore = {
		get settings() {
			return { speed: state.speed };
		},
		change(patch) {
			state.speed = patch.speed;
			renderSpeed();
			queueSpeed();
		},
	};
	state.speedControl = createRange({ key: "speed", label: "Speed", min: .25, max: 4, step: .05, center: 1, reset: 1, format: value => `${value.toFixed(2)}×` }, speedStore);
	element("speed").append(state.speedControl.element);

	updaters.push(createSections(element("panel-smash"), sections.filter(section => section.panel === "smash"), store));
	updaters.push(createSections(element("panel-loud"), sections.filter(section => section.panel === "loud"), store));

}

function buildBuiltIns() {

	const container = element("builtIns");
	for (const stack of allBuiltInStacks) {
		const button = el("button");
		const detail = el("span", "", stack.description);
		button.type = "button";
		button.classList.toggle("is-hot", isHot(stackSettings(stack)));
		button.classList.toggle("is-secret", Boolean(stack.unlock));
		button.append(el("strong", "", stack.name), detail);
		button.addEventListener("click", () => {
			if (isUnlocked(stack, state.stats)) change(stackSettings(stack));
		});
		container.append(button);
		builtInButtons.push([stack, button, detail]);
	}

}

async function copyCode(settings, name) {

	const status = element("codeStatus");
	try {
		const code = await encodeShareCode(settings, name);
		await navigator.clipboard.writeText(code);
		status.textContent = `Copied ${name ? `"${name}" ` : ""}as a ${code.length}-character code. Paste it anywhere.`;
	} catch {
		status.textContent = "Couldn't copy the code. Click the popup first, then try again.";
	}

}

function saveStack(name, settings) {

	state.stacks.push({ id: `user:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: name.slice(0, 40), settings: { ...settings, muted: false } });
	return chrome.storage.local.set({ stacks: state.stacks });

}

function renderUserStacks() {

	userStackRows.length = 0;
	element("stacksEmpty").hidden = state.stacks.length > 0;
	element("userStacks").replaceChildren(...state.stacks.map(stack => {
		const row = el("li");
		const name = el("button", "name", stack.name);
		const share = el("button", "mini", "Share");
		const star = el("button", "mini", "Default");
		const remove = el("button", "mini", "Delete");

		for (const button of [name, share, star, remove]) button.type = "button";
		name.title = "Apply this stack";
		share.title = "Copy a share code for this stack";
		star.title = "Use this stack for new tabs";
		remove.setAttribute("aria-label", `Delete ${stack.name}`);
		row.append(name, share, star, remove);
		userStackRows.push([stack, row, star]);

		name.addEventListener("click", () => change(stackSettings(stack)));
		share.addEventListener("click", () => copyCode(stackSettings(stack), stack.name));
		star.addEventListener("click", async () => {
			state.prefs.newTabs = state.prefs.newTabs === stack.id ? "last" : stack.id;
			await chrome.storage.local.set({ prefs: state.prefs });
			renderStacks();
		});
		remove.addEventListener("click", async () => {
			state.stacks = state.stacks.filter(item => item.id !== stack.id);
			if (state.prefs.newTabs === stack.id) state.prefs.newTabs = "last";
			await chrome.storage.local.set({ stacks: state.stacks, prefs: state.prefs });
			renderUserStacks();
		});
		return row;
	}));
	renderStacks();

}

function renderSpeed() {

	const control = state.speedControl;
	control.update({ speed: state.speed });
	const input = control.element.querySelector('input[type="range"]');
	const value = control.element.querySelector(".value");
	input.disabled = !state.isSpeedAvailable;
	value.disabled = !state.isSpeedAvailable;
	if (!state.isSpeedAvailable) value.textContent = "Not available here";

}

function queueSpeed() {

	if (state.isSpeedQueued) return;
	state.isSpeedQueued = true;
	requestAnimationFrame(() => {
		state.isSpeedQueued = false;
		chrome.scripting.executeScript({
			target: { tabId: state.tab.id, allFrames: state.hasHostAccess },
			func: rate => {
				globalThis.blackpillRate = rate;
				for (const media of document.querySelectorAll("video, audio")) {
					media.preservesPitch = true;
					media.playbackRate = rate;
				}
				if (globalThis.blackpillRateHooked) return;
				globalThis.blackpillRateHooked = true;
				document.addEventListener("play", event => {
					const media = event.target;
					if (!(media instanceof HTMLMediaElement) || media.playbackRate === globalThis.blackpillRate) return;
					media.preservesPitch = true;
					media.playbackRate = globalThis.blackpillRate;
				}, true);
			},
			args: [state.speed],
		}).catch(() => {});
	});

}

async function loadSpeed() {

	try {
		const [result] = await chrome.scripting.executeScript({
			target: { tabId: state.tab.id },
			func: () => globalThis.blackpillRate ?? document.querySelector("video, audio")?.playbackRate ?? null,
		});
		state.speed = result?.result ?? 1;
		state.isSpeedAvailable = true;
	} catch {
		state.isSpeedAvailable = false;
	}
	renderSpeed();

}

async function loadDevices() {

	const select = element("sink");
	let outputs = [];
	try {
		outputs = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === "audiooutput" && device.deviceId !== "default");
	} catch {
		outputs = [];
	}

	const hasLabels = outputs.some(device => device.label);
	select.replaceChildren(new Option("System default", ""));
	for (const [index, device] of outputs.entries()) {
		if (device.deviceId === "communications") continue;
		select.add(new Option(device.label || `Output ${index + 1}`, device.deviceId));
	}
	if (!hasLabels) {
		const hint = new Option("Show device names in settings", "permission");
		select.add(hint);
	}
	select.value = [...select.options].some(option => option.value === state.sinkId) ? state.sinkId : "";

}

function startLevels() {

	stopLevels();
	state.levelTimer = setInterval(pollLevels, 50);

}

function stopLevels() {

	clearInterval(state.levelTimer);
	state.meterPeak = -Infinity;
	state.meterReduction = 0;
	state.peaks = [];
	element("outputBar").style.width = "100%";
	element("loudnessBar").style.width = "100%";
	element("reductionBar").style.width = "0%";
	element("outputText").textContent = "−∞";
	element("loudnessText").textContent = "−∞";
	element("reductionText").textContent = "0.0";
	element("guard").hidden = true;
	drawSpectrum(null);

}

const formatLevel = value => Number.isFinite(value) && value > -99 ? value.toFixed(1).replace("-", "−") : "−∞";

function requestLevels(isSpectrum) {

	const message = { type: "levels", isSpectrum, view: state.spectrumView };
	if (state.mode === "direct") return chrome.tabs.sendMessage(state.tab.id, { target: "direct", ...message }, { frameId: 0 });
	return chrome.runtime.sendMessage({ target: "offscreen", tabId: state.tab.id, ...message });

}

async function pollLevels() {

	const isSpectrum = state.panel === "mog" && state.prefs.showSpectrum;
	const levels = await requestLevels(isSpectrum).catch(() => null);
	if (!levels || typeof levels.peak !== "number") return;

	const peak = levels.peak > 0 ? 20 * Math.log10(levels.peak) : -Infinity;
	const reduction = levels.gain < 1 ? 20 * Math.log10(levels.gain) : 0;
	state.meterPeak = Math.max(peak, state.meterPeak - 1.5);
	state.meterReduction = Math.min(reduction, state.meterReduction + 1);

	const outputLevel = Number.isFinite(state.meterPeak) ? Math.max(0, Math.min(1, (state.meterPeak + 48) / 48)) : 0;
	const loudnessLevel = Math.max(0, Math.min(1, (levels.lufs + 40) / 40));
	element("outputBar").style.width = `${100 - outputLevel * 100}%`;
	element("outputText").textContent = formatLevel(state.meterPeak);
	element("loudnessBar").style.width = `${100 - loudnessLevel * 100}%`;
	element("loudnessText").textContent = `${formatLevel(levels.lufs)} LUFS`;
	element("reductionBar").style.width = `${Math.min(1, -state.meterReduction / 24) * 100}%`;
	element("reductionText").textContent = state.meterReduction.toFixed(1).replace("-", "−");
	element("guard").hidden = !levels.isGuarded;

	const meters = {
		agc: `Riding gain ${formats.db(levels.agc)}`,
		bands: `Squeezing low ${formats.db(levels.reduction[0])}, mid ${formats.db(levels.reduction[1])}, high ${formats.db(levels.reduction[2])}`,
		clip: levels.shaved > 0 ? `Shaving ${levels.shaved.toFixed(1)} dB off peaks` : "Peaks are under the clip point",
		deess: levels.deess < -.05 ? `Taming esses by ${Math.abs(levels.deess).toFixed(1)} dB` : "No harsh esses right now",
	};
	for (const live of document.querySelectorAll("[data-meter]")) live.textContent = meters[live.dataset.meter];

	if (state.recordingSince !== levels.recordingSince) {
		state.recordingSince = levels.recordingSince;
	}
	if (state.compare !== levels.compare) {
		state.compare = levels.compare;
		renderStatus();
	}
	renderTools();
	if (isSpectrum) drawSpectrum(levels.spectrum);

}

function drawSpectrum(values) {

	const canvas = element("spectrum");
	canvas.hidden = !state.prefs.showSpectrum;
	const width = canvas.clientWidth;
	const height = canvas.clientHeight;
	if (!width) return;

	const ratio = window.devicePixelRatio || 1;
	if (canvas.width !== Math.round(width * ratio)) {
		canvas.width = Math.round(width * ratio);
		canvas.height = Math.round(height * ratio);
	}
	const graphics = canvas.getContext("2d");
	graphics.setTransform(ratio, 0, 0, ratio, 0, 0);
	graphics.clearRect(0, 0, width, height);

	const styles = getComputedStyle(document.documentElement);
	const accent = styles.getPropertyValue("--accent").trim();
	const hot = styles.getPropertyValue("--hot").trim();
	const muted = styles.getPropertyValue("--muted").trim();
	graphics.font = "600 11px 'Barlow Condensed', sans-serif";
	graphics.fillStyle = muted;
	graphics.textAlign = "right";
	graphics.fillText(state.spectrumView === "before" ? "Before" : "After", width - 8, 14);
	if (!values) return;

	const gap = 2;
	const barWidth = (width - 8 - gap * (values.length - 1)) / values.length;
	for (const [index, value] of values.entries()) {
		state.peaks[index] = Math.max(value, (state.peaks[index] ?? 0) - .012);
		const x = 4 + index * (barWidth + gap);
		const barHeight = Math.max(1, value * (height - 8));
		graphics.fillStyle = value > .9 ? hot : accent;
		graphics.globalAlpha = .35 + value * .65;
		graphics.fillRect(x, height - 4 - barHeight, barWidth, barHeight);
		graphics.globalAlpha = 1;
		graphics.fillStyle = state.peaks[index] > .9 ? hot : accent;
		graphics.fillRect(x, height - 4 - state.peaks[index] * (height - 8) - 2, barWidth, 2);
	}

}

async function refreshTabs() {

	const response = await worker("list").catch(() => []);
	const list = Array.isArray(response) ? response : [];
	element("tabCount").textContent = list.length;
	element("tabEmpty").hidden = list.length > 0;
	element("tabActions").hidden = list.length === 0;

	element("tabList").replaceChildren(...list.map(item => {
		const row = el("li");
		const head = el("div", "tab-head");
		const icon = el("img", "favicon");
		const name = el("button", "name", item.title);
		const mode = el("span", "mode-tag", item.mode === "direct" ? "Direct" : "Capture");
		const ghost = el("button", "mini", item.isMuted ? "Unghost" : "Ghost");
		const stopButton = el("button", "mini", "Stop");
		const mixer = el("div", "mixer");
		const slider = el("input");
		const level = el("span", item.isHot ? "level is-hot" : "level", item.isMuted ? "Ghosted" : `${Math.round(item.volume)}%`);

		icon.alt = "";
		if (/^(https?:|data:)/.test(item.favIconUrl)) icon.src = item.favIconUrl;
		name.type = "button";
		name.title = "Switch to this tab";
		ghost.type = "button";
		ghost.setAttribute("aria-pressed", String(item.isMuted));
		stopButton.type = "button";
		slider.type = "range";
		const cap = item.isAscended ? state.prefs.ascendCap : state.prefs.normalCap;
		slider.min = 0;
		slider.max = cap;
		slider.step = 5;
		slider.value = item.volume;
		slider.setAttribute("aria-label", `Volume for ${item.title}`);
		slider.style.setProperty("--b", item.volume / cap * 100);
		row.classList.toggle("is-current", item.tabId === state.tab.id);
		head.append(icon, name, mode, ghost, stopButton);
		mixer.append(slider, level);
		row.append(head, mixer);

		let isQueued = false;
		slider.addEventListener("input", () => {
			const volume = Number(slider.value);
			level.textContent = `${volume}%`;
			slider.style.setProperty("--b", volume / cap * 100);
			if (item.tabId === state.tab.id) {
				change({ volume, muted: false });
				return;
			}
			if (isQueued) return;
			isQueued = true;
			requestAnimationFrame(() => {
				isQueued = false;
				worker("setVolume", { tabId: item.tabId, volume: Number(slider.value) }).catch(() => {});
			});
		});
		name.addEventListener("click", async () => {
			await worker("focus", { tabId: item.tabId }).catch(() => {});
			window.close();
		});
		ghost.addEventListener("click", async () => {
			if (item.tabId === state.tab.id) change({ muted: !state.settings.muted });
			else await worker("ghost", { tabId: item.tabId }).catch(() => {});
			refreshTabs();
		});
		stopButton.addEventListener("click", async () => {
			if (item.tabId === state.tab.id) {
				await stop();
				return;
			}
			await worker("stop", { tabId: item.tabId }).catch(() => {});
			refreshTabs();
		});
		return row;
	}));

}

function selectPanel(name) {

	state.panel = name;
	for (const button of document.querySelectorAll(".tabs button")) {
		const isSelected = button.dataset.panel === name;
		button.setAttribute("aria-selected", String(isSelected));
		element(`panel-${button.dataset.panel}`).hidden = !isSelected;
	}
	document.querySelector("main").scrollTop = 0;
	render();
	if (name === "tabs") refreshTabs();

}

function nudgeVolume(direction) {

	const { volume } = state.settings;
	const step = (direction > 0 ? volume >= state.prefs.normalCap : volume > state.prefs.normalCap) ? state.prefs.volumeStep * 10 : state.prefs.volumeStep;
	change({ volume: Math.max(0, volume + step * direction), muted: false });

}

async function stepHistory(isUndo) {

	if (!state.isActive) return;
	const result = await worker(isUndo ? "undo" : "redo", { tabId: state.tab.id }).catch(() => null);
	updateHistory(result);
	if (!result?.ok) return;
	state.settings = mergeSettings(result.settings);
	render();

}

async function selectSlot(slot) {

	if (slot === state.slot) return;
	const result = await worker("swapSlot", { tabId: state.tab.id, settings: state.settings, host: state.host }).catch(() => null);
	if (!result?.ok) return;
	state.slot = result.slot;
	state.hasOther = result.hasOther;
	state.settings = mergeSettings(result.settings);
	render();
	if (!state.isActive) commit(true);

}

function bindEvents() {

	for (const button of document.querySelectorAll(".tabs button")) {
		button.addEventListener("click", () => selectPanel(button.dataset.panel));
	}

	element("power").addEventListener("change", event => {
		if (event.target.checked) start();
		else stop();
	});

	element("modeChip").addEventListener("click", async () => {
		const target = state.mode === "direct" ? "capture" : "direct";
		const result = await worker("switchMode", { tabId: state.tab.id, mode: target, info: tabInfo() }).catch(error => ({ ok: false, error: error.message }));
		if (result?.ok) {
			state.mode = result.mode;
			state.compare = "boosted";
		}
		showError(result?.error ?? "");
		render();
	});

	element("volume").addEventListener("input", event => change({ volume: Number(event.target.value), muted: false }));
	element("volume").addEventListener("dblclick", () => change({ volume: 100, muted: false }));
	element("volumeDown").addEventListener("click", () => nudgeVolume(-1));
	element("volumeUp").addEventListener("click", () => nudgeVolume(1));

	element("volumeChips").addEventListener("click", event => {
		const chip = event.target.closest("button");
		if (!chip) return;
		if (chip.hasAttribute("data-mute")) {
			change({ muted: !state.settings.muted });
			return;
		}
		const cap = maxVolume(state.settings, state.prefs);
		change({ volume: chip.dataset.volume === "max" ? cap : Math.min(cap, Number(chip.dataset.volume)), muted: false });
	});

	element("compare").addEventListener("click", async event => {
		const button = event.target.closest("button");
		if (!button || !state.isActive) return;
		const result = await worker("compare", { tabId: state.tab.id, mode: button.dataset.value }).catch(() => null);
		if (result?.ok) state.compare = result.compare;
		render();
	});

	element("undo").addEventListener("click", () => stepHistory(true));
	element("redo").addEventListener("click", () => stepHistory(false));
	element("slotA").addEventListener("click", () => selectSlot("A"));
	element("slotB").addEventListener("click", () => selectSlot("B"));
	element("copySlot").addEventListener("click", async () => {
		const result = await worker("copySlot", { tabId: state.tab.id, settings: state.settings }).catch(() => null);
		if (!result?.ok) return;
		const button = element("copySlot");
		button.textContent = `To ${state.slot === "A" ? "B" : "A"}`;
		setTimeout(() => {
			button.textContent = "Copy";
		}, 1200);
	});

	element("record").addEventListener("click", async () => {
		if (!state.isActive) await start();
		if (!state.isActive) return;
		const result = await worker("record", { tabId: state.tab.id }).catch(() => null);
		state.recordingSince = result?.isRecording ? Date.now() : 0;
		renderTools();
	});

	element("sink").addEventListener("change", async event => {
		const sinkId = event.target.value;
		if (sinkId === "permission") {
			event.target.value = state.sinkId;
			chrome.tabs.create({ url: chrome.runtime.getURL("options.html#general") });
			return;
		}
		const result = await worker("sink", { tabId: state.tab.id, sinkId, info: tabInfo() }).catch(error => ({ ok: false, error: error.message }));
		if (result?.ok) {
			state.sinkId = sinkId;
			state.isActive = true;
			state.mode = result.mode ?? "capture";
			startLevels();
		}
		showError(result?.ok ? "" : describeError(result?.error));
		render();
	});

	element("spectrum").addEventListener("click", () => {
		state.spectrumView = state.spectrumView === "after" ? "before" : "after";
		state.peaks = [];
		drawSpectrum(null);
	});

	element("maxxEverything").addEventListener("click", () => change({ ...maxxEverything }));

	element("remember").addEventListener("change", async event => {
		state.isRemembered = event.target.checked;
		await worker("remember", { host: state.host, settings: state.settings, isOn: state.isRemembered }).catch(() => {});
		renderStacks();
	});

	element("saveStack").addEventListener("submit", async event => {
		event.preventDefault();
		const input = element("stackName");
		const name = input.value.trim();
		if (!name) return;
		await saveStack(name, state.settings);
		input.value = "";
		renderUserStacks();
	});

	element("copyCode").addEventListener("click", () => copyCode(state.settings, ""));

	element("codeForm").addEventListener("submit", async event => {
		event.preventDefault();
		const status = element("codeStatus");
		try {
			const decoded = await decodeShareCode(element("codeInput").value);
			change(decoded.settings);
			status.textContent = `Applied ${decoded.name ? `"${decoded.name}"` : "the shared stack"}.`;
		} catch (error) {
			status.textContent = error.message;
		}
	});

	element("saveCode").addEventListener("click", async () => {
		const status = element("codeStatus");
		try {
			const decoded = await decodeShareCode(element("codeInput").value);
			await saveStack(decoded.name || "Shared stack", decoded.settings);
			renderUserStacks();
			status.textContent = `Saved "${decoded.name || "Shared stack"}" to your stacks.`;
		} catch (error) {
			status.textContent = error.message;
		}
	});

	element("applyAll").addEventListener("click", async () => {
		await worker("applyAll", { settings: state.settings }).catch(() => {});
		refreshTabs();
	});

	element("stopAll").addEventListener("click", async () => {
		await worker("stopAll").catch(() => {});
		state.isActive = false;
		state.mode = "";
		stopLevels();
		render();
		refreshTabs();
	});

	element("resetAll").addEventListener("click", () => {
		state.settings = defaultSettings();
		render();
		commit(false);
		if (state.isSpeedAvailable && state.speed !== 1) {
			state.speed = 1;
			renderSpeed();
			queueSpeed();
		}
	});

	element("openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());
	element("popOut").addEventListener("click", async () => {
		await chrome.windows.create({ url: chrome.runtime.getURL(`popup.html?tab=${state.tab.id}`), type: "popup", width: 476, height: 640 });
		window.close();
	});
	element("shortcuts").addEventListener("click", () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" }));

	document.addEventListener("keydown", event => {
		if (!(event.ctrlKey || event.metaKey) || event.target.closest("input[type='text'], input:not([type]), textarea, .value-input")) return;
		const key = event.key.toLowerCase();
		if (key === "z" && !event.shiftKey) stepHistory(true);
		else if (key === "y" || (key === "z" && event.shiftKey)) stepHistory(false);
		else return;
		event.preventDefault();
	});

}

async function init() {

	buildQuick();
	buildPanels();
	buildBuiltIns();
	bindEvents();

	const targetId = Number(new URLSearchParams(location.search).get("tab"));
	const tab = targetId ? await chrome.tabs.get(targetId).catch(() => null) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
	if (!tab) {
		showError("That tab is closed.");
		return;
	}
	state.tab = tab;
	document.body.classList.toggle("is-window", Boolean(targetId));
	state.host = hostOf(tab?.url ?? "");
	element("siteTitle").textContent = tab?.title || "This tab";
	if (/^(https?:|data:)/.test(tab?.favIconUrl ?? "")) element("siteIcon").src = tab.favIconUrl;

	const [response, stored, hasHostAccess] = await Promise.all([
		worker("get", { tabId: tab.id, host: state.host }).catch(() => null),
		chrome.storage.local.get(["prefs", "stacks", "stats"]),
		chrome.permissions.contains({ origins: ["<all_urls>"] }).catch(() => false),
	]);
	state.prefs = mergePrefs(stored.prefs);
	state.stacks = Array.isArray(stored.stacks) ? stored.stacks : [];
	state.stats = stored.stats ?? {};
	state.hasHostAccess = hasHostAccess;
	applyTheme(state.prefs);
	if (response?.settings) {
		state.isActive = response.isActive;
		state.mode = response.mode ?? "";
		state.isRemembered = response.isRemembered;
		state.settings = mergeSettings(response.settings);
		state.compare = response.compare ?? "boosted";
		state.slot = response.slot ?? "A";
		state.hasOther = Boolean(response.hasOther);
		state.canUndo = Boolean(response.canUndo);
		state.canRedo = Boolean(response.canRedo);
		state.sinkId = response.sinkId ?? "";
		state.isGuarded = Boolean(response.isGuarded);
	}

	renderUserStacks();
	render();
	drawSpectrum(null);
	if (state.isActive) startLevels();
	refreshTabs();
	loadSpeed();
	loadDevices();

}

init();
