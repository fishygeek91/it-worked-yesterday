import { describe, expect, it } from "vitest";

import { GameError, optimalMarks, type GenerateInput } from "../src/core";
import { createSession, dispatch, type GameSession } from "../src/harness";
import {
  encodeGif,
  FINAL_DELAY_CS,
  FRAME_DELAY_CS,
  gifFileName,
  lzwEncode,
  quantizeFrame,
  replayWinStates,
  svgPixelSize,
  winFrameSvgs,
  type QuantizedFrame,
} from "../src/ui";

const TUTORIAL: GenerateInput = {
  suspectCount: 8,
  firstBadIndex: 3,
  seed: 1729,
  mutation: "offByOneLoopBound",
};

/**
 * Mark what the suite said, then accuse. Always wins the tutorial pin.
 *
 * @param session - Starting session
 */
function playToWin(session: GameSession): GameSession {
  let next = session;
  while (next.bisect.status === "searching") {
    next = dispatch(next, next.lastResult.ok ? "good" : "bad");
  }
  return dispatch(next, "accuse");
}

/**
 * Spec-faithful GIF LZW decoder used only to round-trip the encoder.
 * Mirrors the standard decoder rules: clear resets the table, the code
 * width grows when the next free slot stops fitting, EOI ends the stream.
 *
 * @param data - Raw LZW bytes (no sub-block framing)
 * @param minCodeSize - Initial LZW code size
 */
function lzwDecode(data: Uint8Array, minCodeSize: number): number[] {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let table: number[][] = [];
  let next = eoiCode + 1;
  const resetTable = (): void => {
    table = [];
    for (let i = 0; i < clearCode; i += 1) {
      table[i] = [i];
    }
    next = eoiCode + 1;
    codeSize = minCodeSize + 1;
  };
  resetTable();
  let bitAt = 0;
  const readCode = (): number => {
    let code = 0;
    for (let bit = 0; bit < codeSize; bit += 1) {
      const byte = data[bitAt >> 3];
      if (byte === undefined) {
        throw new Error("lzw stream ran out of bits");
      }
      code |= ((byte >> (bitAt & 7)) & 1) << bit;
      bitAt += 1;
    }
    return code;
  };
  const out: number[] = [];
  let prev: number[] | null = null;
  for (;;) {
    const code = readCode();
    if (code === clearCode) {
      resetTable();
      prev = null;
      continue;
    }
    if (code === eoiCode) {
      return out;
    }
    let entry: number[];
    const known = table[code];
    if (known !== undefined) {
      entry = known;
    } else if (code === next && prev !== null) {
      const first = prev[0];
      if (first === undefined) {
        throw new Error("lzw decoder saw an empty prefix");
      }
      entry = [...prev, first];
    } else {
      throw new Error(`lzw decoder saw an impossible code ${String(code)}`);
    }
    out.push(...entry);
    if (prev !== null) {
      const first = entry[0];
      if (first === undefined) {
        throw new Error("lzw decoder saw an empty entry");
      }
      table[next] = [...prev, first];
      next += 1;
      if (next === 1 << codeSize && codeSize < 12) {
        codeSize += 1;
      }
    }
    prev = entry;
  }
}

/**
 * Expect a gif call to throw `NOT_READY_TO_ACCUSE` while playing.
 *
 * @param run - Call under test
 */
function expectNotReady(run: () => unknown): void {
  try {
    run();
    expect.fail("gif export should throw while searching");
  } catch (error) {
    expect(error).toBeInstanceOf(GameError);
    if (error instanceof GameError) {
      expect(error.code).toBe("NOT_READY_TO_ACCUSE");
    }
  }
}

describe("replayWinStates and winFrameSvgs", () => {
  it("replays the transcript into one state per letter plus plant and accuse", () => {
    const won = playToWin(createSession(TUTORIAL));
    expect(won.outcome).toBe("won");
    const states = replayWinStates(won);
    expect(states).toHaveLength(won.transcript.length + 2);
    const first = states[0];
    const last = states[states.length - 1];
    expect(first?.marks).toBe(0);
    expect(last?.outcome).toBe("won");
    expect(last?.bisect.accused).toBe(won.generated.firstBad);
  });

  it("is deterministic: the same win yields the same frame SVGs twice", () => {
    const won = playToWin(createSession(TUTORIAL));
    const once = winFrameSvgs(won);
    const twice = winFrameSvgs(won);
    expect(once).toEqual(twice);
    for (const frame of once) {
      expect(frame.startsWith("<svg ")).toBe(true);
    }
  });

  it("throws while the session is still searching", () => {
    const searching = createSession(TUTORIAL);
    expectNotReady(() => replayWinStates(searching));
    expectNotReady(() => winFrameSvgs(searching));
    expectNotReady(() => gifFileName(searching));
  });
});

describe("svgPixelSize", () => {
  it("reads the frame size from the graph viewBox", () => {
    const won = playToWin(createSession(TUTORIAL));
    const frames = winFrameSvgs(won);
    const first = frames[0];
    if (first === undefined) {
      throw new Error("win produced no frames");
    }
    const size = svgPixelSize(first);
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
    // Every frame of one win shares one repo, so one size.
    for (const frame of frames) {
      expect(svgPixelSize(frame)).toEqual(size);
    }
  });
});

describe("gifFileName", () => {
  it("derives from case, seed, and clock — never the guilty SHA", () => {
    const won = playToWin(createSession(TUTORIAL));
    const accused = won.bisect.accused;
    if (accused === null) {
      throw new Error("winning accuse did not name a SHA");
    }
    const name = gifFileName(won);
    expect(name).toBe(`iwy-tutorial-seed-1729-${String(won.marks)}-of-${String(optimalMarks(8))}.gif`);
    expect(name).not.toContain(accused);
    expect(name).not.toContain(accused.slice(0, 7));
  });
});

describe("quantizeFrame", () => {
  it("keeps exact colors when they already fit", () => {
    // 2×1: one red pixel, one blue pixel.
    const rgba = Uint8Array.from([255, 0, 0, 255, 0, 0, 255, 255]);
    const frame = quantizeFrame(rgba, 2, 1, FRAME_DELAY_CS);
    expect(frame.palette).toEqual([0xff0000, 0x0000ff]);
    expect([...frame.indices]).toEqual([0, 1]);
  });

  it("truncates channels until more than 256 colors fit", () => {
    // 512 pixels, each a distinct 24-bit color: must not fit exactly.
    const count = 512;
    const rgba = new Uint8Array(count * 4);
    for (let p = 0; p < count; p += 1) {
      rgba[p * 4] = p & 0xff;
      rgba[p * 4 + 1] = (p >> 1) & 0xff;
      rgba[p * 4 + 2] = (p >> 2) & 0xff;
      rgba[p * 4 + 3] = 255;
    }
    const frame = quantizeFrame(rgba, count, 1, FRAME_DELAY_CS);
    expect(frame.palette.length).toBeLessThanOrEqual(256);
    expect(frame.indices).toHaveLength(count);
    for (const index of frame.indices) {
      expect(index).toBeLessThan(frame.palette.length);
    }
  });

  it("rejects a raster that does not match its dimensions", () => {
    const rgba = new Uint8Array(8);
    expect(() => quantizeFrame(rgba, 3, 1, FRAME_DELAY_CS)).toThrowError(GameError);
  });
});

describe("lzwEncode", () => {
  it("round-trips a known frame through a spec decoder", () => {
    const indices = Uint8Array.from([0, 1, 1, 2, 2, 2, 0, 3, 3, 0, 1, 2, 3, 0, 0, 1]);
    const encoded = lzwEncode(indices, 2);
    expect(lzwDecode(encoded, 2)).toEqual([...indices]);
  });

  it("round-trips a large repetitive frame across code-size growth", () => {
    const indices = new Uint8Array(10000);
    for (let i = 0; i < indices.length; i += 1) {
      indices[i] = (i * 7 + (i % 13)) % 16;
    }
    const encoded = lzwEncode(indices, 4);
    expect(lzwDecode(encoded, 4)).toEqual([...indices]);
  });

  it("rejects an impossible min code size and an empty frame", () => {
    expect(() => lzwEncode(Uint8Array.from([0]), 1)).toThrowError(GameError);
    expect(() => lzwEncode(new Uint8Array(0), 2)).toThrowError(GameError);
  });
});

describe("encodeGif", () => {
  /**
   * One tiny synthetic frame: 2×2, two colors.
   *
   * @param delayCs - Frame delay
   */
  function tinyFrame(delayCs: number): QuantizedFrame {
    return {
      palette: [0x000000, 0xffffff],
      indices: Uint8Array.from([0, 1, 1, 0]),
      delayCs,
    };
  }

  it("writes a valid GIF89a header, logical screen, loop block, and trailer", () => {
    const gif = encodeGif([tinyFrame(FRAME_DELAY_CS), tinyFrame(FINAL_DELAY_CS)], 2, 2);
    // "GIF89a"
    expect([...gif.slice(0, 6)]).toEqual([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    // Logical screen 2×2, little-endian.
    expect([...gif.slice(6, 10)]).toEqual([2, 0, 2, 0]);
    // NETSCAPE2.0 loop application extension.
    const ascii = String.fromCharCode(...gif);
    expect(ascii).toContain("NETSCAPE2.0");
    // Trailer.
    expect(gif[gif.length - 1]).toBe(0x3b);
    // Two graphic control extensions, one per frame, with the delays.
    let gceCount = 0;
    for (let at = 0; at + 7 < gif.length; at += 1) {
      if (gif[at] === 0x21 && gif[at + 1] === 0xf9 && gif[at + 2] === 0x04) {
        gceCount += 1;
        const delay = (gif[at + 4] ?? 0) | ((gif[at + 5] ?? 0) << 8);
        expect([FRAME_DELAY_CS, FINAL_DELAY_CS]).toContain(delay);
      }
    }
    expect(gceCount).toBe(2);
  });

  it("is deterministic: same frames, same bytes", () => {
    const once = encodeGif([tinyFrame(FRAME_DELAY_CS)], 2, 2);
    const twice = encodeGif([tinyFrame(FRAME_DELAY_CS)], 2, 2);
    expect([...once]).toEqual([...twice]);
  });

  it("rejects empty input, oversized screens, and mismatched frames", () => {
    expect(() => encodeGif([], 2, 2)).toThrowError(GameError);
    expect(() => encodeGif([tinyFrame(FRAME_DELAY_CS)], 0, 2)).toThrowError(GameError);
    expect(() => encodeGif([tinyFrame(FRAME_DELAY_CS)], 3, 3)).toThrowError(GameError);
  });

  it("encodes a full replayed win into one decodable multi-frame gif", () => {
    const won = playToWin(createSession(TUTORIAL));
    const svgs = winFrameSvgs(won);
    const first = svgs[0];
    if (first === undefined) {
      throw new Error("win produced no frames");
    }
    const { width, height } = svgPixelSize(first);
    // Node has no canvas; synthesize a raster per frame from the frame
    // index so the pipeline (quantize → lzw → gif) still runs end to end.
    const frames = svgs.map((_, at) =>
      quantizeFrame(
        Uint8Array.from({ length: 4 * 4 * 4 }, (_v, i) => (i % 4 === 3 ? 255 : (at * 37 + i) % 256)),
        4,
        4,
        at === svgs.length - 1 ? FINAL_DELAY_CS : FRAME_DELAY_CS,
      ),
    );
    const gif = encodeGif(frames, 4, 4);
    expect(gif[gif.length - 1]).toBe(0x3b);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });
});
