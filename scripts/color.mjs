// Color math for the theme templates (templates/*.tmpl.css).
//
// The templates call five functions of the `color` npm package (0.x API):
//   Color(hex).darken(ratio)   lower HSL lightness by `ratio` of itself
//   .saturate(ratio)           raise HSL saturation by `ratio` of itself
//   .clearer(ratio)            lower alpha by `ratio` of itself
//   .hexString()               "#RRGGBB"
//   .rgbString()               "rgb(r, g, b)" or "rgba(r, g, b, a)"
//
// The original Grunt build compiled the themes with color@0.4.4 and its
// conversion library color-convert@0.2.1 (both MIT, by Heather Arthur; versions
// from the yarn.lock at commit 512b601). This file reimplements just those five
// functions, including their rounding and clamping, so the build needs no
// dependency. With it, `npm run build` reproduces all 150 committed theme files
// byte-for-byte.
//
// Adapted from color@0.4.4 (rgbToHsl/hslToRgb from color-convert@0.2.1):
//
//   Copyright (c) 2012 Heather Arthur
//
//   Permission is hereby granted, free of charge, to any person obtaining
//   a copy of this software and associated documentation files (the
//   "Software"), to deal in the Software without restriction, including
//   without limitation the rights to use, copy, modify, merge, publish,
//   distribute, sublicense, and/or sell copies of the Software, and to
//   permit persons to whom the Software is furnished to do so, subject to
//   the following conditions:
//
//   The above copyright notice and this permission notice shall be
//   included in all copies or substantial portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
//   EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
//   MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
//   NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
//   LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
//   OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
//   WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

const round = (values) => values.map(Math.round);
const clamp = (value, max) => Math.max(0, Math.min(max, value));

// [r, g, b] (0-255) -> [h (0-360), s (0-100), l (0-100)], unrounded.
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const min = Math.min(r, g, b), max = Math.max(r, g, b), delta = max - min;
  let h = 0, s = 0;
  if (max !== min) {
    if (r === max) h = (g - b) / delta;
    else if (g === max) h = 2 + (b - r) / delta;
    else h = 4 + (r - g) / delta;
  }
  h = Math.min(h * 60, 360);
  if (h < 0) h += 360;
  const l = (min + max) / 2;
  if (max !== min) s = l <= 0.5 ? delta / (max + min) : delta / (2 - max - min);
  return [h, s * 100, l * 100];
}

// [h, s, l] -> [r, g, b], unrounded. Like the original, it accepts out-of-range
// s/l (e.g. after saturate pushes s past 100); the caller clamps the result.
function hslToRgb([h, s, l]) {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const t2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const t1 = 2 * l - t2;
  return [0, 1, 2].map((i) => {
    let t3 = h + (1 / 3) * -(i - 1);
    if (t3 < 0) t3++;
    if (t3 > 1) t3--;
    let val;
    if (6 * t3 < 1) val = t1 + (t2 - t1) * 6 * t3;
    else if (2 * t3 < 1) val = t2;
    else if (3 * t3 < 2) val = t1 + (t2 - t1) * (2 / 3 - t3) * 6;
    else val = t1;
    return val * 255;
  });
}

// Color("#29d") or Color("#2299dd"); no argument means black, as in the original.
// Only hex is supported (all the templates need); anything else is an error
// rather than "NaN" quietly written into 10 theme files.
export function Color(hex = '#000') {
  if (!/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) throw new Error(`Color(): expected a hex color, got ${JSON.stringify(hex)}`);
  let digits = String(hex).replace(/^#/, '');
  if (digits.length === 3) digits = digits.replace(/./g, '$&$&');
  const rgb = [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16));
  let hsl = round(rgbToHsl(rgb));
  let alpha = 1;
  let current = rgb;
  // Like the original: RGB is derived from the unclamped HSL values; both are then clamped and rounded.
  const setHsl = (values) => {
    current = round(hslToRgb(values).map((v) => clamp(v, 255)));
    hsl = round(values.map((v, i) => clamp(v, i === 0 ? 360 : 100)));
  };
  return {
    darken(ratio) { setHsl([hsl[0], hsl[1], hsl[2] - hsl[2] * ratio]); return this; },
    saturate(ratio) { setHsl([hsl[0], hsl[1] + hsl[1] * ratio, hsl[2]]); return this; },
    clearer(ratio) { alpha = clamp(alpha - alpha * ratio, 1); return this; },
    hexString() { return '#' + current.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase(); },
    rgbString() { return alpha < 1 ? `rgba(${current.join(', ')}, ${alpha})` : `rgb(${current.join(', ')})`; },
  };
}
