# Compare Copy Buttons

Frontend-only extension for ComfyUI. It enhances the built-in
**Compare Images** (`ImageCompare`) node in place - no new nodes are added.

## What it does

When the mouse is over the **top part** of the compare view, a **single**
button sits on the **divider line** (top edge, centered on the slider) and
moves together with it, so it is easy to click. It always copies the
**dominant** side:

- slider above 50% + dead zone: copies **image A (before)**,
- slider below 50% - dead zone: copies **image B (after)**.

Two dead zones keep clicks unambiguous:

- vertical: only the top strip of the view (top ~34%, min 56 px) is
  sensitive, so dragging the slider in the middle never shows the button;
- horizontal: while the slider is inside a narrow centered band
  (8 percentage points around 50%), neither side clearly dominates, so the
  button hides instead of guessing.

Clicking the button copies that side's currently displayed image
(batch-aware) to the OS clipboard, using the same logic as the core
"Copy Image" right-click menu entry (full-resolution fetch, PNG fallback).
Hovering the button freezes the slider underneath, so the button cannot
slip away from under the cursor before the click.

Details:

- The button reuses the dark pill style of the hover buttons on the
  Load Image / Preview Image node, with a "copy" glyph.
- It only reacts in the top strip of the view (top ~34%, min 56 px), so
  dragging the compare slider in the middle of the node never shows it.
- It stays hidden while the slider is inside the 8-point center dead zone.
- With a single image (no compare pair), the button of the available side
  is shown.

## Install

Copy this folder (or its contents) into `ComfyUI/custom_nodes/`, e.g. as
`ComfyUI/custom_nodes/comfy_compare_copy_buttons/`, then restart ComfyUI.

## Compatibility

Requires a frontend that renders the compare widget with
`data-testid="image-compare-viewport"` (current Vue-nodes frontend).
If the `ClipboardItem` API is unavailable, the buttons stay hidden.
