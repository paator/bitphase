# Order list

The **order list** is the song arrangement. Patterns hold the notes; the order decides **which patterns play, and in what sequence**. Playback walks the list from top to bottom.

Each slot shows a two-digit pattern id (`00`-`99`). The same id can appear more than once - those slots share the same pattern data. The [pattern editor](/pattern-editor) always shows the pattern for the **currently selected** order slot.

## Where to find it

The order lives in the **Order** card on the left of the song view, beside the pattern editor(s).

Each slot can show:

| What you see     | Meaning                              |
| ---------------- | ------------------------------------ |
| Pattern id       | Two-digit number (`00`-`99`)         |
| `►`              | The selected slot                    |
| Left accent bar  | Loop marker on that slot             |
| Background color | Optional color you set for that slot |

Pattern length and names are not shown here - length is edited in the pattern editor header.

Beside the list, buttons sit next to the selected slot:

| Button      | What it does                                      |
| ----------- | ------------------------------------------------- |
| Make Unique | Give this slot its own pattern copy               |
| Remove      | Remove this slot from the order                   |
| Add         | Insert a new empty pattern after the current slot |
| Clone       | Deep-copy the current pattern and insert it after |

::: tip
Think of patterns as reusable blocks, and the order as the playlist. Reuse a chorus by pointing several slots at the same id. When you need a variation, use **Make Unique** so edits do not change the other copies.
:::

If the list is long, fade arrows (`▲` / `▼`) hint that more slots exist above or below.

## Selecting a slot

- Click a slot to select it.
- Use the mouse wheel while hovering the order list.

Selecting a slot loads that pattern in the editor and moves the cursor to row `0`. You can also leave the top or bottom of the pattern editor to jump into the previous or next order entry when one exists.

::: tip
One shared order drives the whole project. If you have several chip songs side by side, they all follow the same order index - handy for multi-chip arrangements.
:::

## Editing the order

Most order edits are done with the side buttons, the right-click menu, or by dragging. They are undoable with `Mod+Z` / `Mod+Y` when playback is stopped.

| Action                | How                                          | Behavior                                                                                                                                                                                               |
| --------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Add**               | **Add** button or context menu **Add**       | Creates a new empty pattern (next free id), inserts it **after** the chosen slot, and selects it                                                                                                       |
| **Remove**            | **Remove** button or context menu **Delete** | Removes the slot from the order only. Pattern data stays in the project. You cannot remove the last remaining slot                                                                                     |
| **Clone**             | **Clone** button or context menu **Clone**   | Copies the pattern to a new id, inserts after the current slot, and selects the clone                                                                                                                  |
| **Make Unique**       | **Make Unique** button or menu               | Keeps the slot in place, but assigns a new id with a copy of the data so other slots still using the old id are left alone                                                                             |
| **Rearrange**         | Drag a slot                                  | Move slots up or down. A dashed line shows the drop position. Colors and the loop marker move with the slot                                                                                            |
| **Change pattern id** | Click the digits on a slot                   | Type `0`-`9` (up to two digits). Applies as you type; finishes after two digits, Enter, or clicking away. Escape cancels. Valid range is `00`-`99`. If that id does not exist yet, Bitphase creates it |

New empty patterns use the project's **Default Pattern Length** (usually **64**, range 1-256). Change an individual pattern's length in the pattern editor header.

::: tip Shared ids vs Make Unique
If order slots `02` and `05` both say `01`, editing pattern `01` changes both places in the song. **Make Unique** on one of those slots gives it a fresh id so you can edit that section independently.
:::

::: tip Clone vs Make Unique
**Clone** adds a new slot with a copy. **Make Unique** keeps the current slot position and only breaks the shared link. Use Clone to insert a variation; use Make Unique when the arrangement is already right but the data should diverge.
:::

## Loop marker

The loop marker marks where playback returns after the last order slot. By default it is on the first slot (`00` in the list sense - order index 0).

- Right-click a slot → **Set loop marker** to loop from there.
- **Clear loop marker** puts the loop back on the first slot (there is always a loop point - playback does not simply stop at the end).

A thin accent on the left of the slot shows where the loop is set.

## Colors

Right-click a slot → **Color...** to tint that order position (not the pattern id itself). **Clear color** removes a custom tint.

Colors are a visual aid for structuring the song - for example mark intro, verse, and chorus slots so the list is easier to scan. They move with the slot when you drag.

## Multi-chip projects

The project has **one shared order**. Each song (chip) keeps its own pattern data for those ids.

When you **Add**, **Clone**, **Make Unique**, or type a new id, Bitphase keeps every song in sync so the same order positions exist across chips. Adding a new song with **File → New Song** creates matching empty patterns for the ids already in the order.
