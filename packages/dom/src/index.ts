// This function traverses the DOM tree to build a component hierarchy.

function traverse(node: Element): any {
    if (node.nodeType !== Node.ELEMENT_NODE) {
        return null;
    }

    const name = node.tagName.toLowerCase();

    // Skip script and style tags
    if (name === 'script' || name === 'style') {
        return null;
    }

    const testID = node.getAttribute('data-testid');
    const accessibilityLabel = node.getAttribute('aria-label');

    let text: string | undefined;
    if (node.childNodes.length === 1 && node.childNodes[0].nodeType === Node.TEXT_NODE) {
        text = node.childNodes[0].textContent?.trim();
    }

    const children = [];
    for (const child of Array.from(node.children)) {
        const childNode = traverse(child as Element);
        if (childNode) {
            children.push(childNode);
        }
    }

    // Prune nodes that are not meaningful
    if (!testID && !accessibilityLabel && !text && children.length === 0) {
        return null;
    }

    return {
        name,
        testID,
        accessibilityLabel,
        text,
        children,
    };
}

export function getDomHierarchy() {
    if (typeof document === 'undefined' || !document.body) {
        return null;
    }
    return traverse(document.body);
}
