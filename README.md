# dsh-swipe-nav

Swipe navigation for the DeepSeek Harness (dsh) Web GUI on phones and tablets.

- **Swipe right** on a page → open the navigation drawer (or expand the collapsed
  sidebar between 768 px and 1024 px).
- **Swipe left** → close it again.

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

# without git: GitHub tag archive
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
| `lib/client.js` | Browser half: registers with `window.__ModuleLoader__`, injects `layout`, listens to touch events, calls `ctx.layout.toggleSidebar()`. |
| `test/harness.mjs` | Offline fake-DOM test of the gesture rules. |

The browser bundle is committed, so installing from GitHub needs no build step
and no `prepare` script. It is hand-written in the same
`window.__ModuleLoader__.load(...)` format the dsh build preset emits.

It uses only the public `ctx.layout` service (the same `toggleSidebar()` the
header button uses). Open/closed state comes from the layout plugin's frame
element, which marks itself with `data-sidebar-drawer` (drawer mode) and
`data-sidebar-collapsed` (closed), plus a `data-sidebar-mask` child in drawer
mode.

## Notes

- iOS Safari treats a swipe that starts at the very left edge as its own back
  gesture, and a page cannot reliably cancel that. Start the swipe slightly
  away from the edge.
- Flipping the mapping is one line in `lib/client.js` (`dx > 0` / `dx < 0` in
  `onTouchEnd`); the distance and timing thresholds sit at the top of the file.

## Test

```sh
node test/harness.mjs
```
