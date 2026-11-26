import { MessagesScreen } from "@/components/messages/MessagesScreen";
export const instant = false;
export default async function ConversationPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <MessagesScreen roomId={roomId} />;
}
