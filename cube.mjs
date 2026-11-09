export const TAU = 2 * Math.PI;
export const faces = [
  [0, 1, "#F28A42"], [0, -1, "#E75451"],
  [1, 1, "#F6C651"], [1, -1, "#F5F7F6"],
  [2, 1, "#45A581"], [2, -1, "#517BDD"],
];
export const levels = [-1, 0, 1];
export const vector = (axis, side) => [0, 1, 2].map(i => i === axis ? side : 0);
const keyOf = (position, normal) => position.join(",") + "|" + normal.join(",");
const makeSlot = (position, normal) => ({ position, normal, key: keyOf(position, normal) });
const mod = (value, base) => ((value % base) + base) % base;
export const wrapAngle = angle => mod(angle + Math.PI, TAU) - Math.PI;

export function rotate(point, axis, cosine, sine) {
  const result = point.slice();
  const a = (axis + 1) % 3, b = (axis + 2) % 3;
  result[a] = cosine * point[a] - sine * point[b];
  result[b] = sine * point[a] + cosine * point[b];
  return result;
}

export function rotateSlot(slot, axis, turns) {
  const [cosine, sine] = [[1, 0], [0, 1], [-1, 0], [0, -1]][mod(turns, 4)];
  return makeSlot(rotate(slot.position, axis, cosine, sine),
                  rotate(slot.normal, axis, cosine, sine));
}

export function inverseTurns(turns) {
  return [0, 1, turns > 0 ? -2 : 2, -1][mod(-turns, 4)];
}

export const slots = faces.flatMap(([axis, side, color]) => {
  const normal = vector(axis, side);
  return levels.flatMap(row => levels.map(column => {
    const position = normal.slice();
    position[(axis + 1) % 3] = row;
    position[(axis + 2) % 3] = column;
    return { ...makeSlot(position, normal), color };
  }));
});

export class Cube {
  constructor(stickers) {
    this.stickers = new Map(stickers || slots.map(({ key, color }) => [key, color]));
  }

  turn(axis, layer, turns) {
    const next = new Map();
    for (const slot of slots) {
      const target = slot.position[axis] === layer ? rotateSlot(slot, axis, turns) : slot;
      next.set(target.key, this.stickers.get(slot.key));
    }
    this.stickers = next;
  }

  solved() {
    return slots.every(({ key, normal }) =>
      this.stickers.get(key) === this.stickers.get(keyOf(normal, normal)));
  }

  at(position, normal) {
    return this.stickers.get(keyOf(position, normal));
  }
}

export class RingLayout {
  constructor(x, y, spacing) {
    const h = spacing * Math.sqrt(3) / 2;
    this.centers = [[x + spacing / 2, y + h], [x, y], [x - spacing / 2, y + h]];
    this.radii = [1.24, 1.02, 0.8].map(ratio => ratio * spacing);
    this.points = new Map(slots.map(slot => [slot.key, this.intersection(slot)]));
  }

  radius(layer) {
    return this.radii[layer + 1];
  }

  intersection({ position, normal }) {
    // Each bead lies on the two circle tracks that can carry it.
    const axis = normal.findIndex(Boolean);
    const a = (axis + 1) % 3, b = (axis + 2) % 3;
    const [ax, ay] = this.centers[a], [bx, by] = this.centers[b];
    const [cx, cy] = this.centers[axis];
    const distance = Math.hypot(bx - ax, by - ay);
    const ux = (bx - ax) / distance, uy = (by - ay) / distance;
    const ra = this.radius(position[a]), rb = this.radius(position[b]);
    const along = (ra ** 2 - rb ** 2 + distance ** 2) / (2 * distance);
    const inward = Math.sign(-(cx - ax) * uy + (cy - ay) * ux);
    const height = Math.sqrt(ra ** 2 - along ** 2) * inward * normal[axis];
    return [ax + ux * along - uy * height, ay + uy * along + ux * height];
  }

  nearest(x, y, tolerance) {
    let best = null, gap = tolerance;
    for (const [axis, [cx, cy]] of this.centers.entries()) {
      const distance = Math.hypot(x - cx, y - cy);
      for (const layer of levels) {
        const delta = Math.abs(distance - this.radius(layer));
        if (delta < gap) {
          best = [axis, layer];
          gap = delta;
        }
      }
    }
    return best;
  }

  movingPoint(slot, axis, progress) {
    const direction = Math.sign(progress) || 1;
    const whole = Math.floor(Math.abs(progress));
    const fraction = Math.abs(progress) - whole;
    const start = whole ? rotateSlot(slot, axis, direction * whole) : slot;
    const point = this.points.get(start.key);
    if (!fraction) return point;
    const end = rotateSlot(start, axis, direction);
    const [ex, ey] = this.points.get(end.key), [sx, sy] = point;
    const onFace = start.normal[axis];
    const [cx, cy] = onFace
      ? this.points.get(keyOf(start.normal, start.normal))
      : this.centers[axis];
    const initial = Math.atan2(sy - cy, sx - cx);
    const target = Math.atan2(ey - cy, ex - cx);
    const delta = onFace ? wrapAngle(target - initial) : -direction * mod((initial - target) * direction, TAU);
    const angle = initial + delta * fraction;
    const initialRadius = Math.hypot(sx - cx, sy - cy);
    const radius = initialRadius + (Math.hypot(ex - cx, ey - cy) - initialRadius) * fraction;
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  }
}

