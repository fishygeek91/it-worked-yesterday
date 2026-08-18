import type { ViewModel, ViewNode } from "./viewModel";

/**
 * Token paints. Amber / magenta / slate — not green-vs-red.
 */
export const GRAPH_PAINT = {
  amber: "#e8b86d",
  magenta: "#d65a9a",
  slate: "#7d8a99",
  "amber-rim": "#f3d48a",
  "warm-wash": "#2c2418",
  background: "#12110f",
} as const;

const PAD_X = 48;
const STEP = 72;
const TIGHT = 22;
const EVEN_LAYOUT_MAX = 17;
const ROOM_Y = 78;
const HEIGHT = 168;

type Point = {
  x: number;
  y: number;
};

/**
 * Map a view-model color token to paint.
 *
 * @param token - Token from `vm.colors`
 */
function paintFor(token: string): string {
  if (token === "amber") {
    return GRAPH_PAINT.amber;
  }
  if (token === "magenta") {
    return GRAPH_PAINT.magenta;
  }
  if (token === "slate") {
    return GRAPH_PAINT.slate;
  }
  if (token === "amber-rim") {
    return GRAPH_PAINT["amber-rim"];
  }
  if (token === "warm-wash") {
    return GRAPH_PAINT["warm-wash"];
  }
  return GRAPH_PAINT.slate;
}

/**
 * Escape text for SVG attributes and titles.
 *
 * @param value - Raw text
 */
function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * Room geometry. Shape carries the signal; fill is extra.
 *
 * @param node - View-model room
 * @param at - Center
 * @param fill - Token paint
 * @param rim - HEAD stroke
 */
function roomGeometry(node: ViewNode, at: Point, fill: string, rim: string): string {
  const { x, y } = at;
  if (node.shape === "lamp") {
    return [
      `<circle cx="${String(x)}" cy="${String(y)}" r="13" fill="${fill}" />`,
      `<circle cx="${String(x)}" cy="${String(y)}" r="6" fill="${GRAPH_PAINT.background}" fill-opacity="0.35" />`,
      `<line x1="${String(x)}" y1="${String(y - 13)}" x2="${String(x)}" y2="${String(y - 22)}" stroke="${fill}" stroke-width="2.5" stroke-linecap="round" />`,
    ].join("");
  }
  if (node.shape === "rot") {
    const s = 11;
    return [
      `<rect x="${String(x - s)}" y="${String(y - s)}" width="${String(s * 2)}" height="${String(s * 2)}" fill="none" stroke="${fill}" stroke-width="2.5" />`,
      `<line x1="${String(x - s + 3)}" y1="${String(y - s + 3)}" x2="${String(x + s - 3)}" y2="${String(y + s - 3)}" stroke="${fill}" stroke-width="2" />`,
    ].join("");
  }
  if (node.shape === "fog") {
    const points = `${String(x)},${String(y - 14)} ${String(x + 14)},${String(y)} ${String(x)},${String(y + 14)} ${String(x - 14)},${String(y)}`;
    return `<polygon points="${points}" fill="${fill}" fill-opacity="0.18" stroke="${fill}" stroke-dasharray="4 3" stroke-width="1.75" />`;
  }
  return [
    `<circle cx="${String(x)}" cy="${String(y)}" r="16" fill="none" stroke="${rim}" stroke-width="2.5" class="lantern-rim" />`,
    `<circle cx="${String(x)}" cy="${String(y)}" r="8" fill="${rim}" fill-opacity="0.35" />`,
    `<path d="M ${String(x - 7)} ${String(y - 16)} Q ${String(x)} ${String(y - 28)} ${String(x + 7)} ${String(y - 16)}" fill="none" stroke="${rim}" stroke-width="2.5" stroke-linecap="round" />`,
  ].join("");
}

/**
 * Horizontal x for each room. Long halls tighten fogged wings so the
 * remaining range still reads as a walkable hallway.
 *
 * @param count - Room count
 * @param lit - Parallel lit flags
 */
/**
 * Wide gap for the remaining range. Tutorial and Yesterday keep the v1 step.
 */
function hallStep(count: number): number {
  if (count <= EVEN_LAYOUT_MAX) {
    return STEP;
  }
  if (count <= 33) {
    return 52;
  }
  return 40;
}

function nodeXs(count: number, lit: readonly boolean[]): number[] {
  if (count <= EVEN_LAYOUT_MAX) {
    return Array.from({ length: count }, (_, index) => PAD_X + index * STEP);
  }
  const wide = hallStep(count);
  const xs: number[] = [];
  let x = PAD_X;
  for (let index = 0; index < count; index += 1) {
    xs.push(x);
    if (index === count - 1) {
      break;
    }
    const thisLit = lit[index] === true;
    const nextLit = lit[index + 1] === true;
    x += thisLit || nextLit ? wide : TIGHT;
  }
  return xs;
}

/**
 * One corridor between parent and child.
 *
 * @param from - Parent
 * @param to - Child
 */
function corridor(from: Point, to: Point): string {
  return `<line x1="${String(from.x)}" y1="${String(from.y)}" x2="${String(to.x)}" y2="${String(to.y)}" stroke="${GRAPH_PAINT.slate}" stroke-opacity="0.4" stroke-width="3" stroke-linecap="round" />`;
}

/**
 * Warm wash behind the lit wing. Missing when nothing is lit.
 *
 * @param points - Room centers in order
 * @param lit - Parallel lit flags
 * @param wash - Range paint
 */
function rangeWash(points: Point[], lit: boolean[], wash: string): string {
  let first = -1;
  let last = -1;
  for (let i = 0; i < lit.length; i += 1) {
    if (lit[i] === true) {
      if (first < 0) {
        first = i;
      }
      last = i;
    }
  }
  if (first < 0) {
    return "";
  }
  const start = points[first];
  const end = points[last];
  if (start === undefined || end === undefined) {
    return "";
  }
  const x = start.x - 26;
  const w = end.x - start.x + 52;
  return `<rect x="${String(x)}" y="${String(ROOM_Y - 36)}" width="${String(w)}" height="72" rx="24" fill="${wash}" />`;
}

/**
 * Render the dungeon map as SVG. Consumes the view-model only.
 *
 * @param vm - Renderer input
 */
export function renderGraph(vm: ViewModel): string {
  const count = vm.nodes.length;
  const lit = vm.nodes.map((node) => node.lit);
  const xs = nodeXs(count, lit);
  const lastX = xs.length === 0 ? PAD_X : (xs[xs.length - 1] ?? PAD_X);
  const width = Math.max(PAD_X * 2, lastX + PAD_X);
  const good = paintFor(vm.colors.good);
  const bad = paintFor(vm.colors.bad);
  const unknown = paintFor(vm.colors.unknown);
  const rim = paintFor(vm.colors.head);
  const wash = paintFor(vm.colors.range);
  const points: Point[] = [];
  const bySha = new Map<string, Point>();
  for (let i = 0; i < count; i += 1) {
    const node = vm.nodes[i];
    const x = xs[i] ?? PAD_X;
    const at = { x, y: ROOM_Y };
    points.push(at);
    if (node !== undefined) {
      bySha.set(node.sha, at);
    }
  }
  const washRect = rangeWash(
    points,
    vm.nodes.map((node) => node.lit),
    wash,
  );
  const edges = vm.edges
    .map((edge) => {
      const from = bySha.get(edge.from);
      const to = bySha.get(edge.to);
      if (from === undefined || to === undefined) {
        return "";
      }
      return corridor(from, to);
    })
    .join("");
  const rooms = vm.nodes
    .map((node, i) => {
      const at = points[i];
      if (at === undefined) {
        return "";
      }
      const fill =
        node.shape === "lamp" ? good : node.shape === "rot" ? bad : node.shape === "fog" ? unknown : rim;
      const opacity = node.lit ? "1" : "0.32";
      const short = node.sha.slice(0, 7);
      const showLabel = node.lit || i === 0 || i === count - 1 || node.shape === "lantern";
      const labelText = showLabel
        ? `<text x="${String(at.x)}" y="${String(at.y + 34)}" text-anchor="middle" fill="#e8e2d6" font-size="11" font-family="IBM Plex Mono, ui-monospace, monospace">${escapeXml(node.label)}</text>`
        : "";
      const shaText =
        node.shape === "lantern"
          ? `<text x="${String(at.x)}" y="${String(at.y + 50)}" text-anchor="middle" fill="#b7b1a4" font-size="9" font-family="IBM Plex Mono, ui-monospace, monospace">${escapeXml(short)}</text>`
          : "";
      return [
        `<g data-shape="${escapeXml(node.shape)}" data-label="${escapeXml(node.label)}" data-lit="${node.lit ? "true" : "false"}" data-sha="${escapeXml(node.sha)}" opacity="${opacity}">`,
        `<title>${escapeXml(node.sha)} — ${escapeXml(node.message)}</title>`,
        roomGeometry(node, at, fill, rim),
        labelText,
        shaText,
        "</g>",
      ].join("");
    })
    .join("");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(width)} ${String(HEIGHT)}" role="img" aria-label="commit graph">`,
    `<rect width="100%" height="100%" fill="${GRAPH_PAINT.background}" />`,
    washRect,
    edges,
    rooms,
    "</svg>",
  ].join("");
}
