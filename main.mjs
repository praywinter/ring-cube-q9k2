import { Cube, RingLayout, faces, levels, slots, vector, rotate, inverseTurns, wrapAngle, TAU } from "./cube.mjs";

const WIDTH = 432, HEIGHT = 350;
const cube = new Cube(), rings = new RingLayout(216, 129, 93);
const ringCanvas = document.querySelector("#rings"), cubeCanvas = document.querySelector("#cube");
const ringCtx = ringCanvas.getContext("2d"), cubeCtx = cubeCanvas.getContext("2d");
const status = document.querySelector("#status"), steps = document.querySelector("#steps");
const tip = document.querySelector("#ring-tip");
const shuffleButton = document.querySelector("#shuffle");
const undoButton = document.querySelector("#undo");
const resetButton = document.querySelector("#reset");
const history = [], baseline = [];
const original = new Cube();
const trackColors = ["#CBB3A8", "#A8B8D1", "#A5BEB5"];
const accent = "#2456D4";
const choose = items => items[Math.floor(Math.random() * items.length)];

let active = null, hover = null, pointer = null, lastAngle = null;
let progress = 0, busy = false, activity = "";

function prepare(canvas, ctx) {
  const size = canvas.getBoundingClientRect();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(size.width * dpr));
  const height = Math.max(1, Math.round(size.height * dpr));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  ctx.setTransform(width / WIDTH, 0, 0, height / HEIGHT, 0, 0);
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
}

function circle(ctx, x, y, radius) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
}

function drawRings() {
  prepare(ringCanvas, ringCtx);
  const highlight = active || hover;
  for (const [axis, [x, y]] of rings.centers.entries()) {
    for (const layer of levels) {
      circle(ringCtx, x, y, rings.radius(layer));
      ringCtx.strokeStyle = trackColors[axis];
      ringCtx.lineWidth = 1.6;
      ringCtx.stroke();
    }
  }
  if (highlight) {
    const [axis, layer] = highlight;
    circle(ringCtx, ...rings.centers[axis], rings.radius(layer));
    ringCtx.strokeStyle = "#DCE7FF";
    ringCtx.lineWidth = 10;
    ringCtx.stroke();
    ringCtx.strokeStyle = accent;
    ringCtx.lineWidth = 2.6;
    ringCtx.stroke();
  }
  const onTrack = slot => highlight && slot.position[highlight[0]] === highlight[1];
  const paint = slot => {
    const point = active && onTrack(slot)
      ? rings.movingPoint(slot, active[0], progress) : rings.points.get(slot.key);
    circle(ringCtx, ...point, 8.5);
    ringCtx.fillStyle = cube.stickers.get(slot.key);
    ringCtx.fill();
    ringCtx.lineWidth = 1.7;
    ringCtx.strokeStyle = "#253146";
    ringCtx.stroke();
  };
  for (const slot of slots) if (!onTrack(slot)) paint(slot);
  for (const slot of slots) if (onTrack(slot)) paint(slot);
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = v => v.map(value => value / Math.hypot(...v));
const camera = unit([4.5, 4, 6]), light = unit([3, 8, 5]), right = [0.8, 0, -0.6];
const up = [camera[1] * right[2], camera[2] * right[0] - camera[0] * right[2], -camera[1] * right[0]];
const cubies = levels.flatMap(x => levels.flatMap(y => levels.map(z => [x, y, z])));
const plastic = [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]];
const faceNormals = faces.map(([axis, side]) => ({ axis, side, normal: vector(axis, side) }));

function roundedProfile(extent, radius) {
  return [0, 1, 2, 3].flatMap(corner => {
    const center = (corner + .5) * Math.PI / 2;
    const u = Math.sign(Math.cos(center)) * (extent - radius);
    const v = Math.sign(Math.sin(center)) * (extent - radius);
    return [0, 1, 2, 3, 4].map(step => {
      const angle = (corner + step / 4) * Math.PI / 2;
      return [u + radius * Math.cos(angle), v + radius * Math.sin(angle)];
    });
  });
}

const bevel = roundedProfile(.445, .105), sticker = roundedProfile(.418, .083);
const palette = new Map([...faces.map(([, , color]) => color), "#2F3B50"].map(color =>
  [color, [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16))]));

function shade(color, factor, gloss = 0) {
  return "rgb(" + palette.get(color).map(value =>
    Math.round(value * factor * (1 - gloss) + 255 * gloss)).join(",") + ")";
}

function drawCube() {
  prepare(cubeCanvas, cubeCtx);
  const ctx = cubeCtx;
  ctx.save();
  ctx.translate(216, 309);
  ctx.scale(1, .13);
  const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, 127);
  shadow.addColorStop(0, "#566A9344");
  shadow.addColorStop(1, "#566A9300");
  circle(ctx, 0, 0, 127);
  ctx.fillStyle = shadow;
  ctx.fill();
  ctx.restore();

  const [axis, layer] = active || [0, 2];
  const angle = progress * Math.PI / 2;
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  const transformed = point => rotate(point, axis, cosine, sine);
  const ordered = cubies.map(position => {
    const moving = position[axis] === layer;
    return { position, moving, depth: dot(moving ? transformed(position) : position, camera) };
  }).sort((a, b) => (active ? a.position[axis] - b.position[axis] : 0) || a.depth - b.depth);

  for (const { position, moving } of ordered) {
    for (const { axis: a, side, normal } of faceNormals) {
      const worldNormal = moving ? transformed(normal) : normal;
      if (dot(worldNormal, camera) <= .00001) continue;
      const lit = Math.max(0, dot(worldNormal, light));
      const paint = (profile, plane, color, edge = false) => {
        ctx.beginPath();
        for (const [i, [u, v]] of profile.entries()) {
          let point = position.slice();
          point[a] += plane * side;
          point[(a + 1) % 3] += u;
          point[(a + 2) % 3] += v;
          if (moving) point = transformed(point);
          const x = 216 + 65 * dot(point, right), y = 175 - 65 * dot(point, up);
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        // Keep shared polygon edges opaque through Canvas antialiasing.
        if (edge) {
          ctx.strokeStyle = color;
          ctx.lineWidth = .6;
          ctx.stroke();
        }
      };
      paint(plastic, .5, shade("#2F3B50", .66 + .34 * lit), true);
      const color = cube.at(position, normal);
      if (color) {
        paint(bevel, .503, shade(color, .60 + .21 * lit));
        paint(sticker, .504, shade(color, .86 + .14 * lit, .04 + .13 * lit));
      }
    }
  }
}

function draw() {
  drawRings();
  drawCube();
  const selected = active || hover;
  const text = selected
    ? ["X", "Y", "Z"][selected[0]] + " 轴 · " + ["远侧", "中间", "近侧"][selected[1] + 1] + "层"
    : "松手后自动对齐到 90° 刻度";
  if (tip.textContent !== text) tip.textContent = text;
  const solved = !busy && !active && cube.solved();
  const label = activity || (active ? "转动中" : solved ? "已还原" : "待还原");
  if (status.textContent !== label) status.textContent = label;
  status.dataset.solved = String(solved);
  steps.textContent = String(history.length).padStart(2, "0");
  shuffleButton.disabled = resetButton.disabled = busy || !!active;
  undoButton.disabled = busy || !!active || history.length === 0;
  ringCanvas.dataset.track = String(!!selected && !busy);
  ringCanvas.dataset.dragging = String(pointer !== null);
}

function point(event) {
  const bounds = ringCanvas.getBoundingClientRect();
  return [(event.clientX - bounds.left) * WIDTH / bounds.width,
          (event.clientY - bounds.top) * HEIGHT / bounds.height];
}

function nearest(event) {
  const tolerance = event.pointerType === "touch" ? 20 : 14;
  return rings.nearest(...point(event), tolerance);
}

function updateDrag(event) {
  const [x, y] = point(event), [cx, cy] = rings.centers[active[0]];
  if (Math.hypot(x - cx, y - cy) < 14) {
    lastAngle = null;
    return;
  }
  const angle = Math.atan2(y - cy, x - cx);
  if (lastAngle !== null) progress -= wrapAngle(angle - lastAngle) / (Math.PI / 2);
  lastAngle = angle;
}

ringCanvas.addEventListener("pointerdown", event => {
  if (busy || pointer !== null || event.button !== 0) return;
  const selected = nearest(event);
  if (!selected) return;
  active = selected;
  pointer = event.pointerId;
  ringCanvas.setPointerCapture(pointer);
  updateDrag(event);
  draw();
});

ringCanvas.addEventListener("pointermove", event => {
  if (busy) return;
  if (pointer === event.pointerId) {
    updateDrag(event);
    draw();
  } else if (pointer === null && event.pointerType === "mouse") {
    const next = nearest(event);
    if (String(next) !== String(hover)) {
      hover = next;
      draw();
    }
  }
});

ringCanvas.addEventListener("pointerleave", () => {
  if (hover) {
    hover = null;
    if (!busy && !active) draw();
  }
});

function endDrag(event, commit) {
  if (event.pointerId !== pointer) return;
  if (commit) updateDrag(event);
  pointer = lastAngle = null;
  const target = commit ? Math.sign(progress) * Math.floor(Math.abs(progress) + .5) : 0;
  const [axis, layer] = active;
  const duration = 125 + 150 * Math.min(1, Math.abs(target - progress));
  busy = true;
  tween(target, duration, () => {
    if (target % 4) {
      cube.turn(axis, layer, target);
      history.push([axis, layer, target]);
    }
    busy = false;
    draw();
  });
}

ringCanvas.addEventListener("pointerup", event => endDrag(event, true));
ringCanvas.addEventListener("pointercancel", event => endDrag(event, false));
ringCanvas.addEventListener("lostpointercapture", event => endDrag(event, false));

function tween(target, duration, done) {
  const start = progress;
  const begin = performance.now();
  function frame(now) {
    const fraction = Math.min(1, Math.max(0, (now - begin) / duration));
    if (fraction === 1) {
      progress = 0;
      active = hover = null;
      done();
      return;
    }
    progress = start + (target - start) * (fraction ** 2 * (3 - 2 * fraction));
    draw();
    requestAnimationFrame(frame);
  }
  draw();
  requestAnimationFrame(frame);
}

function sequence(moves, label, duration, finish) {
  busy = true;
  activity = label;
  let index = 0;
  function next() {
    if (index === moves.length) {
      activity = "";
      busy = false;
      finish();
      draw();
      return;
    }
    const [axis, layer, turns] = moves[index++];
    active = [axis, layer];
    tween(turns, duration, () => {
      cube.turn(axis, layer, turns);
      next();
    });
  }
  next();
}

function shuffle() {
  if (busy || active) return;
  const preview = new Cube(cube.stickers), moves = [];
  let previous = -1;
  for (let i = 0; i < 18; i++) {
    const axis = choose([0, 1, 2].filter(i => i !== previous));
    const move = [axis, choose(levels), choose([-1, 1, 2])];
    moves.push(move);
    preview.turn(...move);
    previous = axis;
  }
  if (preview.solved()) moves.push([1, 1, 1]);
  sequence(moves, "打乱中", 130, () => {
    baseline.push(...history, ...moves);
    history.length = 0;
  });
}

function undo() {
  if (busy || active || !history.length) return;
  const [axis, layer, turns] = history[history.length - 1];
  sequence([[axis, layer, inverseTurns(turns)]], "撤销中", 240, () => { history.pop(); });
}

function reset() {
  if (busy || active || !(history.length || baseline.length)) return;
  const finish = () => { history.length = baseline.length = 0; };
  if (slots.every(({ key }) => cube.stickers.get(key) === original.stickers.get(key))) {
    finish();
    draw();
    return;
  }
  const moves = [...baseline, ...history].reverse().map(([axis, layer, turns]) =>
    [axis, layer, inverseTurns(turns)]);
  sequence(moves, "复原中", Math.max(55, Math.min(200, 3200 / moves.length)), finish);
}

function bindButton(button, action) {
  button.addEventListener("click", action);
  let start = null;
  button.addEventListener("touchstart", event => {
    start = event.touches.length === 1 ? event.changedTouches[0] : null;
  }, { passive: true });
  button.addEventListener("touchcancel", () => { start = null; });
  button.addEventListener("touchend", event => {
    const touch = Array.from(event.changedTouches).find(point => point.identifier === start?.identifier);
    const isTap = touch && !event.touches.length && !button.disabled
      && Math.hypot(touch.clientX - start.clientX, touch.clientY - start.clientY) < 12
      && button.contains(document.elementFromPoint(touch.clientX, touch.clientY));
    start = null;
    if (!isTap) return;
    event.preventDefault();
    action();
  }, { passive: false });
}

bindButton(shuffleButton, shuffle);
bindButton(undoButton, undo);
bindButton(resetButton, reset);
window.addEventListener("keydown", event => {
  if (event.repeat || event.altKey || event.metaKey) return;
  const action = {s: shuffle, z: undo, r: reset}[event.key.toLowerCase()];
  if (action) action();
});
window.addEventListener("resize", draw);
if ("ResizeObserver" in window) {
  const observer = new ResizeObserver(draw);
  observer.observe(ringCanvas);
  observer.observe(cubeCanvas);
}
draw();

