import assert from 'node:assert/strict'
import { test } from 'node:test'

/** Home directory the fake route answers with; made up, never this machine's. */
const HOME = '/home/tester'
/** A directory inside that home directory. */
const WORK = `${HOME}/work/acme-widgets`

let registration
globalThis.window = {
  __ModuleLoader__: { load: (value) => { registration = value } },
  location: { origin: 'http://127.0.0.1:9', href: 'http://127.0.0.1:9/' },
  setInterval: () => 0,
  clearInterval: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
}
globalThis.document = {
  visibilityState: 'visible',
  addEventListener: () => {},
  removeEventListener: () => {},
}

/** Hook cells of the entry under test, kept across renders the way React keeps them. */
const cells = []
let cursor = 0
let effects = []

/** Stand-in React: elements are plain objects and hooks are index slots. */
const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
  useState(initial) {
    const index = cursor++
    cells[index] ??= { value: initial }
    const cell = cells[index]
    return [cell.value, (next) => {
      cell.value = typeof next === 'function' ? next(cell.value) : next
    }]
  },
  useEffect(effect) {
    effects.push(effect)
  },
}

await import('../client.js')

const plugin = registration.factory((name) => {
  if (name === 'react') return React
  throw new Error(`the client asked for an unexpected module: ${name}`)
})

/** The registered entry component. */
let Entry
plugin.apply({
  effect: (factory) => {
    factory()
    return () => {}
  },
  locale: { register: () => () => {}, bind: () => (key) => key },
  slots: {
    inject: (_owner, register) => {
      register()
      return () => {}
    },
    register: (_options, component) => {
      Entry = component
      return { options: _options }
    },
  },
})
assert.equal(typeof Entry, 'function', 'the client registers one entry component')

/**
 * Render the entry once against a fresh hook table.
 * @param props - entry props.
 * @returns the element tree and the effects it asked for.
 */
function render(props) {
  cursor = 0
  effects = []
  const tree = Entry(props)
  return { tree, effects }
}

/** Let the route read and the state update settle. */
async function settle() {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

/**
 * Render the entry with one route answer and one projected directory.
 * @param options - the answer body, and what the `workingDirectory` projection returns.
 * @returns the settled element tree.
 */
async function show({ answer = {}, projected } = {}) {
  cells.length = 0
  globalThis.fetch = async () => ({ ok: true, json: async () => answer })
  const props = { sessionId: 'session-1', useProjection: () => projected, t: (key) => key }
  const first = render(props)
  for (const effect of first.effects) effect()
  await settle()
  return render(props).tree
}

/**
 * Collect every element matching a predicate.
 * @param node - element tree, array, or text.
 * @param predicate - element test.
 * @param hits - accumulated matches.
 * @returns the matches in document order.
 */
function findAll(node, predicate, hits = []) {
  if (node === null || node === undefined || typeof node !== 'object') return hits
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, predicate, hits)
    return hits
  }
  if (predicate(node)) hits.push(node)
  for (const child of node.children ?? []) findAll(child, predicate, hits)
  return hits
}

/**
 * Read one element by class name.
 * @param tree - element tree.
 * @param name - class name to find.
 * @returns the first match.
 */
function byClass(tree, name) {
  return findAll(tree, (node) => node.props?.className === name)[0]
}

/**
 * Concatenate the text of an element tree.
 * @param node - element tree, array, or text.
 * @returns its text content.
 */
function textOf(node) {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  return (node.children ?? []).map(textOf).join('')
}

/** One settled route answer for a checkout on `main`. */
function answerFor(path, home) {
  return { path, home, branch: 'main', commit: null, detached: false, worktree: false, root: path, reason: null }
}

test('a directory under home shows with a tilde, keeping the absolute path as the title', async () => {
  const tree = await show({ answer: answerFor(WORK, HOME) })

  assert.equal(textOf(byClass(tree, 'gb-branch')), 'main')
  assert.equal(textOf(byClass(tree, 'gb-path')), '~/work/acme-widgets')
  assert.equal(byClass(tree, 'gb-path').props.title, WORK)
})

test('the home directory itself shows as a bare tilde', async () => {
  assert.equal(textOf(byClass(await show({ answer: answerFor(HOME, HOME) }), 'gb-path')), '~')
})

test('a directory outside home keeps its absolute path', async () => {
  const tree = await show({ answer: answerFor('/tmp/acme-widgets', HOME) })

  assert.equal(textOf(byClass(tree, 'gb-path')), '/tmp/acme-widgets')
  assert.equal(byClass(tree, 'gb-path').props.title, '/tmp/acme-widgets')
})

test('a sibling directory whose name shares the home prefix is not abbreviated', async () => {
  const tree = await show({ answer: answerFor(`${HOME}-other/work`, HOME) })

  assert.equal(textOf(byClass(tree, 'gb-path')), `${HOME}-other/work`)
})

test('a Windows home directory is abbreviated with its own separator', async () => {
  const tree = await show({ answer: answerFor('C:\\Users\\tester\\work', 'C:\\Users\\tester') })

  assert.equal(textOf(byClass(tree, 'gb-path')), '~\\work')
})

test('the fresher projected directory wins and is abbreviated too', async () => {
  const tree = await show({
    answer: answerFor(WORK, HOME),
    projected: `${HOME}/work/renamed-widgets`,
  })

  assert.equal(textOf(byClass(tree, 'gb-path')), '~/work/renamed-widgets')
  assert.equal(byClass(tree, 'gb-path').props.title, `${HOME}/work/renamed-widgets`)
})

test('without a home directory the absolute path is shown as-is', async () => {
  const tree = await show({ answer: answerFor(WORK, undefined) })

  assert.equal(textOf(byClass(tree, 'gb-path')), WORK)
})

test('without any directory the line says the path is unavailable', async () => {
  const tree = await show({ answer: { branch: 'main', reason: null } })

  assert.equal(textOf(byClass(tree, 'gb-path-missing')), 'path.unavailable')
})

test('the line stays static: no control and no collapsed region', async () => {
  const tree = await show({ answer: answerFor(WORK, HOME) })

  assert.deepEqual(findAll(tree, (node) => node.type === 'button'), [])
  assert.deepEqual(findAll(tree, (node) => node.props?.hidden !== undefined), [])
})
