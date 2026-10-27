import { atom, read, update } from "claude-code";
import type { EngineInterface, Register, SessionMessage } from "claude-code";

import type {
  CommentDrafts,
  DraftComment,
  SessionSummary,
  Setting,
} from "../types";

const PANE = "session-summary";
const TITLE = "セッションの要約";
// 既定のグレーの背景では文字が読みづらいため、ターミナル自身の背景色をそのまま見せる
const PANE_OPTIONS = {
  id: PANE,
  title: TITLE,
  backgroundColor: "transparent",
} as const;
const MODEL = "haiku";
// 古い発言は前回の要約が引き継ぐため、毎回送るのは末尾だけにして入力を抑える
const TRANSCRIPT_TAIL_CHARS = 30000;
const MESSAGE_MAX_CHARS = 1500;

const EMPTY: SessionSummary = {
  topic: "",
  open: [],
  settings: [],
  next: [],
  updatedAt: null,
  status: "idle",
};

const summary = atom(
  { plugin: "session-summary", key: "summary" } as const,
  EMPTY,
  {
    shape: "summary-2",
  }
);

const EMPTY_DRAFTS: CommentDrafts = { target: null, items: [] };

const comments = atom(
  { plugin: "session-summary", key: "comments" } as const,
  EMPTY_DRAFTS,
  { shape: "comments-1" }
);

// Input は描画のたびに value で上書きされるため、入力途中の文字を入力欄ごとに描画をまたいで保持する
const typing: Record<string, string> = {};
const TARGET_INPUT = "comment-target";
const GENERAL_INPUT = "comment-general";
// 押せる行 (要約の行と下書きの文) のボタンの key の接頭辞。ui.focus でフォーカスを移さない対象を見分けるのに使う
const ROW_KEY_PREFIX = "row-";
// 直前の描画でペインがキーを持っていたか。Esc などでキーが外れた瞬間を見分けるのに使う
let wasFocused = false;
// 描画中は state を書けないため、キーが外れて閉じた欄は state ではなくこの印で閉じたものとして描く
let isClosedByBlur = false;
// ペイン全体を Claude Code にスクロールさせると上部のボタンも流れるため、本文だけを mod 側でずらす。その行数と上限
let bodyOffset = 0;
let maxBodyOffset = 0;

const SYSTEM = [
  "あなたは開発者と AI アシスタントの会話を記録する書記です。",
  "前回の要約と直近の会話ログを受け取り、会話の最新の状態を JSON で返します。経緯ではなく、いま有効な値だけを残します。",
  "出力は次の形の JSON オブジェクト 1 つだけとし、前後に文章やコードフェンスを付けません。",
  '{"topic": string, "open": string[], "settings": {"name": string, "value": string}[], "next": string[]}',
  "topic: 直近のやり取りで扱っている話題を 1〜2 文で書く。",
  "open: まだ決まっていない事項とユーザーの判断待ち。最大 7 件。解決したものは削除する。",
  "settings: 確定した設定や結論を、項目名と現在の値の組で書く。最大 12 件。同じ項目の値が変わったら上書きし、古い値を残さない。取り消された項目は削除する。",
  "next: これから着手する作業。最大 3 件。終わったものは削除する。",
  "各項目は日本語で 60 文字程度に収める。絵文字と誇張表現は使わない。",
].join("\n");

let isRunning = false;
let isPending = false;

const stripReminders = (text: string): string =>
  text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();

const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max)}…` : text;

const formatMessage = (message: SessionMessage): string | undefined => {
  const text = clip(stripReminders(message.text), MESSAGE_MAX_CHARS);
  const tools = message.toolUses.map((use) => use.tool);
  // tool_result だけを運ぶ user 行は会話の流れを持たないので送らない
  if (text === "" && tools.length === 0) return undefined;
  const label = message.role === "user" ? "ユーザー" : "アシスタント";
  const toolNote =
    tools.length > 0 ? `\n(使用ツール: ${tools.join(", ")})` : "";

  return `[${label}]\n${text}${toolNote}`;
};

const buildTranscript = (messages: SessionMessage[]): string => {
  const lines = messages
    .map(formatMessage)
    .filter((line): line is string => line !== undefined);
  const joined = lines.join("\n\n");

  return joined.length > TRANSCRIPT_TAIL_CHARS
    ? joined.slice(-TRANSCRIPT_TAIL_CHARS)
    : joined;
};

const toStrings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const toSettings = (value: unknown): Setting[] =>
  Array.isArray(value)
    ? value.flatMap((item) =>
        typeof item?.name === "string" && typeof item?.value === "string"
          ? [{ name: item.name, value: item.value }]
          : []
      )
    : [];

const parseReply = (
  reply: string
): Omit<SessionSummary, "updatedAt" | "status"> | undefined => {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const parsed = JSON.parse(reply.slice(start, end + 1)) as Record<
      string,
      unknown
    >;

    return {
      topic: typeof parsed.topic === "string" ? parsed.topic : "",
      open: toStrings(parsed.open),
      settings: toSettings(parsed.settings),
      next: toStrings(parsed.next),
    };
  } catch {
    return undefined;
  }
};

const summarize = async ($: EngineInterface): Promise<void> => {
  // ターンが連続して終わったときに要約を並行して走らせず、最後に 1 回だけやり直す
  if (isRunning) {
    isPending = true;
    return;
  }
  isRunning = true;
  try {
    const messages = await $.session.messages();
    const transcript = buildTranscript(messages);
    if (transcript === "") return;
    const previous = await read($, summary);
    await update(
      $,
      summary,
      (current): SessionSummary => ({
        ...current,
        status: "running",
        error: undefined,
      })
    );

    const previousJson = JSON.stringify({
      topic: previous.topic,
      open: previous.open,
      settings: previous.settings,
      next: previous.next,
    });
    const result = await $.model.complete({
      model: MODEL,
      system: SYSTEM,
      prompt: `# 前回の要約\n${previousJson}\n\n# 直近の会話ログ\n${transcript}`,
      // high では思考にもトークンを使うため、上限が低いと JSON の出力が途中で切れる
      effort: "high",
      maxTokens: 8000,
      timeoutMs: 120000,
    });
    if (!result.isAnswered) {
      await update(
        $,
        summary,
        (current): SessionSummary => ({
          ...current,
          status: "error",
          error: result.reason,
        })
      );
      return;
    }
    const parsed = parseReply(result.text);
    if (parsed === undefined) {
      await update(
        $,
        summary,
        (current): SessionSummary => ({
          ...current,
          status: "error",
          error: "JSON を読み取れませんでした",
        })
      );
      return;
    }
    const now = await $.clock.now();
    await update(
      $,
      summary,
      (): SessionSummary => ({
        ...parsed,
        updatedAt: now,
        status: "idle",
      })
    );
  } catch (error) {
    // 許可されていないモデルなど、送信前に拒否されると complete は reject する。捕まえないと「更新中」のまま残る
    await update(
      $,
      summary,
      (current): SessionSummary => ({
        ...current,
        status: "error",
        error: String(error),
      })
    );
  } finally {
    isRunning = false;
    if (isPending) {
      isPending = false;
      void summarize($);
    }
  }
};

// 全角の文字は 2 桁を占めるため、折り返し後の行数を見積もるときに 2 として数える
const isWide = (code: number): boolean =>
  (code >= 0x1100 && code <= 0x115f) ||
  (code >= 0x2e80 && code <= 0xa4cf) ||
  (code >= 0xac00 && code <= 0xd7a3) ||
  (code >= 0xf900 && code <= 0xfaff) ||
  (code >= 0xfe30 && code <= 0xfe4f) ||
  (code >= 0xff00 && code <= 0xff60) ||
  (code >= 0xffe0 && code <= 0xffe6) ||
  code >= 0x20000;

const displayWidth = (text: string): number => {
  let width = 0;
  for (const char of text) width += isWide(char.codePointAt(0) ?? 0) ? 2 : 1;
  return width;
};

const wrappedRows = (text: string, columns: number): number =>
  Math.max(1, Math.ceil(displayWidth(text) / Math.max(1, columns)));

const buildCommentPrompt = (items: DraftComment[]): string => {
  const blocks = items.map((item) =>
    item.target === null ? item.text : `> ${item.target}\n${item.text}`
  );

  return ["セッションの要約へのコメントです。", ...blocks].join("\n\n");
};

const sendComments = async ($: EngineInterface): Promise<void> => {
  const drafts = await read($, comments);
  if (drafts.items.length === 0) return;
  const result = await $.prompt.submit({
    text: buildCommentPrompt(drafts.items),
    asUser: true,
  });
  // 送れなかったときに下書きを消すと、コメントが失われる
  if (result.drop !== undefined) {
    $.ui.toast(`コメントを送れませんでした: ${result.drop}`);
    return;
  }
  const sentIds = new Set(drafts.items.map((item) => item.id));
  // 送信を待つ間に追加された下書きは送っていないので残す
  await update($, comments, (current) => ({
    ...current,
    items: current.items.filter((item) => !sentIds.has(item.id)),
  }));
};

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    await $.command.register({
      name: "session-summary",
      description: "セッションの要約ペインを開き、要約を更新する",
    });
    void $.ui.open(PANE_OPTIONS);

    return next(e);
  });

  on("command.run", { command: "session-summary" }, async ($) => {
    // ctrl+x tab を覚えなくても、コマンドを打てばそのまま矢印キーでスクロールできるようにする
    await $.ui.open({ ...PANE_OPTIONS, focus: true });
    $.clock.after(0, () => void summarize($));

    return { text: "セッションの要約を更新しています。" };
  });

  on("turn.complete", async ($, e, next) => {
    const result = await next(e);
    // サブエージェントのターンと中断されたターンは会話の区切りではないので要約しない
    if (e.agentId === undefined && !e.isAborted) {
      // turn.complete の処理時間に要約の待ち時間を含めないよう、タイマーで切り離す
      $.clock.after(0, () => void summarize($));
    }

    return result;
  });

  // フォーカスが当たったボタンは反転表示で白く塗られ、行をクリックした後もそのまま残るため、人の操作で行へ移るフォーカスは受け付けない
  on("ui.focus", { requestId: PANE }, ($, e, next) =>
    e.origin.kind === "person" && e.element?.startsWith(ROW_KEY_PREFIX)
      ? {}
      : next(e)
  );

  // next を呼ばずに答えると Claude Code はペインを動かさないので、本文のずらす量だけを変えて描き直す
  on("ui.scroll", { requestId: PANE }, ($, e) => {
    const offset = Math.min(maxBodyOffset, Math.max(0, bodyOffset + e.by));
    if (offset !== bodyOffset) {
      bodyOffset = offset;
      $.ui.invalidate("ui.render");
    }

    return {};
  });

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e);
    const { Box, Text, Button } = elements;
    // mobile の要素表には Input が無いため、入力欄はそれ以外の描画先でだけ出す
    const Input = "Input" in elements ? elements.Input : undefined;
    const state = await read($, summary);
    const drafts = await read($, comments);

    // Esc でキーが外れると入力欄の中身が空になり、編集中の下書きが消えたように見えるため、開いている欄を閉じて元の表示に戻す
    if (wasFocused && !e.props.isFocused) {
      isClosedByBlur = true;
      delete typing[TARGET_INPUT];
      if (drafts.editingId) delete typing[`edit-${drafts.editingId}`];
    }
    wasFocused = e.props.isFocused;
    const target = isClosedByBlur ? null : drafts.target;
    const editingId = isClosedByBlur ? null : drafts.editingId ?? null;

    const focusInput = async (inputKey: string) => {
      // ボタンのクリックではペインがキーを受け取らず focus が拒否されるため、focus 付きで開き直してキーを移す
      await $.ui.open({ ...PANE_OPTIONS, focus: true });
      // プロンプト欄に文字があると open の focus も拒否される。その場合は入力欄を押せば入力できるので、拒否は無視する
      await $.ui
        .focus({ requestId: PANE, key: inputKey })
        .catch(() => undefined);
    };

    // 入力欄が 2 つ同時に出ると autoFocus が競合するため、行の選択と編集は片方だけにする
    const selectTarget = async (text: string) => {
      const isSelecting = target !== text;
      isClosedByBlur = false;
      await update($, comments, (current) => ({
        ...current,
        target: isSelecting ? text : null,
        editingId: null,
      }));
      if (isSelecting) await focusInput(TARGET_INPUT);
    };

    const editInputKey = (id: string) => `edit-${id}`;

    const toggleEdit = async (draft: DraftComment) => {
      const isEditing = editingId !== draft.id;
      isClosedByBlur = false;
      typing[editInputKey(draft.id)] = draft.text;
      await update($, comments, (current) => ({
        ...current,
        target: null,
        editingId: isEditing ? draft.id : null,
      }));
      if (isEditing) await focusInput(editInputKey(draft.id));
    };

    // 空のまま確定したときは消したいのか判断できないため、編集の取り消しとして扱う
    const saveEdit = (id: string) => (text: string) => {
      delete typing[editInputKey(id)];
      void update($, comments, (current) => ({
        ...current,
        editingId: null,
        items:
          text.trim() === ""
            ? current.items
            : current.items.map((item) =>
                item.id === id ? { ...item, text } : item
              ),
      }));
    };

    const addComment = (inputKey: string, target: string | null) => (
      text: string
    ) => {
      typing[inputKey] = "";
      if (text.trim() === "") return;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      void update($, comments, (current) => ({
        target: null,
        items: [...current.items, { id, target, text }],
      }));
    };

    const commentInput = (
      inputKey: string,
      target: string | null,
      placeholder: string
    ) =>
      Input !== undefined && (
        <Input
          key={inputKey}
          // ペインがキーを受け取ったとき、行の下の入力欄から入力を始められるようにする
          autoFocus={inputKey === TARGET_INPUT ? true : undefined}
          placeholder={placeholder}
          submitLabel="下書きに追加"
          value={typing[inputKey] ?? ""}
          onInput={(value: string) => {
            typing[inputKey] = value;
          }}
          onSubmit={addComment(inputKey, target)}
        />
      );

    const removeComment = (id: string) =>
      void update($, comments, (current) => ({
        ...current,
        items: current.items.filter((item) => item.id !== id),
      }));

    const rule = "─".repeat(Math.max(1, e.props.bodyColumns));
    const heading = (text: string) => (
      <>
        <Text color="subtle">{rule}</Text>
        <Text bold color="suggestion">
          {text}
        </Text>
      </>
    );
    const settingTexts = state.settings.map(
      (setting) => `${setting.name}: ${setting.value}`
    );
    const shownTexts = new Set([
      state.topic,
      ...state.open,
      ...settingTexts,
      ...state.next,
    ]);
    // 要約の更新で行の文言が変わると対象の行が消えるため、その下書きは対象の文言を付けて下部に出す
    const bottomDrafts = drafts.items.filter(
      (draft) => draft.target === null || !shownTexts.has(draft.target)
    );

    const draftView = (draft: DraftComment, isTargetShown: boolean) => (
      <Box flexDirection="column">
        {isTargetShown && draft.target !== null && (
          <Text dimColor>&gt; {draft.target}</Text>
        )}
        {editingId === draft.id && Input !== undefined ? (
          <Box flexDirection="column">
            <Input
              key={editInputKey(draft.id)}
              autoFocus
              submitLabel="保存"
              value={typing[editInputKey(draft.id)] ?? draft.text}
              onInput={(value: string) => {
                typing[editInputKey(draft.id)] = value;
              }}
              onSubmit={saveEdit(draft.id)}
            />
            <Box flexDirection="row" flexShrink={0}>
              <Button
                key={`cancel-${draft.id}`}
                onPress={() => void toggleEdit(draft)}
              >
                取り消し
              </Button>
            </Box>
          </Box>
        ) : (
          <Box flexDirection="row" gap={1}>
            {/* コメントの文を押すと、その場で編集に切り替わる */}
            <Box flexShrink={1}>
              <Button
                key={`${ROW_KEY_PREFIX}edit-${draft.id}`}
                plain
                onPress={() => void toggleEdit(draft)}
              >
                <Text color="suggestion">
                  {isTargetShown ? "" : "  "}-&gt; {draft.text}
                </Text>
              </Button>
            </Box>
            <Box flexShrink={0}>
              <Button
                key={`remove-${draft.id}`}
                onPress={() => removeComment(draft.id)}
              >
                削除
              </Button>
            </Box>
          </Box>
        )}
      </Box>
    );

    // 項目を押すとコメントの対象になり、その行のすぐ下に入力欄が出る。もう一度押すと解除する
    const item = (key: string, text: string, prefix: string) => (
      <Box flexDirection="column">
        <Button key={key} plain onPress={() => void selectTarget(text)}>
          <Text
            color={target === text ? "suggestion" : undefined}
            bold={target === text}
          >
            {prefix}
            {text}
          </Text>
        </Button>
        {drafts.items
          .filter((draft) => draft.target === text)
          .map((draft) => draftView(draft, false))}
        {target === text &&
          commentInput(
            TARGET_INPUT,
            text,
            "この行へのコメントを入力して Enter"
          )}
      </Box>
    );
    const section = (key: string, title: string, items: string[]) => (
      <Box flexDirection="column" marginTop={1}>
        {heading(title)}
        {items.length === 0 ? (
          <Text dimColor>なし</Text>
        ) : (
          items.map((text, i) =>
            item(`${ROW_KEY_PREFIX}${key}-${i}`, text, "- ")
          )
        )}
      </Box>
    );

    // 更新の進み具合は出さず、失敗したときだけ理由を出す。出さないと要約が古いままの理由が分からない
    const errorText =
      state.status === "error" ? `更新に失敗: ${state.error ?? ""}` : null;

    const commentHint = "行を押すと、その行へのコメントを書ける";

    // 本文の行数は描かれた結果から得られないため、文字幅とペインの幅から見積もり、スクロールの上限に使う
    const columns = e.props.bodyColumns;
    // 削除ボタンと間隔の分だけ、下書きの文が使える幅は狭い
    const draftColumns = Math.max(1, columns - 9);
    const inputRows = Input === undefined ? 0 : 1;
    const draftRows = (draft: DraftComment, isTargetShown: boolean) =>
      (isTargetShown && draft.target !== null
        ? wrappedRows(`> ${draft.target}`, columns)
        : 0) +
      (editingId === draft.id && Input !== undefined
        ? 2
        : wrappedRows(
            `${isTargetShown ? "" : "  "}-> ${draft.text}`,
            draftColumns
          ));
    const itemRows = (text: string, prefix: string) =>
      wrappedRows(`${prefix}${text}`, columns) +
      drafts.items
        .filter((draft) => draft.target === text)
        .reduce((sum, draft) => sum + draftRows(draft, false), 0) +
      (target === text ? inputRows : 0);
    const sectionRows = (items: string[]) =>
      3 +
      (items.length === 0
        ? 1
        : items.reduce((sum, text) => sum + itemRows(text, "- "), 0));
    const bodyRows =
      3 +
      (state.topic === "" ? 1 : itemRows(state.topic, "")) +
      sectionRows(state.open) +
      sectionRows(settingTexts) +
      sectionRows(state.next) +
      3 +
      wrappedRows(commentHint, columns) +
      bottomDrafts.reduce((sum, draft) => sum + draftRows(draft, true), 0);
    const headerRows =
      1 +
      (errorText === null ? 0 : wrappedRows(errorText, columns)) +
      inputRows;
    const viewportRows = Math.max(1, e.props.scroll.bodyRows - headerRows);
    // 見積もりが実際より少ないと末尾に届かなくなるため、数行の余裕を足す
    maxBodyOffset = Math.max(0, bodyRows + 2 - viewportRows);
    bodyOffset = Math.min(bodyOffset, maxBodyOffset);

    return (
      <Box flexDirection="column" height={e.props.scroll.bodyRows}>
        <Box flexDirection="column" flexShrink={0}>
          {/* 幅の狭い dock ではステータス文と同じ行に置くとボタンが押し出されるため、ボタンだけの行にする */}
          <Box flexDirection="row" flexShrink={0} gap={1}>
            <Button key="refresh" onPress={() => void summarize($)}>
              更新
            </Button>
            {drafts.items.length > 0 && (
              <Button key="send" onPress={() => void sendComments($)}>
                送信 ({drafts.items.length} 件)
              </Button>
            )}
          </Box>
          {errorText !== null && <Text color="error">{errorText}</Text>}
          {commentInput(
            GENERAL_INPUT,
            null,
            "全体へのコメントを入力して Enter"
          )}
        </Box>
        <Box
          flexDirection="column"
          flexGrow={1}
          flexShrink={1}
          overflow="hidden"
        >
          <Box flexDirection="column" flexShrink={0} marginTop={-bodyOffset}>
            <Box flexDirection="column" marginTop={1}>
              {heading("いまの話題")}
              {state.topic === "" ? (
                <Text dimColor>なし</Text>
              ) : (
                item(`${ROW_KEY_PREFIX}topic`, state.topic, "")
              )}
            </Box>
            {section("open", "未決定・判断待ち", state.open)}
            {section("settings", "現在の設定・結論", settingTexts)}
            {section("next", "次にやること", state.next)}
            <Box flexDirection="column" marginTop={1}>
              {heading(`コメント (下書き ${drafts.items.length} 件)`)}
              <Text dimColor>{commentHint}</Text>
              {bottomDrafts.map((draft) => draftView(draft, true))}
            </Box>
          </Box>
        </Box>
      </Box>
    );
  });
};
