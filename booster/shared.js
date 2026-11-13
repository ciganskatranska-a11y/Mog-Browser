const eqBands = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

const signed = (value, digits) => `${value < 0 ? "−" : "+"}${Math.abs(value).toFixed(digits)}`;

const formats = {
	db: value => `${signed(value, 1)} dB`,
	boost: value => value === 0 ? "Off" : `${signed(value, 1)} dB`,
	percent: value => `${Math.round(value)}%`,
	off: value => value === 0 ? "Off" : `${Math.round(value)}%`,
	hz: value => value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)} kHz` : `${Math.round(value)} Hz`,
	ms: value => value < 10 ? `${value.toFixed(1)} ms` : value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`,
	seconds: value => `${value.toFixed(1)} s`,
	lufs: value => `${value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)} LUFS`,
	semitones: value => value === 0 ? "Natural" : `${signed(value, 0)} semitones`,
	cents: value => value === 0 ? "0" : `${signed(value, 0)} cents`,
	times: value => `${value.toFixed(1)}×`,
};

function defaultSettings() {

	return {
		volume: 100,
		muted: false,
		ultimate: false,
		trim: 0,
		eq: eqBands.map(() => 0),
		preset: "flat",
		bass: 0,
		treble: 0,
		voice: 0,
		lowCut: 20,
		highCut: 20000,
		pitch: 0,
		cents: 0,
		grain: 50,
		pitchMode: "fast",
		formant: 0,
		vocals: "normal",
		balance: 0,
		width: 100,
		center: 0,
		monoBass: false,
		monoBassFreq: 120,
		deesser: false,
		deessFreq: 6000,
		deessThreshold: -30,
		deessAmount: 8,
		npc: false,
		npcFreq: 40,
		npcMix: 100,
		echo: false,
		echoTime: 280,
		echoFeedback: 35,
		echoMix: 35,
		reverb: false,
		reverbSize: 2.5,
		reverbMix: 30,
		distortion: false,
		distType: "soft",
		distDrive: 18,
		distBias: 0,
		distBits: 16,
		distRate: 1,
		distTone: 20000,
		distMix: 100,
		distLevel: 0,
		agc: false,
		agcTarget: -14,
		agcMaxBoost: 18,
		agcSpeed: "medium",
		multiband: false,
		maximizer: 50,
		mbLowPush: 0,
		mbMidPush: 0,
		mbHighPush: 0,
		mbLowFreq: 150,
		mbHighFreq: 3500,
		mbAttack: 5,
		mbRelease: 120,
		clip: false,
		clipDrive: 4,
		clipSoftness: 30,
		clipOversample: true,
		phantom: false,
		phantomAmount: 50,
		phantomFreq: 100,
		exciter: false,
		exciterAmount: 30,
		exciterFreq: 3500,
		exciterDrive: 6,
		punch: false,
		punchAttack: 30,
		punchSustain: 0,
		sub: false,
		subAmount: 50,
		subFreq: 90,
		night: 0,
		limiter: true,
		ceiling: -.3,
		release: 60,
		lookahead: 4,
		truePeak: true,
	};

}

const sections = [
	{
		id: "level",
		panel: "level",
		title: "Level",
		controls: [
			{ type: "range", key: "volume", label: "Volume", min: 0, max: 10000, step: 5, format: formats.percent },
			{ type: "switch", key: "ultimate", label: "ASCEND (raises the volume cap)" },
			{ type: "switch", key: "muted", label: "Ghost (mute)" },
		],
	},
	{
		id: "tone",
		panel: "eq",
		title: "Bone structure",
		description: "Quick tone shaping on top of the equalizer.",
		controls: [
			{ type: "range", key: "bass", label: "Jawline bass", min: 0, max: 20, step: .5, format: formats.boost },
			{ type: "range", key: "treble", label: "Canthal tilt treble", min: 0, max: 15, step: .5, format: formats.boost },
			{ type: "range", key: "voice", label: "Presence-maxx (2.8 kHz, where ears are most sensitive)", min: 0, max: 15, step: .5, format: formats.boost },
		],
	},
	{
		id: "cuts",
		panel: "eq",
		title: "Cut filters",
		description: "Low cut drops bass that small speakers can't play, freeing headroom for more volume.",
		controls: [
			{ type: "range", key: "lowCut", label: "Low cut", min: 20, max: 500, step: 1, scale: "log", format: value => value <= 20 ? "Off" : formats.hz(value) },
			{ type: "range", key: "highCut", label: "High cut", min: 1000, max: 20000, step: 1, scale: "log", format: value => value >= 20000 ? "Off" : formats.hz(value) },
		],
	},
	{
		id: "pitch",
		panel: "voice",
		title: "Pitch",
		controls: [
			{ type: "range", key: "pitch", label: "Pitch", min: -24, max: 24, step: 1, center: 0, format: formats.semitones },
			{ type: "range", key: "cents", label: "Fine pitch", min: -100, max: 100, step: 1, center: 0, format: formats.cents },
			{ type: "choice", key: "pitchMode", label: "Engine", options: [["fast", "Fast (no delay)"], ["hd", "HD (keeps formants)"]] },
			{ type: "range", key: "formant", label: "Formant (HD only, 0 keeps the natural voice)", min: -12, max: 12, step: .5, center: 0, format: value => value === 0 ? "Natural" : `${signed(value, 1)} semitones` },
			{ type: "range", key: "grain", label: "Grain size (Fast only, smaller is tighter)", min: 10, max: 100, step: 1, format: formats.ms },
		],
	},
	{
		id: "vocals",
		panel: "voice",
		title: "Vocals",
		controls: [
			{ type: "choice", key: "vocals", options: [["normal", "Normie"], ["remove", "Delete vocals"], ["focus", "Dialogue-maxx"]] },
		],
	},
	{
		id: "symmetry",
		panel: "voice",
		title: "Symmetry",
		controls: [
			{ type: "range", key: "balance", label: "Symmetry", min: -100, max: 100, step: 1, center: 0, format: value => value === 0 ? "Perfect" : `${value < 0 ? "Left" : "Right"} ${Math.abs(value)}%` },
			{ type: "range", key: "width", label: "Frame width", min: 0, max: 200, step: 1, center: 100, format: value => value === 0 ? "Mono" : `${value}%` },
			{ type: "range", key: "center", label: "Center level (vocals and dialogue)", min: -12, max: 12, step: .5, center: 0, format: formats.db },
			{ type: "switch", key: "monoBass", label: "Bass mono (louder bass on speakers)" },
			{ type: "range", key: "monoBassFreq", label: "Mono below", min: 40, max: 300, step: 1, scale: "log", format: formats.hz },
		],
	},
	{
		id: "deesser",
		panel: "voice",
		title: "Tongue posture",
		toggle: "deesser",
		meter: "deess",
		description: "De-esser. Tames harsh S sounds that get painful at high volume.",
		controls: [
			{ type: "range", key: "deessFreq", label: "Above", min: 2000, max: 12000, step: 1, scale: "log", format: formats.hz },
			{ type: "range", key: "deessThreshold", label: "Threshold", min: -60, max: 0, step: .5, format: formats.db },
			{ type: "range", key: "deessAmount", label: "Max reduction", min: 0, max: 24, step: .5, format: formats.db },
		],
	},
	{
		id: "npc",
		panel: "voice",
		title: "NPC mode",
		toggle: "npc",
		description: "Robot voice from a ring modulator.",
		controls: [
			{ type: "range", key: "npcFreq", label: "Buzz", min: 10, max: 500, step: 1, scale: "log", format: formats.hz },
			{ type: "range", key: "npcMix", label: "Mix", min: 0, max: 100, step: 1, format: formats.percent },
		],
	},
	{
		id: "echo",
		panel: "voice",
		title: "Rent-free",
		toggle: "echo",
		description: "Echo that keeps repeating in your head.",
		controls: [
			{ type: "range", key: "echoTime", label: "Delay", min: 20, max: 1500, step: 5, scale: "log", format: formats.ms },
			{ type: "range", key: "echoFeedback", label: "Repeats", min: 0, max: 95, step: 1, format: formats.percent },
			{ type: "range", key: "echoMix", label: "Mix", min: 0, max: 100, step: 1, format: formats.percent },
		],
	},
	{
		id: "reverb",
		panel: "voice",
		title: "Echo chamber",
		toggle: "reverb",
		description: "Reverb from closet to cathedral.",
		controls: [
			{ type: "range", key: "reverbSize", label: "Size", min: .2, max: 8, step: .1, format: formats.seconds },
			{ type: "range", key: "reverbMix", label: "Mix", min: 0, max: 100, step: 1, format: formats.percent },
		],
	},
	{
		id: "smash",
		panel: "smash",
		title: "BONESMASHING",
		toggle: "distortion",
		isHot: true,
		presets: "smash",
		description: "Hammers, fractures and crushes the sound.",
		controls: [
			{ type: "choice", key: "distType", options: [["soft", "Mew"], ["hard", "Hammer"], ["fuzz", "Rot"], ["fold", "Fracture"], ["square", "Jawline"]] },
			{ type: "range", key: "distDrive", label: "Hammer force", min: 0, max: 60, step: .5, format: formats.db },
			{ type: "range", key: "distBias", label: "Asymmetry", min: -100, max: 100, step: 1, center: 0, format: value => value === 0 ? "Symmetric" : `${signed(value, 0)}%` },
			{ type: "range", key: "distBits", label: "Bone density", min: 1, max: 16, step: 1, format: value => value >= 16 ? "Full" : `${value} bit` },
			{ type: "range", key: "distRate", label: "Crush", min: 1, max: 40, step: 1, format: value => value === 1 ? "Off" : `${value}×` },
			{ type: "range", key: "distTone", label: "Tone", min: 200, max: 20000, step: 1, scale: "log", format: value => value >= 19500 ? "Open" : formats.hz(value) },
			{ type: "range", key: "distMix", label: "Mix", min: 0, max: 100, step: 1, format: formats.percent },
			{ type: "range", key: "distLevel", label: "Output", min: -36, max: 12, step: .5, center: 0, format: formats.db },
		],
	},
	{
		id: "agc",
		panel: "loud",
		title: "Auto-mog",
		toggle: "agc",
		meter: "agc",
		description: "Rides the gain so every video hits the same loudness.",
		controls: [
			{ type: "range", key: "agcTarget", label: "Target loudness", min: -30, max: -6, step: .5, format: formats.lufs },
			{ type: "range", key: "agcMaxBoost", label: "Max boost", min: 0, max: 30, step: .5, format: formats.db },
			{ type: "choice", key: "agcSpeed", label: "Speed", options: [["slow", "Slow"], ["medium", "Medium"], ["fast", "Fast"]] },
		],
	},
	{
		id: "multiband",
		panel: "loud",
		title: "Gigamog",
		toggle: "multiband",
		meter: "bands",
		description: "3-band maximizer. Squeezes lows, mids and highs separately for more loudness with less pumping.",
		controls: [
			{ type: "range", key: "maximizer", label: "Strength", min: 0, max: 100, step: 1, format: formats.percent },
			{ type: "range", key: "mbLowPush", label: "Low push", min: -12, max: 12, step: .5, center: 0, format: formats.db },
			{ type: "range", key: "mbMidPush", label: "Mid push", min: -12, max: 12, step: .5, center: 0, format: formats.db },
			{ type: "range", key: "mbHighPush", label: "High push", min: -12, max: 12, step: .5, center: 0, format: formats.db },
			{ type: "range", key: "mbLowFreq", label: "Low/mid split", min: 40, max: 800, step: 1, scale: "log", format: formats.hz },
			{ type: "range", key: "mbHighFreq", label: "Mid/high split", min: 1000, max: 10000, step: 1, scale: "log", format: formats.hz },
			{ type: "range", key: "mbAttack", label: "Attack", min: .1, max: 100, step: .1, scale: "log", format: formats.ms },
			{ type: "range", key: "mbRelease", label: "Release", min: 10, max: 1000, step: 1, scale: "log", format: formats.ms },
		],
	},
	{
		id: "clip",
		panel: "loud",
		title: "Clip-maxx",
		toggle: "clip",
		meter: "clip",
		description: "Shaves peaks before the limiter. The mastering trick for extra loudness.",
		controls: [
			{ type: "range", key: "clipDrive", label: "Clip drive", min: 0, max: 24, step: .5, format: formats.db },
			{ type: "range", key: "clipSoftness", label: "Softness", min: 0, max: 100, step: 1, format: value => value === 0 ? "Hard" : `${value}%` },
			{ type: "switch", key: "clipOversample", label: "4× oversampling (cleaner clipping)" },
		],
	},
	{
		id: "punch",
		panel: "loud",
		title: "Punch-maxx",
		toggle: "punch",
		description: "Transient shaper. Makes hits snap harder or tightens the tail.",
		controls: [
			{ type: "range", key: "punchAttack", label: "Attack", min: -100, max: 100, step: 1, center: 0, format: value => `${signed(value, 0)}%` },
			{ type: "range", key: "punchSustain", label: "Sustain", min: -100, max: 100, step: 1, center: 0, format: value => `${signed(value, 0)}%` },
		],
	},
	{
		id: "phantom",
		panel: "loud",
		title: "Phantom bass",
		toggle: "phantom",
		description: "Adds harmonics so you hear bass even on speakers that can't play it.",
		controls: [
			{ type: "range", key: "phantomAmount", label: "Amount", min: 0, max: 100, step: 1, format: formats.percent },
			{ type: "range", key: "phantomFreq", label: "Bass below", min: 40, max: 250, step: 1, scale: "log", format: formats.hz },
		],
	},
	{
		id: "sub",
		panel: "loud",
		title: "Jaw drop",
		toggle: "sub",
		description: "Sub-octave synth. Adds bass one octave below what's playing.",
		controls: [
			{ type: "range", key: "subAmount", label: "Amount", min: 0, max: 100, step: 1, format: formats.percent },
			{ type: "range", key: "subFreq", label: "Tracks bass below", min: 50, max: 200, step: 1, scale: "log", format: formats.hz },
		],
	},
	{
		id: "exciter",
		panel: "loud",
		title: "Hunter eyes",
		toggle: "exciter",
		description: "Exciter that adds bite and clarity to the highs.",
		controls: [
			{ type: "range", key: "exciterAmount", label: "Amount", min: 0, max: 100, step: 1, format: formats.percent },
			{ type: "range", key: "exciterFreq", label: "Above", min: 1000, max: 10000, step: 1, scale: "log", format: formats.hz },
			{ type: "range", key: "exciterDrive", label: "Drive", min: 1, max: 20, step: .5, format: formats.times },
		],
	},
	{
		id: "copium",
		panel: "loud",
		title: "Copium",
		description: "Evens out loud and quiet parts, and trims the input.",
		controls: [
			{ type: "range", key: "night", label: "Copium dose", min: 0, max: 100, step: 1, format: formats.off },
			{ type: "range", key: "trim", label: "Input trim", min: -24, max: 24, step: .5, center: 0, format: formats.db },
		],
	},
	{
		id: "limiter",
		panel: "loud",
		title: "Cope limiter",
		toggle: "limiter",
		description: "Off means it's over: audio clips at full scale.",
		controls: [
			{ type: "range", key: "ceiling", label: "Height ceiling", min: -12, max: 0, step: .1, format: formats.db },
			{ type: "range", key: "release", label: "Recovery", min: 5, max: 500, step: 1, scale: "log", format: formats.ms },
			{ type: "range", key: "lookahead", label: "Lookahead", min: 1, max: 10, step: .5, format: formats.ms },
			{ type: "switch", key: "truePeak", label: "True peak (catches peaks between samples)" },
		],
	},
];

const eqPresets = {
	flat: { name: "Normie (flat)", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
	bass: { name: "Jawline bass", gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
	bassExtreme: { name: "Gigamog bass", gains: [12, 11, 8, 4, 0, -1, -1, 0, 0, 0] },
	treble: { name: "Canthal tilt", gains: [0, 0, 0, 0, 0, 1, 3, 5, 6, 7] },
	presence: { name: "Presence-maxx", gains: [0, 0, 0, 0, 1, 2, 5, 6, 3, 0] },
	vocal: { name: "Voice-maxx", gains: [-3, -3, -1, 1, 3, 4, 4, 2, 0, -1] },
	podcast: { name: "Podcast-maxx", gains: [-8, -6, -2, 0, 2, 4, 5, 3, 0, -2] },
	loudness: { name: "Loudmaxx contour", gains: [7, 5, 2, 0, -1, 0, 0, 1, 4, 6] },
	rock: { name: "Rock", gains: [5, 4, 2, -1, -2, -1, 2, 4, 5, 5] },
	pop: { name: "Pop", gains: [-1, 1, 3, 4, 3, 0, -1, -1, 1, 2] },
	electronic: { name: "Electronic", gains: [6, 5, 1, 0, -2, 1, 0, 2, 5, 6] },
	hipHop: { name: "Hip-hop", gains: [7, 6, 2, 3, -1, -1, 1, 0, 2, 3] },
	jazz: { name: "Jazz", gains: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3] },
	classical: { name: "Classical", gains: [4, 3, 2, 1, -1, -1, 0, 2, 3, 4] },
	smallSpeakers: { name: "Phone speaker cope", gains: [-8, -4, 4, 5, 2, 0, 1, 2, 1, 0] },
	deep: { name: "Doomer", gains: [5, 4, 2, 1, 0, -1, -2, -3, -4, -5] },
};

const smashPresets = {
	warm: { name: "Light tap", patch: { distType: "soft", distDrive: 12, distBias: 0, distBits: 16, distRate: 1, distTone: 12000, distMix: 60, distLevel: 0 } },
	crunch: { name: "Crunch", patch: { distType: "hard", distDrive: 24, distBias: 0, distBits: 16, distRate: 1, distTone: 9000, distMix: 100, distLevel: -3 } },
	shattered: { name: "Shattered", patch: { distType: "fuzz", distDrive: 40, distBias: 0, distBits: 10, distRate: 2, distTone: 5000, distMix: 100, distLevel: 0 } },
	blown: { name: "Blown speaker", patch: { distType: "fuzz", distDrive: 50, distBias: 45, distBits: 16, distRate: 1, distTone: 2500, distMix: 100, distLevel: 0 } },
	destroy: { name: "Full smash", patch: { distType: "square", distDrive: 60, distBias: 0, distBits: 3, distRate: 6, distTone: 20000, distMix: 100, distLevel: 0 } },
};

const voiceReset = { pitch: 0, cents: 0, pitchMode: "fast", formant: 0, npc: false, echo: false, reverb: false, lowCut: 20, highCut: 20000 };

const voicePresets = {
	natural: { name: "Normie", patch: { ...voiceReset } },
	gigachad: { name: "Gigachad", patch: { ...voiceReset, pitchMode: "hd", pitch: -4, formant: -1, reverb: true, reverbSize: 1.2, reverbMix: 15 } },
	demon: { name: "Demon", patch: { ...voiceReset, pitchMode: "hd", pitch: -9, formant: -6, reverb: true, reverbSize: 3.5, reverbMix: 30 } },
	helium: { name: "Helium cope", patch: { ...voiceReset, pitch: 9 } },
	npc: { name: "NPC", patch: { ...voiceReset, npc: true, npcFreq: 45, npcMix: 100 } },
	radio: { name: "Radio", patch: { ...voiceReset, lowCut: 450, highCut: 3200 } },
	chamber: { name: "Echo chamber", patch: { ...voiceReset, reverb: true, reverbSize: 5, reverbMix: 45 } },
	arena: { name: "Arena", patch: { ...voiceReset, echo: true, echoTime: 320, echoFeedback: 30, echoMix: 30, reverb: true, reverbSize: 2.5, reverbMix: 25 } },
};

const builtInStacks = [
	{ id: "builtin:normie", name: "Normie", description: "Clean. No processing at 100%.", patch: {} },
	{ id: "builtin:mewing", name: "Mewing", description: "Subtle lift with steady loudness.", patch: { volume: 150, agc: true, agcTarget: -16, bass: 3 } },
	{ id: "builtin:looksmaxxed", name: "Looksmaxxed", description: "Balanced loud. Clean and punchy.", patch: { volume: 250, agc: true, agcTarget: -14, multiband: true, maximizer: 45, clip: true, clipDrive: 3, phantom: true, phantomAmount: 40, exciter: true, exciterAmount: 20 } },
	{ id: "builtin:gigachad", name: "Gigachad", description: "Max clean loudness. The full mastering chain.", patch: { ultimate: true, volume: 800, agc: true, agcTarget: -12, multiband: true, maximizer: 75, clip: true, clipDrive: 6, clipSoftness: 30, punch: true, punchAttack: 25, phantom: true, phantomAmount: 60, exciter: true, exciterAmount: 30, monoBass: true, eq: [...eqPresets.loudness.gains], preset: "loudness", ceiling: -.1 } },
	{ id: "builtin:phone", name: "Phone speaker cope", description: "For laptop and phone speakers.", patch: { volume: 400, lowCut: 150, phantom: true, phantomAmount: 80, phantomFreq: 120, exciter: true, exciterAmount: 35, multiband: true, maximizer: 60, clip: true, clipDrive: 4, voice: 4, monoBass: true, agc: true, agcTarget: -12 } },
	{ id: "builtin:podcast", name: "Podcast-maxx", description: "Voices loud and clear.", patch: { volume: 200, vocals: "focus", voice: 6, agc: true, agcTarget: -12, multiband: true, maximizer: 40, night: 30, lowCut: 80, deesser: true } },
	{ id: "builtin:jawline", name: "Jawline", description: "Bass that mogs.", patch: { volume: 300, eq: [...eqPresets.bassExtreme.gains], preset: "bassExtreme", bass: 10, phantom: true, phantomAmount: 70, sub: true, subAmount: 50, monoBass: true, multiband: true, maximizer: 50 } },
	{ id: "builtin:copium", name: "Copium night", description: "Quiet but clear late at night.", patch: { volume: 120, night: 70, agc: true, agcTarget: -20, lowCut: 60 } },
	{ id: "builtin:bonesmashed", name: "Bonesmashed", description: "Crunchy distortion, still listenable.", patch: { volume: 300, distortion: true, ...smashPresets.crunch.patch, multiband: true, maximizer: 40 } },
	{ id: "builtin:over", name: "It's over", description: "Everything maxed, no limiter. Speakers beware.", patch: { ultimate: true, volume: 5000, limiter: false, distortion: true, ...smashPresets.destroy.patch, clip: true, clipDrive: 24, clipSoftness: 0, multiband: true, maximizer: 100, bass: 20, sub: true, subAmount: 100, punch: true, punchAttack: 100, eq: [...eqPresets.bassExtreme.gains], preset: "bassExtreme" } },
];

const secretStacks = [
	{ id: "builtin:mogger", name: "Mogger", description: "Clean and brutal. Every loudness trick tuned hard.", unlock: { stat: "boostedMs", value: 600000, text: "Mog any tab for 10 minutes" }, patch: { ultimate: true, volume: 1200, agc: true, agcTarget: -10, multiband: true, maximizer: 85, clip: true, clipDrive: 8, punch: true, punchAttack: 40, sub: true, subAmount: 40, phantom: true, phantomAmount: 50, exciter: true, exciterAmount: 35, monoBass: true, ceiling: -.1 } },
	{ id: "builtin:apex", name: "Apex", description: "The final form. Loudest clean stack there is.", unlock: { stat: "ascendedMs", value: 1800000, text: "Stay ascended for 30 minutes" }, patch: { ultimate: true, volume: 3000, agc: true, agcTarget: -8, multiband: true, maximizer: 95, mbLowPush: 3, clip: true, clipDrive: 12, clipSoftness: 20, punch: true, punchAttack: 60, sub: true, subAmount: 70, phantom: true, phantomAmount: 70, exciter: true, exciterAmount: 45, monoBass: true, eq: [...eqPresets.loudness.gains], preset: "loudness", ceiling: -.1 } },
	{ id: "builtin:skull", name: "Skull shatter", description: "Folded, crushed and unlimited.", unlock: { stat: "smashedMs", value: 600000, text: "BONESMASH for 10 minutes" }, patch: { ultimate: true, volume: 2500, limiter: false, distortion: true, distType: "fold", distDrive: 50, distBias: 30, distBits: 6, distRate: 3, distTone: 20000, distMix: 100, distLevel: 0, sub: true, subAmount: 100, punch: true, punchAttack: 100, clip: true, clipDrive: 18, clipSoftness: 0 } },
];

const allBuiltInStacks = [...builtInStacks, ...secretStacks];

const codeKeys = [
	"volume", "muted", "ultimate", "trim", "eq", "preset", "bass", "treble", "voice", "lowCut", "highCut",
	"pitch", "cents", "grain", "vocals", "balance", "width", "npc", "npcFreq", "npcMix",
	"echo", "echoTime", "echoFeedback", "echoMix", "reverb", "reverbSize", "reverbMix",
	"distortion", "distType", "distDrive", "distBias", "distBits", "distRate", "distTone", "distMix", "distLevel",
	"agc", "agcTarget", "agcMaxBoost", "agcSpeed",
	"multiband", "maximizer", "mbLowPush", "mbMidPush", "mbHighPush", "mbLowFreq", "mbHighFreq", "mbAttack", "mbRelease",
	"clip", "clipDrive", "clipSoftness", "clipOversample", "phantom", "phantomAmount", "phantomFreq",
	"exciter", "exciterAmount", "exciterFreq", "exciterDrive", "night", "limiter", "ceiling", "release", "lookahead", "truePeak",
	"pitchMode", "formant", "center", "monoBass", "monoBassFreq", "deesser", "deessFreq", "deessThreshold", "deessAmount",
	"punch", "punchAttack", "punchSustain", "sub", "subAmount", "subFreq",
];

const codePrefix = "BP3-";

const maxxEverything = { agc: true, agcTarget: -12, multiband: true, maximizer: 70, clip: true, clipDrive: 6, clipSoftness: 30, clipOversample: true, punch: true, punchAttack: 25, phantom: true, phantomAmount: 50, exciter: true, exciterAmount: 25, monoBass: true, limiter: true, ceiling: -.1, truePeak: true };

function defaultPrefs() {

	return {
		newTabs: "last",
		volumeStep: 10,
		normalCap: 600,
		ascendCap: 5000,
		showSpectrum: true,
		showTiers: true,
		accent: "#e6dcc3",
		hot: "#d21f2b",
		engineMode: "auto",
		cpuGuard: true,
		sync: true,
		autoStart: false,
		siteRules: [],
	};

}

const prefLimits = {
	volumeStep: [1, 100],
	normalCap: [100, 2000],
	ascendCap: [600, 10000],
};

const controlIndex = new Map(sections.flatMap(section => section.controls.map(control => [control.key, control])));

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function mergeSettings(saved) {

	const settings = defaultSettings();
	if (!saved || typeof saved !== "object") return settings;

	for (const key of Object.keys(settings)) {
		const value = saved[key];
		if (typeof value !== typeof settings[key] || key === "eq") continue;
		if (typeof value === "number" && !Number.isFinite(value)) continue;
		const control = controlIndex.get(key);
		if (control?.type === "range") settings[key] = clamp(value, control.min, control.max);
		else if (control?.type === "choice") settings[key] = control.options.some(([option]) => option === value) ? value : settings[key];
		else settings[key] = value;
	}

	if (Array.isArray(saved.eq) && saved.eq.length === eqBands.length && saved.eq.every(Number.isFinite)) {
		settings.eq = saved.eq.map(gain => clamp(gain, -15, 15));
	}
	return settings;

}

function mergePrefs(saved) {

	const prefs = defaultPrefs();
	if (!saved || typeof saved !== "object") return prefs;

	for (const key of Object.keys(prefs)) {
		if (typeof saved[key] === typeof prefs[key]) prefs[key] = saved[key];
	}
	for (const [key, [min, max]] of Object.entries(prefLimits)) prefs[key] = clamp(Math.round(prefs[key]), min, max);
	for (const key of ["accent", "hot"]) {
		if (!/^#[0-9a-f]{6}$/i.test(prefs[key])) prefs[key] = defaultPrefs()[key];
	}
	if (!["auto", "direct", "capture"].includes(prefs.engineMode)) prefs.engineMode = "auto";
	prefs.siteRules = Array.isArray(saved.siteRules)
		? saved.siteRules
			.filter(rule => rule && typeof rule.pattern === "string" && typeof rule.stackId === "string")
			.slice(0, 50)
			.map(rule => ({ pattern: rule.pattern.trim().toLowerCase().slice(0, 100), stackId: rule.stackId }))
		: [];
	return prefs;

}

function maxVolume(settings, prefs) {
	return settings.ultimate ? prefs.ascendCap : prefs.normalCap;
}

function isHot(settings) {
	return settings.ultimate || settings.distortion || !settings.limiter;
}

function tierFor(settings) {

	const volume = settings.volume;
	if (settings.muted || volume === 0) return "Ghosted";
	if (volume < 100) return "Sub-5";
	if (volume === 100) return "Normie";
	if (volume <= 200) return "MTN";
	if (volume <= 400) return "HTN";
	if (volume <= 600) return "Chadlite";
	if (volume <= 1500) return "Chad";
	if (volume < 5000) return "Gigachad";
	return "Ascended";

}

function hostOf(url) {

	try {
		const parsed = new URL(url);
		return /^https?:$/.test(parsed.protocol) ? parsed.hostname : "";
	} catch {
		return "";
	}

}

function settingsMatch(first, second) {

	return Object.keys(first).every(key => key === "muted" || JSON.stringify(first[key]) === JSON.stringify(second[key]));

}

function stackSettings(stack) {
	return stack.patch ? mergeSettings({ ...defaultSettings(), ...stack.patch }) : mergeSettings(stack.settings);
}

function findStack(id, userStacks) {
	return allBuiltInStacks.find(stack => stack.id === id) ?? (userStacks ?? []).find(stack => stack.id === id) ?? null;
}

function isUnlocked(stack, stats) {
	return !stack.unlock || (stats?.[stack.unlock.stat] ?? 0) >= stack.unlock.value;
}

function ruleMatches(pattern, host) {

	const clean = String(pattern).trim().toLowerCase();
	if (!clean || !host) return false;
	if (clean.startsWith("*.")) {
		const root = clean.slice(2);
		return host === root || host.endsWith(`.${root}`);
	}
	const expression = clean.split("*").map(part => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
	return new RegExp(`^${expression}$`).test(host);

}

function stackIdForHost(host, prefs) {
	return prefs.siteRules.find(rule => ruleMatches(rule.pattern, host))?.stackId ?? null;
}

function toBase64Url(bytes) {

	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

}

function fromBase64Url(text) {

	const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
	const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
	return Uint8Array.from(binary, character => character.charCodeAt(0));

}

async function encodeShareCode(settings, name) {

	const defaults = defaultSettings();
	const pairs = [];
	for (const [index, key] of codeKeys.entries()) {
		if (key === "muted") continue;
		if (JSON.stringify(settings[key]) !== JSON.stringify(defaults[key])) pairs.push([index, settings[key]]);
	}
	const json = JSON.stringify([String(name ?? "").slice(0, 40), pairs]);
	const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("deflate-raw"));
	return codePrefix + toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()));

}

async function decodeShareCode(code) {

	const clean = String(code ?? "").replace(/\s+/g, "");
	if (!clean.startsWith(codePrefix) || clean.length > 6000) throw new Error("That isn't a Blackpill share code.");

	let parsed;
	try {
		const stream = new Blob([fromBase64Url(clean.slice(codePrefix.length))]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
		const text = await new Response(stream).text();
		if (text.length > 40000) throw new Error("too large");
		parsed = JSON.parse(text);
	} catch {
		throw new Error("That share code is damaged or incomplete.");
	}
	if (!Array.isArray(parsed) || !Array.isArray(parsed[1])) throw new Error("That share code is damaged or incomplete.");

	const patch = {};
	for (const pair of parsed[1]) {
		if (!Array.isArray(pair)) continue;
		const key = codeKeys[pair[0]];
		if (key) patch[key] = pair[1];
	}
	return { name: typeof parsed[0] === "string" ? parsed[0].slice(0, 40) : "", settings: mergeSettings({ ...defaultSettings(), ...patch }) };

}

function patchMatches(settings, patch) {

	return Object.entries(patch).every(([key, value]) => {
		if (Array.isArray(value)) return value.every((item, index) => settings[key]?.[index] === item);
		return settings[key] === value;
	});

}

function filterSpecs(settings) {

	const specs = eqBands.map((frequency, index) => ({
		type: index === 0 ? "lowshelf" : index === eqBands.length - 1 ? "highshelf" : "peaking",
		frequency,
		Q: 1.4,
		gain: settings.eq[index],
	}));
	specs.push({ type: "lowshelf", frequency: 90, Q: 1, gain: settings.bass });
	specs.push({ type: "highshelf", frequency: 6500, Q: 1, gain: settings.treble });
	specs.push({ type: "peaking", frequency: 2800, Q: .9, gain: settings.voice });
	return specs;

}
