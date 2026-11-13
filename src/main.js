const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, protocol, session, webContents } = require("electron");
const fs = require("fs");
const path = require("path");
const { ElectronBlocker } = require("@ghostery/adblocker-electron");
const cosmeticPreload = require.resolve("@ghostery/adblocker-electron-preload");
const { getDomain, parse: parseHost } = require("tldts-experimental");
const { Tor, routeName } = require("./tor");

const root = path.join(__dirname, "..");
const roots = { booster: path.join(root, "booster"), newtab: path.join(__dirname, "pages"), settings: path.join(__dirname, "pages"), tor: path.join(__dirname, "pages") };
const indexFiles = { newtab: "index.html", settings: "settings.html", tor: "tor.html" };
const preloadWeb = path.join(root, "dist", "preload-web.js");
const partitions = ["persist:mog", "mog-private"];
const torPartition = "mog-tor";
// Tor tabs present as Tor Browser on Windows, like every other Tor Browser user, whatever this machine is.
const torUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0";
const deadProxy = { proxyRules: "socks5://127.0.0.1:9", proxyBypassRules: "<-loopback>" };
const homeUrl = "mog://newtab/";
const mimeTypes = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".txt": "text/plain" };
const trackingParams = /^(utm_\w+|fbclid|gclid|gclsrc|dclid|gbraid|wbraid|msclkid|mc_eid|mc_cid|igshid|igsh|yclid|twclid|ttclid|_hsenc|_hsmi|vero_id|oly_enc_id|oly_anon_id|s_cid|si)$/i;
const boosterKeys = { ArrowUp: "volume-up", ArrowDown: "volume-down", m: "toggle-mute", d: "toggle-distortion" };
const builtInBookmarks = [
	{ title: "SlopAlbum", url: "https://slopalbum.com/", isBuiltIn: true },
	{ title: "Looksmax.org", url: "https://looksmax.org/", isBuiltIn: true },
];

protocol.registerSchemesAsPrivileged([
	{ scheme: "mog", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, bypassCSP: true, stream: true } },
]);
app.userAgentFallback = app.userAgentFallback.replace(/ (Electron|mog-browser)\/\S+/gi, "");

let window = null;
let worker = null;
let blocker = null;
let tor = null;
let torSession = null;
let hasTorTabs = false;
const engines = {
	google: { name: "Google", web: "https://www.google.com/search?q=%s", images: "https://www.google.com/search?q=%s&udm=2", videos: "https://www.google.com/search?q=%s&udm=7" },
	duckduckgo: { name: "DuckDuckGo", web: "https://duckduckgo.com/?q=%s", images: "https://duckduckgo.com/?q=%s&iax=images&ia=images", videos: "https://duckduckgo.com/?q=%s&iax=videos&ia=videos" },
	brave: { name: "Brave Search", web: "https://search.brave.com/search?q=%s", images: "https://search.brave.com/images?q=%s", videos: "https://search.brave.com/videos?q=%s" },
	baidu: { name: "Baidu 百度", web: "https://www.baidu.com/s?wd=%s", images: "https://image.baidu.com/search/index?tn=baiduimage&word=%s", videos: "https://www.baidu.com/sf/vsearch?pd=video&wd=%s" },
	bing: { name: "Bing", web: "https://www.bing.com/search?q=%s", images: "https://www.bing.com/images/search?q=%s", videos: "https://www.bing.com/videos/search?q=%s" },
};
const defaults = {
	shields: true,
	blockCookies: true,
	stripParams: true,
	shieldsOff: [],
	bookmarks: [],
	blockedTotal: 0,
	autostart: false,
	theme: { accent: "#e6dcc3", hot: "#d21f2b", background: "#000000", text: "#ededed" },
	isCompact: false,
	showBookmarks: true,
	searchEngine: "google",
	searchMode: "web",
	restoreSession: false,
	clearOnExit: false,
	syncBoosterColors: true,
	chinaMode: false,
	themeBefore: null,
	flag: "",
	panicUrl: "https://ssosza.edupage.org/",
	home: { title: "MOG BROWSER", tagline: "Mog the trackers. Ascend the web.", showStats: true, showClock: true, showSites: true, showNotes: false, dim: 45, background: "", notes: "", sites: [] },
	session: [],
	torBridge: "",
};
const chinaTheme = { background: "#120303", text: "#fff3e0", accent: "#ffd447", hot: "#ff2d2d" };
const backgroundTypes = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif" };
const editable = ["shields", "blockCookies", "stripParams", "isCompact", "showBookmarks", "searchEngine", "searchMode", "restoreSession", "clearOnExit", "syncBoosterColors"];
let settings = structuredClone(defaults);
let history = [];
let historyTimer = 0;
let update = { status: "idle", version: "", percent: 0 };
let storage = { local: {}, sync: {}, session: {} };
let settingsTimer = 0;
let storageTimer = 0;
let blockedTimer = 0;
let sequence = 0;

const tabs = new Map();
const contexts = new Set();
const pending = new Map();
const directPending = new Map();
const blocked = new Map();
const blockedDirty = new Set();
const granted = new Set();

const dataFile = name => path.join(app.getPath("userData"), name);

function readJson(name, fallback) {

	try {
		return JSON.parse(fs.readFileSync(dataFile(name), "utf8"));
	} catch {
		return fallback;
	}

}

function saveSettings(isImmediate) {

	clearTimeout(settingsTimer);
	const write = () => fs.promises.writeFile(dataFile("settings.json"), JSON.stringify(settings, null, "\t")).catch(() => {});
	if (isImmediate) return fs.writeFileSync(dataFile("settings.json"), JSON.stringify(settings, null, "\t"));
	settingsTimer = setTimeout(write, 300);

}

function saveStorage(isImmediate) {

	clearTimeout(storageTimer);
	const data = () => JSON.stringify({ local: storage.local, sync: storage.sync });
	if (isImmediate) return fs.writeFileSync(dataFile("booster-storage.json"), data());
	storageTimer = setTimeout(() => fs.promises.writeFile(dataFile("booster-storage.json"), data()).catch(() => {}), 300);

}

const bookmarks = () => [...builtInBookmarks, ...settings.bookmarks];
const engine = () => engines[settings.chinaMode ? "baidu" : settings.searchEngine];
const searchUrl = (text, mode = "web") => engine()[mode].replace("%s", encodeURIComponent(text));

function uiState() {

	const { bookmarks: saved, blockedTotal, session: lastSession, autostart, themeBefore, ...shared } = settings;
	return {
		settings: shared,
		bookmarks: bookmarks(),
		blockedTotal,
		homeUrl,
		search: engine(),
		version: app.getVersion(),
		update,
		engines: Object.entries(engines).map(([id, engine]) => ({ id, name: engine.name })),
	};

}

function applyTheme() {

	const { theme } = settings;
	if (window && !window.isDestroyed()) {
		window.setTitleBarOverlay({ color: theme.background, symbolColor: theme.accent, height: settings.isCompact ? 34 : 40 });
		window.setBackgroundColor(theme.background);
	}
	const prefs = storage.local.prefs ?? {};
	if (settings.syncBoosterColors && (prefs.accent !== theme.accent || prefs.hot !== theme.hot)) storageRequest("local", "set", { prefs: { ...prefs, accent: theme.accent, hot: theme.hot } });

}

function applyPatch(patch) {

	for (const key of editable) {
		if (typeof patch?.[key] !== typeof defaults[key]) continue;
		if (key === "searchEngine" && !engines[patch[key]]) continue;
		if (key === "searchMode" && !["web", "images", "videos"].includes(patch[key])) continue;
		settings[key] = patch[key];
	}
	for (const key of Object.keys(defaults.theme)) {
		if (/^#[0-9a-f]{6}$/i.test(patch?.theme?.[key] ?? "")) settings.theme[key] = patch.theme[key].toLowerCase();
	}
	if (typeof patch?.flag === "string" && /^[a-z]{0,2}$/.test(patch.flag)) settings.flag = patch.flag;
	if (typeof patch?.panicUrl === "string") {
		const url = /^https?:\/\//i.test(patch.panicUrl.trim()) ? patch.panicUrl.trim() : `https://${patch.panicUrl.trim()}`;
		if (hostOf(url).includes(".")) settings.panicUrl = url.slice(0, 500);
	}
	for (const key of Object.keys(defaults.home)) {
		const value = patch?.home?.[key];
		if (key === "background" || value === undefined) continue;
		if (key === "sites") {
			if (!Array.isArray(value)) continue;
			settings.home.sites = value
				.filter(site => site && typeof site.title === "string" && isWeb(site.url))
				.slice(0, 24)
				.map(site => ({ title: site.title.trim().slice(0, 30) || hostOf(site.url), url: site.url.slice(0, 500) }));
		} else if (key === "notes") {
			if (typeof value === "string") settings.home.notes = value.slice(0, 4000);
		} else if (typeof value === typeof defaults.home[key]) {
			settings.home[key] = typeof value === "string" ? value.slice(0, 60) : typeof value === "number" ? Math.max(0, Math.min(90, Math.round(value) || 0)) : value;
		}
	}
	if (typeof patch?.chinaMode === "boolean" && patch.chinaMode !== settings.chinaMode) {
		settings.chinaMode = patch.chinaMode;
		if (patch.chinaMode) {
			settings.themeBefore = { ...settings.theme };
			settings.theme = { ...chinaTheme };
		} else if (settings.themeBefore) {
			settings.theme = { ...defaults.theme, ...settings.themeBefore };
			settings.themeBefore = null;
		}
	}
	saveSettings();
	applyTheme();
	toUi("ui:state", uiState());
	return uiState();

}

function saveHistory() {

	clearTimeout(historyTimer);
	historyTimer = setTimeout(() => fs.promises.writeFile(dataFile("history.json"), JSON.stringify(history)).catch(() => {}), 1000);

}

function suggest(text) {

	const words = String(text ?? "").trim().toLowerCase();
	if (!words) return [];
	const seen = new Set();
	const matches = [];
	for (const item of [...bookmarks(), ...history]) {
		if (matches.length >= 6) break;
		if (seen.has(item.url) || !(item.url.toLowerCase().includes(words) || String(item.title).toLowerCase().includes(words))) continue;
		seen.add(item.url);
		matches.push({ url: item.url, title: item.title });
	}
	return matches;

}

async function clearBrowsingData() {

	for (const partition of [...partitions, torPartition]) {
		const target = session.fromPartition(partition);
		await target.clearStorageData();
		await target.clearCache();
	}
	granted.clear();
	history = [];
	saveHistory();

}
const toUi = (channel, data) => window && !window.isDestroyed() && window.webContents.send(channel, data);
const hostOf = url => {
	try {
		return new URL(url).hostname;
	} catch {
		return "";
	}
};
const isWeb = url => /^https?:\/\//i.test(url ?? "");
const isBooster = event => String(event.senderFrame?.url ?? "").startsWith("mog://booster/");
const isTorContents = contents => Boolean(torSession && contents && !contents.isDestroyed() && contents.session === torSession);
const tabOf = id => {
	const tab = tabs.get(id);
	return tab ? { id: tab.id, windowId: 1, url: tab.url, title: tab.title, favIconUrl: tab.favIconUrl, active: tab.isActive } : null;
};
const activeTab = () => tabOf([...tabs.values()].find(tab => tab.isActive)?.id);

function topUrl(details) {

	try {
		return details.frame?.top?.url || details.webContents?.getURL() || "";
	} catch {
		return details.webContents?.getURL() ?? "";
	}

}

function isShielded(details) {
	return settings.shields && !settings.shieldsOff.includes(hostOf(topUrl(details)));
}

function cleanUrl(url) {

	try {
		const parsed = new URL(url);
		const before = parsed.search;
		for (const key of [...parsed.searchParams.keys()]) {
			if (trackingParams.test(key) && !(key === "si" && !/youtu/.test(parsed.hostname))) parsed.searchParams.delete(key);
		}
		return parsed.search === before ? url : parsed.toString();
	} catch {
		return url;
	}

}

async function serveInternal(request) {

	const url = new URL(request.url);
	const base = roots[url.hostname];
	if (!base) return new Response("Not found", { status: 404 });

	if (url.hostname === "newtab" && url.pathname === "/background") {
		const name = path.basename(settings.home.background);
		const type = Object.keys(backgroundTypes).find(key => backgroundTypes[key] === path.extname(name));
		if (!name || !type) return new Response("Not found", { status: 404 });
		try {
			return new Response(await fs.promises.readFile(dataFile(name)), { headers: { "content-type": type, "cache-control": "no-store" } });
		} catch {
			return new Response("Not found", { status: 404 });
		}
	}

	if (url.hostname === "tor" && (url.pathname === "/" || url.pathname === "/tor.html")) {
		const route = tor?.state.status === "ready" ? (tor.state.route === "direct" ? "Direct connection to the Tor network" : `Bridge: ${routeName(tor.state.route)}`) : "Connecting";
		const page = (await fs.promises.readFile(path.join(base, "tor.html"), "utf8")).replace("{{route}}", route.replace(/[<>&"]/g, ""));
		return new Response(page, { headers: { "content-type": "text/html", "cache-control": "no-store" } });
	}

	const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "") || indexFiles[url.hostname] || "index.html";
	const file = path.normalize(path.join(base, relative));
	if (!file.startsWith(base + path.sep)) return new Response("Not found", { status: 404 });
	try {
		const body = await fs.promises.readFile(file);
		return new Response(body, { headers: { "content-type": mimeTypes[path.extname(file)] ?? "application/octet-stream", "access-control-allow-origin": "*" } });
	} catch {
		return new Response("Not found", { status: 404 });
	}

}

function setupSession(target, isFirst) {

	target.protocol.handle("mog", serveInternal);

	if (blocker) {
		if (isFirst) blocker.enableBlockingInSession(target);
		else target.registerPreloadScript({ type: "frame", filePath: cosmeticPreload });
		target.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (details, callback) => isShielded(details) ? blocker.onBeforeRequest(details, callback) : callback({}));
		target.webRequest.onHeadersReceived({ urls: ["<all_urls>"] }, (details, callback) => isShielded(details) ? blocker.onHeadersReceived(details, callback) : callback({}));
	}

	target.webRequest.onBeforeSendHeaders((details, callback) => {

		const headers = details.requestHeaders;
		if (settings.chinaMode && isWeb(details.url)) headers["Accept-Language"] = "zh-CN,zh;q=0.9";
		if (!isWeb(details.url) || !isShielded(details)) return callback({ requestHeaders: headers });

		headers["Sec-GPC"] = "1";
		headers.DNT = "1";
		const top = topUrl(details);
		if (details.resourceType !== "mainFrame" && isWeb(top)) {
			const site = getDomain(top) ?? hostOf(top);
			const requestSite = getDomain(details.url) ?? hostOf(details.url);
			if (site !== requestSite) {
				if (settings.blockCookies) delete headers.Cookie;
				if (headers.Referer) headers.Referer = `${new URL(top).origin}/`;
			}
		}
		callback({ requestHeaders: headers });

	});

	const safe = new Set(["fullscreen", "pointerLock", "clipboard-sanitized-write", "keyboardLock"]);
	const names = { media: "your camera or microphone", geolocation: "your location", notifications: "notifications", "clipboard-read": "your clipboard", midi: "MIDI devices", midiSysex: "MIDI devices" };
	target.setPermissionCheckHandler((contents, permission, origin) => safe.has(permission) || origin?.startsWith("mog://") || granted.has(`${origin}|${permission}`));
	target.setPermissionRequestHandler(async (contents, permission, callback, details) => {

		const url = details.requestingUrl ?? contents.getURL();
		if (safe.has(permission) || url.startsWith("mog://booster/")) return callback(true);
		if (!names[permission] || !window) return callback(false);

		const origin = new URL(url).origin;
		const { response } = await dialog.showMessageBox(window, {
			type: "question",
			buttons: ["Block", "Allow"],
			defaultId: 0,
			cancelId: 0,
			message: `${hostOf(url)} wants to use ${names[permission]}`,
			detail: "Allow only if you trust this site. The choice lasts until you close Mog Browser.",
		});
		if (response === 1) granted.add(`${origin}/|${permission}`).add(`${origin}|${permission}`);
		callback(response === 1);

	});

	target.on("will-download", trackDownload);

}

function trackDownload(event, item) {

	const id = ++sequence;
	const send = status => toUi("ui:download", { id, name: item.getFilename(), received: item.getReceivedBytes(), total: item.getTotalBytes(), status });
	item.on("updated", () => send("progressing"));
	item.once("done", (done, status) => send(status));

}

// Tor tabs: every request goes through Tor, and nothing leaves until Tor has finished connecting.
// Safest mode is always on: no JavaScript (set where the webview attaches), and no remote fonts, SVG images, plugins or WebGL.
function setupTorSession(target) {

	const isLocal = url => /^(mog|data|blob):/i.test(url);
	target.protocol.handle("mog", request => {
		const url = new URL(request.url);
		const isAllowed = url.hostname === "tor" || (url.hostname === "booster" && url.pathname.startsWith("/fonts/"));
		return isAllowed ? serveInternal(request) : new Response("Not found", { status: 404 });
	});
	target.setProxy(deadProxy);
	target.setUserAgent(torUserAgent, "en-US,en");
	target.setSpellCheckerEnabled(false);

	target.webRequest.onBeforeRequest((details, callback) => {
		if (isLocal(details.url)) return callback({});
		if (tor?.state.status !== "ready" || !/^(https?|wss?):/i.test(details.url)) return callback({ cancel: true });
		if (details.resourceType === "font" || details.resourceType === "object") return callback({ cancel: true });
		callback({});
	});

	target.webRequest.onBeforeSendHeaders((details, callback) => {
		const headers = {};
		for (const [name, value] of Object.entries(details.requestHeaders)) {
			if (!/^sec-ch-ua/i.test(name)) headers[name] = value;
		}
		if (isWeb(details.url)) headers["Accept-Language"] = "en-US,en;q=0.5";
		callback({ requestHeaders: headers });
	});

	target.webRequest.onHeadersReceived((details, callback) => {
		const type = Object.entries(details.responseHeaders ?? {}).find(([name]) => name.toLowerCase() === "content-type")?.[1]?.join(",") ?? "";
		callback(details.resourceType === "image" && /svg/i.test(type) ? { cancel: true } : {});
	});

	target.setPermissionCheckHandler((contents, permission, origin) => permission === "fullscreen" || Boolean(origin?.startsWith("mog://")));
	target.setPermissionRequestHandler((contents, permission, callback) => callback(permission === "fullscreen"));
	target.on("will-download", trackDownload);

}

let torProxy = "";

async function onTorState(state) {

	const next = state.status === "ready" ? `socks5://127.0.0.1:${state.port}` : "";
	if (next !== torProxy) {
		torProxy = next;
		await torSession.setProxy(next ? { proxyRules: next, proxyBypassRules: "<-loopback>" } : deadProxy);
		await torSession.closeAllConnections().catch(() => {});
	}
	toUi("ui:tor-state", tor.state);

}

function handleInput(event, input) {

	if (input.type !== "keyDown") return;
	const key = input.key.length === 1 ? input.key.toLowerCase() : input.key;
	const isControl = input.control || input.meta;
	let shortcut = "";

	if (input.alt && input.shift && !isControl && boosterKeys[key]) {
		const tab = activeTab();
		if (tab && worker && !worker.isDestroyed()) worker.webContents.send("booster:event", { name: "commands.onCommand", values: [boosterKeys[key], tab] });
		return event.preventDefault();
	}

	if (isControl && !input.alt) {
		if (key === "t") shortcut = input.shift ? "reopen" : "new-tab";
		else if (key === "n") shortcut = input.shift ? "new-private" : "new-tab";
		else if (key === "w") shortcut = "close-tab";
		else if (key === "l" && !input.shift) shortcut = "focus-url";
		else if (key === "r") shortcut = "reload";
		else if (key === "d") shortcut = "bookmark";
		else if (key === "f") shortcut = "find";
		else if (key === ",") shortcut = "settings";
		else if (key === "s" && input.shift) shortcut = "screenshot";
		else if (key === "l" && input.shift) shortcut = "lock-in";
		else if (key === "x" && input.shift) shortcut = "panic";
		else if (key === "b" && input.shift) shortcut = "booster";
		else if (key === "o" && input.shift) shortcut = "new-tor";
		else if (key === "Tab") shortcut = input.shift ? "previous-tab" : "next-tab";
		else if (key === "=" || key === "+") shortcut = "zoom-in";
		else if (key === "-") shortcut = "zoom-out";
		else if (key === "0") shortcut = "zoom-reset";
		else if (/^[1-9]$/.test(key)) shortcut = `tab-${key}`;
	} else if (input.alt && !isControl) {
		if (key === "ArrowLeft") shortcut = "back";
		else if (key === "ArrowRight") shortcut = "forward";
		else if (key === "Home") shortcut = "home";
	} else if (key === "F5") shortcut = "reload";
	else if (key === "F12") shortcut = "devtools";
	else if (key === "F11") shortcut = "fullscreen";
	else if (key === "Escape") shortcut = "escape";

	if (!shortcut) return;
	if (shortcut !== "escape") event.preventDefault();
	toUi("ui:shortcut", shortcut);

}

function setupGuest(contents) {

	contents.on("before-input-event", handleInput);
	const isTor = isTorContents(contents);
	if (isTor) contents.setWebRTCIPHandlingPolicy("disable_non_proxied_udp");

	contents.setWindowOpenHandler(({ url, disposition }) => {
		if (isWeb(url)) toUi("ui:open", { url: settings.stripParams ? cleanUrl(url) : url, isBackground: disposition === "background-tab", openerId: contents.id });
		return { action: "deny" };
	});

	contents.on("will-navigate", (event, url) => {

		const current = contents.getURL();
		if (url.startsWith("mog:") && isWeb(current)) return event.preventDefault();
		if (!/^(https?|mog|about|blob|data):/i.test(url)) return event.preventDefault();
		if (!settings.stripParams || !settings.shields || !isWeb(url)) return;

		const cleaned = cleanUrl(url);
		if (cleaned === url) return;
		event.preventDefault();
		contents.loadURL(cleaned);

	});

	contents.on("did-start-navigation", (event, url, isInPlace, isMainFrame) => {
		if (!isMainFrame || isInPlace) return;
		blocked.set(contents.id, 0);
		blockedDirty.add(contents.id);
		queueBlocked();
	});

	contents.on("context-menu", (event, params) => {

		const items = [];
		if (params.linkURL) {
			items.push({ label: "Open link in new tab", click: () => toUi("ui:open", { url: params.linkURL, isBackground: true, openerId: contents.id }) });
			if (isTor) items.push({ label: "Open link in new Tor tab", click: () => toUi("ui:open", { url: params.linkURL, isTor: true }) });
			else items.push({ label: "Open link in private tab", click: () => toUi("ui:open", { url: params.linkURL, isPrivate: true }) });
			items.push({ label: "Copy link", click: () => clipboard.writeText(settings.stripParams ? cleanUrl(params.linkURL) : params.linkURL) });
			items.push({ type: "separator" });
		}
		if (params.mediaType === "image" && params.srcURL) {
			items.push({ label: "Open image in new tab", click: () => toUi("ui:open", { url: params.srcURL, openerId: contents.id }) });
			items.push({ label: "Save image", click: () => contents.downloadURL(params.srcURL) });
			items.push({ label: "Copy image", click: () => contents.copyImageAt(params.x, params.y) });
			items.push({ type: "separator" });
		}
		if (params.isEditable) items.push({ role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }, { type: "separator" });
		else if (params.selectionText) {
			const text = params.selectionText.trim();
			items.push({ role: "copy" });
			const short = text.length > 30 ? `${text.slice(0, 30)}…` : text;
			items.push({ label: `Search ${engine().name} for "${short}"`, click: () => toUi("ui:open", { url: searchUrl(text), openerId: contents.id }) });
			items.push({ label: `Search images for "${short}"`, click: () => toUi("ui:open", { url: searchUrl(text, "images"), openerId: contents.id }) });
			items.push({ label: `Search videos for "${short}"`, click: () => toUi("ui:open", { url: searchUrl(text, "videos"), openerId: contents.id }) });
			items.push({ type: "separator" });
		}
		items.push({ label: "Back", enabled: contents.navigationHistory.canGoBack(), click: () => contents.navigationHistory.goBack() });
		items.push({ label: "Forward", enabled: contents.navigationHistory.canGoForward(), click: () => contents.navigationHistory.goForward() });
		items.push({ label: "Reload", click: () => contents.reload() });
		items.push({ type: "separator" });
		items.push({ label: "Inspect", click: () => contents.inspectElement(params.x, params.y) });
		Menu.buildFromTemplate(items).popup({ window });

	});

}

function queueBlocked() {

	if (blockedTimer) return;
	blockedTimer = setTimeout(() => {
		blockedTimer = 0;
		const counts = {};
		for (const id of blockedDirty) counts[id] = blocked.get(id) ?? 0;
		blockedDirty.clear();
		toUi("ui:blocked", { counts, total: settings.blockedTotal });
		saveSettings();
	}, 400);

}

function deliver(message, sender, exclude) {

	if (message?.target === "offscreen") return Promise.resolve(undefined);
	let targets = [...contexts].filter(context => context !== exclude && !context.isDestroyed());
	if (message?.target === "worker") targets = targets.filter(context => context === worker?.webContents);
	if (!targets.length) return Promise.resolve(undefined);

	return new Promise(resolve => {
		const id = ++sequence;
		let remaining = targets.length;
		const finish = response => {
			clearTimeout(timer);
			pending.delete(id);
			resolve(response);
		};
		const timer = setTimeout(finish, 30000);
		pending.set(id, reply => {
			if (reply.isHandled) finish(reply.response);
			else if (--remaining === 0) finish(undefined);
		});
		for (const context of targets) context.send("booster:deliver", { id, message, sender });
	});

}

function broadcast(channel, data) {

	for (const context of contexts) {
		if (!context.isDestroyed()) context.send(channel, data);
	}

}

function storageRequest(area, action, value) {

	const data = storage[area];
	if (!data) throw new Error("Unknown storage area");
	const changes = {};
	const change = (key, next) => {
		if (JSON.stringify(data[key]) === JSON.stringify(next)) return;
		changes[key] = { oldValue: data[key], newValue: next };
		if (next === undefined) delete data[key];
		else data[key] = next;
	};

	if (action === "get") {
		if (value === null || value === undefined) return { ...data };
		const defaults = typeof value === "object" && !Array.isArray(value) ? value : {};
		const keys = typeof value === "string" ? [value] : Array.isArray(value) ? value : Object.keys(value);
		return Object.fromEntries(keys.filter(key => key in data || key in defaults).map(key => [key, key in data ? data[key] : defaults[key]]));
	}
	if (action === "set") for (const [key, next] of Object.entries(value ?? {})) change(key, next);
	else if (action === "remove") for (const key of [value].flat()) change(key, undefined);
	else if (action === "clear") for (const key of Object.keys(data)) change(key, undefined);

	if (Object.keys(changes).length) {
		if (area !== "session") saveStorage();
		broadcast("booster:storage-changed", { area, changes: JSON.parse(JSON.stringify(changes)) });
	}

}

const boosterApi = {

	"tabs.query": info => {
		const list = [...tabs.keys()].map(tabOf);
		return info.active ? list.filter(tab => tab.active) : list;
	},

	"tabs.get": ({ tabId }) => {
		const tab = tabOf(tabId);
		if (!tab) throw new Error("No tab with that id");
		return tab;
	},

	"tabs.update": ({ tabId, properties }) => {
		if (properties?.active) toUi("ui:activate", { id: tabId });
		return tabOf(tabId) ?? { windowId: 1 };
	},

	"tabs.create": ({ url }) => {
		if (isWeb(url) || String(url).startsWith("mog://")) toUi("ui:open", { url });
		else toUi("ui:toast", "Booster shortcuts in Mog Browser: Alt+Shift+Up, Down, M and D.");
		return {};
	},

	"scripting.executeScript": async ({ tabId, func, args, files }) => {
		const tab = tabs.get(tabId);
		const contents = webContents.fromId(tabId);
		if (!tab || !contents || !isWeb(contents.getURL()) || isTorContents(contents)) throw new Error("Cannot access this page");
		if (files || !func) return [{ result: null }];
		return [{ result: await contents.executeJavaScript(`(${func})(...${JSON.stringify(args ?? [])})`, true) }];
	},

	"autostart.get": () => settings.autostart,

	"autostart.set": isOn => {
		settings.autostart = Boolean(isOn);
		saveSettings();
	},

	"action.badge": data => {
		toUi("ui:badge", data);
	},

	"commands.getAll": () => {
		const { commands } = JSON.parse(fs.readFileSync(path.join(roots.booster, "manifest.json"), "utf8"));
		return Object.entries(commands).map(([name, command]) => ({ name, description: command.description, shortcut: command.suggested_key?.default ?? "" }));
	},

	"downloads.download": ({ url }) => {
		window?.webContents.downloadURL(url);
	},

};

function registerIpc() {

	ipcMain.on("booster:register", event => {
		if (!isBooster(event)) return;
		contexts.add(event.sender);
		event.sender.once("destroyed", () => contexts.delete(event.sender));
	});

	ipcMain.on("booster:reply", (event, reply) => pending.get(reply?.id)?.(reply));
	ipcMain.on("booster:direct-reply", (event, reply) => directPending.get(reply?.id)?.(reply, event.sender.id));

	ipcMain.handle("booster:send", (event, message) => {
		if (!isBooster(event)) throw new Error("blocked");
		return deliver(message, { url: event.senderFrame.url, id: "mog-browser-booster" }, event.sender);
	});

	ipcMain.handle("booster:page-send", (event, message) => {
		const tab = tabOf(event.sender.id);
		if (!tab || message?.target !== "worker" || !["heartbeat", "guarded", "directStarted", "autostart"].includes(message.type)) return undefined;
		return deliver(message, { tab, url: event.senderFrame?.url ?? tab.url }, event.sender);
	});

	ipcMain.handle("booster:autostart-enabled", () => settings.autostart);

	ipcMain.handle("booster:tabs-send", (event, tabId, message) => {

		if (!isBooster(event)) throw new Error("blocked");
		const contents = webContents.fromId(tabId);
		if (!tabs.has(tabId) || !contents || !isWeb(contents.getURL()) || isTorContents(contents)) throw new Error("Could not establish connection");

		return new Promise((resolve, reject) => {
			const id = ++sequence;
			const timer = setTimeout(() => {
				directPending.delete(id);
				reject(new Error("Could not establish connection"));
			}, 4000);
			directPending.set(id, (reply, senderId) => {
				if (senderId !== tabId) return;
				clearTimeout(timer);
				directPending.delete(id);
				if (reply.isHandled) resolve(reply.response);
				else reject(new Error("Could not establish connection"));
			});
			contents.send("booster:direct", { id, message });
		});

	});

	ipcMain.handle("booster:storage", (event, area, action, value) => {
		if (!isBooster(event)) throw new Error("blocked");
		return storageRequest(area, action, value);
	});

	ipcMain.handle("booster:api", (event, name, data) => {
		if (!isBooster(event) || !Object.hasOwn(boosterApi, name)) throw new Error("blocked");
		return boosterApi[name](data);
	});

	const isHome = event => String(event.senderFrame?.url ?? "").startsWith("mog://newtab/");
	ipcMain.handle("home:data", () => ({ ...uiState(), isShielded: settings.shields }));
	ipcMain.handle("home:stats", () => ({ blockedTotal: settings.blockedTotal }));
	ipcMain.handle("home:set", (event, patch) => isHome(event) ? applyPatch({ theme: patch?.theme, flag: patch?.flag, home: patch?.home, chinaMode: patch?.chinaMode }) : null);
	ipcMain.on("ui:update-install", event => {
		if (event.sender !== window?.webContents || update.status !== "ready") return;
		saveSettings(true);
		saveStorage(true);
		require("electron-updater").autoUpdater.quitAndInstall(true, true);
	});
	ipcMain.handle("home:background", async (event, bytes, type) => {

		if (!isHome(event) && !isSettings(event)) return null;
		const previous = path.basename(settings.home.background);
		if (previous) await fs.promises.unlink(dataFile(previous)).catch(() => {});
		settings.home.background = "";
		if (bytes && backgroundTypes[type] && bytes.byteLength <= 25 * 1024 * 1024) {
			const name = `background-${Date.now()}${backgroundTypes[type]}`;
			await fs.promises.writeFile(dataFile(name), Buffer.from(bytes));
			settings.home.background = name;
		}
		saveSettings();
		return uiState();

	});
	ipcMain.handle("ui:update", event => event.sender === window?.webContents ? checkForUpdates(true) : null);

	const isUi = event => event.sender === window?.webContents;
	const isSettings = event => String(event.senderFrame?.url ?? "").startsWith("mog://settings/");

	ipcMain.handle("ui:init", event => isUi(event) ? { ...uiState(), session: settings.restoreSession ? settings.session : [] } : null);
	ipcMain.handle("ui:settings", (event, patch) => isUi(event) ? applyPatch(patch) : null);
	ipcMain.handle("ui:suggest", (event, text) => isUi(event) ? suggest(text) : []);
	ipcMain.handle("ui:tor", event => isUi(event) && tor ? tor.start() : null);

	ipcMain.handle("settings:get", event => isSettings(event) ? { ...uiState(), defaults: { theme: defaults.theme, home: defaults.home }, history: history.slice(0, 300) } : null);
	ipcMain.handle("settings:set", (event, patch) => isSettings(event) ? applyPatch(patch) : null);
	ipcMain.handle("settings:action", async (event, name, value) => {

		if (!isSettings(event)) return null;
		if (name === "remove-bookmark") settings.bookmarks = settings.bookmarks.filter(item => item.url !== value);
		else if (name === "clear-history") {
			history = [];
			saveHistory();
		} else if (name === "clear-data") await clearBrowsingData();
		else if (name === "reset") return applyPatch({ ...structuredClone(defaults), shields: settings.shields });
		else if (name === "check-update") {
			await checkForUpdates(true);
			return uiState();
		}
		saveSettings();
		toUi("ui:state", uiState());
		return uiState();

	});

	ipcMain.on("ui:tab-menu", (event, { key, isMuted, hasOthers }) => {
		if (!isUi(event)) return;
		const act = action => () => toUi("ui:tab-action", { key, action });
		Menu.buildFromTemplate([
			{ label: "Reload", click: act("reload") },
			{ label: "Duplicate", click: act("duplicate") },
			{ label: isMuted ? "Unmute tab" : "Mute tab", click: act("mute") },
			{ type: "separator" },
			{ label: "Close", click: act("close") },
			{ label: "Close other tabs", enabled: Boolean(hasOthers), click: act("close-others") },
		]).popup({ window });
	});

	ipcMain.on("ui:screenshot", async (event, id) => {
		const contents = webContents.fromId(id);
		if (!isUi(event) || !tabs.has(id) || !contents) return;
		const image = await contents.capturePage();
		const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
		const { filePath } = await dialog.showSaveDialog(window, { defaultPath: path.join(app.getPath("pictures"), `mog-screenshot-${stamp}.png`), filters: [{ name: "PNG image", extensions: ["png"] }] });
		if (!filePath) return;
		await fs.promises.writeFile(filePath, image.toPNG());
		toUi("ui:toast", "Screenshot saved.");
	});

	ipcMain.handle("ui:shields", (event, { host, isOff }) => {
		if (!isUi(event) || !host) return null;
		settings.shieldsOff = settings.shieldsOff.filter(item => item !== host);
		if (isOff) settings.shieldsOff.push(host);
		saveSettings();
		return uiState();
	});

	ipcMain.handle("ui:bookmark", (event, { url, title }) => {
		if (!isUi(event) || !isWeb(url)) return null;
		const isSaved = bookmarks().some(item => item.url === url);
		if (isSaved) settings.bookmarks = settings.bookmarks.filter(item => item.url !== url);
		else settings.bookmarks.push({ title: String(title || hostOf(url)).slice(0, 60), url });
		saveSettings();
		return uiState();
	});

	ipcMain.handle("ui:clear-data", async event => {
		if (!isUi(event)) return false;
		await clearBrowsingData();
		return true;
	});

	ipcMain.on("ui:tabs", (event, list) => {
		if (!isUi(event) || !Array.isArray(list)) return;
		tabs.clear();
		for (const tab of list) tabs.set(tab.id, tab);
		// Closing the last Tor tab wipes everything Tor tabs stored, much like New Identity in Tor Browser.
		const hadTorTabs = hasTorTabs;
		hasTorTabs = list.some(tab => tab.isTor);
		if (hadTorTabs && !hasTorTabs && torSession) torSession.clearStorageData().then(() => torSession.clearCache()).catch(() => {});
		const open = list.filter(tab => !tab.isPrivate && !tab.isTor && (isWeb(tab.url) || tab.url.startsWith("mog://"))).slice(0, 30);
		settings.session = open.map(tab => ({ url: tab.url, isActive: Boolean(tab.isActive) }));
		saveSettings();
	});

	ipcMain.on("ui:tab-event", (event, { type, id }) => {
		if (!isUi(event)) return;
		if (type === "removed") {
			tabs.delete(id);
			blocked.delete(id);
			broadcast("booster:event", { name: "tabs.onRemoved", values: [id] });
		} else if (type === "complete") {
			const tab = tabs.get(id);
			if (tab && isWeb(tab.url) && !tab.isPrivate && !tab.isTor && history[0]?.url !== tab.url) {
				history.unshift({ url: tab.url, title: String(tab.title ?? "").slice(0, 120), time: Date.now() });
				history.length = Math.min(history.length, 3000);
				saveHistory();
			}
			broadcast("booster:event", { name: "tabs.onUpdated", values: [id, { status: "complete" }, tabOf(id)] });
		}
	});

	ipcMain.on("ui:fullscreen", (event, isOn) => {
		if (isUi(event)) window.setFullScreen(isOn === "toggle" ? !window.isFullScreen() : Boolean(isOn));
	});

	ipcMain.on("ui:devtools", (event, id) => {
		if (isUi(event) && tabs.has(id)) webContents.fromId(id)?.openDevTools({ mode: "right" });
	});

}

function setUpdate(next) {

	update = { ...update, ...next };
	toUi("ui:update-state", update);

}

async function checkForUpdates(isManual) {

	if (!app.isPackaged) {
		if (isManual) toUi("ui:toast", `Mog Browser ${app.getVersion()}. Updates only run in the installed app.`);
		return;
	}
	try {
		const { autoUpdater } = require("electron-updater");
		if (!autoUpdater.listenerCount("update-downloaded")) {
			autoUpdater.on("update-available", info => setUpdate({ status: "downloading", version: info.version, percent: 0 }));
			autoUpdater.on("download-progress", progress => setUpdate({ status: "downloading", percent: Math.round(progress.percent) }));
			autoUpdater.on("update-downloaded", info => setUpdate({ status: "ready", version: info.version, percent: 100 }));
			autoUpdater.on("error", () => {
				if (update.status === "downloading") setUpdate({ status: "idle" });
			});
		}
		if (update.status === "downloading" || update.status === "ready") return;
		const result = await autoUpdater.checkForUpdates();
		if (isManual && !result?.isUpdateAvailable) toUi("ui:toast", `Mog Browser ${app.getVersion()} is the newest version.`);
	} catch (error) {
		if (isManual) toUi("ui:toast", "Couldn't check for updates. Try again later.");
		console.error("Update check failed:", error.message);
	}

}

async function loadBlocker() {

	try {
		blocker = await ElectronBlocker.fromPrebuiltFull(fetch, {
			path: dataFile("shields-full.bin"),
			read: fs.promises.readFile,
			write: fs.promises.writeFile,
		});
		// The stock injector runs every scriptlet at the top level of the page, so two scriptlets that declare the same helper
		// class throw and never run (this is what let YouTube ads through). Running each one in its own block avoids that.
		blocker.onInjectCosmeticFilters = async (event, url, message) => {
			const parsed = parseHost(url);
			const isFirstRun = message === undefined;
			const { active, styles, scripts } = blocker.getCosmeticsFilters({
				domain: parsed.domain || "",
				hostname: parsed.hostname || "",
				url,
				classes: message?.classes,
				hrefs: message?.hrefs,
				ids: message?.ids,
				getBaseRules: isFirstRun,
				getInjectionRules: isFirstRun,
				getExtendedRules: false,
				getRulesFromHostname: isFirstRun,
				getRulesFromDOM: !isFirstRun,
				callerContext: { frameId: event.frameId, processId: event.processId, lifecycle: message?.lifecycle },
			});
			if (active === false || event.sender.isDestroyed()) return;
			if (!settings.shields || settings.shieldsOff.includes(hostOf(event.sender.getURL()))) return;
			if (styles.length > 0) event.sender.insertCSS(styles, { cssOrigin: "user" }).catch(() => {});
			for (const script of scripts) event.sender.executeJavaScript(`{${script}
}`, true).catch(() => {});
		};
		blocker.on("request-blocked", request => {
			settings.blockedTotal++;
			if (request.tabId === undefined) return;
			blocked.set(request.tabId, (blocked.get(request.tabId) ?? 0) + 1);
			blockedDirty.add(request.tabId);
			queueBlocked();
		});
	} catch (error) {
		console.error("Shields couldn't load the filter lists:", error.message);
	}

}

function createWindow() {

	window = new BrowserWindow({
		width: 1360,
		height: 860,
		minWidth: 640,
		minHeight: 420,
		backgroundColor: settings.theme.background,
		show: false,
		title: "Mog Browser",
		icon: path.join(roots.booster, "icons", "icon128.png"),
		titleBarStyle: "hidden",
		titleBarOverlay: { color: settings.theme.background, symbolColor: settings.theme.accent, height: settings.isCompact ? 34 : 40 },
		webPreferences: { preload: path.join(__dirname, "preload-ui.js"), webviewTag: true, contextIsolation: true, sandbox: true, nodeIntegration: false },
	});

	window.webContents.on("will-attach-webview", (event, preferences, params) => {
		delete preferences.preloadURL;
		preferences.contextIsolation = true;
		preferences.nodeIntegration = false;
		preferences.sandbox = true;
		if (params.partition === torPartition) {
			// Safest mode, always: no scripts, WebGL or plugins, media waits for a click, and no page preload at all.
			delete preferences.preload;
			preferences.javascript = false;
			preferences.webgl = false;
			preferences.plugins = false;
			preferences.spellcheck = false;
			preferences.navigateOnDragDrop = false;
			preferences.autoplayPolicy = "document-user-activation-required";
		} else {
			preferences.preload = preloadWeb;
		}
		if (![...partitions, torPartition].includes(params.partition) || !/^(https?:|mog:)/i.test(params.src)) event.preventDefault();
	});
	window.webContents.on("before-input-event", handleInput);
	window.webContents.on("will-navigate", event => event.preventDefault());
	window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
	window.on("enter-full-screen", () => toUi("ui:shortcut", "fullscreen-on"));
	window.on("leave-full-screen", () => toUi("ui:shortcut", "fullscreen-off"));
	window.on("closed", () => app.quit());
	window.maximize();
	window.show();
	window.loadFile(path.join(__dirname, "ui", "index.html"));

	worker = new BrowserWindow({
		show: false,
		webPreferences: { preload: preloadWeb, partition: partitions[0], contextIsolation: true, sandbox: true, backgroundThrottling: false },
	});
	worker.loadURL("mog://booster/background.html");

}

if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {

	app.on("second-instance", (event, argv) => {
		if (!window) return;
		if (window.isMinimized()) window.restore();
		window.focus();
		const url = argv.find(isWeb);
		if (url) toUi("ui:open", { url });
	});

	app.on("web-contents-created", (event, contents) => {
		if (contents.getType() === "webview") setupGuest(contents);
	});

	app.whenReady().then(async () => {

		const saved = readJson("settings.json", {});
		settings = { ...settings, ...saved, theme: { ...defaults.theme, ...saved.theme }, home: { ...defaults.home, ...saved.home } };
		storage = { local: {}, sync: {}, ...readJson("booster-storage.json", {}), session: {} };
		history = readJson("history.json", []);
		Menu.setApplicationMenu(null);
		registerIpc();
		await loadBlocker();
		partitions.forEach((partition, index) => setupSession(session.fromPartition(partition), index === 0));
		torSession = session.fromPartition(torPartition);
		setupTorSession(torSession);
		tor = new Tor({ bundled: app.isPackaged ? path.join(process.resourcesPath, "tor") : path.join(root, "vendor", "tor"), dataDir: dataFile("tor-data"), preferred: settings.torBridge });
		tor.on("state", () => onTorState(tor.state).catch(() => {}));
		tor.on("connected", route => {
			settings.torBridge = route;
			saveSettings();
			toUi("ui:toast", route === "direct" ? "Connected to Tor." : `Connected to Tor through ${routeName(route)}.`);
		});
		if (settings.clearOnExit) {
			await clearBrowsingData().catch(() => {});
			settings.session = [];
		}
		createWindow();
		applyTheme();
		setTimeout(() => checkForUpdates(false), 8000);
		setInterval(() => checkForUpdates(false), 4 * 60 * 60 * 1000);

	});

	app.on("before-quit", () => {
		tor?.kill();
		try {
			saveSettings(true);
			saveStorage(true);
		} catch {
			return;
		}
	});

}
