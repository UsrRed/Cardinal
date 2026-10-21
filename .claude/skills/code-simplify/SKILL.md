---
name: code-simplify
description: Cut unneeded abstraction, dead code, and speculative flexibility introduced while implementing a task, before it ships. Use during polish/review_fix passes on code you just wrote.
---

# Simplify before shipping

Right after implementing a task, re-read the diff with a critical eye for scope creep:

- **No premature abstraction.** Three similar lines are better than a helper/interface built for a future case that doesn't exist yet. Collapse a wrapper that has exactly one caller and adds no clarity.
- **No unused flexibility.** Config options, feature flags, or parameters nothing in this codebase actually varies are dead weight — remove them or hard-code the one real value.
- **No defensive code for impossible inputs.** Validate at real boundaries (user input, external APIs); don't wrap internal calls whose contract is already guaranteed by the type system or the caller.
- **No leftover scaffolding.** Delete commented-out code, TODO stubs for things not being done now, and half-finished alternate implementations left behind while iterating.
- **Match existing patterns.** If the codebase already has a helper or convention for this, reuse it instead of writing a parallel one.

Do this as a targeted pass over the code just touched — not a rewrite of unrelated files.
