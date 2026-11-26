import type { ChatMessage } from "@/lib/chat-types";

export function mergeChatMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const messages = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) messages.set(message.id, message);
  return [...messages.values()].sort((a, b) => a.sequence - b.sequence);
}

// Only server-recovered history that has been committed to the DOM may advance
// receipts. An acknowledgement of our own send is never evidence of observation.
export function observedReadBoundary(messages: ChatMessage[], synchronizedThrough: number, renderedThrough: number) {
  return messages.reduce((through, message) => !message.mine && message.sequence <= synchronizedThrough && message.sequence <= renderedThrough
    ? Math.max(through, message.sequence) : through, 0);
}

export function isNearChatBottom(element: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">) {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 80;
}
