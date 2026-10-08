/**
 * A small force-directed layout for the note graph: notes push each other apart, links pull
 * linked notes together, and a weak pull toward the center keeps unlinked notes nearby.
 */
export interface GraphNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Held in place while it is being dragged. */
  fixed?: boolean;
}

const LINK_LENGTH = 70;
const LINK_STRENGTH = 0.06;
const CHARGE = 900;
const GRAVITY = 0.02;
const DECAY = 0.55;
/** Beyond this distance notes stop pushing each other, which keeps large graphs fast. */
const MAX_REACH = 420;

export class GraphLayout {
  nodes: GraphNode[] = [];
  links: [number, number][] = [];
  alpha = 1;
  #index = new Map<string, number>();

  /** Replace the notes and links, keeping the positions of notes that were already placed. */
  setGraph(ids: string[], edges: [string, string][]) {
    const previous = new Map(this.nodes.map((node) => [node.id, node]));
    const placed = this.nodes.length;
    this.nodes = ids.map((id, i) => {
      const old = previous.get(id);
      if (old) return old;
      // New notes start on a sunflower spiral, so the first layout is spread out and stable.
      const radius = 18 * Math.sqrt(i + 0.5);
      const angle = i * 2.399963;
      return { id, x: radius * Math.cos(angle), y: radius * Math.sin(angle), vx: 0, vy: 0 };
    });
    this.#index = new Map(this.nodes.map((node, i) => [node.id, i]));
    this.links = edges.flatMap(([from, to]) => {
      const a = this.#index.get(from);
      const b = this.#index.get(to);
      return a === undefined || b === undefined || a === b ? [] : [[a, b] as [number, number]];
    });
    this.alpha = placed && this.nodes.every((node) => previous.has(node.id)) ? 0.3 : 1;
  }

  get settled() {
    return this.alpha < 0.005;
  }

  tick() {
    const { nodes, alpha } = this;
    const reach = MAX_REACH * MAX_REACH;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 > reach) continue;
        if (d2 < 1) {
          // Separate notes that landed on the same spot in a stable direction.
          dx = ((i * 7 + j * 13) % 11) - 5 || 1;
          dy = ((i * 5 + j * 3) % 9) - 4 || 1;
          d2 = dx * dx + dy * dy;
        }
        const force = (CHARGE * alpha) / d2;
        const fx = dx * force;
        const fy = dy * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }
    for (const [i, j] of this.links) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      const pull = ((distance - LINK_LENGTH) / distance) * LINK_STRENGTH * alpha;
      a.vx += dx * pull;
      a.vy += dy * pull;
      b.vx -= dx * pull;
      b.vy -= dy * pull;
    }
    for (const node of nodes) {
      if (node.fixed) {
        node.vx = node.vy = 0;
        continue;
      }
      node.vx = (node.vx - node.x * GRAVITY * alpha) * DECAY;
      node.vy = (node.vy - node.y * GRAVITY * alpha) * DECAY;
      node.x += node.vx;
      node.y += node.vy;
    }
    this.alpha *= 0.985;
  }

  /** Run the layout to rest at once, for reduced motion and tests. */
  settle(maxTicks = 400) {
    for (let i = 0; i < maxTicks && !this.settled; i++) this.tick();
  }

  /** Wake the layout up after a change, such as dragging a note. */
  reheat(alpha = 0.3) {
    this.alpha = Math.max(this.alpha, alpha);
  }

  bounds() {
    if (!this.nodes.length) return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const { x, y } of this.nodes) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    return { minX, minY, maxX, maxY };
  }
}
