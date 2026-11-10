# Piano roll

The piano roll is another way to edit the same patterns as the [pattern editor](/pattern-editor). Time runs left to right across the order, and pitch runs up the keyboard. Notes you draw here are ordinary pattern notes, so switching back to the tracker shows the same data.

::: warning Experimental
The piano roll is unfinished. It stays hidden until you turn on **Settings → Experimental features**.
:::

## Open it

1. Open **Settings** and enable **Experimental features**.
2. Switch with **View → Piano roll**, or the **Tracker / Piano roll** control at the top of the song view.

**View → Tracker** (or the same control) returns to the pattern grid. The pattern length field next to the switch edits the current pattern, from 1 to 256 rows, while playback is stopped.

## Layout

The bar across the top lists every song in the project and a button for each of its channels. The roll always shows one channel. Click another button to edit that voice. Chip-wide columns (AY envelope and noise, SAA noise and envelope, and so on) are edited from the lane, not as their own channel.

| Control | What it does |
| ------- | ------------ |
| Time + / − | Zoom the row width |
| Pitch + / − | Zoom the key height |
| Lane menu | Choose which non-note field the bottom strip edits |

The bottom **lane** is one pattern field at a time: instrument, table, volume (or left and right on SAA), effect, or a chip-wide column. The menu labels chip-wide fields with **Chip**. Click a cell in the lane to type a value. On an effect lane, the editor also lists the commands for that chip. `Enter` writes the cell and opens the next row. `Escape` closes the editor and leaves the cell as it was. Clicking elsewhere writes the value and closes the editor.

## Notes

Click an empty cell to place a note at that pitch and row, then drag to set how many rows it lasts. Drag the body of a note to move it in time or pitch. Drag the right edge to change its length.

| Gesture | Result |
| ------- | ------ |
| Click and drag on empty space | Place a note and set its length |
| Drag a note | Move it |
| Drag the right edge | Resize it |
| Right-click a note, or drag with the right button | Erase |
| `Shift`+click on empty space | Place a release |
| `Alt`+click on empty space | Place a note off |
| Right-click the time ruler | Note off on that row |
| `Shift`+right-click the time ruler | Release on that row |

`Mod`+drag starts a selection box. Add to the current selection with `Shift`. **Select all** (`Mod+A`) selects the notes currently on screen.

Copy, cut, and paste use the same shortcuts as the pattern editor (`Mod+C`, `Mod+X`, `Mod+V`). Paste starts at the cursor row. If the pasted notes would overlap notes that are already there, both sets stay and the overlap is marked until you erase one of them.

Arrow keys move the selected note by one row or one semitone. `Shift`+`↑` / `↓` moves it by an octave. With nothing selected, the arrows move the cursor. `Delete` or `Backspace` removes the selection. The computer-keyboard piano layout from [Keyboard](/keyboard) enters a note on the current row.

`Space` starts and stops playback. While audio is running, edits are locked; click the time ruler to move the play position.

Edits go through the same undo history as the pattern editor.
