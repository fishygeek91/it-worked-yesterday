/**
 * UI-only sound. Every cue is synthesized with the Web Audio API — no
 * asset files, no runtime dependency. Muted by default behind one latch;
 * the `AudioContext` is created on the unmute gesture, never on load.
 * Nothing here touches `src/core`, `src/harness`, or the clock.
 */

import type { GameSession } from "../harness/session";

/**
 * The five cues the v2.1 design names: a good mark, a bad mark, a win,
 * a loss, and reset.
 */
export type SoundCue = "good" | "bad" | "win" | "lose" | "reset";

/**
 * One synthesized tone: oscillator shape, pitch in hertz, and length.
 */
export type CueSpec = {
  type: OscillatorType;
  frequency: number;
  durationMs: number;
};

/**
 * Cue table. Data, not assets: a test can read it and a speaker can
 * play it. Good rises, bad falls, a win is brighter, a loss is flat,
 * reset is a short knock.
 */
export const CUE_SPECS: Record<SoundCue, readonly CueSpec[]> = {
  good: [{ type: "sine", frequency: 523.25, durationMs: 90 }],
  bad: [{ type: "square", frequency: 196.0, durationMs: 120 }],
  win: [
    { type: "sine", frequency: 523.25, durationMs: 110 },
    { type: "sine", frequency: 783.99, durationMs: 160 },
  ],
  lose: [
    { type: "square", frequency: 196.0, durationMs: 140 },
    { type: "square", frequency: 130.81, durationMs: 200 },
  ],
  reset: [{ type: "triangle", frequency: 329.63, durationMs: 70 }],
};

/**
 * Map one dispatched command to a cue, given the session it produced.
 * `accuse` resolves by outcome; `blame` and `checkout` walks stay
 * silent — they are looks, not verdicts. Unknown commands are silent.
 *
 * @param command - Raw command string as dispatched
 * @param after - Session state after the dispatch
 */
export function cueForCommand(command: string, after: GameSession): SoundCue | null {
  if (command === "good" || command === "bad" || command === "reset") {
    return command;
  }
  if (command === "accuse") {
    if (after.outcome === "won") {
      return "win";
    }
    if (after.outcome === "lost") {
      return "lose";
    }
    return null;
  }
  return null;
}

/**
 * Play one cue through an existing `AudioContext`. The context is only
 * ever created by the unmute gesture, so nothing can autoplay. Timing
 * uses the audio clock, not `Date.now`.
 *
 * @param context - Context created on unmute
 * @param cue - Cue to synthesize
 */
export function playCue(context: AudioContext, cue: SoundCue): void {
  let at = context.currentTime;
  for (const spec of CUE_SPECS[cue]) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = spec.type;
    oscillator.frequency.value = spec.frequency;
    const seconds = spec.durationMs / 1000;
    // A short linear fade avoids a click at the tone boundary.
    gain.gain.setValueAtTime(0.12, at);
    gain.gain.linearRampToValueAtTime(0.0001, at + seconds);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + seconds);
    at += seconds;
  }
}

/**
 * The latch control. Not a command: it has no `data-command`, costs
 * nothing, and never touches the clock. `aria-pressed` carries state.
 *
 * @param soundOn - Current latch state for this page load
 */
export function renderSoundLatch(soundOn: boolean): string {
  const pressed = soundOn ? "true" : "false";
  const label = soundOn ? "sound: on" : "sound: off";
  return `<button type="button" class="latch" data-sound aria-pressed="${pressed}">${label}</button>`;
}
