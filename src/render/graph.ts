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

const PAD_X = 36;
const STEP = 56;
const ROOM_Y = 44;
const HEIGHT = 96;

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
      `<circle cx="${String(x)}" cy="${String(y)}" r="10" fill="${fill}" />`,
      `<line x1="${String(x)}" y1="${String(y - 10)}" x2="${String(x)}" y2="${String(y - 16)}" stroke="${fill}" stroke-width="2" />`,
    ].join("");
  }
  if (node.shape === "rot") {
    const left = x - 9;
    const top = y - 9;
    const right = x + 9;
    const bottom = y + 9;
    return `<path d="M ${String(left)} ${String(top)} H ${String(right)} V ${String(y + 2)} M ${String(right)} ${String(bottom)} H ${String(left)} V ${String(y - 2)}" fill="none" stroke="${fill}" stroke-width="2" />`;
  }
  if (node.shape === "fog") {
    const points = `${String(x)},${String(y - 11)} ${String(x + 11)},${String(y)} ${String(x)},${String(y + 11)} ${String(x - 11)},${String(y)}`;
    return `<polygon points="${points}" fill="${fill}" fill-opacity="0.2" stroke="${fill}" stroke-dasharray="3 2" />`;
  }
  return [
    `<circle cx="${String(x)}" cy="${String(y)}" r="10" fill="none" stroke="${rim}" stroke-width="2" />`,
    `<path d="M ${String(x - 5)} ${String(y - 10)} Q ${String(x)} ${String(y - 18)} ${String(x + 5)} ${String(y - 10)}" fill="none" stroke="${rim}" stroke-width="2" />`,
  ].join("");
}

/**
 * One corridor between parent and child.
 *
 * @param from - Parent
 * @param to - Child
 */
function corridor(from: Point, to: Point): string {
  return `<line x1="${String(from.x)}" y1="${String(from.y)}" x2="${String(to.x)}" y2="${String(to.y)}" stroke="${GRAPH_PAINT.slate}" stroke-opacity="0.35" />`;
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
  const x = start.x - 18;
  const w = end.x - start.x + 36;
  return `<rect x="${String(x)}" y="${String(ROOM_Y - 22)}" width="${String(w)}" height="44" rx="16" fill="${wash}" />`;
}

/**
 * Render the dungeon map as SVG. Consumes the view-model only.
 *
 * @param vm - Renderer input
 */
export function renderGraph(vm: ViewModel): string {
  const count = vm.nodes.length;
  const width = Math.max(PAD_X * 2, PAD_X * 2 + Math.max(0, count - 1) * STEP);
  const good = paintFor(vm.colors.good);
  const bad = paintFor(vm.colors.bad);
  const unknown = paintFor(vm.colors.unknown);
  const rim = paintFor(vm.colors.head);
  const wash = paintFor(vm.colors.range);
  const points: Point[] = [];
  const bySha = new Map<string, Point>();
  for (let i = 0; i < count; i += 1) {
    const node = vm.nodes[i];
    const at = { x: PAD_X + i * STEP, y: ROOM_Y };
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
      const opacity = node.lit ? "1" : "0.35";
      return [
        `<g data-shape="${escapeXml(node.shape)}" data-label="${escapeXml(node.label)}" data-lit="${node.lit ? "true" : "false"}" data-sha="${escapeXml(node.sha)}" opacity="${opacity}">`,
        `<title>${escapeXml(node.sha)}</title>`,
        roomGeometry(node, at, fill, rim),
        `<text x="${String(at.x)}" y="${String(at.y + 26)}" text-anchor="middle" fill="#e8e2d6" font-size="9">${escapeXml(node.label)}</text>`,
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
