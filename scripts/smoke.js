// Smoke test: electron scripts/smoke.js [screenshot directory]
// Launches the real app with a throwaway profile, then checks the home page, Shields and the Booster.
const { app, BrowserWindow, webContents } = require("electron");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const output = process.argv[2] || os.tmpdir();
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "mog-smoke-")));
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
require("../src/main.js");

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const results = [];
const check = (name, isPassing, detail = "") => {
	results.push(isPassing);
	console.log(`${isPassing ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

function makeTone() {

	const rate = 44100;
	const samples = rate * 2;
	const buffer = Buffer.alloc(44 + samples * 2);
	buffer.write("RIFF", 0);
	buffer.writeUInt32LE(36 + samples * 2, 4);
	buffer.write("WAVEfmt ", 8);
	buffer.writeUInt32LE(16, 16);
	buffer.writeUInt16LE(1, 20);
	buffer.writeUInt16LE(1, 22);
	buffer.writeUInt32LE(rate, 24);
	buffer.writeUInt32LE(rate * 2, 28);
	buffer.writeUInt16LE(2, 32);
	buffer.writeUInt16LE(16, 34);
	buffer.write("data", 36);
	buffer.writeUInt32LE(samples * 2, 40);
	for (let index = 0; index < samples; index++) buffer.writeInt16LE(Math.round(Math.sin(index / rate * 2 * Math.PI * 440) * 3000), 44 + index * 2);
	return buffer;

}

const server = http.createServer((request, response) => {
	if (request.url.startsWith("/tone.wav")) return response.writeHead(200, { "content-type": "audio/wav" }).end(makeTone());
	if (request.url.startsWith("/ads.js")) return response.writeHead(200, { "content-type": "text/javascript" }).end("window.adLoaded = true;");
	response.writeHead(200, { "content-type": "text/html", "content-security-policy": "default-src 'self'; script-src 'self' https://pagead2.googlesyndication.com" });
	response.end("<title>Smoke page</title><audio id='tone' src='/tone.wav' loop autoplay controls></audio><script src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'></script>");
});

app.whenReady().then(async () => {

	app.on("web-contents-created", (event, contents) => {
		contents.on("console-message", details => {
			if (details.level === "error" || details.level === 3) console.log(`console error [${contents.getURL().slice(0, 60)}] ${details.message}`);
		});
	});
	await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
	const page = `http://127.0.0.1:${server.address().port}/?utm_source=smoke&keep=1`;

	let ui = null;
	for (let attempt = 0; attempt < 100 && !ui; attempt++) {
		await wait(200);
		ui = BrowserWindow.getAllWindows().find(item => item.isVisible());
	}
	ui.unmaximize();
	ui.setSize(1360, 860);
	ui.setFocusable(false);
	ui.setIgnoreMouseEvents(true);
	ui.setPosition(-4000, -4000);
	const worker = BrowserWindow.getAllWindows().find(item => item !== ui);
	const inUi = code => ui.webContents.executeJavaScript(code, true);
	const inWorker = code => worker.webContents.executeJavaScript(code, true);
	const shoot = async name => fs.writeFileSync(path.join(output, name), (await ui.webContents.capturePage()).toPNG());
	await wait(3500);

	const home = await inUi("({ count: state.tabs.length, url: state.active.url, id: state.active.id, title: state.active.title, bookmarks: state.bookmarks.map(item => item.title) })");
	check("home tab opens", home.count === 1 && home.url === "mog://newtab/" && home.id > 0, JSON.stringify(home));
	check("built-in sites are in the bookmarks bar", home.bookmarks.includes("SlopAlbum") && home.bookmarks.includes("Looksmax.org"));
	const homePage = await webContents.fromId(home.id).executeJavaScript("({ sites: [...document.querySelectorAll('#sites a.tile span')].map(node => node.textContent), add: document.querySelectorAll('#sites .is-add').length, gradient: getComputedStyle(document.querySelector('.backdrop i')).backgroundImage.includes('radial-gradient'), dock: document.querySelectorAll('.dock a, .dock button').length, clock: document.getElementById('time').children.length, font: document.fonts.check('800 20px \"Barlow Condensed\"') })", true);
	check("home page renders", homePage.sites.length === 12 && homePage.sites.includes("YouTube") && homePage.sites.includes("Looksmax.org") && homePage.dock === 5 && homePage.clock === 5 && homePage.font && homePage.add === 1 && homePage.gradient, JSON.stringify(homePage));

	const homeContents = webContents.fromId(home.id);
	await homeContents.executeJavaScript("document.getElementById('editSites').click(); document.querySelector('.is-add').click(); document.getElementById('siteName').value = 'Kick clips'; document.getElementById('siteUrl').value = 'kick.com/clips'; document.getElementById('addSite').requestSubmit()", true);
	await wait(700);
	const tiles = await homeContents.executeJavaScript("[...document.querySelectorAll('#sites a.tile span')].map(node => node.textContent)", true);
	check("home page: add your own site tile", tiles.length === 13 && tiles.at(-1) === "Kick clips", JSON.stringify(tiles.slice(-3)));
	await homeContents.executeJavaScript("document.querySelector('[data-home=showNotes]').click()", true);
	await wait(500);
	await homeContents.executeJavaScript("const n = document.getElementById('notesText'); n.value = 'mog harder'; n.dispatchEvent(new Event('input'))", true);
	await wait(800);
	const widget = await homeContents.executeJavaScript("window.mogHome.data().then(data => ({ notes: data.settings.home.notes, shown: !document.getElementById('notes').hidden }))", true);
	check("home page: notes widget saves", widget.notes === "mog harder" && widget.shown, JSON.stringify(widget));
	await homeContents.executeJavaScript("window.mogHome.set({ home: { sites: [], showNotes: false, notes: '' } })", true);

	const square = await inUi("[...document.querySelectorAll('.tab, .address, .pill, .panel, .icon')].every(node => getComputedStyle(node).borderRadius === '0px')");
	check("browser chrome has no rounded corners", square);

	await inUi("element('url').focus(); element('url').value = 'yout'; element('url').setSelectionRange(4, 4); element('url').dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 't' }))");
	const filled = await inUi("({ value: element('url').value, start: element('url').selectionStart })");
	check("address bar autofills popular sites", filled.value === "youtube.com" && filled.start === 4, JSON.stringify(filled));
	await wait(400);
	const suggest = await inUi("({ open: element('suggestions').classList.contains('is-open'), rows: element('suggestions').querySelectorAll('li').length })");
	check("suggestions animate open", suggest.open && suggest.rows >= 1, JSON.stringify(suggest));
	await inUi("hideSuggestions(); element('url').blur()");

	await inUi("togglePanel('menuPanel', 'menu')");
	await wait(300);
	const menu = await inUi("({ open: element('menuPanel').classList.contains('is-open'), opacity: getComputedStyle(element('menuPanel')).opacity, swatches: element('menuThemes').children.length })");
	check("menu opens with themes", menu.open && menu.opacity === "1" && menu.swatches === 12, JSON.stringify(menu));
	await inUi("closePanels()");
	await wait(300);
	check("menu closes", (await inUi("getComputedStyle(element('menuPanel')).visibility")) === "hidden");

	await inUi("void createTab({ url: 'mog://newtab/' })");
	await wait(600);
	const glide = await inUi("({ tabs: state.tabs.length, glider: Math.round(element('tabGlider').getBoundingClientRect().left), active: Math.round(state.active.button.getBoundingClientRect().left) })");
	check("tab highlight glides to the new tab", glide.tabs === 2 && Math.abs(glide.glider - glide.active) <= 1, JSON.stringify(glide));
	await inUi("closeTab(state.active)");
	await wait(120);
	const smash = await inUi("({ hammer: document.querySelectorAll('.hammer').length, smashed: document.querySelectorAll('.tab.is-smashed').length })");
	check("closing a tab swings the hammer", smash.hammer === 1 && smash.smashed === 1, JSON.stringify(smash));
	await wait(700);
	check("closed tab is removed after the smash", (await inUi("document.querySelectorAll('.tab').length + document.querySelectorAll('.hammer').length")) === 1);
	const wide = await inUi("Math.round(state.active.button.getBoundingClientRect().width)");
	check("a single tab scales up", wide >= 240, String(wide));

	await inUi("runAction('lock-in')");
	await wait(500);
	const lock = await inUi("({ on: document.body.classList.contains('is-locked-in'), timer: element('lockTimer').textContent, bookmarks: getComputedStyle(element('bookmarks')).opacity })");
	check("Lock In mode collapses controls and starts the timer", lock.on && /^2[45]:\d\d$/.test(lock.timer) && lock.bookmarks === "0", JSON.stringify(lock));
	await shoot("mog-lockin.png");
	await inUi("runAction('lock-in')");
	await wait(450);
	await shoot("mog-home.png");

	check("address bar: words search Google", (await inUi("toAddress('how to mew').url")) === "https://www.google.com/search?q=how%20to%20mew");
	check("address bar: image: and video: prefixes", (await inUi("toAddress('image: jawline').url")) === "https://www.google.com/search?q=jawline&udm=2" && (await inUi("toAddress('v:mewing').url")) === "https://www.google.com/search?q=mewing&udm=7");
	check("address bar: domains upgrade to https", (await inUi("toAddress('looksmax.org').url")) === "https://looksmax.org");

	await inUi(`go(${JSON.stringify(page)})`);
	await wait(4000);
	const tab = await inUi("({ id: state.active.id, url: state.active.url, title: state.active.title, blocked: state.blocked.get(state.active.id) ?? 0 })");
	const guest = webContents.fromId(tab.id);
	check("page loads", tab.title === "Smoke page", JSON.stringify(tab));
	check("ad script is blocked", tab.blocked >= 1 && !(await guest.executeJavaScript("Boolean(window.adsbygoogle)", true)), `blocked ${tab.blocked}`);

	await guest.executeJavaScript("location.href = location.pathname + '?fbclid=abc&keep=1'", true);
	await wait(1500);
	check("tracking parameters are stripped", !guest.getURL().includes("fbclid") && guest.getURL().includes("keep=1"), guest.getURL());

	await guest.executeJavaScript("document.getElementById('tone').play().catch(() => {})", true);
	await wait(800);
	const started = await inWorker(`handlers.start({ tabId: ${tab.id}, settings: { ...defaultSettings(), volume: 400, clip: true, multiband: true, pitch: 3, pitchMode: "hd" }, info: { title: "Smoke", host: "127.0.0.1" } })`);
	check("booster starts in Direct mode", started?.ok && started.mode === "direct", JSON.stringify(started));
	await wait(2500);
	const levels = await inWorker(`chrome.tabs.sendMessage(${tab.id}, { target: "direct", type: "levels", isSpectrum: true, view: "after" }).catch(error => ({ error: error.message }))`);
	check("booster processes audio", levels?.peak > .05 && levels.spectrum?.length === 40, JSON.stringify({ peak: levels?.peak, lufs: levels?.lufs, error: levels?.error }));
	const badge = await inUi("state.badges.get(state.active.id)");
	check("toolbar badge shows the volume", badge?.text === "400", JSON.stringify(badge));

	await inUi("toggleBooster()");
	await wait(3000);
	const popup = webContents.getAllWebContents().find(item => item.getURL().startsWith("mog://booster/popup.html"));
	const popupState = await popup?.executeJavaScript("({ isActive: state.isActive, mode: state.mode, volume: state.settings.volume, output: document.getElementById('outputText').textContent })", true);
	check("booster popup sees the tab", popupState?.isActive && popupState.mode === "direct" && popupState.volume === 400, JSON.stringify(popupState));
	await shoot("mog-booster.png");

	await popup.executeJavaScript("change({ volume: 250 })", true);
	await wait(600);
	check("popup changes reach the engine", (await inWorker(`loadTabs().then(tabs => tabs.get(${tab.id}).settings.volume)`)) === 250);
	await inWorker(`handlers.stop({ tabId: ${tab.id} })`);
	await inUi("closePanels()");

	await inUi("void createTab({ url: 'mog://booster/options.html' })");
	await wait(2500);
	const options = webContents.getAllWebContents().find(item => item.getURL().startsWith("mog://booster/options.html"));
	const optionsState = await options?.executeJavaScript("({ groups: document.querySelectorAll('#editor .group').length, commands: document.querySelectorAll('#commandList li').length })", true);
	check("booster settings page works", optionsState?.groups > 10 && optionsState.commands > 10, JSON.stringify(optionsState));

	await inUi("runAction('settings')");
	await wait(2000);
	const settingsPage = webContents.getAllWebContents().find(item => item.getURL().startsWith("mog://settings/"));
	await settingsPage.executeJavaScript("document.querySelectorAll('#presets button')[3].click()", true);
	await wait(800);
	const themed = await inUi("({ accent: getComputedStyle(document.documentElement).getPropertyValue('--accent'), presets: 0 })");
	const boosterPrefs = await inWorker("chrome.storage.local.get('prefs').then(data => data.prefs?.accent)");
	check("theme preset recolors the browser and the booster", themed.accent === "#d9b44a" && boosterPrefs === "#d9b44a", JSON.stringify({ themed, boosterPrefs }));
	await shoot("mog-settings.png");
	await settingsPage.executeJavaScript("document.querySelector('#countries .card').click()", true);
	await wait(800);
	const flag = await inUi("({ flag: state.settings.flag, stripe: getComputedStyle(document.documentElement).getPropertyValue('--flag').includes('linear-gradient'), accent: state.settings.theme.accent })");
	check("country theme applies with its flag stripe", flag.flag === "sk" && flag.stripe && flag.accent === "#ffffff", JSON.stringify(flag));
	const nav = await settingsPage.executeJavaScript("location.hash = '#history'; new Promise(resolve => setTimeout(() => resolve({ active: document.querySelector('.page.is-active').id, glider: document.getElementById('navGlider').style.transform }), 400))", true);
	check("settings pages switch with the sliding marker", nav.active === "page-history" && /translateY\((?!0px)/.test(nav.glider), JSON.stringify(nav));
	await shoot("mog-settings-2.png");
	await settingsPage.executeJavaScript("document.querySelector('#presets .card').click()", true);
	await wait(500);
	check("history records visited pages", await settingsPage.executeJavaScript("window.mogSettings.get().then(data => data.history.length > 0)", true));

	await inUi("window.mog.invoke('ui:settings', { chinaMode: true }).then(applyState)");
	await wait(400);
	const china = await inUi("({ search: toAddress('jawline').url, label: document.querySelector('[data-i18n=newTab]').textContent, lang: document.documentElement.lang })");
	check("China mode searches Baidu in Chinese", china.search === "https://www.baidu.com/s?wd=jawline" && china.label === "新标签页" && china.lang === "zh-CN", JSON.stringify(china));
	await inUi("void createTab({ url: 'mog://newtab/' })");
	await wait(1800);
	await shoot("mog-china.png");
	await inUi("window.mog.invoke('ui:settings', { chinaMode: false }).then(applyState)");
	await wait(300);

	await inUi("void createTab({ url: 'http://127.0.0.1:9/' })");
	await wait(2500);
	const offline = await inUi("({ game: document.querySelectorAll('.failure .smash').length, title: document.querySelector('.failure h1')?.textContent })");
	await inUi("document.querySelector('.smash-target').click(); document.querySelector('.smash-target').click()");
	const score = await inUi("Number(document.querySelector('.smash-score').textContent)");
	check("offline page has the bonesmash clicker", offline.game === 1 && score >= 2, JSON.stringify({ offline, score }));
	await shoot("mog-offline.png");
	await inUi("closeTab(state.active)");
	await wait(700);

	await inUi("void createTab({ url: 'mog://newtab/' }); void createTab({ url: 'mog://settings/' })");
	await wait(600);
	await inUi("state.settings.panicUrl = 'mog://newtab/#cover'; element('reader').click()");
	await wait(500);
	const panic = await inUi("({ tabs: state.tabs.map(tab => tab.url), buttons: document.querySelectorAll('.tab').length, closed: state.closed.length })");
	check("emergency button clears every tab", panic.tabs.length === 1 && panic.tabs[0] === "mog://newtab/#cover" && panic.buttons === 1 && panic.closed === 0, JSON.stringify(panic));

	await inUi("void createTab({ isPrivate: true })");
	await wait(1500);
	check("private tab opens", await inUi("state.active.isPrivate && state.active.view.getAttribute('partition') === 'mog-private'"));
	await shoot("mog-private.png");

	console.log(results.every(Boolean) ? "\nAll checks passed." : `\n${results.filter(isPassing => !isPassing).length} check(s) failed.`);
	server.close();
	app.exit(results.every(Boolean) ? 0 : 1);

}).catch(error => {
	console.error(error);
	app.exit(1);
});
