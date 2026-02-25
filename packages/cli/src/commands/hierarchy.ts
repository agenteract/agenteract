import { createAgentClient } from '@agenteract/core/node';
import { loadRuntimeConfig } from '@agenteract/core/node';

export interface HierarchyCommandArgs {
  project: string;
  command: string;
  pattern?: string;
  testID?: string;
  port?: number;
  includeNumbers?: boolean;
  includeObjectStrings?: boolean;
}

export async function runHierarchyCommand(args: HierarchyCommandArgs): Promise<void> {
  const runtimeConfig = await loadRuntimeConfig();
  const wsPort = args.port ?? runtimeConfig?.port ?? 8765;
  const token = runtimeConfig?.token;

  const client = createAgentClient(`ws://localhost:${wsPort}`);

  try {
    await client.connect('agent', token);
  } catch (err) {
    console.error(`Could not connect to Agenteract server at ws://localhost:${wsPort}.`);
    console.error('Is the Agenteract dev server running? (agenteract dev)');
    process.exit(1);
  }

  try {
    switch (args.command) {
      case 'texts': {
        const texts = await client.getTexts(args.project, {
          includeNumbers: args.includeNumbers,
          includeObjectStrings: args.includeObjectStrings,
        });
        if (texts.length === 0) {
          console.log('No text nodes found.');
        } else {
          texts.forEach((t) => console.log(t));
        }
        break;
      }

      case 'testids': {
        const ids = await client.getTestIDs(args.project);
        if (ids.length === 0) {
          console.log('No testIDs found.');
        } else {
          ids.forEach((id) => console.log(id));
        }
        break;
      }

      case 'find-text': {
        const pattern = args.pattern;
        if (!pattern) {
          console.error('find-text requires a <pattern> argument.');
          process.exit(1);
        }
        const matches = await client.findNodesByText(args.project, pattern);
        console.log(`Found ${matches.length} node(s) matching text "${pattern}":`);
        matches.forEach(({ node: n, path }) => {
          const testID = n.testID ? ` [testID=${n.testID}]` : '';
          console.log(`  ${n.name}${testID}  "${n.text}"`);
          console.log(`    path: ${path}`);
        });
        break;
      }

      case 'find-name': {
        const pattern = args.pattern;
        if (!pattern) {
          console.error('find-name requires a <pattern> argument.');
          process.exit(1);
        }
        const matches = await client.findNodesByName(args.project, pattern);
        console.log(`Found ${matches.length} node(s) with name matching "${pattern}":`);
        matches.forEach(({ node: n, path }) => {
          const testID = n.testID ? ` [testID=${n.testID}]` : '';
          const text = n.text && !n.text.startsWith('[object') ? `  "${n.text}"` : '';
          console.log(`  ${n.name}${testID}${text}`);
          console.log(`    path: ${path}`);
        });
        break;
      }

      case 'find-testid': {
        const testID = args.testID;
        if (!testID) {
          console.error('find-testid requires a <testID> argument.');
          process.exit(1);
        }
        const match = await client.findNodeByTestID(args.project, testID);
        if (!match) {
          console.log(`No node found with testID "${testID}".`);
          process.exit(1);
        }
        const text =
          match.node.text && !match.node.text.startsWith('[object')
            ? `  "${match.node.text}"`
            : '';
        console.log(`Found: ${match.node.name}${text}`);
        console.log(`Path:  ${match.path}`);
        break;
      }

      case 'path': {
        const testID = args.testID;
        if (!testID) {
          console.error('path requires a <testID> argument.');
          process.exit(1);
        }
        const p = await client.getPathToTestID(args.project, testID);
        if (!p) {
          console.log(`No node found with testID "${testID}".`);
          process.exit(1);
        }
        console.log(p);
        break;
      }

      case 'dump': {
        const tree = await client.dumpTree(args.project);
        console.log(tree);
        break;
      }

      default: {
        console.error(`Unknown hierarchy subcommand: "${args.command}"`);
        process.exit(1);
      }
    }
  } finally {
    client.disconnect();
  }
}
