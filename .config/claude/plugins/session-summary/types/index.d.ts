export type Setting = { name: string; value: string };

export type SessionSummary = {
  topic: string;
  open: string[];
  settings: Setting[];
  next: string[];
  updatedAt: number | null;
  status: "idle" | "running" | "error";
  error?: string;
};

// target が null のコメントは、特定の項目ではなく要約全体へのコメント
export type DraftComment = { id: string; target: string | null; text: string };

export type CommentDrafts = {
  target: string | null;
  items: DraftComment[];
  // 保存済みの値に無いことがあるため省略可能にする
  editingId?: string | null;
};

// 端末は同じ path の PNG を読み直さないため、描き直すたびに generation を変える
export type DiagramImage = {
  path: string;
  width: number;
  height: number;
  generation: number;
};

export type SessionDiagram = {
  title: string;
  mermaid: string;
  image: DiagramImage | null;
  // 図を作ったときの会話の件数。今の件数とずれていれば図が古い
  messageCount: number;
  status: "idle" | "running" | "error";
  error?: string;
};

export type PaneView = "summary" | "diagram";

declare module "claude-code" {
  interface PluginState {
    "session-summary": {
      summary: Shaped<SessionSummary>;
      comments: Shaped<CommentDrafts>;
      diagram: Shaped<SessionDiagram>;
      view: Shaped<PaneView>;
    };
  }
}
