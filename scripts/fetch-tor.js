// Downloads the Tor Expert Bundle (tor.exe, pluggable transports and the built-in bridge list) into vendor/tor.
// electron-builder ships that folder as resources/tor, which Tor tabs use.
//   node scripts/fetch-tor.js             skip if vendor/tor already has Tor, warn on failure
//   node scripts/fetch-tor.js --force     download again
//   node scripts/fetch-tor.js --required  fail the build if Tor can't be fetched (used by dist and release)
// Set TOR_VERSION to pin a Tor Browser release instead of the newest one.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const vendor = path.join(root, "vendor");
const target = path.join(vendor, "tor");
const isRequired = process.argv.includes("--required");
const isForced = process.argv.includes("--force");

async function get(url) {

	const response = await fetch(url);
	if (!response.ok) throw new Error(`${url} answered ${response.status}`);
	return response;

}

async function main() {

	if (!isForced && fs.existsSync(path.join(target, "tor", "tor.exe"))) {
		console.log("Tor is already in vendor/tor. Use --force to download it again.");
		return;
	}

	const version = process.env.TOR_VERSION || (await (await get("https://aus1.torproject.org/torbrowser/update_3/release/downloads.json")).json()).version;
	if (!/^\d+(\.\d+)+$/.test(version ?? "")) throw new Error(`Unexpected Tor Browser version "${version}"`);
	const name = `tor-expert-bundle-windows-x86_64-${version}.tar.gz`;
	const base = `https://dist.torproject.org/torbrowser/${version}/`;

	const sums = await (await get(`${base}sha256sums-signed-build.txt`)).text();
	const expected = sums.split(/\r?\n/).map(line => line.trim().split(/\s+/)).find(([, file]) => file === name)?.[0];
	if (!/^[0-9a-f]{64}$/i.test(expected ?? "")) throw new Error(`No checksum for ${name}`);

	console.log(`Downloading ${name}`);
	const bytes = Buffer.from(await (await get(base + name)).arrayBuffer());
	const actual = crypto.createHash("sha256").update(bytes).digest("hex");
	if (actual.toLowerCase() !== expected.toLowerCase()) throw new Error(`Checksum mismatch for ${name}`);

	fs.rmSync(target, { recursive: true, force: true });
	fs.mkdirSync(target, { recursive: true });
	const archive = path.join(vendor, name);
	fs.writeFileSync(archive, bytes);
	try {
		// Relative paths and cwd keep GNU tar (Git Bash) from reading "C:" as a remote host.
		execFileSync("tar", ["-xzf", path.join("..", name)], { cwd: target, stdio: "inherit" });
	} finally {
		fs.rmSync(archive, { force: true });
	}
	if (!fs.existsSync(path.join(target, "tor", "tor.exe"))) throw new Error("The bundle didn't contain tor/tor.exe");
	fs.writeFileSync(path.join(target, "VERSION"), `${version}\n`);
	console.log(`Tor ${version} is ready in vendor/tor`);

}

main().catch(error => {
	console.error(`Couldn't fetch Tor: ${error.message}`);
	if (isRequired) process.exit(1);
	console.error("Tor tabs will use an installed Tor Browser instead, if there is one.");
});
