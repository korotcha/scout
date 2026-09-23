type BubbleAnchor = { size: number; xRatio: number; yRatio: number };

/** Keep labels apart while retaining each point's data anchor for leader lines. */
export function arrangeBubbles<T extends BubbleAnchor>(items: T[], width: number, height: number) {
  if (!width || !height) return [];
  const insetX = Math.min(70, width * .2), insetY = 66;
  const points = items.map((item) => {
    const size = Math.min(item.size, width * .29);
    const anchorX = insetX + item.xRatio * (width - insetX * 2);
    const anchorY = insetY + item.yRatio * (height - insetY * 2);
    return { ...item, size, anchorX, anchorY, x: anchorX, y: anchorY };
  });
  const constrain = (p: typeof points[number]) => {
    const radius = p.size / 2;
    p.x = Math.max(radius + 34, Math.min(width - radius - 14, p.x));
    p.y = Math.max(radius + 40, Math.min(height - radius - 40, p.y));
  };
  for (let iteration = 0; iteration < 320; iteration++) {
    // Relax around the real coordinates first; finish with collision projection.
    if (iteration < 180) for (const p of points) {
      p.x += (p.anchorX - p.x) * .012;
      p.y += (p.anchorY - p.y) * .012;
    }
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
      const a = points[i], b = points[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      let distance = Math.hypot(dx, dy);
      const target = (a.size + b.size) / 2 + 12;
      if (distance >= target) continue;
      if (distance < .001) {
        const angle = (i + j * 7) * 2.399963;
        dx = Math.cos(angle); dy = Math.sin(angle); distance = 1;
      }
      const push = (target - distance) / 2;
      a.x -= dx / distance * push; a.y -= dy / distance * push;
      b.x += dx / distance * push; b.y += dy / distance * push;
    }
    points.forEach(constrain);
  }
  return points;
}
