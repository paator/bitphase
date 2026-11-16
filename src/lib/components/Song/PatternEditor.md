# PatternEditor Component Documentation

Main canvas-based tracker interface for editing musical patterns. Handles rendering, navigation, editing, selection, clipboard operations, and playback synchronization.

## Props

### Bindable Props

- **patterns**: `Pattern[]` - Array of all patterns in the project, bindable for two-way updates
- **patternOrder**: `number[]` - Sequence defining pattern playback order, bindable
- **currentPatternOrderIndex**: `number` - Currently active position in pattern order, bindable
- **selectedRow**: `number` - Currently selected row number, bindable for cursor synchronization

### Configuration Props

- **isActive**: `boolean` - Whether this editor has focus (affects visual highlighting)
- **chip**: `Chip` - Chip configuration defining schema, type (e.g., 'ay'), available fields
- **chipProcessor**: `ChipProcessor` - Handles audio worklet communication for this chip
- **tuningTable**: `number[]` - Frequency table for note-to-pitch conversion
- **speed**: `number` - Current playback speed (ticks per row)
- **instruments**: `Instrument[]` - Array of instrument definitions for this chip
- **tables**: `Table[]` - Ornament/arpeggio tables for chip-specific effects

### Callback Props

- **onfocus**: `() => void` - Callback fired when editor gains focus
- **canFocusOnHover**: `() => boolean` - Returns true when hover may focus this editor (e.g. when no pattern editor is focused); used to avoid accidental focus switch when moving between chip editors
- **initAllChips**: `() => void` - Initializes all chip processors before playback
- **getSpeedForChip**: `(chipIndex: number) => number | null` - Retrieves playback speed for specific chip index

## Core Services & Utilities

### Data Transformation

- **formatter** - Converts generic pattern data to chip-specific display strings
- **converter** - Converts chip-specific pattern data to/from generic format
- **schema** - Chip schema defining field structure, lengths, colors, templates

### Audio

- **previewService** - Plays individual notes during editing without starting full playback
- **pressedKeyChannels** - Map tracking which keyboard keys are currently playing preview notes

## Canvas & Rendering

### Canvas Elements

- **canvas**: `HTMLCanvasElement` - HTML canvas element for rendering pattern data
- **ctx**: `CanvasRenderingContext2D` - 2D rendering context with custom font and color setup
- **containerDiv**: `HTMLDivElement` - Parent container for responsive canvas sizing

### Rendering Services

- **textParser**: `PatternEditorTextParser` - Parses formatted row strings into colored segments with cell positions
- **renderer**: `PatternEditorRenderer` - Handles actual canvas drawing (backgrounds, rows, channel labels)

### Dimensions

- **canvasWidth** / **canvasHeight** - Reactive canvas dimensions based on content and container size
- **lineHeight** - Vertical space per row, calculated from font size and multiplier

## Cursor & Selection State

### Cursor Position

- **selectedColumn** - Current horizontal cursor position (cell index within row)

### Selection Rectangle

- **selectionStartRow** / **selectionStartColumn** - Anchor point for rectangular selection
- **selectionEndRow** / **selectionEndColumn** - Current endpoint of rectangular selection

### Selection State

- **isSelecting** - True during mouse drag selection operation (set when pointer moves to another cell)
- **mouseDownCell** - Cell coordinates where mouse button was pressed

### Auto-Scroll State

- **autoScrollInterval** - Timer ID for continuous scrolling during selection
- **autoScrollDirection** - Scroll direction: -1 (up), 0 (stopped), 1 (down)

## Caching System

Performance optimization through memoization:

- **rowStringCache** - Memoizes formatted row strings (500 entries)
- **patternGenericCache** - Memoizes chip-to-generic conversions (100 patterns)
- **cellPositionsCache** - Memoizes cell position calculations per row (500 entries)
- **rowSegmentsCache** - Memoizes parsed text segments with colors (500 entries)
- **lastVisibleRowsCache** - Caches visible row calculations for scrolling performance

### Cache Management

- **clearAllCaches()** - Invalidates all caches when patterns change

## Pattern Management

### Pattern Access

- **currentPattern** - Derived from `patternOrder[currentPatternOrderIndex]`
- **findOrCreatePattern(id)** - Retrieves pattern by id or creates empty one if missing
- **ensurePatternExists()** - Safe pattern accessor returning current pattern or null
- **updatePatternInArray(pattern)** - Replaces pattern in array and triggers reactivity

## Undo/Redo System

### Context Creation

- **createEditContext()** - Creates context with pattern array and cursor update callbacks
- **getCursorPosition()** - Returns current row/column/patternOrderIndex snapshot

### Action Recording

- **recordPatternEdit(old, new)** - Pushes single-field edit action to undo stack
- **recordBulkPatternEdit(old, new)** - Pushes multi-cell edit action to undo stack

## Playback Control

### Public Methods

- **resetToBeginning()** - Resets cursor to row 0, pattern order 0
- **setPatternOrderIndex(index)** - Programmatically changes pattern order position
- **setSelectedRow(row)** - Programmatically moves cursor to specific row
- **playFromCursor()** - Starts playback from current cursor position
- **togglePlayback()** - Starts/stops playback from beginning

### Internal Methods

- **initPlayback()** - Sends pattern, speed, tuning, instruments to audio worklet
- **pausePlayback()** - Stops audio playback

## Cell Position & Navigation

### Position Calculation

- **getCellPositions(rowString, rowIndex)** - Retrieves cached cell position data for row
- **getTotalCellCount(rowString)** - Counts non-whitespace characters in row

### Navigation

- **moveRow(delta)** - Moves cursor vertically, handles pattern order wrapping
- **moveColumn(delta)** - Moves cursor horizontally between cells, wraps at row edges

## Visible Rows Calculation

- **getVisibleRows(pattern)** - Calculates which rows are visible in current viewport
    - Returns array with display indices, row indices, ghost flags (previous/next patterns)
    - Handles scrolling by centering selected row with context rows above/below

## Canvas Setup & Sizing

- **setupCanvas()** - Initializes canvas context, creates textParser and renderer instances
- **updateSize()** - Recalculates canvas dimensions based on container and content width
- **getChipIndex()** - Finds index of current chip processor in audio service array
- **getChannelMutedState(pattern)** - Returns boolean array of muted channels for pattern
- **getPatternRowData(pattern, rowIndex)** - Formats pattern row as display string (cached)

## Main Rendering Function

**draw()** - Renders entire pattern editor canvas:

1. Clears background
2. Calculates visible rows including ghost rows from adjacent patterns
3. Renders each row with syntax highlighting, cursor, selection overlay
4. Draws channel labels at top with mute indicators
5. Handles opacity for ghost rows (0.3 alpha)

## Keyboard Input Handling

### Key Down

**handleKeyDown(event)** - Main keyboard handler:

- Delegates to PatternKeyboardShortcutsService for navigation/editing shortcuts
- Processes character input for note/value entry via PatternEditingService
- Auto-advances cursor based on edit step setting
- Triggers note preview during editing
- Records undo actions for all edits

### Key Up

**handleKeyUp(event)** - Stops preview notes when keys released

## Mouse Input Handling

### Mouse Movement

- **handleMouseMove(event)** - Updates cursor style when hovering channel labels
- **handleMouseEnter(event)** - Updates cursor style when hovering channel labels. When canFocusOnHover() returns true (no pattern editor is focused), focuses canvas and invokes onfocus
- **handleMouseLeave()** - Resets cursor to default
- **handleCanvasMouseDown(event)** - On click: focuses canvas, clears text selection, and invokes onfocus callback to switch active editor

### Mouse Clicks & Drag

- **findCellAtPosition(x, y)** - Hit-tests mouse coordinates to find nearest cell
- **handleCanvasMouseDown(event)** - Prepares for navigation or selection
    - Clicks on channel labels toggle mute state
    - Clicks on cells record position and attach global listeners (shift extends existing selection)
    - Selection is only started on drag (see handleCanvasMouseMove)
- **handleCanvasMouseMove(event)** - Starts selection when drag to another cell, then extends selection
- **handleCanvasMouseUp()** - Single click: navigate to cell and clear selection. Drag: keep selection
    - Cleans up global mouse listeners and stops auto-scroll

### Auto-Scroll During Selection

- **handleGlobalMouseMove(event)** - Tracks mouse position globally during selection
    - Detects when mouse moves above canvas bounds (triggers upward scroll)
    - Detects when mouse moves below canvas bounds (triggers downward scroll)
    - Detects when mouse is near top/bottom edges within canvas (2 line height margin)
    - Automatically stops scrolling when mouse returns to center area
- **startAutoScroll(direction)** - Initiates continuous scrolling
    - Scrolls every 50ms in specified direction
    - Only starts if no scroll is already active
- **stopAutoScroll()** - Stops continuous scrolling and clears interval timer

## Wheel Input

**handleWheel(event)** - Scrolls pattern vertically by the configured mouse-wheel row count

## Selection Utilities

- **hasSelection()** - Returns true if rectangular selection exists
- **getSelectionBounds()** - Normalizes selection to min/max row/column coordinates
- **getDefaultValueForField(type, key)** - Returns empty/zero value for clearing fields

## Clipboard Operations

### Context & Actions

- **createClipboardContext()** - Builds context with pattern data and helper functions
- **copySelection()** - Copies selected cells to clipboard service
- **cutSelection()** - Copies then clears selected cells
- **pasteSelection()** - Pastes clipboard data starting at cursor position
- **deleteSelection()** - Clears all cells in rectangular selection to default values

## Field Value Manipulation

### Single Field Update

**updateFieldAtPosition(pattern, row, col, fieldInfo, value, delta, isOctave)** - Updates single field:

- Handles note transposition (12 semitones per octave when isOctave true)
- Handles numeric increment/decrement with wrapping
- Excludes effect fields from direct increment (they use special handling)

### Bulk Update

**incrementFieldValue(delta, isOctaveIncrement)** - Increments cursor or selection values:

- Two-pass algorithm: first checks if selection contains notes
- If notes present, only increments notes; otherwise increments all numeric fields
- Plays preview note after single-cell increment

## Playback Synchronization

### Manual Override System

- **userManuallyChangedPattern** - Prevents playback from overriding manual pattern changes
- **lastManualPatternChangeTime** - Timestamp of last user-initiated pattern change
- **MANUAL_PATTERN_CHANGE_TIMEOUT_MS** - 1000ms grace period before playback resumes control

### Callbacks from Audio Worklet

- **handlePatternUpdate(row, orderIndex)** - Callback from audio worklet during playback
    - Throttled to 33ms (30fps) to avoid excessive UI updates
    - Respects manual pattern changes during timeout period
- **handlePatternRequest(orderIndex)** - Callback when audio needs pattern data

## Shortcuts Context

**createShortcutsContext()** - Builds comprehensive context for keyboard shortcut service:

- Includes all navigation, editing, selection, clipboard, playback callbacks
- Provides navigation context with patterns, schema, formatters for cell movement

## Envelope Mode (only for AY Chip)

### Mode Switching

- **previousEnvelopeAsNote** - Tracks previous envelope display mode
- **EnvelopeModeService.handleModeChange()** - Converts envelope values when mode changes
    - Converts between hardware envelope periods and note representations
    - Triggers full redraw when conversion occurs

## Architecture Notes

### Canvas-Based Rendering

The component uses HTML5 Canvas instead of DOM elements for performance reasons. This allows:

- Smooth 60fps rendering even with large patterns
- Custom text rendering with syntax highlighting
- Efficient scrolling and viewport management

### Chip Abstraction

All chip-specific logic is delegated to formatters, converters, and schemas. The PatternEditor itself remains chip-agnostic.

### Service-Oriented Design

Business logic is extracted into services:

- PatternEditingService - Field editing and validation
- PatternNavigationService - Cursor movement logic
- PatternKeyboardShortcutsService - Keyboard shortcut handling
- ClipboardService - Copy/paste operations
- PreviewService - Audio preview management

### Performance Optimizations

- Multi-level caching (rows, cells, positions, segments)
- Throttled playback updates (33ms)
- Viewport-based rendering (only visible rows)
- Memoized calculations with LRU eviction
