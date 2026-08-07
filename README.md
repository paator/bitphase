# Bitphase

<div align="center">
  <img src="public/logo.svg" alt="Logo" width="200"/>
  <br /><br />
  <img width="3020" height="1972" alt="bitphase app_" src="https://github.com/user-attachments/assets/e64270d0-891a-46e3-829f-c264b8e74d36" />
</div>

[Bitphase](https://bitphase.app/)

A modern web-based chiptune tracker designed for creating music on retro sound chips. Currently supports the AY-3-8910 / YM2149F chip (used in ZX Spectrum and other 8-bit computers), with plans to support additional chips in the future.

## Features

### Tracking

- Canvas-based pattern editor with order list
- Field-based editing with selection, copy/cut/paste, and magic paste
- Virtual channels — map multiple pattern columns onto a single hardware channel
- Transpose, increment/decrement, and channel swap editing tools
- Auto envelope and envelope-as-note modes
- Customizable keybindings

### Instruments and tables

- AY/YM instrument editor with tone, noise, envelope, and sample playback
- Timer effects (waveform, PWM, and related AY timer instruments)
- Tables (known as Ornaments in Vortex Tracker 2)
- Built-in instrument presets
- Instrument preview playground

### Playback

- Play, pause, play from cursor, play pattern, and solo/mute controls
- Real-time channel oscilloscopes
- MIDI keyboard input for note entry

### Project I/O

- Open and save Bitphase projects (`.btp`)
- Import Pro Tracker 3 (`.pt3`) and Vortex Tracker 2 (`.vt2`) modules
- Export WAV, PSG, TMR, and SNDH (not supporting timer effects yet)
- Multi-chip PSG and TMR export as ZIP
- Command-line `.btp` to WAV export (`pnpm btp-to-wav`)

### Workflow

- Undo/redo with labeled history
- Lua user scripts for batch edits on selections
- Automatic project backup with recovery on reload
- Custom themes and appearance settings

## Prerequisites

- **Node.js** (v18 or higher; v20 recommended)
- **pnpm** (v10.11.0 or higher)
- **Emscripten SDK** - required for building WebAssembly modules (AY and NES)
- **Git submodules** - the Ayumi emulator lives in `external/ayumi`

### Installing Emscripten

1. Download and install Emscripten from [emscripten.org](https://emscripten.org/docs/getting_started/downloads.html)
2. Set the `EMSDK` environment variable to point to your Emscripten installation
3. Ensure `emcc` is available in your PATH

## Getting Started

1. **Clone the repository**

   ```bash
   git clone --recurse-submodules https://github.com/paator/bitphase.git
   cd bitphase
   ```

   If you already cloned without submodules:

   ```bash
   git submodule update --init --recursive
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Start the development server**

   ```bash
   pnpm dev
   ```

   This builds the WASM modules (Ayumi + NES) and starts Vite. You can also run `pnpm build:wasm` on its own when the C sources change.

4. **Open your browser**

   Navigate to `http://localhost:5173` (or the port shown in the terminal)

## Available Scripts

- `pnpm dev` - build WASM and start the development server with hot module replacement
- `pnpm build` - build WASM, the tracker production bundle, and the docs site into `dist/`
- `pnpm build:wasm` - build only the WebAssembly modules (`public/ay/ayumi.wasm`, `public/nes/*.wasm`)
- `pnpm docs:dev` - run the VitePress docs site locally
- `pnpm docs:build` - build docs into `dist/docs`
- `pnpm preview` - preview the production tracker build locally
- `pnpm check` - run TypeScript and Svelte type checking
- `pnpm test` - run tests in watch mode
- `pnpm test:run` - run tests once
- `pnpm btp-to-wav` - export a `.btp` project to WAV from the command line

## Project Structure

```
bitphase/
├── cli/                     # Command-line tools (btp-to-wav, BTP loading)
├── docs/                    # User docs (VitePress) and format specs
├── external/
│   ├── ayumi/               # AY-8910 emulator C source (git submodule)
│   └── nsfplug/             # NES APU / MMC5 C sources used for WASM
├── public/                  # Static assets and runtime audio code
│   ├── ay/ayumi.wasm        # Compiled AY chip emulator
│   ├── nes/*.wasm           # Compiled NES chip emulators
│   ├── bitphase-audio-processor.js
│   ├── tracker-*.js         # AudioWorklet tracker pipeline
│   ├── ay-*.js              # AY chip audio runtime
│   ├── fonts/
│   └── worklet/
├── src/
│   ├── app.css              # Global styles
│   ├── main.ts              # App entry point
│   ├── App.svelte           # Root component
│   ├── demo/                # Bundled demo songs (.btp)
│   ├── presets/             # Built-in instrument preset JSON files
│   └── lib/
│       ├── chips/           # Chip implementations and registry
│       │   ├── ay/          # AY-8910 (schema, adapter, renderer, processor)
│       │   └── base/        # Shared chip interfaces
│       ├── components/      # Svelte UI components
│       │   ├── AppLayout/
│       │   ├── Menu/
│       │   ├── Song/        # Pattern editor and song view
│       │   ├── Instruments/
│       │   ├── Modal/
│       │   ├── Settings/
│       │   ├── Tables/
│       │   ├── Theme/
│       │   ├── History/
│       │   ├── Details/
│       │   ├── Audio/
│       │   └── ...          # Shared UI primitives (Button, Input, etc.)
│       ├── config/          # Menu, keybindings, settings, themes, export formats
│       ├── models/          # Domain models (project, song, history, virtual channels)
│       │   ├── pt3/         # PT3 tuning tables
│       │   └── song/        # Song model utilities
│       ├── presets/         # Preset loading utilities
│       ├── services/        # Business logic
│       │   ├── app/         # Menu actions and app context
│       │   ├── audio/       # Playback and AudioWorklet bridge
│       │   ├── backup/      # Autobackup
│       │   ├── file/        # Import/export (BTP, PT3, VT2, WAV, PSG, TMR, SNDH)
│       │   ├── history/     # Undo/redo diff tracking
│       │   ├── midi/        # MIDI input
│       │   ├── modal/
│       │   ├── pattern/     # Pattern editing, navigation, clipboard
│       │   │   └── editing/ # Field-based editing strategies
│       │   ├── project/     # Project management and migration
│       │   ├── theme/
│       │   └── user-scripts/  # Lua user scripts
│       ├── stores/          # Reactive state (Svelte 5 runes, .svelte.ts)
│       ├── types/
│       ├── ui-rendering/    # Canvas-based pattern editor and order list
│       └── utils/
└── tests/                   # Tests mirroring src/ structure
    ├── fixtures/
    ├── lib/
    ├── public/              # Tests for public/ runtime scripts
    └── psg/
```

## Documentation

- [TMR format spec](docs/tmr-format.md) — Bitphase timer companion format for PSG export. In development!
