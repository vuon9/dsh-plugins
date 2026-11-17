import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, test } from 'node:test'
import { ROUTE_PATH, apply, readGitState } from '../index.js'

/** Root of the scratch tree this file owns and removes when it finishes. */
const scratch = await mkdtemp(join(tmpdir(), 'git-bar-test-'))

after(async () => {
  await rm(scratch, { recursive: true, force: true })
})

/**
 * Create one directory inside the scratch tree.
 * @param parts - path segments below the scratch root.
 * @returns the created directory's absolute path.
 */
async function directory(...parts) {
  const path = join(scratch, ...parts)
  await mkdir(path, { recursive: true })
  return path
}

/**
 * Write one file, creating its parents.
 * @param path - absolute file path.
 * @param text - exact contents.
 */
async function file(path, text) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text)
}

/**
 * Register the bundle's Host half against stand-in services.
 * @param options - the working directory to answer with, an admission rejection, or a lookup failure.
 * @returns the registered routes and the fake plugin context.
 */
function hostWith({ directory: working, rejection, failLookup = false } = {}) {
  const routes = []
  const scope = {
    effect: (factory) => {
      factory()
      return () => {}
    },
    webServer: {
      register: (route) => {
        routes.push(route)
        return () => {}
      },
    },
    connection: { requestRejection: () => rejection },
    sessionQuery: {
      inspectSession: async (_sessionId, read) => {
        if (failLookup) throw new Error('no such session')
        return read({})
      },
    },
    workingDirectory: { get: () => working },
  }
  apply({ inject: (_dependencies, callback) => callback(scope) })
  return routes
}

/**
 * Ask one registered route as a browser would.
 * @param route - the registered resource route.
 * @param search - query string, including its `?`.
 * @returns the response.
 */
async function ask(route, search = '?sessionId=session-under-test') {
  // The Web carrier resolves the request target against a placeholder origin.
  return route.resource(new Request(`http://127.0.0.1${ROUTE_PATH}${search}`))
}

test('the route path is one absolute, trailing-slash-free pathname', () => {
  assert.ok(ROUTE_PATH.startsWith('/'), 'the route must be absolute')
  assert.ok(!ROUTE_PATH.endsWith('/'), 'the route must not end with a slash')
})

test('a repository checkout answers its branch', async () => {
  const repo = await directory('acme-widgets')
  await file(join(repo, '.git', 'HEAD'), 'ref: refs/heads/main\n')

  const state = await readGitState(repo)
  assert.deepEqual(state, {
    branch: 'main',
    commit: null,
    detached: false,
    worktree: false,
    root: resolve(repo),
    reason: null,
  })
})

test('a nested directory answers the checkout that contains it', async () => {
  const repo = await directory('acme-widgets')
  await file(join(repo, '.git', 'HEAD'), 'ref: refs/heads/main\n')
  const nested = await directory('acme-widgets', 'src', 'widgets')

  const state = await readGitState(nested)
  assert.equal(state.branch, 'main')
  assert.equal(state.root, resolve(repo))
})

test('a branch name keeps its slashes', async () => {
  const repo = await directory('gizmo-app')
  await file(join(repo, '.git', 'HEAD'), 'ref: refs/heads/feature/widget-list\n')

  assert.equal((await readGitState(repo)).branch, 'feature/widget-list')
})

test('a detached HEAD answers the short commit instead of a branch', async () => {
  const repo = await directory('detached-checkout')
  await file(join(repo, '.git', 'HEAD'), '0123456789abcdef0123456789abcdef01234567\n')

  const state = await readGitState(repo)
  assert.equal(state.branch, null)
  assert.equal(state.commit, '0123456789ab')
  assert.equal(state.detached, true)
  assert.equal(state.reason, null)
})

test('a linked worktree follows its gitdir pointer', async () => {
  const repo = await directory('gizmo-app')
  const checkout = await directory('worktrees', 'gizmo-app-widgets')
  const gitDirectory = join(repo, '.git', 'worktrees', 'dsh-widgets')
  await file(join(gitDirectory, 'HEAD'), 'ref: refs/heads/dsh-widgets\n')
  await file(join(checkout, '.git'), `gitdir: ${gitDirectory}\n`)

  const state = await readGitState(checkout)
  assert.equal(state.branch, 'dsh-widgets')
  assert.equal(state.worktree, true)
  assert.equal(state.root, resolve(checkout))
  assert.equal(state.reason, null)
})

test('a relative gitdir pointer resolves against the checkout', async () => {
  const repo = await directory('gizmo-app')
  const checkout = await directory('relative-checkout')
  await file(join(repo, '.git', 'worktrees', 'relative-one', 'HEAD'), 'ref: refs/heads/relative-one\n')
  await file(join(checkout, '.git'), 'gitdir: ../gizmo-app/.git/worktrees/relative-one\n')

  const state = await readGitState(checkout)
  assert.equal(state.branch, 'relative-one')
  assert.equal(state.worktree, true)
})

test('a directory outside a checkout answers no branch', async () => {
  const plain = await directory('plain-directory')

  assert.deepEqual(await readGitState(plain), {
    branch: null,
    commit: null,
    detached: false,
    worktree: false,
    root: null,
    reason: 'not-git',
  })
})

test('a checkout without a readable HEAD answers why', async () => {
  const repo = await directory('broken-checkout')
  await mkdir(join(repo, '.git'), { recursive: true })

  const state = await readGitState(repo)
  assert.equal(state.branch, null)
  assert.equal(state.root, resolve(repo))
  assert.equal(state.reason, 'unreadable')
})

test('a symbolic HEAD outside refs/heads answers no branch', async () => {
  const repo = await directory('odd-checkout')
  await file(join(repo, '.git', 'HEAD'), 'ref: refs/remotes/origin/main\n')

  const state = await readGitState(repo)
  assert.equal(state.branch, null)
  assert.equal(state.reason, 'unknown-ref')
})

test('the Host half registers one exact route that answers the session directory', async () => {
  const repo = await directory('acme-widgets')
  await file(join(repo, '.git', 'HEAD'), 'ref: refs/heads/main\n')

  const routes = hostWith({ directory: repo })
  assert.equal(routes.length, 1)
  assert.equal(routes[0].kind, 'exact')
  assert.equal(routes[0].path, ROUTE_PATH)

  const response = await ask(routes[0])
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const body = await response.json()
  assert.equal(body.home, homedir(), 'the answer carries the home directory the Client abbreviates with')
  assert.deepEqual(body, {
    path: repo,
    home: homedir(),
    branch: 'main',
    commit: null,
    detached: false,
    worktree: false,
    root: resolve(repo),
    reason: null,
  })
})

test('the route refuses a request the connection will not admit', async () => {
  const routes = hostWith({ rejection: 401 })
  const response = await ask(routes[0])

  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: 'unauthorized' })
})

test('the route needs a session identity', async () => {
  const routes = hostWith({ directory: scratch })
  const response = await ask(routes[0], '')

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'missing-session' })
})

test('the route refuses an unknown session', async () => {
  const routes = hostWith({ failLookup: true })
  const response = await ask(routes[0])

  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: 'unknown-session' })
})

test('a HEAD that is neither a ref nor a commit name answers no branch', async () => {
  const repo = await directory('corrupt-checkout')
  await file(join(repo, '.git', 'HEAD'), 'not-a-commit\n')

  const state = await readGitState(repo)
  assert.equal(state.branch, null)
  assert.equal(state.commit, null)
  assert.equal(state.detached, false)
  assert.equal(state.reason, 'unreadable')
})
