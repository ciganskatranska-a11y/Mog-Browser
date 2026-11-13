const element = id => document.getElementById(id);
const pages = ["look", "home", "search", "privacy", "bookmarks", "history", "about"];

let current = null;
let colorTimer = 0;
let savedTimer = 0;
let activePage = "";

function el(tag, className, text) {

	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;

}

function hostOf(url) {

	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return "";
	}

}

function flashSaved() {

	const badge = element("saved");
	badge.classList.add("is-shown");
	clearTimeout(savedTimer);
	savedTimer = setTimeout(() => badge.classList.remove("is-shown"), 1400);

}

async function save(patch) {

	const next = await window.mogSettings.set(patch);
	if (!next) return;
	render({ ...current, ...next });
	flashSaved();

}

async function act(name, value) {

	const next = await window.mogSettings.action(name, value);
	if (next) render({ ...current, ...next });
	flashSaved();

}

function showPage(name, isInstant) {

	const page = pages.includes(name) ? name : "look";
	if (page === activePage) return;
	activePage = page;
	for (const section of document.querySelectorAll(".page")) section.classList.toggle("is-active", section.id === `page-${page}`);

	const glider = element("navGlider");
	for (const link of element("nav").querySelectorAll("a")) {
		const isCurrent = link.dataset.page === page;
		if (isCurrent) link.setAttribute("aria-current", "page");
		else link.removeAttribute("aria-current");
		if (!isCurrent) continue;
		if (isInstant) glider.style.transition = "none";
		glider.style.height = `${link.offsetHeight}px`;
		glider.style.transform = `translateY(${link.offsetTop}px)`;
		if (isInstant) {
			void glider.offsetWidth;
			glider.style.transition = "";
		}
	}
	window.scrollTo({ top: 0 });

}

function themeCard(preset) {

	const card = el("button", "card");
	const { theme } = preset;
	card.type = "button";
	card.style.background = theme.background;
	card.style.color = theme.text;
	card.style.setProperty("--card-a", theme.accent);
	card.style.setProperty("--card-b", theme.hot);
	if (preset.stripe) card.style.setProperty("--stripe", stripeGradient(preset.stripe, "180deg"));
	card.setAttribute("aria-pressed", String(isThemeActive(preset, current.settings.theme, current.settings.flag)));
	card.append(el("span", "", preset.name));
	if (!preset.stripe) {
		const bar = el("i");
		for (const key of ["accent", "hot", "text"]) {
			const part = el("b");
			part.style.background = theme[key];
			bar.append(part);
		}
		card.append(bar);
	}
	card.addEventListener("click", () => save(themePatch(preset)));
	return card;

}

function removeButton(label, onClick) {

	const button = el("button");
	button.type = "button";
	button.setAttribute("aria-label", label);
	button.innerHTML = '<svg><use href="#s-close"/></svg>';
	button.addEventListener("click", () => {
		button.closest("li").classList.add("is-leaving");
		setTimeout(onClick, 190);
	});
	return button;

}

function renderRows(container, items, makeExtra) {

	container.replaceChildren(...items.map((item, index) => {
		const row = el("li");
		const image = el("img");
		const link = el("a", "", item.title || item.url);
		row.style.setProperty("--i", index);
		image.alt = "";
		image.src = `https://${hostOf(item.url)}/favicon.ico`;
		image.addEventListener("error", () => {
			image.style.visibility = "hidden";
		}, { once: true });
		link.href = item.url;
		link.title = item.url;
		row.append(image, link, ...makeExtra(item, index));
		return row;
	}));

}

function renderHistory() {

	const words = element("historyFilter").value.trim().toLowerCase();
	const items = current.history.filter(item => !words || item.url.toLowerCase().includes(words) || String(item.title).toLowerCase().includes(words));
	renderRows(element("historyList"), items.slice(0, 200), item => [el("span", "", new Date(item.time).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }))]);
	element("historyEmpty").hidden = current.history.length > 0;
	element("clearHistory").hidden = current.history.length === 0;

}

function render(data) {

	current = data;
	const settings = data.settings;
	const custom = settings.home;
	applyMogTheme(settings.theme, settings.flag);

	element("presets").replaceChildren(...themePresets.map(themeCard));
	element("countries").replaceChildren(...countryThemes.map(themeCard));

	for (const input of document.querySelectorAll("[data-theme]")) input.value = settings.theme[input.dataset.theme];
	for (const input of document.querySelectorAll("[data-home]")) {
		const value = custom[input.dataset.home];
		if (input.type === "checkbox") input.checked = value;
		else if (document.activeElement !== input) input.value = value;
	}
	const engine = element("searchEngine");
	if (!engine.options.length) for (const item of data.engines) engine.add(new Option(item.name, item.id));
	for (const input of document.querySelectorAll("[data-key]")) {
		if (input.type === "checkbox") input.checked = settings[input.dataset.key];
		else input.value = settings[input.dataset.key];
	}

	if (document.activeElement !== element("panicUrl")) element("panicUrl").value = settings.panicUrl;
	element("removeBackground").hidden = !custom.background;
	element("backgroundState").textContent = custom.background ? "Using your image." : "Using the theme gradient.";
	element("resetSites").hidden = !custom.sites.length;
	element("resetLayout").hidden = !custom.widgets;
	element("resetZoom").hidden = settings.uiZoom === 1;
	element("zoomState").textContent = `Hold Ctrl and scroll on the home page to make the whole browser bigger or smaller. Now at ${Math.round(settings.uiZoom * 100)}%.`;
	renderRows(element("siteList"), custom.sites, (site, index) => [
		el("span", "", hostOf(site.url)),
		removeButton(`Remove ${site.title}`, () => save({ home: { sites: custom.sites.filter((item, position) => position !== index) } })),
	]);

	renderRows(element("bookmarkList"), data.bookmarks, item => item.isBuiltIn
		? [el("span", "", "Built in")]
		: [removeButton(`Remove ${item.title}`, () => act("remove-bookmark", item.url))]);
	renderHistory();

	const { status, version, percent } = data.update ?? {};
	element("version").textContent = `Mog Browser ${data.version}`;
	element("updateState").textContent = status === "ready"
		? `Version ${version} is downloaded. It installs when you close the browser, or press Restart to update in the toolbar.`
		: status === "downloading"
			? `Downloading version ${version}: ${percent}%.`
			: "Updates download by themselves and install when you close the browser.";

}

function bindEvents() {

	window.addEventListener("hashchange", () => showPage(location.hash.slice(1)));

	for (const input of document.querySelectorAll("[data-theme]")) {
		input.addEventListener("input", () => {
			current.settings.theme[input.dataset.theme] = input.value;
			applyMogTheme(current.settings.theme, "");
			clearTimeout(colorTimer);
			colorTimer = setTimeout(() => save({ theme: { [input.dataset.theme]: input.value }, flag: "" }), 150);
		});
	}
	for (const input of document.querySelectorAll("[data-home]")) {
		input.addEventListener(input.type === "text" ? "input" : "change", () => save({ home: { [input.dataset.home]: input.type === "checkbox" ? input.checked : input.type === "range" ? Number(input.value) : input.value } }));
	}
	for (const input of document.querySelectorAll("[data-key]")) {
		input.addEventListener("change", () => save({ [input.dataset.key]: input.type === "checkbox" ? input.checked : input.value }));
	}

	element("backgroundFile").addEventListener("change", async event => {
		const [file] = event.target.files;
		event.target.value = "";
		if (!file) return;
		render({ ...current, ...(await window.mogSettings.background(await file.arrayBuffer(), file.type)) });
		flashSaved();
	});
	element("removeBackground").addEventListener("click", async () => {
		render({ ...current, ...(await window.mogSettings.background(null, "")) });
		flashSaved();
	});

	element("siteForm").addEventListener("submit", event => {
		event.preventDefault();
		const title = element("siteName").value.trim();
		let url = element("siteUrl").value.trim();
		if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
		if (!title || !hostOf(url).includes(".")) return element("siteUrl").focus();
		event.target.reset();
		save({ home: { sites: [...current.settings.home.sites, { title, url }] } });
	});
	element("resetSites").addEventListener("click", () => save({ home: { sites: [] } }));
	element("resetLayout").addEventListener("click", () => act("reset-layout"));
	element("resetZoom").addEventListener("click", () => save({ uiZoom: 1 }));

	element("panicUrl").addEventListener("change", event => save({ panicUrl: event.target.value }));
	element("historyFilter").addEventListener("input", renderHistory);
	element("clearHistory").addEventListener("click", async () => {
		await window.mogSettings.action("clear-history");
		render({ ...current, history: [] });
		flashSaved();
	});
	element("clearData").addEventListener("click", async () => {
		await window.mogSettings.action("clear-data");
		render({ ...current, history: [] });
		element("clearData").textContent = "Cleared";
		setTimeout(() => {
			element("clearData").textContent = "Clear browsing data now";
		}, 1800);
	});
	element("checkUpdate").addEventListener("click", () => act("check-update"));
	element("reset").addEventListener("click", () => act("reset"));

}

async function init() {

	bindEvents();
	render(await window.mogSettings.get());
	showPage(location.hash.slice(1), true);
	addEventListener("load", () => {
		activePage = "";
		showPage(location.hash.slice(1), true);
	});

}

init();
