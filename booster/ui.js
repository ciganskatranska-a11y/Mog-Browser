let controlCounter = 0;

function el(tag, className, text) {

	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;

}

function roundTo(value, step) {

	const decimals = (String(step).split(".")[1] ?? "").length;
	return Number((Math.round(value / step) * step).toFixed(decimals));

}

function sliderScale(spec) {

	if (spec.scale !== "log") {
		return { min: spec.min, max: spec.max, step: spec.step, to: value => value, from: position => position };
	}

	const ratio = Math.log(spec.max / spec.min);
	return {
		min: 0,
		max: 1000,
		step: 1,
		to: value => Math.round(1000 * Math.log(value / spec.min) / ratio),
		from: position => Math.min(spec.max, Math.max(spec.min, roundTo(spec.min * Math.exp(ratio * position / 1000), spec.step))),
	};

}

function paintRange(input, center) {

	const min = Number(input.min);
	const max = Number(input.max);
	const position = (Number(input.value) - min) / (max - min) * 100;
	const origin = center === undefined ? 0 : (center - min) / (max - min) * 100;
	input.style.setProperty("--a", Math.min(position, origin));
	input.style.setProperty("--b", Math.max(position, origin));

}

function applyTheme(prefs) {

	const root = document.documentElement;
	const red = parseInt(prefs.accent.slice(1, 3), 16) / 255;
	const green = parseInt(prefs.accent.slice(3, 5), 16) / 255;
	const blue = parseInt(prefs.accent.slice(5, 7), 16) / 255;
	const luminance = .2126 * red + .7152 * green + .0722 * blue;
	root.style.setProperty("--accent", prefs.accent);
	root.style.setProperty("--hot", prefs.hot);
	root.style.setProperty("--on-accent", luminance > .45 ? "#000000" : "#ffffff");

}

function editValue(spec, button, store) {

	const field = el("input", "value-input");
	field.type = "text";
	field.inputMode = "decimal";
	field.value = store.settings[spec.key];
	field.setAttribute("aria-label", spec.label);
	let isDone = false;

	const finish = shouldSave => {
		if (isDone) return;
		isDone = true;
		const text = field.value.trim().replace("−", "-").replace(",", ".");
		const number = Number.parseFloat(text);
		field.replaceWith(button);
		button.focus();
		if (shouldSave && Number.isFinite(number)) {
			store.change({ [spec.key]: Math.min(spec.max, Math.max(spec.min, number)) });
		}
	};

	field.addEventListener("keydown", event => {
		if (event.key !== "Enter" && event.key !== "Escape") return;
		event.preventDefault();
		finish(event.key === "Enter");
	});
	field.addEventListener("blur", () => finish(true));
	button.replaceWith(field);
	field.focus();
	field.select();

}

function createRange(spec, store) {

	const id = `control-${++controlCounter}`;
	const wrapper = el("div", "control");
	const label = el("label", "", spec.label);
	const value = el("button", "value");
	const input = el("input");
	const scale = sliderScale(spec);
	const center = spec.center === undefined ? undefined : scale.to(spec.center);

	label.htmlFor = id;
	value.type = "button";
	value.title = "Type an exact value";
	input.type = "range";
	input.id = id;
	input.min = scale.min;
	input.max = scale.max;
	input.step = scale.step;
	wrapper.append(label, value, input);

	input.addEventListener("input", () => store.change({ [spec.key]: scale.from(Number(input.value)) }));
	input.addEventListener("dblclick", () => store.change({ [spec.key]: spec.reset ?? defaultSettings()[spec.key] }));
	value.addEventListener("click", () => editValue(spec, value, store));

	return {
		element: wrapper,
		update(settings) {
			const current = settings[spec.key];
			input.value = scale.to(current);
			value.textContent = spec.format(current);
			value.setAttribute("aria-label", `${spec.label}: ${spec.format(current)}. Type an exact value`);
			paintRange(input, center);
		},
	};

}

function createChoice(spec, store) {

	const wrapper = el("div");
	const group = el("div", "segmented");
	group.setAttribute("role", "radiogroup");
	group.setAttribute("aria-label", spec.label ?? spec.key);
	if (spec.label) wrapper.append(el("p", "hint", spec.label));

	const buttons = spec.options.map(([value, text]) => {
		const button = el("button", "", text);
		button.type = "button";
		button.setAttribute("role", "radio");
		button.addEventListener("click", () => store.change({ [spec.key]: value }));
		group.append(button);
		return [value, button];
	});
	wrapper.append(group);

	return {
		element: wrapper,
		update(settings) {
			for (const [value, button] of buttons) button.setAttribute("aria-checked", String(settings[spec.key] === value));
		},
	};

}

function createSwitch(spec, store, isHot) {

	const id = `control-${++controlCounter}`;
	const row = el("div", "switch-row");
	const label = el("label", "", spec.label);
	const toggle = el("label", isHot ? "switch hot" : "switch");
	const input = el("input");

	label.htmlFor = id;
	input.type = "checkbox";
	input.id = id;
	input.setAttribute("role", "switch");
	toggle.append(input, el("span"));
	row.append(label, toggle);
	input.addEventListener("change", () => store.change({ [spec.key]: input.checked }));

	return {
		element: row,
		update(settings) {
			input.checked = settings[spec.key];
		},
	};

}

function createPresetChips(presets, store, extra) {

	const container = el("div", "chips");
	const buttons = Object.values(presets).map(preset => {
		const button = el("button", "", preset.name);
		button.type = "button";
		button.addEventListener("click", () => store.change({ ...preset.patch, ...extra }));
		container.append(button);
		return [preset, button];
	});

	return {
		element: container,
		update(settings) {
			for (const [preset, button] of buttons) button.setAttribute("aria-pressed", String(patchMatches(settings, preset.patch)));
		},
	};

}

function createSection(section, store) {

	const element = el("section", section.isHot ? "group is-hot" : "group");
	const head = el("div", "group-head");
	const text = el("div");
	const body = el("div", "group-body");
	const parts = [];
	let toggleInput = null;

	element.dataset.section = section.id;
	text.append(el("h2", "", section.title));
	if (section.description) text.append(el("p", "", section.description));
	head.append(text);

	if (section.toggle) {
		const toggle = el("label", section.isHot ? "switch hot" : "switch");
		toggleInput = el("input");
		toggleInput.type = "checkbox";
		toggleInput.setAttribute("role", "switch");
		toggleInput.setAttribute("aria-label", section.title);
		toggle.append(toggleInput, el("span"));
		head.append(toggle);
		toggleInput.addEventListener("change", () => store.change({ [section.toggle]: toggleInput.checked }));
	}

	if (section.presets === "smash") parts.push(createPresetChips(smashPresets, store, { distortion: true }));
	if (section.meter) {
		const live = el("p", "live");
		live.dataset.meter = section.meter;
		body.append(live);
	}
	for (const control of section.controls) {
		if (control.type === "range") parts.push(createRange(control, store));
		else if (control.type === "choice") parts.push(createChoice(control, store));
		else parts.push(createSwitch(control, store, section.isHot));
	}
	for (const part of parts) body.append(part.element);
	element.append(head, body);

	return {
		element,
		update(settings) {
			if (toggleInput) {
				toggleInput.checked = settings[section.toggle];
				body.hidden = !settings[section.toggle];
			}
			for (const part of parts) part.update(settings);
		},
	};

}

function createSections(container, list, store) {

	const parts = list.map(section => createSection(section, store));
	for (const part of parts) container.append(part.element);
	return settings => {
		for (const part of parts) part.update(settings);
	};

}

function createEqualizer(container, store) {

	const canvas = el("canvas", "curve");
	const bar = el("div", "eq-bar");
	const select = el("select");
	const flatten = el("button", "ghost", "Normie");
	const bands = el("div", "bands");
	const inputs = [];
	const curve = {
		context: new OfflineAudioContext(1, 128, 48000),
		filters: [],
		dragging: null,
		frequencies: Float32Array.from({ length: 160 }, (_, index) => 20 * 1000 ** (index / 159)),
		magnitude: new Float32Array(160),
		phase: new Float32Array(160),
	};

	canvas.setAttribute("aria-hidden", "true");
	select.setAttribute("aria-label", "Equalizer preset");
	flatten.type = "button";
	for (const [key, preset] of Object.entries(eqPresets)) select.add(new Option(preset.name, key));
	const custom = new Option("Custom", "custom");
	custom.disabled = true;
	select.add(custom);
	bar.append(select, flatten);

	for (const [index, frequency] of eqBands.entries()) {
		const band = el("div", "band");
		const output = el("output");
		const input = el("input");
		const label = el("label", "", frequency >= 1000 ? `${frequency / 1000}k` : String(frequency));

		input.type = "range";
		input.id = `band-${++controlCounter}`;
		input.min = -15;
		input.max = 15;
		input.step = .5;
		input.setAttribute("aria-label", `${frequency} Hz`);
		label.htmlFor = input.id;
		band.append(output, input, label);
		bands.append(band);
		inputs.push([input, output]);

		const setBand = gain => {
			const eq = [...store.settings.eq];
			eq[index] = gain;
			store.change({ eq, preset: "custom" });
		};
		input.addEventListener("input", () => setBand(Number(input.value)));
		input.addEventListener("dblclick", () => setBand(0));
	}

	select.addEventListener("change", () => {
		const preset = eqPresets[select.value];
		if (preset) store.change({ eq: [...preset.gains], preset: select.value });
	});
	flatten.addEventListener("click", () => store.change({ eq: [...eqPresets.flat.gains], preset: "flat" }));
	container.append(canvas, bar, bands, el("p", "hint", "Drag the points on the curve or the sliders. Double-click a slider to reset it."));

	const dragTo = event => {
		const bounds = canvas.getBoundingClientRect();
		const height = bounds.height;
		const scale = (height / 2 - 6) / 24;
		const x = event.clientX - bounds.left;
		const y = event.clientY - bounds.top;
		if (curve.dragging === null) {
			const positions = eqBands.map(frequency => Math.log(frequency / 20) / Math.log(1000) * bounds.width);
			curve.dragging = positions.reduce((best, position, index) => Math.abs(position - x) < Math.abs(positions[best] - x) ? index : best, 0);
		}
		const gain = Math.max(-15, Math.min(15, Math.round((height / 2 - y) / scale * 2) / 2));
		if (store.settings.eq[curve.dragging] === gain) return;
		const eq = [...store.settings.eq];
		eq[curve.dragging] = gain;
		store.change({ eq, preset: "custom" });
	};
	canvas.addEventListener("pointerdown", event => {
		curve.dragging = null;
		canvas.setPointerCapture(event.pointerId);
		dragTo(event);
	});
	canvas.addEventListener("pointermove", event => {
		if (curve.dragging !== null && canvas.hasPointerCapture(event.pointerId)) dragTo(event);
	});
	canvas.addEventListener("pointerup", () => {
		curve.dragging = null;
		draw(store.settings);
	});
	canvas.addEventListener("pointercancel", () => {
		curve.dragging = null;
	});

	const draw = settings => {
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		if (!width) return;

		const ratio = window.devicePixelRatio || 1;
		canvas.width = Math.round(width * ratio);
		canvas.height = Math.round(height * ratio);
		const graphics = canvas.getContext("2d");
		graphics.scale(ratio, ratio);

		const styles = getComputedStyle(document.documentElement);
		const accent = styles.getPropertyValue("--accent").trim();
		const line = styles.getPropertyValue("--line").trim();
		const muted = styles.getPropertyValue("--muted").trim();
		const specs = filterSpecs(settings);
		if (!curve.filters.length) curve.filters = specs.map(spec => new BiquadFilterNode(curve.context, spec));

		const totals = new Float32Array(curve.frequencies.length);
		for (const [index, filter] of curve.filters.entries()) {
			filter.gain.value = specs[index].gain;
			filter.getFrequencyResponse(curve.frequencies, curve.magnitude, curve.phase);
			for (let point = 0; point < totals.length; point++) totals[point] += 20 * Math.log10(curve.magnitude[point]);
		}

		const middle = height / 2;
		const scale = (height / 2 - 6) / 24;
		const toX = frequency => Math.log(frequency / 20) / Math.log(1000) * width;
		const toY = point => middle - Math.max(-24, Math.min(24, totals[point])) * scale;

		graphics.lineWidth = 1;
		graphics.strokeStyle = line;
		graphics.fillStyle = muted;
		graphics.font = "10px Barlow, sans-serif";
		for (const [frequency, text] of [[100, "100"], [1000, "1k"], [10000, "10k"]]) {
			const x = Math.round(toX(frequency)) + .5;
			graphics.beginPath();
			graphics.moveTo(x, 0);
			graphics.lineTo(x, height);
			graphics.stroke();
			graphics.fillText(text, x + 3, height - 4);
		}
		for (const decibels of [-12, 0, 12]) {
			const y = Math.round(middle - decibels * scale) + .5;
			graphics.beginPath();
			graphics.moveTo(0, y);
			graphics.lineTo(width, y);
			graphics.stroke();
		}

		graphics.beginPath();
		for (let point = 0; point < totals.length; point++) {
			if (point === 0) graphics.moveTo(toX(curve.frequencies[point]), toY(point));
			else graphics.lineTo(toX(curve.frequencies[point]), toY(point));
		}
		graphics.lineWidth = 2;
		graphics.strokeStyle = accent;
		graphics.stroke();
		graphics.lineTo(width, middle);
		graphics.lineTo(0, middle);
		graphics.closePath();
		graphics.globalAlpha = .18;
		graphics.fillStyle = accent;
		graphics.fill();
		graphics.globalAlpha = 1;

		for (const [index, frequency] of eqBands.entries()) {
			const isActive = curve.dragging === index;
			graphics.beginPath();
			graphics.arc(toX(frequency), middle - settings.eq[index] * scale, isActive ? 6 : 4, 0, Math.PI * 2);
			graphics.fillStyle = isActive ? accent : styles.getPropertyValue("--track").trim();
			graphics.fill();
			graphics.lineWidth = 2;
			graphics.strokeStyle = accent;
			graphics.stroke();
		}
	};

	return settings => {
		for (const [index, [input, output]] of inputs.entries()) {
			const gain = settings.eq[index];
			input.value = gain;
			output.textContent = gain === 0 ? "0" : `${gain > 0 ? "+" : "−"}${Math.abs(gain)}`;
			paintRange(input, 0);
		}
		select.value = eqPresets[settings.preset] ? settings.preset : "custom";
		draw(settings);
	};

}
