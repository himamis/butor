type Capture = () => string | undefined;
let capture: Capture | null = null;

/** The viewport registers how to take a small picture of the design for the start screen. */
export function registerThumbnail(c: Capture | null) {
  capture = c;
}

export function takeThumbnail(): string | undefined {
  try {
    return capture?.();
  } catch {
    return undefined;
  }
}
