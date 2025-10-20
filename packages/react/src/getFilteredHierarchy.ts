// packages/react/src/getFilteredHierarchy.ts
import { getDomHierarchy } from '@agenteract/dom';
import { getFilteredHierarchy as getNativeFilteredHierarchy } from './native/getReactHierarchy';

// Detect platform without directly importing react-native
const getPlatform = (): 'android' | 'ios' | 'web' => {
  // If we're in a browser environment, return 'web'
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return 'web';
  }
  // Otherwise, try to get the platform from react-native (for React Native)
  try {
    // @ts-ignore - react-native may not be available
    const RN = require('react-native');
    return RN.Platform.OS;
  } catch {
    // Fallback to web
    return 'web';
  }
};

type Node = {
  name: string;
  key?: string | null;
  text?: string;
  testID?: string;
  accessibilityLabel?: string;
  children: Node[];
};

const meaningfulNames = [
  // cross-platform signals; filtering is conservative, summarizer trims size
  "Screen",
  "Button",
  "Text",
  "TextInput",
  "Image",
  "ScrollView",
  "Pressable",
  "TouchableOpacity",
  "Link",
  // web intrinsics to avoid over-pruning
  "div",
  "button",
  "input",
  "span",
  "a",
  "ul",
  "li",
  "p",
  "img",
  "h1",
  "h2",
  "h3",
  "Header",
  "Main",
  "Section",
  "View",
  "Layout",
  "Container",
  "Navigator",
];

const ignoredPrefixes = [
  "withDevTools",
  "Theme",
  "RCT",        // RN native wrapper
  "Animated",   // RN animated wrapper
  "Unknown",    // harmless but noisy
];

const isMeaningfulName = (name: string) =>
  meaningfulNames.some((n) => name.includes(n)) ||
  /Screen$|View$|Layout|Container|Navigator/.test(name);


  function collectMeaningfulChildren(fiber: any): Node | null {
    const children: Node[] = [];
    let child = fiber;
    while (child) {
      const sub = traverseFiltered(child);
      if (sub) children.push(sub);
      child = child.sibling;
    }
    if (children.length === 0) return null;
    return { name: "Group", children };
  }

  function traverseFiltered(fiberNode: any, isRoot = false): Node | null {
  if (!fiberNode) return null;

  const name =
    fiberNode.type?.displayName ||
    fiberNode.type?.name ||
    (typeof fiberNode.elementType === "string" ? fiberNode.elementType : "Unknown");

  // Build node
  const props = fiberNode.memoizedProps || {};
  const node: Node = {
    name,
    key: fiberNode.key,
    text: typeof props.children === "string" ? props.children : undefined,
    testID: props.testID ?? props["data-testid"],
    accessibilityLabel: props.accessibilityLabel ?? props["aria-label"],
    children: [],
  };

  // Recurse
  let child = fiberNode.child;
  while (child) {
    const sub = traverseFiltered(child);
    if (sub) node.children.push(sub);
    child = child.sibling;
  }

  // Skip wrapper elimination for the top node
  if (!isRoot && ignoredPrefixes.some((p) => name.startsWith(p))) {
    return fiberNode.child ? collectMeaningfulChildren(fiberNode.child) : null;
  }

  if (!isRoot && !isMeaningfulName(name) && node.children.length === 0 && !node.text) {
    return null;
  }

  return node;
}

function summarizeHierarchy(node: Node | null, depth = 0): Node | null {
  if (!node) return null;
  if (!node.children?.length) return node;

  // Flatten trivial groups
  if (node.name === "Group" && node.children.length === 1) {
    return summarizeHierarchy(node.children[0], depth + 1);
  }

  const summarizedChildren = node.children
    .map((c) => summarizeHierarchy(c, depth + 1))
    .filter(
      (c): c is Node =>
        !!c && (!!c.text || !!c.testID || !!c.accessibilityLabel || (c.children?.length ?? 0) > 0)
    )
    .slice(0, 10); // per-branch cap

  return {
    name: node.name,
    text: node.text,
    testID: node.testID,
    accessibilityLabel: node.accessibilityLabel,
    children: summarizedChildren,
  };
}

// Minimal touch-point used by your bridge
// export function _getFilteredHierarchy(): Node | null {
//     console.log("=== getFilteredHierarchy() ===");
  
//     const root: Node | null = null;
//     if (!root) {
//       console.warn("❌ getReactHierarchy() returned null or undefined");
//       return null;
//     }
  
//     console.log(
//       "✅ Raw root received:",
//       root.name,
//       "children:",
//       root.children?.length ?? 0
//     );
  
//     const printTree = (node: any, depth = 0) => {
//       const indent = "  ".repeat(depth);
//       console.log(
//         `${indent}- ${node.name}${node.testID ? ` [${node.testID}]` : ""}${
//           node.text ? ` "${node.text}"` : ""
//         }`
//       );
//       node.children?.forEach((c: any) => printTree(c, depth + 1));
//     };
  
//     // Print a shallow tree so we can see what we have
//     try {
//       printTree(root);
//     } catch (err) {
//       console.warn("⚠️ Could not print tree:", err);
//     }
  
//     console.log("→ Traversing filtered hierarchy...");
//     const filtered = traverseFiltered(root, true);
  
//     if (!filtered) {
//       console.warn("❌ traverseFiltered returned null");
//       return null;
//     }
  
//     console.log(
//       "✅ Filtered root:",
//       filtered.name,
//       "children:",
//       filtered.children?.length ?? 0
//     );
  
//     const summarized = summarizeHierarchy(filtered);
//     if (!summarized) {
//       console.warn("❌ summarizeHierarchy returned null");
//       return null;
//     }
  
//     console.log(
//       "✅ Summarized hierarchy ready. Root:",
//       summarized.name,
//       "children:",
//       summarized.children?.length ?? 0
//     );
  
//     console.log("=== getFilteredHierarchy() done ===");
//     return summarized;
//   }
  
  function getWebFilteredHierarchy() {
    const hierarchy = getDomHierarchy();
    return summarizeHierarchy(hierarchy);
  }
  
  export function getFilteredHierarchy(): Node | null {
    return getPlatform() === 'web' ? getWebFilteredHierarchy() : getNativeFilteredHierarchy();
  }