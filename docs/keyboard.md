# Keyboard

Shortcuts are customizable under **Settings → Keyboard**. Defaults below use `Mod` for Ctrl on Windows/Linux and ⌘ on macOS.

## Playback

| Action                  | Default |
| ----------------------- | ------- |
| Play / Pause            | `Space` |
| Play from beginning     | `F5`    |
| Play pattern (loop)     | `F6`    |
| Play from cursor        | `F7`    |
| Play from cursor (hold) | `Enter` |
| Play solo / Unmute all  | `F8`    |

## Editing

| Action                | Default       |
| --------------------- | ------------- |
| Undo                  | `Mod+Z`       |
| Redo                  | `Mod+Y`       |
| Copy                  | `Mod+C`       |
| Cut                   | `Mod+X`       |
| Paste                 | `Mod+V`       |
| Magic paste           | `Mod+Shift+V` |
| Select all            | `Mod+A`       |
| Increment value       | `=`           |
| Decrement value       | `-`           |
| Transpose octave up   | `Shift++`     |
| Transpose octave down | `Shift+-`     |
| Swap channels left    | `Mod+Alt+←`   |
| Swap channels right   | `Mod+Alt+→`   |
| Insert pattern row    | `Mod+I`       |
| Remove pattern row    | `Mod+R`       |
| Apply script...       | `Mod+Shift+S` |

## Navigation

| Action                               | Default                |
| ------------------------------------ | ---------------------- |
| Cycle channel                        | `` ` ``                |
| Cycle channel (reverse)              | `` Shift+` ``          |
| Page up / down                       | `PageUp` / `PageDown`  |
| First / last row                     | `Home` / `End`         |
| First / last column                  | `Mod+Home` / `Mod+End` |
| Octave up / down (editor)            | `*` / `/`              |
| Select instrument or table in editor | `Mod+LMB`              |

## AY helpers

| Action                  | Default       |
| ----------------------- | ------------- |
| Toggle auto envelope    | `Mod+E`       |
| Toggle envelope as note | `Mod+Shift+E` |

## Panels

| Action               | Default |
| -------------------- | ------- |
| Toggle expand panel  | `Mod+\` |

Works from the pattern editor too. Expands/collapses the instruments & tables side panel. `Escape` also collapses when expanded.

## Note entry (piano keyboard)

With the pattern editor focused on a note field, keys map like a tracker piano layout. Octaves are relative to the editor octave setting.

### Upper row (+1 octave)

| Key                                             | Note                                         |
| ----------------------------------------------- | -------------------------------------------- |
| `Q` `2` `W` `3` `E` `R` `5` `T` `6` `Y` `7` `U` | C C# D D# E F F# G G# A A# B                 |
| `I` `9` `O` `0` `P` `[`                         | C C# D D# E F (+2 octaves from base for I-[) |

### Lower row (base octave)

| Key                                             | Note                         |
| ----------------------------------------------- | ---------------------------- |
| `Z` `S` `X` `D` `C` `V` `G` `B` `H` `N` `J` `M` | C C# D D# E F F# G G# A A# B |
| `,` `L` `.` `;` `/`                             | C C# D D# E (+1 octave)      |

::: tip
With the default shortcuts, `/` is **octave down**, so it does not enter the piano **E** from the table above. Remap octave down under **Settings → Keyboard** if you want `/` for note entry.
:::

### Note off

Press `A` for **OFF** (note cut / note off).

### MIDI

MIDI keyboards can also enter notes when MIDI input is enabled in settings.
