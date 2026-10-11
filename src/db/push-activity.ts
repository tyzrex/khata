/** Shared activity shapes carried inside a push payload. No imports: this breaks the db → lib → db cycle between shares.ts and push-notifications.ts. */

export type SharedActivity =
  | {
      kind: "expense";
      action: "added" | "updated" | "deleted";
      actorName: string;
      description: string;
      amount: number;
      title: string;
      url: string;
      tag: string;
    }
  | {
      kind: "settlement";
      action: "recorded" | "updated" | "deleted";
      actorName: string;
      payerName: string;
      receiverName: string;
      amount: number;
      title: string;
      url: string;
      tag: string;
    };
