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
- **Home page:** a free canvas of widgets. Press the layout button in the corner to drag them anywhere, resize them, and add more: clock, Shields stats, notes, to-do, focus timer, countdown, calendar, weather, bookmarks, recent pages, site tiles and a motto. Every widget has settings for what it shows.
- **Website widgets:** type any site and get a card built from it, with its music player, latest posts, links, picture and search. You pick which parts to show.
- **Browser size:** hold Ctrl and scroll on the home page to make the whole browser bigger or smaller.
- **Dark mode:** sites that have a dark version show it automatically (switch in Settings).
- **Emergency button:** the page icon next to Shields (Ctrl+Shift+X) closes every tab and opens a page you choose in Settings.
- **Offline game:** a bonesmash clicker on the error page when a site cannot be reached.
- **China mode 中文模式:** Baidu search, Chinese interface and site tiles, and a Chinese-language request header to every site.
- **Lock In mode (Ctrl+Shift+L):** hides secondary controls and runs a 25-minute focus timer.
- **Also:** private tabs, tab dragging, find on page, screenshots, history, bookmarks and session restore.

## Develop

```
npm install
npm start        # run from source
npm test         # end-to-end smoke test (35 checks)
npm run art      # re-render installer artwork into build/
npm run dist     # build the installer into dist/ without publishing
```

## Release a new version

```
npm version patch
git push --follow-tags
```

Pushing the tag runs `.github/workflows/release.yml`, which builds `MogBrowser-Setup.exe` and publishes it as a GitHub release. Every installed copy picks it up automatically.
