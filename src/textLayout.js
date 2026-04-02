import { prepareWithSegments, layoutWithLines } from '../node_modules/@chenglou/pretext/dist/layout.js';

let _prepared = null;
let _lastText = '';
let _lastFont = '';

/**
 * Prepare text for layout (caches the result — call once per text+font combo).
 * Uses prepareWithSegments so layoutWithLines can materialise line text.
 */
export function prepareText(text, font) {
  if (text !== _lastText || font !== _lastFont) {
    _prepared = prepareWithSegments(text, font);
    _lastText = text;
    _lastFont = font;
  }
  return _prepared;
}

/**
 * Get line-broken layout for the given width and line height.
 * Returns array of { text, width } objects.
 */
export function getLines(prepared, maxWidth, lineHeight) {
  const result = layoutWithLines(prepared, maxWidth, lineHeight);
  return result.lines;
}

/**
 * Draw lines onto a canvas context.
 */
export function drawText(ctx, lines, x, y, lineHeight, color = '#1a1a1a') {
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    ctx.fillText(line.text, x, y + i * lineHeight);
  });
}
