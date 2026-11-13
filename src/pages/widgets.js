// Every kind of widget the home page can show. newtab.js places them, this file fills them in.
// A type has a starting size, the options the user can change, and render(body, context), which may return a cleanup function.
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

const mogLines = [
	"Mog the trackers. Ascend the web.",
	"It's never over.",
	"Lock in.",
	"Discipline is the real looksmax.",
	"Sleep eight hours. That's the hack.",
	"Stand up straight. Drink water.",
	"Stop scrolling. Start building.",
	"One more rep.",
	"Nobody is coming to do it for you.",
	"Small wins, every day.",
	"Touch grass, then get back to work.",
	"Comparison is the thief of gains.",
];

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

function iconButton(name, label, onClick) {

	const button = el("button", "mini");
	button.type = "button";
	button.title = label;
	button.setAttribute("aria-label", label);
	button.append(icon(name));
	button.addEventListener("click", onClick);
	return button;

}

function hostOf(url) {

	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return "";
	}

}

// A site's icon, swapped for its first letter when the site has none.
function siteIcon(source, title) {

	const image = el("img", "site-icon");
	const fallback = () => image.isConnected && image.replaceWith(el("i", "site-icon", [...(title || "?")][0].toUpperCase()));
	image.alt = "";
	image.src = source;
	image.addEventListener("error", fallback, { once: true });
	image.addEventListener("load", () => {
		if (image.naturalWidth < 8) fallback();
	}, { once: true });
	setTimeout(() => {
		if (!image.complete || !image.naturalWidth) fallback();
	}, 2500);
	return image;

}

function linkList(items, emptyText) {

	if (!items.length) return el("p", "empty", emptyText);
	const list = el("ul", "links");
	for (const item of items) {
		const row = el("li");
		const link = el("a");
		link.href = item.url;
		link.title = item.url;
		link.append(siteIcon(`https://${hostOf(item.url)}/favicon.ico`, item.title), el("span", "", item.title || hostOf(item.url)));
		row.append(link);
		list.append(row);
	}
	return list;

}

function heading(text) {
	return text ? el("h2", "widget-title", text) : "";
}

function clockTime(seconds) {

	const total = Math.max(0, Math.round(seconds));
	const pad = value => String(value).padStart(2, "0");
	return total >= 3600 ? `${Math.floor(total / 3600)}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}` : `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;

}

function beep() {

	try {
		const audio = new AudioContext();
		const gain = audio.createGain();
		gain.connect(audio.destination);
		for (const [index, pitch] of [660, 880, 1100].entries()) {
			const tone = audio.createOscillator();
			tone.frequency.value = pitch;
			tone.connect(gain);
			tone.start(audio.currentTime + index * .18);
			tone.stop(audio.currentTime + index * .18 + .14);
		}
		gain.gain.value = .12;
		setTimeout(() => audio.close(), 1200);
	} catch {
		return;
	}

}

// Music player for the audio a website widget found on its site.
function createPlayer(tracks, fallbackCover, context) {

	const box = el("div", "player");
	const audio = new Audio();
	const cover = el("img", "player-cover");
	const title = el("strong", "player-title");
	const artist = el("span", "player-artist");
	const seek = el("input", "player-seek");
	const time = el("span", "player-time", "00:00");
	const play = iconButton("play", "Play", () => audio.paused ? audio.play().catch(() => {}) : audio.pause());
	const list = el("ol", "player-list");
	let index = 0;

	const load = (next, isPlaying) => {
		index = (next + tracks.length) % tracks.length;
		const track = tracks[index];
		audio.src = track.url;
		title.textContent = track.title;
		artist.textContent = track.artist;
		cover.src = track.cover || fallbackCover || "";
		cover.hidden = !(track.cover || fallbackCover);
		seek.value = 0;
		time.textContent = "00:00";
		for (const [position, row] of [...list.children].entries()) row.classList.toggle("is-current", position === index);
		if (isPlaying) audio.play().catch(() => {});
	};

	audio.preload = "none";
	cover.alt = "";
	cover.addEventListener("error", () => {
		cover.hidden = true;
	});
	seek.type = "range";
	seek.min = 0;
	seek.max = 1000;
	seek.value = 0;
	seek.setAttribute("aria-label", "Position");
	seek.addEventListener("input", () => {
		if (audio.duration) audio.currentTime = seek.value / 1000 * audio.duration;
	});
	audio.addEventListener("timeupdate", () => {
		if (audio.duration && document.activeElement !== seek) seek.value = audio.currentTime / audio.duration * 1000;
		time.textContent = clockTime(audio.currentTime);
	});
	audio.addEventListener("ended", () => load(index + 1, true));
	audio.addEventListener("error", () => {
		if (audio.src) time.textContent = "Can't play";
	});
	for (const [type, name] of [["play", "pause"], ["pause", "play"]]) {
		audio.addEventListener(type, () => {
			play.replaceChildren(icon(name));
			box.classList.toggle("is-playing", type === "play");
			context.busy(type === "play");
		});
	}

	for (const [position, track] of tracks.entries()) {
		const row = el("li");
		const button = el("button", "", track.title);
		button.type = "button";
		button.addEventListener("click", () => load(position, true));
		row.append(button);
		list.append(row);
	}

	const text = el("div", "player-text");
	const buttons = el("div", "player-buttons");
	const bar = el("div", "player-bar");
	const now = el("div", "player-now");
	text.append(title, artist);
	buttons.append(iconButton("prev", "Previous", () => load(index - 1, !audio.paused)), play, iconButton("next", "Next", () => load(index + 1, !audio.paused)));
	bar.append(seek, time);
	now.append(cover, text, buttons);
	box.append(now, bar);
	if (tracks.length > 1) box.append(list);
	load(0, false);
	box.stop = () => {
		audio.pause();
		audio.removeAttribute("src");
		context.busy(false);
	};
	return box;

}

const widgetTypes = {

	title: {
		name: "Mog logo",
		hint: "The pill and your word, with the opening animation.",
		w: 220,
		minW: 90,
		isSingle: true,
		options: [
			{ key: "text", label: "Word", type: "text", value: "MOG", max: 24 },
			{ key: "showPill", label: "Pill", type: "toggle", value: true },
			{ key: "isAnimated", label: "Opening animation", type: "toggle", value: true },
		],
		render(body, { options }) {
			const text = (options.text.trim() || "MOG").slice(0, 24);
			const wrap = el("div", options.isAnimated ? "mog-title is-animated" : "mog-title");
			const word = el("h1");
			const letters = [...text];
			wrap.style.setProperty("--n", Math.max(3, letters.length));
			word.setAttribute("aria-label", text);
			for (const [index, letter] of letters.entries()) {
				const span = el("span", "letter", letter === " " ? " " : letter);
				span.style.setProperty("--i", index);
				span.setAttribute("aria-hidden", "true");
				word.append(span);
			}
			if (options.showPill) {
				const pill = el("img", "pill-logo");
				const ring = el("i", "pill-ring");
				pill.src = "mog://booster/icons/icon128.png";
				pill.alt = "";
				wrap.append(ring, pill);
			}
			wrap.append(word, el("i", "flag-line"));
			body.append(wrap);
		},
	},

	search: {
		name: "Search",
		hint: "Search the web with your search engine.",
		w: 680,
		minW: 220,
		isSingle: true,
		options: [],
		render(body, { home }) {
			const form = el("form", "search");
			const input = el("input");
			input.name = "q";
			input.type = "text";
			input.autocomplete = "off";
			input.placeholder = t("searchEngine", { engine: home.search.name });
			input.setAttribute("aria-label", t("search"));
			form.id = "search";
			form.append(icon("search"), input);
			form.addEventListener("submit", event => {
				event.preventDefault();
				const text = input.value.trim();
				form.classList.remove("is-firing");
				void form.offsetWidth;
				form.classList.add("is-firing");
				if (text) location.href = home.search.web.replace("%s", encodeURIComponent(text));
			});
			body.append(form);
		},
	},

	sites: {
		name: "Site tiles",
		hint: "Your favourite sites as a grid of tiles.",
		w: 653,
		minW: 230,
		isSingle: true,
		options: [
			{ key: "columns", label: "Tiles per row", type: "select", value: "6", choices: ["3", "4", "5", "6", "7", "8"] },
			{ key: "showNames", label: "Names", type: "toggle", value: true },
		],
		render(body, { options }) {
			body.append(buildSites(options));
		},
	},

	clock: {
		name: "Clock",
		hint: "The time and today's date.",
		w: 210,
		minW: 110,
		options: [
			{ key: "showSeconds", label: "Seconds", type: "toggle", value: false },
			{ key: "isTwelveHour", label: "12-hour time", type: "toggle", value: false },
			{ key: "showDate", label: "Date", type: "toggle", value: true },
		],
		render(body, { options, home, everySecond }) {
			const time = el("strong", "clock-time");
			const date = el("span", "caption");
			const wrap = el("div", "clock");
			wrap.style.setProperty("--n", options.showSeconds ? 8 : 5);
			wrap.append(time);
			if (options.showDate) wrap.append(date);
			body.append(wrap);
			return everySecond(() => {
				const now = new Date();
				const locale = home.data.settings.chinaMode ? "zh-CN" : [];
				const text = now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: options.showSeconds ? "2-digit" : undefined, hour12: options.isTwelveHour }).replace(/\s?[AP]M$/i, "");
				if (time.dataset.value !== text) {
					const previous = time.dataset.value ?? "";
					time.dataset.value = text;
					time.replaceChildren(...[...text].map((character, index) => el("span", previous && previous[index] !== character ? "digit is-rolling" : "digit", character)));
				}
				date.textContent = now.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" });
			});
		},
	},

	stats: {
		name: "Shields stats",
		hint: "How many ads and trackers got mogged, and your rating.",
		w: 340,
		minW: 150,
		options: [
			{ key: "showRating", label: "Shields rating", type: "toggle", value: true },
		],
		render(body, { options, home }) {
			const wrap = el("div", "stats");
			const blocked = el("strong", "stat-number", home.shownTotal.toLocaleString());
			const first = el("div", "stat");
			first.append(blocked, el("span", "caption", t("blocked")));
			wrap.append(first);
			const view = { blocked };
			if (options.showRating) {
				const second = el("div", "stat");
				const meter = el("div", "meter");
				view.tier = el("strong", "stat-number");
				view.next = el("span", "caption");
				view.bar = el("i");
				meter.append(view.bar);
				second.append(view.tier, view.next, meter);
				wrap.append(second);
			}
			body.append(wrap);
			home.statViews.add(view);
			renderTier(view, home.shownTotal);
			return () => home.statViews.delete(view);
		},
	},

	notes: {
		name: "Notes",
		hint: "A sticky note that saves as you type.",
		w: 280,
		h: 190,
		minW: 160,
		minH: 100,
		options: [
			{ key: "title", label: "Title", type: "text", value: "Notes", max: 40 },
		],
		render(body, { options, update }) {
			const area = el("textarea", "notes-text");
			let timer = 0;
			area.maxLength = 4000;
			area.spellcheck = false;
			area.placeholder = t("notesHint");
			area.setAttribute("aria-label", options.title || t("notes"));
			area.value = options.text ?? "";
			area.addEventListener("input", () => {
				clearTimeout(timer);
				timer = setTimeout(() => update({ text: area.value }), 300);
			});
			body.append(heading(options.title), area);
		},
	},

	todo: {
		name: "To-do list",
		hint: "Tasks you can tick off.",
		w: 280,
		h: 240,
		minW: 180,
		minH: 120,
		options: [
			{ key: "title", label: "Title", type: "text", value: "To do", max: 40 },
			{ key: "hideDone", label: "Hide finished tasks", type: "toggle", value: false },
		],
		render(body, { options, update }) {
			const items = Array.isArray(options.items) ? options.items.filter(item => typeof item?.text === "string").slice(0, 60) : [];
			const list = el("ul", "todo");
			const form = el("form", "todo-add");
			const input = el("input");
			const save = () => update({ items });
			const draw = () => list.replaceChildren(...items.map((item, index) => {
				const row = el("li", item.isDone ? "is-done" : "");
				const label = el("label");
				const box = el("input");
				box.type = "checkbox";
				box.checked = Boolean(item.isDone);
				box.addEventListener("change", () => {
					item.isDone = box.checked;
					save();
					draw();
				});
				label.append(box, el("span", "", item.text));
				row.hidden = options.hideDone && Boolean(item.isDone);
				row.append(label, iconButton("close", `${t("remove")} ${item.text}`, () => {
					items.splice(index, 1);
					save();
					draw();
				}));
				return row;
			}));
			input.type = "text";
			input.maxLength = 120;
			input.placeholder = "Add a task";
			input.setAttribute("aria-label", "Add a task");
			form.append(input);
			form.addEventListener("submit", event => {
				event.preventDefault();
				const text = input.value.trim();
				if (!text || items.length >= 60) return;
				items.push({ text, isDone: false });
				input.value = "";
				save();
				draw();
			});
			draw();
			body.append(heading(options.title), list, form);
		},
	},

	site: {
		name: "Website",
		hint: "A card that sums up any site: what it's about, what's on it, its music, latest posts, links and search.",
		w: 340,
		h: 440,
		minW: 220,
		minH: 120,
		options: [
			{ key: "url", label: "Site address", type: "text", value: "", max: 500, placeholder: "slopalbum.com" },
			{ key: "showHeader", label: "Name and icon", type: "toggle", value: true },
			{ key: "showAbout", label: "Description", type: "toggle", value: true },
			{ key: "showSummary", label: "Summary of the site", type: "toggle", value: true },
			{ key: "showPicture", label: "Picture", type: "toggle", value: true },
			{ key: "showPlayer", label: "Music player", type: "toggle", value: true },
			{ key: "showPosts", label: "Latest posts", type: "toggle", value: true },
			{ key: "showLinks", label: "Links", type: "toggle", value: true },
			{ key: "showSearch", label: "Search this site", type: "toggle", value: false },
			{ key: "refresh", label: "Read the site again", type: "button", run: context => context.setData(null) },
		],
		render(body, context) {

			const { options, widget, home } = context;
			const address = options.url.trim();
			const info = widget.data;
			const card = el("div", "site-card");
			body.append(card);

			const askForSite = message => {
				const form = el("form", "inline");
				const input = el("input");
				const button = el("button", "", t("add"));
				input.type = "text";
				input.value = address;
				input.placeholder = "slopalbum.com";
				input.setAttribute("aria-label", "Site address");
				form.append(input, button);
				form.addEventListener("submit", event => {
					event.preventDefault();
					if (!input.value.trim()) return input.focus();
					widget.data = null;
					context.update({ url: input.value.trim() });
					context.rerender();
				});
				card.append(el("p", "empty", message), form);
			};
			const load = async () => {
				const next = await window.mogHome.site(address).catch(() => null);
				context.setData({ ...(next ?? { error: "Couldn't read that site." }), source: address, at: Date.now() });
			};

			if (!address) return askForSite("Type a site and this card fills itself in with what the site has.");
			if (!info || info.source !== address || (!info.error && info.version !== 2)) {
				card.append(el("p", "empty is-loading", `Reading ${hostOf(/^https?:/i.test(address) ? address : `https://${address}`) || address}…`));
				load();
				return undefined;
			}
			if (info.error) return askForSite(info.error);
			if (Date.now() - info.at > 6 * 60 * 60 * 1000 && !context.isBusy()) setTimeout(() => context.isBusy() || load(), 1500);

			const tracks = Array.isArray(info.tracks) ? info.tracks : [];
			const hasPlayer = options.showPlayer && tracks.length > 0;
			let player = null;

			if (options.showHeader) {
				const head = el("a", "site-head");
				const names = el("span", "site-names");
				head.href = info.url;
				names.append(el("strong", "", info.title), el("small", "", info.host));
				head.append(siteIcon(info.icon, info.title), names);
				card.append(head);
			}
			if (options.showAbout && info.description) card.append(el("p", "site-about", info.description));
			if (options.showSummary) {
				const facts = [
					tracks.length ? `${tracks.length} ${tracks.length === 1 ? "song" : "songs"} to play` : "",
					info.posts?.length ? `${info.posts.length} recent ${info.posts.length === 1 ? "post" : "posts"}` : "",
					info.links?.length ? `${info.links.length} ${info.links.length === 1 ? "page" : "pages"} linked` : "",
					info.search ? "has its own search" : "",
				].filter(Boolean);
				const isRepeat = options.showAbout && info.description && (info.summary ?? "").toLowerCase().startsWith(info.description.toLowerCase().slice(0, 60));
				const points = Array.isArray(info.headings) ? info.headings.filter(text => text.toLowerCase() !== info.title.toLowerCase()).slice(0, 6) : [];
				if (info.note) card.append(el("p", "site-about", info.note));
				if ((info.summary && !isRepeat) || points.length || facts.length) {
					const summary = el("div", "site-summary");
					summary.append(el("h3", "", "Summary"));
					if (info.summary && !isRepeat) summary.append(el("p", "", info.summary));
					if (points.length) {
						const list = el("ul", "site-points");
						for (const point of points) list.append(el("li", "", point));
						summary.append(list);
					}
					if (facts.length) summary.append(el("p", "site-facts", facts.join(" · ")));
					card.append(summary);
				}
			}
			if (options.showPicture && info.image && !hasPlayer) {
				const link = el("a", "site-picture");
				const picture = el("img");
				picture.alt = "";
				picture.src = info.image;
				picture.addEventListener("error", () => link.remove());
				link.href = info.url;
				link.append(picture);
				card.append(link);
			}
			if (hasPlayer) {
				player = createPlayer(tracks, options.showPicture ? info.image : "", context);
				card.append(player);
			}
			if (options.showPosts && info.posts?.length) {
				const list = el("ul", "site-posts");
				for (const post of info.posts) {
					const row = el("li");
					const link = el("a", "", post.title);
					link.href = post.url;
					row.append(link);
					list.append(row);
				}
				card.append(el("h3", "", "Latest"), list);
			}
			if (options.showLinks && info.links?.length) {
				const chips = el("div", "site-links");
				for (const item of info.links) {
					const link = el("a", "", item.title);
					link.href = item.url;
					chips.append(link);
				}
				card.append(chips);
			}
			if (options.showSearch) {
				const form = el("form", "inline");
				const input = el("input");
				input.type = "text";
				input.placeholder = `Search ${info.host}`;
				input.setAttribute("aria-label", `Search ${info.host}`);
				form.append(input);
				form.addEventListener("submit", event => {
					event.preventDefault();
					const text = input.value.trim();
					if (!text) return;
					location.href = info.search ? info.search.replace("%s", encodeURIComponent(text)) : home.search.web.replace("%s", encodeURIComponent(`site:${info.host} ${text}`));
				});
				card.append(form);
			}
			if (!card.children.length) card.append(el("p", "empty", "Everything in this card is switched off. Open its settings to pick what to show."));
			return () => player?.stop();

		},
	},

	timer: {
		name: "Focus timer",
		hint: "Count down a work session, with a chime at the end.",
		w: 240,
		minW: 150,
		options: [
			{ key: "title", label: "Title", type: "text", value: "Lock in", max: 40 },
			{ key: "minutes", label: "Minutes", type: "number", value: 25, min: 1, max: 600 },
		],
		render(body, { options, everySecond }) {
			const length = Math.max(1, Math.min(600, Number(options.minutes) || 25)) * 60;
			const wrap = el("div", "timer");
			const time = el("strong", "timer-time", clockTime(length));
			const start = el("button", "chip", "Start");
			const reset = el("button", "chip is-quiet", "Reset");
			const meter = el("div", "meter");
			const bar = el("i");
			const buttons = el("div", "chips");
			let endsAt = 0;
			let left = length;
			const draw = () => {
				time.textContent = clockTime(left);
				bar.style.transform = `scaleX(${1 - left / length})`;
				start.textContent = endsAt ? "Pause" : left < length && left > 0 ? "Resume" : "Start";
			};
			start.type = "button";
			reset.type = "button";
			start.addEventListener("click", () => {
				if (left <= 0) left = length;
				endsAt = endsAt ? 0 : Date.now() + left * 1000;
				wrap.classList.remove("is-done");
				draw();
			});
			reset.addEventListener("click", () => {
				endsAt = 0;
				left = length;
				wrap.classList.remove("is-done");
				draw();
			});
			meter.append(bar);
			buttons.append(start, reset);
			wrap.append(heading(options.title), time, meter, buttons);
			body.append(wrap);
			draw();
			return everySecond(() => {
				if (!endsAt) return;
				left = Math.max(0, (endsAt - Date.now()) / 1000);
				if (left <= 0) {
					endsAt = 0;
					wrap.classList.add("is-done");
					beep();
				}
				draw();
			});
		},
	},

	countdown: {
		name: "Countdown",
		hint: "Days left until a date you pick.",
		w: 260,
		minW: 150,
		options: [
			{ key: "title", label: "What for", type: "text", value: "The big day", max: 40 },
			{ key: "date", label: "Date", type: "date", value: "" },
		],
		render(body, { options, everySecond }) {
			const wrap = el("div", "countdown");
			const number = el("strong", "stat-number");
			const caption = el("span", "caption");
			wrap.append(heading(options.title), number, caption);
			body.append(wrap);
			return everySecond(() => {
				const target = new Date(`${options.date}T00:00:00`);
				if (!options.date || Number.isNaN(target.getTime())) {
					number.textContent = "—";
					caption.textContent = "Pick a date in this widget's settings";
					return;
				}
				const hours = (target - Date.now()) / 3600000;
				const days = hours > 0 ? Math.ceil(hours / 24) : Math.floor(-hours / 24);
				number.textContent = hours > 0 && hours < 24 ? `${Math.ceil(hours)}h` : String(Math.max(0, days));
				caption.textContent = hours > 0 && hours < 24 ? "hours left" : hours <= 0 && hours > -24 ? "It's today" : `${days === 1 ? "day" : "days"} ${hours > 0 ? "to go" : "ago"} · ${target.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}`;
			});
		},
	},

	calendar: {
		name: "Calendar",
		hint: "This month at a glance.",
		w: 280,
		minW: 200,
		options: [
			{ key: "isMondayFirst", label: "Week starts on Monday", type: "toggle", value: true },
		],
		render(body, { options, home }) {
			const wrap = el("div", "calendar");
			const title = el("strong", "calendar-title");
			const grid = el("div", "calendar-grid");
			const locale = home.data.settings.chinaMode ? "zh-CN" : [];
			const today = new Date();
			let shown = new Date(today.getFullYear(), today.getMonth(), 1);
			const draw = () => {
				const offset = (shown.getDay() - (options.isMondayFirst ? 1 : 0) + 7) % 7;
				const count = new Date(shown.getFullYear(), shown.getMonth() + 1, 0).getDate();
				const cells = [];
				for (let index = 0; index < 7; index++) cells.push(el("b", "", new Date(2024, 0, index + (options.isMondayFirst ? 1 : 7)).toLocaleDateString(locale, { weekday: "narrow" })));
				for (let index = 0; index < offset; index++) cells.push(el("span"));
				for (let day = 1; day <= count; day++) {
					const isToday = day === today.getDate() && shown.getMonth() === today.getMonth() && shown.getFullYear() === today.getFullYear();
					cells.push(el("span", isToday ? "is-today" : "", String(day)));
				}
				title.textContent = shown.toLocaleDateString(locale, { month: "long", year: "numeric" });
				grid.replaceChildren(...cells);
			};
			const step = direction => () => {
				shown = new Date(shown.getFullYear(), shown.getMonth() + direction, 1);
				draw();
			};
			const head = el("div", "calendar-head");
			head.append(iconButton("prev", "Previous month", step(-1)), title, iconButton("next", "Next month", step(1)));
			wrap.append(head, grid);
			body.append(wrap);
			draw();
		},
	},

	quote: {
		name: "Motto",
		hint: "A line to keep you locked in. Write your own or let it rotate.",
		w: 420,
		minW: 160,
		options: [
			{ key: "text", label: "Your own line", type: "text", value: "", max: 140, placeholder: "Leave empty to rotate" },
		],
		render(body, { options }) {
			const line = el("button", "quote");
			let index = Math.floor(Math.random() * mogLines.length);
			const draw = () => {
				line.textContent = options.text.trim() || mogLines[index];
			};
			line.type = "button";
			line.addEventListener("click", () => {
				index = (index + 1) % mogLines.length;
				line.classList.remove("is-swapping");
				void line.offsetWidth;
				line.classList.add("is-swapping");
				draw();
			});
			draw();
			body.append(line);
		},
	},

	bookmarks: {
		name: "Bookmarks",
		hint: "Your saved pages as a list.",
		w: 260,
		h: 240,
		minW: 160,
		minH: 100,
		options: [
			{ key: "title", label: "Title", type: "text", value: "Bookmarks", max: 40 },
		],
		render(body, { options, home }) {
			body.append(heading(options.title), linkList(home.data.bookmarks, "No bookmarks yet. Press Ctrl+D on a page to save it."));
		},
	},

	history: {
		name: "Recently visited",
		hint: "Jump back to the pages you just had open.",
		w: 280,
		h: 240,
		minW: 160,
		minH: 100,
		options: [
			{ key: "title", label: "Title", type: "text", value: "Recently visited", max: 40 },
		],
		render(body, { options }) {
			const holder = el("div", "fill");
			body.append(heading(options.title), holder);
			window.mogHome.history().catch(() => []).then(items => holder.replaceChildren(linkList(items, "Pages you visit show up here.")));
		},
	},

	weather: {
		name: "Weather",
		hint: "Now and the next days for a city you type in.",
		w: 300,
		minW: 200,
		options: [
			{ key: "place", label: "City", type: "text", value: "", max: 80, placeholder: "Bratislava" },
			{ key: "unit", label: "Degrees", type: "select", value: "c", choices: ["c", "f"], names: { c: "Celsius", f: "Fahrenheit" } },
			{ key: "showDays", label: "Next days", type: "toggle", value: true },
		],
		render(body, context) {

			const { options, widget } = context;
			const place = options.place.trim();
			const source = `${place}|${options.unit}`;
			const report = widget.data;
			const wrap = el("div", "weather");
			body.append(wrap);

			const askForCity = message => {
				const form = el("form", "inline");
				const input = el("input");
				const button = el("button", "", t("add"));
				input.type = "text";
				input.value = place;
				input.placeholder = "Bratislava";
				input.setAttribute("aria-label", "City");
				form.append(input, button);
				form.addEventListener("submit", event => {
					event.preventDefault();
					if (!input.value.trim()) return input.focus();
					widget.data = null;
					context.update({ place: input.value.trim() });
					context.rerender();
				});
				wrap.append(el("p", "empty", message), form);
			};
			const load = async () => {
				const next = await window.mogHome.weather(place, options.unit).catch(() => null);
				context.setData({ ...(next ?? { error: "Couldn't load the weather." }), source, at: Date.now() });
			};

			if (!place) return askForCity("Type a city. The forecast comes from Open-Meteo.");
			if (!report || report.source !== source) {
				wrap.append(el("p", "empty is-loading", `Checking the sky over ${place}…`));
				load();
				return;
			}
			if (report.error) return askForCity(report.error);
			if (Date.now() - report.at > 30 * 60 * 1000) setTimeout(load, 1500);

			const now = el("div", "weather-now");
			const text = el("div", "weather-text");
			text.append(el("span", "", report.sky), el("span", "caption", `${report.place} · ${report.wind} ${report.unit === "f" ? "mph" : "km/h"}`));
			now.append(el("strong", "stat-number", `${report.temperature}°`), text);
			wrap.append(now);
			if (options.showDays && Array.isArray(report.days)) {
				const days = el("div", "weather-days");
				for (const day of report.days.slice(1)) {
					const cell = el("div");
					cell.title = day.sky;
					cell.append(el("b", "", new Date(`${day.date}T12:00:00`).toLocaleDateString([], { weekday: "short" })), el("span", "", `${day.high}°`), el("small", "", `${day.low}°`));
					days.append(cell);
				}
				wrap.append(days);
			}

		},
	},

};
