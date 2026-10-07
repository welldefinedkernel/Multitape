# Multitape

A small browser-based multitape Turing machine workbench. Built with React,
TypeScript, and Vite. No backend, accounts, or external services are required;
fonts and icons are bundled locally.

## Run

Use Node.js 22.18 or newer.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. For a production build, run `npm run build`;
the static application is generated in `dist/`. `npm run preview` serves that build.

## Machine Rules

- Choose 1 to 16 tapes. Only tape 1 receives the input; all other tapes start blank.
- Every head starts at cell 0. On tape 1, this is the first input character. Empty
  input places the head on a blank cell. There is no leading marker or head offset.
- Lambda (`U+03BB`) is blank. In transition symbol fields, an empty value,
  `lambda`, or `\lambda` also means blank. Whitespace in the input becomes blank
  cells. Each symbol is one character; emoji are not supported.
- Name, add, or remove states. The radio button selects the start state; the
  checkbox marks a halt state. Entering a halt state stops immediately.
- A transition reads one symbol from every tape, writes to every current head
  position, then moves each head independently: `L` left, `R` right, or `N` stay.
- Each Read field accepts a single symbol or alternatives such as `0,1` or
  `{0,1}`. A set can include blanks, for example `{0,1,lambda}`. Sets on different
  tapes are independent: `{0,1}` on tape 1 and `{a,b}` on tape 2 match all four
  combinations. Write fields still specify one fixed symbol per tape.
- Tapes extend in both directions, including negative positions. All reads in
  a step happen before any writes or movements.
- Rules are deterministic: the same state and read tuple cannot have two rules.
  Overlapping read sets in the same state are rejected too.
  With no matching rule, the machine stops without counting an extra step.
- Editing the machine resets the simulation without remounting the tape views.
  Step back retains the last 100
  snapshots. An automatic run pauses after 10,000 steps and can be resumed.

Binary-copy and binary-flip examples are included. Tape arrows pan the view;
the target icon returns to following the head. On small screens, the settings
button in the header opens the machine editor. Wide transition tables scroll
horizontally within their frame.

## Multiple Machines

The tab bar keeps multiple machines open. Use its plus button or **New machine**
to add a blank machine. Importing a JSON file also opens a new tab without
replacing your current work. Each tab has its own tapes, state, undo history,
speed, and playback controls. Running machines continue when you switch tabs;
a green dot marks a running tab. Closing a tab asks for confirmation and stops
that machine. The final tab cannot be closed.

Use Left/Right arrows or Home/End while a tab is focused to switch between tabs.

## Saving

All open machine definitions and the selected tab save automatically in the
current browser's local storage. Playback state is not saved: reopening starts
each machine at step 0. Existing single-machine saves are still loaded.
The download button exports the selected machine as a versioned JSON file.
Loading an example replaces only the selected tab and asks before replacing
edited work; malformed imports leave all current machines intact. If local
storage is unavailable, the current tab still works and JSON download is available.
Older saved or imported machines using `S` for stay are automatically converted to `N`.

## Checks

```sh
npm test
npm run lint
npm run build
npx playwright install chromium --only-shell
npm run test:e2e
```

Unit tests cover tape semantics and validation. Browser tests cover playback,
custom three-tape machines, blanks, validation, JSON round trips, and mobile
layouts. Playwright starts a development server if one is not already running
on port 5173. Screenshots are written to `test-results/`.

## Simulation Engine

Tape writes and movements use
[`@turing-machine-js/machine`](https://github.com/mellonis/turing-machine-js).
The adapter keeps immutable snapshots with absolute tape coordinates for
display and undo. The engine is licensed GPL-3.0-or-later; review its license
requirements before distributing a bundled application.
