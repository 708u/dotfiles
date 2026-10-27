export type Setting = { name: string; value: string }

export type SessionSummary = {
  topic: string
  open: string[]
  settings: Setting[]
  next: string[]
  updatedAt: number | null
  status: 'idle' | 'running' | 'error'
  error?: string
}

// target が null のコメントは、特定の項目ではなく要約全体へのコメント
export type DraftComment = { id: string; target: string | null; text: string }

export type CommentDrafts = {
  target: string | null
  items: DraftComment[]
  // 保存済みの値に無いことがあるため省略可能にする
  editingId?: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'session-summary': {
      summary: Shaped<SessionSummary>
      comments: Shaped<CommentDrafts>
    }
  }
}
