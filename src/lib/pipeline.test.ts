import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  txFindUnique,
  skippedFindUnique,
  ignoredFindUnique,
  markMessagesRead,
} = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  txFindUnique: vi.fn<(...args: any[]) => Promise<any>>(async () => null),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  skippedFindUnique: vi.fn<(...args: any[]) => Promise<any>>(async () => null),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ignoredFindUnique: vi.fn<(...args: any[]) => Promise<any>>(async () => null),
  markMessagesRead: vi.fn(async () => {}),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    transaction: { findUnique: txFindUnique },
    skippedEmail: { findUnique: skippedFindUnique },
    ignoredTransaction: { findUnique: ignoredFindUnique },
  },
}));

vi.mock("@/lib/gmail", () => ({
  createGmailClient: vi.fn(),
  markMessagesRead,
}));

import { processOneEmail } from "./pipeline";

const fakeGmail = {
  users: { messages: { get: vi.fn(), modify: vi.fn() } },
};

const gmail = fakeGmail as never;

beforeEach(() => {
  vi.clearAllMocks();
  txFindUnique.mockResolvedValue(null);
  skippedFindUnique.mockResolvedValue(null);
  ignoredFindUnique.mockResolvedValue(null);
  markMessagesRead.mockResolvedValue(undefined);
});

describe("processOneEmail ignored tombstones", () => {
  it("short-circuits by email id before fetching Gmail or calling AI", async () => {
    ignoredFindUnique.mockResolvedValue({
      id: "ign-1",
      amount: 100,
      merchant: "Swiggy",
      date: new Date("2026-03-01T00:00:00.000Z"),
      category: "Food",
      is_cc_payment: false,
    });

    const outcome = await processOneEmail({
      gmail,
      messageId: "msg-1",
      categoryPromptText: "",
      dryRun: false,
    });

    expect(outcome.kind).toBe("ignored");
    if (outcome.kind === "ignored") {
      expect(outcome.entry.status).toBe("ignored_skipped");
      expect(outcome.entry.parsed.merchant).toBe("Swiggy");
    }
    expect(fakeGmail.users.messages.get).not.toHaveBeenCalled();
    expect(markMessagesRead).toHaveBeenCalledWith(gmail, ["msg-1"]);
  });

  it("does not touch Gmail during a dry run", async () => {
    ignoredFindUnique.mockResolvedValue({
      id: "ign-1",
      amount: 100,
      merchant: "Swiggy",
      date: new Date("2026-03-01T00:00:00.000Z"),
      category: "Food",
      is_cc_payment: false,
    });

    const outcome = await processOneEmail({
      gmail,
      messageId: "msg-1",
      categoryPromptText: "",
      dryRun: true,
    });

    expect(outcome.kind).toBe("ignored");
    expect(markMessagesRead).not.toHaveBeenCalled();
  });
});
