export type Worktree = { path: string; branch: string };

export type DiffLine = {
  kind: "hunk" | "add" | "del" | "ctx";
  text: string;
  oldNo?: number;
  newNo?: number;
};

export type DiffFile = {
  path: string;
  added: number;
  removed: number;
  isBinary: boolean;
  lines: DiffLine[];
};

export type ReviewComment = {
  id: string;
  worktree: string;
  file: string;
  where: string;
  marks: string[];
  code: string;
  body: string;
};

export type CommentDraft = {
  worktree: string;
  file: string;
  where: string;
  anchor: number;
  head: number;
  body: string;
};

export type PrInfo = { number: number; url: string };

export type PrThread = {
  id: string;
  path: string;
  line: number | null;
  side: "LEFT" | "RIGHT";
  isOutdated: boolean;
  anchor: string;
  comments: { author: string; body: string }[];
};

export type DiffBase = "head" | "branch";

export type Picker = "worktree" | "base" | "file" | "pr";

export type LineRange = { start: number; end: number };

export type LineCaret = { anchor: number; head: number };

export type LineSelection = LineCaret & { isComposing: boolean };

export type DiffRow = { text: string; kind: DiffLine["kind"]; indent: number };

export type DiffViewProps = {
  rows: DiffRow[];
  offset: number;
  total: number;
  hunks: number[];
  width: number;
  selection: LineCaret | null;
};

export type DiffViewMessage = { type: "select" | "compose" } & LineCaret;

declare module "claude-code" {
  interface PluginState {
    "review-diff": {
      worktrees: Shaped<Worktree[]>;
      target: string | null;
      openPicker: Picker | null;
      base: DiffBase;
      baseLabel: string;
      files: Shaped<DiffFile[]>;
      file: string | null;
      selection: Shaped<LineSelection | null>;
      lineLimit: number;
      comments: Shaped<ReviewComment[]>;
      drafts: Shaped<CommentDraft[]>;
      pr: Shaped<PrInfo | null>;
      prThreads: Shaped<PrThread[]>;
      includedThreads: string[];
      collapsedComments: string[];
      status: string | null;
    };
  }
}
