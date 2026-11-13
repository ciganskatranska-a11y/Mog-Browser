// Runs a private Tor client for Tor tabs.
// Tor comes from the Tor Expert Bundle shipped with the app (scripts/fetch-tor.js) or from an installed Tor Browser.
// It tries a direct connection first and, if that stalls, works through the built-in bridges on its own
// (obfs4, Snowflake, meek, ...). The bridge that worked is tried first next time.
const { spawn } = require("child_process");
const { EventEmitter } = require("events");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");

const exe = process.platform === "win32" ? "tor.exe" : "tor";
const bridgeOrder = ["obfs4", "snowflake", "meek-azure", "meek", "webtunnel", "conjure"];
const stallLimit = { direct: 30000, bridge: 75000 };
const names = { direct: "a direct connection", obfs4: "obfs4 bridges", snowflake: "Snowflake", "meek-azure": "meek (Azure)", meek: "meek", webtunnel: "WebTunnel bridges", conjure: "Conjure" };

const exists = file => {
	try {
		return fs.statSync(file).isFile();
	} catch {
		return false;
	}
};

function candidates(bundled) {

	const homes = [path.join(os.homedir(), "Desktop"), path.join(os.homedir(), "OneDrive", "Desktop"), process.env.LOCALAPPDATA, process.env.ProgramFiles, process.env["ProgramFiles(x86)"], os.homedir()].filter(Boolean);
	return [
		path.join(bundled, "tor", exe),
		...homes.map(home => path.join(home, "Tor Browser", "Browser", "TorBrowser", "Tor", exe)),
	];

}

// Works out where tor, its pluggable transports and geoip files are. Tor runs with its working directory one level above
// tor.exe, so transport paths stay relative and never contain the spaces that ClientTransportPlugin can't handle.
function locate(bundled) {

	const torPath = candidates(bundled).find(exists);
	if (!torPath) return null;
	const torDir = path.dirname(torPath);
	const cwd = path.dirname(torDir);
	const ptDir = ["pluggable_transports", "PluggableTransports"].map(name => path.join(torDir, name)).find(dir => exists(path.join(dir, "pt_config.json")));
	const geoip = [path.join(cwd, "data"), path.join(cwd, "Data", "Tor")].find(dir => exists(path.join(dir, "geoip")));
	return { cwd, torPath, ptDir, geoip, isTorBrowser: torPath.includes(`${path.sep}TorBrowser${path.sep}`) };

}

function readTransports(found) {

	if (!found.ptDir) return { plugins: [], bridges: {} };
	let config = {};
	try {
		config = JSON.parse(fs.readFileSync(path.join(found.ptDir, "pt_config.json"), "utf8"));
	} catch {
		return { plugins: [], bridges: {} };
	}
	const relative = path.relative(found.cwd, found.ptDir) + path.sep;
	const plugins = [];
	for (const line of Object.values(config.pluggableTransports ?? {})) {
		let text = String(line).replace(/^ClientTransportPlugin\s+/, "").replaceAll("${pt_path}", relative);
		const program = /\bexec\s+(\S+)/.exec(text)?.[1];
		if (!program) continue;
		if (!exists(path.join(found.cwd, program)) && exists(path.join(found.cwd, `${program}.exe`))) text = text.replace(program, `${program}.exe`);
		else if (!exists(path.join(found.cwd, program))) continue;
		plugins.push({ line: text, kinds: text.split(/\s+/)[0].split(",") });
	}
	const bridges = {};
	for (const [kind, lines] of Object.entries(config.bridges ?? {})) {
		const usable = (Array.isArray(lines) ? lines : []).filter(bridge => plugins.some(plugin => plugin.kinds.includes(String(bridge).split(/\s+/)[0])));
		if (usable.length) bridges[kind] = usable;
	}
	return { plugins, bridges };

}

const freePort = () => new Promise((resolve, reject) => {
	const server = net.createServer();
	server.once("error", reject);
	server.listen(0, "127.0.0.1", () => {
		const { port } = server.address();
		server.close(() => resolve(port));
	});
});

class Tor extends EventEmitter {

	constructor({ bundled, dataDir, preferred }) {

		super();
		this.bundled = bundled;
		this.dataDir = dataDir;
		this.preferred = preferred || "";
		this.state = { status: "off", progress: 0, summary: "", route: "", port: 0 };
		this.child = null;
		this.generation = 0;
		this.stages = [];
		this.stallTimer = 0;

	}

	set(next) {

		this.state = { ...this.state, ...next };
		this.emit("state", this.state);

	}

	start() {

		if (this.state.status === "starting" || this.state.status === "ready") return this.state;
		const found = locate(this.bundled);
		if (!found) {
			this.set({ status: "missing", progress: 0, route: "", summary: "Tor isn't installed. Run the Mog Browser installer again and tick Install Tor, or install Tor Browser." });
			return this.state;
		}
		this.found = found;
		this.transports = readTransports(found);
		const bridgeKinds = [...bridgeOrder.filter(kind => this.transports.bridges[kind]), ...Object.keys(this.transports.bridges).filter(kind => !bridgeOrder.includes(kind))];
		this.stages = ["direct", ...bridgeKinds];
		if (this.stages.includes(this.preferred)) this.stages = [this.preferred, ...this.stages.filter(stage => stage !== this.preferred)];
		this.set({ status: "starting", progress: 0, route: "", summary: "Starting Tor" });
		this.next();
		return this.state;

	}

	async next() {

		this.kill();
		const stage = this.stages.shift();
		if (!stage) {
			this.set({ status: "error", progress: 0, route: "", summary: "Tor couldn't connect, not even through bridges. Check your connection and try again." });
			return;
		}
		const generation = ++this.generation;
		let port = 0;
		try {
			port = await freePort();
			await fs.promises.mkdir(this.dataDir, { recursive: true });
			const lines = [
				`SocksPort 127.0.0.1:${port}`,
				"ClientOnly 1",
				"AvoidDiskWrites 1",
				"Log notice stdout",
			];
			if (stage !== "direct") {
				lines.push("UseBridges 1");
				for (const plugin of this.transports.plugins) lines.push(`ClientTransportPlugin ${plugin.line}`);
				for (const bridge of this.transports.bridges[stage]) lines.push(`Bridge ${bridge}`);
			}
			const torrc = path.join(this.dataDir, "torrc");
			await fs.promises.writeFile(torrc, `${lines.join("\n")}\n`);
			if (generation !== this.generation) return;

			const args = ["-f", torrc, "--DataDirectory", this.dataDir, "--__OwningControllerProcess", String(process.pid)];
			if (this.found.geoip) args.push("--GeoIPFile", path.join(this.found.geoip, "geoip"), "--GeoIPv6File", path.join(this.found.geoip, "geoip6"));
			this.child = spawn(this.found.torPath, args, { cwd: this.found.cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
		} catch (error) {
			if (generation !== this.generation) return;
			console.error("Tor didn't start:", error.message);
			return this.next();
		}

		const tried = stage === "direct" ? "Connecting to Tor directly" : `Connecting to Tor through ${names[stage] ?? stage}`;
		this.set({ status: "starting", progress: 0, route: stage, port, summary: tried });
		this.armStall(generation, stage);

		let buffer = "";
		this.child.stdout.on("data", chunk => {
			if (generation !== this.generation) return;
			buffer += chunk.toString();
			const rows = buffer.split(/\r?\n/);
			buffer = rows.pop();
			for (const row of rows) this.read(row, generation, stage);
		});
		this.child.stderr.on("data", () => {});
		this.child.once("error", error => {
			if (generation !== this.generation) return;
			console.error("Tor failed:", error.message);
			this.next();
		});
		this.child.once("exit", code => {
			if (generation !== this.generation) return;
			this.child = null;
			if (this.state.status === "ready") this.set({ status: "error", progress: 0, summary: `Tor stopped (exit code ${code}). Open a new Tor tab to reconnect.` });
			else this.next();
		});

	}

	read(row, generation, stage) {

		const progress = /Bootstrapped (\d+)%[^:]*:\s*(.*)$/.exec(row);
		if (!progress) return;
		const percent = Number(progress[1]);
		if (percent >= 100) {
			clearTimeout(this.stallTimer);
			this.preferred = stage;
			this.set({ status: "ready", progress: 100, summary: stage === "direct" ? "Connected to Tor" : `Connected to Tor through ${names[stage] ?? stage}` });
			this.emit("connected", stage);
			return;
		}
		if (percent > this.state.progress || this.state.route !== stage) this.armStall(generation, stage);
		const route = stage === "direct" ? "" : ` via ${names[stage] ?? stage}`;
		this.set({ progress: percent, summary: `${progress[2].trim() || "Connecting"}${route}` });

	}

	armStall(generation, stage) {

		clearTimeout(this.stallTimer);
		this.stallTimer = setTimeout(() => {
			if (generation === this.generation && this.state.status === "starting") this.next();
		}, stage === "direct" ? stallLimit.direct : stallLimit.bridge);

	}

	kill() {

		clearTimeout(this.stallTimer);
		this.generation++;
		const child = this.child;
		this.child = null;
		if (child && child.exitCode === null) child.kill();

	}

	stop() {

		this.kill();
		this.set({ status: "off", progress: 0, route: "", port: 0, summary: "" });

	}

}

module.exports = { Tor, routeName: stage => names[stage] ?? stage };
