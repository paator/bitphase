# Bitphase TMR format (timer companion to PSG)

All multi-byte integers are **little-endian** (least significant byte first). **Version 1** (evolving). Frame `i` in `.tmr` pairs with player / PSG frame `i` in `.psg` (same frame count; `frame_rate_hz` = interrupt rate, e.g. 50 Hz).

Bitphase exports two companion files:

| File | Contents |
| ---- | -------- |
| `.tmr` | Header + player frames (PSG enrichment + timer pointers) |
| `.tel` | Header + EventList (timed register actions) |

Player frames in `.tmr` reference EventList items by **index**. The EventList lives only in `.tel`.

## Endianness

| Type | On-disk order | Example |
| ---- | ------------- | ------- |
| `uint16` | lo, hi | `0x1234` → `34 12` |
| `uint32` | b0, b1, b2, b3 | `0x000003E8` (1000) → `E8 03 00 00` |
| `uint16` stop sentinel | lo, hi | `0xFFFF` → `FF FF` |

`uint8` fields and the 14-byte PSG register block are byte order–neutral. Bit fields (`psg_apply_mask`) are interpreted on the decoded integer value after LE assembly.

## Player frame vs chain step

One **player frame** per interrupt = **PSG** deltas + **TMR** frame definition:

TMR data format serves the purpose to enrich the PSG data dump and transform it from a data dump to an event stream.
Each TMR frame applies a mask to the PSG data, such that each player frame turns into selective PSG register writes.
Additionally the TMR frame contains information that indicates the start and stop playing of timer based instruments (initial values are set by the frame PSG write, subsequent instrument timer is scheduled using an index and an interval to its initial replay step).

| TMR piece | Size | Purpose |
| --------- | ---- | ------ |
| psg_mask | 2 bytes (`uint16` LE) | mask for PSG reg writes, MSB = reg 0, 1=write, 0=skip/no change |
| Timer 1 frequency | 4 bytes (`uint32` LE) | timer rate in Hz, 16.16 fixed point; 0 = skip/no change |
| Timer 1 Event | 2 bytes (`uint16` LE) | index into EventList for next timed action, `0xFFFF`=stop active timer |
| Timer 2 frequency | 4 bytes (`uint32` LE) | timer rate in Hz, 16.16 fixed point; 0 = skip/no change |
| Timer 2 Event | 2 bytes (`uint16` LE) | index into EventList for next timed action, `0xFFFF`=stop active timer |
| Timer 3 frequency | 4 bytes (`uint32` LE) | timer rate in Hz, 16.16 fixed point; 0 = skip/no change |
| Timer 3 Event | 2 bytes (`uint16` LE) | index into EventList for next timed action, `0xFFFF`=stop active timer |

**EventItem** is the representation of actions that can occur during an individual interval/action of a timer-based instrument. The whole of a timer-based instrument is a sequence of 1 or more linked EventItems. Each individual EventItem can by itself mimic a player frame write.

| EventItem piece | Size | Purpose |
| --------------- | ---- | ------- |
| PSG data | 14 bytes | register values for reg 0..13 |
| PSG Mask | 2 bytes (`uint16` LE) | mask for PSG reg writes, MSB = reg 0, 1=write, 0=skip |
| Timer Frequency | 4 bytes (`uint32` LE) | timer rate in Hz, 16.16 fixed point; 0 = skip/no change |
| Event | 2 bytes (`uint16` LE) | index into EventList for next timed action, `0xFFFF`=stop active timer |

## Per-frame TMR layout — 20 bytes (`frameSize`)

| Offset | Size | Field | Type |
| ------ | ---- | ----- | ---- |
| 0 | 2 | `psg_apply_mask` | `uint16` LE |
| 2 | 4 | `timer_1_frequency_hz` | `uint32` LE, 16.16 Hz |
| 6 | 2 | `timer_1_event_index` | `uint16` LE |
| 8 | 4 | `timer_2_frequency_hz` | `uint32` LE, 16.16 Hz |
| 12 | 2 | `timer_2_event_index` | `uint16` LE |
| 14 | 4 | `timer_3_frequency_hz` | `uint32` LE, 16.16 Hz |
| 18 | 2 | `timer_3_event_index` | `uint16` LE |

## Per-Event layout — 22 bytes (`itemSize`)

| Offset | Size | Field | Type |
| ------ | ---- | ----- | ---- |
| 0 | 1 | `psg_data_reg0` | `uint8` |
| 1 | 1 | `psg_data_reg1` | `uint8` |
| 2 | 1 | `psg_data_reg2` | `uint8` |
| 3 | 1 | `psg_data_reg3` | `uint8` |
| 4 | 1 | `psg_data_reg4` | `uint8` |
| 5 | 1 | `psg_data_reg5` | `uint8` |
| 6 | 1 | `psg_data_reg6` | `uint8` |
| 7 | 1 | `psg_data_reg7` | `uint8` |
| 8 | 1 | `psg_data_reg8` | `uint8` |
| 9 | 1 | `psg_data_reg9` | `uint8` |
| 10 | 1 | `psg_data_reg10` | `uint8` |
| 11 | 1 | `psg_data_reg11` | `uint8` |
| 12 | 1 | `psg_data_reg12` | `uint8` |
| 13 | 1 | `psg_data_reg13` | `uint8` |
| 14 | 2 | `psg_apply_mask` | `uint16` LE |
| 16 | 4 | `timer_frequency_hz` | `uint32` LE, 16.16 Hz |
| 20 | 2 | `timer_event_index` | `uint16` LE |

EventList item byte offset in `.tel` = `TEL_header_size + event_index × itemSize` (22).

## EventList file (`.tel`) — header 16 bytes

| Offset | Size | Field | Type |
| ------ | ---- | ----- | ---- |
| 0 | 4 | magic | `54 45 4C 1A` (`TEL\x1a`) |
| 4 | 2 | version | `uint16` LE (`1` → `01 00`) |
| 6 | 2 | header_size | `uint16` LE (`16` → `10 00`) |
| 8 | 4 | event_count | `uint32` LE |
| 12 | 4 | reserved | `uint32` LE |
| 16 | `event_count × 22` | event items | see Per-Event layout |

## File header — 32 bytes

| Offset | Size | Field | Type |
| ------ | ---- | ----- | ---- |
| 0 | 4 | magic | `54 4D 52 1A` (`TMR\x1a`) |
| 4 | 2 | version | `uint16` LE (`1` → `01 00`) |
| 6 | 2 | header_size | `uint16` LE (`32` → `20 00`) |
| 8 | 2 | flags | `uint16` LE (bit 0 = YM) |
| 10 | 1 | chip_index | `uint8` |
| 11 | 1 | reserved | `uint8` |
| 12 | 4 | `frame_rate_hz` | `uint32` LE, 16.16 fixed point |
| 16 | 4 | psg_clock_hz | `uint32` LE |
| 20 | 4 | frame_count | `uint32` LE |
| 24 | 8 | reserved | 8 bytes |

## `psg_apply_mask`

Player-frame masks are derived from the captured replayer register state: for each 50 Hz frame, bit **r** is set when register **r** in that frame differs from the previous frame (same rule as `.psg` delta encoding, with initial previous state all zero).

After decoding as `uint16` LE, bit **r** (MSB-first, **r**=0 is reg 0) = 1 → apply the paired PSG delta for register **r** (0..13). Register bits use bits **15..2** (14 registers). Mask `0` means no PSG register writes this frame.

**EventItem only:** bits **1..0** encode the hardware timer slot (**0** = timer 1, **1** = timer 2, **2** = timer 3). This preserves timer context when following linked EventItems beyond the player-frame START command. Player-frame masks keep bits **1..0** clear (timer identity comes from the timer slot fields).

Example: mask value `0xFFFB` (all regs except reg 8) → on disk: `FB FF`. EventItem on timer 2 writing reg 9 only: `0x0041` (`0x0040` reg mask + timer index 1).

Timer frequency fields use the same **16.16 fixed-point Hz** encoding as `frame_rate_hz`: stored value = `round(hz × 65536)`. Decode as `stored / 65536`. Export converts captured YM SID periods to tone rate (`chip_clock / (16 × period)`) and stores **twice** that value (`chip_clock / (8 × period)`). Bitphase’s internal player still runs SID at chip-tick rate (`chip_clock / period`).

## Playback

1. Apply PSG deltas per mask.
2. Per timer:
   - **None** — no operation, no actions.
   - **Start** — schedule new action at frequency `f` Hz and first EventItem at `event_index`.
   - **Stop** — `event_index = 0xFFFF` (`FF FF`); stop any scheduled actions on that timer.

## Example: PWM on timer 1

```
Mask: bit 8 = 0  → ignore PSG volume A (mask value excludes reg 8)

Timer 1: START → 1773.4 Hz, first event index 5 (05 00), byte offset 5×22 = 110
Timer 2: nothing (frequency 0, event 0)
Timer 3: nothing (frequency 0, event 0)

Item 0: frequency 0 (inherit), write reg 8 = LOUD, go to 1
Item 1: frequency 0 (inherit), write reg 8 = quiet, go to 0 (loop)
```

**f** is the timer rate in Hz. Items only toggle volume; rate stays **f** from **Start** unless an event item sets a new non-zero frequency.

Asymmetric duty: e.g. **Start** at `f_high` Hz; item 1 sets frequency to `f_low` Hz on the quiet step; item 0 keeps frequency `0` (inherit from chain).

## Export

`src/lib/services/file/tmr/tmr-export.ts` — exports paired `.tmr` + `.tel` files (both included in TMR ZIP exports).
