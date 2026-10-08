import { describe, expect, it } from 'vitest';
import { GraphLayout } from './graphLayout';

const distance = (layout: GraphLayout, a: string, b: string) => {
  const [p, q] = [a, b].map((id) => layout.nodes.find((node) => node.id === id)!);
  return Math.hypot(p.x - q.x, p.y - q.y);
};

describe('graph layout', () => {
  it('settles with linked notes closer together than unlinked ones', () => {
    const layout = new GraphLayout();
    layout.setGraph(
      ['a', 'b', 'c', 'd', 'e'],
      [
        ['a', 'b'],
        ['b', 'c'],
        ['a', 'c'],
      ],
    );
    layout.settle();
    expect(layout.settled).toBe(true);
    for (const node of layout.nodes) {
      expect(Number.isFinite(node.x) && Number.isFinite(node.y)).toBe(true);
    }
    expect(distance(layout, 'a', 'b')).toBeLessThan(distance(layout, 'a', 'e'));
    expect(distance(layout, 'd', 'e')).toBeGreaterThan(20);
  });

  it('keeps placed notes where they are when the graph changes', () => {
    const layout = new GraphLayout();
    layout.setGraph(['a', 'b'], [['a', 'b']]);
    layout.settle();
    const a = { ...layout.nodes[0] };
    layout.setGraph(
      ['a', 'b', 'c'],
      [
        ['a', 'b'],
        ['c', 'a'],
        ['c', 'missing'],
      ],
    );
    expect(layout.nodes[0]).toMatchObject({ id: 'a', x: a.x, y: a.y });
    expect(layout.links).toEqual([
      [0, 1],
      [2, 0],
    ]);
  });

  it('holds a dragged note in place', () => {
    const layout = new GraphLayout();
    layout.setGraph(['a', 'b'], [['a', 'b']]);
    Object.assign(layout.nodes[0], { x: 300, y: 300, fixed: true });
    layout.settle();
    expect(layout.nodes[0]).toMatchObject({ x: 300, y: 300 });
  });
});
