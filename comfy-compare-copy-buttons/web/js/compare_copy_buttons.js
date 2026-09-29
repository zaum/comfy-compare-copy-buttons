/**
 * Compare Images: hover copy-to-clipboard button riding the divider line.
 *
 * Enhances the built-in "Compare Images" (ImageCompare) node in place.
 * When the mouse is over the TOP part of the compare view, a single button
 * sits on the divider line (top edge, centered on the slider position) and
 * moves together with it, so it is easy to click. It always copies the
 * currently dominant side: image A (before) while the before image covers
 * the larger area (slider above 50% + dead zone), image B (after) otherwise.
 *
 * Dead zones (the button stays hidden there, so a click can never be
 * ambiguous):
 * - vertical: only the top strip of the view is sensitive, dragging the
 *   slider in the middle of the node never shows the button;
 * - horizontal: while the slider is inside a narrow centered band
 *   (CENTER_DEAD_ZONE_WIDTH, around 50%) neither side clearly dominates,
 *   so the button hides instead of guessing.
 *
 * - Look: the button reuses the same dark pill style as the hover buttons on
 *   the Load Image / Preview Image node, with a "copy" glyph (the action of
 *   the "Copy Image" right-click menu entry).
 * - Hovering the button freezes the slider underneath (its pointer/mouse
 *   events never reach the compare logic), so the button does not slip away
 *   from under the cursor before the click.
 * - Clicking the button copies the dominant side's currently displayed image
 *   (batch-aware: the image actually visible on that side) to the OS
 *   clipboard, using the same fetch + ClipboardItem logic (with PNG fallback)
 *   as the core "Copy Image" context menu entry.
 * - Info line: a small caption under the compare view lists the pixel size of
 *   each side ("image_a 1024x1024") plus whether that image really contains
 *   transparent pixels ("alpha: yes"). Both come from the already loaded
 *   <img> elements, so no extra image download is needed.
 */

import { app } from "../../../scripts/app.js";

const EXTENSION_NAME = "ComfyCompare.CopyButtons";

// Test id rendered by the core WidgetImageCompare.vue component.
const VIEWPORT_SELECTOR = '[data-testid="image-compare-viewport"]';

// The button only appears while the mouse is inside this top strip,
// so slider drags in the middle of the node never trigger it.
const TOP_ZONE_RATIO = 0.34;
const TOP_ZONE_MIN_PX = 56;

// Horizontal dead zone around the center, in slider percent points.
// While the divider is inside 50% +/- this half-width, neither side
// clearly dominates, so the button hides instead of guessing.
const CENTER_DEAD_ZONE_WIDTH = 12;

// How far the button may ride past the 0%/100% slider stops while staying
// fully inside the view. Because the button is centered on the divider
// (translateX(-50%)), it would hang off-screen at the extremes; the CSS
// clamp() below keeps it fully visible instead of hiding it.
const BUTTON_EDGE_MARGIN_PX = 24;

// Same look as the hover buttons of the image preview
// (see ImagePreview.vue `actionButtonClass`).
const ACTION_BUTTON_CLASS =
  "flex h-8 min-h-8 cursor-pointer items-center justify-center rounded-lg border-0 " +
  "bg-base-foreground p-2 text-base-background shadow-interface transition-colors " +
  "duration-200 hover:bg-base-foreground/90 focus-visible:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-base-foreground focus-visible:ring-offset-2";

// The transparency probe reads its pixels from a downscaled canvas copy with
// at most this long edge. A smaller copy keeps large images from stalling the
// UI, and it stays exact for the question being asked: the browser averages
// the source pixels while scaling, so an image without transparency still
// probes fully opaque, while any transparent area survives as a partial alpha.
const ALPHA_PROBE_MAX_PX = 512;

const ICON_COPY = '<i class="icon-[lucide--copy] size-4" aria-hidden="true"></i>';
const ICON_OK =
  '<i class="icon-[lucide--check] size-4" aria-hidden="true"></i>';
const ICON_FAIL = '<i class="icon-[lucide--x] size-4" aria-hidden="true"></i>';

const STYLE_ID = "compare-copy-buttons-style";

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    ${VIEWPORT_SELECTOR} .cc-copy-btn {
      position: absolute;
      top: 8px;
      /* Ride the divider line (left is set from JS in %). The translateX
         centers the button on the line; clamp() keeps the whole button
         inside the view at the extreme left/right slider positions instead
         of letting it hang off-screen. */
      left: clamp(
        ${BUTTON_EDGE_MARGIN_PX}px,
        var(--cc-divider-x, 50%),
        calc(100% - ${BUTTON_EDGE_MARGIN_PX}px)
      );
      z-index: 20;
      opacity: 0;
      pointer-events: none;
      transform: translate(-50%, -4px);
      transition: opacity 150ms ease, transform 150ms ease;
    }
    ${VIEWPORT_SELECTOR} .cc-copy-btn.cc-visible {
      opacity: 1;
      pointer-events: auto;
      transform: translate(-50%, 0);
    }

    /* Info line, rendered as a sibling right below the compare view.
       Font size and horizontal padding match the batch navigation bar at the
       top of the same widget (text-xs, px-2), so the two lines read as one. */
    .cc-image-info {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-shrink: 0;
      padding: 2px 8px 0;
      font-size: var(--text-xs, 0.75rem);
      line-height: var(--tw-leading, var(--text-xs--line-height, 1rem));
      color: var(--color-muted-foreground, #8a8a8a);
      pointer-events: none;
      user-select: none;
    }
    .cc-image-info[hidden] {
      display: none;
    }
    .cc-image-info-side {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Return the currently displayed { before, after } <img> elements.
 * The core template renders the after image first and the before image
 * second; alt texts are honoured when present, DOM order otherwise.
 */
function getCompareImages(viewport) {
  const imgs = Array.from(viewport.querySelectorAll("img")).filter(
    (img) => img.src
  );
  if (imgs.length === 0) return { before: null, after: null };
  if (imgs.length === 1) {
    const alt = imgs[0].getAttribute("alt") || "";
    if (/after/i.test(alt)) return { before: null, after: imgs[0] };
    return { before: imgs[0], after: null };
  }
  const [first, second] = imgs;
  const firstAlt = first.getAttribute("alt") || "";
  const secondAlt = second.getAttribute("alt") || "";
  if (/before/i.test(firstAlt) && /after/i.test(secondAlt)) {
    return { before: first, after: second };
  }
  if (/before/i.test(secondAlt) && /after/i.test(firstAlt)) {
    return { before: second, after: first };
  }
  // Default template order: after (background) first, before (overlay) second.
  return { before: second, after: first };
}

/** Current slider position in percent (0..100), or null without a slider. */
function getSliderPercent(viewport) {
  const handle = viewport.querySelector('[role="presentation"]');
  if (!handle) return null;
  const value = parseFloat(handle.style.left);
  if (!Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, value));
}

/**
 * Does this image really contain transparent pixels?
 * Returns true/false, or null when it cannot be told (not decoded yet, no
 * canvas, or a cross-origin image whose canvas stays tainted).
 * The answer is cached on the element, because the viewport mutation observer
 * asks again on every slider move.
 */
function probeTransparency(img) {
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!width || !height) return null;

  const cached = img._ccProbe;
  if (cached && cached.width === width && cached.height === height) {
    return cached.alpha;
  }

  let alpha = null;
  try {
    const scale = Math.min(1, ALPHA_PROBE_MAX_PX / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // Throws on a tainted canvas, which is what a cross-origin image gives.
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      alpha = false;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 255) {
          alpha = true;
          break;
        }
      }
    }
  } catch (error) {
    alpha = null;
  }

  img._ccProbe = { width, height, alpha };
  return alpha;
}

/** Caption text for one side, or null while its image is not decoded yet. */
function describeImageSide(img, label) {
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!width || !height) return null;

  const alpha = probeTransparency(img);
  const alphaLabel = alpha === null ? "unknown" : alpha ? "yes" : "no";
  return {
    text: `${label} ${width}×${height} · alpha: ${alphaLabel}`,
    title:
      alpha === null
        ? `${label}: ${width}×${height}, transparency could not be read`
        : alpha
          ? `${label}: ${width}×${height}, contains transparent pixels`
          : `${label}: ${width}×${height}, fully opaque (no transparent pixels)`,
  };
}

function createImageInfo() {
  const info = document.createElement("div");
  info.className = "cc-image-info";
  info.hidden = true;
  return info;
}

/**
 * Put the info line right below the compare view. Vue recreates the viewport
 * element when the node switches between the empty state and the compare
 * view, so a label left over from a previous viewport is removed first.
 */
function mountImageInfo(viewport, info) {
  const parent = viewport.parentElement;
  if (!parent) return;
  for (const stale of parent.querySelectorAll(":scope > .cc-image-info")) {
    stale.remove();
  }
  parent.insertBefore(info, viewport.nextSibling);
}

function updateImageInfo(viewport, state) {
  const info = state.info;
  if (!info) return;

  const { before, after } = getCompareImages(viewport);
  // Named after the node's own inputs, so the caption matches the labels on
  // the node body (image_a = before, image_b = after).
  const sides = [
    before ? describeImageSide(before, "image_a") : null,
    after ? describeImageSide(after, "image_b") : null,
  ].filter(Boolean);

  info.hidden = sides.length === 0;
  // The mutation observer runs on every divider move, so only touch the DOM
  // when the caption actually changed.
  const signature = sides.map((side) => side.text).join("|");
  if (info._ccSignature === signature) return;
  info._ccSignature = signature;
  info.replaceChildren(
    ...sides.map((side) => {
      const span = document.createElement("span");
      span.className = "cc-image-info-side";
      span.title = side.title;
      span.textContent = side.text;
      return span;
    })
  );
}

async function fetchImageBlob(url) {
  const absolute = new URL(url, window.location.href);
  // Same as the core "Copy Image" entry: drop the lightweight preview
  // request so the full-resolution image is copied.
  absolute.searchParams.delete("preview");
  const response = await fetch(absolute.toString());
  if (!response.ok) {
    throw new Error(`Image download failed: ${response.status}`);
  }
  return await response.blob();
}

/** Canvas re-encode fallback: some browsers only accept PNG on write. */
async function reencodeAsPngBlob(blob, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width || 0);
  canvas.height = Math.max(1, height || 0);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  let image;
  if (typeof window.createImageBitmap === "undefined") {
    image = await new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Image load failed"));
      };
      img.src = objectUrl;
    });
  } else {
    image = await createImageBitmap(blob);
  }

  try {
    ctx.drawImage(image, 0, 0);
  } finally {
    if (image && typeof image.close === "function") image.close();
  }

  return await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("PNG conversion failed"));
    }, "image/png");
  });
}

async function writeBlobToClipboard(blob, naturalWidth, naturalHeight) {
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ [blob.type]: blob }),
    ]);
  } catch (error) {
    // Chrome only supports PNG on write: convert and try again.
    if (blob.type !== "image/png") {
      const pngBlob = await reencodeAsPngBlob(
        blob,
        naturalWidth,
        naturalHeight
      );
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": pngBlob }),
      ]);
      return;
    }
    throw error;
  }
}

function flash(button, ok) {
  const original = button.innerHTML;
  const originalTitle = button.title;
  button.innerHTML = ok ? ICON_OK : ICON_FAIL;
  button.title = ok ? "Copied to clipboard" : "Copy failed";
  window.setTimeout(() => {
    button.innerHTML = original;
    button.title = originalTitle;
  }, 1200);
}

async function handleCopyClick(button) {
  const viewport = button._ccViewport;
  if (!viewport || !viewport.isConnected) return;
  const { before, after } = getCompareImages(viewport);
  const side = button._ccSide === "right" ? "right" : "left";
  const img = side === "left" ? before : after;
  if (!img || !img.src) {
    flash(button, false);
    return;
  }
  if (typeof window.ClipboardItem === "undefined") {
    flash(button, false);
    return;
  }
  button.disabled = true;
  try {
    const blob = await fetchImageBlob(img.currentSrc || img.src);
    await writeBlobToClipboard(blob, img.naturalWidth, img.naturalHeight);
    flash(button, true);
  } catch (error) {
    console.error("[CompareCopy] copy to clipboard failed:", error);
    flash(button, false);
  } finally {
    button.disabled = false;
  }
}

function createCopyButton(viewport) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `${ACTION_BUTTON_CLASS} cc-copy-btn`;
  button._ccSide = "left";
  applySideLabel(button);
  button.innerHTML = ICON_COPY;
  button._ccViewport = viewport;
  // The compare slider follows the mouse anywhere over the view: stop the
  // button's own events from reaching the slider logic, so hovering the
  // button freezes the divider underneath and the button cannot slip away
  // from under the cursor before the click.
  for (const type of [
    "pointerdown",
    "pointermove",
    "pointerenter",
    "mousedown",
    "mousemove",
    "mouseenter",
    "mouseover",
    "mouseup",
    "click",
    "dblclick",
  ]) {
    button.addEventListener(type, (event) => event.stopPropagation());
  }
  button.addEventListener("click", (event) => {
    event.preventDefault();
    void handleCopyClick(button);
  });
  return button;
}

function applySideLabel(button) {
  const label =
    button._ccSide === "right" ? "Copy image_b" : "Copy image_a";
  button.title = label;
  button.setAttribute("aria-label", label);
}

/**
 * Decide which side the divider button currently belongs to, or null while
 * it must stay hidden (center dead zone).
 */
function resolveDividerSide(viewport, hasBefore, hasAfter) {
  if (hasBefore && !hasAfter) return "left";
  if (hasAfter && !hasBefore) return "right";
  const slider = getSliderPercent(viewport);
  if (slider === null) return "left";
  if (slider > 50 + CENTER_DEAD_ZONE_WIDTH / 2) return "left";
  if (slider < 50 - CENTER_DEAD_ZONE_WIDTH / 2) return "right";
  return null;
}

/** Keep the button centered on the divider line; the CSS clamp() keeps it
 * fully inside the view at the extreme left/right slider positions. */
function positionButtonOnDivider(viewport, button, slider) {
  const percent = slider === null ? 50 : slider;
  viewport.style.setProperty("--cc-divider-x", `${percent}%`);
}

function setVisible(button, visible) {
  button.classList.toggle("cc-visible", visible);
}

function updateButton(viewport, state, clientY) {
  const rect = viewport.getBoundingClientRect();
  const topZone = Math.max(TOP_ZONE_MIN_PX, rect.height * TOP_ZONE_RATIO);
  const inTop = clientY >= rect.top && clientY <= rect.top + topZone;

  const { before, after } = getCompareImages(viewport);
  const hasBefore = !!before;
  const hasAfter = !!after;

  if (!inTop || (!hasBefore && !hasAfter)) {
    setVisible(state.button, false);
    return;
  }

  const side = resolveDividerSide(viewport, hasBefore, hasAfter);
  if (side === null || (side === "left" && !hasBefore) || (side === "right" && !hasAfter)) {
    setVisible(state.button, false);
    return;
  }

  state.button._ccSide = side;
  applySideLabel(state.button);
  positionButtonOnDivider(viewport, state.button, getSliderPercent(viewport));
  setVisible(state.button, true);
}

function enhanceViewport(viewport) {
  if (viewport.dataset.ccCopyEnhanced === "1") {
    return viewport._ccState || null;
  }
  viewport.dataset.ccCopyEnhanced = "1";

  ensureStyle();

  const state = {
    button: createCopyButton(viewport),
    info: createImageInfo(),
    lastClientY: null,
  };
  viewport.appendChild(state.button);
  mountImageInfo(viewport, state.info);
  viewport._ccState = state;
  updateImageInfo(viewport, state);

  // An <img> fires "load" without bubbling, so listen in the capture phase:
  // natural size and pixels only become readable once it finished decoding.
  viewport.addEventListener(
    "load",
    () => {
      updateImageInfo(viewport, state);
    },
    true
  );

  viewport.addEventListener("pointermove", (event) => {
    state.lastClientY = event.clientY;
    updateButton(viewport, state, event.clientY);
  });
  viewport.addEventListener("pointerleave", () => {
    setVisible(state.button, false);
  });
  // Keep the button in sync when images/slider change without mouse input
  // (batch navigation, new execution, slider drag): follow the divider and
  // hide inside the dead zone or when the dominant side has no image.
  const domObserver = new MutationObserver(() => {
    updateImageInfo(viewport, state);
    const lastY = state.lastClientY;
    if (typeof lastY === "number") {
      updateButton(viewport, state, lastY);
      return;
    }
    const { before, after } = getCompareImages(viewport);
    const side = resolveDividerSide(viewport, !!before, !!after);
    if (side === null) {
      setVisible(state.button, false);
      return;
    }
    state.button._ccSide = side;
    applySideLabel(state.button);
    positionButtonOnDivider(viewport, state.button, getSliderPercent(viewport));
  });
  domObserver.observe(viewport, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "style"],
  });

  return state;
}

function scanForViewports() {
  document.querySelectorAll(VIEWPORT_SELECTOR).forEach(enhanceViewport);
}

app.registerExtension({
  name: EXTENSION_NAME,
  async setup() {
    if (typeof window.ClipboardItem === "undefined") {
      // Only the copy button needs this API; the info line still works, and
      // handleCopyClick() bails out on its own.
      console.warn(
        "[CompareCopy] ClipboardItem API is not available, copy buttons are disabled."
      );
    }
    ensureStyle();
    scanForViewports();
    const observer = new MutationObserver(scanForViewports);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  },
});
