// Maps the chrome.* extension APIs the Blackpill Booster uses onto Mog Browser's bridge.
(() => {

	const bridge = window.mogBridge;
	if (!bridge) return;

	const listeners = {};
	const event = name => ({
		addListener: handler => (listeners[name] ??= []).push(handler),
		removeListener: handler => {
			listeners[name] = (listeners[name] ?? []).filter(item => item !== handler);
		},
		hasListener: handler => (listeners[name] ?? []).includes(handler),
	});
	const fire = (name, ...values) => {
		for (const handler of listeners[name] ?? []) {
			try {
				handler(...values);
			} catch (error) {
				console.error(error);
			}
		}
	};
	const api = (name, data) => bridge.invoke("booster:api", name, data);

	bridge.on("booster:deliver", ({ id, message, sender }) => {

		let isDone = false;
		let isAsync = false;
		const sendResponse = response => {
			if (isDone) return;
			isDone = true;
			bridge.send("booster:reply", { id, isHandled: true, response });
		};
		for (const handler of listeners["runtime.onMessage"] ?? []) {
			try {
				if (handler(message, sender, sendResponse) === true) isAsync = true;
			} catch (error) {
				console.error(error);
			}
		}
		if (!isDone && !isAsync) bridge.send("booster:reply", { id, isHandled: false });

	});

	bridge.on("booster:event", ({ name, values }) => fire(name, ...values));
	bridge.on("booster:storage-changed", ({ area, changes }) => fire("storage.onChanged", changes, area));

	const storageArea = area => ({
		get: keys => bridge.invoke("booster:storage", area, "get", keys ?? null),
		set: items => bridge.invoke("booster:storage", area, "set", items),
		remove: keys => bridge.invoke("booster:storage", area, "remove", keys),
		clear: () => bridge.invoke("booster:storage", area, "clear"),
	});

	globalThis.importScripts = () => {};

	globalThis.chrome = {
		runtime: {
			id: "mog-browser-booster",
			lastError: undefined,
			sendMessage: message => bridge.invoke("booster:send", message),
			onMessage: event("runtime.onMessage"),
			onInstalled: event("runtime.onInstalled"),
			onStartup: event("runtime.onStartup"),
			getURL: path => `mog://booster/${String(path).replace(/^\//, "")}`,
			getContexts: async () => [],
			openOptionsPage: () => api("tabs.create", { url: "mog://booster/options.html" }),
		},
		storage: {
			local: storageArea("local"),
			sync: storageArea("sync"),
			session: storageArea("session"),
			onChanged: event("storage.onChanged"),
		},
		tabs: {
			sendMessage: (tabId, message) => bridge.invoke("booster:tabs-send", tabId, message),
			query: info => api("tabs.query", info ?? {}),
			get: tabId => api("tabs.get", { tabId }),
			update: (tabId, properties) => api("tabs.update", { tabId, properties }),
			create: properties => api("tabs.create", properties),
			onRemoved: event("tabs.onRemoved"),
			onUpdated: event("tabs.onUpdated"),
		},
		windows: {
			get: async () => ({ id: 1, state: "normal" }),
			update: async () => ({ id: 1, state: "normal" }),
			create: properties => api("tabs.create", { url: properties?.url }),
		},
		scripting: {
			executeScript: ({ target, func, args, files }) => api("scripting.executeScript", { tabId: target?.tabId, func: func ? func.toString() : null, args: args ?? [], files: files ?? null }),
			getRegisteredContentScripts: async () => (await api("autostart.get")) ? [{ id: "autostart" }] : [],
			registerContentScripts: () => api("autostart.set", true),
			unregisterContentScripts: () => api("autostart.set", false),
		},
		permissions: {
			contains: async () => true,
			request: async () => true,
			remove: async () => true,
			onAdded: event("permissions.onAdded"),
			onRemoved: event("permissions.onRemoved"),
		},
		action: {
			setBadgeText: details => api("action.badge", { tabId: details.tabId, text: details.text }),
			setBadgeBackgroundColor: details => api("action.badge", { tabId: details.tabId, color: details.color }),
			setBadgeTextColor: async () => {},
		},
		contextMenus: {
			create: (properties, callback) => callback?.(),
			removeAll: async () => {},
			onClicked: event("contextMenus.onClicked"),
		},
		commands: {
			getAll: () => api("commands.getAll"),
			onCommand: event("commands.onCommand"),
		},
		downloads: {
			download: details => api("downloads.download", details),
		},
	};

	bridge.send("booster:register");
	if (location.pathname === "/background.html") addEventListener("load", () => fire("runtime.onStartup"));

})();
