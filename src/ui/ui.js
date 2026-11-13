const element = id => document.getElementById(id);

const panelButtons = { shieldPanel: "shields", menuPanel: "menu", boosterPanel: "booster" };
const searchPrefixes = { web: "web", w: "web", image: "images", images: "images", img: "images", i: "images", video: "videos", videos: "videos", vid: "videos", v: "videos" };
const lockMinutes = 25;

const state = {
	tabs: [],
	active: null,
	closed: [],
	stash: null,
	settings: { shields: true, blockCookies: true, stripParams: true, shieldsOff: [], searchMode: "web", chinaMode: false, flag: "" },
	update: { status: "idle", version: "", percent: 0 },
	regionTimer: 0,
	smash: null,
	smashTimer: 0,
	search: { name: "Google", web: "https://www.google.com/search?q=%s", images: "https://www.google.com/search?q=%s&udm=2", videos: "https://www.google.com/search?q=%s&udm=7" },
	mode: "web",
	isLoaded: false,
	bookmarks: [],
	blockedTotal: 0,
	homeUrl: "mog://newtab/",
	blocked: new Map(),
	badges: new Map(),
	boosterView: null,
	tabCounter: 0,
	typed: "",
	suggestions: [],
	suggestionIndex: -1,
	suggestTimer: 0,
	toastTimer: 0,
	gliderFrame: 0,
	gliderUntil: 0,
	downloadTimer: 0,
	lockTimer: 0,
	lockEndsAt: 0,
};

function el(tag, className, text) {

	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;

}

function hostOf(url) {

	try {
		return new URL(url).hostname;
	} catch {
		return "";
	}

}

function setOpen(node, isOpen) {

	node.classList.toggle("is-open", isOpen);
	node.inert = !isOpen;

}

const isOpen = node => node.classList.contains("is-open");

function searchUrl(text, mode = state.mode) {
	return (state.search[mode] ?? state.search.web).replace("%s", encodeURIComponent(text));
}

function toAddress(text) {

	const value = text.trim();
	if (!value) return null;
	if (/^(https?|mog):\/\//i.test(value)) return { url: value, isUpgraded: false };

	const prefixed = /^([a-z]+):\s*(\S.*)$/i.exec(value);
	const prefixMode = prefixed && searchPrefixes[prefixed[1].toLowerCase()];
	if (prefixMode) return { url: searchUrl(prefixed[2], prefixMode), isUpgraded: false };
	if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^[^\s/:]+:\d+/.test(value)) return { url: searchUrl(value), isUpgraded: false };

	const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(value);
	if (isLocal) return { url: `http://${value}`, isUpgraded: false };
	if (!/\s/.test(value) && /^[^\s/]+\.[^\s/.]{2,}(:\d+)?(\/.*)?$/.test(value)) return { url: `https://${value}`, isUpgraded: true };
	return { url: searchUrl(value), isUpgraded: false };

}

function toast(message) {

	const box = element("toast");
	box.textContent = message;
	box.classList.add("is-open");
	clearTimeout(state.toastTimer);
	state.toastTimer = setTimeout(() => box.classList.remove("is-open"), 3500);

}

function syncTips() {

	for (const node of document.querySelectorAll("[title]")) {
		node.dataset.tip = node.title;
		if (!node.getAttribute("aria-label")) node.setAttribute("aria-label", node.title);
		node.removeAttribute("title");
	}

}

function bindTips() {

	const tip = element("tip");
	let timer = 0;
	let current = null;
	const hide = () => {
		clearTimeout(timer);
		current = null;
		tip.classList.remove("is-open");
	};

	document.addEventListener("pointerover", event => {
		const target = event.target.closest?.("[data-tip]");
		if (target === current) return;
		hide();
		if (!target?.dataset.tip) return;
		current = target;
		timer = setTimeout(() => {
			const bounds = target.getBoundingClientRect();
			tip.textContent = target.dataset.tip;
			tip.style.left = `${Math.max(70, Math.min(window.innerWidth - 70, bounds.left + bounds.width / 2))}px`;
			tip.style.top = `${bounds.bottom + 7}px`;
			tip.classList.add("is-open");
		}, 450);
	});
	document.addEventListener("pointerdown", hide, true);
	document.addEventListener("keydown", hide, true);
	document.documentElement.addEventListener("pointerleave", hide);
	window.addEventListener("blur", hide);

}

function report() {

	window.mog.send("ui:tabs", state.tabs.filter(tab => tab.id).map(tab => ({
		id: tab.id,
		url: tab.url,
		title: tab.title,
		favIconUrl: tab.favicon,
		isActive: tab === state.active,
		isPrivate: tab.isPrivate,
	})));

}

function refreshDragRegions() {

	clearTimeout(state.regionTimer);
	state.regionTimer = setTimeout(() => {
		const spacer = document.querySelector(".drag");
		const strip = document.querySelector(".strip");
		strip.style.webkitAppRegion = "no-drag";
		spacer.style.webkitAppRegion = "no-drag";
		void spacer.offsetWidth;
		requestAnimationFrame(() => {
			strip.style.webkitAppRegion = "";
			spacer.style.webkitAppRegion = "";
		});
	}, 320);

}

function renderUpdate() {

	const chip = element("update");
	const { status, version, percent } = state.update;
	const isShown = status === "downloading" || status === "ready";
	chip.classList.toggle("is-open", isShown);
	chip.classList.toggle("is-ready", status === "ready");
	chip.inert = !isShown;
	element("updateText").textContent = status === "ready" ? `Restart to update` : `Updating ${percent}%`;
	element("updateBar").style.transform = `scaleX(${status === "ready" ? 1 : percent / 100})`;
	chip.dataset.tip = status === "ready" ? `Mog Browser ${version} is downloaded. Click to restart and install it.` : `Downloading Mog Browser ${version}`;

}

function loadSmash() {

	if (state.smash) return state.smash;
	let saved = {};
	try {
		saved = JSON.parse(localStorage.getItem("mog-smash") ?? "{}");
	} catch {
		saved = {};
	}
	state.smash = { score: Number(saved.score) || 0, force: Math.max(1, Number(saved.force) || 1), auto: Number(saved.auto) || 0, best: Number(saved.best) || 0 };
	return state.smash;

}

function createSmashGame() {

	const game = loadSmash();
	const box = el("div", "smash");
	const score = el("strong", "smash-score", "0");
	const target = el("button", "smash-target");
	const force = el("button", "smash-buy");
	const auto = el("button", "smash-buy");
	const best = el("p", "smash-best");
	const forceCost = () => 25 * 2 ** (game.force - 1);
	const autoCost = () => 60 * 2 ** game.auto;

	const render = () => {
		score.textContent = Math.floor(game.score).toLocaleString();
		force.textContent = `Heavier hammer · +${game.force + 1} per hit · ${forceCost().toLocaleString()}`;
		auto.textContent = `Auto-smasher · +${game.auto + 1} per second · ${autoCost().toLocaleString()}`;
		force.disabled = game.score < forceCost();
		auto.disabled = game.score < autoCost();
		best.textContent = `Best: ${Math.floor(game.best).toLocaleString()}`;
		target.dataset.stage = String(Math.floor(game.score / 5) % 4);
	};
	const save = () => {
		game.best = Math.max(game.best, game.score);
		try {
			localStorage.setItem("mog-smash", JSON.stringify(game));
		} catch {
			return;
		}
	};
	const gain = (amount, event) => {
		game.score += amount;
		save();
		render();
		if (!event) return;
		const bounds = target.getBoundingClientRect();
		const pop = el("span", "smash-pop", `+${amount}`);
		pop.style.left = `${(event.clientX || bounds.left + bounds.width / 2) - bounds.left}px`;
		pop.style.top = `${(event.clientY || bounds.top + 20) - bounds.top}px`;
		target.append(pop);
		pop.addEventListener("animationend", () => pop.remove());
	};

	target.type = "button";
	target.setAttribute("aria-label", "Smash the bone");
	target.innerHTML = '<svg class="smash-bone"><use href="#i-bone"/></svg><svg class="smash-hammer"><use href="#i-hammer"/></svg>';
	target.addEventListener("click", event => {
		gain(game.force, event);
		target.classList.remove("is-hit");
		void target.offsetWidth;
		target.classList.add("is-hit");
	});
	force.type = "button";
	auto.type = "button";
	force.addEventListener("click", () => {
		if (game.score < forceCost()) return;
		game.score -= forceCost();
		game.force++;
		save();
		render();
	});
	auto.addEventListener("click", () => {
		if (game.score < autoCost()) return;
		game.score -= autoCost();
		game.auto++;
		save();
		render();
	});

	const shop = el("div", "smash-shop");
	const count = el("p", "smash-count");
	count.append(score, el("span", "", "bones smashed"));
	shop.append(force, auto);
	box.append(el("p", "smash-title", "Bonesmash clicker"), count, target, shop, best);
	box.tick = () => {
		if (game.auto && box.isConnected && !box.closest("[hidden]")) gain(game.auto);
	};
	render();
	return box;

}

function moveGlider() {

	const glider = element("tabGlider");
	const tab = state.active;
	if (!tab) return;
	const row = element("tabs").getBoundingClientRect();
	const bounds = tab.button.getBoundingClientRect();
	glider.style.width = `${bounds.width}px`;
	glider.style.transform = `translateX(${bounds.left - row.left}px)`;
	glider.classList.toggle("is-private", tab.isPrivate);

}

function followGlider(milliseconds = 320) {

	state.gliderUntil = performance.now() + milliseconds;
	if (state.gliderFrame) return;
	const step = () => {
		moveGlider();
		state.gliderFrame = performance.now() < state.gliderUntil ? requestAnimationFrame(step) : 0;
	};
	state.gliderFrame = requestAnimationFrame(step);

}

function renderTab(tab) {

	const title = tab.title || t("newTab");
	tab.button.setAttribute("aria-selected", String(tab === state.active));
	tab.titleNode.textContent = title;
	tab.titleNode.dataset.private = t("private");
	tab.button.dataset.tip = title;
	tab.soundNode.hidden = !tab.isAudible && !tab.isMuted;
	tab.soundNode.classList.toggle("is-muted", tab.isMuted);
	tab.soundNode.dataset.tip = tab.isMuted ? "Unmute tab" : "Mute tab";
	if (tab.favicon) tab.iconNode.src = tab.favicon;
	else tab.iconNode.removeAttribute("src");

}

function renderProgress() {

	const bar = element("progress");
	const tab = state.active;
	const key = String(tab?.key ?? "");
	const isSameTab = bar.dataset.key === key;
	bar.dataset.key = key;

	if (tab?.isLoading) {
		if (isSameTab && bar.classList.contains("is-loading")) return;
		bar.className = "progress";
		void bar.offsetWidth;
		bar.classList.add("is-loading");
	} else if (bar.classList.contains("is-loading")) {
		bar.className = isSameTab ? "progress is-done" : "progress";
	}

}

function renderToolbar() {

	const tab = state.active;
	if (!tab) return;

	const url = tab.url;
	const input = element("url");
	const secure = element("secure");
	const isInternal = url.startsWith("mog:");
	if (document.activeElement !== input) input.value = url === state.homeUrl ? "" : url;

	secure.textContent = isInternal ? "MOG" : url.startsWith("https:") ? t("secure") : t("notSecure");
	secure.className = `secure ${isInternal || url.startsWith("https:") ? "is-safe" : "is-unsafe"}`;
	element("back").disabled = !tab.isReady || !tab.view.canGoBack();
	element("forward").disabled = !tab.isReady || !tab.view.canGoForward();
	element("reload").classList.toggle("is-loading", tab.isLoading);
	renderProgress();

	const isSaved = state.bookmarks.some(item => item.url === url);
	element("star").classList.toggle("is-on", isSaved);
	element("star").hidden = isInternal;
	element("mode").textContent = t(state.mode);
	input.placeholder = t("searchHint", { engine: state.mode === "web" ? state.search.name : `${state.search.name} ${t(state.mode)}` });

	const host = hostOf(url);
	const isShielded = state.settings.shields && !state.settings.shieldsOff.includes(host);
	const count = state.blocked.get(tab.id) ?? 0;
	const countNode = element("shieldCount");
	const countText = isShielded ? (count > 999 ? "999+" : String(count)) : "off";
	if (countNode.textContent !== countText) {
		countNode.textContent = countText;
		countNode.classList.remove("is-ticking");
		void countNode.offsetWidth;
		countNode.classList.add("is-ticking");
	}
	element("shields").classList.toggle("is-off", !isShielded || isInternal);
	element("panelCount").textContent = count;
	element("panelTotal").textContent = `${state.blockedTotal.toLocaleString()} mogged in total.`;
	element("siteLabel").textContent = host && !isInternal ? `Shields on ${host}` : "Shields on this site";
	element("siteShield").checked = isShielded;
	element("siteShield").disabled = !host || isInternal || !state.settings.shields;
	element("optShields").checked = state.settings.shields;
	element("optCookies").checked = state.settings.blockCookies;
	element("optParams").checked = state.settings.stripParams;

	const badge = state.badges.get(tab.id);
	const badgeNode = element("boosterBadge");
	badgeNode.hidden = !badge?.text;
	badgeNode.textContent = badge?.text ?? "";
	badgeNode.classList.toggle("is-hot", /d21f2b/i.test(badge?.color ?? ""));
	document.title = tab.title ? `${tab.title} - Mog Browser` : "Mog Browser";

}

function renderBookmarks() {

	element("bookmarks").replaceChildren(...state.bookmarks.map(item => {
		const button = el("button", item.isBuiltIn ? "is-built-in" : "");
		button.type = "button";
		button.dataset.tip = item.url;
		button.append(el("span", "", item.title));
		button.addEventListener("click", event => {
			if (event.ctrlKey) createTab({ url: item.url, isBackground: true });
			else go(item.url);
		});
		button.addEventListener("auxclick", event => {
			if (event.button === 1) createTab({ url: item.url, isBackground: true });
		});
		return button;
	}));

}

function showFailure(tab, code, description, url) {

	clearFailure(tab);
	const box = el("div", "failure");
	const retry = el("button", "", "Try again");
	retry.type = "button";
	retry.addEventListener("click", () => {
		clearFailure(tab);
		tab.view.loadURL(url);
	});
	const game = createSmashGame();
	box.append(el("h1", "", "It's over"), el("p", "", `${hostOf(url) || "This page"} couldn't be reached.`), el("p", "", `${description || "Unknown error"} (${code})`), retry, game);
	clearInterval(state.smashTimer);
	state.smashTimer = setInterval(() => {
		for (const node of document.querySelectorAll(".smash")) node.tick();
	}, 1000);
	box.hidden = tab !== state.active;
	tab.failure = box;
	element("views").append(box);

}

function clearFailure(tab) {

	tab.failure?.remove();
	tab.failure = null;

}

function activate(tab) {

	const isSwitch = state.active !== tab;
	state.active = tab;
	for (const item of state.tabs) {
		item.view.classList.toggle("is-active", item === tab);
		if (item.failure) item.failure.hidden = item !== tab;
		renderTab(item);
	}
	if (isSwitch) {
		document.querySelector(".brand").animate([{ transform: "rotate(0)" }, { transform: "rotate(360deg)" }], { duration: 620, easing: "cubic-bezier(.16, 1, .3, 1)" });
		tab.view.classList.remove("is-entering");
		void tab.view.offsetWidth;
		tab.view.classList.add("is-entering");
		closePanels();
		closeFind();
	}
	renderToolbar();
	report();
	tab.button.scrollIntoView({ block: "nearest", inline: "nearest" });
	followGlider();

}

function startDrag(tab, event) {

	if (event.button !== 0 || event.target.closest(".tab-close, .tab-sound")) return;
	activate(tab);

	const row = element("tabs");
	const from = state.tabs.indexOf(tab);
	const lefts = state.tabs.map(item => item.button.offsetLeft);
	const width = tab.button.offsetWidth;
	const startX = event.clientX;
	let isDragging = false;
	let target = from;

	const move = moveEvent => {
		const distance = moveEvent.clientX - startX;
		if (!isDragging && Math.abs(distance) < 6) return;
		if (!isDragging) {
			isDragging = true;
			row.classList.add("is-sorting");
			tab.button.classList.add("is-dragging");
			tab.button.setPointerCapture(moveEvent.pointerId);
		}

		const offset = Math.max(-lefts[from], Math.min(lefts.at(-1) - lefts[from], distance));
		const center = lefts[from] + offset + width / 2;
		tab.button.style.transform = `translateX(${offset}px)`;
		target = from;
		for (const [index, other] of state.tabs.entries()) {
			if (other === tab) continue;
			const middle = lefts[index] + other.button.offsetWidth / 2;
			let shift = 0;
			if (index > from && center > middle) {
				shift = -width;
				target = Math.max(target, index);
			} else if (index < from && center < middle) {
				shift = width;
				target = Math.min(target, index);
			}
			other.button.style.transform = shift ? `translateX(${shift}px)` : "";
		}
		moveGlider();
	};

	const finish = () => {
		tab.button.removeEventListener("pointermove", move);
		tab.button.removeEventListener("pointerup", finish);
		tab.button.removeEventListener("pointercancel", finish);
		if (!isDragging) return;

		tab.button.classList.add("is-settling");
		tab.button.style.transform = `translateX(${lefts[target] - lefts[from]}px)`;
		followGlider(220);
		setTimeout(() => {
			row.classList.add("is-frozen");
			state.tabs.splice(from, 1);
			state.tabs.splice(target, 0, tab);
			for (const item of state.tabs) {
				item.button.style.transform = "";
				row.insertBefore(item.button, element("tabGlider"));
			}
			tab.button.classList.remove("is-dragging", "is-settling");
			moveGlider();
			void row.offsetWidth;
			row.classList.remove("is-sorting", "is-frozen");
			report();
		}, 190);
	};

	tab.button.addEventListener("pointermove", move);
	tab.button.addEventListener("pointerup", finish);
	tab.button.addEventListener("pointercancel", finish);

}

function createTab({ url, isPrivate = false, isBackground = false, openerId } = {}) {

	const opener = state.tabs.find(item => item.id && item.id === openerId);
	const tab = {
		id: 0,
		key: ++state.tabCounter,
		url: url || state.homeUrl,
		title: "",
		favicon: "",
		isPrivate: isPrivate || Boolean(opener?.isPrivate),
		isLoading: true,
		isReady: false,
		isAudible: false,
		isMuted: false,
		isUpgraded: false,
		zoom: 0,
		failure: null,
		view: document.createElement("webview"),
		button: el("div", "tab is-opening"),
		iconNode: el("img"),
		titleNode: el("span", "tab-title"),
		soundNode: el("button", "tab-sound", "♪"),
	};
	const close = el("button", "tab-close");
	const view = tab.view;

	close.type = "button";
	close.innerHTML = '<svg><use href="#i-stop"/></svg>';
	close.setAttribute("aria-label", "Close tab");
	tab.iconNode.alt = "";
	tab.soundNode.type = "button";
	tab.button.setAttribute("role", "tab");
	tab.button.tabIndex = 0;
	tab.button.classList.toggle("is-private", tab.isPrivate);
	tab.button.append(tab.iconNode, tab.titleNode, tab.soundNode, close);
	tab.button.addEventListener("animationend", () => tab.button.classList.remove("is-opening"), { once: true });
	tab.button.addEventListener("pointerdown", event => startDrag(tab, event));
	tab.button.addEventListener("auxclick", event => {
		if (event.button === 1) closeTab(tab);
	});
	tab.button.addEventListener("keydown", event => {
		if (event.key === "Enter" || event.key === " ") activate(tab);
	});
	tab.button.addEventListener("contextmenu", () => window.mog.send("ui:tab-menu", { key: tab.key, isMuted: tab.isMuted, hasOthers: state.tabs.length > 1 }));
	tab.soundNode.addEventListener("click", event => {
		event.stopPropagation();
		toggleMute(tab);
	});
	close.addEventListener("click", event => {
		event.stopPropagation();
		closeTab(tab);
	});

	view.setAttribute("partition", tab.isPrivate ? "mog-private" : "persist:mog");
	view.setAttribute("allowpopups", "");
	view.setAttribute("src", tab.url);

	const refresh = () => {
		renderTab(tab);
		if (tab === state.active) renderToolbar();
		report();
	};
	view.addEventListener("dom-ready", () => {
		if (!tab.isReady) {
			tab.isReady = true;
			tab.id = view.getWebContentsId();
		}
		applyZoom(tab);
		refresh();
	});
	view.addEventListener("did-start-loading", () => {
		tab.isLoading = true;
		refresh();
	});
	view.addEventListener("did-stop-loading", () => {
		tab.isLoading = false;
		if (tab.isReady) {
			tab.url = view.getURL() || tab.url;
			tab.title = view.getTitle() === tab.url ? hostOf(tab.url) : view.getTitle();
		}
		refresh();
		if (tab.id) window.mog.send("ui:tab-event", { type: "complete", id: tab.id });
	});
	const onNavigate = event => {
		if (event.isMainFrame === false) return;
		tab.url = event.url;
		if (!event.isInPlace && event.type === "did-navigate") {
			tab.favicon = "";
			clearFailure(tab);
		}
		applyZoom(tab);
		refresh();
	};
	view.addEventListener("did-navigate", onNavigate);
	view.addEventListener("did-navigate-in-page", onNavigate);
	view.addEventListener("page-title-updated", event => {
		tab.title = event.title;
		refresh();
	});
	view.addEventListener("page-favicon-updated", event => {
		tab.favicon = event.favicons.find(icon => /^(https?|data):/.test(icon)) ?? "";
		refresh();
	});
	view.addEventListener("did-fail-load", event => {
		if (!event.isMainFrame || event.errorCode === -3) return;
		if (tab.isUpgraded && event.validatedURL.startsWith("https://")) {
			tab.isUpgraded = false;
			view.loadURL(event.validatedURL.replace(/^https:/, "http:"));
			return;
		}
		tab.url = event.validatedURL || tab.url;
		tab.title = "It's over";
		showFailure(tab, event.errorCode, event.errorDescription, tab.url);
		refresh();
	});
	view.addEventListener("media-started-playing", () => {
		tab.isAudible = true;
		renderTab(tab);
	});
	view.addEventListener("media-paused", () => {
		tab.isAudible = false;
		renderTab(tab);
	});
	view.addEventListener("enter-html-full-screen", () => window.mog.send("ui:fullscreen", true));
	view.addEventListener("leave-html-full-screen", () => window.mog.send("ui:fullscreen", false));
	view.addEventListener("close", () => closeTab(tab));
	view.addEventListener("focus", closePanels);
	view.addEventListener("found-in-page", event => {
		if (tab === state.active) element("findCount").textContent = `${event.result.activeMatchOrdinal}/${event.result.matches}`;
	});

	const index = opener ? state.tabs.indexOf(opener) + 1 : state.tabs.length;
	const next = state.tabs[index];
	state.tabs.splice(index, 0, tab);
	element("tabs").insertBefore(tab.button, next?.button ?? element("tabGlider"));
	element("views").append(view);

	refreshDragRegions();
	if (isBackground && state.active) {
		renderTab(tab);
		followGlider();
	} else {
		activate(tab);
		if (tab.url === state.homeUrl) element("url").focus();
	}
	return tab;

}

function closeTab(tab, isInstant = false) {

	const index = state.tabs.indexOf(tab);
	if (index < 0) return;

	if (!tab.isPrivate && !tab.url.startsWith("mog:")) state.closed.push(tab.url);
	state.tabs.splice(index, 1);
	state.blocked.delete(tab.id);
	state.badges.delete(tab.id);
	clearFailure(tab);
	tab.view.remove();
	if (tab.id) window.mog.send("ui:tab-event", { type: "removed", id: tab.id });

	// The tab gets mogged: a hammer comes down, the tab is flattened, then the gap closes.
	const button = tab.button;
	const bounds = button.getBoundingClientRect();
	const hammer = el("div", "hammer");
	const isReduced = isInstant || matchMedia("(prefers-reduced-motion: reduce)").matches;
	hammer.innerHTML = '<svg><use href="#i-hammer"/></svg><span>MOGGED</span>';
	hammer.style.left = `${bounds.left + bounds.width / 2}px`;
	if (!isReduced) document.body.append(hammer);
	button.style.maxWidth = `${bounds.width}px`;
	button.classList.add("is-smashed");
	setTimeout(() => {
		button.classList.add("is-closing");
		button.style.maxWidth = "0px";
		followGlider(300);
	}, isReduced ? 0 : 230);
	setTimeout(() => {
		button.remove();
		hammer.remove();
		refreshDragRegions();
	}, isReduced ? 30 : 470);

	if (!state.tabs.length) createTab();
	else if (state.active === tab) activate(state.tabs[Math.min(index, state.tabs.length - 1)]);
	else {
		report();
		followGlider();
	}

}

function go(text) {

	const target = toAddress(text);
	const tab = state.active;
	if (!target || !tab) return;

	clearFailure(tab);
	tab.isUpgraded = target.isUpgraded;
	tab.url = target.url;
	tab.view.loadURL(target.url).catch(() => {});
	tab.view.focus();
	renderToolbar();

}

function toggleMute(tab) {

	if (!tab.isReady) return;
	tab.isMuted = !tab.isMuted;
	tab.view.setAudioMuted(tab.isMuted);
	renderTab(tab);

}

function closeFind() {

	const bar = element("find");
	if (!isOpen(bar)) return;
	setOpen(bar, false);
	for (const tab of state.tabs) {
		if (tab.isReady) tab.view.stopFindInPage("clearSelection");
	}

}

function find(isForward, isNext) {

	const text = element("findText").value;
	const tab = state.active;
	if (!tab?.isReady) return;
	if (!text) {
		tab.view.stopFindInPage("clearSelection");
		element("findCount").textContent = "0/0";
		return;
	}
	tab.view.findInPage(text, { forward: isForward, findNext: isNext });

}

function siteHosts() {

	const hosts = [...(state.settings.chinaMode ? chinaSites : []), ...popularSites].map(([title, host]) => ({ title, host }));
	for (const item of state.bookmarks) hosts.push({ title: item.title, host: hostOf(item.url).replace(/^www\./, "") });
	return hosts;

}

function autofill(input, event) {

	const typed = input.value;
	state.typed = typed;
	if (!event.inputType?.startsWith("insert") || input.selectionStart !== typed.length || !/^[a-z0-9.-]{2,}$/i.test(typed)) return;

	const lower = typed.toLowerCase();
	const hosts = siteHosts();
	const match = hosts.find(item => item.host.startsWith(lower)) ?? hosts.find(item => item.title.toLowerCase().replace(/\s+/g, "").startsWith(lower));
	if (!match) return;
	if (match.host.startsWith(lower)) {
		input.value = typed + match.host.slice(typed.length);
		input.setSelectionRange(typed.length, input.value.length);
	} else {
		input.value = match.host;
		input.select();
	}

}

function hideSuggestions() {

	clearTimeout(state.suggestTimer);
	state.suggestions = [];
	state.suggestionIndex = -1;
	setOpen(element("suggestions"), false);

}

function selectSuggestion(index) {

	const list = element("suggestions");
	const rows = [...list.querySelectorAll("li")];
	const glider = list.querySelector(".suggest-glider");
	state.suggestionIndex = index;
	for (const [position, row] of rows.entries()) row.setAttribute("aria-selected", String(position === index));
	if (!glider) return;
	glider.classList.toggle("is-shown", index >= 0);
	if (index < 0) return;
	glider.style.height = `${rows[index].offsetHeight}px`;
	glider.style.transform = `translateY(${rows[index].offsetTop}px)`;

}

function renderSuggestions() {

	const list = element("suggestions");
	const wasOpen = isOpen(list);
	const glider = el("div", "suggest-glider");
	glider.setAttribute("aria-hidden", "true");
	list.replaceChildren(glider, ...state.suggestions.map((item, index) => {
		const row = el("li");
		row.setAttribute("role", "option");
		row.style.setProperty("--i", index);
		row.append(el("strong", "", item.title || item.url), el("span", "", item.url));
		row.addEventListener("pointerenter", () => selectSuggestion(index));
		row.addEventListener("pointerdown", event => {
			event.preventDefault();
			hideSuggestions();
			go(item.url);
		});
		return row;
	}));
	list.classList.toggle("is-fresh", !wasOpen);
	setOpen(list, state.suggestions.length > 0);
	selectSuggestion(-1);

}

function restoreSession(list) {

	const saved = Array.isArray(list) ? list.filter(item => typeof item?.url === "string") : [];
	if (!saved.length) return createTab();
	const opened = saved.map(item => createTab({ url: item.url, isBackground: true }));
	activate(opened[Math.max(0, saved.findIndex(item => item.isActive))]);

}

function closePanels() {

	for (const [panel, button] of Object.entries(panelButtons)) {
		setOpen(element(panel), false);
		element(button).setAttribute("aria-expanded", "false");
	}
	const view = state.boosterView;
	state.boosterView = null;
	if (view) setTimeout(() => view.remove(), 240);

}

function togglePanel(panel, button) {

	const node = element(panel);
	const wasOpen = isOpen(node);
	closePanels();
	if (wasOpen) return false;

	const trigger = element(button).getBoundingClientRect();
	const right = Math.max(8, Math.min(window.innerWidth - node.offsetWidth - 8, window.innerWidth - trigger.right));
	node.style.right = `${right}px`;
	node.style.setProperty("--origin-x", `${Math.max(0, Math.min(node.offsetWidth, trigger.left + trigger.width / 2 - (window.innerWidth - right - node.offsetWidth)))}px`);
	setOpen(node, true);
	element(button).setAttribute("aria-expanded", "true");
	return true;

}

function toggleBooster() {

	if (!togglePanel("boosterPanel", "booster")) return;
	const view = document.createElement("webview");
	view.setAttribute("partition", "persist:mog");
	view.setAttribute("src", "mog://booster/popup.html");
	view.addEventListener("close", closePanels);
	view.addEventListener("dom-ready", () => {
		view.setZoomLevel(Math.log(state.settings.uiZoom || 1) / Math.log(1.2));
		view.focus();
	});
	element("boosterPanel").replaceChildren(view);
	state.boosterView = view;

}

// Every page starts at the browser-wide size (Ctrl+scroll on the home page) and adds its own tab zoom on top.
function applyZoom(tab) {

	if (!tab.isReady) return;
	const base = Math.log(state.settings.uiZoom || 1) / Math.log(1.2);
	tab.view.setZoomLevel(base + (tab.url.startsWith("mog:") ? 0 : tab.zoom));

}

function setZoom(direction) {

	const tab = state.active;
	if (!tab?.isReady) return;
	if (tab.url.startsWith("mog:")) return window.mog.send("ui:zoom", direction);
	tab.zoom = direction === 0 ? 0 : Math.max(-4, Math.min(6, tab.zoom + direction * .5));
	applyZoom(tab);
	toast(`Zoom ${Math.round(1.2 ** tab.zoom * 100)}%`);

}

async function toggleBookmark() {

	const tab = state.active;
	if (!tab || tab.url.startsWith("mog:")) return;
	if (state.bookmarks.some(item => item.url === tab.url && item.isBuiltIn)) return toast("That site is built in.");

	const wasSaved = state.bookmarks.some(item => item.url === tab.url);
	applyState(await window.mog.invoke("ui:bookmark", { url: tab.url, title: tab.title }));
	if (wasSaved) return;
	const star = element("star");
	star.classList.remove("is-popping");
	void star.offsetWidth;
	star.classList.add("is-popping");

}

function applyState(next) {

	if (!next) return;
	if (state.settings.searchMode !== next.settings.searchMode || !state.isLoaded) state.mode = next.settings.searchMode;
	const previousZoom = state.isLoaded ? state.settings.uiZoom : next.settings.uiZoom;
	state.isLoaded = true;
	state.settings = next.settings;
	document.documentElement.style.setProperty("--controls", `${Math.ceil(144 / (next.settings.uiZoom || 1))}px`);
	for (const tab of state.tabs) applyZoom(tab);
	if (previousZoom !== next.settings.uiZoom) toast(`Browser size ${Math.round(next.settings.uiZoom * 100)}%. Ctrl+0 on the home page resets it.`);
	state.search = next.search;
	state.bookmarks = next.bookmarks;
	state.blockedTotal = next.blockedTotal;
	state.homeUrl = next.homeUrl;

	applyMogTheme(next.settings.theme, next.settings.flag);
	if (next.update) state.update = next.update;
	renderUpdate();
	applyMogLanguage(next.settings.chinaMode);
	syncTips();
	document.body.classList.toggle("is-compact", next.settings.isCompact);
	document.body.classList.toggle("hide-bookmarks", !next.settings.showBookmarks);
	element("version").textContent = `v${next.version}`;
	element("chinaMode").checked = next.settings.chinaMode;
	for (const [id, list] of [["menuThemes", themePresets], ["menuCountries", countryThemes]]) {
		element(id).replaceChildren(...list.map(preset => {
			const swatch = themeSwatch(preset, async () => applyState(await window.mog.invoke("ui:settings", themePatch(preset))));
			swatch.setAttribute("aria-pressed", String(isThemeActive(preset, next.settings.theme, next.settings.flag)));
			swatch.dataset.tip = preset.name;
			swatch.removeAttribute("title");
			return swatch;
		}));
	}
	refreshDragRegions();
	for (const tab of state.tabs) renderTab(tab);
	renderBookmarks();
	renderToolbar();
	followGlider(450);

}

function stepTab(direction) {

	const index = state.tabs.indexOf(state.active);
	activate(state.tabs[(index + direction + state.tabs.length) % state.tabs.length]);

}

function renderLockTimer() {

	const remaining = Math.max(0, Math.ceil((state.lockEndsAt - Date.now()) / 1000));
	element("lockTimer").textContent = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
	if (remaining > 0) return;
	setLockIn(false);
	toast("Lock In session done. Go mog a break.");

}

function setLockIn(isOn) {

	clearInterval(state.lockTimer);
	state.lockEndsAt = isOn ? Date.now() + lockMinutes * 60000 : 0;
	document.body.classList.toggle("is-locked-in", isOn);
	refreshDragRegions();
	element("lockIn").setAttribute("aria-pressed", String(isOn));
	closePanels();
	followGlider(480);
	if (!isOn) return;
	renderLockTimer();
	state.lockTimer = setInterval(renderLockTimer, 1000);

}

function showDownload({ name, received, total, status }) {

	const chip = element("download");
	clearTimeout(state.downloadTimer);
	element("downloadName").textContent = name;
	chip.dataset.tip = name;

	if (status === "progressing") {
		chip.classList.remove("is-done");
		chip.classList.toggle("is-unknown", !total);
		element("downloadBar").style.transform = `scaleX(${total ? Math.min(1, received / total) : 1})`;
		chip.classList.add("is-open");
		return;
	}
	if (status !== "completed") {
		chip.classList.remove("is-open");
		toast(`Download ${status}: ${name}`);
		return;
	}
	element("downloadBar").style.transform = "scaleX(1)";
	chip.classList.remove("is-unknown");
	chip.classList.add("is-open", "is-done");
	state.downloadTimer = setTimeout(() => chip.classList.remove("is-open"), 5000);

}

const actions = {
	"new-tab": () => createTab(),
	"new-private": () => createTab({ isPrivate: true }),
	"close-tab": () => state.active && closeTab(state.active),
	reopen: () => state.closed.length && createTab({ url: state.closed.pop() }),
	"focus-url": () => {
		closePanels();
		element("url").focus();
		element("url").select();
	},
	reload: () => {
		const tab = state.active;
		if (!tab?.isReady) return;
		clearFailure(tab);
		if (tab.isLoading) tab.view.stop();
		else tab.view.reload();
	},
	back: () => state.active?.isReady && state.active.view.canGoBack() && state.active.view.goBack(),
	forward: () => state.active?.isReady && state.active.view.canGoForward() && state.active.view.goForward(),
	home: () => go(state.homeUrl),
	bookmark: toggleBookmark,
	booster: toggleBooster,
	"booster-settings": () => createTab({ url: "mog://booster/options.html" }),
	settings: () => {
		const open = state.tabs.find(tab => tab.url.startsWith("mog://settings/"));
		if (open) activate(open);
		else createTab({ url: "mog://settings/" });
	},
	find: () => {
		closePanels();
		setOpen(element("find"), true);
		element("findText").focus();
		element("findText").select();
	},
	screenshot: () => state.active?.id && window.mog.send("ui:screenshot", state.active.id),
	"lock-in": () => setLockIn(!document.body.classList.contains("is-locked-in")),
	// Emergency button: every tab goes at once and one ordinary page takes their place.
	// Pressing it again brings those tabs back. They are only remembered until the browser closes.
	panic: () => {
		const others = [...state.tabs];
		const stash = state.stash;
		closePanels();
		closeFind();
		hideSuggestions();
		state.stash = null;
		if (stash) {
			const opened = stash.tabs.map(item => createTab({ url: item.url, isPrivate: item.isPrivate, isBackground: true }));
			if (state.tabs.includes(stash.cover)) {
				closeTab(stash.cover, true);
				stash.cover.button.remove();
			}
			state.closed.length = 0;
			activate(opened[Math.max(0, stash.tabs.findIndex(item => item.isActive))]);
			followGlider(60);
			return;
		}
		state.closed.length = 0;
		state.stash = { tabs: others.map(tab => ({ url: tab.url, isPrivate: tab.isPrivate, isActive: tab === state.active })), cover: null };
		state.stash.cover = createTab({ url: state.settings.panicUrl });
		for (const tab of others) {
			closeTab(tab, true);
			tab.button.remove();
		}
		state.closed.length = 0;
		followGlider(60);
	},
	"next-tab": () => stepTab(1),
	"previous-tab": () => stepTab(-1),
	"zoom-in": () => setZoom(1),
	"zoom-out": () => setZoom(-1),
	"zoom-reset": () => setZoom(0),
	devtools: () => state.active?.id && window.mog.send("ui:devtools", state.active.id),
	fullscreen: () => window.mog.send("ui:fullscreen", "toggle"),
	"fullscreen-on": () => document.body.classList.add("is-fullscreen"),
	"fullscreen-off": () => document.body.classList.remove("is-fullscreen"),
	escape: () => {
		closePanels();
		closeFind();
		hideSuggestions();
	},
	update: () => window.mog.invoke("ui:update"),
	"clear-data": async () => {
		await window.mog.invoke("ui:clear-data");
		toast("Browsing data cleared. Cookies, cache and site storage are gone.");
	},
};

function runAction(name) {

	const tabNumber = /^tab-(\d)$/.exec(name);
	if (tabNumber) {
		const tab = tabNumber[1] === "9" ? state.tabs.at(-1) : state.tabs[Number(tabNumber[1]) - 1];
		if (tab) activate(tab);
		return;
	}
	actions[name]?.();

}

function bindEvents() {

	element("newTab").addEventListener("click", () => createTab());
	element("back").addEventListener("click", actions.back);
	element("forward").addEventListener("click", actions.forward);
	element("reload").addEventListener("click", actions.reload);
	element("home").addEventListener("click", actions.home);
	element("star").addEventListener("click", toggleBookmark);
	element("shields").addEventListener("click", () => togglePanel("shieldPanel", "shields"));
	element("menu").addEventListener("click", () => togglePanel("menuPanel", "menu"));
	element("booster").addEventListener("click", toggleBooster);
	element("lockIn").addEventListener("click", actions["lock-in"]);
	element("reader").addEventListener("click", actions.panic);
	element("download").addEventListener("click", () => element("download").classList.remove("is-open"));

	element("urlForm").addEventListener("submit", event => {
		event.preventDefault();
		const halo = document.querySelector(".halo");
		halo.classList.remove("is-firing");
		void halo.offsetWidth;
		halo.classList.add("is-firing");
		hideSuggestions();
		go(element("url").value);
	});
	element("url").addEventListener("focus", event => event.target.select());
	element("url").addEventListener("blur", hideSuggestions);
	element("url").addEventListener("input", event => {
		clearTimeout(state.suggestTimer);
		autofill(event.target, event);
		const text = state.typed;
		state.suggestTimer = setTimeout(async () => {
			const found = await window.mog.invoke("ui:suggest", text).catch(() => []);
			const lower = text.trim().toLowerCase();
			for (const item of lower ? siteHosts() : []) {
				if (found.length >= 6) break;
				if (!item.host.includes(lower) && !item.title.toLowerCase().includes(lower)) continue;
				if (!found.some(other => hostOf(other.url).replace(/^www\./, "") === item.host)) found.push({ title: item.title, url: `https://${item.host}/` });
			}
			state.suggestions = found;
			if (document.activeElement === element("url")) renderSuggestions();
		}, 80);
	});
	element("url").addEventListener("keydown", event => {
		if (event.key === "Escape") {
			hideSuggestions();
			event.target.blur();
			renderToolbar();
		} else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && state.suggestions.length) {
			event.preventDefault();
			const count = state.suggestions.length;
			const step = event.key === "ArrowDown" ? 1 : -1;
			const next = state.suggestionIndex < 0 ? (step > 0 ? 0 : count - 1) : (state.suggestionIndex + step + count) % count;
			selectSuggestion(next);
			event.target.value = state.suggestions[next].url;
		}
	});
	element("mode").addEventListener("click", () => {
		const modes = ["web", "images", "videos"];
		state.mode = modes[(modes.indexOf(state.mode) + 1) % modes.length];
		renderToolbar();
		element("url").focus();
	});
	element("chinaMode").addEventListener("change", async event => {
		applyState(await window.mog.invoke("ui:settings", { chinaMode: event.target.checked }));
		toast(event.target.checked ? "中文模式已开启。新标签页生效。" : "China mode is off.");
	});

	element("find").addEventListener("submit", event => {
		event.preventDefault();
		find(true, true);
	});
	element("findText").addEventListener("input", () => find(true, false));
	element("findPrevious").addEventListener("click", () => find(false, true));
	element("findClose").addEventListener("click", closeFind);

	element("menuPanel").addEventListener("click", event => {
		const button = event.target.closest("button");
		if (!button?.dataset.action) return;
		closePanels();
		runAction(button.dataset.action);
	});

	element("siteShield").addEventListener("change", async event => {
		applyState(await window.mog.invoke("ui:shields", { host: hostOf(state.active.url), isOff: !event.target.checked }));
	});
	for (const [id, key] of [["optShields", "shields"], ["optCookies", "blockCookies"], ["optParams", "stripParams"]]) {
		element(id).addEventListener("change", async event => applyState(await window.mog.invoke("ui:settings", { [key]: event.target.checked })));
	}

	document.addEventListener("pointerdown", event => {
		if (!event.target.closest(".panel, .pill, #menu")) closePanels();
	});
	window.addEventListener("blur", () => {
		if (document.activeElement?.tagName !== "WEBVIEW") closePanels();
	});
	window.addEventListener("resize", moveGlider);
	new ResizeObserver(() => followGlider(120)).observe(element("tabs"));

	window.mog.on("ui:shortcut", runAction);
	window.mog.on("ui:open", data => createTab(data));
	window.mog.on("ui:activate", ({ id }) => {
		const tab = state.tabs.find(item => item.id === id);
		if (tab) activate(tab);
	});
	window.mog.on("ui:badge", data => {
		state.badges.set(data.tabId, { ...state.badges.get(data.tabId), ...data });
		if (state.active?.id === data.tabId) renderToolbar();
	});
	window.mog.on("ui:blocked", ({ counts, total }) => {
		for (const [id, count] of Object.entries(counts)) state.blocked.set(Number(id), count);
		state.blockedTotal = total;
		renderToolbar();
	});
	window.mog.on("ui:toast", toast);
	window.mog.on("ui:state", applyState);
	window.mog.on("ui:download", showDownload);
	window.mog.on("ui:update-state", next => {
		state.update = next;
		renderUpdate();
	});
	element("update").addEventListener("click", () => {
		if (state.update.status === "ready") window.mog.send("ui:update-install");
	});
	window.addEventListener("resize", refreshDragRegions);
	window.mog.on("ui:tab-action", ({ key, action }) => {
		const tab = state.tabs.find(item => item.key === key);
		if (!tab) return;
		if (action === "reload") tab.isReady && tab.view.reload();
		else if (action === "duplicate") createTab({ url: tab.url, isPrivate: tab.isPrivate, openerId: tab.id });
		else if (action === "mute") toggleMute(tab);
		else if (action === "close") closeTab(tab);
		else if (action === "close-others") for (const other of state.tabs.filter(item => item !== tab)) closeTab(other);
	});

}

async function init() {

	const glider = el("div", "tab-glider");
	glider.id = "tabGlider";
	element("tabs").append(glider);
	for (const panel of ["find", "suggestions"]) element(panel).inert = true;

	bindEvents();
	bindTips();
	const initial = await window.mog.invoke("ui:init");
	applyState(initial);
	restoreSession(initial.session);

}

init();
