# Responsive remap quality

Use this when planning, generating, or reviewing non-primary breakpoints.

## Core rule

Responsive remap should preserve product intent, use the target canvas well, and avoid new framing. It is not local resizing and not a fresh redesign.

## Mobile to tablet / desktop cautions

Good signs:

- The larger canvas earns its space with clearer grouping, stronger hierarchy, or useful secondary areas.
- Priority modules remain covered, either directly or through intentional grouping.
- Copy stays in the same product voice and does not add new claims.
- The design feels related to the accepted primary screen without looking stretched.

Bad signs:

- A narrow mobile stack is simply centered on a larger canvas.
- Large empty areas appear while important modules disappear.
- Stitch invents new nav labels, subtitles, product categories, or marketing claims.
- The result becomes a generic dashboard instead of the same product experience.

Example directions:

- Tablet can use wider grouped sections or paired cards instead of a single long mobile column.
- Desktop can introduce useful side/support zones when source truth supports them.
- If the remap is sparse or invented, use another Stitch remap/edit attempt with a tighter responsive contract before local repair.

## Desktop to tablet / mobile cautions

Good signs:

- The smaller canvas keeps the main task and identity visible early.
- Secondary modules are grouped, collapsed, or moved lower without losing the product story.
- Navigation remains reachable and safe-area aware.
- Density decreases without deleting essential meaning.

Bad signs:

- Desktop sections are crammed into tiny cards.
- Wide tables, sidebars, or secondary panels survive as broken miniatures.
- Important actions move below excessive chrome.
- Mobile becomes a generic summary instead of the product’s primary journey.

Example directions:

- Mobile should prioritize the next user action, identity, and a short scan path.
- Tablet can bridge between mobile focus and desktop density.
- If the smaller breakpoint feels cramped or loses the main journey, remap rather than patch CSS.

## Review language

Classify sparse, over-invented, over-crammed, or wrong-density breakpoints as `responsive-remap` unless the problem is only spacing, clipping, overflow, or fixed-bar behavior. Local repair should polish a valid target shell, not create the shell.
