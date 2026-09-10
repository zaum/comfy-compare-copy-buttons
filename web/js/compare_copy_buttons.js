/**
 * Compare Images: hover copy-to-clipboard button for the active side.
 *
 * Enhances the built-in "Compare Images" (ImageCompare) node in place.
 * When the mouse is over the TOP part of the compare view, a single button
 * appears in the corner of the side that currently covers the larger area:
 * top-left (copies image A / before) while the before image dominates
 * (slider at/above 50%), top-right (copies image B / after) otherwise.
 * The inactive side never shows a button.
 *
 * - Look: the button reuses the same dark pill style as the hover buttons on
 *   the Load Image / Preview Image node, with a "copy" glyph (the action of
 *   the "Copy Image" right-click menu entry).
 * - The button is only sensitive in the top strip of the view, so dragging
 *   the compare slider left/right in the middle of the node never shows it.
 * - Clicking the button copies the active side's currently displayed image
 *   (batch-aware: the image actually visible on that side) to the OS
 *   clipboard, using the same fetch + ClipboardItem logic (with PNG fallback)
 *   as the core "Copy Image" context menu entry.
 */

import { app } from "../../../scripts/app.js";

const EXTENSION_NAME = "ComfyCompare.CopyButtons";

// Test id rendered by the core WidgetImageCompare.vue component.
const VIEWPORT_SELECTOR = '[data-testid="image-compare-viewport"]';

// The buttons only appear while the mouse is inside this top strip,
// so slider drags in the middle of the node never trigger them.
const TOP_ZONE_RATIO = 0.34;
const TOP_ZONE_MIN_PX = 56;

// Same look as the hover buttons of the image preview
// (see ImagePreview.vue `actionButtonClass`).
const ACTION_BUTTON_CLASS =
  "flex h-8 min-h-8 cursor-pointer items-center justify-center rounded-lg border-0 " +
  "bg-base-foreground p-2 text-base-background shadow-interface transition-colors " +
  "duration-200 hover:bg-base-foreground/90 focus-visible:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-base-foreground focus-visible:ring-offset-2";

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
      z-index: 20;
      opacity: 0;
      pointer-events: none;
      transform: translateY(-4px);
      transition: opacity 150ms ease, transform 150ms ease;
    }
    ${VIEWPORT_SELECTOR} .cc-copy-btn.cc-left { left: 8px; }
    ${VIEWPORT_SELECTOR} .cc-copy-btn.cc-right { right: 8px; }
    ${VIEWPORT_SELECTOR} .cc-copy-btn.cc-visible {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0);
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

async function handleCopyClick(button, side) {
  const viewport = button._ccViewport;
  if (!viewport || !viewport.isConnected) return;
  const { before, after } = getCompareImages(viewport);
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

function createCopyButton(viewport, side) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `${ACTION_BUTTON_CLASS} cc-copy-btn cc-${side}`;
  const label =
    side === "left"
      ? "Copy image A (before, left side) to clipboard"
      : "Copy image B (after, right side) to clipboard";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = ICON_COPY;
  button._ccViewport = viewport;
  // The compare slider follows the mouse anywhere over the view; stop the
  // button's own press/click events from reaching the canvas/slider logic.
  for (const type of ["pointerdown", "mousedown", "mouseup", "click", "dblclick"]) {
    button.addEventListener(type, (event) => event.stopPropagation());
  }
  button.addEventListener("click", (event) => {
    event.preventDefault();
    void handleCopyClick(button, side);
  });
  return button;
}

function setVisible(button, visible) {
  button.classList.toggle("cc-visible", visible);
}

function updateButtons(viewport, state, clientY) {
  const rect = viewport.getBoundingClientRect();
  const topZone = Math.max(TOP_ZONE_MIN_PX, rect.height * TOP_ZONE_RATIO);
  const inTop = clientY >= rect.top && clientY <= rect.top + topZone;

  const { before, after } = getCompareImages(viewport);
  const hasBefore = !!before;
  const hasAfter = !!after;

  if (!inTop || (!hasBefore && !hasAfter)) {
    setVisible(state.leftButton, false);
    setVisible(state.rightButton, false);
    return;
  }

  // Only the side that currently covers the larger area gets a button:
  // slider at/above 50% means the left (before) image dominates.
  let dominant = null;
  if (hasBefore && hasAfter) {
    const slider = getSliderPercent(viewport);
    dominant = slider === null || slider >= 50 ? "left" : "right";
  } else if (hasBefore) {
    dominant = "left";
  } else {
    dominant = "right";
  }

  setVisible(state.leftButton, dominant === "left" && hasBefore);
  setVisible(state.rightButton, dominant === "right" && hasAfter);
}

function enhanceViewport(viewport) {
  if (viewport.dataset.ccCopyEnhanced === "1") {
    return viewport._ccState || null;
  }
  viewport.dataset.ccCopyEnhanced = "1";

  ensureStyle();

  const state = {
    leftButton: createCopyButton(viewport, "left"),
    rightButton: createCopyButton(viewport, "right"),
  };
  viewport.appendChild(state.leftButton);
  viewport.appendChild(state.rightButton);
  viewport._ccState = state;

  viewport.addEventListener("pointermove", (event) => {
    updateButtons(viewport, state, event.clientY);
  });
  viewport.addEventListener("pointerleave", () => {
    setVisible(state.leftButton, false);
    setVisible(state.rightButton, false);
  });
  // Keep the active button in sync when images/slider change without mouse
  // input (batch navigation, new execution): hide the side that has no image
  // or is no longer the dominant one.
  const domObserver = new MutationObserver(() => {
    const { before, after } = getCompareImages(viewport);
    if (!before) setVisible(state.leftButton, false);
    if (!after) setVisible(state.rightButton, false);
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
      console.warn(
        "[CompareCopy] ClipboardItem API is not available, copy buttons are disabled."
      );
      return;
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
