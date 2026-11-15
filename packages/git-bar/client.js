/**
 * Git bar — Client half.
 *
 * Registers one slim, full-width line in the composer's input dock, directly
 * above the composer card. The line always names the branch of the directory
 * the Session works in; its Path button opens a second full-width line with
 * that directory's absolute path. The branch arrives from this bundle's Host
 * route, and the path reads the `workingDirectory` projection first, so it
 * follows a directory change immediately and works even when the route cannot
 * be reached.
 *
 * A full-width line rather than a chip in the readings row below the composer:
 * a branch name is occasionally long, and a centered row of statistics pills
 * has neither the width to show it nor a sensible place to grow a path line.
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
      'branch.loading': '…',
      'branch.notGit': 'Not a Git checkout',
      'branch.unreadable': 'Branch unreadable',
      'branch.unknownRef': 'No branch',
      'branch.unavailable': 'Branch unavailable',
      detached: 'Detached at {commit}',
      'aria.branch': 'Git branch: {branch}',
      'aria.detached': 'Detached Git revision: {commit}',
      'aria.loading': 'Reading the Git branch',
      'aria.none': 'The Git branch is unavailable',
      'path.button': 'Path',
      'toggle.show': 'Show the working directory path',
      'toggle.hide': 'Hide the working directory path',
      'path.label': 'Working directory path',
      'path.unavailable': 'Path unavailable'
    }

    const zh = {
      'branch.loading': '…',
      'branch.notGit': '不是 Git 工作区',
      'branch.unreadable': '无法读取分支',
      'branch.unknownRef': '没有分支',
      'branch.unavailable': '分支不可用',
      detached: '分离 HEAD：{commit}',
      'aria.branch': 'Git 分支：{branch}',
      'aria.detached': '分离 HEAD 的提交：{commit}',
      'aria.loading': '正在读取 Git 分支',
      'aria.none': 'Git 分支不可用',
      'path.button': '路径',
      'toggle.show': '显示工作目录的绝对路径',
      'toggle.hide': '收起工作目录的绝对路径',
      'path.label': '工作目录的绝对路径',
      'path.unavailable': '路径不可用'
    }

    // Width and typing follow the other full-width strips in this dock (GoalBar's
    // `.dock`/`.bar`), so the line's edges line up with the composer card. The
    // line is chrome, not a card: transparent and borderless while closed, so it
    // does not compete with the contextual cards in the same stack.
    const CSS = `
.gb-bar { box-sizing: border-box; width: calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset)); margin: 0 auto; }
.gb-bar, .gb-bar * { box-sizing: border-box; }
.gb-frame { width: 100%; max-width: calc(var(--dsh-composer-card-max-width) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset)); margin: 0 auto; border-radius: var(--dsw-radius-md, 10px); }
.gb-frame[data-expanded="true"] { padding-bottom: 7px; background: var(--dsw-alias-bg-layer-1); }
.gb-row { display: flex; align-items: center; gap: 8px; min-height: 26px; padding: 0 6px; }
.gb-glyph { display: inline-flex; flex: none; color: var(--dsw-alias-label-secondary); }
.gb-branch { flex: 0 1 auto; min-width: 0; overflow: hidden; color: var(--dsw-alias-label-primary); font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px); font-weight: 500; line-height: 18px; text-overflow: ellipsis; white-space: nowrap; }
.gb-branch[data-known="false"] { color: var(--dsw-alias-label-secondary); font-weight: 400; }
.gb-toggle { display: inline-flex; flex: none; align-items: center; gap: 2px; height: 22px; padding: 0 6px; border: 0; border-radius: var(--dsw-radius-sm, 6px); background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px); cursor: pointer; }
@media (hover: hover) { .gb-toggle:hover { background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary); } }
.gb-toggle:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
.gb-toggle svg { display: block; transition: transform 140ms ease; }
.gb-frame[data-expanded="true"] .gb-toggle svg { transform: rotate(180deg); }
.gb-path { display: block; padding: 0 6px; }
.gb-path[hidden] { display: none; }
.gb-path-text { display: block; color: var(--dsw-alias-label-secondary); font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace); font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px); line-height: 18px; overflow-wrap: anywhere; text-align: left; user-select: text; }
.gb-path-missing { display: block; color: var(--dsw-alias-label-secondary); font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px); line-height: 18px; text-align: left; }
@media (prefers-reduced-motion: reduce) { .gb-toggle svg { transition: none; } }
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

    /** The disclosure mark; points down while the path line is hidden. */
    function ChevronGlyph() {
      return h('svg', {
        width: 12,
        height: 12,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true',
        focusable: 'false'
      }, h('path', {
        d: 'M4.5 6.25 8 9.75l3.5-3.5',
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round'
      }))
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
     * Describe the branch line for the current answer.
     * @param answer - the route's answer for this Session, or null before the first one.
     * @param t - the locale translate function.
     * @returns the line's text, what it describes, and whether it names a revision.
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
     * Describe the line for assistive technology.
     * @param branch - the branch line from {@link branchOf}.
     * @param commit - the short detached commit, when the line names one.
     * @param t - the locale translate function.
     * @returns the group's accessible name.
     */
    function accessibleName(branch, commit, t) {
      switch (branch.kind) {
        case 'branch': return t('aria.branch', { branch: branch.text })
        case 'detached': return t('aria.detached', { commit: commit ?? branch.text })
        case 'loading': return t('aria.loading')
        default: return t('aria.none')
      }
    }

    /**
     * The line above the composer.
     * @param props - the dock's standard props, the locale seat, and the owner values.
     * @returns the branch reading and, once opened, the working-directory path line.
     */
    function GitBar(props) {
      const t = typeof props.t === 'function' ? props.t : key => key
      const sessionId = props.sessionId
      const projected = typeof props.useProjection === 'function'
        ? props.useProjection(DIRECTORY_PROJECTION)
        : undefined
      const pathId = React.useId()
      const [expanded, setExpanded] = React.useState(false)
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
      const toggleLabel = t(expanded ? 'toggle.hide' : 'toggle.show')

      return h('div', { className: 'gb-bar', 'data-git-bar': '' }, [
        h('style', { key: 'css' }, CSS),
        h('div', {
          key: 'frame',
          className: 'gb-frame',
          'data-expanded': expanded ? 'true' : 'false',
          role: 'group',
          'aria-label': accessibleName(branch, current?.commit, t)
        }, [
          h('div', { key: 'row', className: 'gb-row' }, [
            h('span', { key: 'glyph', className: 'gb-glyph' }, h(BranchGlyph)),
            h('span', {
              key: 'branch',
              className: 'gb-branch',
              'data-known': known ? 'true' : 'false',
              title: known ? branch.text : undefined
            }, branch.text),
            h('button', {
              key: 'toggle',
              type: 'button',
              className: 'gb-toggle',
              'aria-expanded': expanded,
              'aria-controls': pathId,
              'aria-label': toggleLabel,
              title: toggleLabel,
              onClick: () => { setExpanded(next => !next) }
            }, [
              h('span', { key: 'label' }, t('path.button')),
              h(ChevronGlyph)
            ])
          ]),
          h('div', {
            key: 'path',
            id: pathId,
            className: 'gb-path',
            role: 'group',
            'aria-label': t('path.label'),
            hidden: !expanded
          }, path === null
            ? h('span', { className: 'gb-path-missing' }, t('path.unavailable'))
            : h('code', { className: 'gb-path-text' }, path))
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
