const sessions = new Map();

function notifyWorker(message) {
	return chrome.runtime.sendMessage({ target: "worker", ...message }).catch(() => {});
}

async function finishRecording(tabId, session) {

	const blob = await session.engine.stopRecording();
	if (!blob || !blob.size) return;

	const url = URL.createObjectURL(blob);
	const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
	await notifyWorker({ type: "download", url, filename: `blackpill-recording-${stamp}.webm` });
	setTimeout(() => URL.revokeObjectURL(url), 120000);

}

async function stopSession(tabId) {

	const session = sessions.get(tabId);
	if (!session) return;

	sessions.delete(tabId);
	if (session.engine.recorder) await finishRecording(tabId, session);
	session.engine.destroy();
	session.source.disconnect();
	for (const track of session.stream.getTracks()) track.stop();
	await session.context.close().catch(() => {});

}

const handlers = {

	async start({ tabId, streamId, settings, info, sinkId, isGuardEnabled }) {

		const merged = mergeSettings(settings);
		const existing = sessions.get(tabId);
		if (existing) {
			existing.info = info ?? existing.info;
			existing.engine.apply(merged);
			return { ok: true };
		}

		const stream = await navigator.mediaDevices.getUserMedia({
			audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } },
			video: false,
		});
		const context = new AudioContext({ latencyHint: "interactive" });
		if (sinkId) await context.setSinkId(sinkId).catch(() => {});

		const engine = await createEngine(context, merged, {
			moduleUrl: "processors.js",
			isGuardEnabled,
			onGuard: () => notifyWorker({ type: "guarded", tabId }),
		});
		const source = context.createMediaStreamSource(stream);
		source.connect(engine.input);
		if (context.state !== "running") await context.resume();

		sessions.set(tabId, { context, engine, stream, source, info, sinkId: sinkId ?? "" });
		for (const track of stream.getAudioTracks()) {
			track.addEventListener("ended", async () => {
				await stopSession(tabId);
				notifyWorker({ type: "ended", tabId });
			}, { once: true });
		}
		return { ok: true };

	},

	set({ tabId, settings }) {

		const session = sessions.get(tabId);
		if (!session) return { ok: false };

		session.engine.apply(mergeSettings(settings));
		return { ok: true };

	},

	async stop({ tabId }) {

		await stopSession(tabId);
		return { ok: true };

	},

	list() {
		return [...sessions.entries()].map(([tabId, session]) => ({ tabId, settings: session.engine.settings, info: session.info }));
	},

	levels({ tabId, isSpectrum, view }) {
		return sessions.get(tabId)?.engine.report(isSpectrum, view) ?? null;
	},

	compare({ tabId, mode }) {

		const session = sessions.get(tabId);
		if (!session) return { ok: false };

		session.engine.setCompare(mode);
		return { ok: true };

	},

	async record({ tabId }) {

		const session = sessions.get(tabId);
		if (!session) return { ok: false };

		if (session.engine.recorder) {
			await finishRecording(tabId, session);
			return { ok: true, isRecording: false };
		}
		session.engine.startRecording();
		return { ok: true, isRecording: true };

	},

	async sink({ tabId, sinkId }) {

		const session = sessions.get(tabId);
		if (!session) return { ok: false };

		await session.context.setSinkId(sinkId ?? "");
		session.sinkId = sinkId ?? "";
		return { ok: true };

	},

	guard({ isEnabled }) {

		for (const session of sessions.values()) session.engine.setGuardEnabled(isEnabled);
		return { ok: true };

	},

};

setInterval(() => {
	if (!sessions.size) return;
	notifyWorker({ type: "heartbeat", entries: [...sessions.values()].map(session => session.engine.settings) });
}, 15000);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

	if (message?.target !== "offscreen") return;
	const handler = handlers[message.type];
	if (!handler) return;

	Promise.resolve()
		.then(() => handler(message))
		.then(sendResponse, error => sendResponse({ error: error?.message ?? String(error) }));
	return true;

});
