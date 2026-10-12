// A held card tilts with the phone (its gyro), with a finger dragged across it, or with a mouse
// towards the pointer; a glare slides across it and its foil (the card's own gradients,
// src/lib/deck.ts: class="foil", data-k) moves with the light. TCGSL's viewer is where this began
// (tcgsl/src/lib/tilt.ts). Transform and opacity on one element, plus the foil's gradients; the loop
// stops as soon as the card has settled, so a card held still costs nothing.

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const touch = matchMedia('(hover: none) and (pointer: coarse)');

type Answer = 'granted' | 'denied';
const DOE =
  typeof DeviceOrientationEvent === 'undefined'
    ? null
    : (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<Answer> });

// iOS asks before a page may read motion and orientation; elsewhere the events just come.
let allowed: Promise<boolean> = Promise.resolve(!DOE?.requestPermission);
let asked = false;

/**
 * Call inside the gesture that opens the viewer: iOS only shows its prompt from a user gesture.
 * It asks once per visit; the answer holds for the cards after.
 */
export function askTilt() {
  if (asked || !DOE?.requestPermission || !touch.matches || reduced.matches) return;
  asked = true;
  allowed = DOE.requestPermission().then(
    (answer) => answer === 'granted',
    () => false,
  );
}

const MAX = 16; // degrees either way
const clamp = (v: number) => Math.max(-MAX, Math.min(MAX, v));

/** `use:tilt` on the card's wrapper; a `.glare` child, if any, follows the tilt. */
export function tilt(node: HTMLElement) {
  if (reduced.matches) return;
  const glare = node.querySelector<HTMLElement>('.glare');
  const foils = () => node.querySelectorAll<SVGGradientElement>('.foil');
  let tx = 0;
  let ty = 0;
  let x = 0;
  let y = 0;
  let frame = 0;
  let base: { b: number; g: number } | null = null;

  const render = () => {
    x += (tx - x) * 0.14;
    y += (ty - y) * 0.14;
    node.style.transform = `perspective(900px) rotateX(${y.toFixed(2)}deg) rotateY(${x.toFixed(2)}deg)`;
    if (glare) {
      glare.style.transform = `translate(${(x * -2.4).toFixed(1)}%, ${(y * 2.4).toFixed(1)}%)`;
      glare.style.opacity = Math.min(0.75, (Math.abs(x) + Math.abs(y)) / 16).toFixed(3);
    }
    for (const g of foils()) {
      const k = Number(g.dataset.k) || 9;
      g.setAttribute('gradientTransform', `translate(${(x * k).toFixed(1)} ${(-y * k).toFixed(1)})`);
    }
    frame = Math.abs(tx - x) + Math.abs(ty - y) > 0.02 ? requestAnimationFrame(render) : 0;
  };
  const kick = () => {
    if (!frame) frame = requestAnimationFrame(render);
  };

  // Relative to how the phone is held: the resting angle follows slowly, so a card held still
  // drifts back to flat, at any angle.
  let gyro = false;
  const orient = (event: DeviceOrientationEvent) => {
    if (event.beta === null || event.gamma === null) return;
    gyro = true;
    base ??= { b: event.beta, g: event.gamma };
    base.b += (event.beta - base.b) * 0.02;
    base.g += (event.gamma - base.g) * 0.02;
    tx = clamp((event.gamma - base.g) * 0.9);
    ty = clamp((base.b - event.beta) * 0.9);
    kick();
  };

  // A mouse tilts towards the pointer; a finger (without the gyro) tilts by how far it's dragged.
  let held: { x: number; y: number } | null = null;
  const down = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' || gyro) return;
    held = { x: event.clientX, y: event.clientY };
    node.setPointerCapture?.(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') {
      const box = node.getBoundingClientRect();
      tx = clamp(((event.clientX - box.left) / box.width - 0.5) * 2 * MAX);
      ty = clamp((0.5 - (event.clientY - box.top) / box.height) * 2 * MAX);
      kick();
    } else if (held) {
      tx = clamp((event.clientX - held.x) * 0.25);
      ty = clamp(-(event.clientY - held.y) * 0.25);
      kick();
    }
  };
  const leave = () => {
    held = null;
    tx = 0;
    ty = 0;
    kick();
  };

  let gone = false;
  if (touch.matches) {
    void allowed.then((ok) => {
      if (ok && !gone) addEventListener('deviceorientation', orient);
    });
  }
  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', leave);
  node.addEventListener('pointercancel', leave);
  node.addEventListener('pointerleave', (event) => event.pointerType === 'mouse' && leave());

  return {
    destroy() {
      gone = true;
      cancelAnimationFrame(frame);
      removeEventListener('deviceorientation', orient);
    },
  };
}
