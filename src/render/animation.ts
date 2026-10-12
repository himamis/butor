/**
 * Animated view values (door/drawer opening per motion id, explode amount), outside React.
 * The renderer calls step(dt) on each frame and keeps requesting frames while it returns true.
 */
const OPEN_RATE = 7; // exponential damping rates (1/s)
const EXPLODE_RATE = 5;
const MAX_DT = 1 / 30; // the first frame after idle can have a huge delta (v1 lesson)
const EPS = 1e-3;

const damp = (x: number, target: number, rate: number, dt: number) => target + (x - target) * Math.exp(-rate * dt);

export class Animation {
  private openTarget = new Map<string, number>();
  private openNow = new Map<string, number>();
  private explodeTarget = 0;
  private explodeNow = 0;

  setOpen(motionId: string, open: boolean) {
    this.openTarget.set(motionId, open ? 1 : 0);
  }

  setExplode(amount: number) {
    this.explodeTarget = amount;
  }

  open(motionId: string): number {
    return this.openNow.get(motionId) ?? 0;
  }

  explode(): number {
    return this.explodeNow;
  }

  active(): boolean {
    if (Math.abs(this.explodeNow - this.explodeTarget) > 0) return true;
    for (const [id, target] of this.openTarget) if ((this.openNow.get(id) ?? 0) !== target) return true;
    return false;
  }

  /** Advances all values; returns true while anything is still moving. */
  step(delta: number): boolean {
    const dt = Math.min(delta, MAX_DT);
    for (const [id, target] of this.openTarget) {
      const now = this.openNow.get(id) ?? 0;
      if (now === target) continue;
      const next = damp(now, target, OPEN_RATE, dt);
      this.openNow.set(id, Math.abs(next - target) < EPS ? target : next);
    }
    if (this.explodeNow !== this.explodeTarget) {
      const next = damp(this.explodeNow, this.explodeTarget, EXPLODE_RATE, dt);
      this.explodeNow = Math.abs(next - this.explodeTarget) < EPS ? this.explodeTarget : next;
    }
    return this.active();
  }

  /** Jumps straight to the targets. */
  jump() {
    for (const [id, target] of this.openTarget) this.openNow.set(id, target);
    this.explodeNow = this.explodeTarget;
  }
}
