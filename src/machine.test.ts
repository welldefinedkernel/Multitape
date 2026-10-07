import { describe, expect, it } from 'vitest'
import {
  BLANK,
  createExample,
  initialSnapshot,
  parseReadSymbols,
  readCell,
  resizeTapes,
  stepMachine,
  validateMachine,
  type MachineDefinition,
} from './machine'

describe('multitape simulation', () => {
  it('parses read alternatives while preserving literal symbols and blanks', () => {
    expect(parseReadSymbols('0,1')).toEqual(['0', '1'])
    expect(parseReadSymbols('{1, 0, 1}')).toEqual(['1', '0'])
    expect(parseReadSymbols('{0, lambda, \\lambda}')).toEqual(['0', BLANK])
    for (const symbol of ['0', ',', '{', '}']) {
      expect(parseReadSymbols(symbol)).toEqual([symbol])
    }
    for (const blank of ['', ' ', BLANK, 'lambda', '\\lambda']) {
      expect(parseReadSymbols(blank)).toEqual([BLANK])
    }
    for (const invalid of [
      'ab',
      '{}',
      '{0,}',
      '0,,1',
      '{0,1',
      '0,1}',
      '{0,ab}',
    ]) {
      expect(parseReadSymbols(invalid)).toEqual([])
    }
  })

  it('matches all combinations of per-tape read alternatives', () => {
    const definition = createExample('blank')
    definition.transitions = [
      {
        id: 'alternatives',
        from: 'start',
        to: 'done',
        read: ['{0,1}', '{a,b}'],
        write: ['X', 'Y'],
        move: ['R', 'L'],
      },
    ]
    for (const input of ['0', '1']) {
      for (const workSymbol of ['a', 'b']) {
        definition.input = input
        const initial = initialSnapshot(definition)
        initial.tapes[1].symbols = [workSymbol]
        expect(validateMachine(definition)).toEqual([])
        const snapshot = stepMachine(definition, initial)
        expect(snapshot.status).toBe('halted')
        expect(snapshot.tapes.map((tape) => readCell(tape, 0))).toEqual([
          'X',
          'Y',
        ])
        expect(snapshot.tapes.map((tape) => tape.head)).toEqual([1, -1])
      }
    }
    const unmatched = initialSnapshot(definition)
    unmatched.tapes[1].symbols = ['c']
    expect(stepMachine(definition, unmatched).status).toBe('stuck')
  })

  it('supports blank alternatives and leaves write fields single-symbol', () => {
    const definition = createExample('blank')
    definition.transitions = [
      {
        id: 'blank-set',
        from: 'start',
        to: 'done',
        read: ['{0,lambda}', BLANK],
        write: ['1', BLANK],
        move: ['N', 'N'],
      },
    ]
    expect(stepMachine(definition, initialSnapshot(definition)).status).toBe(
      'halted',
    )
    definition.transitions[0].write[0] = '{0,1}'
    expect(validateMachine(definition).join(' ')).toContain(
      'one character per write symbol',
    )
  })

  it('rejects overlapping read sets only when every tape can match', () => {
    const definition = createExample('blank')
    definition.transitions = [
      {
        id: 'first',
        from: 'start',
        to: 'done',
        read: ['{0,1}', '{a,b}'],
        write: ['0', 'a'],
        move: ['N', 'N'],
      },
      {
        id: 'second',
        from: 'start',
        to: 'done',
        read: ['1', '{b,c}'],
        write: ['1', 'b'],
        move: ['N', 'N'],
      },
    ]
    expect(validateMachine(definition).join(' ')).toContain(
      'overlapping inputs',
    )
    definition.transitions[1].read[1] = 'c'
    expect(validateMachine(definition)).toEqual([])
    definition.transitions[1].read = ['{1,0}', '{b,a}']
    expect(validateMachine(definition).join(' ')).toContain(
      'overlapping inputs',
    )
  })

  it('starts the input head on the first symbol and the other tapes blank', () => {
    const snapshot = initialSnapshot(createExample())
    expect(snapshot.tapes.map((tape) => tape.head)).toEqual([0, 0])
    expect(readCell(snapshot.tapes[0], 0)).toBe('1')
    expect(snapshot.tapes[1].symbols).toEqual([BLANK])
    expect(snapshot.steps).toBe(0)
  })

  it('copies the input using simultaneous reads and writes, then halts', () => {
    const definition = createExample()
    let snapshot = initialSnapshot(definition)
    for (let step = 0; step < 7; step++)
      snapshot = stepMachine(definition, snapshot)
    expect(snapshot.status).toBe('halted')
    expect(snapshot.stateId).toBe('done')
    expect(snapshot.steps).toBe(7)
    expect(snapshot.tapes.map((tape) => tape.head)).toEqual([6, 6])
    expect(
      Array.from({ length: 6 }, (_, index) =>
        readCell(snapshot.tapes[1], index),
      ).join(''),
    ).toBe('101101')
    expect(stepMachine(definition, snapshot)).toBe(snapshot)
  })

  it('treats empty input and lambda as blank without shifting the head', () => {
    for (const input of ['', BLANK, ' ']) {
      const definition = { ...createExample(), input }
      const snapshot = stepMachine(definition, initialSnapshot(definition))
      expect(snapshot.status).toBe('halted')
      expect(snapshot.tapes[0].head).toBe(0)
      expect(snapshot.steps).toBe(1)
    }
    const snapshot = initialSnapshot({
      ...createExample(),
      input: `1${BLANK}0`,
    })
    expect(snapshot.tapes[0].symbols).toEqual(['1', BLANK, '0'])
  })

  it('moves left of the input origin and preserves immutable snapshots', () => {
    const definition: MachineDefinition = {
      ...createExample('invert'),
      input: '1',
      transitions: [
        {
          id: 'left',
          from: 'start',
          to: 'start',
          read: ['1'],
          write: ['0'],
          move: ['L'],
        },
        {
          id: 'return',
          from: 'start',
          to: 'done',
          read: [BLANK],
          write: ['X'],
          move: ['R'],
        },
      ],
    }
    const initial = initialSnapshot(definition)
    const left = stepMachine(definition, initial)
    expect(left.tapes[0].head).toBe(-1)
    expect(readCell(left.tapes[0], 0)).toBe('0')
    expect(readCell(left.tapes[0], -1)).toBe(BLANK)
    const returned = stepMachine(definition, left)
    expect(returned.tapes[0].head).toBe(0)
    expect(readCell(returned.tapes[0], -1)).toBe('X')
    expect(readCell(returned.tapes[0], 0)).toBe('0')
    expect(initial.tapes[0].symbols).toEqual(['1'])
    expect(initial.tapes[0].head).toBe(0)
  })

  it('supports independent left, right, and stay movements on three tapes', () => {
    const definition = resizeTapes(createExample(), 3)
    definition.transitions[1].move = ['L', 'R', 'N']
    definition.transitions[1].write = ['X', 'Y', 'Z']
    const snapshot = stepMachine(definition, initialSnapshot(definition))
    expect(snapshot.tapes.map((tape) => tape.head)).toEqual([-1, 1, 0])
    expect(snapshot.tapes.map((tape) => readCell(tape, 0))).toEqual([
      'X',
      'Y',
      'Z',
    ])
  })

  it('stops without counting a phantom step when no transition matches', () => {
    const definition = { ...createExample(), input: 'x' }
    const snapshot = stepMachine(definition, initialSnapshot(definition))
    expect(snapshot.status).toBe('stuck')
    expect(snapshot.steps).toBe(0)
    expect(snapshot.tapes[0].head).toBe(0)
  })

  it('accepts custom state names, including spaces and parentheses', () => {
    const definition = createExample()
    definition.states[0].name = 'copy (first tape)'
    expect(validateMachine(definition)).toEqual([])
    expect(stepMachine(definition, initialSnapshot(definition)).steps).toBe(1)
  })

  it('rejects duplicate transitions and invalid state names', () => {
    const definition = createExample()
    definition.transitions.push({
      ...definition.transitions[0],
      id: 'duplicate',
    })
    expect(validateMachine(definition).join(' ')).toContain(
      'same state and read symbols',
    )
    definition.states[1].name = definition.states[0].name
    expect(validateMachine(definition)).toContain('State names must be unique.')
  })

  it('resizes all transition vectors with blank and stay defaults', () => {
    const expanded = resizeTapes(createExample(), 4)
    expect(expanded.transitions[0].read).toEqual(['0', BLANK, BLANK, BLANK])
    expect(expanded.transitions[0].move).toEqual(['R', 'R', 'N', 'N'])
    expect(validateMachine(expanded)).toEqual([])
    expect(resizeTapes(expanded, 1).transitions[0].write).toEqual(['0'])
  })
})
