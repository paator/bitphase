# Import & export

Bitphase can open projects, import classic AY modules, and export audio or hardware-oriented dumps. What you see under **File → Export** depends on which chips are in the project - for example PSG / SNDH only appear for AY songs.

## Projects (`.btp`)

| Action | Menu            |
| ------ | --------------- |
| Open   | **File → Open** |
| Save   | **File → Save** |

`.btp` is Bitphase's own project format: the full project serialized as JSON, then gzip-compressed. It keeps songs, patterns, order, instruments, tables, and settings together.

Save always downloads a file named from the project title (browsers do not overwrite a path on disk the way a desktop app would). There is no separate **Save As** in the menu.

## Import modules (`.pt3` / `.vt2` / `.taym`)

**File → Import Module** opens a picker for:

| Format  | What it is                        |
| ------- | --------------------------------- |
| `.pt3`  | ProTracker 3.4 AY modules         |
| `.vt2`  | Vortex Tracker 2 AY modules       |
| `.taym` | Register-level timer-trick tracks |

`.pt3` and `.vt2` bring in classic AY tracker songs.

### TAYM

[TAYM](https://github.com/ruguevara/taym) is a register-level interchange format: a frame-by-frame register dump plus a description of the timers that rewrite registers between frames (the trick behind SID voices, sync-buzzer, and digi-drums on Atari ST).

## Side data (`.json`)

Instruments, tables, and themes can be saved or loaded as `.json` from their own panels - not from the File menu.
User scripts have their own JSON export/import in the scripts UI.

## Export overview

Open **File → Export** and pick a format. Availability:

| Format        | When it appears                                    |
| ------------- | -------------------------------------------------- |
| **WAV**       | Always                                             |
| **PSG**       | Exactly one AY song                                |
| **SNDH**      | Exactly one AY song                                |
| **PSG (ZIP)** | More than one AY song                              |
| **VGM**       | AY and/or NES, at most 2 of each type (one `.vgm`) |

NES-only projects get **WAV** and **VGM**. PSG / SNDH are AY paths.

### WAV

Opens **WAV Export Settings**, then renders the song (or songs) to audio.

| Option       | Choices                                         | Default                                    |
| ------------ | ----------------------------------------------- | ------------------------------------------ |
| Sample rate  | 22050 / 44100 / 48000 / 96000 Hz                | 44100                                      |
| Bit depth    | 16-bit PCM / 24-bit PCM / 32-bit float          | 16-bit PCM                                 |
| Loop repeats | Extra passes after the first play (0-9)         | 0 (play once)                              |
| Channels     | Mixed stereo file, or separate file per channel | Mixed                                      |
| Metadata     | Title, artist, album, year, comment             | Title and artist from the project when set |

**Separate channels** packs the WAVs into a ZIP (handy for oscilloscope or DAW stems).

From the command line you can also run `pnpm btp-to-wav` on a `.btp` file (see the project README).

### PSG

AY register dump for hardware players and emulators. One interrupt frame after another; no options dialog beyond a progress indicator.

- **One AY song** → `{project}.psg`
- **Several AY songs** → **PSG (ZIP)** with one `.psg` per AY chip (`..._ay1.psg`, `..._ay2.psg`, ...)

### SNDH

Available for a **single** AY song. Used for Atari ST hardware playback. Bitphase builds an SNDH file from a PSG dump plus a fixed header (including a 50 Hz timer tag).

### VGM

Multi-chip register dump for [VGM](https://vgmrips.net/wiki/VGM_Specification) players.
