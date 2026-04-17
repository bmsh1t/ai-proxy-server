function isJsonObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function getThinkingLikeBlockType(block) {
  if (!isJsonObject(block)) return null;
  if (block.type === "thinking" || block.type === "redacted_thinking") {
    return block.type;
  }
  return null;
}

export function hasValidAnthropicThinkingEnvelope(block) {
  const blockType = getThinkingLikeBlockType(block);
  if (blockType === "thinking") {
    return isJsonObject(block) && isNonEmptyString(block.signature);
  }
  if (blockType === "redacted_thinking") {
    return isJsonObject(block) && isNonEmptyString(block.data);
  }
  return true;
}

export function stripInvalidAnthropicThinkingFromContent(
  content,
  removedPaths = [],
  basePath = "content",
) {
  if (!Array.isArray(content)) return content;

  const sanitized = [];
  for (const [index, block] of content.entries()) {
    if (!hasValidAnthropicThinkingEnvelope(block)) {
      removedPaths.push(`${basePath}.${index}`);
      continue;
    }
    sanitized.push(block);
  }
  return sanitized;
}

export function stripInvalidAnthropicThinkingFromMessages(
  messages,
  removedPaths = [],
  basePath = "messages",
) {
  if (!Array.isArray(messages)) return messages;

  return messages.map((message, index) => {
    if (!isJsonObject(message) || !Array.isArray(message.content)) {
      return message;
    }
    return {
      ...message,
      content: stripInvalidAnthropicThinkingFromContent(
        message.content,
        removedPaths,
        `${basePath}.${index}.content`,
      ),
    };
  });
}

export class AnthropicThinkingStreamSanitizer {
  #pendingBlocks = new Map();
  #droppedBlocks = 0;

  push(event) {
    if (!isJsonObject(event) || typeof event.type !== "string") {
      return isJsonObject(event) ? [event] : [];
    }

    if (event.type === "content_block_start") {
      const index = this.#readIndex(event.index);
      const blockType = getThinkingLikeBlockType(event.content_block);
      if (index === null || blockType === null) {
        return [event];
      }
      if (hasValidAnthropicThinkingEnvelope(event.content_block)) {
        return [event];
      }
      this.#pendingBlocks.set(index, {
        blockType,
        startEvent: event,
        bufferedEvents: [],
      });
      return [];
    }

    if (event.type === "content_block_delta") {
      const index = this.#readIndex(event.index);
      if (index === null) return [event];
      const pending = this.#pendingBlocks.get(index);
      if (!pending) return [event];

      const delta = event.delta;
      pending.bufferedEvents.push(event);
      if (this.#deltaMakesBlockValid(pending.blockType, delta)) {
        this.#pendingBlocks.delete(index);
        return [pending.startEvent, ...pending.bufferedEvents];
      }
      return [];
    }

    if (event.type === "content_block_stop") {
      const index = this.#readIndex(event.index);
      if (index === null) return [event];
      const pending = this.#pendingBlocks.get(index);
      if (!pending) return [event];
      this.#pendingBlocks.delete(index);
      this.#droppedBlocks += 1;
      return [];
    }

    if (event.type === "message_stop") {
      this.#droppedBlocks += this.#pendingBlocks.size;
      this.#pendingBlocks.clear();
    }

    return [event];
  }

  drainDroppedBlocks() {
    const count = this.#droppedBlocks;
    this.#droppedBlocks = 0;
    return count;
  }

  #readIndex(index) {
    return typeof index === "number" && Number.isInteger(index) ? index : null;
  }

  #deltaMakesBlockValid(blockType, delta) {
    if (!isJsonObject(delta)) return false;
    if (blockType === "thinking") {
      return delta.type === "signature_delta" && isNonEmptyString(delta.signature);
    }
    if (blockType === "redacted_thinking") {
      return delta.type === "data_delta" && isNonEmptyString(delta.data);
    }
    return false;
  }
}
