/**
 * Host half of the Skills pane bundle.
 *
 * Folds the session log into the `skillsPane` projection: which skills were
 * loaded, what each load costs in the context, where it sat when it loaded,
 * and whether a later surface replacement (a compaction) removed it. The
 * Client half renders the finished value; this half adds no model input and
 * writes no session event.
 *
 * The fold mirrors the token meter's fixed-density heuristic so a skill's size
 * and the context total agree with the rest of the Harness, and it keeps a
 * positional node list so a replaced range (the summary of a compaction, or a
 * pruned tool result) removes exactly the copies it shadowed.
 */

/** Fixed text density the token meter uses for text blocks. */
const CHARS_PER_TOKEN = 4
/** Structural overhead per content block. */
const BLOCK_OVERHEAD = 4
/** Role framing added to every priced message. */
const ROLE_OVERHEAD = 4
/** Size brackets, in tokens: under 2k, 2k to 6k, 6k and above. */
const MEDIUM_TOKENS = 2000
const LARGE_TOKENS = 6000

/**
 * Price one content block with the same heuristic as the context meter.
 * @param block - a message content block.
 * @returns the block's heuristic token price.
 */
function estimateBlock(block) {
  switch (block.type) {
    case 'text':
    case 'reasoning':
      return Math.ceil(block.text.length / CHARS_PER_TOKEN) + BLOCK_OVERHEAD
    case 'tool-call':
      return Math.ceil(block.name.length / CHARS_PER_TOKEN)
        + Math.ceil(block.arguments.length / CHARS_PER_TOKEN)
        + BLOCK_OVERHEAD
    case 'image': {
      // Structural reference price; the routed image price is the adapter's.
      const { offloaded: _offloaded, ...reference } = block
      return BLOCK_OVERHEAD + Math.ceil(JSON.stringify(reference).length / CHARS_PER_TOKEN)
    }
    default:
      return BLOCK_OVERHEAD + Math.ceil(JSON.stringify(block).length / CHARS_PER_TOKEN)
  }
}

/**
 * Price one model-visible message.
 * @param message - a message with role and content.
 * @returns the message's heuristic token price.
 */
function estimateMessage(message) {
  const blocks = message.content ?? []
  if (message.role === 'system') {
    if (blocks.length === 0) return 0
    let characters = 0
    for (const block of blocks) {
      characters += block.type === 'text' ? block.text.length : JSON.stringify(block).length
    }
    return Math.ceil(characters / CHARS_PER_TOKEN) + ROLE_OVERHEAD
  }
  let tokens = 0
  for (const block of blocks) tokens += estimateBlock(block)
  return tokens + ROLE_OVERHEAD
}

/**
 * Price a surface event's own message.
 * @param event - a committed session event.
 * @returns tokens, or undefined when the event does not produce a surface node.
 */
function priceSurfaceEvent(event) {
  switch (event.type) {
    case 'system/message':
      return estimateMessage(event.data.message)
    case 'user/message':
      return estimateMessage(event.data)
    case 'assistant/message':
      return estimateMessage(event.data.message)
    case 'tool/result':
      return estimateMessage(event.data.message)
    case 'developer/message':
      return estimateMessage(event.data.message)
    default:
      return undefined
  }
}

/**
 * Read the requested skill name from a `skill` tool call's raw arguments.
 * @param raw - the model's raw JSON argument string.
 * @returns the exact skill name, or undefined when it is absent or unreadable.
 */
function skillNameFromArguments(raw) {
  try {
    const parsed = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' && typeof parsed.name === 'string' && parsed.name !== ''
      ? parsed.name
      : undefined
  } catch {
    return undefined
  }
}

/**
 * The size bracket a skill's token count falls in.
 * @param tokens - the skill's size.
 * @returns the bracket id the Client paints.
 */
function bracketOf(tokens) {
  if (tokens < MEDIUM_TOKENS) return 'small'
  return tokens < LARGE_TOKENS ? 'medium' : 'large'
}

/**
 * Express a part as a whole percentage, clamped to 0 through 100.
 * @param part - tokens or a position.
 * @param whole - the context total.
 * @returns the rounded percentage.
 */
function percent(part, whole) {
  if (!(whole > 0)) return 0
  const value = Math.round((part / whole) * 100)
  return value < 0 ? 0 : value > 100 ? 100 : value
}

/** @returns the projection state for an empty session log. */
function emptyState() {
  return { total: 0, nodes: [], loads: [], pending: [], turn: 0 }
}

/**
 * Insert one load at the end of the load log.
 * @param loads - prior loads.
 * @param name - the skill name.
 * @param seq - the surface-event seq carrying its instructions.
 * @param tokens - the load's context price.
 * @param turn - the turn that loaded it.
 * @returns the next load list.
 */
function withLoad(loads, name, seq, tokens, turn) {
  return loads.concat([{ name, seq, tokens, turn, position: 0 }])
}

/**
 * Apply one surface placement and, when the event is a skill load, record the load.
 * @param state - prior state.
 * @param event - a surface event.
 * @param tokens - the event's own node price.
 * @param skill - the loaded skill when this event carried one.
 * @returns the next state.
 */
function placeNode(state, event, tokens, skill) {
  const nodes = state.nodes
  const op = event.surfaceOp

  if (op === undefined || op === 'append') {
    return {
      ...state,
      total: state.total + tokens,
      nodes: nodes.concat([{ seq: event.seq, tokens, skill: skill === undefined ? undefined : skill.name }]),
      loads: skill === undefined ? state.loads : withLoad(state.loads, skill.name, event.seq, tokens, skill.turn),
    }
  }

  const startIdx = nodes.findIndex(node => node.seq === op.startSeq)
  const endIdx = nodes.findIndex(node => node.seq === op.endSeq)
  // Committed logs are surface-validated at append time, so an unresolvable
  // range is corruption; leaving the state untouched keeps the fold honest.
  if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) return state

  let before = 0
  for (let index = 0; index < startIdx; index += 1) before += nodes[index].tokens

  let removed = 0
  let cursor = before
  let loads = state.loads
  for (let index = startIdx; index <= endIdx; index += 1) {
    const node = nodes[index]
    removed += node.tokens
    if (node.skill !== undefined) {
      const at = loads.findIndex(load => load.seq === node.seq)
      if (at !== -1) {
        const frozen = loads.slice()
        frozen[at] = { ...frozen[at], position: percent(cursor, state.total) }
        loads = frozen
      }
    }
    cursor += node.tokens
  }

  const nextNodes = nodes.slice(0, startIdx)
    .concat([{ seq: event.seq, tokens, skill: skill === undefined ? undefined : skill.name }], nodes.slice(endIdx + 1))
  return {
    ...state,
    total: state.total - removed + tokens,
    nodes: nextNodes,
    loads: skill === undefined ? loads : withLoad(loads, skill.name, event.seq, tokens, skill.turn),
  }
}

/**
 * Pure fold over one committed event.
 * @param state - the state covering all prior events.
 * @param event - the next event.
 * @returns the next state, or the same reference when this event is not ours.
 */
function fold(state, event) {
  switch (event.type) {
    case 'turn/start':
    case 'step/start':
      return event.data.turn === state.turn ? state : { ...state, turn: event.data.turn }
    case 'turn/end':
      return state.pending.length === 0 ? state : { ...state, pending: [] }
    case 'tool/call': {
      if (event.data.name !== 'skill') return state
      const name = skillNameFromArguments(event.data.arguments)
      if (name === undefined) return state
      return {
        ...state,
        pending: state.pending.concat([{ callId: event.data.callId, name, turn: event.data.turn }]),
      }
    }
    default: {
      const tokens = priceSurfaceEvent(event)
      if (tokens === undefined) return state

      if (event.type === 'tool/result') {
        const callId = event.data.message.source?.callId
        const at = state.pending.findIndex(entry => entry.callId === callId)
        if (at === -1) return placeNode(state, event, tokens)
        const entry = state.pending[at]
        const next = { ...state, pending: state.pending.filter((_pending, index) => index !== at) }
        if (event.data.message.isError === true) return placeNode(next, event, tokens)
        return placeNode(next, event, tokens, { name: entry.name, turn: entry.turn })
      }

      if (event.type === 'user/message') {
        const source = event.data.source
        if (source !== undefined && source.kind === 'skill-invocation' && typeof source.name === 'string') {
          return placeNode(state, event, tokens, { name: source.name, turn: state.turn })
        }
      }

      return placeNode(state, event, tokens)
    }
  }
}

/**
 * Project the fold state into the Client view.
 * @param state - the current fold state.
 * @returns the whole `skillsPane` value.
 */
function buildView(state) {
  const total = state.total
  const positions = new Map()
  const segments = []
  let running = 0
  let skillTokens = 0

  for (const node of state.nodes) {
    if (node.skill !== undefined) {
      const start = total > 0 ? (running / total) * 100 : 0
      const width = total > 0 ? (node.tokens / total) * 100 : 0
      segments.push({ name: node.skill, start, width, bracket: bracketOf(node.tokens) })
      skillTokens += node.tokens
    }
    positions.set(node.seq, running)
    running += node.tokens
  }

  const grouped = []
  const byName = new Map()
  for (const load of state.loads) {
    const before = positions.get(load.seq)
    const entry = { load, before }
    let group = byName.get(load.name)
    if (group === undefined) {
      group = { name: load.name, copies: [] }
      byName.set(load.name, group)
      grouped.push(group)
    }
    group.copies.push(entry)
  }

  const rows = grouped.map((group) => {
    const live = group.copies.filter(copy => copy.before !== undefined)
    // A row that still has a copy in the context describes that copy; a fully
    // dropped row keeps the last known shape of the copies it lost.
    const shown = live.length > 0 ? live : group.copies
    const latest = shown[shown.length - 1].load
    const rowPositions = shown.map(copy => copy.before === undefined ? copy.load.position : percent(copy.before, total))
    return {
      name: group.name,
      size: latest.tokens,
      loads: group.copies.length,
      reloads: group.copies.length - 1,
      positions: rowPositions,
      turn: latest.turn,
      current: live.length > 0,
      bracket: bracketOf(latest.tokens),
    }
  })

  return {
    contextTokens: total,
    skillTokens,
    share: percent(skillTokens, total),
    rows,
    segments,
    currentCount: rows.reduce((count, row) => count + (row.current ? 1 : 0), 0),
  }
}

/** Validates a checkpointed state row before it seeds a fold. */
const stateSchema = {
  parse(value) {
    if (value === null || typeof value !== 'object') throw new Error('skillsPane: state must be an object')
    if (typeof value.total !== 'number' || !Number.isFinite(value.total) || value.total < 0) {
      throw new Error('skillsPane: state.total must be a non-negative number')
    }
    if (!Array.isArray(value.nodes) || !Array.isArray(value.loads) || !Array.isArray(value.pending)) {
      throw new Error('skillsPane: state lists must be arrays')
    }
    return value
  },
}

/** Validates the wire payload before it leaves the Host. */
const viewSchema = {
  parse(value) {
    if (value === null || typeof value !== 'object' || !Array.isArray(value.rows) || !Array.isArray(value.segments)) {
      throw new Error('skillsPane: view must carry rows and segments')
    }
    return value
  },
}

/** The projection unit this bundle contributes. */
const definition = {
  key: 'skillsPane',
  stateVersion: 1,
  stateSchema,
  init: emptyState,
  apply: fold,
  wire: {
    viewSchema,
    // Session list rows never render this pane; keep summaries lean.
    summary: false,
    view: buildView,
  },
}

export const inject = ['sessionProjections']

/**
 * Register the projection on the resolving fiber.
 * @param ctx - Host context with the projection registry.
 */
export async function apply(ctx) {
  await ctx.sessionProjections.register(definition)
}
