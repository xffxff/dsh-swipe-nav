// Offline harness for lib/client.js: runs the browser bundle against a tiny
// fake DOM and checks the edge-gesture rules without a browser.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')

const WIDTH = 390

class FakeEl {
  constructor(attrs = [], options = {}) {
    this.nodeType = 1
    this.attrs = new Set(attrs)
    this.parentElement = options.parent ?? null
    this.scrollWidth = options.scrollWidth ?? 0
    this.clientWidth = options.clientWidth ?? 0
    this.closestResult = options.closestResult ?? null
  }
  hasAttribute(name) {
    return this.attrs.has(name)
  }
  closest() {
    return this.closestResult
  }
}

function createEnvironment({ width = WIDTH, standalone = true, drawer = true, drawerCollapsed = true } = {}) {
  const listeners = new Map()
  const frameAttrs = []
  if (drawer) frameAttrs.push('data-sidebar-drawer')
  if (drawerCollapsed) frameAttrs.push('data-sidebar-collapsed')
  const frame = new FakeEl(frameAttrs)
  const mask = drawer ? new FakeEl(['data-sidebar-mask'], { parent: frame }) : null
  const collapsedEl = drawerCollapsed && !drawer ? frame : null

  const document = {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, [])
      listeners.get(type).push(fn)
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type) ?? []
      const index = list.indexOf(fn)
      if (index >= 0) list.splice(index, 1)
    },
    querySelector(selector) {
      if (selector === '[data-sidebar-mask]') return mask
      if (selector === '[data-sidebar-collapsed]') return collapsedEl
      return null
    },
  }

  let row
  const window = {
    innerWidth: width,
    navigator: { standalone },
    matchMedia: () => ({ matches: false }),
    __ModuleLoader__: {
      load(value) {
        row = value
      },
    },
  }

  const context = vm.createContext({ window, document, Date, console })
  vm.runInContext(source, context)

  const sidebarRight = {
    expanded: false,
    toggles: 0,
    throwOnToggle: false,
    isExpanded() {
      return this.expanded
    },
    toggleExpanded() {
      if (this.throwOnToggle) throw new Error('no on-screen session')
      this.toggles += 1
      this.expanded = !this.expanded
    },
  }
  const layout = {
    toggles: 0,
    toggleSidebar() {
      this.toggles += 1
    },
  }
  const ctx = {
    layout,
    sidebarRight,
    disposers: [],
    on(event, fn) {
      if (event === 'dispose') this.disposers.push(fn)
    },
  }
  row.factory(() => {
    throw new Error('bundle must not require modules')
  }).apply(ctx)

  function fire(type, start, end, target = new FakeEl()) {
    if (type === 'touchstart') {
      for (const fn of listeners.get('touchstart') ?? []) {
        fn({ touches: [{ clientX: start.x, clientY: start.y }], changedTouches: [], target })
      }
    } else if (type === 'touchend') {
      for (const fn of listeners.get('touchend') ?? []) {
        fn({ touches: [], changedTouches: [{ clientX: end.x, clientY: end.y }], target })
      }
    }
  }

  return { row, ctx, listeners, fire }
}

function swipe(env, from, to, target) {
  env.fire('touchstart', from, null, target)
  env.fire('touchend', null, to)
}

const LEFT_EDGE = { x: 10 }
const RIGHT_EDGE = { x: 370 }
const MIDDLE = { x: 200 }

// Bundle shape.
const env = createEnvironment()
assert.equal(env.row.id, 'dsh-plugin-swipe-nav')
assert.ok(Array.isArray(env.ctx.disposers))

// Right edge, swipe left: open the tools column.
swipe(env, { ...RIGHT_EDGE, y: 600 }, { x: 250, y: 605 })
assert.equal(env.ctx.sidebarRight.toggles, 1, 'right-edge left swipe should open the tools column')
assert.equal(env.ctx.sidebarRight.expanded, true)
assert.equal(env.ctx.layout.toggles, 0)

// Open tools column: any rightward swipe closes it, even from the middle.
swipe(env, { ...MIDDLE, y: 600 }, { x: 300, y: 605 })
assert.equal(env.ctx.sidebarRight.toggles, 2, 'rightward swipe should close the tools column')
assert.equal(env.ctx.sidebarRight.expanded, false)

// Middle swipes never open anything.
swipe(env, { ...MIDDLE, y: 600 }, { x: 330, y: 600 })
swipe(env, { ...MIDDLE, y: 600 }, { x: 60, y: 600 })
assert.equal(env.ctx.sidebarRight.toggles, 2, 'middle swipes must not open the tools column')
assert.equal(env.ctx.layout.toggles, 0, 'middle swipes must not open the nav drawer')

// Left edge, swipe right, installed app: open the navigation drawer.
swipe(env, { ...LEFT_EDGE, y: 600 }, { x: 180, y: 600 })
assert.equal(env.ctx.layout.toggles, 1, 'left-edge right swipe should open the nav drawer')
assert.equal(env.ctx.sidebarRight.toggles, 2)

// Left edge in a Safari tab: the browser owns that edge, so nothing happens.
const safari = createEnvironment({ standalone: false })
swipe(safari, { ...LEFT_EDGE, y: 600 }, { x: 180, y: 600 })
assert.equal(safari.ctx.layout.toggles, 0, 'left-edge gesture must be off outside standalone')

// Right edge still works in a Safari tab.
swipe(safari, { ...RIGHT_EDGE, y: 600 }, { x: 250, y: 600 })
assert.equal(safari.ctx.sidebarRight.toggles, 1, 'right-edge gesture stays available in Safari')

// Open nav drawer: any leftward swipe closes it.
const navOpen = createEnvironment({ drawerCollapsed: false })
swipe(navOpen, { ...MIDDLE, y: 600 }, { x: 80, y: 600 })
assert.equal(navOpen.ctx.layout.toggles, 1, 'leftward swipe should close the open nav drawer')

// Open nav drawer: a rightward edge swipe does not stack the tools column.
const navOpen2 = createEnvironment({ drawerCollapsed: false })
swipe(navOpen2, { ...LEFT_EDGE, y: 600 }, { x: 180, y: 600 })
assert.equal(navOpen2.ctx.layout.toggles, 0, 'open drawer ignores the opening swipe')
assert.equal(navOpen2.ctx.sidebarRight.toggles, 0)

// Vertical scroll is not a swipe.
const vertical = createEnvironment()
swipe(vertical, { ...RIGHT_EDGE, y: 500 }, { x: 330, y: 650 })
assert.equal(vertical.ctx.sidebarRight.toggles, 0, 'vertical scroll should be ignored')

// Short drags are not swipes.
const short = createEnvironment()
swipe(short, { ...RIGHT_EDGE, y: 500 }, { x: 345, y: 500 })
assert.equal(short.ctx.sidebarRight.toggles, 0, 'short drags should be ignored')

// Text fields keep their own gestures (cursor movement, selection).
const textField = createEnvironment()
swipe(
  textField,
  { x: 370, y: 600 },
  { x: 250, y: 600 },
  new FakeEl([], { closestResult: {} }),
)
assert.equal(textField.ctx.sidebarRight.toggles, 0, 'text field swipes should be ignored')

// Swipes starting on the drawer mask are left to the mask's own tap handling.
const maskEnv = createEnvironment({ drawerCollapsed: false })
swipe(
  maskEnv,
  { x: 380, y: 600 },
  { x: 200, y: 600 },
  new FakeEl([], { closestResult: {} }),
)
assert.equal(maskEnv.ctx.layout.toggles, 0, 'mask swipes should be ignored')
assert.equal(maskEnv.ctx.sidebarRight.toggles, 0)

// A missing on-screen Session must not throw out of the handler.
const noSession = createEnvironment()
noSession.ctx.sidebarRight.throwOnToggle = true
swipe(noSession, { ...RIGHT_EDGE, y: 600 }, { x: 250, y: 600 })
assert.equal(noSession.ctx.sidebarRight.toggles, 0)

// Tablets/laptops at or above 1024px keep pointer behavior only.
const wide = createEnvironment({ width: 1280 })
swipe(wide, { x: 1250, y: 600 }, { x: 1100, y: 600 })
assert.equal(wide.ctx.sidebarRight.toggles, 0, 'wide viewports should be ignored')

// Disposal removes every listener.
const disposed = createEnvironment()
for (const dispose of disposed.ctx.disposers) dispose()
assert.equal(disposed.listeners.get('touchstart')?.length, 0)
assert.equal(disposed.listeners.get('touchend')?.length, 0)

console.log('swipe-nav harness: all checks passed')
