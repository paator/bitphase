# Getting started

## Open the tracker

Go to [bitphase.app](https://bitphase.app/). Bitphase runs in the desktop browser - no separate download is required. Mobile is not supported yet.

You can also install it as an app (PWA) so it opens in its own window:

- **Chrome / Edge / Brave:** open [bitphase.app](https://bitphase.app/), then use the install icon in the address bar, or **Menu → Cast, save, and share → Install page as app…** (wording varies by browser).
- **Safari (macOS):** open the site, then **File → Add to Dock**.

After install, launch Bitphase from your dock or app list like a normal application.

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

## Main areas

| Area                  | What it’s for                                     |
| --------------------- | ------------------------------------------------- |
| Pattern editor        | Enter notes, table arpeggios, volumes and effects |
| Order list            | Arrange which patterns play, and in what order    |
| Instruments           | Edit sound and behavior settings for instruments  |
| Tables                | Tables used by instruments and effects            |
| Song / project fields | Title, author, chip settings and more             |

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
