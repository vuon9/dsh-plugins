/**
 * Skills pane — Client half.
 *
 * Registers one right-sidebar tab type (`skills`) and its guide card. The body
 * draws the finished `skillsPane` projection: each skill's size, reload count,
 * context positions, and turn, plus a context map of where the live copies
 * sit. Skills whose instructions a compaction removed stay listed, struck
 * through.
 *
 * Nothing is read from the Host beyond the projection value.
 */
window.__ModuleLoader__.load({
  id: 'dsh-skills-pane',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'skillsPane'
    /** Tab-type identity; also the key of the body and title seats. */
    const TAB_ID = 'dsh-skills-pane'
    /** The page kind the guide card opens. */
    const TAB_KIND = 'skills'
    /** How long the pane waits for a projection before calling it unavailable. */
    const UNAVAILABLE_AFTER_MS = 8000

    const en = {
      tab: 'Skills',
      'guide.title': 'Skills',
      'guide.description': 'Every skill loaded in this conversation',
      title: 'Skills',
      loading: 'Reading skills…',
      'empty.title': 'No skills loaded',
      'empty.body': 'Skills appear here when the agent loads one, or when you type /name in a message.',
      'unavailable.title': 'Skill data is unavailable',
      'unavailable.body': 'The Skills pane projection is not answering. Reload the page, or check that the bundle is enabled.',
      'bar.aria': 'Skills take up {share} of the context',
      'bar.title': 'Skills: {tokens} of {total} context tokens',
      'share.suffix': 'of context',
      'legend.small': '<2k',
      'legend.medium': '2–6k',
      'legend.large': '6k+',
      'size.title': 'Context size: {tokens} tokens',
      'position.title': 'Where the loaded copies sit in the context',
      'turn.title': 'Loaded in turn {turn}',
      'reloads.one': '1 reload',
      'reloads.other': '{count} reloads',
      'struckRow': 'left the context after compacting',
      'struckNote': 'Struck skills left the context when the conversation was compacted.'
    }

    const zh = {
      tab: '技能',
      'guide.title': '技能',
      'guide.description': '当前对话加载过的每个技能',
      title: '技能',
      loading: '正在读取技能…',
      'empty.title': '还没有加载技能',
      'empty.body': '智能体通过 skill 工具加载技能，或在消息中输入 /名称 直接调用后，会显示在这里。',
      'unavailable.title': '无法读取技能数据',
      'unavailable.body': '技能面板的后台投影没有响应。刷新页面，或检查这个插件是否已启用。',
      'bar.aria': '技能占上下文的 {share}',
      'bar.title': '技能：{tokens} / 上下文 {total} 个 token',
      'share.suffix': '的上下文',
      'legend.small': '<2k',
      'legend.medium': '2–6k',
      'legend.large': '6k+',
      'size.title': '上下文大小：{tokens} 个 token',
      'position.title': '已加载副本在上下文中的位置',
      'turn.title': '在第 {turn} 轮加载',
      'reloads.one': '重新加载 1 次',
      'reloads.other': '重新加载 {count} 次',
      'struckRow': '压缩后已离开上下文',
      'struckNote': '加删除线的技能已因会话压缩离开上下文。'
    }

    const CSS = `
.sp-root { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: auto; padding: 14px 16px 20px; color: var(--dsw-alias-label-primary); font-size: var(--dsh-content-font-size-secondary, 13px); line-height: 1.5; }
.sp-root, .sp-root * { box-sizing: border-box; }
.sp-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin: 0 0 10px; }
.sp-title { margin: 0; font-size: 1.08em; font-weight: 600; letter-spacing: .01em; color: var(--dsw-alias-label-primary); }
.sp-meter { display: flex; align-items: center; gap: 10px; }
.sp-bar { position: relative; flex: 1 1 auto; height: 8px; border-radius: 3px; background: var(--dsw-alias-border-l1); overflow: hidden; }
.sp-seg { position: absolute; top: 0; bottom: 0; min-width: 2px; border-radius: 2px; }
.sp-seg.sp-small { background: var(--dsw-alias-state-success-primary); }
.sp-seg.sp-medium { background: var(--dsw-alias-state-warn-primary); }
.sp-seg.sp-large { background: var(--dsw-alias-state-error-primary); }
.sp-share { flex: none; font-size: .92em; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.sp-share-suffix { color: var(--dsw-alias-label-secondary); }
.sp-legend { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 8px 0 10px; font-size: .86em; color: var(--dsw-alias-label-secondary); }
.sp-legend-item { display: inline-flex; align-items: center; gap: 5px; }
.sp-dot { flex: none; width: 7px; height: 7px; border-radius: 2px; }
.sp-dot.sp-small { background: var(--dsw-alias-state-success-primary); }
.sp-dot.sp-medium { background: var(--dsw-alias-state-warn-primary); }
.sp-dot.sp-large { background: var(--dsw-alias-state-error-primary); }
.sp-list { list-style: none; margin: 0; padding: 0; }
.sp-row { padding: 3px 0; min-width: 0; }
.sp-line { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 4px; row-gap: 3px; min-width: 0; }
.sp-name-wrap { display: inline-flex; align-items: flex-start; gap: 7px; min-width: 0; max-width: 100%; }
.sp-name-wrap .sp-dot { margin-top: 6px; }
.sp-name { font-weight: 500; overflow-wrap: anywhere; }
.sp-reloads { flex: none; align-self: flex-start; margin-top: 2px; font-size: .86em; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.sp-meta { display: inline-flex; flex-wrap: wrap; align-items: baseline; column-gap: 8px; margin-left: 14px; color: var(--dsw-alias-label-secondary); font-size: .92em; font-variant-numeric: tabular-nums; }
.sp-row[data-struck="true"] .sp-name,
.sp-row[data-struck="true"] .sp-reloads,
.sp-row[data-struck="true"] .sp-meta { color: var(--dsw-alias-label-secondary); text-decoration: line-through; }
.sp-row[data-struck="true"] .sp-dot { opacity: .45; }
.sp-note { margin: 0 0 10px; color: var(--dsw-alias-label-secondary); font-size: .86em; line-height: 1.45; }
.sp-state { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; margin: 18px 0 0; color: var(--dsw-alias-label-secondary); }
.sp-state-mark { color: var(--dsw-alias-label-secondary); opacity: .5; }
.sp-state-title { margin: 0; color: var(--dsw-alias-label-primary); font-weight: 600; }
.sp-state-body { margin: 0; font-size: .92em; }
.sp-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
`

    /**
     * Format a token count the way the pane's sizes read: 0.1k, 2.3k, 12k, 1.4M.
     * Sizes truncate so a value under 2k never reads "2.0k" beside a green mark.
     * @param value - token count.
     * @returns the compact label.
     */
    function formatTokens(value) {
      if (value < 100) return String(Math.max(0, Math.round(value)))
      if (value < 10000) return (Math.floor(value / 100) / 10).toFixed(1) + 'k'
      if (value < 1000000) return Math.floor(value / 1000) + 'k'
      return (value / 1000000).toFixed(1) + 'M'
    }

    /**
     * Join the positions of a skill's shown copies, oldest to newest.
     * @param positions - context percentages in load order.
     * @returns one percentage, or an arrow chain when it loaded more than once.
     */
    function positionText(positions) {
      if (positions.length === 0) return '–'
      return positions.join('→') + '%'
    }

    /** The guide card's glyph; inherits the card's ink. */
    function SkillsGlyph(props) {
      const size = typeof props.size === 'number' ? props.size : 18
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        'aria-hidden': 'true',
        focusable: 'false',
        style: { display: 'block' }
      }, [
        h('rect', { key: 'a', x: 5, y: 5, width: 14, height: 3.6, rx: 1.8, fill: 'currentColor', opacity: 0.45 }),
        h('rect', { key: 'b', x: 6.5, y: 10.2, width: 11, height: 3.6, rx: 1.8, fill: 'currentColor', opacity: 0.72 }),
        h('rect', { key: 'c', x: 8, y: 15.4, width: 8, height: 3.6, rx: 1.8, fill: 'currentColor' })
      ])
    }

    /**
     * The context map, its share reading, and the size legend.
     * @param props - the projection value's segments and share, plus copy.
     * @returns the bar, the share reading, and the legend.
     */
    function SkillsMeter(props) {
      const { view, t } = props
      const shareValue = view.skillTokens > 0 && view.share === 0 ? '<1%' : view.share + '%'
      const shareText = shareValue + ' ' + t('share.suffix')
      const title = t('bar.title', {
        tokens: formatTokens(view.skillTokens),
        total: formatTokens(view.contextTokens)
      })
      const segments = view.segments.map((segment, index) => h('span', {
        key: index,
        className: 'sp-seg sp-' + segment.bracket,
        style: { left: segment.start + '%', width: segment.width + '%' },
        title: segment.name
      }))
      return h(React.Fragment, null,
        h('div', { key: 'meter', className: 'sp-meter' }, [
          h('div', {
            key: 'bar',
            className: 'sp-bar',
            role: 'img',
            'aria-label': t('bar.aria', { share: shareValue }),
            title
          }, segments),
          h('span', { key: 'share', className: 'sp-share', title }, [
            h('span', { key: 'value' }, shareValue),
            ' ',
            h('span', { key: 'suffix', className: 'sp-share-suffix' }, t('share.suffix'))
          ])
        ]),
        h('div', { key: 'legend', className: 'sp-legend' }, ['small', 'medium', 'large'].map(bracket => h('span', {
          key: bracket,
          className: 'sp-legend-item'
        }, [
          h('span', { key: 'dot', className: 'sp-dot sp-' + bracket, 'aria-hidden': 'true' }),
          h('span', { key: 'label' }, t('legend.' + bracket))
        ])))
      )
    }

    /**
     * One skill row: name, reload count, size, positions, and turn.
     * @param props - the projected row and copy.
     * @returns the row.
     */
    function SkillRow(props) {
      const { row, t } = props
      const struck = row.current !== true
      const reloadText = row.reloads === 1 ? t('reloads.one') : t('reloads.other', { count: row.reloads })
      const sizeText = formatTokens(row.size)
      const positions = positionText(row.positions)
      return h('li', {
        className: 'sp-row',
        'data-struck': struck ? 'true' : undefined,
        'data-skill': row.name,
        title: struck ? t('struckRow') : undefined
      }, [
        h('div', { key: 'line', className: 'sp-line' }, [
          h('span', { key: 'name', className: 'sp-name-wrap' }, [
            h('span', { key: 'dot', className: 'sp-dot sp-' + row.bracket, 'aria-hidden': 'true' }),
            h('span', { key: 'label', className: 'sp-name' }, row.name),
            row.reloads > 0 ? h('span', {
              key: 'reloads',
              className: 'sp-reloads',
              title: reloadText,
              'aria-label': reloadText
            }, '[+' + row.reloads + ']') : null
          ]),
          h('span', { key: 'meta', className: 'sp-meta' }, [
            h('span', { key: 'size', className: 'sp-size', title: t('size.title', { tokens: sizeText }) }, sizeText),
            h('span', { key: 'position', className: 'sp-position', title: t('position.title') }, positions),
            h('span', { key: 'turn', className: 'sp-turn', title: t('turn.title', { turn: row.turn }) }, 't' + row.turn)
          ])
        ]),
        struck ? h('span', { key: 'sr', className: 'sp-sr' }, t('struckRow')) : null
      ])
    }

    /**
     * The Skills tab body.
     * @param props - standard tab props (`useProjection`) and the locale seat.
     * @returns the meter and the skill rows, or a loading, unavailable, or empty state.
     */
    function SkillsPane(props) {
      const t = typeof props.t === 'function' ? props.t : key => key
      const view = props.useProjection('skillsPane')
      const [slow, setSlow] = React.useState(false)
      React.useEffect(() => {
        const timer = window.setTimeout(() => setSlow(true), UNAVAILABLE_AFTER_MS)
        return () => window.clearTimeout(timer)
      }, [])

      if (view === undefined || !Array.isArray(view.rows)) {
        return h('div', { className: 'sp-root' }, [
          h('style', { key: 'css' }, CSS),
          h('div', { key: 'state', className: 'sp-state', role: 'status' }, [
            h('div', { key: 'mark', className: 'sp-state-mark' }, h(SkillsGlyph, { size: 30 })),
            h('p', { key: 'title', className: 'sp-state-title' }, t(slow ? 'unavailable.title' : 'loading')),
            slow ? h('p', { key: 'body', className: 'sp-state-body' }, t('unavailable.body')) : null
          ])
        ])
      }

      if (view.rows.length === 0) {
        return h('div', { className: 'sp-root' }, [
          h('style', { key: 'css' }, CSS),
          h('div', { key: 'empty', className: 'sp-state', role: 'status' }, [
            h('div', { key: 'mark', className: 'sp-state-mark' }, h(SkillsGlyph, { size: 30 })),
            h('p', { key: 'title', className: 'sp-state-title' }, t('empty.title')),
            h('p', { key: 'body', className: 'sp-state-body' }, t('empty.body'))
          ])
        ])
      }

      const struck = view.rows.some(row => row.current !== true)
      return h('div', { className: 'sp-root' }, [
        h('style', { key: 'css' }, CSS),
        h('div', { key: 'head', className: 'sp-head' }, h('h2', { className: 'sp-title' }, t('title'))),
        h(SkillsMeter, { key: 'meter', view, t }),
        struck ? h('p', { key: 'note', className: 'sp-note' }, t('struckNote')) : null,
        h('ul', { key: 'list', className: 'sp-list' }, view.rows.map(row => h(SkillRow, { key: row.name, row, t })))
      ])
    }

    return {
      inject: ['slots', 'locale', 'sidebarRightTabs'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'skills-pane: dictionaries')
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: TAB_ID,
          kind: TAB_KIND,
          priority: 'extension',
          title: () => t('tab'),
          guide: [{
            id: 'skills',
            order: 14,
            title: () => t('guide.title'),
            description: () => t('guide.description'),
            icon: SkillsGlyph
          }]
        }), 'skills-pane: tab type')
        ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: TAB_ID,
          locale: NS
        }, SkillsPane))
      }
    }
  }
})
