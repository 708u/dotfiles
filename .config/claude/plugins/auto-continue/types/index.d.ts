export type Entry = { role: "user" | "assistant" | "event"; text: string };

export type Status =
  "changed" | "waiting" | "blocked-on-user" | "done" | "cleaned";

export type Verdict = "CONTINUE" | "WAIT_EXTERNAL" | "WAIT_USER" | "DONE";

export type PrSnapshot = {
  number: number;
  url: string;
  state: string;
  reviewDecision: string;
  mergeStateStatus: string;
  headSha: string;
  reviews: number;
  comments: number;
  checks: string;
};

export type Memory = {
  isEnabled: boolean;
  stoppedReason: string | null;
  lastActivityAt: number;
  lastPolledAt: number;
  lastStatus: Status | null;
  wasAborted: boolean;
  autoTurns: number;
  summary: string;
  verdict: Verdict | null;
  target: string | null;
  pr: PrSnapshot | null;
  isCleanupSent: boolean;
};

declare module "claude-code" {
  interface PluginState {
    "auto-continue": {
      memory: Shaped<Memory>;
      buffer: Shaped<Entry[]>;
    };
  }
}
