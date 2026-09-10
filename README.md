# Compare Copy Buttons

Frontend-only extension for ComfyUI. It enhances the built-in
**Compare Images** (`ImageCompare`) node in place - no new nodes are added.

## What it does

When the mouse is over the **top part** of the compare view, **one** button
appears - in the corner of the **active** side, i.e. the side that currently
covers the larger area:

- slider at/above 50%: button in the **top-left corner**, copies
  **image A (before)**,
- slider below 50%: button in the **top-right corner**, copies
  **image B (after)**.

The inactive side never shows a button. Clicking the button copies that
side's currently displayed image (batch-aware) to the OS clipboard, using
the same logic as the core "Copy Image" right-click menu entry
(full-resolution fetch, PNG fallback).

Details:

- The button reuses the dark pill style of the hover buttons on the
  Load Image / Preview Image node, with a "copy" glyph.
- It only reacts in the top strip of the view (top ~34%, min 56 px), so
  dragging the compare slider in the middle of the node never shows it.
- With a single image (no compare pair), the button of the available side
  is shown.

## Install

Copy this folder (or its contents) into `ComfyUI/custom_nodes/`, e.g. as
`ComfyUI/custom_nodes/comfy_compare_copy/`, then restart ComfyUI.

## Compatibility

Requires a frontend that renders the compare widget with
`data-testid="image-compare-viewport"` (current Vue-nodes frontend).
If the `ClipboardItem` API is unavailable, the buttons stay hidden.
