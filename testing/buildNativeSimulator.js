#!/usr/bin/env node

import {
    buildNativeHeadlessExecutable,
    nativeHeadlessExecutablePath
} from './nativeHeadlessBackend.js';

await buildNativeHeadlessExecutable({ force: true });
console.log(`Wrote ${nativeHeadlessExecutablePath()}`);
