// Offline harness for lib/client.js: runs the browser bundle against a tiny
// fake DOM and checks the gesture rules without a browser.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')

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

function createEnvironment({ width = 390, drawer = true, drawerCollapsed = true } = {}) {
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

// Bundle shape.
const env = createEnvironment()
assert.equal(env.row.id, 'dsh-plugin-swipe-nav')
assert.ok(Array.isArray(env.ctx.disposers))

// Right swipe on the chat opens the tools column.
swipe(env, { x: 40, y: 600 }, { x: 200, y: 610 })
assert.equal(env.ctx.sidebarRight.toggles, 1, 'swipe right should open the right sidebar')
assert.equal(env.ctx.sidebarRight.expanded, true)

// Right swipe while it is open does nothing.
swipe(env, { x: 40, y: 600 }, { x: 200, y: 610 })
assert.equal(env.ctx.sidebarRight.toggles, 1, 'swipe right while open should be ignored')

// Left swipe closes it.
swipe(env, { x: 260, y: 600 }, { x: 100, y: 605 })
assert.equal(env.ctx.sidebarRight.toggles, 2, 'swipe left should close the right sidebar')
assert.equal(env.ctx.sidebarRight.expanded, false)

// Left swipe with everything closed does nothing.
swipe(env, { x: 260, y: 600 }, { x: 100, y: 605 })
assert.equal(env.ctx.sidebarRight.toggles, 2)
assert.equal(env.ctx.layout.toggles, 0)

// Left swipe also closes the left navigation drawer when that is what is open.
const drawerEnv = createEnvironment({ drawerCollapsed: false })
swipe(drawerEnv, { x: 260, y: 600 }, { x: 100, y: 605 })
assert.equal(drawerEnv.ctx.layout.toggles, 1, 'swipe left should close an open nav drawer')

// Vertical scroll is not a swipe.
const vertical = createEnvironment()
swipe(vertical, { x: 200, y: 500 }, { x: 230, y: 650 })
assert.equal(vertical.ctx.sidebarRight.toggles, 0, 'vertical scroll should be ignored')

// Short drags are not swipes.
const short = createEnvironment()
swipe(short, { x: 200, y: 500 }, { x: 230, y: 500 })
assert.equal(short.ctx.sidebarRight.toggles, 0, 'short drags should be ignored')

// Text fields keep their own gestures (cursor movement, selection).
const textField = createEnvironment()
swipe(
  textField,
  { x: 40, y: 600 },
  { x: 220, y: 600 },
  new FakeEl([], { closestResult: {} }),
)
assert.equal(textField.ctx.sidebarRight.toggles, 0, 'text field swipes should be ignored')

// Swipes starting on the drawer mask are left to the mask's own tap handling.
const maskEnv = createEnvironment({ drawerCollapsed: false })
swipe(
  maskEnv,
  { x: 300, y: 600 },
  { x: 120, y: 600 },
  new FakeEl([], { closestResult: {} }),
)
assert.equal(maskEnv.ctx.layout.toggles, 0, 'mask swipes should be ignored')

// A missing on-screen Session must not throw out of the handler.
const noSession = createEnvironment()
noSession.ctx.sidebarRight.throwOnToggle = true
swipe(noSession, { x: 40, y: 600 }, { x: 200, y: 600 })
assert.equal(noSession.ctx.sidebarRight.toggles, 0)

// Tablets/laptops at or above 1024px keep pointer behavior only.
const wide = createEnvironment({ width: 1280 })
swipe(wide, { x: 40, y: 600 }, { x: 240, y: 600 })
assert.equal(wide.ctx.sidebarRight.toggles, 0, 'wide viewports should be ignored')

// Disposal removes every listener.
const disposed = createEnvironment()
for (const dispose of disposed.ctx.disposers) dispose()
assert.equal(disposed.listeners.get('touchstart')?.length, 0)
assert.equal(disposed.listeners.get('touchend')?.length, 0)

console.log('swipe-nav harness: all checks passed')
