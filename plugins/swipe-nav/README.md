# dsh-plugin-swipe-nav

Swipe navigation for the DSH Web GUI on phones and tablets.

- **Swipe right** on a page → open the navigation drawer (or expand the
  collapsed sidebar between 768 px and 1024 px).
- **Swipe left** → close it again.

The gesture only runs below 1024 px viewport width, ignores text fields,
horizontally scrolling blocks (code, tables), vertical scrolls, short taps, and
presses longer than 700 ms. It never calls `preventDefault`, so scrolling and the
browser's own gestures keep working.

## How it is built

| File | Role |
| --- | --- |
| `lib/index.js` | Host (Node) half: an empty Cordis plugin so the package has a Loader row. |
| `lib/client.js` | Browser half: registers with `window.__ModuleLoader__`, injects `layout`, listens to touch events, calls `ctx.layout.toggleSidebar()`. |
| `cordis.patch.yml` | Bundle patch that inserts the `swipe-nav` Loader row. |
| `test/harness.mjs` | Offline fake-DOM test of the gesture rules. |

It uses only the public `ctx.layout` service (the same `toggleSidebar()` the
header button uses), so it needs no internal APIs and no build step — the
browser bundle is hand-written in the same `window.__ModuleLoader__.load(...)`
format the build preset emits.

Open/closed state comes from the layout plugin's frame element, which marks
itself with `data-sidebar-drawer` (drawer mode) and `data-sidebar-collapsed`
(closed), plus a `data-sidebar-mask` child in drawer mode.

## Install

The profile is `~/.dsh/profiles/web`. This machine has no `pnpm`, so
`dsh plugin add` cannot run; a link is enough, because bundles resolve from the
profile's own `node_modules` after the dsh installation.

```sh
mkdir -p ~/.dsh/profiles/web/node_modules
ln -s /home/dsh/dsh/plugins/swipe-nav ~/.dsh/profiles/web/node_modules/dsh-plugin-swipe-nav
```

Then add `"dsh-plugin-swipe-nav"` to `dsh.profile.bundles` in
`~/.dsh/profiles/web/package.json`:

```json
"bundles": [
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
  "...",
  "dsh-plugin-swipe-nav"
]
```

With HMR enabled in the profile, saving the manifest recomposes the profile and
starts the new row without restarting the host; otherwise restart:

```sh
dsh --profile web --port 3080 --public-url https://dsh.zhoufanlabs.com
```

Reload the page once on the phone afterwards.

With pnpm available the same result comes from:

```sh
dsh plugin --profile web add file:/home/dsh/dsh/plugins/swipe-nav
```

## Notes

- iOS Safari treats a swipe that starts at the very left edge as its own back
  gesture, and a page cannot reliably cancel that. Start the swipe slightly
  away from the edge.
- Flipping the mapping is one line in `lib/client.js` (`dx > 0` / `dx < 0` in
  `onTouchEnd`), and the distance/threshold constants sit at the top.
- Behaviour was verified end to end in an isolated `DSH_HOME`: the plugin row
  appears in `window.__DSH_BOOT__` and its bundle is served from
  `/plugins/??dsh-plugin-swipe-nav/client.js`.

## Test

```sh
node test/harness.mjs
```
