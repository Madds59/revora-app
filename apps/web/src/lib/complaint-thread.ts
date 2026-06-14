import type { ComplaintMessage } from "@/lib/database.types";

export type ThreadNode = ComplaintMessage & {
  depth: number;
  sender_name?: string | null;
};

export function buildComplaintThread(
  messages: ComplaintMessage[],
): ThreadNode[] {
  const byId = new Map(messages.map((message) => [message.id, message]));
  const depthCache = new Map<string, number>();

  const depthFor = (id: string): number => {
    const cached = depthCache.get(id);
    if (cached != null) return cached;

    const message = byId.get(id);
    if (!message || !message.parent_message_id) {
      depthCache.set(id, 0);
      return 0;
    }

    const depth = depthFor(message.parent_message_id) + 1;
    depthCache.set(id, depth);
    return depth;
  };

  return messages.map((message) => ({
    ...message,
    depth: depthFor(message.id),
  }));
}
