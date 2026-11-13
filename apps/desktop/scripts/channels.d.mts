export type ChannelName = 'direct' | 'mas-lite';
export declare const CHANNELS: Record<ChannelName, { caps: { insertAtCursor: boolean }; forbidden: string[] }>;
export declare function channelFrom(env: Record<string, string | undefined>): ChannelName;
export declare function channelDefines(name: ChannelName): Record<string, string>;
export declare function assertChannel(metafile: { outputs: Record<string, { inputs: Record<string, { bytesInOutput: number }> }> }, name: ChannelName): void;
