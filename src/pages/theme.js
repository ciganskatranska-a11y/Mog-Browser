// Shared by the browser window, the home page and the settings page.
const themePresets = [
	{ name: "Blackpill", theme: { background: "#000000", text: "#ededed", accent: "#e6dcc3", hot: "#d21f2b" } },
	{ name: "Void", theme: { background: "#000000", text: "#ffffff", accent: "#ffffff", hot: "#ff2d2d" } },
	{ name: "Bloodmaxx", theme: { background: "#0c0102", text: "#f3e9e9", accent: "#ff4b55", hot: "#ffb000" } },
	{ name: "Gigachad gold", theme: { background: "#06070b", text: "#ececec", accent: "#d9b44a", hot: "#e0483c" } },
	{ name: "Copium", theme: { background: "#03110b", text: "#e4f2ea", accent: "#6ff0a8", hot: "#ff5d73" } },
	{ name: "Midnight mog", theme: { background: "#090c18", text: "#e6e9f5", accent: "#8ab4ff", hot: "#ff5c8a" } },
	{ name: "Ascended", theme: { background: "#12081f", text: "#f0e9fa", accent: "#c79bff", hot: "#ff4fa3" } },
	{ name: "Steel", theme: { background: "#0d1117", text: "#e6edf3", accent: "#9fb1c4", hot: "#f0603f" } },
	{ name: "Hunter", theme: { background: "#0a0a06", text: "#eeeadd", accent: "#c8d64b", hot: "#e5484d" } },
	{ name: "Bone", theme: { background: "#efe9da", text: "#15130f", accent: "#1c1a15", hot: "#b3141f" } },
	{ name: "Normie light", theme: { background: "#ffffff", text: "#111111", accent: "#111111", hot: "#d21f2b" } },
	{ name: "中国红", theme: { background: "#120303", text: "#fff3e0", accent: "#ffd447", hot: "#ff2d2d" } },
];

const popularSites = [
	["YouTube", "youtube.com"], ["Google", "google.com"], ["Instagram", "instagram.com"], ["TikTok", "tiktok.com"], ["X", "x.com"],
	["Reddit", "reddit.com"], ["Twitch", "twitch.tv"], ["Discord", "discord.com"], ["Kick", "kick.com"], ["Facebook", "facebook.com"],
	["Wikipedia", "wikipedia.org"], ["GitHub", "github.com"], ["Netflix", "netflix.com"], ["Spotify", "spotify.com"], ["Amazon", "amazon.com"],
	["WhatsApp", "web.whatsapp.com"], ["Gmail", "gmail.com"], ["ChatGPT", "chatgpt.com"], ["Claude", "claude.ai"], ["Pinterest", "pinterest.com"],
	["LinkedIn", "linkedin.com"], ["Snapchat", "snapchat.com"], ["Telegram", "web.telegram.org"], ["Roblox", "roblox.com"], ["Steam", "store.steampowered.com"],
	["eBay", "ebay.com"], ["PayPal", "paypal.com"], ["Twitter", "twitter.com"], ["SoundCloud", "soundcloud.com"], ["Yahoo", "yahoo.com"],
	["Bing", "bing.com"], ["DuckDuckGo", "duckduckgo.com"], ["Stack Overflow", "stackoverflow.com"], ["Looksmax.org", "looksmax.org"], ["SlopAlbum", "slopalbum.com"],
	["Google Maps", "maps.google.com"], ["Google Drive", "drive.google.com"], ["Google Translate", "translate.google.com"], ["Outlook", "outlook.com"], ["IMDb", "imdb.com"],
];

const chinaSites = [
	["百度", "baidu.com"], ["哔哩哔哩", "bilibili.com"], ["微博", "weibo.com"], ["知乎", "zhihu.com"], ["抖音", "douyin.com"],
	["淘宝", "taobao.com"], ["小红书", "xiaohongshu.com"], ["腾讯视频", "v.qq.com"], ["京东", "jd.com"], ["网易云音乐", "music.163.com"],
	["爱奇艺", "iqiyi.com"], ["豆瓣", "douban.com"],
];

const mogStrings = {
	en: {
		web: "Web", images: "Images", videos: "Videos", search: "Search", shields: "Shields", booster: "Booster",
		searchHint: "Search {engine} or type a URL", searchEngine: "Search {engine}", secure: "SECURE", notSecure: "NOT SECURE",
		newTab: "New tab", newPrivate: "New private tab", settings: "Settings and themes", boosterSettings: "Booster settings", find: "Find on page",
		screenshot: "Save screenshot", zoomIn: "Zoom in", zoomOut: "Zoom out", fullscreen: "Full screen", devtools: "Developer tools",
		update: "Check for updates", clear: "Clear browsing data", china: "China mode 中文模式", themes: "Themes",
		blocked: "ads and trackers mogged", rating: "Shields rating", customize: "Customize", history: "History", bookmarks: "Bookmarks",
		background: "Background image", choose: "Choose image", remove: "Remove", dim: "Dim background", showClock: "Clock", showStats: "Shields stats", showSites: "Site tiles",
		private: "Private",
	},
	zh: {
		web: "网页", images: "图片", videos: "视频", search: "搜索", shields: "护盾", booster: "增强器",
		searchHint: "用{engine}搜索或输入网址", searchEngine: "用{engine}搜索", secure: "安全", notSecure: "不安全",
		newTab: "新标签页", newPrivate: "新建隐私标签页", settings: "设置和主题", boosterSettings: "增强器设置", find: "在页面中查找",
		screenshot: "保存截图", zoomIn: "放大", zoomOut: "缩小", fullscreen: "全屏", devtools: "开发者工具",
		update: "检查更新", clear: "清除浏览数据", china: "中文模式 China mode", themes: "主题",
		blocked: "个广告和跟踪器已拦截", rating: "护盾等级", customize: "自定义", history: "历史记录", bookmarks: "书签",
		background: "背景图片", choose: "选择图片", remove: "移除", dim: "调暗背景", showClock: "时钟", showStats: "护盾统计", showSites: "网站图标",
		private: "隐私",
	},
};

let mogLanguage = "en";

function t(key, values = {}) {

	const text = mogStrings[mogLanguage][key] ?? mogStrings.en[key] ?? key;
	return text.replace(/\{(\w+)\}/g, (match, name) => values[name] ?? "");

}

function applyMogLanguage(isChinese) {

	mogLanguage = isChinese ? "zh" : "en";
	document.documentElement.lang = isChinese ? "zh-CN" : "en";
	for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = t(node.dataset.i18n);
	for (const node of document.querySelectorAll("[data-i18n-title]")) {
		node.title = t(node.dataset.i18nTitle);
		node.setAttribute("aria-label", node.title);
	}

}

function luminance(color) {

	const red = parseInt(color.slice(1, 3), 16) / 255;
	const green = parseInt(color.slice(3, 5), 16) / 255;
	const blue = parseInt(color.slice(5, 7), 16) / 255;
	return .2126 * red + .7152 * green + .0722 * blue;

}

function applyMogTheme(theme) {

	const style = document.documentElement.style;
	style.setProperty("--bg", theme.background);
	style.setProperty("--text", theme.text);
	style.setProperty("--accent", theme.accent);
	style.setProperty("--hot", theme.hot);
	style.setProperty("--on-accent", luminance(theme.accent) > .45 ? "#000000" : "#ffffff");
	style.setProperty("--on-hot", luminance(theme.hot) > .55 ? "#000000" : "#ffffff");
	style.setProperty("color-scheme", luminance(theme.background) > .5 ? "light" : "dark");

}

function isThemeActive(preset, theme) {
	return Object.keys(preset.theme).every(key => preset.theme[key] === theme[key]);
}

function themeSwatch(preset, onPick) {

	const button = document.createElement("button");
	button.type = "button";
	button.className = "swatch";
	button.title = preset.name;
	button.setAttribute("aria-label", `${preset.name} theme`);
	button.style.background = `linear-gradient(135deg, ${preset.theme.background} 0 50%, ${preset.theme.accent} 50% 82%, ${preset.theme.hot} 82%)`;
	button.addEventListener("click", () => onPick(preset));
	return button;

}
