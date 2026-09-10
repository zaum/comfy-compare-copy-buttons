"""Comfy Compare Copy Buttons.

Frontend-only extension for ComfyUI. It enhances the built-in
"Compare Images" (ImageCompare) node in place: hovering over the top part
of the compare view shows a copy-to-clipboard button in the corner of the
active side only - top-left (image A / before) while it covers the larger
area (slider at/above 50%), top-right (image B / after) otherwise.

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
