const element = id => document.getElementById(id);

const tiers = [
	[0, "Normie"],
	[100, "MTN"],
	[1000, "HTN"],
	[5000, "Chadlite"],
	[25000, "Chad"],
	[100000, "Gigachad"],
	[500000, "Ascended"],
];

const home = {
	data: null,
	mode: "web",
	search: { name: "Google", web: "https://www.google.com/search?q=%s", images: "https://www.google.com/search?q=%s&udm=2", videos: "https://www.google.com/search?q=%s&udm=7" },
};

function el(tag, className, text) {

	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;

}

function renderSites() {

	const { bookmarks, settings } = home.data;
	const seen = new Set();
	const sites = [];
	const add = (title, url, isBuiltIn) => {
		const host = new URL(url).hostname.replace(/^www\./, "");
		if (seen.has(host) || sites.length >= 12) return;
		seen.add(host);
		sites.push({ title, url, host, isBuiltIn });
	};
	for (const item of bookmarks) add(item.title, item.url, item.isBuiltIn);
	for (const [title, host] of settings.chinaMode ? chinaSites : popularSites) add(title, `https://${host}/`, false);

	element("sites").hidden = !settings.home.showSites;
	element("sites").replaceChildren(...sites.map(site => {
		const link = el("a", site.isBuiltIn ? "is-built-in" : "");
		const icon = el("img");
		link.href = site.url;
		link.title = site.host;
		icon.alt = "";
		icon.src = `https://${site.host}/favicon.ico`;
		const fallback = () => icon.isConnected && icon.replaceWith(el("i", "", [...site.title][0].toUpperCase()));
		icon.addEventListener("error", fallback, { once: true });
		icon.addEventListener("load", () => {
			if (icon.naturalWidth < 8) fallback();
		}, { once: true });
		setTimeout(() => {
			if (!icon.complete || !icon.naturalWidth) fallback();
		}, 2500);
		link.append(icon, el("span", "", site.title));
		return link;
	}));

}

function renderStats() {

	const total = home.data.blockedTotal;
	const current = tiers.findLast(([minimum]) => total >= minimum);
	const next = tiers.find(([minimum]) => total < minimum);
	element("blocked").textContent = total.toLocaleString();
	element("tier").textContent = current[1];
	element("tierNext").textContent = next ? `${t("rating")} · ${(next[0] - total).toLocaleString()} → ${next[1]}` : t("rating");

}

function renderClock() {

	const now = new Date();
	const locale = home.data?.settings.chinaMode ? "zh-CN" : [];
	const time = now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
	const clock = element("time");
	if (clock.dataset.value !== time) {
		const previous = clock.dataset.value ?? "";
		clock.dataset.value = time;
		clock.replaceChildren(...[...time].map((character, index) => {
			const digit = el("span", previous && previous[index] !== character ? "digit is-rolling" : "digit", character);
			return digit;
		}));
	}
	element("date").textContent = now.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" });

}

function renderModes() {

	const engine = home.mode === "web" ? home.search.name : `${home.search.name} ${t(home.mode)}`;
	element("search").elements.q.placeholder = t("searchEngine", { engine });
	for (const button of element("searchModes").children) {
		button.textContent = t(button.dataset.mode);
		button.setAttribute("aria-selected", String(button.dataset.mode === home.mode));
	}

}

function render(data, isFirst) {

	home.data = data;
	const { settings } = data;
	const custom = settings.home;
	const backdrop = element("backdrop");

	applyMogTheme(settings.theme);
	applyMogLanguage(settings.chinaMode);
	home.search = data.search;
	if (isFirst) home.mode = settings.searchMode;

	element("homeTitle").textContent = custom.title;
	element("homeTagline").textContent = custom.tagline;
	element("homeTagline").hidden = !custom.tagline;
	element("stats").hidden = !custom.showStats;
	element("clock").hidden = !custom.showClock;
	backdrop.classList.toggle("has-image", Boolean(custom.background));
	backdrop.style.setProperty("--image", custom.background ? `url("mog://newtab/background?${encodeURIComponent(custom.background)}")` : "none");
	backdrop.style.setProperty("--dim", custom.dim / 100);

	element("dim").value = custom.dim;
	element("removeBackground").hidden = !custom.background;
	element("chinaMode").checked = settings.chinaMode;
	for (const input of document.querySelectorAll("[data-home]")) input.checked = custom[input.dataset.home];
	element("themes").replaceChildren(...themePresets.map(preset => {
		const swatch = themeSwatch(preset, () => save({ theme: preset.theme }));
		swatch.setAttribute("aria-pressed", String(isThemeActive(preset, settings.theme)));
		return swatch;
	}));

	renderSites();
	renderStats();
	renderClock();
	renderModes();

}

async function save(patch) {

	const next = await window.mogHome.set(patch);
	if (next) render(next, false);

}

function bindEvents() {

	for (const mode of ["web", "images", "videos"]) {
		const button = el("button");
		button.type = "button";
		button.dataset.mode = mode;
		button.setAttribute("role", "tab");
		button.addEventListener("click", () => {
			home.mode = mode;
			renderModes();
			element("search").elements.q.focus();
		});
		element("searchModes").append(button);
	}

	element("search").addEventListener("submit", event => {
		event.preventDefault();
		const text = element("search").elements.q.value.trim();
		element("search").classList.remove("is-firing");
		void element("search").offsetWidth;
		element("search").classList.add("is-firing");
		if (text) location.href = home.search[home.mode].replace("%s", encodeURIComponent(text));
	});

	const setCustomizing = isOpen => {
		element("customize").classList.toggle("is-open", isOpen);
		element("customize").inert = !isOpen;
		document.body.classList.toggle("is-customizing", isOpen);
	};
	element("customize").hidden = false;
	setCustomizing(false);
	element("openCustomize").addEventListener("click", () => setCustomizing(!element("customize").classList.contains("is-open")));
	element("closeCustomize").addEventListener("click", () => setCustomizing(false));
	document.addEventListener("keydown", event => {
		if (event.key === "Escape") setCustomizing(false);
	});

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
	for (const input of document.querySelectorAll("[data-home]")) {
		input.addEventListener("change", () => save({ home: { [input.dataset.home]: input.checked } }));
	}
	element("chinaMode").addEventListener("change", event => save({ chinaMode: event.target.checked }));

}

async function init() {

	bindEvents();
	const data = await window.mogHome?.data().catch(() => null);
	if (!data) return;
	render(data, true);
	setInterval(renderClock, 1000);

}

init();
