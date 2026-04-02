// Real-time chroma key + silhouette extraction for the Reze video.
// Removes grey background RGB(201, 202, 195) and returns per-row content bounds
// so text can wrap around the character's CURRENT pose every frame.

const KEY_R = 201, KEY_G = 202, KEY_B = 195;
const THRESHOLD    = 28;
const BLEND        = 14;
const THRESHOLD_SQ = THRESHOLD * THRESHOLD;
const OUTER_SQ     = (THRESHOLD + BLEND) * (THRESHOLD + BLEND);

// Reuse the same OffscreenCanvas across frames
let _off = null;
let _offCtx = null;
let _lastW = 0, _lastH = 0;

/**
 * Process the current video frame:
 *   1. Apply chroma key (grey background → transparent)
 *   2. Extract per-row left/right content bounds (the live silhouette)
 *
 * Returns { canvas, rowLeft, rowRight, vw, vh } or null if video not ready.
 *   - canvas:   OffscreenCanvas with the keyed frame (native resolution)
 *   - rowLeft:  Int32Array[vh] — leftmost opaque pixel per row (vw if empty)
 *   - rowRight: Int32Array[vh] — rightmost opaque pixel per row (0 if empty)
 *   - vw, vh:   native video dimensions
 */
export function processFrame(videoEl) {
  if (videoEl.readyState < 2) return null;

  const vw = videoEl.videoWidth;
  const vh = videoEl.videoHeight;

  // (Re)create offscreen canvas if size changed
  if (!_off || _lastW !== vw || _lastH !== vh) {
    _off    = new OffscreenCanvas(vw, vh);
    _offCtx = _off.getContext('2d', { willReadFrequently: true });
    _lastW  = vw;
    _lastH  = vh;
  }

  _offCtx.drawImage(videoEl, 0, 0, vw, vh);
  const imageData = _offCtx.getImageData(0, 0, vw, vh);
  const d = imageData.data;

  // Per-row content bounds
  const rowLeft  = new Int32Array(vh).fill(vw);
  const rowRight = new Int32Array(vh).fill(0);

  let px = 0, py = 0;

  for (let i = 0; i < d.length; i += 4) {
    const dr  = d[i]     - KEY_R;
    const dg  = d[i + 1] - KEY_G;
    const db  = d[i + 2] - KEY_B;
    const dSq = dr * dr + dg * dg + db * db;

    if (dSq < THRESHOLD_SQ) {
      d[i + 3] = 0;
    } else if (dSq < OUTER_SQ) {
      const dist = Math.sqrt(dSq);
      d[i + 3] = Math.round(((dist - THRESHOLD) / BLEND) * d[i + 3]);
    }

    // Track silhouette (only for pixels that remain opaque)
    if (d[i + 3] > 20) {
      if (px < rowLeft[py])  rowLeft[py]  = px;
      if (px > rowRight[py]) rowRight[py] = px;
    }

    px++;
    if (px >= vw) { px = 0; py++; }
  }

  _offCtx.putImageData(imageData, 0, 0);

  return { canvas: _off, rowLeft, rowRight, vw, vh };
}
