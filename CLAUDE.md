# CLAUDE.md

Bitphase is a web-based chiptune tracker for retro sound chips (currently AY-3-8910 / YM2149F), built with Svelte 5, TypeScript, Vite, and Tailwind 4.

## Authoritative rules

The coding rules in `.cursor/rules/` are the source of truth and apply to all work here. Read and follow them:

- `.cursor/rules/general.mdc` — architecture, directory layout, chip-abstraction rules, code style.
- `.cursor/rules/svelte5.mdc` — Svelte 5 runes API (`$state`, `$derived`, `$effect`, `$props`, snippets). Svelte 5 syntax only.

Key non-negotiables from those rules:

- **No lint errors, ever.** Past production bugs traced to lint errors. Fix any you see.
- **No comments** — write self-documenting code.
- **No chip-specific code in generic parts.** AY-specific logic stays in `src/lib/chips/ay/`; generic code uses `src/lib/chips/base/`. The architecture must stay ready for additional chips.
- **State via Svelte 5 runes in `.svelte.ts` files**, not writable stores.

## Commands

- `pnpm dev` — build WASM, then start Vite dev server (HMR).
- `pnpm build` — build WASM, then production build.
- `pnpm build:wasm` — build only the Ayumi WASM module (requires Emscripten / `emcc` on PATH; output goes to `public/ayumi.wasm`).
- `pnpm check` — type-check (`svelte-check` + `tsc`). Run before considering work done.
- `pnpm test` — vitest watch mode. `pnpm test:run` — run once.
- `pnpm btp-to-wav` — CLI export of a `.btp` to WAV.

## Notes

- `@` path alias maps to `./src` (vite + vitest).
- Tests live in `tests/`, mirroring `src/` structure; vitest uses jsdom.
- The Ayumi emulator C source is a git submodule at `external/ayumi`; clone with `--recurse-submodules`.
- Stale `public/ayumi.wasm` causes silent no-audio — rebuild WASM after changing the C source or when audio is unexpectedly silent.
- `public/` holds runtime AudioWorklet scripts (`tracker-*.js`, `ay-*.js`, `bitphase-audio-processor.js`) that are served as-is, not bundled.

See `README.md` for full feature list and project structure.
