#!/usr/bin/env node
import { startPty } from '@agenteract/pty';

startPty('vite', process.argv.slice(2), 8791);
