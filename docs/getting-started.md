# Getting started

## Running / Building

Bitphase can be accessed via [bitphase.app](https://bitphase.app/), which always contains the freshest codebase build. Alternatively you can make your own, self hosted build:

### Prerequisites

- **Node.js** (v18 or higher; v20 recommended)
- **pnpm** (v10.11.0 or higher)
- **Emscripten SDK** - required for building WebAssembly modules (AY and NES)
- **Git submodules** - the Ayumi emulator lives in `external/ayumi`

### Installing Emscripten

1. Download and install Emscripten from [emscripten.org](https://emscripten.org/docs/getting_started/downloads.html)
2. Set the `EMSDK` environment variable to point to your Emscripten installation
3. Ensure `emcc` is available in your PATH

### Getting Started

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

### Available Scripts

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

## Open the tracker

Go to [bitphase.app](https://bitphase.app/). Bitphase runs in the desktop browser - no separate download is required. Mobile is not supported yet.

You can also install it as an app (PWA) so it opens in its own window:

- **Chrome / Edge / Brave:** open [bitphase.app](https://bitphase.app/), then use the install icon in the address bar, or **Menu → Cast, save, and share → Install page as app…** (wording varies by browser).
- **Safari (macOS):** open the site, then **File → Add to Dock**.

After install, launch Bitphase from your dock or app list like a normal application.

## Main areas

Regardless whether you built your own instance or you went to bitphase.app, you are presented with the following:

| Area                  | What it’s for                                     |
| --------------------- | ------------------------------------------------- |
| Pattern editor        | Enter notes, table arpeggios, volumes and effects |
| Order list            | Arrange which patterns play, and in what order    |
| Instruments           | Edit sound and behavior settings for instruments  |
| Tables                | Tables used by instruments and effects            |
| Song / project fields | Title, author, chip settings and more             |

## Create a project

1. Open **File → New → Project**. That clears the workspace to an empty project (no songs yet).
2. Add a song by choosing a chip from the empty-state buttons, or use **File → New → Song**:
    - **AY-3-8910 / YM2149F** - recommended starting point
    - **NES (2A03 / 2A07)** - WIP, still in development
3. You will now see a blank song with an empty pattern, ready for notes, instruments, and effects.

You can also open an existing Bitphase project (`.btp`) with **File → Open**, or import Vortex/ProTracker modules (`.vt2` / `.pt3`) with **File → Import Module**.

## Songs and chips

In Bitphase, a **song is per chip**.

- Each song targets one sound chip (for example AY or NES).
- Its instruments, pattern layout, and chip settings belong to that chip.
- A **project** can contain several songs. You can mix chip types in one project (for example one AY song and one NES song), but each song stays bound to its own chip.

Bitphase's goal is to support real-life multi-chip setups related to AY chips, such as
**2×AY-3-8910 (Turbosound)**, **2×YM2203 (Turbosound FM)**, and **NES + Sunsoft 5B**.
The tracker does not enforce realistic combinations - keep real-life limits in mind if you want to export and play the song on actual hardware.

Use **File → New → Song** to add another song for a chosen chip without starting a new project.

## Playback basics

| Action                 | Default shortcut |
| ---------------------- | ---------------- |
| Play / pause           | `Space`          |
| Play from beginning    | `F5`             |
| Play pattern (loop)    | `F6`             |
| Play from cursor       | `F7`             |
| Play solo / unmute all | `F8`             |

## Next steps

- Learn [note entry and shortcuts](/keyboard)
- Read the [pattern editor](/pattern-editor) overview
- Arrange patterns in the [order list](/order-list)
- Browse the [effects reference](/effects)
- Try a demo song under **Help → Demo songs**
