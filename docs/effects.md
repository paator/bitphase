# Effects

Effects are written in the effect column using the format **`AXYZ`**,
where `A` indicates the effect type and `XYZ` are its parameters.

Each channel starts with one effect column. Use **+** / **−** on the channel header to add or remove extra effect columns on that channel (up to 4). Commands in the same row are applied left to right.

They can also use tables as a source of parameter values: **`AXTY`** (`T` + table id (`Y`)).
For example, rather than manually alternating `S.03`, `S.05`, `S.03` to create a groove tempo,
you can put the tempo values in table 1 and simply use `S.T1`.
Commands that can run together on the same row can each use their own table (`V1T1` next to `A0T2`).

Effect parameters are hexadecimal (`0`-`9`, `A`-`F`). Table ids in `T` syntax use `0`-`9` and `A`-`Z` (for example `S.TZ`).

## General

### A - Arpeggio

Rapidly alternates between the current note and two additional notes.

|                  |                                                                          |
| ---------------- | ------------------------------------------------------------------------ |
| **Format**       | `AXYZ`                                                                   |
| **Steps length** | `X` - ticks between arpeggio steps (`0`-`F`)                             |
| **Parameter**    | `Y` / `Z` - semitone offsets (`0`-`F`)                                   |
| **With table**   | `AXTY` - `Y` is table id (`0`-`9`, `A`-`Z`); offsets come from the table |
| **Stop**         | `A000` (or any `Ax00`) stops a running arpeggio                         |
| **Example**      | `A137` - steps length 1, offsets +3 and +7 (minor chord)                 |

### V - Vibrato

Modulates pitch up and down.

|                |                                             |
| -------------- | ------------------------------------------- |
| **Format**     | `VXYZ`                                      |
| **Delay**      | `X` - delay between vibrato steps (`0`-`F`) |
| **Parameter**  | `Y` speed, `Z` depth (`0`-`F`)              |
| **With table** | `VXTY` - speed/depth from table each tick   |
| **Example**    | `V158` - delay 1, speed 5, depth 8          |

### 1 - Slide down

Gradually decreases pitch.

|                |                                                                         |
| -------------- | ----------------------------------------------------------------------- |
| **Format**     | `1XYZ`                                                                  |
| **Delay**      | `X` - delay between slide steps (`0`-`F`)                               |
| **Parameter**  | `YZ` - step size (`00`-`FF`)                                            |
| **With table** | `1XTY` - step size from table each tick                                 |
| **Example**    | `1130` - delay 1, step `30`. Use `.` for delay `0` for a one-tick slide |

### 2 - Slide up

Gradually increases pitch. Same shape as slide down (`2XYZ` / `2XTY`).

**Example:** `2150` - delay 1, step `50`.

### P - Portamento

Smoothly slides from the previous note to the current note (`PXYZ` / `PXTY`).

**Example:** `P30F` - delay 3, speed `0F`.

### 4 - Instrument position

Sets the starting row within the instrument (`4.XY`).

**Example:** `4.05` - start instrument from row 5.

### 5 - Table position

Sets the starting position within the table (`5.XY`).

**Example:** `5.03` - start table from row 3.

### 6 - On/Off

Alternates between playing and muting (`6.XY` / `6.TY`).

**Example:** `6.24` - on duration 2, off duration 4.

### D - Detune

Offsets channel pitch by a signed amount (`D.XY` / `D.TY`).
Doesn't reset on new notes. Use `D.80` to bring back original tuning.

`XY` is signed (`00`-`FF`, `80` = 0). `00`-`7F` negative, `81`-`FF` positive.

**Example:** `D.85` - detune +5.

### S - Speed

Changes song playback speed (`S.XY` / `S.TY`).

**Example:** `S.03` - set speed to 3.

## AY-3-8910 / YM2149F

Envelope effects use the same codes but are entered in the **envelope effect** column.
On top of that, there are special effects only targeted towards envelopes:

### EA - Auto-envelope

Automatically calculates the envelope period from channel notes using a ratio. When active, set the envelope shape in the channel column - the envelope value is computed from the playing note. Enter in the envelope effect column only.

|               |                                                                                        |
| ------------- | -------------------------------------------------------------------------------------- |
| **Format**    | `EAXY`                                                                                 |
| **Parameter** | `X` numerator (`1`-`F`), `Y` denominator (`1`-`F`) → ratio `X:Y`                       |
| **Example**   | `EA32` - ratio 3:2                                                                     |
| **Shapes**    | Works with repeating shapes `8`, `A`, `C`, `E`. Divisor 16 for `8`/`C`, 32 for `A`/`E` |

Persists across rows until another envelope effect replaces it or a new envelope shape is written. Follows note changes in real time.

### E1 - Timer PWM min %

Sets the PWM sweep minimum duty for SID / syncbuzzer / FM timer effects that use exactly two waveform steps (for example `15 0`). Hex `00`-`FF` maps to `0`-`100`%. While sweep is `0`, min is unused; max sets the static pulse width.

|               |                                              |
| ------------- | -------------------------------------------- |
| **Format**    | `E1XY` or `E1TX`                             |
| **Parameter** | `XY` - duty percent mapped from `00`-`FF`    |
| **With table** | `E1TX` - min duty from table `X` each tick  |
| **Example**   | `E180` - about 50% min; `E1T1` - table 1     |

Persists until a new note, note off, or a new `E1`.

### E2 - Timer PWM max %

Sets the PWM maximum duty (static pulse width when sweep is `0`). Same eligibility and mapping as `E1`.

|               |                                              |
| ------------- | -------------------------------------------- |
| **Format**    | `E2XY` or `E2TX`                             |
| **Parameter** | `XY` - duty percent mapped from `00`-`FF`    |
| **With table** | `E2TX` - max duty from table `X` each tick  |
| **Example**   | `E29E` - about 62% max; `E2T1` - table 1     |

### E3 - Timer PWM sweep

Sets PWM sweep speed between min and max. Same eligibility and mapping as `E1`. `E300` disables sweep so max acts as static pulse width.

|               |                                              |
| ------------- | -------------------------------------------- |
| **Format**    | `E3XY` or `E3TX`                             |
| **Parameter** | `XY` - sweep speed mapped from `00`-`FF`     |
| **With table** | `E3TX` - sweep speed from table `X` each tick |
| **Example**   | `E310` - slow sweep; `E3T1` - table 1        |

### E4 - Timer PWM sweep shape

Selects the PWM sweep automation curve. Same eligibility as `E1`.

|               |                                                                 |
| ------------- | --------------------------------------------------------------- |
| **Format**    | `E4XY` or `E4TX`                                                    |
| **Parameter** | `XY` - shape index: `00` triangle, `01` sine, `02` saw up, `03` saw down, `04` square (wraps) |
| **With table** | `E4TX` - shape index from table `X` each tick                      |
| **Example**   | `E401` - sine; `E4T1` - table 1                                     |

### E5 - Timer PWM sweep start

Sets the start position on the PWM sweep automation curve (`0`-`1000`, shown as `0%`-`100%` in the editor). Hex `00`-`FF` maps onto that range. Same eligibility as `E1`. Also jumps the live sweep to that position.

|               |                                                          |
| ------------- | -------------------------------------------------------- |
| **Format**    | `E5XY` or `E5TX`                                             |
| **Parameter** | `XY` - start phase mapped from `00`-`FF` → `0`-`1000`    |
| **With table** | `E5TX` - start phase from table `X` each tick (also jumps live sweep) |
| **Example**   | `E580` - about halfway (`50%`); `E5T1` - table 1             |

## 2A03 / 2A07 (NES)

### E1 - Pulse width

Sets or automates square pulse width on Pulse 1 and Pulse 2. Persists until note off or a new `E1`. Use `E100` to restore the instrument duty cycle.

|               |                                                                                        |
| ------------- | -------------------------------------------------------------------------------------- |
| **Format**    | `E1XY` or `E1TX`                                                                       |
| **Parameter** | `00` restores instrument duty; `01`-`04` select duty cycles 1-4 (12.5%, 25%, 50%, 75%) |
| **Table**     | `TX` - values from table `X` each tick (`0` = instrument duty)                         |
| **Examples**  | `E100`, `E102`, `E1T1`                                                                 |

### E2 - Sweep up

Hardware pitch sweep up on Pulse 1 / Pulse 2 (`E2XY` / `E2TX`).

`X` = sweep time (`0`-`7`), `Y` = shift (`0`-`7`). `Y = 0` disables.

**Examples:** `E247`, `E2T1`, `E200`.

### E3 - Sweep down

Same format as `E2`, sweeping down (`E3XY` / `E3TX`).

**Examples:** `E317`, `E3T1`, `E300`.
