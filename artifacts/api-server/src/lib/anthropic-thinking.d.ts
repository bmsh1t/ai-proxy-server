export function hasValidAnthropicThinkingEnvelope(block: unknown): boolean;

export function stripInvalidAnthropicThinkingFromContent<T>(
  content: T,
  removedPaths?: string[],
  basePath?: string,
): T;

export function stripInvalidAnthropicThinkingFromMessages<T>(
  messages: T,
  removedPaths?: string[],
  basePath?: string,
): T;

export class AnthropicThinkingStreamSanitizer {
  push(event: Record<string, unknown>): Array<Record<string, unknown>>;
  drainDroppedBlocks(): number;
}
