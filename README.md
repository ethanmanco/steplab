# Steplab

A small beat maker that runs in the browser, built around the core of FL Studio: a channel rack, drum loops and melodies, and a playlist where you arrange them into a song. It stays simple enough that anyone can make a beat in a few minutes, with room to grow once you do.

**Try it:** https://ethanmanco.github.io/steplab/

![Steplab: patterns and channels on the left, a four track playlist with drum, bass, hook and pad clips, and the piano roll open over it](docs/screenshot.jpg)

## What you can do

- **Channels:** every sound is a channel with its own name, mute, solo, volume fader and a box for an exact volume percent. Start with six drums (kick, snare, closed hat, open hat, clap, tom) plus a Lead and a Bass, and add as many drum or synth channels as you like. Click a name to rename it; change its sound from the list.
- **Patterns:** make as many **drum loops** and **melodies** as you need, each with its own name and length. Copy one to make a variation.
- **Playlist:** the whole song at a glance. Every pattern you place shows up as a clip with a small picture of its notes. Drag clips to move them between bars and tracks, drag the right edge to repeat them longer, right-click to delete. Click an empty spot to place the selected pattern there.
- **Editor windows:** double-click a clip and its editor opens in a window over the playlist, like FL Studio. Drum loops open in a step sequencer: click a step, or drag across steps to paint or erase. Melodies open in a four octave piano roll: click to place a note, drag right to make it longer, click a note to delete it, stack notes for chords. Drag windows by their title bar and resize them from the corner.
- **Pattern and Song modes:** **PAT** loops just the selected pattern while you work on it. **SONG** plays the whole playlist from left to right. Click the playlist ruler to jump to a bar.
- **Record:** play notes on a MIDI keyboard or your computer keyboard while the music plays. Notes land in the open melody where you played them, snapped to 1/16, 1/8 or 1/4 notes, with the length you held them. A one bar count-in and a metronome help you come in on time.
- **Any meter:** type in the tempo (60 to 180 BPM) and the time signature (any number of beats over 4 or 8, such as 3/4, 6/8 or 7/8). Patterns can be up to 16 bars of 4/4 and songs up to 128.
- **Feel:** swing pushes every second sixteenth late, up to a triplet shuffle.
- **Undo and redo** for every change. A whole recording take undoes in one step.
- **Save:** your song autosaves in the browser. Save and Open move it in and out as a JSON file. Files from earlier versions open as a song with their loop already placed.
- **Export:** WAV renders the song, or just the current pattern in PAT mode, to a file that loops seamlessly in other music apps.

## How to use it

1. Press **Click to start**. Browsers keep sound off until you interact with the page, so this is the moment audio switches on.
2. Press **Play** to hear the starter song. Double-click any clip to open it.
3. Press **New drum loop** or **New melody**. The pattern is placed on the playlist and its editor opens. Fill it in; with **PAT** selected it loops on its own while you work.
4. Arrange: click a pattern in the list, then click empty spots in the playlist to place it. Drag clips around and stretch them. Switch to **SONG** to hear it all.
5. To record a melody, open it, press **Rec**, then **Play**. After the count-in, play notes with your MIDI keyboard (press **Connect MIDI** first) or your computer keyboard. Press **Ctrl+Z** to undo a take you did not like.
6. **Save** downloads your song. **WAV** downloads the audio.

### Keyboard

| Key | Action |
| --- | --- |
| `P` or `Space` | Play or pause (`Space` toggles a step when a grid square has focus) |
| `Esc` | Stop and go back to the start (inside a window, close it) |
| `Shift` + `R` | Turn recording on or off |
| `Z` to `M` and `Q` to `U` | Play notes, laid out like piano keys (`S`, `D`, `G`, `H`, `J` and `2`, `3`, `5`, `6`, `7` are the black keys) |
| `-` and `=` | Move the computer keyboard down or up an octave |
| Arrow keys in an editor | Move between steps |
| `Space` or `Enter` in an editor | Turn the focused step or note on or off |
| `Shift` + Left or Right on a note | Make it shorter or longer |
| Arrow keys on a clip | Move it a bar (with `Shift`, a beat) or a track |
| `[` and `]` on a clip | Make it shorter or longer |
| `Enter`, `Delete`, `Ctrl` + `D` on a clip | Edit, delete, duplicate |
| `Ctrl` + `Z`, `Ctrl` + `Shift` + `Z` | Undo, redo |

Clips are real buttons, and the playlist has a toolbar (Edit, Copy, Delete, move and length buttons) for touch screens and screen readers. Each editor grid is a single Tab stop, and every square has a spoken label such as "Kick, bar 2, step 5, on" or "C sharp 4, step 9, note, 3 steps long".

## How it's built

- **Vite + TypeScript**, with plain DOM code and no UI framework. A small element helper and a tiny store do the job. The grids only touch the squares that changed, so even a 16 bar piano roll (over 12,000 buttons) rebuilds in about 60 ms and a single edit takes about 1 ms. Playlist clips draw their note pictures once as SVG and tile them.
- **[Tone.js](https://tonejs.github.io/)** for audio scheduling and synthesis.
- **Every sound is synthesized in code.** There are no audio samples, so there are no licensing questions. The kick is a pitch-swept sine with a noise click, hats are FM metal synths through a high-pass filter, the clap is three quick noise bursts plus a tail, and the melody sounds are polyphonic subtractive and FM synths.
- **Web MIDI** for keyboards, in Chrome, Edge and Firefox (Safari does not support it).
- **Vitest** for the timing, pattern, recording, file, MIDI and WAV logic.

### Audio scheduling

Timing is the part that makes or breaks a sequencer. JavaScript timers drift and stall whenever the page is busy, so nothing here plays a sound "now".

1. Tone's transport runs on the Web Audio clock, which keeps time on the audio thread. A single `Tone.Loop` fires once per sixteenth note, **slightly ahead of time** (Tone's look-ahead window).
2. Each callback receives the exact future `time` that step will be heard. It asks the transport which tick that time falls on and turns it into a loop step (`stepFromTicks`). Reading the step from the clock instead of counting callbacks means it can never drift, and changing tempo, mode, pattern length or time signature mid-play just works.
3. Pure functions list what starts on that step: in PAT mode, `patternEventsAtStep` reads the selected pattern; in SONG mode, `songEventsAtStep` walks every clip under the playhead, finds where it is inside its pattern (patterns repeat to fill a clip) and cuts notes at the clip end. Mute and solo are applied here. Every sound is started **at `time`** (plus the swing delay on off-beat sixteenths), so the audio hardware plays it sample-accurately even if the main thread is late.
4. The playhead is drawn with `Tone.Draw`, which runs the visual update when that `time` is actually reached, so what you see matches what you hear.

### Recording

Recording has the opposite problem: the music you hear is already a moment old. When a key goes down, the engine works out where the music is **as heard** (the audio clock minus the output latency) and stores that position in steps. When the key comes up it does the same, so the note gets its real length, even across the loop end. The start then snaps to the chosen grid. Live notes play straight through the track's synth so you hear yourself with no extra delay.

### WAV export

The export builds the exact same audio graph (one voice and channel strip per channel) inside Tone's offline context and renders it faster than real time. The song or pattern is rendered **twice** and only the second pass is kept: it already contains the tails (pad releases, open hats) that spill over from the end of the first pass, just like when it repeats live. The result is a seamless loop. A small encoder writes 16-bit stereo PCM at 44.1 kHz.

### Saving

Projects are versioned JSON tagged with `"app": "steplab"`. Opening a file repairs small problems (tempo out of range, notes off the roll, unknown sounds) and refuses anything that is not a Steplab project, with a plain message. Autosave writes to `localStorage` after each pause in editing and when the tab is hidden. Every storage call is wrapped in `try/catch`, and if storage is blocked the app says so and keeps working.

### Accessibility, phones and the look

- Real buttons, labels, roving focus, visible focus rings and a status message for each action.
- `prefers-reduced-motion` turns off every transition and the blinking record light.
- On small screens the sidebar sits above the playlist, editor windows fill the screen, grids scroll sideways with their names pinned, and touch targets are at least 40 px. Tapping toggles or selects; dragging scrolls. Clips move with the toolbar buttons instead of dragging.
- A dark deep-space theme: a still, seeded starfield painted once on a canvas, with soft nebula light behind the panels. Nothing in the background moves.

## Project layout

```
src/
  core/       pure logic, fully tested: song model (channels, patterns, clips),
              timing, notes, schedule, recording, keyboard map, undo history,
              MIDI messages, files, WAV
  audio/      Tone.js: drum voices, instruments, shared graph, live engine, offline render
  ui/         DOM: sidebar, playlist, floating editor windows, step grid,
              transport, controls, starfield
  midi.ts     Web MIDI connection
  storage.ts  safe autosave and settings
  main.ts     wires state, audio, input and UI together
tests/        Vitest specs for everything in core/ plus storage and grid keys
```

## Run it locally

```bash
npm install
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

Pushing to `main` runs the tests, builds the site and deploys it to GitHub Pages with the workflow in `.github/workflows/deploy.yml`.

## Future ideas

Deliberately left out so far:

- Recording audio
- Importing your own samples
- Effects such as reverb and delay, and a full mixer with sends
- Automation clips
- Accounts and sharing

## Credits

Built with Claude Code. I designed, directed, reviewed, and tested it.
