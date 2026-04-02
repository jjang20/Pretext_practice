import { prepareText } from './textLayout.js';
import { layoutNextLine } from './lib/pretext/layout.js';
import { processFrame } from './chromaKey.js';

// ─── Content ─────────────────────────────────────────────────────────────────
const TEXT = `Chainsaw Man is not a story about heroes — it is a story about hunger. Denji does not fight for justice, for the world, or even for himself. He fights because fighting is the only way he knows to keep the warmth of a body close to his. He grew up in a world that defined him entirely by what he owed, and when debt is the first language you learn, you never quite shake the grammar of it. Everything becomes an exchange. Affection is borrowed. Dreams are repaid in blood.

Pochita understood this about him before anyone else did. A Chainsaw Devil who became a dog, who became a partner, who became a heart — literally — because he saw in Denji not power, not usefulness, but a kind of longing so enormous it had grown its own gravity. The most dangerous devils in this world are not the ones with the greatest strength. They are the ones made from the fears we refuse to name.

What does Reze want? What does anyone who has been shaped entirely by someone else's purpose want when they are finally alone? She dances the way people laugh at funerals — with a desperate sincerity that disarms you. There is something in her movement that says: I was given a role and I played it, but I also lived inside it, and now I cannot tell which parts were costume and which parts were skin.

The genius of this story is that it refuses to resolve that question. Nobody gets to cleanly separate who they were made to be from who they chose to become. The lines blur. The chainsaw revs. And in the noise, something almost like freedom.

Every character in this world is haunted by a devil that is, at its core, a reflection of something human — fear of death, fear of control, fear of being forgotten. The Gun Devil is not just a weapon; it is mankind's capacity for industrialized violence made manifest. The Darkness Devil does not merely lurk in the absence of light; it embodies the ancient dread that something watches from where we cannot see.

Fujimoto draws hunger as a visual language. Denji's face in the first chapter — the rawness of it, the barely-human quality of someone who has eaten so little and wanted so much — is a kind of portrait of what pure need looks like when it walks upright. It is uncomfortable to look at directly. It is supposed to be.

And yet the story is also genuinely funny. Absurdly, painfully funny. Because that is what it is like to be alive at the intersection of terror and desire: you find yourself laughing at things you shouldn't, forming attachments that make no tactical sense, choosing softness in the middle of a war zone just because someone nearby seems to need it.

Chainsaw Man asks you to sit with the fact that people can be simultaneously the product of systems that destroy them and also the architects of their own small, determined acts of humanity. That contradiction is not resolved. It is inhabited. The chainsaw does not cut through to an answer. It cuts through to the next question. And somehow, that is enough to keep going.`.trim();

// ─── Constants ───────────────────────────────────────────────────────────────
const FONT_SIZE   = 17;
const LINE_HEIGHT = FONT_SIZE * 1.72;
const FONT        = `${FONT_SIZE}px Georgia, serif`;
const IS_MOBILE   = window.innerWidth < 640;
const PADDING     = IS_MOBILE ? 24 : 64;
const GAP         = 32;

// ─── State ───────────────────────────────────────────────────────────────────
const canvas = document.getElementById('main');
const ctx    = canvas.getContext('2d');
const reze   = document.getElementById('reze-video');

let scrollY       = 0;
let targetScrollY = 0;
let prepared      = null;

// ─── Character metrics (FIXED at centre of viewport) ────────────────────────
function getRezeMetrics(W, H) {
  const rezeH = Math.min(H * 0.85, 700);
  const rezeW = Math.floor(rezeH * 9 / 16);
  const rezeX = Math.floor(W / 2 - rezeW / 2);
  const rezeY = Math.floor((H - rezeH) / 2);
  return { rezeW, rezeH, rezeX, rezeY };
}

// ─── Live silhouette lookup ──────────────────────────────────────────────────
// Read the CURRENT frame's per-row content bounds to get the character's
// left/right pixel edges at a given screen Y.
function liveEdgesAtY(screenY, rezeX, rezeY, rezeW, rezeH, frame) {
  const relY = (screenY - rezeY) / rezeH;
  if (relY < 0 || relY >= 1) return null;

  // Map this text line to a band of native video rows
  const y0 = Math.max(0, Math.floor(relY * frame.vh));
  const y1 = Math.min(frame.vh - 1,
    Math.ceil((relY + LINE_HEIGHT / rezeH) * frame.vh));

  let minL = frame.vw, maxR = 0;
  for (let y = y0; y <= y1; y++) {
    if (frame.rowLeft[y]  < minL) minL = frame.rowLeft[y];
    if (frame.rowRight[y] > maxR) maxR = frame.rowRight[y];
  }
  if (minL >= maxR) return null;

  return {
    left:  rezeX + (minL / frame.vw) * rezeW - GAP,
    right: rezeX + (maxR / frame.vw) * rezeW + GAP,
  };
}

// ─── Resize ──────────────────────────────────────────────────────────────────
function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx.font      = FONT;
  prepared      = prepareText(TEXT, FONT);
}

// ─── Scroll ──────────────────────────────────────────────────────────────────
window.addEventListener('wheel', e => {
  targetScrollY = Math.max(0, targetScrollY + e.deltaY);
}, { passive: true });

let touchStartY = 0;
window.addEventListener('touchstart', e => {
  touchStartY = e.touches[0].clientY;
}, { passive: true });

window.addEventListener('touchmove', e => {
  const dy = touchStartY - e.touches[0].clientY;
  touchStartY = e.touches[0].clientY;
  targetScrollY = Math.max(0, targetScrollY + dy);
}, { passive: true });

// ─── Render ──────────────────────────────────────────────────────────────────
function render() {
  requestAnimationFrame(render);
  if (!prepared) return;

  if (reze.paused) reze.play().catch(() => {});

  scrollY += (targetScrollY - scrollY) * 0.11;

  const W = canvas.width;
  const H = canvas.height;

  // ── Background ──
  ctx.fillStyle = '#f5f0e8';
  ctx.fillRect(0, 0, W, H);

  // ── Fixed character position ──
  const { rezeW, rezeH, rezeX, rezeY } = getRezeMetrics(W, H);

  // ── Process current video frame (colorkey + live silhouette) ──
  const frame = processFrame(reze);

  // ── Title ──
  const titleBlockH = 28 + 20 + 32;
  const titleY      = PADDING - scrollY;
  const textOriginY = titleY + titleBlockH;

  // ── Layout + draw text in one pass ──
  const fullWidth = W - PADDING * 2;
  let cursor  = { segmentIndex: 0, graphemeIndex: 0 };
  let lineIdx = 0;

  ctx.font         = FONT;
  ctx.fillStyle    = '#2a2420';
  ctx.textBaseline = 'top';

  while (true) {
    const lineY = textOriginY + lineIdx * LINE_HEIGHT;
    const visible = lineY > -LINE_HEIGHT && lineY < H + LINE_HEIGHT;

    // Check overlap with character silhouette (use live data if available)
    const edges = frame
      ? liveEdgesAtY(lineY + LINE_HEIGHT * 0.5, rezeX, rezeY, rezeW, rezeH, frame)
      : null;

    if (edges) {
      const leftWidth  = Math.max(0, edges.left - PADDING);
      const rightStart = edges.right;
      const rightWidth = Math.max(0, W - PADDING - rightStart);

      let nextCursor = cursor;

      if (leftWidth > 40) {
        const seg = layoutNextLine(prepared, cursor, leftWidth);
        if (!seg) break;
        if (visible) ctx.fillText(seg.text, PADDING, lineY);
        nextCursor = seg.end;
      }
      if (rightWidth > 40) {
        const seg = layoutNextLine(prepared, nextCursor, rightWidth);
        if (seg) {
          if (visible) ctx.fillText(seg.text, rightStart, lineY);
          nextCursor = seg.end;
        }
      }
      cursor = nextCursor;
    } else {
      const seg = layoutNextLine(prepared, cursor, fullWidth);
      if (!seg) break;
      if (visible) ctx.fillText(seg.text, PADDING, lineY);
      cursor = seg.end;
    }

    lineIdx++;
    if (lineIdx > 3000) break;
  }

  // ── Clamp scroll ──
  const contentH  = PADDING + titleBlockH + lineIdx * LINE_HEIGHT + PADDING;
  const maxScroll = Math.max(0, contentH - H);
  if (targetScrollY > maxScroll) targetScrollY = maxScroll;

  // ── Draw the colour-keyed character on top ──
  if (frame) {
    ctx.drawImage(frame.canvas, rezeX, rezeY, rezeW, rezeH);
  }

  // ── Title (on top of text, under Reze if overlapping) ──
  ctx.fillStyle    = '#1a1a12';
  ctx.font         = 'bold 28px Georgia, serif';
  ctx.textBaseline = 'top';
  ctx.fillText('Chainsaw Man', PADDING, titleY);
  ctx.fillStyle    = '#7a6e64';
  ctx.font         = 'italic 15px Georgia, serif';
  ctx.fillText('On Hunger, Devils, and the Shape of Freedom', PADDING, titleY + 28 + 8);

  // ── Scroll bar ──
  if (contentH > H) {
    const barH = Math.max(36, H * H / contentH);
    const barY = (scrollY / maxScroll) * (H - barH);
    ctx.fillStyle = 'rgba(180,165,145,0.25)';
    ctx.fillRect(W - 5, 0, 5, H);
    ctx.fillStyle = 'rgba(130,110,90,0.55)';
    ctx.fillRect(W - 5, barY, 5, barH);
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
reze.addEventListener('canplay', () => reze.play().catch(() => {}));

// Seamless loop: seek back to 0 just before the video ends to avoid the
// pause/flash gap that the native `loop` attribute causes on mobile browsers.
reze.addEventListener('timeupdate', () => {
  if (reze.duration && reze.currentTime > reze.duration - 0.3) {
    reze.currentTime = 0;
  }
});
// Fallback in case timeupdate misses the window
reze.addEventListener('ended', () => {
  reze.currentTime = 0;
  reze.play().catch(() => {});
});

reze.play().catch(() => {});

window.addEventListener('resize', resize);
resize();
render();
