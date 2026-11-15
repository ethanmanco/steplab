# Steplab

A small beat maker that runs in the browser. Program a drum pattern, add two melodies on a piano roll, and export the loop as a WAV file. It is the core of a music workstation and nothing else, so anyone can make a beat in a few minutes.

**Try it:** https://ethanmanco.github.io/steplab/

![Steplab with a drum pattern and a lead melody, playhead on step 13](docs/screenshot.jpg)

## What you can do

- **Drums:** a 16 step grid with six rows: kick, snare, closed hat, open hat, clap and tom.
- **Melodies:** two tracks, each with a two octave piano roll. Pick a sound per track: Lead, Bass, Pluck or Pad. Stack notes on one step to play a chord.
- **Transport:** play, stop, tempo from 60 to 180 BPM, and a loop of 1, 2 or 4 bars with a moving playhead.
- **Mix:** volume and mute on every track.
- **Save:** your beat autosaves in the browser. Save and Open move a project in and out as a JSON file.
- **Export:** WAV renders the loop to a file that repeats seamlessly in other music apps.

## How to use it

1. Press **Click to start**. Browsers keep sound off until you interact with the page, so this is the moment audio switches on.
2. Click squares in the drum grid to turn hits on and off. While stopped, each new hit plays so you can hear it.
3. Press **Play**. The column under the playhead lights up as it plays.
4. In **Melody**, choose a track tab and a sound, then click the piano roll to place notes. Click a note again to remove it.
5. For a longer loop, choose 2 or 4 bars. New bars start as a copy of the first, so the beat keeps going. Use the **Bar** switch to edit each bar. A dot shows which bar is playing.
6. **Save** downloads your project. **WAV** downloads the audio.

### Keyboard

| Key | Action |
| --- | --- |
| `P` | Play or stop |
| Arrow keys | Move between steps in a grid |
| `Space` or `Enter` | Turn the focused step on or off |
| `Home` / `End` | Jump to the start or end of a row (with `Ctrl`, the corners of the grid) |
| `[` and `]` | Edit the previous or next bar |
| Left and Right on the melody tabs | Switch tracks |

Each grid is a single Tab stop, so Tab moves between controls instead of through 480 squares. Every square is a real button with a spoken label such as "Kick, step 5, on" or "Melody 1, C sharp 4, bar 2, step 9, off".

## How it's built

- **Vite + TypeScript**, with plain DOM code and no UI framework. The interface is a few hundred buttons that change one at a time (a cell flips, the playhead moves). A small element helper and a 30 line store do the job with nothing to download, so most of the 73 KB (gzipped) bundle is the audio library.
- **[Tone.js](https://tonejs.github.io/)** for audio scheduling and synthesis.
- **Every sound is synthesized in code.** There are no audio samples, so there are no licensing questions. The kick is a pitch-swept sine with a noise click, hats are FM metal synths through a high-pass filter, the clap is three quick noise bursts plus a tail, and the melody sounds are polyphonic subtractive and FM synths.
- **Vitest** for the timing, pattern, file and WAV logic.

### Audio scheduling

Timing is the part that makes or breaks a sequencer. JavaScript timers drift and stall whenever the page is busy, so nothing here plays a sound "now".

1. Tone's transport runs on the Web Audio clock, which keeps time on the audio thread. A single `Tone.Loop` fires once per sixteenth note, **slightly ahead of time** (Tone's look-ahead window).
2. Each callback receives the exact future `time` that step will be heard. It asks the transport which tick that time falls on and turns it into a loop step (`stepFromTicks`). Reading the step from the clock instead of counting callbacks means it can never drift, and changing tempo or loop length mid-play just works.
3. A pure function, `eventsAtStep(project, step)`, lists the drum hits and notes for that step. Every sound is then started **at `time`**, so the audio hardware plays it sample-accurately even if the main thread is late.
4. The playhead is drawn with `Tone.Draw`, which runs the visual update when that `time` is actually reached, so what you see matches what you hear.

Notes ring for their sound's length (a pad holds for four steps) but stop just before the same pitch starts again, so held notes never stutter.

### WAV export

The export builds the exact same audio graph inside Tone's offline context and renders it faster than real time. The loop is rendered **twice** and only the second pass is kept: it already contains the tails (pad releases, open hats) that spill over from the end of the first pass, just like when the loop repeats live. The result is a seamless loop. A small encoder writes 16-bit stereo PCM at 44.1 kHz.

### Saving

Projects are versioned JSON tagged with `"app": "steplab"`. Opening a file repairs small problems (tempo out of range, short step lists, unknown sounds) and refuses anything that is not a Steplab project, with a plain message. Autosave writes to `localStorage` after each pause in editing and when the tab is hidden. Every storage call is wrapped in `try/catch`, and if storage is blocked the app says so and keeps working.

### Accessibility and phones

- Real buttons, labels, roving focus, visible focus rings and a status message for each action.
- `prefers-reduced-motion` turns off the pressed-key animation and button movement; the playhead simply jumps.
- On small screens the grids scroll sideways inside their panels with the track names pinned, and touch targets are at least 44 px.
- Light and dark themes follow the system setting.

## Project layout

```
src/
  core/       pure logic, fully tested: timing, patterns, notes, schedule, files, WAV
  audio/      Tone.js: drum kit, instruments, shared graph, live engine, offline render
  ui/         DOM: step grid, drum grid, piano roll, transport, file buttons
  storage.ts  safe autosave
  main.ts     wires state, audio and UI together
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

Deliberately left out of version 1:

- Recording audio
- Importing your own samples
- Effects such as reverb and delay
- A song arrangement timeline
- More tracks
- MIDI devices
- Accounts and sharing

## Credits

Built with Claude Code. I designed, directed, reviewed, and tested it.
