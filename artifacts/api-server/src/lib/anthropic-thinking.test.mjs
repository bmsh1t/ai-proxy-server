import assert from "node:assert/strict";
import test from "node:test";

import {
  AnthropicThinkingStreamSanitizer,
  stripInvalidAnthropicThinkingFromContent,
  stripInvalidAnthropicThinkingFromMessages,
} from "./anthropic-thinking.js";

test("stripInvalidAnthropicThinkingFromMessages removes assistant thinking blocks with empty signatures", () => {
  const removedPaths = [];
  const messages = [
    {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "internal", signature: "" },
        { type: "text", text: "visible" },
      ],
    },
  ];

  const sanitized = stripInvalidAnthropicThinkingFromMessages(messages, removedPaths, "messages");

  assert.deepEqual(removedPaths, ["messages.0.content.0"]);
  assert.deepEqual(sanitized, [
    {
      role: "assistant",
      content: [{ type: "text", text: "visible" }],
    },
  ]);
});

test("stripInvalidAnthropicThinkingFromContent keeps valid official Anthropic thinking envelopes", () => {
  const removedPaths = [];
  const content = [
    { type: "thinking", thinking: "", signature: "sig_valid" },
    { type: "redacted_thinking", data: "encrypted_payload" },
    { type: "text", text: "answer" },
  ];

  const sanitized = stripInvalidAnthropicThinkingFromContent(content, removedPaths, "content");

  assert.deepEqual(removedPaths, []);
  assert.deepEqual(sanitized, content);
});

test("AnthropicThinkingStreamSanitizer drops thinking blocks that never receive a valid signature", () => {
  const sanitizer = new AnthropicThinkingStreamSanitizer();
  const events = [
    { type: "message_start", message: { id: "msg_1" } },
    { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "internal" } },
    { type: "content_block_stop", index: 0 },
    { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "answer" } },
    { type: "content_block_stop", index: 1 },
    { type: "message_stop" },
  ];

  const forwarded = events.flatMap((event) => sanitizer.push(event));

  assert.equal(sanitizer.drainDroppedBlocks(), 1);
  assert.deepEqual(
    forwarded.map((event) => event.type),
    [
      "message_start",
      "content_block_start",
      "content_block_delta",
      "content_block_stop",
      "message_stop",
    ],
  );
  assert.equal(forwarded.some((event) => event.type === "content_block_start" && event.index === 0), false);
});

test("AnthropicThinkingStreamSanitizer preserves official thinking blocks once a signature_delta arrives", () => {
  const sanitizer = new AnthropicThinkingStreamSanitizer();
  const events = [
    { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "internal" } },
    { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig_valid" } },
    { type: "content_block_stop", index: 0 },
  ];

  const forwarded = events.flatMap((event) => sanitizer.push(event));

  assert.equal(sanitizer.drainDroppedBlocks(), 0);
  assert.deepEqual(forwarded, events);
});

test("AnthropicThinkingStreamSanitizer forwards already-valid Anthropic thinking blocks immediately", () => {
  const sanitizer = new AnthropicThinkingStreamSanitizer();
  const start = {
    type: "content_block_start",
    index: 0,
    content_block: { type: "thinking", thinking: "", signature: "sig_valid" },
  };
  const delta = {
    type: "content_block_delta",
    index: 0,
    delta: { type: "thinking_delta", thinking: "internal" },
  };
  const stop = { type: "content_block_stop", index: 0 };

  assert.deepEqual(sanitizer.push(start), [start]);
  assert.deepEqual(sanitizer.push(delta), [delta]);
  assert.deepEqual(sanitizer.push(stop), [stop]);
  assert.equal(sanitizer.drainDroppedBlocks(), 0);
});
