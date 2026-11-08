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

function createEnvironment({ width = 390, drawer = true, collapsed = true } = {}) {
  const listeners = new Map()
  const calls = { toggle: 0 }
  const frameAttrs = []
  if (drawer) frameAttrs.push('data-sidebar-drawer')
  if (collapsed) frameAttrs.push('data-sidebar-collapsed')
  const frame = new FakeEl(frameAttrs)
  const mask = drawer ? new FakeEl(['data-sidebar-mask'], { parent: frame }) : null
  const collapsedEl = collapsed && !drawer ? frame : null

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

  const context = vm.createContext({
    window,
    document,
    Date,
    console,
  })
  vm.runInContext(source, context)

  const ctx = {
    layout: {
      toggleSidebar() {
        calls.toggle += 1
      },
    },
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

  return { row, ctx, calls, fire, listeners, frame }
}

function swipe(env, from, to) {
  env.fire('touchstart', from, null)
  env.fire('touchend', null, to)
}

// Bundle shape.
const env = createEnvironment()
assert.equal(env.row.id, 'dsh-plugin-swipe-nav')
assert.ok(Array.isArray(env.ctx.disposers))

// Closed drawer: swipe right opens it.
swipe(env, { x: 40, y: 600 }, { x: 200, y: 610 })
assert.equal(env.calls.toggle, 1, 'swipe right on a closed drawer should open it')

// Open drawer (frame without the collapsed mark): swipe left closes it.
const openEnv = createEnvironment({ collapsed: false })
swipe(openEnv, { x: 260, y: 600 }, { x: 100, y: 605 })
assert.equal(openEnv.calls.toggle, 1, 'swipe left on an open drawer should close it')

// Wrong direction does nothing.
const wrong = createEnvironment({ collapsed: false })
swipe(wrong, { x: 100, y: 600 }, { x: 260, y: 600 })
assert.equal(wrong.calls.toggle, 0, 'swipe right on an open drawer should be ignored')

// Vertical scroll is not a swipe.
const vertical = createEnvironment()
swipe(vertical, { x: 200, y: 500 }, { x: 230, y: 650 })
assert.equal(vertical.calls.toggle, 0, 'vertical scroll should be ignored')

// Short drags are not swipes.
const short = createEnvironment()
swipe(short, { x: 200, y: 500 }, { x: 230, y: 500 })
assert.equal(short.calls.toggle, 0, 'short drags should be ignored')

// Text fields keep their own gestures (cursor movement, selection).
const textField = createEnvironment()
textField.fire('touchstart', { x: 40, y: 600 }, null, new FakeEl([], { closestResult: {} }))
textField.fire('touchend', null, { x: 220, y: 600 })
assert.equal(textField.calls.toggle, 0, 'text field swipes should be ignored')

// Tablets/laptops at or above 1024px keep pointer behavior only.
const wide = createEnvironment({ width: 1280 })
swipe(wide, { x: 40, y: 600 }, { x: 240, y: 600 })
assert.equal(wide.calls.toggle, 0, 'wide viewports should be ignored')

// Disposal removes every listener.
const disposed = createEnvironment()
for (const dispose of disposed.ctx.disposers) dispose()
assert.equal(disposed.listeners.get('touchstart')?.length, 0)
assert.equal(disposed.listeners.get('touchend')?.length, 0)

console.log('swipe-nav harness: all checks passed')
