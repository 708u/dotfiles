// PreToolUse hook。リポジトリへの書き込みや外部サービスへの送信に、natural-japanese の
// finalize.sh で承認されていない日本語の行が含まれている場合、ツール呼び出しをブロックする。
//
// natural-japanese と同様に、人に届くテキストと、リポジトリ内のドキュメントやコメントのみを対象とする。
// - Write / Edit / MultiEdit: git で管理されているファイル。ドキュメントは全文、コードはコメントのみ
// - Bash: git commit や、gh を使った pr / issue / release の作成・編集・コメント
// - Artifact: 公開される HTML
// - MCP: 書き込みを示す名前のツールの引数
//
// hook のバグによってすべての作業が止まらないよう、チェック自体が失敗したときはブロックしない。
// 代わりに、壊れたチェックが見落とされないように、失敗がユーザーに表示される。
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

type Mode = "text" | "code";

type Edit = { old_string?: string; new_string?: string };

type ToolInput = Edit & {
  file_path?: string;
  content?: string;
  edits?: Edit[];
  command?: string;
  action?: string;
};

type HookInput = { tool_name?: string; tool_input?: ToolInput };

type HookOutput = {
  hookSpecificOutput?: {
    hookEventName: "PreToolUse";
    permissionDecision: "deny";
    permissionDecisionReason: string;
  };
  systemMessage?: string;
};

// 数日前に承認されたテキストは、同じ文を別の場所に投稿する場合でも使われないため、除外する
const RETENTION_DAYS = 7;

// NOTE: 直接記述された場合でも --amend で再承認された場合でも小さな修正が受け入れられるよう、この値は finalize.sh の AMEND_MAX_CHARS と同じにしておくこと。
const AMEND_MAX_CHARS = 20;

// 短い日本語の断片は偶然無関係なテキストと一致することがあるため、日本語文字だけでの比較は行わない。
const MIN_KEY_CHARS = 6;

const RETRY_MINUTES = 60;

const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
const NON_JAPANESE =
  /[^\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー]/gu;

// 書き込み先で箇条書きやテーブルの書式が異なる場合でもチェックが機能するよう、
// スペースと Markdown 記号を除いて比較する
export function normalize(s: string): string {
  return s.replace(/^\s*\d+[.)]\s+/gm, "").replace(/[\s　|*_`#>+\-]+/g, "");
}

export function japaneseKey(s: string): string {
  return s.replace(NON_JAPANESE, "");
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

// mode は各行のどの部分をチェックするかを決める。
// - text: HTML タグを除いた行全体。Markdown 内に書かれたタグも除去する
// - code: コメント部分のみ。文字列リテラルなどの中の日本語はチェックしない
function target(line: string, mode: Mode): string | undefined {
  if (mode === "text") return stripTags(line);
  const m =
    line.match(/^\s*(?:\/\/+|#+|--|;+|\/\*+|\*+|<!--)\s?(.*)$/) ??
    line.match(/\s(?:\/\/|#)\s+(.*)$/);
  return m?.[1].replace(/\s*(?:\*\/|-->)\s*$/, "");
}

// テーブル行の各セルを承認済みテキストと比較する
function sentences(line: string, mode: Mode): string[] {
  const t = target(line, mode);
  if (t === undefined) return [];
  return t
    .split("|")
    .flatMap((cell) => cell.split(/(?<=。)/))
    .filter((s) => JAPANESE.test(s));
}

function distance(a: string, b: string, max: number): number {
  const x = [...a];
  const y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= y.length; j++) {
      const v = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[y.length];
}

// 既存のファイルにすでにある文は、移動や改行位置の変更であるため、承認済みとして扱う。
// ASCII、コード、数字、空白を除いた日本語文字が、既存のテキストまたは承認済みのテキストと一致する場合も、その文は承認済みとして扱われる。
// これにより、識別子を追加・置換しただけの変更は承認済みとして扱われる。
// 既存ファイル内の文と日本語がわずかに異なるだけの文も、変更された文字数の合計が上限内に収まっている限り、同様に扱われる。
export function unapprovedLines(
  input: string,
  mode: Mode,
  approvedText: string,
  existingText: string,
): string[] {
  const corpus = (text: string) => {
    const t = mode === "text" ? stripTags(text) : text;
    return { normalized: normalize(t), key: japaneseKey(t) };
  };
  const approved = corpus(approvedText);
  const existing = corpus(existingText);
  const candidates = [
    ...new Set(
      existingText
        .split("\n")
        .flatMap((l) => sentences(l, mode))
        .map(japaneseKey),
    ),
  ];

  // 対象の文と既存ファイル内の文との間で、変更された日本語文字数の最小値を返す。
  // 日本語の半分以上が変更された文は小さな修正ではなく書き直しとみなされるため、undefined が返される。
  const nearestDistance = (key: string): number | undefined => {
    const limit = Math.min(
      AMEND_MAX_CHARS,
      Math.floor(([...key].length - 1) / 2),
    );
    let best: number | undefined;
    for (const candidate of candidates) {
      if (Math.abs([...candidate].length - [...key].length) > limit) continue;
      const d = distance(key, candidate, limit);
      if (d <= limit && (best === undefined || d < best)) best = d;
      if (best === 0) break;
    }
    return best;
  };

  const unapproved: string[] = [];
  const smallEdits: string[] = [];
  let changed = 0;
  for (const line of input.split("\n")) {
    let status: "approved" | "small" | "unapproved" = "approved";
    for (const sentence of sentences(line, mode)) {
      const n = normalize(sentence);
      if (
        n === "" ||
        existing.normalized.includes(n) ||
        approved.normalized.includes(n)
      )
        continue;
      const key = japaneseKey(sentence);
      if (
        [...key].length >= MIN_KEY_CHARS &&
        (existing.key.includes(key) || approved.key.includes(key))
      )
        continue;
      const d = nearestDistance(key);
      if (d === undefined) {
        status = "unapproved";
        break;
      }
      changed += d;
      status = "small";
    }
    if (status === "unapproved") unapproved.push(line);
    if (status === "small") smallEdits.push(line);
  }
  return changed > AMEND_MAX_CHARS
    ? [...unapproved, ...smallEdits]
    : unapproved;
}

const TOKEN = String.raw`"(?:[^"\\]|\\.)*"|'[^']*'|[^\s;&|()]+`;
const FIELD = String.raw`[\w\[\]]+=`;

// 標準入力から読み込んだシェルコマンドのうち、テキストとして送信される部分を出力する。
//
// - texts: -m、--body、--title、-f/-F key=value などのメッセージ引数とヒアドキュメントの本文
// - files: -F、--file、--body-file、--notes-file で本文として渡されるファイルのパス
//
// 変数は、同じコマンド内で代入されているか、環境変数に設定されている場合にのみ展開される。
// sed スクリプトなど、コマンドの他の部分は出力されない。
export function commandTexts(
  command: string,
  env: Record<string, string | undefined> = process.env,
) {
  const vars: Record<string, string> = {};
  const expand = (raw: string) => {
    if (raw.startsWith("'")) return raw.slice(1, -1);
    const s = raw.startsWith('"')
      ? raw.slice(1, -1).replace(/\\(.)/g, "$1")
      : raw;
    return s
      .replace(
        /\$\{?([A-Za-z_]\w*)\}?/g,
        (m, name: string) => vars[name] ?? env[name] ?? m,
      )
      .replace(/^~(?=\/|$)/, env.HOME ?? "~");
  };
  for (const m of command.matchAll(
    new RegExp(
      String.raw`(?:^|[\s;&|(])(?:export\s+)?([A-Za-z_]\w*)=(${TOKEN})`,
      "g",
    ),
  )) {
    vars[m[1]] = expand(m[2]);
  }

  const files: string[] = [];
  for (const m of command.matchAll(
    new RegExp(
      String.raw`(?:^|\s)(?:-F|--file|--body-file|--notes-file)(?:=|\s+)(${TOKEN})`,
      "g",
    ),
  )) {
    const value = expand(m[1]);
    if (value === "-") continue;
    const field = value.match(new RegExp(`^${FIELD}(@?)(.*)$`, "s"));
    if (!field) files.push(value);
    else if (field[1] === "@") files.push(field[2]);
  }

  const texts: string[] = [];
  const flags = String.raw`-[A-Za-z]*m|--message|-b|--body|-t|--title|-n|--notes|-f|-F|--field|--raw-field`;
  for (const m of command.matchAll(
    new RegExp(String.raw`(?:^|\s)(?:${flags})(?:=|\s+)(${TOKEN})`, "g"),
  )) {
    texts.push(expand(m[1]).replace(new RegExp(`^${FIELD}(?!@)`), ""));
  }
  for (const m of command.matchAll(
    /<<-?[ \t]*(['"]?)(\w+)\1[^\n]*\n([\s\S]*?)^[ \t]*\2[ \t]*$/gm,
  )) {
    texts.push(m[3]);
  }
  return { texts, files, hasHeredoc: command.includes("<<") };
}

// Write、Edit、または MultiEdit が生成する行を、変更後の内容として出力する。
// new_string は行の一部のみを置換することが多いため、その行の残りの部分とあわせてチェックされる。
export function editedLines(input: ToolInput, existing: string): string {
  if (typeof input.content === "string") return input.content;
  let content = existing;
  const lines: string[] = [];
  for (const edit of input.edits ?? [input]) {
    const old = edit.old_string ?? "";
    const replacement = edit.new_string ?? "";
    const at = old === "" ? -1 : content.indexOf(old);
    if (at < 0) {
      lines.push(replacement);
      continue;
    }
    const start = at === 0 ? 0 : content.lastIndexOf("\n", at - 1) + 1;
    const after = at + old.length;
    const end =
      content.indexOf("\n", after) < 0
        ? content.length
        : content.indexOf("\n", after);
    lines.push(
      content.slice(start, at) + replacement + content.slice(after, end),
    );
    content = content.slice(0, at) + replacement + content.slice(after);
  }
  return lines.join("\n");
}

function modeForPath(path: string): Mode {
  return /\.(md|mdx|markdown|txt|rst|adoc|html|htm)$/.test(path)
    ? "text"
    : "code";
}

function git(dir: string, ...args: string[]): boolean {
  return (
    Bun.spawnSync(["git", "-C", dir, ...args], {
      stdout: "ignore",
      stderr: "ignore",
    }).exitCode === 0
  );
}

// 出力先が git で管理されているファイルかどうかを判定する。新しいファイルの場合は、最も近い既存の親ディレクトリから確認する
function inRepository(path: string): boolean {
  let dir = dirname(path);
  while (!existsSync(dir) && dir !== "/") dir = dirname(dir);
  return (
    git(dir, "rev-parse", "--is-inside-work-tree") &&
    !git(dir, "check-ignore", "-q", path)
  );
}

function readText(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function readApproved(dir: string): string {
  const limit = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  try {
    return readdirSync(dir)
      .map((name) => join(dir, name))
      .filter((path) => {
        const stat = statSync(path);
        return stat.isFile() && stat.mtimeMs > limit;
      })
      .map(readText)
      .join("\n");
  } catch {
    return "";
  }
}

const COMMIT_OR_GH =
  /\bgit\s+(-C\s+\S+\s+)?commit(\s|$)|\bgh\s+(pr|issue|release)\s+(create|edit|comment|review)\b/;
const MCP_WRITE =
  /(send|create|update|reply|post|comment|draft|forward|schedule|write|edit|batch|append|add)/i;

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object")
    return Object.values(value).flatMap(strings);
  return [];
}

export function run(raw: string, store: string): HookOutput | undefined {
  const { tool_name: tool = "", tool_input: input = {} } = JSON.parse(
    raw,
  ) as HookInput;
  let approvedText: string | undefined;
  const unapproved: string[] = [];
  const errors: string[] = [];
  const check = (mode: Mode, text: string, existingPath?: string) => {
    approvedText ??= readApproved(join(store, "approved"));
    const existing = existingPath ? readText(existingPath) : "";
    unapproved.push(...unapprovedLines(text, mode, approvedText, existing));
  };

  if (tool === "Write" || tool === "Edit" || tool === "MultiEdit") {
    const file = input.file_path;
    if (!file || !inRepository(file)) return;
    check(modeForPath(file), editedLines(input, readText(file)), file);
  } else if (tool === "Bash") {
    const command = input.command ?? "";
    if (!COMMIT_OR_GH.test(command)) return;
    const { texts, files, hasHeredoc } = commandTexts(command);
    // 本文をファイルとして渡す引数。
    // 同じコマンド内のヒアドキュメントで作成されるファイルはまだ存在しないが、ヒアドキュメント自体はテキストとしてチェックされる。
    for (const path of files) {
      if (path.includes("$")) {
        errors.push(
          `本文のファイル (${path}) の変数を展開できません。変数は同じコマンドの中で代入してください`,
        );
      } else if (existsSync(path)) {
        check("text", readText(path));
      } else if (!hasHeredoc) {
        errors.push(`本文のファイル (${path}) を読み込めません`);
      }
    }
    // sed スクリプトや変数代入がテキストとして扱われないよう、コマンド全体ではなくメッセージ引数とヒアドキュメントのみをチェックする。
    check("text", texts.join("\n"));
  } else if (tool === "Artifact") {
    const file = input.file_path;
    if ((input.action ?? "publish") !== "publish" || !file || !existsSync(file))
      return;
    check(modeForPath(file), readText(file));
  } else if (tool.startsWith("mcp__")) {
    if (!MCP_WRITE.test(tool.split("__").pop() ?? "")) return;
    check("text", strings(input).join("\n"));
  } else {
    return;
  }

  const lines = [...new Set(unapproved)];
  if (lines.length === 0 && errors.length === 0) return;

  // 同じ未承認の行が 1 時間以内に再度送信された場合は許可する。
  // これにより、既存テキストの引用やコピーしたログなど、skill の対象外のテキストを記述できるようになる。
  // 読み取れない本文ファイルは内容がチェックされていないため、常にブロックされる。
  if (errors.length === 0) {
    const denied = join(store, "denied");
    const marker = join(
      denied,
      createHash("sha256").update(lines.join("\n")).digest("hex"),
    );
    const expiry = Date.now() - RETRY_MINUTES * 60 * 1000;
    if (existsSync(marker) && statSync(marker).mtimeMs > expiry) {
      rmSync(marker, { force: true });
      return;
    }
    mkdirSync(denied, { recursive: true });
    for (const name of readdirSync(denied)) {
      if (statSync(join(denied, name)).mtimeMs <= expiry)
        rmSync(join(denied, name), { force: true });
    }
    writeFileSync(marker, "");
  }

  const retry =
    errors.length > 0
      ? errors.slice(0, 20).join("\n")
      : "既存の文の引用やログの転記など、skill の対象外の文だけであれば、同じ内容で再実行すると通ります。";
  const reason = [
    "natural-japanese で承認していない日本語が含まれています。natural-japanese skill の手順 (英語で書く、translate.sh で翻訳する、英語と照合する、finalize.sh で承認する) を通した最終稿を使ってください。",
    retry,
    "承認されていない行:",
    ...lines.slice(0, 20),
  ].join("\n");
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
}

if (import.meta.main) {
  const store =
    process.env.NATURAL_JAPANESE_STORE ??
    join(process.env.HOME ?? "", ".cache/natural-japanese");
  let output: HookOutput | undefined;
  try {
    output = run(await Bun.stdin.text(), store);
  } catch (error) {
    output = {
      systemMessage: `natural-japanese-gate の判定に失敗したため、ブロックせずに通しました: ${error}`,
    };
  }
  if (output) process.stdout.write(JSON.stringify(output));
}
