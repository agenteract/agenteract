# @agenteract/dom

DOM utilities for web applications using [Agenteract](https://github.com/agenteract/agenteract).

Agenteract is an experimental bridge that lets coding agents view and interact with running applications — React Native / Expo, React, Flutter, Kotlin Multiplatform, and SwiftUI.

## Installation

```bash
npm install @agenteract/dom
```

## What it does

Provides `getDomHierarchy()` — walks the live DOM and returns a pruned, semantic tree of the page structure. Nodes are included if they have a `data-testid`, `aria-label`, text content, or children that match. Script and style tags are excluded.

Used by `@agenteract/react` to report the current DOM state to the Agenteract bridge.

## API

```ts
import { getDomHierarchy } from '@agenteract/dom';

const hierarchy = getDomHierarchy();
// Returns a nested tree of:
// { name, testID, accessibilityLabel, text, children }
```

Each node represents a DOM element with:
- `name` — tag name (e.g. `"div"`, `"button"`)
- `testID` — value of `data-testid` attribute
- `accessibilityLabel` — value of `aria-label` attribute
- `text` — text content (for single text-node elements, inputs, selects)
- `children` — array of child nodes

## Full documentation

See the [Agenteract README](https://github.com/agenteract/agenteract#readme) for full setup guides, configuration reference, and platform-specific instructions.

## License

MIT
