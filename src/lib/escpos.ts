// A tiny ESC/POS command builder for thermal receipt printers. Pure and
// dependency-free (produces a byte array), so it can be unit tested without
// hardware. Text is encoded as Latin-1 (one byte per char), which matches the
// default code page of common 58mm/80mm printers; characters above 0xFF fall
// back to '?'.

type Align = 'left' | 'center' | 'right';

export class EscPos {
  private bytes: number[] = [];

  raw(...b: number[]): this {
    this.bytes.push(...b);
    return this;
  }

  /** ESC @ : reset the printer to its power-on defaults. */
  init(): this {
    return this.raw(0x1b, 0x40);
  }

  /** ESC a n : text justification. */
  align(a: Align): this {
    return this.raw(0x1b, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0);
  }

  /** ESC E n : emphasis (bold). */
  bold(on: boolean): this {
    return this.raw(0x1b, 0x45, on ? 1 : 0);
  }

  /** GS ! n : double width + height when on, normal when off. */
  doubleSize(on: boolean): this {
    return this.raw(0x1d, 0x21, on ? 0x11 : 0x00);
  }

  /** Append text (no newline), Latin-1 encoded. */
  text(s: string): this {
    for (const ch of s) {
      const c = ch.charCodeAt(0);
      this.bytes.push(c > 0xff ? 0x3f : c);
    }
    return this;
  }

  /** Append text followed by a line feed. */
  line(s = ''): this {
    return this.text(s).raw(0x0a);
  }

  /** ESC d n : feed n blank lines. */
  feed(n = 1): this {
    return this.raw(0x1b, 0x64, n);
  }

  /** GS V 0 : full paper cut. */
  cut(): this {
    return this.raw(0x1d, 0x56, 0x00);
  }

  /** ESC p : pulse the cash drawer connected to the printer. */
  drawerKick(): this {
    return this.raw(0x1b, 0x70, 0x00, 0x19, 0xfa);
  }

  encode(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

/** A full-width divider line of `width` characters. */
export function divider(width: number, ch = '-'): string {
  return ch.repeat(Math.max(0, width));
}

/**
 * Lays out `left` and `right` on one line of `width` columns with the right text
 * flush right. If they cannot both fit, the left text is truncated so at least
 * one space separates them.
 */
export function twoCol(left: string, right: string, width: number): string {
  let l = left;
  if (l.length + right.length + 1 > width) {
    l = l.slice(0, Math.max(0, width - right.length - 1));
  }
  const gap = Math.max(1, width - l.length - right.length);
  return l + ' '.repeat(gap) + right;
}
