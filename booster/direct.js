(() => {

	if (globalThis.blackpillDirect) return;

	const state = {
		context: null,
		engine: null,
		hooked: new WeakSet(),
		sources: [],
		isActive: false,
		observer: null,
		scanTimer: 0,
		heartbeat: 0,
		armed: null,
	};
	globalThis.blackpillDirect = state;

	const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
	const notifyWorker = message => chrome.runtime.sendMessage({ target: "worker", ...message }).catch(() => {});

	function safety(media) {

		if (media.mediaKeys) return false;
		if (media.srcObject) return true;
		const source = media.currentSrc || media.src;
		if (!source) return null;
		if (/^(blob|data):/i.test(source)) return true;
		if (media.crossOrigin !== null) return true;
		try {
			return new URL(source, location.href).origin === location.origin;
		} catch {
			return false;
		}

	}

	function mediaElements() {
		return [...document.querySelectorAll("video, audio")];
	}

	function hook(media) {

		if (!state.engine || state.hooked.has(media) || safety(media) !== true) return;
		try {
			const source = state.context.createMediaElementSource(media);
			source.connect(state.engine.input);
			state.hooked.add(media);
			state.sources.push(source);
		} catch {
			state.hooked.add(media);
		}

	}

	function onMedia(event) {
		if (event.target instanceof HTMLMediaElement) hook(event.target);
	}

	function scheduleScan() {

		if (state.scanTimer) return;
		state.scanTimer = setTimeout(() => {
			state.scanTimer = 0;
			for (const media of mediaElements()) hook(media);
		}, 400);

	}

	function startHeartbeat() {

		clearInterval(state.heartbeat);
		state.heartbeat = setInterval(() => {
			if (state.isActive) notifyWorker({ type: "heartbeat", entries: [state.engine.settings] });
		}, 15000);

	}

	async function start({ settings, isGuardEnabled }) {

		const merged = mergeSettings(settings);
		if (state.engine) {
			state.engine.setGuardEnabled(isGuardEnabled);
			state.engine.apply(merged);
			state.isActive = true;
			startHeartbeat();
			return { ok: true };
		}

		const media = mediaElements();
		if (!media.length) return { ok: false, reason: "no-media" };
		if (media.some(element => safety(element) === false)) return { ok: false, reason: "protected" };

		const context = new AudioContext({ latencyHint: "interactive" });
		if (context.state !== "running") await Promise.race([context.resume(), wait(500)]);
		if (context.state !== "running") {
			context.close();
			return { ok: false, reason: "autoplay" };
		}

		try {
			state.engine = await createEngine(context, merged, {
				moduleUrl: chrome.runtime.getURL("processors.js"),
				isGuardEnabled,
				onGuard: () => notifyWorker({ type: "guarded" }),
			});
		} catch {
			context.close();
			return { ok: false, reason: "blocked" };
		}

		state.context = context;
		state.isActive = true;
		for (const element of media) hook(element);
		document.addEventListener("play", onMedia, true);
		document.addEventListener("loadedmetadata", onMedia, true);
		state.observer = new MutationObserver(scheduleScan);
		state.observer.observe(document.documentElement, { childList: true, subtree: true });
		startHeartbeat();
		return { ok: true };

	}

	async function download(blob) {

		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
		link.href = url;
		link.download = `blackpill-recording-${stamp}.webm`;
		link.style.display = "none";
		document.documentElement.append(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 120000);

	}

	function disarm() {

		if (!state.armed) return;
		for (const type of ["play", "pointerdown", "keydown"]) document.removeEventListener(type, state.armed, true);
		state.armed = null;

	}

	const handlers = {

		ping() {
			return { ok: true, isActive: state.isActive };
		},

		start,

		set({ settings }) {

			if (!state.engine) return { ok: false };
			state.engine.apply(mergeSettings(settings));
			state.isActive = true;
			return { ok: true };

		},

		async stop() {

			disarm();
			if (!state.engine) return { ok: true };
			if (state.engine.recorder) download(await state.engine.stopRecording());
			state.engine.idle();
			state.isActive = false;
			clearInterval(state.heartbeat);
			return { ok: true };

		},

		levels({ isSpectrum, view }) {
			return state.engine && state.isActive ? state.engine.report(isSpectrum, view) : null;
		},

		compare({ mode }) {

			if (!state.engine) return { ok: false };
			state.engine.setCompare(mode);
			return { ok: true };

		},

		async record() {

			if (!state.engine) return { ok: false };
			if (state.engine.recorder) {
				const blob = await state.engine.stopRecording();
				if (blob?.size) download(blob);
				return { ok: true, isRecording: false };
			}
			state.engine.startRecording();
			return { ok: true, isRecording: true };

		},

		guard({ isEnabled }) {

			state.engine?.setGuardEnabled(isEnabled);
			return { ok: true };

		},

		arm({ settings, isGuardEnabled }) {

			disarm();
			const attempt = async () => {
				const result = await start({ settings, isGuardEnabled });
				if (!result.ok) return;
				disarm();
				notifyWorker({ type: "directStarted", settings: state.engine.settings });
			};
			state.armed = () => {
				attempt();
			};
			for (const type of ["play", "pointerdown", "keydown"]) document.addEventListener(type, state.armed, true);
			attempt();
			return { ok: true };

		},

	};

	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

		if (message?.target !== "direct") return;
		const handler = handlers[message.type];
		if (!handler) return;

		Promise.resolve()
			.then(() => handler(message))
			.then(sendResponse, error => sendResponse({ ok: false, error: error?.message ?? String(error) }));
		return true;

	});

})();
