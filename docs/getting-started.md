# Getting started

## Building
Bitphase can be accessed via bitphase.app, which always contains the freshest codebase build. Alternatively you can make your own, self hosted build:
### Prerequisites

- **Node.js** (v18 or higher)
- **pnpm** (v10.11.0 or higher) - Package manager
- **Emscripten SDK** - Required for building WebAssembly modules

### Installing Emscripten

1. Download and install Emscripten from [emscripten.org](https://emscripten.org/docs/getting_started/downloads.html)
2. Set the `EMSDK` environment variable to point to your Emscripten installation
3. Ensure `emcc` is available in your PATH

### Getting Started

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd bitphase
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Build WebAssembly modules**

   ```bash
   pnpm build:wasm
   ```

   This compiles the Ayumi chip emulator to WebAssembly. You only need to run this once, or when the WASM code changes.

4. **Start the development server**

   ```bash
   pnpm dev
   ```

5. **Open your browser**
   Navigate to `http://localhost:5173` (or the port shown in the terminal)

### Available Scripts

- `pnpm dev` - Build WASM and start development server with hot module replacement
- `pnpm build` - Build WASM and create production build
- `pnpm build:wasm` - Build only the WebAssembly modules
- `pnpm preview` - Preview the production build locally
- `pnpm check` - Run TypeScript and Svelte type checking
- `pnpm test` - Run tests in watch mode
- `pnpm test:run` - Run tests once


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

1. Open **File → New Project**.
2. Choose a chip:
    - **AY-3-8910 / YM2149F** - recommended starting point
    - **NES (2A03 / 2A07)** - WIP, still in development
3. You will now see a blank song, initialized with an empty pattern ready for you to begin composing music, add patterns, and define instruments and effects.

You can also open an existing Bitphase project (`.btp`) with **File → Open**, or import Vortex/ProTracker modules (`.vt2` / `.pt3`) with **File → Import**.

## Songs and chips

In Bitphase, a **song is per chip**.

- Each song targets one sound chip (for example AY or NES).
- Its instruments, pattern layout, and chip settings belong to that chip.
- A **project** can contain several songs. You can mix chip types in one project (for example one AY song and one NES song), but each song stays bound to its own chip.

Bitphase's goal is to support real-life multi-chip setups related to AY chips, such as
**2×AY-3-8910 (Turbosound)**, **2×YM2203 (Turbosound FM)**, and **NES + Sunsoft 5B**.
The tracker does not enforce realistic combinations - keep real-life limits in mind if you want to export and play the song on actual hardware.

Use **File → New Song** to add another song for a chosen chip without starting a new project.

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
- Browse the [effects reference](/effects)
- Try a demo song under **Help → Demo songs**
