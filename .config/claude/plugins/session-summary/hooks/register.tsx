import { atom, read, update } from "claude-code";
import type { EngineInterface, Register, SessionMessage } from "claude-code";

import type {
  CommentDrafts,
  DiagramImage,
  DraftComment,
  PaneView,
  SessionDiagram,
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

const EMPTY_DIAGRAM: SessionDiagram = {
  title: "",
  mermaid: "",
  image: null,
  messageCount: 0,
  status: "idle",
};

const diagram = atom(
  { plugin: "session-summary", key: "diagram" } as const,
  EMPTY_DIAGRAM,
  { shape: "diagram-1" }
);

const paneView = atom(
  { plugin: "session-summary", key: "view" } as const,
  "summary" as PaneView,
  { shape: "view-1" }
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

const DIAGRAM_SYSTEM = [
  "あなたは開発者と AI アシスタントの会話を図にする担当です。",
  "直近の会話ログを受け取り、いま話している内容の理解を助ける mermaid の図を 1 つ作ります。",
  "話題に合う種類を選びます。処理や判断の流れは flowchart TD、やり取りの順序は sequenceDiagram、状態の移り変わりは stateDiagram-v2、構成要素の関係は flowchart TD か classDiagram を使います。",
  "表示先は縦に長く幅の狭いペインです。flowchart は上から下へ流し、横に 4 個以上並べません。ノードは 15 個以内にします。",
  'ラベルは日本語で短く書きます。flowchart のノードは A["ラベル"] のように二重引用符で囲み、ラベルの中に二重引用符を入れません。',
  "style、classDef、%%{init}%%、コメントは使いません。",
  "出力は次の形の JSON オブジェクト 1 つだけとし、前後に文章やコードフェンスを付けません。",
  '{"title": string, "mermaid": string}',
  "title は図が表す内容を 30 文字以内で書きます。",
].join("\n");

// 図にする内容の整理と mermaid の記述を 1 回の呼び出しで行う。構文の正しさと配置の判断で出来が分かれるため、要約より上のモデルを使う
const DIAGRAM_MODEL = "sonnet";
// mmdc の構文エラーを渡して書き直させる回数。図 1 枚の更新にかかる時間を抑えるため 1 回に留める
const DIAGRAM_RETRIES = 1;
// 端末の文字セルは縦が横の約 2 倍のため、画像の縦横比から行数を出すときに掛ける
const CELL_ASPECT = 0.5;

let isDrawing = false;
let isDrawPending = false;

// 倍率 100% の図の幅を、ペインの幅に対する割合で表す。幅いっぱいでは図の全体を見渡しにくいため半分にする
const BASE_WIDTH_RATIO = 0.5;
// 端末の画像は 255 桁が上限のため、それを超える倍率は効かない
const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
let zoomIndex = ZOOM_LEVELS.indexOf(1);
// 拡大した図はペインの幅からはみ出し、ペインは横にスクロールしないため、左端をずらす桁数を mod 側で持つ
let panColumns = 0;
// 端末にファイルを読ませる方式は端末によって描かれないため、PNG のバイト列を渡す。描画のたびに読み直さないよう、読んだ図を世代ごとに覚えておく
let pngCache: { key: string; base64: string } | null = null;
// 倍率を変えた直後は、はみ出した図の真ん中を見せる
let shouldCenterPan = true;

const parseDiagramReply = (
  reply: string
): { title: string; mermaid: string } | undefined => {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(reply.slice(start, end + 1)) as Record<
        string,
        unknown
      >;
      if (typeof parsed.mermaid === "string" && parsed.mermaid.trim() !== "") {
        return {
          title: typeof parsed.title === "string" ? parsed.title : "",
          mermaid: parsed.mermaid,
        };
      }
    } catch {
      // JSON の代わりにコードフェンスで返すことがあるので、下でそちらを試す
    }
  }
  const fence = reply.match(/```mermaid\s*\n([\s\S]*?)```/);

  return fence?.[1] === undefined
    ? undefined
    : { title: "", mermaid: fence[1] };
};

const BASE64_DIGITS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const decodeBase64Head = (text: string, count: number): number[] => {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of text) {
    const digit = BASE64_DIGITS.indexOf(char);
    if (digit < 0 || bytes.length >= count) break;
    buffer = ((buffer << 6) | digit) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return bytes;
};

// PNG の先頭 24 バイトのうち 16〜23 バイト目が IHDR の幅と高さ (ビッグエンディアン)
const readPngSize = (
  base64: string
): { width: number; height: number } | undefined => {
  const head = decodeBase64Head(base64.slice(0, 32), 24);
  if (head.length < 24) return undefined;
  const at = (offset: number) =>
    head
      .slice(offset, offset + 4)
      .reduce((value, byte) => value * 256 + byte, 0);

  return { width: at(16), height: at(20) };
};

const renderMermaid = async (
  $: EngineInterface,
  mermaid: string,
  path: string
): Promise<{ error: string } | { width: number; height: number }> => {
  const result = await $.process.run(
    [
      "mmdc",
      "-q",
      "-i",
      "-",
      "-o",
      path,
      "-t",
      "dark",
      "-b",
      "transparent",
      "-s",
      "2",
    ],
    { stdin: mermaid, timeoutMs: 60000 }
  );
  if (result.exitCode !== 0) {
    return { error: clip(result.stderr.trim() || result.stdout.trim(), 1500) };
  }
  const { base64 } = await $.fs.read(path, { as: "bytes" });
  const size = readPngSize(base64);

  return size ?? { error: "PNG の大きさを読み取れませんでした" };
};

const failDiagram = (
  $: EngineInterface,
  error: string
): Promise<SessionDiagram> =>
  update(
    $,
    diagram,
    (current): SessionDiagram => ({ ...current, status: "error", error })
  );

const drawDiagram = async ($: EngineInterface): Promise<void> => {
  // ターンが連続して終わったときに mmdc を並行して走らせず、最後に 1 回だけやり直す
  if (isDrawing) {
    isDrawPending = true;
    return;
  }
  isDrawing = true;
  try {
    const messages = await $.session.messages();
    const transcript = buildTranscript(messages);
    if (transcript === "") return;
    const previous = await update(
      $,
      diagram,
      (current): SessionDiagram => ({
        ...current,
        status: "running",
        error: undefined,
      })
    );
    const dir = `${((await $.env.get("TMPDIR")) ?? "/tmp").replace(
      /\/$/,
      ""
    )}/claude-session-summary`;
    await $.process.run(["mkdir", "-p", dir]);
    const path = `${dir}/${await $.session.id()}.png`;

    let prompt = `# 直近の会話ログ\n${transcript}`;
    for (let attempt = 0; attempt <= DIAGRAM_RETRIES; attempt++) {
      const result = await $.model.complete({
        model: DIAGRAM_MODEL,
        system: DIAGRAM_SYSTEM,
        prompt,
        effort: "high",
        maxTokens: 8000,
        timeoutMs: 120000,
      });
      if (!result.isAnswered) {
        await failDiagram($, result.reason);
        return;
      }
      const parsed = parseDiagramReply(result.text);
      if (parsed === undefined) {
        await failDiagram($, "mermaid を読み取れませんでした");
        return;
      }
      const rendered = await renderMermaid($, parsed.mermaid, path);
      if ("error" in rendered) {
        if (attempt === DIAGRAM_RETRIES) {
          await failDiagram($, `mmdc: ${rendered.error}`);
          return;
        }
        prompt = `${prompt}\n\n# 前回の出力\n${parsed.mermaid}\n\n# mmdc のエラー\n${rendered.error}\n\nエラーを直した図を同じ JSON の形で返してください。`;
        continue;
      }
      const image: DiagramImage = {
        path,
        ...rendered,
        generation: (previous.image?.generation ?? 0) + 1,
      };
      await update(
        $,
        diagram,
        (): SessionDiagram => ({
          title: parsed.title,
          mermaid: parsed.mermaid,
          image,
          messageCount: messages.length,
          status: "idle",
        })
      );
      return;
    }
  } catch (error) {
    // mmdc が入っていないと process.run が reject する
    const message = String(error);
    await failDiagram(
      $,
      /ENOENT|not found|cannot start/i.test(message)
        ? "mmdc が見つかりません。npm i -g @mermaid-js/mermaid-cli で入れてください"
        : message
    );
  } finally {
    isDrawing = false;
    if (isDrawPending) {
      isDrawPending = false;
      void drawDiagram($);
    }
  }
};

// 図はモデル呼び出しと mmdc で時間がかかるため、図を見ていて会話が進んだときだけ作り直す
const drawDiagramIfStale = async ($: EngineInterface): Promise<void> => {
  const [current, messages] = await Promise.all([
    read($, diagram),
    $.session.messages(),
  ]);
  if (current.image === null || current.messageCount !== messages.length) {
    await drawDiagram($);
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
    if (e.agentId !== undefined || e.isAborted) return result;
    // -p の実行や SDK はペインを描く先が無く、要約しても誰も読まないままモデルの呼び出しだけが毎ターン走る
    if ((await $.session.surfaces()).length === 0) return result;
    // turn.complete の処理時間に要約の待ち時間を含めないよう、タイマーで切り離す
    $.clock.after(0, () => void summarize($));
    if ((await read($, paneView)) === "diagram") {
      $.clock.after(0, () => void drawDiagram($));
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
    const { Box, Text, Button, Code } = elements;
    // mobile の要素表には Input が無いため、入力欄はそれ以外の描画先でだけ出す
    const Input = "Input" in elements ? elements.Input : undefined;
    // 画像を描けるのは terminal だけなので、それ以外では mermaid のコードを出す
    const Image = "Image" in elements ? elements.Image : undefined;
    const state = await read($, summary);
    const drafts = await read($, comments);
    const view = await read($, paneView);
    const diagramState = await read($, diagram);

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
    const shown = view === "diagram" ? diagramState : state;
    const errorText =
      shown.status === "error" ? `更新に失敗: ${shown.error ?? ""}` : null;

    const switchView = async (next: PaneView) => {
      if (next === view) return;
      // 要約と図で本文の長さが違うため、前のタブのスクロール位置を持ち越さない
      bodyOffset = 0;
      await update($, paneView, () => next);
      if (next === "diagram")
        $.clock.after(0, () => void drawDiagramIfStale($));
    };
    // 1 つのボタンで切り替え、表示中の側を色と太字で示す
    const viewLabel = (key: PaneView, label: string) => (
      <Text
        // dimColor だけでは表示中の側との差が小さいため、区切り線と同じ subtle の色をさらに薄くする
        color={view === key ? "suggestion" : "subtle"}
        bold={view === key}
        dimColor={view !== key}
      >
        {label}
      </Text>
    );
    const viewToggle = (
      <Button
        key="toggle-view"
        onPress={() =>
          void switchView(view === "diagram" ? "summary" : "diagram")
        }
      >
        {viewLabel("summary", "要約")}
        <Text color="subtle" dimColor>
          {" / "}
        </Text>
        {viewLabel("diagram", "図")}
      </Button>
    );

    const columns = e.props.bodyColumns;
    const image = diagramState.image;
    const pngKey = image === null ? "" : `${image.path}#${image.generation}`;
    if (image !== null && pngCache?.key !== pngKey) {
      const bytes = await $.fs
        .read(image.path, { as: "bytes" })
        .catch(() => undefined);
      pngCache =
        bytes === undefined ? null : { key: pngKey, base64: bytes.base64 };
    }
    const png = pngCache?.key === pngKey ? pngCache.base64 : undefined;
    const zoom = ZOOM_LEVELS[zoomIndex] ?? 1;
    // 縦長の図を広げると端末の上限の行数を超えるため、そのときは幅を縮めて縦横比を保つ
    const imageSize = (() => {
      if (image === null) return { columns: 0, rows: 0 };
      const ratio = (image.height / Math.max(1, image.width)) * CELL_ASPECT;
      const fitColumns = Math.max(
        1,
        Math.min(
          Math.round(columns * BASE_WIDTH_RATIO * zoom),
          255,
          Math.floor(255 / Math.max(ratio, 0.001))
        )
      );

      return {
        columns: fitColumns,
        rows: Math.min(255, Math.max(1, Math.round(fitColumns * ratio))),
      };
    })();
    const maxPanColumns = Math.max(0, imageSize.columns - columns);
    if (shouldCenterPan) {
      panColumns = Math.floor(maxPanColumns / 2);
      shouldCenterPan = false;
    }
    panColumns = Math.min(panColumns, maxPanColumns);
    // ペインより狭い図は左に寄るため、余った幅の半分だけ右へずらして真ん中に置く
    const imageLeft =
      maxPanColumns > 0
        ? -panColumns
        : Math.floor((columns - imageSize.columns) / 2);
    const panStep = Math.max(1, Math.floor(columns / 2));

    const setZoom = (index: number) => {
      zoomIndex = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, index));
      shouldCenterPan = true;
      $.ui.invalidate("ui.render");
    };
    const pan = (by: number) => {
      panColumns = Math.min(maxPanColumns, Math.max(0, panColumns + by));
      $.ui.invalidate("ui.render");
    };
    const zoomControls = view === "diagram" && image !== null && (
      <Box flexDirection="row" flexShrink={0} gap={1}>
        <Button key="zoom-out" onPress={() => setZoom(zoomIndex - 1)}>
          -
        </Button>
        <Text>{Math.round(zoom * 100)}%</Text>
        <Button key="zoom-in" onPress={() => setZoom(zoomIndex + 1)}>
          +
        </Button>
        {maxPanColumns > 0 && (
          <>
            <Button key="pan-left" onPress={() => pan(-panStep)}>
              ◀
            </Button>
            <Button key="pan-right" onPress={() => pan(panStep)}>
              ▶
            </Button>
          </>
        )}
      </Box>
    );
    const diagramNote =
      image !== null
        ? null
        : diagramState.status === "running"
        ? "図を作成しています"
        : "まだ図がありません。更新を押すと作成します";
    const diagramBody = (
      <Box flexDirection="column" marginTop={1}>
        {heading(diagramState.title === "" ? "図" : diagramState.title)}
        {diagramNote !== null && <Text dimColor>{diagramNote}</Text>}
        {image !== null &&
          (Image !== undefined && png === undefined ? (
            <Text color="error">図の画像を読み込めませんでした</Text>
          ) : Image !== undefined && png !== undefined ? (
            <Box width={columns} overflow="hidden">
              <Box flexShrink={0} marginLeft={imageLeft}>
                <Image
                  key="diagram"
                  source={{ png }}
                  columns={imageSize.columns}
                  rows={imageSize.rows}
                  alt={diagramState.title === "" ? "図" : diagramState.title}
                />
              </Box>
            </Box>
          ) : (
            <Code language="mermaid" source={diagramState.mermaid} />
          ))}
      </Box>
    );

    const commentHint = "行を押すと、その行へのコメントを書ける";

    // 本文の行数は描かれた結果から得られないため、文字幅とペインの幅から見積もり、スクロールの上限に使う
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
    const summaryRows =
      3 +
      (state.topic === "" ? 1 : itemRows(state.topic, "")) +
      sectionRows(state.open) +
      sectionRows(settingTexts) +
      sectionRows(state.next) +
      3 +
      wrappedRows(commentHint, columns) +
      bottomDrafts.reduce((sum, draft) => sum + draftRows(draft, true), 0);
    const bodyRows =
      view === "diagram"
        ? 3 +
          wrappedRows(
            diagramState.title === "" ? "図" : diagramState.title,
            columns
          ) +
          (diagramNote === null ? 0 : wrappedRows(diagramNote, columns)) +
          (Image === undefined
            ? diagramState.mermaid.split("\n").length
            : imageSize.rows)
        : summaryRows;
    const headerRows =
      1 +
      (zoomControls === false ? 0 : 1) +
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
            {viewToggle}
            <Button
              key="refresh"
              onPress={() =>
                void (view === "diagram" ? drawDiagram($) : summarize($))
              }
            >
              更新
            </Button>
            {drafts.items.length > 0 && (
              <Button key="send" onPress={() => void sendComments($)}>
                送信 ({drafts.items.length} 件)
              </Button>
            )}
          </Box>
          {zoomControls}
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
            {view === "diagram" ? (
              diagramBody
            ) : (
              <>
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
              </>
            )}
          </Box>
        </Box>
      </Box>
    );
  });
};
