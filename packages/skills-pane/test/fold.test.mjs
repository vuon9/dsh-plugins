import assert from 'node:assert/strict'
import { apply } from '../index.js'

let definition
await apply({
  sessionProjections: {
    register: async (candidate) => {
      definition = candidate
      return { dispose: async () => {} }
    }
  }
})
assert.ok(definition, 'the plugin registers one projection')

let seq = 0
const event = (type, data, surfaceOp) => {
  seq += 1
  const base = { type, seq, time: seq, data }
  if (surfaceOp !== undefined) base.surfaceOp = surfaceOp
  return base
}
const text = (value) => [{ type: 'text', text: value }]
const skillBody = (name, repeats) => `<skill_content name="${name}">\n` + 'x'.repeat(repeats) + '\n</skill_content>'
const price = (value) => Math.ceil(value.length / 4) + 8

let current = definition.init({}, 0)
assert.deepEqual(current, { total: 0, nodes: [], loads: [], pending: [], turn: 0 })

// 1. A session with one skill load through the tool.
current = definition.apply(current, event('turn/start', { turn: 1 }))
current = definition.apply(current, event('system/message', {
  turn: 1, step: 1, message: { role: 'system', content: text('sys') }
}, 'append'))
current = definition.apply(current, event('user/message', {
  role: 'user', content: text('please load vmode'), source: { kind: 'user' }
}, 'append'))
current = definition.apply(current, event('step/start', { turn: 1, step: 1 }))
current = definition.apply(current, event('tool/call', {
  turn: 1, step: 1, callId: 'call_vmode', name: 'skill', arguments: '{"name":"vmode"}'
}))
const vmodeFirstSeq = seq + 1
const vmodeBody = skillBody('vmode', 400)
current = definition.apply(current, event('tool/result', {
  turn: 1, step: 1,
  message: { role: 'tool', content: text(vmodeBody), source: { kind: 'tool', callId: 'call_vmode' } }
}, 'append'))
current = definition.apply(current, event('turn/end', { turn: 1, reason: 'completed' }))

let view = definition.wire.view(current)
assert.equal(view.rows.length, 1)
assert.equal(view.rows[0].name, 'vmode')
assert.equal(view.rows[0].current, true)
assert.equal(view.rows[0].loads, 1)
assert.equal(view.rows[0].reloads, 0)
assert.equal(view.rows[0].size, price(vmodeBody))
assert.equal(view.rows[0].turn, 1)
assert.equal(view.rows[0].positions.length, 1)
assert.equal(view.rows[0].bracket, 'small')
assert.equal(view.segments.length, 1)
assert.equal(view.segments[0].name, 'vmode')
assert.equal(view.share, Math.round(view.skillTokens / view.contextTokens * 100))

// 2. The same skill reloads in a later turn, so the reload count and positions grow.
current = definition.apply(current, event('turn/start', { turn: 2 }))
current = definition.apply(current, event('step/start', { turn: 2, step: 1 }))
current = definition.apply(current, event('tool/call', {
  turn: 2, step: 1, callId: 'call_vmode_2', name: 'skill', arguments: '{"name":"vmode"}'
}))
current = definition.apply(current, event('tool/result', {
  turn: 2, step: 1,
  message: { role: 'tool', content: text(vmodeBody), source: { kind: 'tool', callId: 'call_vmode_2' } }
}, 'append'))
view = definition.wire.view(current)
assert.equal(view.rows[0].loads, 2)
assert.equal(view.rows[0].reloads, 1)
assert.equal(view.rows[0].positions.length, 2)
assert.ok(view.rows[0].positions[1] >= view.rows[0].positions[0])
assert.equal(view.segments.length, 2)

// 3. A compaction replaces the range holding the first copy; the skill stays current through the second.
const firstNodes = current.nodes.map(node => node.seq)
assert.equal(firstNodes[2], vmodeFirstSeq)
current = definition.apply(current, event('compaction/summary', {
  compactionId: 'c1', summary: text('summary'), shadowedRange: { start: firstNodes[0], end: firstNodes[2] },
  shadowedSeqs: firstNodes.slice(0, 3), shadowedTokenCount: 100, provider: 'p', model: 'm'
}))
current = definition.apply(current, event('user/message', {
  role: 'user', content: text('summary of the compacted work'), source: { kind: 'compaction' }
}, { op: 'replace', startSeq: firstNodes[0], endSeq: firstNodes[2] }))
view = definition.wire.view(current)
assert.equal(view.rows[0].current, true)
assert.equal(view.rows[0].positions.length, 1, 'only the live copy is described')
assert.equal(view.segments.length, 1, 'the shadowed copy leaves the context map')

// 4. A second compaction removes the other copy, so the row is struck at its last position.
const remaining = current.nodes.map(node => node.seq)
current = definition.apply(current, event('compaction/summary', {
  compactionId: 'c2', summary: text('summary'), shadowedRange: { start: remaining[0], end: remaining[remaining.length - 1] },
  shadowedSeqs: remaining, shadowedTokenCount: 100, provider: 'p', model: 'm'
}))
current = definition.apply(current, event('user/message', {
  role: 'user', content: text('all work summarized'), source: { kind: 'compaction' }
}, { op: 'replace', startSeq: remaining[0], endSeq: remaining[remaining.length - 1] }))
view = definition.wire.view(current)
assert.equal(view.rows[0].current, false)
assert.equal(view.rows[0].positions.length, 2)
assert.equal(view.segments.length, 0)
assert.equal(view.share, 0)

// 5. A user-invoked skill (/name) counts as a load.
current = definition.apply(current, event('turn/start', { turn: 3 }))
current = definition.apply(current, event('step/start', { turn: 3, step: 1 }))
const whyBody = skillBody('why', 9000)
current = definition.apply(current, event('user/message', {
  role: 'user', content: text(whyBody),
  source: { kind: 'skill-invocation', name: 'why', form: 'instructions' }
}, 'append'))
view = definition.wire.view(current)
const why = view.rows.find(row => row.name === 'why')
assert.ok(why, 'the invocation is listed')
assert.equal(why.current, true)
assert.equal(why.turn, 3)
assert.equal(why.size, price(whyBody))
assert.equal(why.bracket, 'medium')

// 6. A failed skill call is not a load.
current = definition.apply(current, event('turn/start', { turn: 4 }))
current = definition.apply(current, event('tool/call', {
  turn: 4, step: 1, callId: 'call_bad', name: 'skill', arguments: '{"name":"missing"}'
}))
current = definition.apply(current, event('tool/result', {
  turn: 4, step: 1,
  message: { role: 'tool', isError: true, content: text('Error: unknown skill'), source: { kind: 'tool', callId: 'call_bad' } }
}, 'append'))
view = definition.wire.view(current)
assert.equal(view.rows.some(row => row.name === 'missing'), false)
assert.equal(current.pending.length, 0)

// 7. Both schemas accept live shapes, and a non-skill event leaves the state reference alone.
definition.stateSchema.parse(current)
definition.wire.viewSchema.parse(view)
assert.throws(() => definition.stateSchema.parse(null))
assert.equal(definition.apply(current, event('llm/retry', { turn: 4, step: 1, attempt: 2 })), current)

// 8. Brackets split at 2k and 6k, and positions fall back to the frozen value.
const bracketView = definition.wire.view({
  ...definition.init({}, 0),
  total: 100000,
  nodes: [],
  loads: [
    { name: 'small', seq: 1, tokens: 1999, turn: 1, position: 0 },
    { name: 'medium', seq: 2, tokens: 2000, turn: 1, position: 7 },
    { name: 'large', seq: 3, tokens: 6000, turn: 1, position: 9 }
  ]
})
assert.equal(bracketView.rows.map(row => row.bracket).join(','), 'small,medium,large')
assert.equal(bracketView.rows.map(row => row.positions[0]).join(','), '0,7,9')
assert.equal(bracketView.rows.every(row => row.current === false), true)

console.log('all skills-pane fold tests passed')
console.log(JSON.stringify(view, null, 2))
