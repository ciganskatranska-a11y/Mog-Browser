// Preload for every tab. Built into dist/preload-web.js by scripts/build.js.
const { contextBridge, ipcRenderer } = require("electron");

const isInternal = location.protocol === "mog:";

if (isInternal && location.hostname === "booster") {

	const invokable = new Set(["booster:api", "booster:send", "booster:storage", "booster:tabs-send"]);
	const sendable = new Set(["booster:register", "booster:reply"]);
	const receivable = new Set(["booster:deliver", "booster:event", "booster:storage-changed"]);
	contextBridge.exposeInMainWorld("mogBridge", {
		invoke: (channel, ...values) => invokable.has(channel) ? ipcRenderer.invoke(channel, ...values) : Promise.reject(new Error("blocked")),
		send: (channel, ...values) => {
			if (sendable.has(channel)) ipcRenderer.send(channel, ...values);
		},
		on: (channel, handler) => {
			if (receivable.has(channel)) ipcRenderer.on(channel, (event, data) => handler(data));
		},
	});

} else if (isInternal && location.hostname === "newtab") {

	contextBridge.exposeInMainWorld("mogHome", {
		data: () => ipcRenderer.invoke("home:data"),
		stats: () => ipcRenderer.invoke("home:stats"),
		set: patch => ipcRenderer.invoke("home:set", patch),
		zoom: direction => ipcRenderer.invoke("home:zoom", direction),
		site: url => ipcRenderer.invoke("home:site", url),
		weather: (place, unit) => ipcRenderer.invoke("home:weather", place, unit),
		history: () => ipcRenderer.invoke("home:history"),
		onChange: handler => ipcRenderer.on("home:changed", () => handler()),
		background: (bytes, type) => ipcRenderer.invoke("home:background", bytes, type),
	});

} else if (isInternal && location.hostname === "settings") {

	contextBridge.exposeInMainWorld("mogSettings", {
		get: () => ipcRenderer.invoke("settings:get"),
		set: patch => ipcRenderer.invoke("settings:set", patch),
		action: (name, value) => ipcRenderer.invoke("settings:action", name, value),
		background: (bytes, type) => ipcRenderer.invoke("home:background", bytes, type),
	});

} else if (/^https?:$/.test(location.protocol)) {

	(() => {

		const listeners = [];
		const chrome = {
			runtime: {
				sendMessage: message => ipcRenderer.invoke("booster:page-send", message),
				getURL: file => `mog://booster/${file}`,
				onMessage: { addListener: handler => listeners.push(handler) },
			},
		};

		ipcRenderer.on("booster:direct", (event, { id, message }) => {

			let isDone = false;
			let isAsync = false;
			const sendResponse = response => {
				if (isDone) return;
				isDone = true;
				ipcRenderer.send("booster:direct-reply", { id, isHandled: true, response });
			};
			for (const handler of listeners) {
				try {
					if (handler(message, {}, sendResponse) === true) isAsync = true;
				} catch {
					continue;
				}
			}
			if (!isDone && !isAsync) ipcRenderer.send("booster:direct-reply", { id, isHandled: false });

		});

		/*BOOSTER_ENGINE*/

		addEventListener("load", async () => {
			const isOn = await ipcRenderer.invoke("booster:autostart-enabled").catch(() => false);
			if (isOn) chrome.runtime.sendMessage({ target: "worker", type: "autostart" }).catch(() => {});
		}, { once: true });

	})();

}
