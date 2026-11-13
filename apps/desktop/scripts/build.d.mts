import type { BuildOptions } from 'esbuild';
import type { ChannelName } from './channels.mjs';

export declare function bundleOptions(name: ChannelName): BuildOptions & { metafile: true };
