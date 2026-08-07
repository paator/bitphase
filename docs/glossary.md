# Glossary

- Chiptune - a general term for music created for old sound generator sound sources (chips), primarily those used in 8-bit computers and consoles. Before sound sources for devices such as PCs, mobile phones, consoles etc. got standardized as PCM codec + DAC combo, each sound chip was ditinctly and at times, very often vastly different then the other one.
- Chip - an integrated circuit with self-contained sound synthesizer. Common from late 1970s until mid 2000s, when hardware codecs killed these. Bitphase allows creating music for some of these.
- Tracker - a form of a composition tool. As in the list, events such as note-on are written in chronological order and moved from top to bottom for playback across multiple tracks, one step at the time.
- Pattern - a spreadsheet-like structure in which the steps are arranged in chronological order. Note on / off and most events are described in steps.
- Order - a linear structure, thanks to which patterns are played by registering them in it. Orders are listed and are played in order from the top.
- Table - an analogue to arpeggio macro in other trackers. It defines the sequence of arpeggio schemes (quick note changes outside pattern). It automates the arpeggio.
- Instrument - a set of parameters that defines a timbre of a sound produced by a chip.
- Envelope - description how a sound changes over time. An envelope may relate to elements such as amplitude (volume), frequency or pitch. Envelope generator allows users to control the different stages of a sound.
- Effect - a pattern editor statement which affect the sounds timbre, length or other characteristic outside of an instrument editor.
- Channel - a "voice" output of a sound chip. It's represented in a tracker as a horizontal series of tracks next to each other.
- Tick - the smallest execution unit, and 1 step = n ticks. Events that vary by count (effects such as vibrato) are based on ticks.
- Song - in context of a bitphase, IT IS NOT A SUB-SONG. It's an instance of a sound chip added next to other chip. With them you can make multi-chip songs.
- Module/Project - a data (file) created by the tracker. The module holds a song data, instruments, and settings common to the specific song.
