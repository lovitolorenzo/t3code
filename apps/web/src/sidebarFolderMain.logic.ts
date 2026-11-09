// A folder's main thread coordinates the folder's other threads. The folder lives only on
// this client, so each message sent from the main thread carries the folder's thread list
// in a tagged block, which the timeline folds back into a chip.

const TAG = "t3-folder-main";
const BLOCK_PATTERN = new RegExp(
  `\\n*<${TAG} folder="([^"]*)" threads="(\\d+)">[\\s\\S]*?</${TAG}>\\s*$`,
);

export interface FolderMainMember {
  readonly threadId: string;
  readonly title: string;
  readonly status: string;
}

export function folderMemberStatus(thread: {
  readonly settledOverride: "settled" | "active" | null;
  readonly hasPendingApprovals: boolean;
  readonly hasPendingUserInput: boolean;
  readonly source: { readonly status: string };
}): string {
  if (thread.settledOverride === "settled") return "settled";
  if (thread.hasPendingApprovals) return "waiting for approval";
  if (thread.hasPendingUserInput) return "waiting for input";
  return thread.source.status.replace(/_/g, " ");
}

/** The block appended to a message sent from the main thread of `folderName`. */
export function formatFolderMainContext(
  folderName: string,
  members: ReadonlyArray<FolderMainMember>,
): string {
  const name = folderName.replace(/"/g, "'");
  const lines = [
    `<${TAG} folder="${name}" threads="${members.length}">`,
    `You are the main thread of the sidebar folder "${name}" and coordinate its other threads.`,
    "Use the T3 tools with these thread ids: t3_thread_read to follow a thread, t3_thread_send to instruct it, t3_thread_wait to wait for it.",
    `To put a thread you start into this folder, end your reply with a t3-folders block naming "${name}".`,
    members.length === 0 ? "The folder has no other threads yet." : "Threads in the folder:",
    ...members.map(
      (member) => `- ${member.threadId} ${JSON.stringify(member.title)} (${member.status})`,
    ),
    `</${TAG}>`,
  ];
  return `\n\n${lines.join("\n")}`;
}

/** Splits a trailing folder block off a message's text, for display. */
export function splitFolderMainContext(text: string): {
  readonly text: string;
  readonly folder: { readonly name: string; readonly threadCount: number } | null;
} {
  const match = BLOCK_PATTERN.exec(text);
  if (!match) return { text, folder: null };
  return {
    text: text.slice(0, match.index),
    folder: { name: match[1]!, threadCount: Number(match[2]) },
  };
}
