import { google as googleapis, type gmail_v1 } from "googleapis";

export function hasGmailCredentials(): boolean {
  return Boolean(
    process.env.GMAIL_CLIENT_ID &&
      process.env.GMAIL_CLIENT_SECRET &&
      process.env.GMAIL_REFRESH_TOKEN
  );
}

export function createGmailClient(): gmail_v1.Gmail {
  const oauth2Client = new googleapis.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground"
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });

  return googleapis.gmail({ version: "v1", auth: oauth2Client });
}

/** Best-effort: a failed Gmail update must never block a DB write. */
export async function markMessagesRead(
  gmail: gmail_v1.Gmail,
  messageIds: string[]
): Promise<void> {
  const results = await Promise.allSettled(
    messageIds.map((id) =>
      gmail.users.messages.modify({
        userId: "me",
        id,
        requestBody: { removeLabelIds: ["UNREAD"] },
      })
    )
  );

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Failed to mark email as read:", result.reason);
    }
  }
}
