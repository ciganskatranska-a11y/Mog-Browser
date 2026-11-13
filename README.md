# Mog Browser

A blackpill-themed desktop browser built on Electron, with built-in ad and tracker blocking and the Blackpill Booster audio engine.

## Install

Download `MogBrowser-Setup.exe` from the latest [release](../../releases/latest) and run it. That one file installs the newest version. After that, the browser checks GitHub for new releases on startup and every four hours, downloads them in the background, and installs them the next time you close it. **Menu → Check for updates** checks right away.

## Features

- **Shields:** blocks ads and trackers (EasyList, EasyPrivacy and uBlock filter lists) and cross-site cookies, strips tracking parameters from links, sends Global Privacy Control and Do Not Track, and asks before a site uses your camera, microphone or location.
- **Blackpill Booster:** volume up to 10000%, EQ, voice changer, BONESMASHING and stacks, all built in (Ctrl+Shift+B).
- **Search:** Google by default. Switch between web, images and videos, or type `image:` or `video:` (short forms `i:` and `v:`) before a search. DuckDuckGo, Brave Search and Bing are also available.
- **Address bar:** autofills popular sites (YouTube, Instagram, TikTok, Reddit and more) as you type.
- **Themes:** 12 presets, 16 country themes with a flag stripe, and custom colours.
- **Home page:** gradient backdrop or your own image, live Shields stats, a clock, a notes widget, and site tiles you can add and remove.
- **Emergency button:** the page icon next to Shields (Ctrl+Shift+X) closes every tab and opens a page you choose in Settings.
- **Offline game:** a bonesmash clicker on the error page when a site cannot be reached.
- **China mode 中文模式:** Baidu search, Chinese interface and site tiles, and a Chinese-language request header to every site.
- **Lock In mode (Ctrl+Shift+L):** hides secondary controls and runs a 25-minute focus timer.
- **Tor tabs (Ctrl+Shift+O):** route everything through the Tor network, using Tor from the installer (tick **Install Tor**, off by default) or from an installed Tor Browser. If a direct connection is blocked, the browser tries the built-in obfs4, Snowflake and meek bridges on its own and remembers which one worked. Safest mode is always on: no JavaScript, WebGL, remote fonts, SVG images or plugins. Nothing loads until Tor has connected, no history is kept, and site data is wiped when the last Tor tab closes. Tor tabs run on Chromium, so for the strongest anonymity use Tor Browser itself.
- **Also:** private tabs, tab dragging, find on page, screenshots, history, bookmarks and session restore.

## Develop

```
npm install
npm start        # run from source
npm test         # end-to-end smoke test (40 checks)
npm run tor      # download the Tor Expert Bundle into vendor/tor (checksum-verified)
npm run art      # re-render installer artwork into build/
npm run dist     # build the installer into dist/ without publishing (fetches Tor first)
```

## Release a new version

```
npm version patch
git push --follow-tags
```

Pushing the tag runs `.github/workflows/release.yml`, which builds `MogBrowser-Setup.exe` and publishes it as a GitHub release. Every installed copy picks it up automatically.
