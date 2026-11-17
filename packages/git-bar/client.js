/**
 * Git bar — Client half.
 *
 * Registers one slim, full-width line in the composer's input dock, directly
 * above the composer card. The line shows both facts at once, with nothing to
 * click: the branch of the directory the Session works in, and that
 * directory's absolute path. The branch arrives from this bundle's Host route,
 * and the path reads the `workingDirectory` projection first, so it follows a
 * directory change immediately and works even when the route cannot be reached.
 *
 * Both values are long on occasion, so the line is full width and static: the
 * branch keeps its own column and the path takes the rest, ellipsizing from the
 * right with the complete value on hover when the window is too narrow. Nothing
 * opens, nothing pushes the composer, and there is no control to discover.
 * A directory under the home directory is shortened to `~`, and the absolute
 * path stays the hover title.
 *
 * Nothing is read from the Host beyond the route's JSON and that projection.
 */

window.__ModuleLoader__.load({
  id: 'dsh-git-bar',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'gitBar'
    /** The dock strip this line occupies, above the composer card. */
    const SLOT = 'conversation.input.dock'
    /** This entry's id inside the dock. */
    const ENTRY_ID = 'git-bar'
    /** Host route path; the Host half owns the same string. */
    const ROUTE_PATH = '/__dsh-git-bar/state'
    /** How often the line re-reads the branch; a branch rarely moves. */
    const REFRESH_MS = 20000
    /** Two visibility signals arriving together share one read. */
    const REFRESH_GAP_MS = 500
    /** The session projection naming the Session's effective directory. */
    const DIRECTORY_PROJECTION = 'workingDirectory'

    const en = {
      'branch.loading': 'Reading branch…',
      'branch.notGit': 'Not a Git checkout',
      'branch.unreadable': 'Branch unreadable',
      'branch.unknownRef': 'No branch',
      'branch.unavailable': 'Branch unavailable',
      detached: 'Detached at {commit}',
      'path.unavailable': 'Path unavailable'
    }

    const zh = {
      'branch.loading': '正在读取分支…',
      'branch.notGit': '不是 Git 工作区',
      'branch.unreadable': '无法读取分支',
      'branch.unknownRef': '没有分支',
      'branch.unavailable': '分支不可用',
      detached: '分离 HEAD：{commit}',
      'path.unavailable': '路径不可用'
    }

    // The bar mirrors the composer card it sits above: the same side clearance
    // and max width (so both edges line up at every window size), the same
    // input fill, stroke color, and soft elevation tier, the same 12px inner
    // pad as the card's content, and the dock family's radius.
    const CSS = `
.gb-bar { box-sizing: border-box; width: calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance)); max-width: var(--dsh-composer-card-max-width); margin: 0 auto; }
.gb-bar, .gb-bar * { box-sizing: border-box; }
.gb-row { display: flex; align-items: center; gap: 7px; min-height: 28px; padding: 0 12px; border-radius: var(--dsw-radius-md, 12px); background: var(--dsw-specific-input-major, var(--dsw-alias-bg-layer-1)); --dsw-elevation-stroke-color: var(--dsw-alias-border-l2); box-shadow: var(--dsw-elevation-soft, 0 0 0 0.5px var(--dsw-alias-border-l1)); font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px); line-height: 18px; }
.gb-glyph { display: inline-flex; flex: none; color: var(--dsw-alias-label-secondary); }
.gb-branch { flex: 0 1 auto; min-width: 0; max-width: 45%; overflow: hidden; color: var(--dsw-alias-label-primary); font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.gb-branch[data-known="false"] { color: var(--dsw-alias-label-secondary); font-weight: 400; }
.gb-sep { flex: none; color: var(--dsw-alias-label-secondary); }
.gb-path { flex: 1 1 0; min-width: 0; overflow: hidden; color: var(--dsw-alias-label-secondary); font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace); text-overflow: ellipsis; white-space: nowrap; user-select: text; }
.gb-path-missing { flex: none; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
`

    /** The branch mark at the left of the line; inherits the line's ink. */
    function BranchGlyph() {
      return h('svg', {
        width: 14,
        height: 14,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true',
        focusable: 'false',
        style: { display: 'block' }
      }, [
        h('circle', { key: 'head', cx: 5, cy: 3.4, r: 1.7, fill: 'currentColor' }),
        h('circle', { key: 'base', cx: 5, cy: 12.6, r: 1.7, fill: 'currentColor' }),
        h('circle', { key: 'side', cx: 11.3, cy: 5.6, r: 1.7, fill: 'currentColor' }),
        h('path', {
          key: 'trunk',
          d: 'M5 5.3v5.4',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round'
        }),
        h('path', {
          key: 'fork',
          d: 'M11.3 7.5c0 2.3-2.4 3.2-5.5 4.2',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round'
        })
      ])
    }

    /**
     * Build the route URL for one Session.
     * @param sessionId - the Session whose directory is asked about.
     * @returns the absolute URL of this bundle's Host route.
     */
    function stateUrl(sessionId) {
      const origin = window.location.origin
      const url = new URL(ROUTE_PATH, origin === 'null' || origin === '' ? window.location.href : origin)
      url.searchParams.set('sessionId', sessionId)
      return url
    }

    /**
     * Read the route's answer for one Session.
     * @param sessionId - the Session whose directory is asked about.
     * @param signal - cancellation for a superseded read.
     * @returns the answer, or a failure marker the line reports.
     */
    async function readState(sessionId, signal) {
      try {
        const response = await fetch(stateUrl(sessionId), {
          signal,
          headers: { accept: 'application/json' },
          credentials: 'same-origin'
        })
        if (!response.ok) return { sessionId, failed: true }
        const value = await response.json()
        if (value === null || typeof value !== 'object') return { sessionId, failed: true }
        return { sessionId, ...value }
      } catch {
        return signal.aborted ? undefined : { sessionId, failed: true }
      }
    }

    /**
     * Describe the branch reading for the current answer.
     * @param answer - the route's answer for this Session, or null before the first one.
     * @param t - the locale translate function.
     * @returns the reading's text, what it describes, and whether it names a revision.
     */
    function branchOf(answer, t) {
      if (answer === null) return { text: t('branch.loading'), kind: 'loading' }
      if (answer.failed === true) return { text: t('branch.unavailable'), kind: 'failed' }
      if (answer.detached === true && typeof answer.commit === 'string' && answer.commit !== '') {
        return { text: t('detached', { commit: answer.commit }), kind: 'detached' }
      }
      if (typeof answer.branch === 'string' && answer.branch !== '') {
        return { text: answer.branch, kind: 'branch' }
      }
      if (answer.reason === 'not-git') return { text: t('branch.notGit'), kind: 'none' }
      if (answer.reason === 'unreadable') return { text: t('branch.unreadable'), kind: 'none' }
      return { text: t('branch.unknownRef'), kind: 'none' }
    }

    /**
     * Shorten a path that sits under the home directory.
     * @param path - absolute directory to display.
     * @param home - home directory reported by the Host, when it is known.
     * @returns the path with its home prefix replaced by `~`; otherwise the path unchanged.
     */
    function tildeOf(path, home) {
      if (typeof home !== 'string' || home === '') return path
      const base = home.replace(/[\\/]+$/, '')
      if (base === '') return path
      if (path === base) return '~'
      if (path.startsWith(base + '/') || path.startsWith(base + '\\')) return '~' + path.slice(base.length)
      return path
    }

    /**
     * The line above the composer.
     * @param props - the dock's standard props and the locale seat.
     * @returns the branch and the working-directory path on one line.
     */
    function GitBar(props) {
      const t = typeof props.t === 'function' ? props.t : key => key
      const sessionId = props.sessionId
      const projected = typeof props.useProjection === 'function'
        ? props.useProjection(DIRECTORY_PROJECTION)
        : undefined
      const [answer, setAnswer] = React.useState(null)

      React.useEffect(() => {
        if (sessionId === undefined) return undefined
        const controller = new AbortController()
        let active = true
        let startedAt = 0

        const load = async () => {
          startedAt = Date.now()
          const next = await readState(sessionId, controller.signal)
          if (!active || next === undefined) return
          setAnswer((previous) => {
            // A dropped read keeps the branch that was already known instead of
            // blanking the line until the route answers again.
            if (next.failed === true && previous !== null
              && previous.sessionId === sessionId && previous.failed !== true) return previous
            return next
          })
        }

        const refresh = () => {
          if (Date.now() - startedAt < REFRESH_GAP_MS) return
          void load()
        }

        void load()
        const timer = window.setInterval(() => {
          if (document.visibilityState === 'visible') void load()
        }, REFRESH_MS)
        document.addEventListener('visibilitychange', refresh)
        window.addEventListener('focus', refresh)

        return () => {
          active = false
          controller.abort()
          window.clearInterval(timer)
          document.removeEventListener('visibilitychange', refresh)
          window.removeEventListener('focus', refresh)
        }
      }, [sessionId])

      const current = answer !== null && answer.sessionId === sessionId ? answer : null
      const branch = branchOf(current, t)
      const known = branch.kind === 'branch' || branch.kind === 'detached'
      // The projection is the committed directory and updates as the Session
      // moves, so it wins over a route answer that may be one poll behind.
      const path = typeof projected === 'string' && projected !== ''
        ? projected
        : current !== null && typeof current.path === 'string' && current.path !== '' ? current.path : null

      const shown = path === null ? null : tildeOf(path, current?.home)

      return h('div', { className: 'gb-bar', 'data-git-bar': '' }, [
        h('style', { key: 'css' }, CSS),
        h('div', { key: 'row', className: 'gb-row' }, [
          h('span', { key: 'glyph', className: 'gb-glyph', 'aria-hidden': 'true' }, h(BranchGlyph)),
          h('span', {
            key: 'branch',
            className: 'gb-branch',
            'data-known': known ? 'true' : 'false',
            title: known ? branch.text : undefined
          }, branch.text),
          h('span', { key: 'sep', className: 'gb-sep', 'aria-hidden': 'true' }, '·'),
          shown === null
            ? h('span', { key: 'path', className: 'gb-path-missing' }, t('path.unavailable'))
            : h('code', { key: 'path', className: 'gb-path', title: path }, shown)
        ])
      ])
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'git-bar: dictionaries')
        ctx.slots.inject(SLOT, () => ctx.slots.register({
          name: SLOT,
          id: ENTRY_ID,
          order: 19,
          locale: NS
        }, GitBar))
      }
    }
  }
})
