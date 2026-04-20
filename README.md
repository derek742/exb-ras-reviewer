# exb-ras-reviewer

Custom ArcGIS Experience Builder extension repo for the RAS Reviewer widget.

## Current repo state

This repository appears to be based on an Esri sample extension repo and currently contains:

- a top-level extension manifest
- a `widgets/simple/` sample widget
- a `widgets/ras reviewer/` widget scaffold
- widget config files and icons

## Notes

- The `ras reviewer` widget folder currently has a space in the name. That may work in some cases, but it is not ideal for long-term tooling and maintenance.
- Widget versions are mixed right now:
  - `widgets/ras reviewer/manifest.json` uses EXB `1.14.0`
  - `widgets/simple/manifest.json` uses EXB `1.20.0`
- There do not yet appear to be actual widget source files checked in for the custom widget runtime.

## Recommended next steps

1. Align the target Experience Builder version
2. Rename the custom widget folder to a safer folder name
3. Add the widget source files
4. Define the actual Reviewer workflow and UI
5. Remove or keep the sample widget intentionally

## Working conventions

- Keep code readable and maintainable
- Prefer straightforward React and simple patterns
- Ask before every push
- Private repo by default
