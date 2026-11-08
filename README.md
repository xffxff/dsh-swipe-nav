# dsh-swipe-nav

Swipe navigation for the DeepSeek Harness (dsh) Web GUI on phones and tablets.

- **Swipe right starting at the left edge** (first 56 px) → open the left
  navigation drawer (session list). This needs an installed/standalone app.
- **Swipe left starting at the right edge** (last 56 px) → open the right sidebar
  (the tools column). On a phone it opens fullscreen over the conversation,
  showing its “开始” guide with 工作区文件 / 新建终端 / 更多工具 when no tab is open.
- **Swipe the other way anywhere** → close whichever panel is open.
- **Horizontal swipes in the middle of the screen** are left to the content.

The gesture only reacts below 1024 px viewport width, ignores text fields,
horizontally scrolling blocks (code, tables), vertical scrolls, short taps, and
presses longer than 700 ms. It never calls `preventDefault`, so scrolling and the
browser's own gestures keep working.

## Install

Requirements: DeepSeek Harness with the `dsh plugin` command, Node.js ≥ 20, and
`pnpm` on the PATH of the process that runs DSH (the plugin manager shells out to
it).

```sh
# from GitHub (git + pnpm required)
dsh plugin --profile web add github:xffxff/dsh-swipe-nav

# without git: GitHub archive
dsh plugin --profile web add https://github.com/xffxff/dsh-swipe-nav/archive/refs/heads/main.tar.gz

# from a local checkout
dsh plugin --profile web add /home/dsh/dsh
```

Installation enables the bundle by default. If it is listed but off, add
`"dsh-plugin-swipe-nav"` to `dsh.profile.bundles` in
`~/.dsh/profiles/web/package.json`, or enable it on the Plugins page.

Restart the Web host so the new row and client bundle are scanned at startup:

```sh
dsh --profile web
```

Then reload the page once on the phone.

Uninstall:

```sh
dsh plugin --profile web remove dsh-plugin-swipe-nav
```

## Package layout

| Path | Role |
| --- | --- |
| `package.json` | npm name `dsh-plugin-swipe-nav`, `dsh.bundle.patch` and `dsh.client` declarations, `engines.dsh`. |
| `cordis.patch.yml` | Bundle patch that inserts the `swipe-nav` Loader row. |
| `lib/index.js` | Host (Node) half: an empty Cordis plugin so the package has a Loader row. |
| `lib/client.js` | Browser half: registers with `window.__ModuleLoader__`, injects `sidebarRight` and `layout`, listens to touch events. |
| `test/harness.mjs` | Offline fake-DOM test of the gesture rules. |

It uses only public services: `ctx.sidebarRight.isExpanded()` /
`ctx.sidebarRight.toggleExpanded()` for the tools column (the same controller the
header button drives), and `ctx.layout.toggleSidebar()` for the navigation
drawer. The drawer's open state comes from the layout frame element, which marks
itself with `data-sidebar-drawer` / `data-sidebar-collapsed` plus a
`data-sidebar-mask` child in drawer mode.

The browser bundle is committed, so installing from GitHub needs no build step
and no `prepare` script. It is hand-written in the same
`window.__ModuleLoader__.load(...)` format the dsh build preset emits.

## Notes

- In a Safari tab, the left edge belongs to the browser's back gesture, so the
  left-edge gesture only runs in standalone (`navigator.standalone` or
  `display-mode: standalone`). The right edge keeps working there.
- Android gesture navigation reserves both edges for the system back action, so
  edge gestures can be swallowed outside an installed app.
- The edge band, distances, and timing thresholds sit at the top of
  `lib/client.js` (`EDGE_BAND_MAX`, `MIN_HORIZONTAL`, `MAX_VERTICAL`,
  `MAX_DURATION_MS`); the zone logic is in `edgeZone` / `onTouchEnd`.

## Test

```sh
node test/harness.mjs
```
