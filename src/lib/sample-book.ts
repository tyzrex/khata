import type { SplitMode, SplitParticipant } from "@/lib/split";

export type SampleExpense = {
  id: string;
  groupId: string | null;
  description: string;
  date: string;
  amount: number;
  paidById: string;
  splitMode: SplitMode;
  note: string;
  participants: SplitParticipant[];
  transactionExternalIds: string[];
};

export type SampleSettlement = {
  id: string;
  groupId: string | null;
  fromPersonId: string;
  toPersonId: string;
  amount: number;
  date: string;
  note: string;
  transactionExternalId: string | null;
};

export const samplePeople = [
  { id: "person-self", name: "You", isSelf: true },
  { id: "person-sameer", name: "Sameer", isSelf: false },
  { id: "person-anita", name: "Anita", isSelf: false },
  { id: "person-rajan", name: "Rajan", isSelf: false },
] as const;

export const sampleGroup = {
  id: "group-biker",
  name: "Biker Gang",
  memberIds: ["person-self", "person-sameer", "person-anita", "person-rajan"],
};

const gang = ["person-self", "person-sameer", "person-anita", "person-rajan"].map((personId) => ({ personId }));

export const sampleExpenses: SampleExpense[] = [
  {
    id: "exp-parts",
    groupId: null,
    description: "Bullet parts",
    date: "2026-09-15",
    amount: 4036,
    paidById: "person-self",
    splitMode: "equal",
    note: "Outside the group. Settled from Sameer's transfer.",
    participants: [{ personId: "person-self" }, { personId: "person-sameer" }],
    transactionExternalIds: [],
  },
  {
    id: "exp-service",
    groupId: "group-biker",
    description: "Service at Thamel",
    date: "2026-09-27",
    amount: 4800,
    paidById: "person-self",
    splitMode: "equal",
    note: "",
    participants: gang,
    transactionExternalIds: [],
  },
  {
    id: "exp-fuel",
    groupId: "group-biker",
    description: "Fuel, Sajha",
    date: "2026-10-02",
    amount: 3600,
    paidById: "person-rajan",
    splitMode: "equal",
    note: "",
    participants: gang,
    transactionExternalIds: [],
  },
  {
    id: "exp-hotel",
    groupId: "group-biker",
    description: "Hotel, Nagarkot",
    date: "2026-10-03",
    amount: 8000,
    paidById: "person-anita",
    splitMode: "percent",
    note: "",
    participants: [
      { personId: "person-self", weight: 40 },
      { personId: "person-sameer", weight: 30 },
      { personId: "person-anita", weight: 20 },
      { personId: "person-rajan", weight: 10 },
    ],
    transactionExternalIds: [],
  },
  {
    id: "exp-snacks",
    groupId: "group-biker",
    description: "Ride snacks",
    date: "2026-10-05",
    amount: 900,
    paidById: "person-sameer",
    splitMode: "shares",
    note: "",
    participants: [
      { personId: "person-self", weight: 1 },
      { personId: "person-sameer", weight: 2 },
      { personId: "person-anita", weight: 1 },
      { personId: "person-rajan", weight: 2 },
    ],
    transactionExternalIds: [],
  },
  {
    id: "exp-cine",
    groupId: "group-biker",
    description: "Cine Mark Movies",
    date: "2026-10-06",
    amount: 675,
    paidById: "person-self",
    splitMode: "exact",
    note: "Matches the two Nabil charges the same evening.",
    participants: [
      { personId: "person-self", amount: 300 },
      { personId: "person-sameer", amount: 375 },
    ],
    transactionExternalIds: ["nabil-cine-300", "nabil-cine-375"],
  },
];

export const sampleSettlements: SampleSettlement[] = [
  {
    id: "settle-sameer-parts",
    groupId: null,
    fromPersonId: "person-sameer",
    toPersonId: "person-self",
    amount: 2018,
    date: "2026-10-06",
    note: "Split record is NPR 2,018. NIMB credited NPR 2,000, so NPR 18 stays on the bank line and out of the share book.",
    transactionExternalId: "nimb-law-2000",
  },
];
