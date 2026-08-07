# Import & export

Bitphase can open and save a multiple type of files, each with a different target.

## Import

Bitphase can import the following files:

- `.pt3` - ProTracker 3.4 AY modules
- `.vt2` - Vortex Tracker 2 AY modules
- `.btp` - BitPhase's own module format, in fact a compressed JSON file.
- `.json` - standard JSON files, used to store instrument data, table data, color schemes

## Export

 Bitphase can import the following files:

- `.btp` - see above
- `.json` - see above
- `.wav` - uncompressed Wave audio stream. Supports the following options (the dialog will open):
    - Sample rate - the sample rate of the output file (default: 44100 Hz)
    - Bit depth - the resolution of the output file (default: 16-bit PCM)
    - Amount of loop repeats (default: 0)
    - Channel export - it can export full song to one .wav file or it can export multiple .wavs, one per each channel in the song (useful for oscilloscope views).
    - Metadata - author, title, album, year and .wav comments.
- `.psg` - register dump format of AY-3-8910, can be used for playback on real hardware or dedicated players. In case of multichip AY songs, a .psg file, each per a chip, will be exported in a .zip archive, containing two or more files.

More to come, including timer effects export declarations (`.tmr`)