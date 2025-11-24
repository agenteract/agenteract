
// This function traverses the React Fiber tree, which is the internal
// data structure React uses to manage components. It's the same mechanism
// used by React DevTools.

export function getReactHierarchy() {
  const hook = (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!hook || hook.renderers.size === 0) {
    console.warn("React DevTools hook not found. Is the app running in debug mode?");
    return null;
  }
  else {
    // console.log('React DevTools hook found.');
  }
  
  // const renderer = [...hook.renderers.values()][0];
  // const roots = hook.getFiberRoots(renderer.rendererID);
  const trees: any[] = [];
  
  for (const [rendererID, renderer] of hook.renderers.entries()) {
    const roots = hook.getFiberRoots(rendererID);
    for (const root of roots) {
      const traverse = (fiber: any): any => {
        if (!fiber) return null;
  
        // Get the component name
        const name =
          fiber.type?.displayName ||
          fiber.type?.name ||
          (typeof fiber.elementType === "string" ? fiber.elementType : "Unknown");

        // Extract text content from props
        const props = fiber.memoizedProps || {};
        let text: string | undefined;
        if (typeof props.children === 'string') {
          text = props.children;
        } else if (props.value !== undefined && props.value !== null) {
          // For TextInput and other input elements, capture the value prop
          text = String(props.value);
        } else if (props.placeholder && !text) {
          // Fallback to placeholder if no value is set
          text = `[${props.placeholder}]`;
        }

        const node: any = {
          name,
          key: fiber.key,
          testID: props.testID,
          text,
          children: [],
        };
  
        // Traverse children
        if (fiber.child) {
          let child = fiber.child;
          while (child) {
            const childNode = traverse(child);
            if (childNode) {
              node.children.push(childNode);
            }
            child = child.sibling;
          }
        }
  
        return node;
      };
  
      trees.push(traverse(root.current));
    }
  }
  
  console.log('Trees:', trees.length);
  
  // We typically only care about the main app tree
  return trees.length > 0 ? trees[0] : null;
  }
  
  type Node = {
  name: string;
  key?: string | null;
  text?: string;
  testID?: string;
  accessibilityLabel?: string;
  children: Node[];
  };
  
  const meaningfulNames = [
  "Screen",
  "Button",
  "Text",
  "TextInput",
  "Image",
  "ScrollView",
  "Pressable",
  "TouchableOpacity",
  "Link",
  ];
  
  function summarizeHierarchy(node: Node, depth = 0): Node {
  if (!node.children?.length) return node;
  
  if (node.name === "Group" && node.children.length === 1)
    return summarizeHierarchy(node.children[0], depth + 1);
  
  const summarizedChildren = node.children
    .map((c: Node) => summarizeHierarchy(c, depth + 1))
    .filter(c => c && (c.text || c.testID || c.accessibilityLabel || c.children?.length));
  
  return {
    name: node.name,
    text: node.text,
    testID: node.testID,
    accessibilityLabel: node.accessibilityLabel,
    children: summarizedChildren.slice(0, 10) // limit per branch
  };
  }
  
  const isMeaningfulName = (name: string) =>
  meaningfulNames.some((n) => name.includes(n)) ||
  name.match(/Screen$/) ||
  name.match(/View$/) ||
  name.match(/Layout/);
  
  const ignoredPrefixes = ["RCT", "Animated", "withDevTools", "Unknown", "Theme"];
  
  function traverseFiltered(fiber: any): Node | null {
  const name =
    fiber.type?.displayName ||
    fiber.type?.name ||
    (typeof fiber.elementType === "string" ? fiber.elementType : "Unknown");
  
  // skip boilerplate / invisible wrappers
  if (ignoredPrefixes.some((p) => name.startsWith(p))) {
    // but still recurse into children
    return fiber.child ? collectMeaningfulChildren(fiber.child) : null;
  }
  
  const node: Node = { name, key: fiber.key, children: [] };

  const props = fiber.memoizedProps || {};
  if (props.testID) node.testID = props.testID;
  if (props.accessibilityLabel) node.accessibilityLabel = props.accessibilityLabel;

  // Capture text content from children or value prop (for TextInput)
  if (typeof props.children === "string") {
    node.text = props.children;
  } else if (props.value !== undefined && props.value !== null) {
    // For TextInput and other input elements, capture the value prop
    node.text = String(props.value);
  } else if (props.placeholder && !node.text) {
    // Fallback to placeholder if no value is set
    node.text = `[${props.placeholder}]`;
  }
  
  // recurse
  if (fiber.child) {
    let child = fiber.child;
    while (child) {
      const sub = traverseFiltered(child);
      if (sub) node.children.push(sub);
      child = child.sibling;
    }
  }
  
  // prune nodes with no semantic info and no children
  if (!isMeaningfulName(name) && node.children.length === 0 && !node.text) return null;
  return node;
  }
  
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
  
  // Root traversal
  export function getFilteredHierarchy(): Node | null {
  const hook = (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!hook) return null;
  const trees: Node[] = [];
  
  for (const [id, renderer] of hook.renderers.entries()) {
    for (const root of hook.getFiberRoots(id)) {
      const filtered = traverseFiltered(root.current);
      if (filtered) trees.push(filtered);
    }
  }
  
  return trees.length > 0 ? summarizeHierarchy(trees[0]) : null;
}
