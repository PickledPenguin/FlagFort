import { BALANCE } from "./config";
import type { Vec2 } from "./types";

export class Input {
  readonly keys = new Set<string>();
  mouse: Vec2 = { x: BALANCE.logicalWidth / 2, y: BALANCE.logicalHeight / 2 };
  mouseDown = false;
  pressed = false;
  escapePressed = false;
  numberPressed = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (event) => {
      this.keys.add(event.code);
      if (event.code === "Escape") this.escapePressed = true;
      if (/^Digit[1-8]$/.test(event.code)) this.numberPressed = Number(event.code.slice(-1));
    });
    window.addEventListener("keyup", (event) => this.keys.delete(event.code));
    canvas.addEventListener("pointermove", (event) => this.updatePointer(event));
    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      this.updatePointer(event);
      this.mouseDown = true;
      this.pressed = true;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointerup", (event) => {
      if (event.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener("pointercancel", () => {
      this.mouseDown = false;
    });
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  releasePointer(): void {
    this.mouseDown = false;
    this.pressed = false;
  }

  private updatePointer(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = (event.clientX - rect.left) * (BALANCE.logicalWidth / rect.width);
    this.mouse.y = (event.clientY - rect.top) * (BALANCE.logicalHeight / rect.height);
  }

  endFrame(): void {
    this.pressed = false;
    this.escapePressed = false;
    this.numberPressed = 0;
  }
}
