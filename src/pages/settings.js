const element = id => document.getElementById(id);
let current = null;
let colorTimer = 0;

function el(tag, className, text) {

	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;

}

async function save(patch) {

	const next = await window.mogSettings.set(patch);
	if (next) render({ ...current, ...next });

}

function renderPresets() {

	const theme = current.settings.theme;
	element("presets").replaceChildren(...themePresets.map(preset => {
		const button = el("button");
		const swatch = el("i");
		const isCurrent = isThemeActive(preset, theme);
		button.type = "button";
		button.style.background = preset.theme.background;
		button.style.color = preset.theme.text;
		button.setAttribute("aria-pressed", String(isCurrent));
		for (const key of ["accent", "hot", "text"]) {
			const part = el("b");
			part.style.background = preset.theme[key];
			swatch.append(part);
		}
		button.append(el("span", "", preset.name), swatch);
		button.addEventListener("click", () => save({ theme: preset.theme }));
		return button;
	}));

}

function renderRows(container, items, makeExtra) {

	container.replaceChildren(...items.map(item => {
		const row = el("li");
		const link = el("a", "", item.title || item.url);
		link.href = item.url;
		link.title = item.url;
		row.append(link, ...makeExtra(item));
		return row;
	}));

}

function render(data) {

	current = data;
	const settings = data.settings;
	applyMogTheme(settings.theme);
	renderPresets();

	for (const input of document.querySelectorAll("[data-theme]")) input.value = settings.theme[input.dataset.theme];
	for (const input of document.querySelectorAll("[data-home]")) {
		const value = settings.home[input.dataset.home];
		if (input.type === "checkbox") input.checked = value;
		else if (document.activeElement !== input) input.value = value;
	}
	element("removeBackground").hidden = !settings.home.background;
	element("version").textContent = `Mog Browser ${data.version}`;
	applyMogLanguage(false);
	const engine = element("searchEngine");
	if (!engine.options.length) for (const item of data.engines) engine.add(new Option(item.name, item.id));
	for (const input of document.querySelectorAll("[data-key]")) {
		if (input.type === "checkbox") input.checked = settings[input.dataset.key];
		else input.value = settings[input.dataset.key];
	}

	renderRows(element("bookmarkList"), data.bookmarks, item => {
		if (item.isBuiltIn) return [el("span", "", "Built in")];
		const remove = el("button", "", "Remove");
		remove.type = "button";
		remove.addEventListener("click", async () => render({ ...current, ...(await window.mogSettings.action("remove-bookmark", item.url)) }));
		return [remove];
	});
	renderRows(element("historyList"), data.history, item => [el("span", "", new Date(item.time).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }))]);
	element("historyEmpty").hidden = data.history.length > 0;
	element("clearHistory").hidden = data.history.length === 0;

}

function bindEvents() {

	for (const input of document.querySelectorAll("[data-theme]")) {
		input.addEventListener("input", () => {
			current.settings.theme[input.dataset.theme] = input.value;
			applyMogTheme(current.settings.theme);
			clearTimeout(colorTimer);
			colorTimer = setTimeout(() => save({ theme: { [input.dataset.theme]: input.value } }), 150);
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
		if (file) render({ ...current, ...(await window.mogSettings.background(await file.arrayBuffer(), file.type)) });
	});
	element("removeBackground").addEventListener("click", async () => render({ ...current, ...(await window.mogSettings.background(null, "")) }));

	element("clearData").addEventListener("click", async () => {
		await window.mogSettings.action("clear-data");
		element("status").textContent = "Cookies, cache, site storage and history are gone.";
		render({ ...current, history: [] });
	});
	element("reset").addEventListener("click", async () => {
		render({ ...current, ...(await window.mogSettings.action("reset")) });
		element("status").textContent = "Settings are back to normie.";
	});
	element("clearHistory").addEventListener("click", async () => {
		await window.mogSettings.action("clear-history");
		render({ ...current, history: [] });
	});

}

async function init() {

	bindEvents();
	render(await window.mogSettings.get());

}

init();
