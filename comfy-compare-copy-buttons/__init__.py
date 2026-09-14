"""Comfy Compare Copy Buttons.

Frontend-only extension for ComfyUI. It enhances the built-in
"Compare Images" (ImageCompare) node in place: hovering over the top part
of the compare view shows a single copy-to-clipboard button sitting on the
divider line, following it. The button always copies the dominant side -
image A (before) while the slider is above 50% + dead zone, image B (after)
while below 50% - dead zone - and stays hidden inside the center dead zone.

No new nodes are added, hence the mappings stay empty. The frontend
extension is loaded from WEB_DIRECTORY (see web/js/compare_copy_buttons.js).
"""

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
WEB_DIRECTORY = "./web"

__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "WEB_DIRECTORY",
]
