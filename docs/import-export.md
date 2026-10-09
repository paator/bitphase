# Import & export

Bitphase can open projects, import classic AY modules, and export audio or hardware-oriented dumps. What you see under **File → Export** depends on which chips are in the project - for example PSG / SNDH only appear for AY songs.

## Projects (`.btp`)

| Action | Menu            |
| ------ | --------------- |
| Open   | **File → Open** |
| Save   | **File → Save** |

`.btp` is Bitphase's own project format: the full project serialized as JSON, then gzip-compressed. It keeps songs, patterns, order, instruments, tables, and settings together.

Save always downloads a file named from the project title (browsers do not overwrite a path on disk the way a desktop app would). There is no separate **Save As** in the menu.

## Import modules

**File → Import Module** opens a picker for:

| Format  | What it is                        |
| ------- | --------------------------------- |
| `.pt3`  | ProTracker 3.4 AY modules         |
| `.vt2`  | Vortex Tracker 2 AY modules       |
| `.taym` | Register-level timer-trick tracks |
| `.psg`  | AY register dumps                 |
| `.ftm`  | FamiTracker modules               |
| `.0cc`  | 0CC-FamiTracker modules           |
| `.dnm`  | Dn-FamiTracker modules            |

`.pt3` and `.vt2` bring in classic AY tracker songs.

### FamiTracker (`.ftm` / `.0cc` / `.dnm`)

`.ftm` and `.0cc` import as a 2A03 song. `.dnm` imports when the module is NES, or NES plus Sunsoft 5B.

A Sunsoft 5B module (`.dnm`, or `.ftm` / `.0cc` with that expansion and eight channels) becomes two songs: the 2A03 channels, plus an AY song for the 5B channels. The AY song uses the Sunsoft 5B clock. Any other expansion is left out of a `.ftm` or `.0cc` import, and Bitphase reports that in the import notes. A `.dnm` file with a different expansion is rejected.

### TAYM

[TAYM](https://github.com/ruguevara/taym) is a register-level interchange format: a frame-by-frame register dump plus a description of the timers that rewrite registers between frames (the trick behind SID voices, sync-buzzer, and digi-drums on Atari ST).

## Side data (`.json`)

Instruments, tables, and themes can be saved or loaded as `.json` from their own panels - not from the File menu.
User scripts have their own JSON export/import in the scripts UI.

## Export overview

Open **File → Export** and pick a format. Availability:

| Format         | When it appears                                    |
| -------------- | -------------------------------------------------- |
| **WAV**        | Always                                             |
| **PSG**        | Exactly one AY song                                |
| **TAYM**       | Exactly one AY song                                |
| **SNDH**       | Exactly one AY song                                |
| **PSG (ZIP)**  | More than one AY song                              |
| **TAYM (ZIP)** | More than one AY song                              |
| **VGM**        | AY and/or NES, at most 2 of each type (one `.vgm`) |
| **NSF**        | Only AY and NES songs, at most one of each         |

A NES-only project exports **WAV**, **VGM**, and **NSF**. PSG, TAYM, and SNDH are AY paths. An AY-only project can also export **NSF** (as Sunsoft 5B).

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

### TAYM export

Same register-level format as the [TAYM import](#taym). Timer effects are included.

- **One AY song** → `{project}.taym`
- **Several AY songs** → **TAYM (ZIP)** with one `.taym` per AY song

From the command line you can also run `pnpm btp-to-taym` on a `.btp` file (see the project README).

### SNDH

Available for a **single** AY song. Used for Atari ST hardware playback. Bitphase builds an SNDH file from a PSG dump plus a fixed header (including a 50 Hz timer tag).

### VGM

One file for [VGM](https://vgmrips.net/wiki/VGM_Specification) players. The project can mix AY and NES, up to two songs of each chip. NES APU writes and DPCM samples are included. AY timer effects are written into the file.

### NSF

One `.nsf` for NSF players. The project may contain only AY and NES songs, and at most one of each.

| Project                      | What the file contains                                        |
| ---------------------------- | ------------------------------------------------------------- |
| One NES song                 | 2A03. PAL is set when the song system is PAL                  |
| One AY song                  | Sunsoft 5B. PAL is set when the interrupt rate is under 55 Hz |
| One NES song and one AY song | 2A03 plus Sunsoft 5B. PAL follows the NES song                |

AY periods in a Sunsoft 5B file are retuned to half the NTSC or PAL CPU clock. A Dendy song uses the NTSC clock. Title and artist come from the project. The order-list loop marker is written into the file. A song that plays through to the end halts.
