// Bundles the booster's Direct engine into the page preload, because sandboxed preloads can't read files.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const template = read("src/preload-web.template.js");
const engine = ["booster/shared.js", "booster/engine.js", "booster/direct.js"].map(read).join("\n");

fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist/preload-web.js"), template.replace("/*BOOSTER_ENGINE*/", () => engine));
console.log("Built dist/preload-web.js");
