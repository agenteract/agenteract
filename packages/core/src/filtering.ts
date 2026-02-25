/**
 * Agenteract Hierarchy Filtering Utilities
 *
 * Pure functions for querying and filtering the view hierarchy tree returned by
 * `AgentClient.getViewHierarchy()`.  No I/O, no side-effects — safe to use in
 * both Node.js and browser environments.
 *
 * These helpers let AI agents and test scripts answer questions like
 * "what text is on screen right now?" or "is the Back button visible?"
 * without needing to traverse the raw JSON tree by hand.
 *
 * Programmatic usage:
 *   import { getAllTexts, findByTestID } from '@agenteract/core/node';
 *
 *   const hierarchy = await client.getViewHierarchy('my-project');
 *   const texts = getAllTexts(hierarchy.hierarchy);
 *   const match = findByTestID('submit-btn', hierarchy.hierarchy);
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HierarchyNode {
    name: string;
    text?: string;
    testID?: string;
    key?: string | null;
    children?: HierarchyNode[];
    [key: string]: unknown;
}

export interface AgenteractHierarchyResponse {
    status: string;
    hierarchy: HierarchyNode;
    id: string;
}

export interface NodeMatch {
    node: HierarchyNode;
    /** Breadcrumb path from root, e.g. "App > HomeScreen > FlatList > Text" */
    path: string;
    depth: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Walk every node in the tree, calling `visitor` with the node, its
 * human-readable path string, and its depth.
 */
export function walk(
    node: HierarchyNode,
    visitor: (match: NodeMatch) => void,
    path = node.name,
    depth = 0,
): void {
    visitor({ node, path, depth });
    for (const child of node.children ?? []) {
        walk(child, visitor, `${path} > ${child.name}`, depth + 1);
    }
}

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

/**
 * Return all non-empty text values visible in the tree.
 * Excludes noise strings like "[object Object]" and pure numbers by default.
 */
export function getAllTexts(
    root: HierarchyNode,
    options: { includeNumbers?: boolean; includeObjectStrings?: boolean } = {},
): string[] {
    const seen = new Set<string>();
    const results: string[] = [];

    walk(root, ({ node: n }) => {
        const t = n.text;
        if (!t) return;
        if (!options.includeObjectStrings && t.startsWith('[object')) return;
        if (!options.includeNumbers && /^\d+(\.\d+)?$/.test(t)) return;
        if (!seen.has(t)) {
            seen.add(t);
            results.push(t);
        }
    });

    return results;
}

/**
 * Return all testIDs present in the tree (deduped, sorted).
 */
export function getAllTestIDs(root: HierarchyNode): string[] {
    const results = new Set<string>();
    walk(root, ({ node: n }) => {
        if (n.testID) results.add(n.testID);
    });
    return [...results].sort();
}

/**
 * Find all nodes whose `text` property matches `pattern` (string substring or
 * RegExp).  Returns an array of `NodeMatch` objects, each including the node
 * and its path from root.
 */
export function findByText(
    pattern: string | RegExp,
    root: HierarchyNode,
): NodeMatch[] {
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
    const results: NodeMatch[] = [];

    walk(root, (match) => {
        if (match.node.text && regex.test(match.node.text)) {
            results.push(match);
        }
    });

    return results;
}

/**
 * Find all nodes whose `name` (component type) matches `pattern`.
 * Useful for finding e.g. all "Header…" or "Screen…" components.
 */
export function findByName(
    pattern: string | RegExp,
    root: HierarchyNode,
): NodeMatch[] {
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
    const results: NodeMatch[] = [];

    walk(root, (match) => {
        if (regex.test(match.node.name)) {
            results.push(match);
        }
    });

    return results;
}

/**
 * Find the first node with the given `testID`.  Returns `NodeMatch` or null.
 */
export function findByTestID(
    testID: string,
    root: HierarchyNode,
): NodeMatch | null {
    let result: NodeMatch | null = null;

    walk(root, (match) => {
        if (!result && match.node.testID === testID) {
            result = match;
        }
    });

    return result;
}

/**
 * Return the path string from the root to the node with the given `testID`,
 * e.g. "App > HomeScreen > FlatList > Pressable".
 * Returns null if the testID is not found.
 */
export function getPathToTestID(
    testID: string,
    root: HierarchyNode,
): string | null {
    return findByTestID(testID, root)?.path ?? null;
}

/**
 * Pretty-print the tree, showing name, testID (if any), and text (if any) at
 * each level, indented by depth.
 */
export function dumpTree(root: HierarchyNode): string {
    const lines: string[] = [];

    walk(root, ({ node: n, depth }) => {
        const indent = '  '.repeat(depth);
        const testID = n.testID ? ` [testID=${n.testID}]` : '';
        const text = n.text && !n.text.startsWith('[object') ? ` "${n.text}"` : '';
        lines.push(`${indent}${n.name}${testID}${text}`);
    });

    return lines.join('\n');
}
