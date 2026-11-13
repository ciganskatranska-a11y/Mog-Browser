// Renders the installer and uninstaller artwork into build/, and packs build/icon.png into build/icon.ico.
// Run with: electron scripts/installer-art.js   (the output is committed, so releases don't need to run it)
const { app, BrowserWindow, nativeImage } = require("electron");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const root = path.join(__dirname, "..");
const out = path.join(root, "build");
const font = weight => pathToFileURL(path.join(root, "booster", "fonts", `barlow-condensed-latin-${weight}-normal.woff2`)).href;
const logo = pathToFileURL(path.join(root, "booster", "icons", "icon128.png")).href;

const base = `
	@font-face { font-family: "BC"; font-weight: 800; src: url("${font(800)}"); }
	@font-face { font-family: "BC"; font-weight: 600; src: url("${font(600)}"); }
	* { margin: 0; box-sizing: border-box; }
	body { overflow: hidden; background: #000; color: #e6dcc3; font-family: "BC", sans-serif; }
	.glow { position: absolute; inset: 0; background: radial-gradient(120% 60% at 100% 0%, rgba(230, 220, 195, .34), transparent 60%), radial-gradient(120% 70% at 0% 100%, rgba(210, 31, 43, .6), transparent 62%); }
	.grid { position: absolute; inset: 0; background: linear-gradient(rgba(255, 255, 255, .05) 1px, transparent 1px) 0 0 / 100% 14px, linear-gradient(90deg, rgba(255, 255, 255, .05) 1px, transparent 1px) 0 0 / 14px 100%; }
`;

const sidebar = (line, accent) => `<style>${base}
	body { width: 164px; height: 314px; }
	img { position: absolute; top: 34px; left: 22px; width: 54px; filter: drop-shadow(0 0 14px rgba(230, 220, 195, .5)); }
	h1 { position: absolute; top: 104px; left: 20px; font-size: 37px; line-height: .92; font-weight: 800; letter-spacing: -.3px; }
	p { position: absolute; left: 21px; bottom: 26px; font-size: 13px; font-weight: 600; letter-spacing: 2.4px; color: ${accent}; }
	i { position: absolute; left: 21px; bottom: 50px; width: 44px; height: 3px; background: ${accent}; }
</style><div class="glow"></div><div class="grid"></div><img src="${logo}"><h1>MOG<br>BROWSER</h1><i></i><p>${line}</p>`;

const header = `<style>${base}
	body { width: 150px; height: 57px; }
	img { position: absolute; top: 12px; left: 10px; width: 32px; }
	h1 { position: absolute; top: 13px; left: 50px; font-size: 19px; line-height: .95; font-weight: 800; }
</style><div class="glow"></div><img src="${logo}"><h1>MOG<br>BROWSER</h1>`;

let painter = null;

async function render(html, width, height) {

	painter ??= new BrowserWindow({ width: 320, height: 320, show: false, frame: false, useContentSize: true, webPreferences: { offscreen: true } });
	painter.setContentSize(width, height);
	const page = path.join(app.getPath("userData"), "art.html");
	fs.writeFileSync(page, `<!doctype html><meta charset="utf-8">${html}`);
	await painter.loadURL(`${pathToFileURL(page).href}?${Date.now()}`);
	await painter.webContents.executeJavaScript("document.fonts.ready.then(() => new Promise(resolve => setTimeout(resolve, 300)))");
	return (await painter.webContents.capturePage({ x: 0, y: 0, width, height })).resize({ width, height, quality: "best" });

}

function toBmp(image) {

	const { width, height } = image.getSize();
	const pixels = image.toBitmap();
	const rowSize = Math.ceil(width * 3 / 4) * 4;
	const file = Buffer.alloc(54 + rowSize * height);
	file.write("BM", 0);
	file.writeUInt32LE(file.length, 2);
	file.writeUInt32LE(54, 10);
	file.writeUInt32LE(40, 14);
	file.writeInt32LE(width, 18);
	file.writeInt32LE(height, 22);
	file.writeUInt16LE(1, 26);
	file.writeUInt16LE(24, 28);
	file.writeUInt32LE(rowSize * height, 34);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const source = (y * width + x) * 4;
			const target = 54 + (height - 1 - y) * rowSize + x * 3;
			file[target] = pixels[source];
			file[target + 1] = pixels[source + 1];
			file[target + 2] = pixels[source + 2];
		}
	}
	return file;

}

function toIco(images) {

	const header = Buffer.alloc(6 + images.length * 16);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(images.length, 4);
	let offset = header.length;
	const bodies = images.map((image, index) => {
		const png = image.toPNG();
		const size = image.getSize().width;
		const entry = 6 + index * 16;
		header[entry] = size >= 256 ? 0 : size;
		header[entry + 1] = size >= 256 ? 0 : size;
		header.writeUInt16LE(1, entry + 4);
		header.writeUInt16LE(32, entry + 6);
		header.writeUInt32LE(png.length, entry + 8);
		header.writeUInt32LE(offset, entry + 12);
		offset += png.length;
		return png;
	});
	return Buffer.concat([header, ...bodies]);

}

app.setPath("userData", fs.mkdtempSync(path.join(require("os").tmpdir(), "mog-art-")));
app.on("window-all-closed", () => {});
app.whenReady().then(async () => {

	fs.mkdirSync(out, { recursive: true });
	fs.writeFileSync(path.join(out, "installerSidebar.bmp"), toBmp(await render(sidebar("ASCEND THE WEB", "#e6dcc3"), 164, 314)));
	fs.writeFileSync(path.join(out, "uninstallerSidebar.bmp"), toBmp(await render(sidebar("IT'S OVER", "#d21f2b"), 164, 314)));
	fs.writeFileSync(path.join(out, "installerHeader.bmp"), toBmp(await render(header, 150, 57)));

	// The app icon is the plain pill from build/icon.png, with nothing drawn behind it.
	const pill = nativeImage.createFromPath(path.join(out, "icon.png"));
	fs.writeFileSync(path.join(out, "icon.ico"), toIco([256, 128, 64, 48, 32, 16].map(size => pill.resize({ width: size, height: size, quality: "best" }))));
	console.log("Installer artwork written to build/");
	app.exit(0);

}).catch(error => {
	console.error(error);
	app.exit(1);
});
