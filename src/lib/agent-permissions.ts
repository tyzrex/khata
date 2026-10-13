export const AGENT_SCOPES = ["read", "write", "delete"] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];
export const DEFAULT_AGENT_SCOPES: AgentScope[] = ["read", "write"];

export type AgentIdentity = {
  userId: string;
  viaApiKey: boolean;
  apiKeyId?: string;
  agentName?: string;
  scopes?: AgentScope[];
};

/** Sessions retain the owner's access. Keys only receive explicitly granted operations. */
export function canAgent(identity: AgentIdentity, scope: AgentScope) {
  return !identity.viaApiKey || identity.scopes?.includes(scope) === true;
}
