/**
 * Host half of the Git bar bundle.
 *
 * Serves one read-only, authenticated GET route that answers the Git state of
 * the Session's working directory: the checked-out branch, the detached commit,
 * the checkout's absolute directory, and the home directory the Client needs to
 * shorten a path under it to `~`. The Client half draws the strip above
 * the composer and reads that route; this half adds no model input and writes
 * no session event.
 *
 * The answer comes from the checkout's own administrative files, not from a
 * subprocess: `<checkout>/.git/HEAD` for a repository checkout, and for a
 * linked worktree (or a submodule) the `gitdir:` pointer written in the `.git`
 * file. Reading two small text files keeps the route independent of the Git
 * executable, of the sandbox policy, and of subprocess configuration.
 */

import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'

/** Exact pathname of the state route the Client half reads. */
export const ROUTE_PATH = '/__dsh-git-bar/state'
/** How many parent directories a `.git` entry is looked for above the directory. */
const MAX_ANCESTORS = 64
/** Length of a detached HEAD's short commit name. */
const SHORT_COMMIT = 12
/** Prefix that marks a symbolic HEAD. */
const REF_PREFIX = 'ref:'
/** Namespace a symbolic HEAD uses for a branch. */
const BRANCH_PREFIX = 'refs/heads/'

/**
 * Answer one request with a JSON body.
 * @param value - JSON-serializable body.
 * @param status - HTTP status; 200 by default.
 * @returns the response the route returns.
 */
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

/**
 * Stat a path without throwing.
 * @param path - absolute path to inspect.
 * @returns the stats, or undefined when the path is missing or unreadable.
 */
async function statOf(path) {
  try {
    return await stat(path)
  } catch {
    return undefined
  }
}

/**
 * Read the first line of a small text file.
 * @param path - absolute file path.
 * @returns the trimmed first line, or undefined when the file is missing, empty, or unreadable.
 */
async function readFirstLine(path) {
  try {
    const text = await readFile(path, 'utf8')
    const line = text.split('\n', 1)[0].trim()
    return line === '' ? undefined : line
  } catch {
    return undefined
  }
}

/**
 * Resolve the Git directory a `.git` entry names.
 * @param entry - path of the `.git` entry itself.
 * @param isFile - whether that entry is a file rather than a directory.
 * @returns the absolute Git directory, or undefined when the pointer is unreadable or malformed.
 */
async function gitDirectoryOf(entry, isFile) {
  if (!isFile) return entry
  const line = await readFirstLine(entry)
  if (line === undefined || !line.startsWith('gitdir:')) return undefined
  const target = line.slice('gitdir:'.length).trim()
  if (target === '') return undefined
  return isAbsolute(target) ? target : resolve(dirname(entry), target)
}

/**
 * Find the checkout that contains a directory.
 * @param directory - absolute directory to start from.
 * @returns the checkout root, its Git directory, and whether its `.git` is a pointer file; undefined outside a checkout.
 */
async function checkoutOf(directory) {
  let current = resolve(directory)
  for (let step = 0; step <= MAX_ANCESTORS; step += 1) {
    const entry = join(current, '.git')
    const info = await statOf(entry)
    if (info !== undefined) {
      // A `.git` entry stops the search even when it cannot be read: walking
      // past it would answer with an enclosing repository's branch instead.
      return {
        root: current,
        gitDirectory: await gitDirectoryOf(entry, info.isFile()),
        worktree: info.isFile(),
      }
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return undefined
}

/**
 * Read the Git state of one directory.
 * @param directory - absolute directory the Session works in.
 * @returns the branch, the detached commit, and the checkout that answered.
 *   `reason` is null when a branch or commit was resolved, and names what was
 *   missing otherwise.
 */
export async function readGitState(directory) {
  const checkout = await checkoutOf(directory)
  if (checkout === undefined) {
    return { branch: null, commit: null, detached: false, worktree: false, root: null, reason: 'not-git' }
  }

  const base = {
    branch: null,
    commit: null,
    detached: false,
    worktree: checkout.worktree,
    root: checkout.root,
  }
  if (checkout.gitDirectory === undefined) return { ...base, reason: 'unreadable' }

  const head = await readFirstLine(join(checkout.gitDirectory, 'HEAD'))
  if (head === undefined) return { ...base, reason: 'unreadable' }

  if (!head.startsWith(REF_PREFIX)) {
    // A detached HEAD records the checked-out commit object name itself; any
    // other text is as unreadable as a missing file, so it is not shown as one.
    if (!/^[0-9a-f]{40,64}$/i.test(head)) return { ...base, reason: 'unreadable' }
    return { ...base, commit: head.slice(0, SHORT_COMMIT), detached: true, reason: null }
  }

  const ref = head.slice(REF_PREFIX.length).trim()
  if (!ref.startsWith(BRANCH_PREFIX)) return { ...base, reason: 'unknown-ref' }
  const branch = ref.slice(BRANCH_PREFIX.length)
  return branch === '' ? { ...base, reason: 'unknown-ref' } : { ...base, branch, reason: null }
}

/**
 * Answer the state route for one Session.
 * @param scope - Host context that resolved the route's services.
 * @param request - GET request carrying the Session identity.
 * @returns the branch and working-directory answer, or a refusal.
 */
async function answer(scope, request) {
  const rejection = scope.connection.requestRejection({ headers: request.headers })
  if (rejection !== undefined) return json({ error: 'unauthorized' }, rejection)

  const sessionId = new URL(request.url).searchParams.get('sessionId')
  if (sessionId === null || sessionId === '') return json({ error: 'missing-session' }, 400)

  let directory
  try {
    directory = await scope.sessionQuery.inspectSession(
      sessionId,
      session => scope.workingDirectory.get(session),
    )
  } catch {
    return json({ error: 'unknown-session' }, 404)
  }

  // The home directory travels with the answer so the Client can abbreviate
  // whichever directory it ends up showing; the path itself stays absolute.
  return json({ path: directory, home: homedir(), ...await readGitState(directory) })
}

/**
 * Register the state route on the resolving fiber.
 * @param ctx - Host context.
 */
export function apply(ctx) {
  ctx.inject(['webServer', 'connection', 'sessionQuery', 'workingDirectory'], (scope) => {
    scope.effect(() => scope.webServer.register({
      kind: 'exact',
      path: ROUTE_PATH,
      resource: request => answer(scope, request),
    }), 'git-bar: state route')
  })
}
