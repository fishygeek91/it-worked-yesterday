import { GameError } from "../core/errors";
import { optimalMarks } from "../core/score";
import { createSession, dispatch, type GameSession } from "../harness/session";
import { buildViewModel, renderGraph } from "../render";
import { caseName } from "./chrome";

/**
 * Win-only GIF export. Frames are not a screen grab: the session is
 * replanted from its input, the transcript is replayed letter by letter
 * through `dispatch`, and each state's graph renders through
 * `renderGraph` — view-model only. The encoder below is our own
 * GIF89a + LZW writer; there is no runtime dependency. Nothing here
 * touches the clock, `src/core`, or `src/harness` internals.
 */

/**
 * One quantized frame ready for the encoder: a palette of packed
 * `0xRRGGBB` colors (at most 256) and one palette index per pixel.
 */
export type QuantizedFrame = {
  palette: readonly number[];
  indices: Uint8Array;
  delayCs: number;
};

/**
 * Centiseconds each replayed mark stays on screen.
 */
export const FRAME_DELAY_CS = 80;

/**
 * Centiseconds the accused (final) frame stays on screen before the loop.
 */
export const FINAL_DELAY_CS = 240;

/**
 * Guard: the export exists only after a winning accuse, like the win
 * card and the share kit.
 *
 * @param session - Session to check
 */
function requireWin(session: GameSession): void {
  if (session.outcome !== "won" || session.bisect.accused === null) {
    throw new GameError("NOT_READY_TO_ACCUSE", "gif export needs a winning accuse");
  }
}

/**
 * Replay a winning session from its plant: the fresh dungeon, one state
 * per transcript letter (`g`/`b`/`l`), and the accused state last.
 * Deterministic — the same win always yields the same state sequence.
 * `checkout` walks are not in the transcript, so they do not appear;
 * the film shows the evidence, not the pacing.
 *
 * @param session - Finished winning session
 */
export function replayWinStates(session: GameSession): readonly GameSession[] {
  requireWin(session);
  let state = createSession(session.input);
  const states: GameSession[] = [state];
  for (const letter of session.transcript) {
    if (letter === "g") {
      state = dispatch(state, "good");
    } else if (letter === "b") {
      state = dispatch(state, "bad");
    } else if (letter === "l") {
      state = dispatch(state, "blame");
    } else {
      throw new GameError("INVALID_COMMAND", `unknown transcript letter ${letter}`);
    }
    states.push(state);
  }
  states.push(dispatch(state, "accuse"));
  return states;
}

/**
 * The frame sequence as dungeon-map SVG documents, one per replayed
 * state, ending on the accused map. Pure view-model rendering.
 *
 * @param session - Finished winning session
 */
export function winFrameSvgs(session: GameSession): readonly string[] {
  return replayWinStates(session).map((state) => renderGraph(buildViewModel(state)));
}

/**
 * Pixel size of one dungeon-map SVG, read from its `viewBox`. Every
 * frame of one win shares one repo, so every frame shares this size.
 *
 * @param svg - Output of `renderGraph`
 */
export function svgPixelSize(svg: string): { width: number; height: number } {
  const match = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    throw new GameError("INVALID_COMMAND", "graph svg has no viewBox");
  }
  return { width: Number(match[1]), height: Number(match[2]) };
}

/**
 * Deterministic download name for the GIF. Case, seed, and clock only —
 * never the guilty SHA and never the wall clock, the share-kit rule.
 *
 * @param session - Finished winning session
 */
export function gifFileName(session: GameSession): string {
  requireWin(session);
  const optimal = optimalMarks(session.bisect.suspectCount);
  const slug = caseName(session).toLowerCase().replaceAll(" ", "");
  return `iwy-${slug}-seed-${String(session.input.seed)}-${String(session.marks)}-of-${String(optimal)}.gif`;
}

/**
 * Quantize one RGBA raster to at most 256 colors. Strategy: keep exact
 * colors when they already fit; otherwise truncate each channel one bit
 * at a time until the distinct set fits. Deterministic — palette order
 * is first-seen scan order, no randomness.
 *
 * @param rgba - Pixels, 4 bytes each, row-major
 * @param width - Raster width in pixels
 * @param height - Raster height in pixels
 * @param delayCs - Frame delay in centiseconds
 */
export function quantizeFrame(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  delayCs: number,
): QuantizedFrame {
  if (rgba.length !== width * height * 4) {
    throw new GameError("INVALID_COMMAND", "rgba length does not match width*height");
  }
  for (let bits = 8; bits >= 1; bits -= 1) {
    const shift = 8 - bits;
    const paletteIndex = new Map<number, number>();
    const palette: number[] = [];
    const indices = new Uint8Array(width * height);
    let fits = true;
    for (let p = 0; p < width * height; p += 1) {
      const at = p * 4;
      const r = ((rgba[at] ?? 0) >> shift) << shift;
      const g = ((rgba[at + 1] ?? 0) >> shift) << shift;
      const b = ((rgba[at + 2] ?? 0) >> shift) << shift;
      const color = (r << 16) | (g << 8) | b;
      let slot = paletteIndex.get(color);
      if (slot === undefined) {
        if (palette.length === 256) {
          fits = false;
          break;
        }
        slot = palette.length;
        palette.push(color);
        paletteIndex.set(color, slot);
      }
      indices[p] = slot;
    }
    if (fits) {
      return { palette, indices, delayCs };
    }
  }
  // Unreachable: 1-bit channels admit at most 8 distinct colors.
  throw new GameError("INVALID_COMMAND", "quantization failed to fit 256 colors");
}

/**
 * GIF LZW with variable code width. Standard rules: emit a clear code
 * first, grow the code width when the next free slot no longer fits,
 * clear the table at 4096 slots, end with EOI. Bits pack LSB-first.
 *
 * @param indices - Palette indices, one byte per pixel
 * @param minCodeSize - Initial LZW code size (2–8)
 */
export function lzwEncode(indices: Uint8Array, minCodeSize: number): Uint8Array {
  if (minCodeSize < 2 || minCodeSize > 8) {
    throw new GameError("INVALID_COMMAND", "lzw min code size must be 2-8");
  }
  if (indices.length === 0) {
    throw new GameError("INVALID_COMMAND", "lzw needs at least one pixel");
  }
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let nextCode = eoiCode + 1;
  let codeSize = minCodeSize + 1;
  let table = new Map<number, number>();
  const out: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  const emit = (code: number): void => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      out.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };
  emit(clearCode);
  let prefix = indices[0] ?? 0;
  for (let i = 1; i < indices.length; i += 1) {
    const k = indices[i] ?? 0;
    // Prefix codes stay under 4096 and indices under 256, so this key
    // is collision-free in one number.
    const key = prefix * 256 + k;
    const found = table.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (nextCode < 4096) {
      if (nextCode === 1 << codeSize && codeSize < 12) {
        codeSize += 1;
      }
      table.set(key, nextCode);
      nextCode += 1;
    } else {
      emit(clearCode);
      table = new Map<number, number>();
      nextCode = eoiCode + 1;
      codeSize = minCodeSize + 1;
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoiCode);
  if (bitCount > 0) {
    out.push(bitBuffer & 0xff);
  }
  return Uint8Array.from(out);
}

/**
 * Split raw LZW bytes into GIF data sub-blocks: length byte, up to 255
 * data bytes, and a zero terminator after the last block.
 *
 * @param data - Raw LZW output
 */
function subBlocks(data: Uint8Array): number[] {
  const out: number[] = [];
  for (let at = 0; at < data.length; at += 255) {
    const slice = data.subarray(at, Math.min(at + 255, data.length));
    out.push(slice.length);
    for (const byte of slice) {
      out.push(byte);
    }
  }
  out.push(0);
  return out;
}

/**
 * Little-endian u16 as two bytes.
 *
 * @param value - 0–65535
 */
function u16(value: number): [number, number] {
  return [value & 0xff, (value >> 8) & 0xff];
}

/**
 * Encode quantized frames as one looping GIF89a. Each frame carries a
 * local color table padded to a power of two; the logical screen has no
 * global table. A NETSCAPE2.0 block loops forever. Output is a pure
 * function of the frames — same win, same bytes.
 *
 * @param frames - Quantized frames, all `width`×`height`
 * @param width - Logical screen width in pixels
 * @param height - Logical screen height in pixels
 */
export function encodeGif(frames: readonly QuantizedFrame[], width: number, height: number): Uint8Array {
  if (frames.length === 0) {
    throw new GameError("INVALID_COMMAND", "gif needs at least one frame");
  }
  if (width < 1 || height < 1 || width > 0xffff || height > 0xffff) {
    throw new GameError("INVALID_COMMAND", "gif dimensions out of range");
  }
  const bytes: number[] = [];
  // Header + logical screen descriptor (no global color table).
  bytes.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);
  bytes.push(...u16(width), ...u16(height), 0x70, 0x00, 0x00);
  // NETSCAPE2.0 application extension: loop count 0 = forever.
  bytes.push(0x21, 0xff, 0x0b);
  for (const ch of "NETSCAPE2.0") {
    bytes.push(ch.charCodeAt(0));
  }
  bytes.push(0x03, 0x01, ...u16(0), 0x00);
  for (const frame of frames) {
    if (frame.palette.length < 1 || frame.palette.length > 256) {
      throw new GameError("INVALID_COMMAND", "frame palette must hold 1-256 colors");
    }
    if (frame.indices.length !== width * height) {
      throw new GameError("INVALID_COMMAND", "frame size does not match the screen");
    }
    // Local color table size must be a power of two, at least 4 slots
    // so the LZW min code size stays >= 2.
    let tableBits = 1;
    while (1 << (tableBits + 1) < frame.palette.length) {
      tableBits += 1;
    }
    const tableSize = 1 << (tableBits + 1);
    const minCodeSize = tableBits + 1;
    // Graphic control extension: keep the frame, then show the next.
    bytes.push(0x21, 0xf9, 0x04, 0x04, ...u16(frame.delayCs), 0x00, 0x00);
    // Image descriptor with a local color table.
    bytes.push(0x2c, ...u16(0), ...u16(0), ...u16(width), ...u16(height), 0x80 | tableBits);
    for (let slot = 0; slot < tableSize; slot += 1) {
      const color = frame.palette[slot] ?? 0;
      bytes.push((color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff);
    }
    bytes.push(minCodeSize, ...subBlocks(lzwEncode(frame.indices, minCodeSize)));
  }
  bytes.push(0x3b);
  return Uint8Array.from(bytes);
}
