import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Download,
  FilePlus2,
  FlaskConical,
  GitBranch,
  Layers3,
  LocateFixed,
  Minus,
  PanelsTopLeft,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  StepForward,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react'
import {
  BLANK,
  MAX_TAPES,
  createExample,
  initialSnapshot,
  inputSymbols,
  matchingTransition,
  normalizeSymbol,
  readCell,
  resizeTapes,
  stepMachine,
  validateMachine,
  type Direction,
  type MachineDefinition,
  type Snapshot,
  type TapeSnapshot,
  type Transition,
} from './machine'
import './App.css'

const STORAGE_KEY = 'multitape:machine:v1'
const WORKSPACE_STORAGE_KEY = 'multitape:workspace:v1'
const TAPE_COLORS = [
  { color: '#19775c', tint: '#e2f3ec' },
  { color: '#3d73a5', tint: '#e8f0fb' },
  { color: '#a56b20', tint: '#faf0da' },
  { color: '#a14d6c', tint: '#f8e8ef' },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function decodeDefinition(text: string): MachineDefinition {
  const data: unknown = JSON.parse(text)
  if (!isRecord(data) || data.version !== 1 || !isRecord(data.machine)) {
    throw new Error('This file is not a Multitape machine.')
  }
  const machine = data.machine
  const stringArray = (value: unknown) =>
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  if (
    typeof machine.name !== 'string' ||
    typeof machine.input !== 'string' ||
    typeof machine.initialState !== 'string' ||
    typeof machine.tapeCount !== 'number' ||
    !Number.isInteger(machine.tapeCount) ||
    machine.tapeCount < 1 ||
    machine.tapeCount > MAX_TAPES ||
    machine.input.length > 10000 ||
    !Array.isArray(machine.states) ||
    !machine.states.length ||
    machine.states.length > 200 ||
    !machine.states.every(
      (state) =>
        isRecord(state) &&
        typeof state.id === 'string' &&
        typeof state.name === 'string' &&
        typeof state.halt === 'boolean',
    ) ||
    !Array.isArray(machine.transitions) ||
    machine.transitions.length > 2000 ||
    !machine.transitions.every(
      (transition) =>
        isRecord(transition) &&
        typeof transition.id === 'string' &&
        typeof transition.from === 'string' &&
        typeof transition.to === 'string' &&
        stringArray(transition.read) &&
        stringArray(transition.write) &&
        stringArray(transition.move) &&
        [transition.read, transition.write, transition.move].every(
          (values) => (values as string[]).length === machine.tapeCount,
        ),
    )
  )
    throw new Error(
      'The machine file has invalid settings or transition fields.',
    )
  const definition = machine as unknown as MachineDefinition
  if (
    new Set(definition.states.map((state) => state.id)).size !==
      definition.states.length ||
    new Set(definition.transitions.map((transition) => transition.id)).size !==
      definition.transitions.length
  ) {
    throw new Error('The machine file contains duplicate IDs.')
  }
  return {
    ...definition,
    transitions: definition.transitions.map((transition) => ({
      ...transition,
      move: transition.move.map((direction) =>
        (direction as string) === 'S' ? 'N' : direction,
      ),
    })),
  }
}

function loadDefinition(): MachineDefinition {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return decodeDefinition(saved)
  } catch {
    return createExample()
  }
  return createExample()
}

interface MachineTab {
  id: string
  definition: MachineDefinition
  status: string
}

interface OpenMachines {
  tabs: MachineTab[]
  activeId: string
}

function loadOpenMachines(): OpenMachines {
  const fallback = () => {
    const id = crypto.randomUUID()
    return {
      tabs: [{ id, definition: loadDefinition(), status: 'Ready' }],
      activeId: id,
    }
  }
  try {
    const saved = localStorage.getItem(WORKSPACE_STORAGE_KEY)
    if (saved) {
      const data: unknown = JSON.parse(saved)
      if (
        isRecord(data) &&
        data.version === 1 &&
        Array.isArray(data.tabs) &&
        data.tabs.length > 0
      ) {
        const tabs = data.tabs.map((tab) => {
          if (!isRecord(tab) || typeof tab.id !== 'string')
            throw new Error('Invalid tab.')
          return {
            id: tab.id,
            definition: decodeDefinition(
              JSON.stringify({ version: 1, machine: tab.machine }),
            ),
            status: 'Ready',
          }
        })
        if (new Set(tabs.map((tab) => tab.id)).size !== tabs.length)
          throw new Error('Duplicate tabs.')
        return {
          tabs,
          activeId: tabs.some((tab) => tab.id === data.activeId)
            ? (data.activeId as string)
            : tabs[0].id,
        }
      }
    }
  } catch {
    return fallback()
  }
  return fallback()
}

function IconButton({
  label,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  )
}

function TapeView({
  tape,
  index,
  resetVersion,
}: {
  tape: TapeSnapshot
  index: number
  resetVersion: number
}) {
  const viewport = useRef<HTMLDivElement>(null)
  const [cellCount, setCellCount] = useState(13)
  const [view, setView] = useState<{
    start: number | null
    resetVersion: number
  }>({
    start: null,
    resetVersion,
  })
  const manualStart = view.resetVersion === resetVersion ? view.start : null
  function setManualStart(start: number | null) {
    setView({ start, resetVersion })
  }
  const palette = TAPE_COLORS[index % TAPE_COLORS.length]

  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === 0) return
      setCellCount(
        Math.max(
          5,
          Math.min(25, Math.floor((entry.contentRect.width + 6) / 55)),
        ),
      )
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const automaticStart =
    tape.head < 0 ? tape.head - 2 : Math.max(-2, tape.head - cellCount + 3)
  const start = manualStart ?? automaticStart
  const positions = Array.from({ length: cellCount }, (_, cell) => start + cell)

  return (
    <section
      className="tape"
      aria-label={`Tape ${index + 1}`}
      style={
        {
          '--tape-color': palette.color,
          '--tape-tint': palette.tint,
        } as CSSProperties
      }
    >
      <div className="tape-heading">
        <div className="tape-label">
          <span className="tape-dot" />
          <h3>Tape {index + 1}</h3>
          <span className="tape-kind">{index === 0 ? 'Input' : 'Work'}</span>
        </div>
        <div className="tape-navigation">
          <span className="head-position">
            head <strong>{tape.head}</strong>
          </span>
          <IconButton
            label={`Tape ${index + 1}: pan left`}
            onClick={() => setManualStart(start - Math.max(1, cellCount - 2))}
          >
            <ChevronLeft size={15} />
          </IconButton>
          <IconButton
            label={`Tape ${index + 1}: follow head`}
            className={manualStart === null ? 'following' : ''}
            aria-pressed={manualStart === null}
            onClick={() => setManualStart(null)}
          >
            <LocateFixed size={15} />
          </IconButton>
          <IconButton
            label={`Tape ${index + 1}: pan right`}
            onClick={() => setManualStart(start + Math.max(1, cellCount - 2))}
          >
            <ChevronRight size={15} />
          </IconButton>
        </div>
      </div>
      <div className="tape-window" ref={viewport}>
        <div
          className="tape-cells"
          style={{
            gridTemplateColumns: `repeat(${cellCount}, minmax(0, 1fr))`,
          }}
        >
          {positions.map((position) => {
            const symbol = readCell(tape, position)
            const isHead = position === tape.head
            return (
              <div
                className={`tape-position ${isHead ? 'at-head' : ''}`}
                key={position}
              >
                <div
                  className={`tape-cell ${symbol === BLANK ? 'blank' : ''}`}
                  data-position={position}
                  data-symbol={symbol}
                  data-head={isHead}
                  aria-label={`Cell ${position}: ${symbol === BLANK ? 'blank' : symbol}${isHead ? ', head' : ''}`}
                >
                  {isHead && (
                    <ArrowDown
                      className="head-marker"
                      size={18}
                      aria-hidden="true"
                    />
                  )}
                  <span>{symbol}</span>
                </div>
                <span className="cell-index">{position}</span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function MachineWorkbench({
  id,
  initialDefinition,
  tabs,
  saved,
  onDefinitionChange,
  onStatusChange,
  onOpenMachine,
}: {
  id: string
  initialDefinition: MachineDefinition
  tabs: ReactNode
  saved: boolean
  onDefinitionChange: (id: string, definition: MachineDefinition) => boolean
  onStatusChange: (id: string, status: string) => void
  onOpenMachine: (definition: MachineDefinition) => void
}) {
  const [definition, setDefinition] = useState(initialDefinition)
  const [snapshot, setSnapshot] = useState(() => initialSnapshot(definition))
  const [history, setHistory] = useState<Snapshot[]>([])
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(2)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [edited, setEdited] = useState(
    () => JSON.stringify(definition) !== JSON.stringify(createExample()),
  )
  const [replacement, setReplacement] = useState<MachineDefinition | null>(null)
  const [revision, setRevision] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const runStart = useRef(0)
  const fieldId = useId()
  const validation = validateMachine(definition)
  const nextTransition = validation.length
    ? undefined
    : matchingTransition(definition, snapshot)
  const currentState = definition.states.find(
    (state) => state.id === snapshot.stateId,
  )
  const terminal = snapshot.status === 'halted' || snapshot.status === 'stuck'
  const problem = error ?? validation[0]
  const status = running
    ? 'Running'
    : {
        ready: 'Ready',
        paused: 'Paused',
        halted: 'Halted',
        stuck: 'No matching rule',
      }[snapshot.status]

  const reportStatus = useEffectEvent(() => onStatusChange(id, status))
  useEffect(() => {
    reportStatus()
  }, [status])

  useEffect(() => {
    if (replacement) dialogRef.current?.showModal()
    else dialogRef.current?.close()
  }, [replacement])

  function resetRun(nextDefinition = definition) {
    setRunning(false)
    setSnapshot(initialSnapshot(nextDefinition))
    setHistory([])
    setError(null)
    setNotice(null)
    setRevision((value) => value + 1)
  }

  function editDefinition(next: MachineDefinition, isEdited = true) {
    setDefinition(next)
    setEdited(isEdited)
    onDefinitionChange(id, next)
    resetRun(next)
  }

  function requestReplacement(next: MachineDefinition) {
    setRunning(false)
    if (edited) setReplacement(next)
    else editDefinition(next, false)
  }

  function advance() {
    if (terminal || validation.length) return
    if (running && snapshot.steps - runStart.current >= 10000) {
      setRunning(false)
      setNotice('Paused at the 10,000-step run limit.')
      return
    }
    try {
      const next = stepMachine(definition, snapshot)
      setHistory((previous) => [...previous.slice(-99), snapshot])
      setSnapshot(next)
      setError(null)
      if (next.status === 'halted' || next.status === 'stuck') setRunning(false)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The machine could not complete this step.',
      )
      setRunning(false)
    }
  }

  const tick = useEffectEvent(advance)
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => tick(), 1000 / speed)
    return () => window.clearInterval(timer)
  }, [running, speed])

  function addState() {
    let suffix = definition.states.length
    while (definition.states.some((state) => state.name === `q${suffix}`))
      suffix++
    editDefinition({
      ...definition,
      states: [
        ...definition.states,
        { id: crypto.randomUUID(), name: `q${suffix}`, halt: false },
      ],
    })
  }

  function updateTransition(id: string, change: Partial<Transition>) {
    editDefinition({
      ...definition,
      transitions: definition.transitions.map((transition) =>
        transition.id === id ? { ...transition, ...change } : transition,
      ),
    })
  }

  function updateSymbol(
    transition: Transition,
    field: 'read' | 'write',
    index: number,
    value: string,
  ) {
    updateTransition(transition.id, {
      [field]: transition[field].map((symbol, tape) =>
        tape === index ? value : symbol,
      ),
    })
  }

  function addTransition() {
    const from =
      definition.states.find((state) => !state.halt)?.id ??
      definition.initialState
    editDefinition({
      ...definition,
      transitions: [
        ...definition.transitions,
        {
          id: crypto.randomUUID(),
          from,
          to: from,
          read: Array.from({ length: definition.tapeCount }, () => BLANK),
          write: Array.from({ length: definition.tapeCount }, () => BLANK),
          move: Array.from({ length: definition.tapeCount }, () => 'N'),
        },
      ],
    })
  }

  function downloadMachine() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ version: 1, machine: definition }, null, 2)], {
        type: 'application/json',
      }),
    )
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${definition.name.replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase() || 'machine'}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function importMachine(file?: File) {
    if (!file) return
    try {
      if (file.size > 1000000)
        throw new Error('Machine files must be smaller than 1 MB.')
      onOpenMachine(decodeDefinition(await file.text()))
      setError(null)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The machine file could not be opened.',
      )
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  function renderSymbol(
    transition: Transition,
    field: 'read' | 'write',
    tape: number,
    row: number,
  ) {
    return (
      <input
        className={`symbol-input ${field === 'read' ? 'read-symbol-input' : ''} ${normalizeSymbol(transition[field][tape]) === BLANK ? 'blank-symbol' : ''}`}
        aria-label={`Transition ${row + 1}, tape ${tape + 1} ${field}`}
        title={
          field === 'read'
            ? 'One symbol or a set, e.g. {0,1}; empty or lambda means blank'
            : 'One symbol; empty or lambda means blank'
        }
        value={transition[field][tape]}
        placeholder={BLANK}
        maxLength={field === 'read' ? 128 : 8}
        spellCheck={false}
        autoComplete="off"
        onFocus={(event) => event.target.select()}
        onChange={(event) =>
          updateSymbol(transition, field, tape, event.target.value)
        }
        onBlur={(event) => {
          const normalized = normalizeSymbol(event.target.value)
          if (normalized !== transition[field][tape])
            updateSymbol(transition, field, tape, normalized)
        }}
      />
    )
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">
            <PanelsTopLeft size={25} strokeWidth={1.7} />
          </div>
          <div>
            <h1>
              Multitape<span className="brand-period">.</span>
            </h1>
            <p>Turing machine simulator</p>
          </div>
        </div>
        <div className="header-actions">
          <span className="save-status">
            <span className={saved ? 'saved-dot' : 'unsaved-dot'} />
            {saved ? 'Saved locally' : 'Session only'}
          </span>
          <IconButton
            className="mobile-settings"
            label="Machine settings"
            aria-expanded={settingsOpen}
            aria-controls={`${fieldId}-machine-settings`}
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <SlidersHorizontal size={18} />
          </IconButton>
          <IconButton
            label="Open machine"
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={18} />
          </IconButton>
          <IconButton label="Download machine" onClick={downloadMachine}>
            <Download size={18} />
          </IconButton>
          <input
            type="file"
            ref={fileRef}
            className="sr-only"
            aria-label="Machine JSON file"
            accept=".json,application/json"
            onChange={(event) => void importMachine(event.target.files?.[0])}
          />
        </div>
      </header>

      {tabs}

      <div className="workspace">
        <aside
          id={`${fieldId}-machine-settings`}
          className={`machine-sidebar ${settingsOpen ? 'settings-open' : ''}`}
        >
          <fieldset disabled={running}>
            <legend className="sr-only">Machine configuration</legend>
            <div className="section-heading">
              <h2>
                <SlidersHorizontal size={16} />
                Machine
              </h2>
              <span className="section-number">01</span>
            </div>
            <div className="field">
              <label htmlFor={`${fieldId}-tape-count`}>Number of tapes</label>
              <div className="number-stepper">
                <IconButton
                  label="Remove tape"
                  disabled={running || definition.tapeCount <= 1}
                  onClick={() =>
                    editDefinition(
                      resizeTapes(definition, definition.tapeCount - 1),
                    )
                  }
                >
                  <Minus size={16} />
                </IconButton>
                <input
                  id={`${fieldId}-tape-count`}
                  type="number"
                  min={1}
                  max={MAX_TAPES}
                  value={definition.tapeCount}
                  onChange={(event) => {
                    const count = Number(event.target.value)
                    if (
                      Number.isInteger(count) &&
                      count >= 1 &&
                      count <= MAX_TAPES
                    )
                      editDefinition(resizeTapes(definition, count))
                  }}
                />
                <IconButton
                  label="Add tape"
                  disabled={running || definition.tapeCount >= MAX_TAPES}
                  onClick={() =>
                    editDefinition(
                      resizeTapes(definition, definition.tapeCount + 1),
                    )
                  }
                >
                  <Plus size={16} />
                </IconButton>
              </div>
            </div>
            <div className="field input-field">
              <div className="field-label">
                <label htmlFor={`${fieldId}-machine-input`}>
                  Input on tape 1
                </label>
                <IconButton
                  label="Insert blank symbol"
                  className="lambda-button"
                  onClick={() => {
                    const start =
                      inputRef.current?.selectionStart ??
                      definition.input.length
                    const end = inputRef.current?.selectionEnd ?? start
                    editDefinition({
                      ...definition,
                      input:
                        definition.input.slice(0, start) +
                        BLANK +
                        definition.input.slice(end),
                    })
                    requestAnimationFrame(() => {
                      inputRef.current?.focus()
                      inputRef.current?.setSelectionRange(start + 1, start + 1)
                    })
                  }}
                >
                  {BLANK}
                </IconButton>
              </div>
              <textarea
                id={`${fieldId}-machine-input`}
                ref={inputRef}
                value={definition.input}
                placeholder={BLANK}
                maxLength={10000}
                rows={2}
                spellCheck={false}
                onChange={(event) =>
                  editDefinition({ ...definition, input: event.target.value })
                }
              />
              <div className="input-meta">
                <span>{inputSymbols(definition.input).length} symbols</span>
                <span>
                  head <span className="mono">0</span>
                </span>
              </div>
            </div>

            <section className="states-section">
              <div className="section-heading">
                <h2>
                  States{' '}
                  <span className="count">{definition.states.length}</span>
                </h2>
                <IconButton label="Add state" onClick={addState}>
                  <Plus size={16} />
                </IconButton>
              </div>
              <div className="state-column-labels">
                <span title="Start state">Start</span>
                <span>Name</span>
                <span title="Halt state">Halt</span>
                <span />
              </div>
              <div className="state-list">
                {definition.states.map((state, index) => (
                  <div
                    className={`state-row ${snapshot.stateId === state.id ? 'current-state-row' : ''}`}
                    key={state.id}
                  >
                    <input
                      type="radio"
                      name={`${fieldId}-start-state`}
                      aria-label={`Start in ${state.name || `state ${index + 1}`}`}
                      checked={definition.initialState === state.id}
                      onChange={() =>
                        editDefinition({
                          ...definition,
                          initialState: state.id,
                        })
                      }
                    />
                    <input
                      className="state-name"
                      aria-label={`State ${index + 1} name`}
                      value={state.name}
                      maxLength={80}
                      spellCheck={false}
                      onChange={(event) =>
                        editDefinition({
                          ...definition,
                          states: definition.states.map((item) =>
                            item.id === state.id
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        })
                      }
                    />
                    <input
                      type="checkbox"
                      aria-label={`Halt at ${state.name || `state ${index + 1}`}`}
                      checked={state.halt}
                      onChange={(event) =>
                        editDefinition({
                          ...definition,
                          states: definition.states.map((item) =>
                            item.id === state.id
                              ? { ...item, halt: event.target.checked }
                              : item,
                          ),
                        })
                      }
                    />
                    <IconButton
                      label={`Delete ${state.name || 'state'} and its transitions`}
                      disabled={running || definition.states.length <= 1}
                      onClick={() => {
                        const states = definition.states.filter(
                          (item) => item.id !== state.id,
                        )
                        editDefinition({
                          ...definition,
                          states,
                          initialState:
                            definition.initialState === state.id
                              ? states[0].id
                              : definition.initialState,
                          transitions: definition.transitions.filter(
                            (transition) =>
                              transition.from !== state.id &&
                              transition.to !== state.id,
                          ),
                        })
                      }}
                    >
                      <X size={13} />
                    </IconButton>
                  </div>
                ))}
              </div>
            </section>
          </fieldset>
          <dl className="machine-properties">
            <div>
              <dt>Blank symbol</dt>
              <dd>{BLANK}</dd>
            </div>
            <div>
              <dt>Initial head position</dt>
              <dd>0</dd>
            </div>
            <div>
              <dt>Tape direction</dt>
              <dd>Two-way infinite</dd>
            </div>
          </dl>
          <button
            className="button new-machine"
            onClick={() => onOpenMachine(createExample('blank'))}
          >
            <FilePlus2 size={16} />
            New machine
          </button>
        </aside>

        <main className="workbench">
          <div className="workbench-heading">
            <div className="machine-title-group">
              <span className="eyebrow">Workspace</span>
              <input
                className="machine-title"
                aria-label="Machine name"
                value={definition.name}
                maxLength={80}
                placeholder="Untitled machine"
                disabled={running}
                onChange={(event) =>
                  editDefinition({ ...definition, name: event.target.value })
                }
              />
            </div>
            <div className="example-picker">
              <FlaskConical size={16} />
              <select
                aria-label="Load example"
                value=""
                disabled={running}
                onChange={(event) =>
                  requestReplacement(
                    createExample(event.target.value as 'copy' | 'invert'),
                  )
                }
              >
                <option value="" disabled>
                  Load example
                </option>
                <option value="copy">Binary copy (2 tapes)</option>
                <option value="invert">Binary flip (1 tape)</option>
              </select>
            </div>
          </div>

          <section className="simulation" aria-label="Simulation">
            <div className="simulation-readout">
              <div className="readout">
                <span>Current state</span>
                <strong
                  className="current-state-value"
                  title={currentState?.name}
                >
                  {currentState?.name || '\u2014'}
                </strong>
              </div>
              <div className="readout reading">
                <span>Reading</span>
                <strong>
                  (
                  {snapshot.tapes
                    .map((tape) => readCell(tape, tape.head))
                    .join(', ')}
                  )
                </strong>
              </div>
              <div className="readout step-readout">
                <span>Steps</span>
                <strong data-testid="step-count">
                  {String(snapshot.steps).padStart(4, '0')}
                </strong>
              </div>
              <div
                className={`machine-status ${running ? 'is-running' : snapshot.status}`}
                role="status"
              >
                <span className="status-dot" />
                {status}
              </div>
            </div>
            <div className="tape-surface">
              {snapshot.tapes.map((tape, index) => (
                <TapeView
                  tape={tape}
                  index={index}
                  resetVersion={revision}
                  key={index}
                />
              ))}
            </div>
            <div className="playback-bar">
              <div className="playback-actions">
                <button
                  className={`button run-button ${running ? 'running' : ''}`}
                  disabled={!running && (terminal || validation.length > 0)}
                  onClick={() => {
                    if (!running) {
                      runStart.current = snapshot.steps
                      setNotice(null)
                    }
                    setRunning(!running)
                  }}
                >
                  {running ? (
                    <Pause size={16} fill="currentColor" />
                  ) : (
                    <Play size={16} fill="currentColor" />
                  )}
                  {running ? 'Pause' : 'Run'}
                </button>
                <button
                  className="button step-button"
                  disabled={running || terminal || validation.length > 0}
                  onClick={advance}
                >
                  <StepForward size={17} />
                  Step
                </button>
                <span className="control-divider" />
                <IconButton
                  label="Step back"
                  disabled={running || !history.length}
                  onClick={() => {
                    setSnapshot(history[history.length - 1])
                    setHistory(history.slice(0, -1))
                    setError(null)
                    setNotice(null)
                  }}
                >
                  <Undo2 size={17} />
                </IconButton>
                <IconButton label="Reset simulation" onClick={() => resetRun()}>
                  <RotateCcw size={17} />
                </IconButton>
              </div>
              <div className="speed-control">
                <label htmlFor={`${fieldId}-run-speed`}>Speed</label>
                <input
                  id={`${fieldId}-run-speed`}
                  type="range"
                  min="1"
                  max="12"
                  value={speed}
                  onChange={(event) => setSpeed(Number(event.target.value))}
                />
                <output htmlFor={`${fieldId}-run-speed`}>
                  {speed}
                  <span> steps/s</span>
                </output>
              </div>
            </div>
            {snapshot.status === 'stuck' && (
              <div className="run-message" role="status">
                No transition for <strong>{currentState?.name}</strong> reading{' '}
                <span className="mono">
                  (
                  {snapshot.tapes
                    .map((tape) => readCell(tape, tape.head))
                    .join(', ')}
                  )
                </span>
                .
              </div>
            )}
            {notice && (
              <div className="run-message" role="status">
                {notice}
              </div>
            )}
          </section>

          <section
            className="transitions-section"
            aria-labelledby={`${fieldId}-transitions-title`}
          >
            <div className="transitions-heading">
              <h2 id={`${fieldId}-transitions-title`}>
                <GitBranch size={18} />
                Transition function{' '}
                <span className="count">{definition.transitions.length}</span>
              </h2>
              <button
                className="button add-transition"
                disabled={
                  running || !definition.states.some((state) => !state.halt)
                }
                onClick={addTransition}
              >
                <Plus size={16} />
                Add transition
              </button>
            </div>
            {problem && (
              <div className="validation-message" role="alert">
                <span>
                  {problem}
                  {validation.length > 1 && !error
                    ? ` (+${validation.length - 1} more)`
                    : ''}
                </span>
                {error && (
                  <IconButton
                    label="Dismiss error"
                    onClick={() => setError(null)}
                  >
                    <X size={15} />
                  </IconButton>
                )}
              </div>
            )}
            <fieldset disabled={running} className="transition-fieldset">
              <legend className="sr-only">Transition function editor</legend>
              <div
                className="table-scroll"
                tabIndex={0}
                aria-label="Transition table"
              >
                <table className="transition-table">
                  <thead>
                    <tr>
                      <th rowSpan={2} className="rule-number">
                        #
                      </th>
                      <th rowSpan={2} className="state-column">
                        State
                      </th>
                      <th colSpan={definition.tapeCount}>Read</th>
                      <th rowSpan={2} className="arrow-column">
                        <ArrowRight size={15} aria-label="transitions to" />
                      </th>
                      <th rowSpan={2} className="state-column">
                        Next state
                      </th>
                      <th colSpan={definition.tapeCount}>Write</th>
                      <th colSpan={definition.tapeCount}>Move</th>
                      <th rowSpan={2}>
                        <span className="sr-only">Delete</span>
                      </th>
                    </tr>
                    <tr>
                      {['read', 'write', 'move'].flatMap((group) =>
                        Array.from(
                          { length: definition.tapeCount },
                          (_, index) => (
                            <th
                              className={`tape-subheading ${group}-heading`}
                              key={`${group}-${index}`}
                              style={{
                                color:
                                  TAPE_COLORS[index % TAPE_COLORS.length].color,
                              }}
                            >
                              T{index + 1}
                            </th>
                          ),
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {definition.transitions.map((transition, row) => (
                      <tr
                        key={transition.id}
                        data-testid={`transition-${row + 1}`}
                        className={
                          nextTransition?.id === transition.id && !terminal
                            ? 'next-transition'
                            : snapshot.lastTransitionId === transition.id
                              ? 'last-transition'
                              : ''
                        }
                      >
                        <td className="rule-number">
                          {nextTransition?.id === transition.id && !terminal ? (
                            <Play
                              size={11}
                              fill="currentColor"
                              aria-label="Next transition"
                            />
                          ) : (
                            String(row + 1).padStart(2, '0')
                          )}
                        </td>
                        <td>
                          <select
                            aria-label={`Transition ${row + 1} state`}
                            className="state-select"
                            value={transition.from}
                            onChange={(event) =>
                              updateTransition(transition.id, {
                                from: event.target.value,
                              })
                            }
                          >
                            {definition.states.map((state) => (
                              <option key={state.id} value={state.id}>
                                {state.name || '(unnamed)'}
                              </option>
                            ))}
                          </select>
                        </td>
                        {transition.read.map((_, tape) => (
                          <td key={`read-${tape}`}>
                            {renderSymbol(transition, 'read', tape, row)}
                          </td>
                        ))}
                        <td className="arrow-column">
                          <ArrowRight size={15} />
                        </td>
                        <td>
                          <select
                            aria-label={`Transition ${row + 1} next state`}
                            className="state-select"
                            value={transition.to}
                            onChange={(event) =>
                              updateTransition(transition.id, {
                                to: event.target.value,
                              })
                            }
                          >
                            {definition.states.map((state) => (
                              <option key={state.id} value={state.id}>
                                {state.name || '(unnamed)'}
                              </option>
                            ))}
                          </select>
                        </td>
                        {transition.write.map((_, tape) => (
                          <td key={`write-${tape}`}>
                            {renderSymbol(transition, 'write', tape, row)}
                          </td>
                        ))}
                        {transition.move.map((direction, tape) => (
                          <td key={`move-${tape}`}>
                            <select
                              className="direction-select"
                              aria-label={`Transition ${row + 1}, tape ${tape + 1} move`}
                              title="L: left, R: right, N: stay"
                              value={direction}
                              onChange={(event) =>
                                updateTransition(transition.id, {
                                  move: transition.move.map((value, index) =>
                                    index === tape
                                      ? (event.target.value as Direction)
                                      : value,
                                  ),
                                })
                              }
                            >
                              <option value="L">L</option>
                              <option value="R">R</option>
                              <option value="N">N</option>
                            </select>
                          </td>
                        ))}
                        <td>
                          <IconButton
                            label={`Delete transition ${row + 1}`}
                            className="delete-transition"
                            onClick={() =>
                              editDefinition({
                                ...definition,
                                transitions: definition.transitions.filter(
                                  (item) => item.id !== transition.id,
                                ),
                              })
                            }
                          >
                            <Trash2 size={15} />
                          </IconButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!definition.transitions.length && (
                  <div className="empty-transitions">
                    <GitBranch size={23} />
                    <span>No transitions</span>
                  </div>
                )}
              </div>
            </fieldset>
            <div className="transition-footer">
              <span className="next-legend">
                <span />
                Next transition
              </span>
              <div className="notation">
                <span>
                  <b>{BLANK}</b> blank
                </span>
                <span>
                  <b>L</b> left
                </span>
                <span>
                  <b>R</b> right
                </span>
                <span>
                  <b>N</b> stay
                </span>
              </div>
            </div>
          </section>
          <footer className="workspace-footer">
            <span>
              <Layers3 size={14} />
              {definition.tapeCount} tapes
              <span className="footer-dot" />
              {definition.states.length} states
              <span className="footer-dot" />
              {definition.transitions.length} transitions
            </span>
            <span>
              {validation.length ? (
                <>
                  <span className="warning-dot" />
                  Needs attention
                </>
              ) : (
                <>
                  <CircleCheck size={14} />
                  Deterministic machine
                </>
              )}
            </span>
          </footer>
        </main>
      </div>

      <dialog
        ref={dialogRef}
        className="confirm-dialog"
        onCancel={() => setReplacement(null)}
      >
        <h2>Replace this machine?</h2>
        <p>Your current machine will be replaced.</p>
        <div className="dialog-actions">
          <button className="button" onClick={downloadMachine}>
            <Download size={16} />
            Download current
          </button>
          <button
            className="button"
            autoFocus
            onClick={() => setReplacement(null)}
          >
            Cancel
          </button>
          <button
            className="button run-button"
            onClick={() => {
              if (replacement) editDefinition(replacement, false)
              setReplacement(null)
            }}
          >
            <Check size={16} />
            Replace
          </button>
        </div>
      </dialog>
    </div>
  )
}

function App() {
  const [openMachines, setOpenMachines] = useState(loadOpenMachines)
  const latest = useRef(openMachines)
  const [closingId, setClosingId] = useState<string | null>(null)
  const closeDialog = useRef<HTMLDialogElement>(null)
  const tabList = useRef<HTMLDivElement>(null)
  const [saved, setSaved] = useState(true)

  function saveOpenMachines(next: OpenMachines): boolean {
    latest.current = next
    setOpenMachines(next)
    try {
      localStorage.setItem(
        WORKSPACE_STORAGE_KEY,
        JSON.stringify({
          version: 1,
          activeId: next.activeId,
          tabs: next.tabs.map((tab) => ({
            id: tab.id,
            machine: tab.definition,
          })),
        }),
      )
      setSaved(true)
      return true
    } catch {
      setSaved(false)
      return false
    }
  }

  function updateDefinition(
    id: string,
    definition: MachineDefinition,
  ): boolean {
    return saveOpenMachines({
      ...latest.current,
      tabs: latest.current.tabs.map((tab) =>
        tab.id === id ? { ...tab, definition } : tab,
      ),
    })
  }

  function updateStatus(id: string, status: string) {
    if (latest.current.tabs.find((tab) => tab.id === id)?.status === status)
      return
    const next = {
      ...latest.current,
      tabs: latest.current.tabs.map((tab) =>
        tab.id === id ? { ...tab, status } : tab,
      ),
    }
    latest.current = next
    setOpenMachines(next)
  }

  function selectTab(id: string) {
    saveOpenMachines({ ...latest.current, activeId: id })
  }

  function openTab(definition = createExample('blank')) {
    const id = crypto.randomUUID()
    saveOpenMachines({
      tabs: [...latest.current.tabs, { id, definition, status: 'Ready' }],
      activeId: id,
    })
  }

  useEffect(() => {
    if (closingId) closeDialog.current?.showModal()
    else closeDialog.current?.close()
  }, [closingId])

  useLayoutEffect(() => {
    tabList.current?.querySelector('.machine-tab.active')?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    })
  }, [openMachines.activeId])

  const closingTab = openMachines.tabs.find((tab) => tab.id === closingId)
  const tabBar = (
    <nav className="machine-tab-bar" aria-label="Open machines">
      <div
        ref={tabList}
        className="machine-tab-list"
        role="tablist"
        aria-label="Turing machines"
      >
        {openMachines.tabs.map((tab, index) => (
          <div
            className={`machine-tab ${tab.id === openMachines.activeId ? 'active' : ''}`}
            key={tab.id}
          >
            <button
              type="button"
              role="tab"
              id={`machine-tab-${tab.id}`}
              aria-selected={tab.id === openMachines.activeId}
              aria-controls={`machine-panel-${tab.id}`}
              tabIndex={tab.id === openMachines.activeId ? 0 : -1}
              title={`${tab.definition.name || 'Untitled machine'}: ${tab.status}`}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => {
                let target = index
                if (event.key === 'ArrowRight')
                  target = (index + 1) % openMachines.tabs.length
                else if (event.key === 'ArrowLeft')
                  target =
                    (index + openMachines.tabs.length - 1) %
                    openMachines.tabs.length
                else if (event.key === 'Home') target = 0
                else if (event.key === 'End')
                  target = openMachines.tabs.length - 1
                else return
                event.preventDefault()
                const next = openMachines.tabs[target]
                selectTab(next.id)
                requestAnimationFrame(() =>
                  document.getElementById(`machine-tab-${next.id}`)?.focus(),
                )
              }}
            >
              <span
                className={`tab-status-dot ${tab.status === 'Running' ? 'running' : ''}`}
              />
              <span className="tab-name">
                {tab.definition.name || 'Untitled machine'}
              </span>
            </button>
            <IconButton
              label={`Close ${tab.definition.name || 'Untitled machine'}`}
              disabled={openMachines.tabs.length === 1}
              onClick={() => setClosingId(tab.id)}
            >
              <X size={13} />
            </IconButton>
          </div>
        ))}
      </div>
      <IconButton label="New machine tab" onClick={() => openTab()}>
        <Plus size={17} />
      </IconButton>
    </nav>
  )

  return (
    <>
      {openMachines.tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`machine-panel-${tab.id}`}
          aria-labelledby={`machine-tab-${tab.id}`}
          hidden={tab.id !== openMachines.activeId}
        >
          <MachineWorkbench
            id={tab.id}
            initialDefinition={tab.definition}
            tabs={tab.id === openMachines.activeId ? tabBar : null}
            saved={saved}
            onDefinitionChange={updateDefinition}
            onStatusChange={updateStatus}
            onOpenMachine={openTab}
          />
        </div>
      ))}
      <dialog
        ref={closeDialog}
        className="confirm-dialog"
        onCancel={() => setClosingId(null)}
      >
        <h2>Close {closingTab?.definition.name || 'machine'}?</h2>
        <p>This removes the machine from your open tabs and stops its run.</p>
        <div className="dialog-actions">
          <button
            type="button"
            className="button"
            autoFocus
            onClick={() => setClosingId(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button run-button"
            onClick={() => {
              const current = latest.current
              const index = current.tabs.findIndex(
                (tab) => tab.id === closingId,
              )
              const tabs = current.tabs.filter((tab) => tab.id !== closingId)
              if (tabs.length)
                saveOpenMachines({
                  tabs,
                  activeId:
                    current.activeId === closingId
                      ? tabs[Math.min(index, tabs.length - 1)].id
                      : current.activeId,
                })
              setClosingId(null)
            }}
          >
            <X size={15} />
            Close tab
          </button>
        </div>
      </dialog>
    </>
  )
}

export default App
