import {
  Alphabet,
  State,
  Tape,
  TapeBlock,
  TuringMachine,
  haltState,
  movements,
} from '@turing-machine-js/machine'

export const BLANK = '\u03bb'
export const MAX_TAPES = 16
export type Direction = 'L' | 'R' | 'N'

export interface NamedState {
  id: string
  name: string
  halt: boolean
}

export interface Transition {
  id: string
  from: string
  to: string
  read: string[]
  write: string[]
  move: Direction[]
}

export interface MachineDefinition {
  name: string
  tapeCount: number
  input: string
  states: NamedState[]
  initialState: string
  transitions: Transition[]
}

export interface TapeSnapshot {
  symbols: string[]
  head: number
  offset: number
}

export interface Snapshot {
  stateId: string
  tapes: TapeSnapshot[]
  steps: number
  status: 'ready' | 'paused' | 'halted' | 'stuck'
  lastTransitionId: string | null
}

export function normalizeSymbol(value: string): string {
  return value === '' ||
    /^\s+$/.test(value) ||
    value === 'lambda' ||
    value === '\\lambda'
    ? BLANK
    : value
}

export function inputSymbols(input: string): string[] {
  return Array.from(input, normalizeSymbol)
}

export function parseReadSymbols(value: string): string[] {
  const literal = normalizeSymbol(value)
  if (literal.length === 1) return [literal]
  const text = value.trim()
  const contents =
    text.startsWith('{') && text.endsWith('}') ? text.slice(1, -1) : text
  const entries = contents.split(',').map((entry) => entry.trim())
  if (entries.some((entry) => !entry)) return []
  const symbols = entries.map(normalizeSymbol)
  return symbols.every((symbol) => symbol.length === 1)
    ? [...new Set(symbols)]
    : []
}

export function readCell(tape: TapeSnapshot, position: number): string {
  return tape.symbols[position - tape.offset] ?? BLANK
}

export function initialSnapshot(definition: MachineDefinition): Snapshot {
  const symbols = inputSymbols(definition.input)
  return {
    stateId: definition.initialState,
    tapes: Array.from({ length: definition.tapeCount }, (_, index) => ({
      symbols: index === 0 && symbols.length ? symbols : [BLANK],
      head: 0,
      offset: 0,
    })),
    steps: 0,
    status: definition.states.find(
      (state) => state.id === definition.initialState,
    )?.halt
      ? 'halted'
      : 'ready',
    lastTransitionId: null,
  }
}

export function matchingTransition(
  definition: MachineDefinition,
  snapshot: Snapshot,
): Transition | undefined {
  if (definition.states.find((state) => state.id === snapshot.stateId)?.halt)
    return
  return definition.transitions.find(
    (transition) =>
      transition.from === snapshot.stateId &&
      transition.read.every((symbol, index) =>
        parseReadSymbols(symbol).includes(
          readCell(snapshot.tapes[index], snapshot.tapes[index].head),
        ),
      ),
  )
}

export function validateMachine(definition: MachineDefinition): string[] {
  const errors: string[] = []
  if (
    !Number.isInteger(definition.tapeCount) ||
    definition.tapeCount < 1 ||
    definition.tapeCount > MAX_TAPES
  ) {
    errors.push(`Choose between 1 and ${MAX_TAPES} tapes.`)
  }
  const stateIds = new Set(definition.states.map((state) => state.id))
  const names = definition.states.map((state) => state.name.trim())
  if (!definition.states.length) errors.push('Add at least one state.')
  if (stateIds.size !== definition.states.length)
    errors.push('State IDs must be unique.')
  if (names.some((name) => !name)) errors.push('Every state needs a name.')
  if (new Set(names).size !== names.length)
    errors.push('State names must be unique.')
  if (!stateIds.has(definition.initialState))
    errors.push('Choose a start state.')
  if (inputSymbols(definition.input).some((symbol) => symbol.length !== 1)) {
    errors.push('Input symbols must be single characters (not emoji).')
  }
  const previousReads: { from: string; symbols: string[][] }[] = []
  const transitionIds = new Set<string>()
  for (const [index, transition] of definition.transitions.entries()) {
    const label = `Transition ${index + 1}`
    if (transitionIds.has(transition.id))
      errors.push(`${label}: transition IDs must be unique.`)
    transitionIds.add(transition.id)
    if (!stateIds.has(transition.from) || !stateIds.has(transition.to)) {
      errors.push(`${label}: choose an existing state.`)
    }
    if (
      [transition.read, transition.write, transition.move].some(
        (values) => values.length !== definition.tapeCount,
      )
    ) {
      errors.push(`${label}: each tape needs a read, write, and move.`)
    }
    const readSets = transition.read.map(parseReadSymbols)
    if (readSets.some((symbols) => !symbols.length)) {
      errors.push(
        `${label}: use one character per read symbol, or a set such as {0,1}.`,
      )
    }
    if (
      transition.write.some((symbol) => normalizeSymbol(symbol).length !== 1)
    ) {
      errors.push(`${label}: use one character per write symbol.`)
    }
    if (
      transition.move.some((direction) => !['L', 'R', 'N'].includes(direction))
    ) {
      errors.push(`${label}: movement must be L, R, or N.`)
    }
    if (definition.states.find((state) => state.id === transition.from)?.halt) {
      errors.push(`${label}: a halt state cannot have outgoing transitions.`)
    }
    if (
      previousReads.some(
        (previous) =>
          previous.from === transition.from &&
          previous.symbols.length === readSets.length &&
          readSets.every((symbols, tape) =>
            symbols.some((symbol) => previous.symbols[tape].includes(symbol)),
          ),
      )
    ) {
      errors.push(
        `${label}: another rule has the same state and read symbols (overlapping inputs).`,
      )
    }
    previousReads.push({ from: transition.from, symbols: readSets })
  }
  return errors
}

export function stepMachine(
  definition: MachineDefinition,
  snapshot: Snapshot,
): Snapshot {
  const errors = validateMachine(definition)
  if (errors.length) throw new Error(errors[0])
  if (snapshot.status === 'halted' || snapshot.status === 'stuck')
    return snapshot
  const transition = matchingTransition(definition, snapshot)
  if (!transition) return { ...snapshot, status: 'stuck' }

  const currentSymbols = snapshot.tapes.map((tape) => readCell(tape, tape.head))
  const alphabet = new Alphabet([
    ...new Set([
      BLANK,
      '0',
      '1',
      ...snapshot.tapes.flatMap((tape) => tape.symbols),
      ...currentSymbols,
      ...transition.write.map(normalizeSymbol),
    ]),
  ])
  const tapes = snapshot.tapes.map(
    (tape) =>
      new Tape({
        alphabet,
        symbols: [...tape.symbols],
        position: tape.head - tape.offset,
      }),
  )
  const tapeBlock = TapeBlock.fromTapes(tapes)
  const movement = { L: movements.left, R: movements.right, N: movements.stay }
  const state = new State({
    [tapeBlock.symbol(currentSymbols)]: {
      command: transition.write.map((symbol, index) => ({
        symbol: normalizeSymbol(symbol),
        movement: movement[transition.move[index]],
      })),
      nextState: haltState,
    },
  })
  new TuringMachine({ tapeBlock }).run({ initialState: state })

  return {
    stateId: transition.to,
    tapes: tapes.map((tape, index) => {
      const head =
        snapshot.tapes[index].head +
        { L: -1, R: 1, N: 0 }[transition.move[index]]
      return { symbols: [...tape.symbols], head, offset: head - tape.position }
    }),
    steps: snapshot.steps + 1,
    status: definition.states.find(
      (namedState) => namedState.id === transition.to,
    )?.halt
      ? 'halted'
      : 'paused',
    lastTransitionId: transition.id,
  }
}

export function resizeTapes(
  definition: MachineDefinition,
  tapeCount: number,
): MachineDefinition {
  if (!Number.isInteger(tapeCount) || tapeCount < 1 || tapeCount > MAX_TAPES)
    return definition
  return {
    ...definition,
    tapeCount,
    transitions: definition.transitions.map((transition) => ({
      ...transition,
      read: Array.from(
        { length: tapeCount },
        (_, index) => transition.read[index] ?? BLANK,
      ),
      write: Array.from(
        { length: tapeCount },
        (_, index) => transition.write[index] ?? BLANK,
      ),
      move: Array.from(
        { length: tapeCount },
        (_, index) => transition.move[index] ?? 'N',
      ),
    })),
  }
}

export function createExample(
  example: 'copy' | 'invert' | 'blank' = 'copy',
): MachineDefinition {
  const tapeCount = example === 'invert' ? 1 : 2
  const definition: MachineDefinition = {
    name:
      example === 'copy'
        ? 'Binary copy'
        : example === 'invert'
          ? 'Binary flip'
          : 'Untitled machine',
    tapeCount,
    input: example === 'blank' ? '' : '101101',
    states: [
      { id: 'start', name: example === 'blank' ? 'q0' : example, halt: false },
      { id: 'done', name: 'done', halt: true },
    ],
    initialState: 'start',
    transitions: [],
  }
  if (example === 'blank') return definition
  definition.transitions = ['0', '1', BLANK].map((symbol, index) => ({
    id: `rule-${index}`,
    from: 'start',
    to: symbol === BLANK ? 'done' : 'start',
    read: tapeCount === 2 ? [symbol, BLANK] : [symbol],
    write:
      tapeCount === 2
        ? [symbol, symbol]
        : [symbol === BLANK ? BLANK : symbol === '0' ? '1' : '0'],
    move: Array.from({ length: tapeCount }, () =>
      symbol === BLANK ? 'N' : 'R',
    ),
  }))
  return definition
}
