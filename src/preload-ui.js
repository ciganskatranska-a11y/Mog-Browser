const { contextBridge, ipcRenderer } = require("electron");

const invokable = new Set(["ui:init", "ui:settings", "ui:shields", "ui:clear-data", "ui:bookmark", "ui:suggest", "ui:update"]);
const sendable = new Set(["ui:tabs", "ui:tab-event", "ui:fullscreen", "ui:devtools", "ui:tab-menu", "ui:screenshot", "ui:update-install"]);
const receivable = new Set(["ui:shortcut", "ui:open", "ui:activate", "ui:badge", "ui:blocked", "ui:toast", "ui:state", "ui:tab-action", "ui:download", "ui:update-state"]);

contextBridge.exposeInMainWorld("mog", {
	invoke: (channel, ...values) => invokable.has(channel) ? ipcRenderer.invoke(channel, ...values) : Promise.reject(new Error("blocked")),
	send: (channel, ...values) => {
		if (sendable.has(channel)) ipcRenderer.send(channel, ...values);
	},
	on: (channel, handler) => {
		if (receivable.has(channel)) ipcRenderer.on(channel, (event, data) => handler(data));
	},
});
