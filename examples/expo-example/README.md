# Welcome to your Agent Enabled Expo app 👋

## Development

We need to build the mono repo and use linking to work locally:

Usage:
```bash
npm install -g pnpm
EXAPP=$(pwd)
cd ..
pnpm build
cd packages/expo
pnpm link --global
cd "$EXAPP"
npx @agenteract/expo # This runs npx expo with our agent wrapper
```
