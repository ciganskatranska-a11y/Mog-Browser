// The home page: a free canvas of widgets. widgets.js says what each widget shows, this file places and edits them.
const edge = 16;

const home = {
	data: null,
	search: { name: "Google", web: "https://www.google.com/search?q=%s" },
	widgets: [],
	boxes: new Map(),
	cleanups: new Map(),
	busy: new Set(),
	tickers: new Set(),
	statViews: new Set(),
	shownTotal: 0,
	countFrame: 0,
	saveTimer: 0,
	zoomTimer: 0,
	layer: 1,
	optionsFor: "",
	isEditing: false,
	isEditingSites: false,
	isChinese: false,
};

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const typeOf = widget => widgetTypes[widget.type];

function optionsOf(widget) {

	const options = { ...widget.options };
	for (const option of typeOf(widget).options) {
		if (option.type !== "button" && typeof options[option.key] !== typeof option.value) options[option.key] = option.value;
	}
	return options;

}

function makeWidget(type, x, y, options = {}) {

	const id = Math.random().toString(36).slice(2, 10) || "w";
	return { id, type, x, y, w: widgetTypes[type].w, h: widgetTypes[type].h ?? 0, options, data: null };

}

// The layout people get before they move anything. Corners are 0 and 100, so those widgets hug the edges at any window size.
function defaultWidgets(custom) {

	const widgets = [makeWidget("title", 50, 23), makeWidget("search", 50, 43)];
	if (custom.showSites !== false) widgets.push(makeWidget("sites", 50, 70));
	if (custom.showStats !== false) widgets.push(makeWidget("stats", 0, 0));
	if (custom.showClock !== false) widgets.push(makeWidget("clock", 100, 0));
	if (custom.showNotes) widgets.push(makeWidget("notes", 0, 100, { text: custom.notes ?? "" }));
	return widgets;

}

function persist(isNow) {

	clearTimeout(home.saveTimer);
	const write = () => window.mogHome.set({ home: { widgets: home.widgets } }).catch(() => {});
	if (isNow) return write();
	home.saveTimer = setTimeout(write, 250);
	return undefined;

}

function currentSites() {

	const { bookmarks, settings } = home.data;
	if (settings.home.sites.length) return settings.home.sites.map(site => ({ title: site.title, url: site.url }));

	const seen = new Set();
	const sites = [];
	const add = (title, url) => {
		const host = hostOf(url);
		if (seen.has(host) || sites.length >= 12) return;
		seen.add(host);
		sites.push({ title, url });
	};
	for (const item of bookmarks) add(item.title, item.url);
	for (const [title, host] of settings.chinaMode ? chinaSites : popularSites) add(title, `https://${host}/`);
	return sites;

}

async function saveSites(sites) {

	const next = await window.mogHome.set({ home: { sites } });
	if (!next) return;
	home.data = next;
	element("resetSites").hidden = !next.settings.home.sites.length;
	rerenderType("sites");

}

function buildSites(options) {

	const sites = currentSites();
	const section = el("section", home.isEditingSites ? "sites-section is-editing" : "sites-section");
	const grid = el("nav", options.showNames ? "sites" : "sites is-bare");
	const form = el("form", "add-site");
	const name = el("input");
	const address = el("input");
	const submit = el("button", "", t("add"));
	const cancel = el("button", "quiet", t("cancel"));
	const edit = el("button", "edit");
	const setAdding = isOpen => {
		form.classList.toggle("is-open", isOpen);
		form.inert = !isOpen;
		if (isOpen) name.focus();
		else form.reset();
	};

	section.id = "sitesSection";
	grid.id = "sites";
	grid.setAttribute("aria-label", "Sites");
	grid.style.setProperty("--columns", options.columns);

	const tiles = sites.map((site, index) => {
		const link = el("a", "tile");
		const remove = el("button", "tile-remove");
		const host = hostOf(site.url);
		link.href = site.url;
		link.title = host;
		link.style.setProperty("--i", index);
		remove.type = "button";
		remove.setAttribute("aria-label", `${t("remove")} ${site.title}`);
		remove.append(icon("close"));
		remove.addEventListener("click", event => {
			event.preventDefault();
			event.stopPropagation();
			link.classList.add("is-leaving");
			setTimeout(() => saveSites(sites.filter((item, position) => position !== index)), 200);
		});
		link.addEventListener("click", event => {
			if (home.isEditingSites) event.preventDefault();
		});
		link.append(siteIcon(`https://${host}/favicon.ico`, site.title), el("span", "", site.title), remove);
		return link;
	});
	if (home.isEditingSites && sites.length < 24) {
		const add = el("button", "tile is-add");
		add.type = "button";
		add.style.setProperty("--i", sites.length);
		add.append(icon("plus"), el("span", "", t("addSite")));
		add.addEventListener("click", () => setAdding(true));
		tiles.push(add);
	}
	grid.append(...tiles);

	form.id = "addSite";
	form.inert = true;
	name.id = "siteName";
	name.type = "text";
	name.maxLength = 30;
	name.required = true;
	name.placeholder = t("siteName");
	name.setAttribute("aria-label", t("siteName"));
	address.id = "siteUrl";
	address.type = "text";
	address.maxLength = 500;
	address.required = true;
	address.placeholder = t("siteUrl");
	address.setAttribute("aria-label", t("siteUrl"));
	cancel.type = "button";
	cancel.addEventListener("click", () => setAdding(false));
	form.append(name, address, submit, cancel);
	form.addEventListener("submit", event => {
		event.preventDefault();
		const title = name.value.trim();
		let url = address.value.trim();
		if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
		if (!title || !hostOf(url).includes(".")) return address.focus();
		return saveSites([...currentSites(), { title, url }]);
	});
	form.addEventListener("keydown", event => {
		if (event.key === "Escape") setAdding(false);
	});

	edit.id = "editSites";
	edit.type = "button";
	edit.append(icon("edit"), el("span", "", t(home.isEditingSites ? "done" : "editSites")));
	edit.addEventListener("click", () => {
		home.isEditingSites = !home.isEditingSites;
		rerenderType("sites");
	});

	section.append(grid, form, edit);
	return section;

}

function renderTier(view, total) {

	if (!view.tier) return;
	const index = tiers.findLastIndex(([minimum]) => total >= minimum);
	const [floor, name] = tiers[index];
	const next = tiers[index + 1];
	view.tier.textContent = name;
	view.next.textContent = next ? `${t("rating")} · ${(next[0] - total).toLocaleString()} → ${next[1]}` : t("rating");
	view.bar.style.transform = `scaleX(${next ? (total - floor) / (next[0] - floor) : 1})`;

}

// Counts up to the live total instead of jumping.
function showTotal(total) {

	if (total === home.shownTotal) return;
	const from = home.shownTotal;
	const started = performance.now();
	const duration = Math.min(900, 200 + Math.abs(total - from) * 30);
	cancelAnimationFrame(home.countFrame);
	for (const view of home.statViews) {
		view.blocked.classList.remove("is-bumped");
		void view.blocked.offsetWidth;
		view.blocked.classList.add("is-bumped");
	}

	const step = now => {
		const progress = Math.min(1, (now - started) / duration);
		home.shownTotal = Math.round(from + (total - from) * (1 - (1 - progress) ** 3));
		for (const view of home.statViews) {
			view.blocked.textContent = home.shownTotal.toLocaleString();
			renderTier(view, home.shownTotal);
		}
		if (progress < 1) home.countFrame = requestAnimationFrame(step);
	};
	home.countFrame = requestAnimationFrame(step);

}

// Keeps a widget fully on screen. Its saved spot is the centre, as a share of the window.
function place(widget) {

	const box = home.boxes.get(widget.id);
	if (!box) return;
	const width = box.offsetWidth;
	const height = box.offsetHeight;
	const left = width >= innerWidth - edge * 2 ? (innerWidth - width) / 2 : clamp(widget.x / 100 * innerWidth - width / 2, edge, innerWidth - width - edge);
	const top = height >= innerHeight - edge * 2 ? Math.max(edge, (innerHeight - height) / 2) : clamp(widget.y / 100 * innerHeight - height / 2, edge, innerHeight - height - edge);
	box.style.left = `${Math.round(left)}px`;
	box.style.top = `${Math.round(top)}px`;

}

function placeAll() {
	for (const widget of home.widgets) place(widget);
}

// Remembers where a box ended up. One resting against an edge is saved as that edge, so it stays there when the window changes size.
function remember(widget) {

	const box = home.boxes.get(widget.id);
	const left = box.offsetLeft;
	const top = box.offsetTop;
	const width = box.offsetWidth;
	const height = box.offsetHeight;
	widget.x = left <= edge + 1 ? 0 : left + width >= innerWidth - edge - 1 ? 100 : (left + width / 2) / innerWidth * 100;
	widget.y = top <= edge + 1 ? 0 : top + height >= innerHeight - edge - 1 ? 100 : (top + height / 2) / innerHeight * 100;

}

function contextFor(widget) {

	return {
		widget,
		home,
		options: optionsOf(widget),
		update: patch => {
			widget.options = { ...widget.options, ...patch };
			persist();
		},
		setData: data => {
			widget.data = data;
			persist();
			if (home.widgets.includes(widget)) fill(widget);
		},
		rerender: () => fill(widget),
		busy: isBusy => {
			if (isBusy) home.busy.add(widget.id);
			else home.busy.delete(widget.id);
		},
		isBusy: () => home.busy.has(widget.id),
		everySecond: tick => {
			home.tickers.add(tick);
			tick();
			return () => home.tickers.delete(tick);
		},
	};

}

function fill(widget) {

	const box = home.boxes.get(widget.id);
	if (!box) return;
	const body = box.querySelector(".widget-body");
	home.cleanups.get(widget.id)?.();
	home.cleanups.delete(widget.id);
	home.busy.delete(widget.id);
	body.replaceChildren();
	const cleanup = typeOf(widget).render(body, contextFor(widget));
	if (typeof cleanup === "function") home.cleanups.set(widget.id, cleanup);
	place(widget);

}

function rerenderType(type) {
	for (const widget of home.widgets.filter(item => item.type === type)) fill(widget);
}

function size(widget) {

	const box = home.boxes.get(widget.id);
	box.style.width = `${Math.min(widget.w, innerWidth - edge * 2)}px`;
	box.style.height = widget.h ? `${Math.min(widget.h, innerHeight - edge * 2)}px` : "";

}

function showGuides(x, y) {

	element("guideX").hidden = x === null;
	element("guideY").hidden = y === null;
	if (x !== null) element("guideX").style.left = `${Math.round(x)}px`;
	if (y !== null) element("guideY").style.top = `${Math.round(y)}px`;

}

function startMove(widget, box, event) {

	if (!home.isEditing || event.button !== 0 || event.target.closest(".box-tools, .box-size")) return;
	event.preventDefault();
	closeOptions();

	const start = { x: event.clientX, y: event.clientY, left: box.offsetLeft, top: box.offsetTop };
	const width = box.offsetWidth;
	const height = box.offsetHeight;
	const others = home.widgets.filter(item => item !== widget).map(item => home.boxes.get(item.id)).map(other => ({ x: other.offsetLeft + other.offsetWidth / 2, y: other.offsetTop + other.offsetHeight / 2 }));
	const snap = (value, targets) => targets.find(target => Math.abs(target - value) < 7) ?? null;

	box.setPointerCapture(event.pointerId);
	box.classList.add("is-moving");
	box.style.zIndex = ++home.layer;

	const move = moveEvent => {
		let left = start.left + moveEvent.clientX - start.x;
		let top = start.top + moveEvent.clientY - start.y;
		const lineX = moveEvent.altKey ? null : snap(left + width / 2, [innerWidth / 2, ...others.map(other => other.x)]);
		const lineY = moveEvent.altKey ? null : snap(top + height / 2, [innerHeight / 2, ...others.map(other => other.y)]);
		if (lineX !== null) left = lineX - width / 2;
		if (lineY !== null) top = lineY - height / 2;
		box.style.left = `${Math.round(clamp(left, edge, Math.max(edge, innerWidth - width - edge)))}px`;
		box.style.top = `${Math.round(clamp(top, edge, Math.max(edge, innerHeight - height - edge)))}px`;
		showGuides(lineX, lineY);
	};
	const finish = () => {
		box.removeEventListener("pointermove", move);
		box.removeEventListener("pointerup", finish);
		box.removeEventListener("pointercancel", finish);
		box.classList.remove("is-moving");
		showGuides(null, null);
		remember(widget);
		home.widgets = [...home.widgets.filter(item => item !== widget), widget];
		persist();
	};
	box.addEventListener("pointermove", move);
	box.addEventListener("pointerup", finish);
	box.addEventListener("pointercancel", finish);

}

function startResize(widget, box, event) {

	if (event.button !== 0) return;
	event.preventDefault();
	event.stopPropagation();
	closeOptions();

	const type = typeOf(widget);
	const handle = event.currentTarget;
	const start = { x: event.clientX, y: event.clientY, width: box.offsetWidth, height: box.offsetHeight };
	handle.setPointerCapture(event.pointerId);
	box.classList.add("is-moving");

	const move = moveEvent => {
		widget.w = Math.round(clamp(start.width + moveEvent.clientX - start.x, type.minW ?? 120, innerWidth - box.offsetLeft - edge));
		if (type.h) widget.h = Math.round(clamp(start.height + moveEvent.clientY - start.y, type.minH ?? 80, innerHeight - box.offsetTop - edge));
		box.style.width = `${widget.w}px`;
		if (type.h) box.style.height = `${widget.h}px`;
	};
	const finish = () => {
		handle.removeEventListener("pointermove", move);
		handle.removeEventListener("pointerup", finish);
		handle.removeEventListener("pointercancel", finish);
		box.classList.remove("is-moving");
		remember(widget);
		persist();
	};
	handle.addEventListener("pointermove", move);
	handle.addEventListener("pointerup", finish);
	handle.addEventListener("pointercancel", finish);

}

function removeWidget(widget) {

	const box = home.boxes.get(widget.id);
	closeOptions();
	home.cleanups.get(widget.id)?.();
	home.cleanups.delete(widget.id);
	home.boxes.delete(widget.id);
	home.widgets = home.widgets.filter(item => item !== widget);
	box.classList.add("is-leaving");
	setTimeout(() => box.remove(), 200);
	persist();
	renderGallery();

}

function mount(widget, index = 0) {

	const type = typeOf(widget);
	const box = el("section", `widget-box is-${widget.type}`);
	const body = el("div", "widget-body");
	const tools = el("div", "box-tools");
	const handle = el("i", "box-size");

	box.dataset.id = widget.id;
	box.style.setProperty("--i", index);
	box.style.zIndex = ++home.layer;
	tools.append(el("span", "box-name", type.name));
	if (type.options.length) tools.append(iconButton("gear", "Widget settings", () => openOptions(widget)));
	tools.append(iconButton("close", t("remove"), () => removeWidget(widget)));
	handle.title = "Drag to resize";
	handle.addEventListener("pointerdown", event => startResize(widget, box, event));
	box.addEventListener("pointerdown", event => startMove(widget, box, event));
	box.append(body, tools, handle);
	element("canvas").append(box);
	home.boxes.set(widget.id, box);
	size(widget);
	fill(widget);
	new ResizeObserver(() => {
		if (!box.classList.contains("is-moving")) place(widget);
	}).observe(box);

}

function renderWidgets() {

	closeOptions();
	for (const cleanup of home.cleanups.values()) cleanup();
	home.cleanups.clear();
	home.boxes.clear();
	home.statViews.clear();
	home.tickers.clear();
	home.busy.clear();
	element("canvas").replaceChildren();
	for (const [index, widget] of home.widgets.entries()) mount(widget, index);
	renderGallery();

}

function addWidget(type) {

	if (home.widgets.length >= 40) return;
	const widget = makeWidget(type, 50, 50);
	home.widgets.push(widget);
	mount(widget);
	setPanel("gallery", false);
	setEditing(true);
	persist();
	renderGallery();
	if (type === "site" || type === "weather") home.boxes.get(widget.id).querySelector("input")?.focus();

}

function renderGallery() {

	element("galleryList").replaceChildren(...Object.entries(widgetTypes).map(([type, info]) => {
		const button = el("button", "gallery-item");
		const isTaken = info.isSingle && home.widgets.some(widget => widget.type === type);
		button.type = "button";
		button.disabled = isTaken;
		button.dataset.type = type;
		button.append(el("strong", "", info.name), el("span", "", isTaken ? "Already on your page." : info.hint));
		button.addEventListener("click", () => addWidget(type));
		return button;
	}));

}

function closeOptions() {

	element("options").hidden = true;
	home.optionsFor = "";

}

// The settings card for one widget: every option its type lists, so people choose what the widget shows.
function openOptions(widget) {

	const panel = element("options");
	const box = home.boxes.get(widget.id);
	if (home.optionsFor === widget.id) return closeOptions();
	const type = typeOf(widget);
	const current = optionsOf(widget);
	const change = (key, value) => {
		widget.options = { ...widget.options, [key]: value };
		if (key === "url" || key === "place") widget.data = null;
		persist();
		fill(widget);
	};

	const rows = type.options.map(option => {
		if (option.type === "button") {
			const button = el("button", "button", option.label);
			button.type = "button";
			button.addEventListener("click", () => option.run(contextFor(widget)));
			return button;
		}
		const row = el("label", option.type === "toggle" ? "row" : "field");
		let input = el("input");
		if (option.type === "select") {
			input = el("select");
			for (const choice of option.choices) input.add(new Option(option.names?.[choice] ?? choice, choice));
			input.value = current[option.key];
		} else if (option.type === "toggle") {
			input.type = "checkbox";
			input.setAttribute("role", "switch");
			input.checked = current[option.key];
		} else {
			input.type = option.type;
			input.value = current[option.key];
			if (option.max) input[option.type === "number" ? "max" : "maxLength"] = option.max;
			if (option.min) input.min = option.min;
			if (option.placeholder) input.placeholder = option.placeholder;
		}
		input.dataset.option = option.key;
		input.addEventListener(option.type === "text" ? "change" : "input", () => {
			if (option.type === "toggle") return change(option.key, input.checked);
			if (option.type === "number") return change(option.key, clamp(Number(input.value) || option.value, option.min ?? 0, option.max ?? 9999));
			return change(option.key, input.value);
		});
		if (option.type === "text") {
			input.addEventListener("keydown", event => {
				if (event.key === "Enter") input.blur();
			});
		}
		row.append(el("span", "", option.label), input);
		return row;
	});

	const head = el("div", "customize-head");
	head.append(el("h2", "", type.name), iconButton("close", "Close", closeOptions));
	panel.replaceChildren(head, ...rows);
	panel.hidden = false;
	home.optionsFor = widget.id;

	const bounds = box.getBoundingClientRect();
	const width = panel.offsetWidth;
	const height = panel.offsetHeight;
	const left = bounds.right + 12 + width <= innerWidth - edge ? bounds.right + 12 : bounds.left - 12 - width >= edge ? bounds.left - 12 - width : innerWidth - width - edge;
	panel.style.left = `${Math.round(clamp(left, edge, innerWidth - width - edge))}px`;
	panel.style.top = `${Math.round(clamp(bounds.top, edge, Math.max(edge, innerHeight - height - edge)))}px`;
	return undefined;

}

function setEditing(isEditing) {

	home.isEditing = isEditing;
	document.body.classList.toggle("is-editing", isEditing);
	element("editBar").inert = !isEditing;
	element("editLayout").setAttribute("aria-pressed", String(isEditing));
	for (const box of home.boxes.values()) box.querySelector(".widget-body").inert = isEditing;
	if (!isEditing) {
		closeOptions();
		setPanel("gallery", false);
		persist(true);
	} else {
		setPanel("customize", false);
	}

}

function setPanel(id, isOpen) {

	const other = id === "gallery" ? "customize" : "gallery";
	if (isOpen) setPanel(other, false);
	element(id).classList.toggle("is-open", isOpen);
	element(id).inert = !isOpen;
	document.body.classList.toggle("has-panel", element("gallery").classList.contains("is-open") || element("customize").classList.contains("is-open"));

}

async function resetLayout() {

	const next = await window.mogHome.set({ home: { widgets: null } });
	if (!next) return;
	home.data = next;
	home.widgets = defaultWidgets(next.settings.home);
	renderWidgets();
	setEditing(home.isEditing);

}

function render(data, isFirst) {

	home.data = data;
	const { settings } = data;
	const custom = settings.home;
	const backdrop = element("backdrop");
	const wasChinese = home.isChinese;

	applyMogTheme(settings.theme, settings.flag);
	applyMogLanguage(settings.chinaMode);
	home.search = data.search;
	home.isChinese = settings.chinaMode;

	backdrop.classList.toggle("has-image", Boolean(custom.background));
	backdrop.style.setProperty("--image", custom.background ? `url("mog://newtab/background?${encodeURIComponent(custom.background)}")` : "none");
	backdrop.style.setProperty("--dim", custom.dim / 100);

	element("dim").value = custom.dim;
	element("removeBackground").hidden = !custom.background;
	element("resetSites").hidden = !custom.sites.length;
	element("chinaMode").checked = settings.chinaMode;
	for (const [id, list] of [["themes", themePresets], ["countries", countryThemes]]) {
		element(id).replaceChildren(...list.map(preset => {
			const swatch = themeSwatch(preset, () => save(themePatch(preset)));
			swatch.setAttribute("aria-pressed", String(isThemeActive(preset, settings.theme, settings.flag)));
			return swatch;
		}));
	}

	if (isFirst) {
		home.shownTotal = data.blockedTotal;
		home.widgets = Array.isArray(custom.widgets) ? custom.widgets.filter(widget => widgetTypes[widget.type]) : defaultWidgets(custom);
		renderWidgets();
	} else if (wasChinese !== home.isChinese) {
		renderWidgets();
		setEditing(home.isEditing);
	}
	showTotal(data.blockedTotal);

}

async function save(patch) {

	const next = await window.mogHome.set(patch);
	if (next) render(next, false);

}

function bindEvents() {

	element("openCustomize").addEventListener("click", () => setPanel("customize", !element("customize").classList.contains("is-open")));
	element("closeCustomize").addEventListener("click", () => setPanel("customize", false));
	element("closeGallery").addEventListener("click", () => setPanel("gallery", false));
	element("scrim").addEventListener("click", () => {
		setPanel("customize", false);
		setPanel("gallery", false);
	});
	element("editLayout").addEventListener("click", () => setEditing(!home.isEditing));
	element("editDone").addEventListener("click", () => setEditing(false));
	element("editAdd").addEventListener("click", () => setPanel("gallery", true));
	element("editReset").addEventListener("click", resetLayout);
	element("customAdd").addEventListener("click", () => setPanel("gallery", true));
	element("customEdit").addEventListener("click", () => setEditing(true));
	element("resetSites").addEventListener("click", () => saveSites([]));

	document.addEventListener("keydown", event => {
		if (event.key !== "Escape") return;
		if (!element("options").hidden) return closeOptions();
		if (document.body.classList.contains("has-panel")) {
			setPanel("customize", false);
			return setPanel("gallery", false);
		}
		if (home.isEditing) setEditing(false);
		return undefined;
	});
	document.addEventListener("pointerdown", event => {
		if (!element("options").hidden && !event.target.closest("#options, .box-tools")) closeOptions();
	});

	// Ctrl+scroll here sizes the whole browser, so nobody has to dig through settings to make things bigger.
	addEventListener("wheel", event => {
		if (!event.ctrlKey) return;
		event.preventDefault();
		if (home.zoomTimer || !event.deltaY) return;
		home.zoomTimer = setTimeout(() => {
			home.zoomTimer = 0;
		}, 90);
		window.mogHome.zoom(event.deltaY < 0 ? 1 : -1);
	}, { passive: false });
	addEventListener("resize", () => {
		for (const widget of home.widgets) size(widget);
		placeAll();
		closeOptions();
	});
	addEventListener("pagehide", () => persist(true));

	element("backgroundFile").addEventListener("change", async event => {
		const [file] = event.target.files;
		event.target.value = "";
		if (!file) return;
		const next = await window.mogHome.background(await file.arrayBuffer(), file.type);
		if (next) render(next, false);
	});
	element("removeBackground").addEventListener("click", async () => {
		const next = await window.mogHome.background(null, "");
		if (next) render(next, false);
	});
	element("dim").addEventListener("input", event => element("backdrop").style.setProperty("--dim", event.target.value / 100));
	element("dim").addEventListener("change", event => save({ home: { dim: Number(event.target.value) } }));
	element("chinaMode").addEventListener("change", event => save({ chinaMode: event.target.checked }));

}

async function init() {

	bindEvents();
	const data = await window.mogHome?.data().catch(() => null);
	if (!data) return;
	render(data, true);
	document.fonts.ready.then(placeAll);
	setInterval(() => {
		for (const tick of home.tickers) tick();
	}, 1000);
	setInterval(async () => {
		if (document.hidden) return;
		const stats = await window.mogHome.stats().catch(() => null);
		if (stats) showTotal(stats.blockedTotal);
	}, 1500);

}

init();
