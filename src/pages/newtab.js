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
	shownTotal: 0,
	countFrame: 0,
	isEditing: false,
	notesTimer: 0,
};

function el(tag, className, text) {

	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;

}

function icon(name) {

	const holder = document.createElement("div");
	holder.innerHTML = `<svg><use href="#i-${name}"/></svg>`;
	return holder.firstChild;

}

function hostOf(url) {

	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return "";
	}

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

function saveSites(sites) {
	return save({ home: { sites } });
}

function renderSites() {

	const { settings } = home.data;
	const sites = currentSites();
	const section = element("sitesSection");
	section.hidden = !settings.home.showSites;
	section.classList.toggle("is-editing", home.isEditing);
	element("editSites").lastElementChild.textContent = t(home.isEditing ? "done" : "editSites");

	const tiles = sites.map((site, index) => {
		const link = el("a", "tile");
		const image = el("img");
		const remove = el("button", "tile-remove");
		const host = hostOf(site.url);
		const fallback = () => image.isConnected && image.replaceWith(el("i", "", [...site.title][0].toUpperCase()));

		link.href = site.url;
		link.title = host;
		link.style.setProperty("--i", index);
		image.alt = "";
		image.src = `https://${host}/favicon.ico`;
		image.addEventListener("error", fallback, { once: true });
		image.addEventListener("load", () => {
			if (image.naturalWidth < 8) fallback();
		}, { once: true });
		setTimeout(() => {
			if (!image.complete || !image.naturalWidth) fallback();
		}, 2500);

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
			if (home.isEditing) event.preventDefault();
		});
		link.append(image, el("span", "", site.title), remove);
		return link;
	});

	if (sites.length < 24) {
		const add = el("button", "tile is-add");
		add.type = "button";
		add.style.setProperty("--i", sites.length);
		add.append(icon("plus"), el("span", "", t("addSite")));
		add.addEventListener("click", () => setAdding(true));
		tiles.push(add);
	}
	element("sites").replaceChildren(...tiles);

}

function setAdding(isOpen) {

	const form = element("addSite");
	form.classList.toggle("is-open", isOpen);
	form.inert = !isOpen;
	if (isOpen) element("siteName").focus();
	else form.reset();

}

function renderTier(total) {

	const index = tiers.findLastIndex(([minimum]) => total >= minimum);
	const [floor, name] = tiers[index];
	const next = tiers[index + 1];
	element("tier").textContent = name;
	element("tierNext").textContent = next ? `${t("rating")} · ${(next[0] - total).toLocaleString()} → ${next[1]}` : t("rating");
	element("tierBar").style.transform = `scaleX(${next ? (total - floor) / (next[0] - floor) : 1})`;

}

// Counts up to the live total instead of jumping.
function showTotal(total) {

	renderTier(total);
	if (total === home.shownTotal) return;
	const blocked = element("blocked");
	const from = home.shownTotal;
	const started = performance.now();
	const duration = Math.min(900, 200 + Math.abs(total - from) * 30);
	cancelAnimationFrame(home.countFrame);
	blocked.classList.remove("is-bumped");
	void blocked.offsetWidth;
	blocked.classList.add("is-bumped");

	const step = now => {
		const progress = Math.min(1, (now - started) / duration);
		const value = Math.round(from + (total - from) * (1 - (1 - progress) ** 3));
		home.shownTotal = value;
		blocked.textContent = value.toLocaleString();
		if (progress < 1) home.countFrame = requestAnimationFrame(step);
	};
	home.countFrame = requestAnimationFrame(step);

}

function renderClock() {

	const now = new Date();
	const locale = home.data?.settings.chinaMode ? "zh-CN" : [];
	const time = now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
	const clock = element("time");
	if (clock.dataset.value !== time) {
		const previous = clock.dataset.value ?? "";
		clock.dataset.value = time;
		clock.replaceChildren(...[...time].map((character, index) => el("span", previous && previous[index] !== character ? "digit is-rolling" : "digit", character)));
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

	applyMogTheme(settings.theme, settings.flag);
	applyMogLanguage(settings.chinaMode);
	home.search = data.search;
	if (isFirst) home.mode = settings.searchMode;

	element("homeTitle").textContent = custom.title;
	element("homeTagline").textContent = custom.tagline;
	element("homeTagline").hidden = !custom.tagline;
	element("stats").hidden = !custom.showStats;
	element("clock").hidden = !custom.showClock;
	element("notes").hidden = !custom.showNotes;
	if (document.activeElement !== element("notesText")) element("notesText").value = custom.notes;
	backdrop.classList.toggle("has-image", Boolean(custom.background));
	backdrop.style.setProperty("--image", custom.background ? `url("mog://newtab/background?${encodeURIComponent(custom.background)}")` : "none");
	backdrop.style.setProperty("--dim", custom.dim / 100);

	element("dim").value = custom.dim;
	element("removeBackground").hidden = !custom.background;
	element("resetSites").hidden = !custom.sites.length;
	element("chinaMode").checked = settings.chinaMode;
	for (const input of document.querySelectorAll("[data-home]")) input.checked = custom[input.dataset.home];
	for (const [id, list] of [["themes", themePresets], ["countries", countryThemes]]) {
		element(id).replaceChildren(...list.map(preset => {
			const swatch = themeSwatch(preset, () => save(themePatch(preset)));
			swatch.setAttribute("aria-pressed", String(isThemeActive(preset, settings.theme, settings.flag)));
			return swatch;
		}));
	}

	renderSites();
	showTotal(data.blockedTotal);
	renderClock();
	renderModes();

}

async function save(patch) {

	const next = await window.mogHome.set(patch);
	if (next) render(next, false);

}

function setCustomizing(isOpen) {

	element("customize").classList.toggle("is-open", isOpen);
	element("customize").inert = !isOpen;
	document.body.classList.toggle("is-customizing", isOpen);

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
		const form = element("search");
		const text = form.elements.q.value.trim();
		form.classList.remove("is-firing");
		void form.offsetWidth;
		form.classList.add("is-firing");
		if (text) location.href = home.search[home.mode].replace("%s", encodeURIComponent(text));
	});

	element("openCustomize").addEventListener("click", () => setCustomizing(!element("customize").classList.contains("is-open")));
	element("closeCustomize").addEventListener("click", () => setCustomizing(false));
	element("scrim").addEventListener("click", () => setCustomizing(false));
	document.addEventListener("keydown", event => {
		if (event.key !== "Escape") return;
		setCustomizing(false);
		setAdding(false);
	});

	element("editSites").addEventListener("click", () => {
		home.isEditing = !home.isEditing;
		if (!home.isEditing) setAdding(false);
		renderSites();
	});
	element("cancelSite").addEventListener("click", () => setAdding(false));
	element("addSite").addEventListener("submit", event => {
		event.preventDefault();
		const title = element("siteName").value.trim();
		let url = element("siteUrl").value.trim();
		if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
		if (!title || !hostOf(url).includes(".")) return element("siteUrl").focus();
		setAdding(false);
		saveSites([...currentSites(), { title, url }]);
	});
	element("resetSites").addEventListener("click", () => saveSites([]));

	element("notesText").addEventListener("input", event => {
		clearTimeout(home.notesTimer);
		const notes = event.target.value;
		home.notesTimer = setTimeout(() => window.mogHome.set({ home: { notes } }), 400);
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
	setInterval(async () => {
		if (document.hidden) return;
		const stats = await window.mogHome.stats().catch(() => null);
		if (stats) showTotal(stats.blockedTotal);
	}, 1500);

}

init();
