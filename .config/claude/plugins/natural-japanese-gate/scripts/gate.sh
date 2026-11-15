#!/usr/bin/env bash
# PreToolUse hook。リポジトリへの書き込みや外部サービスへの送信に、natural-japanese の
# finalize.sh で承認されていない日本語の行が含まれている場合、ツール呼び出しをブロックする。
#
# natural-japanese と同様に、人に届くテキストと、リポジトリ内のドキュメントやコメントのみを対象とする。
# - Write / Edit / MultiEdit: git で管理されているファイル。ドキュメントは全文、コードはコメントのみ
# - Bash: git commit や、gh を使った pr / issue / release の作成・編集・コメント
# - Artifact: 公開される HTML
# - MCP: 書き込みを示す名前のツールの引数
#
# hook のバグによってすべての作業が止まらないよう、チェック自体が失敗したときはブロックしない。
set -uo pipefail

export PATH="/etc/profiles/per-user/$USER/bin:/run/current-system/sw/bin:/usr/bin:/bin:$PATH"

STORE="${NATURAL_JAPANESE_STORE:-$HOME/.cache/natural-japanese}"
CHECK="$(cd "$(dirname "$0")" && pwd)/check-approved.pl"
INPUT="$(cat)"
TOOL="$(jq -r '.tool_name // empty' <<<"$INPUT" 2>/dev/null)" || exit 0

WORK="$(mktemp -d)" || exit 0
trap 'rm -rf "$WORK"' EXIT
UNAPPROVED="$WORK/unapproved.txt"
: >"$UNAPPROVED"

# 標準入力から行をチェックし、未承認の行を UNAPPROVED に追記する
check() {
  local args=("$1" "$STORE/approved")
  [ -n "${2:-}" ] && args+=("$2")
  perl "$CHECK" "${args[@]}" >>"$UNAPPROVED" 2>/dev/null || true
}

mode_for_path() {
  case "$1" in
    *.md | *.mdx | *.markdown | *.txt | *.rst | *.adoc | *.html | *.htm) echo text ;;
    *) echo code ;;
  esac
}

# 出力先が git で管理されているファイルかどうかを判定する。新しいファイルの場合は、最も近い既存の親ディレクトリから確認する
in_repository() {
  local dir
  dir="$(dirname "$1")"
  while [ ! -d "$dir" ] && [ "$dir" != "/" ]; do dir="$(dirname "$dir")"; done
  git -C "$dir" rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 1
  ! git -C "$dir" check-ignore -q "$1" 2>/dev/null
}

case "$TOOL" in
  Write | Edit | MultiEdit)
    FILE="$(jq -r '.tool_input.file_path // empty' <<<"$INPUT")"
    [ -n "$FILE" ] && in_repository "$FILE" || exit 0
    jq -r '.tool_input | .content // .new_string // ([.edits[]?.new_string] | join("\n"))' <<<"$INPUT" |
      check "$(mode_for_path "$FILE")" "$FILE"
    ;;
  Bash)
    CMD="$(jq -r '.tool_input.command // empty' <<<"$INPUT")"
    /usr/bin/grep -qE '\bgit[[:space:]]+(-C[[:space:]]+[^[:space:]]+[[:space:]]+)?commit([[:space:]]|$)|\bgh[[:space:]]+(pr|issue|release)[[:space:]]+(create|edit|comment|review)\b' <<<"$CMD" || exit 0
    # 本文をファイルとして渡す引数。hook が変数を展開できないため、変数を含むパスはブロックする
    while IFS= read -r path; do
      path="${path%\"}"; path="${path#\"}"; path="${path%\'}"; path="${path#\'}"
      path="${path/#\~/$HOME}"
      if [ "$path" = "-" ]; then
        continue
      elif [[ "$path" == *'$'* ]] || [ ! -f "$path" ]; then
        echo "本文のファイル ($path) を読み込めません。変数を使わず絶対パスで指定してください" >>"$UNAPPROVED"
      else
        check text <"$path"
      fi
    done < <(/usr/bin/grep -oE '(^|[[:space:]])(-F|--file|--body-file)(=|[[:space:]]+)[^[:space:];&|]+' <<<"$CMD" |
      sed -E 's/^[[:space:]]*(-F|--file|--body-file)(=|[[:space:]]+)//')
    # コマンドに直接書かれた本文 (-m やヒアドキュメント) は、改行と引用符で分割してからチェックする
    tr "\"'" '\n\n' <<<"$CMD" | check text
    ;;
  Artifact)
    FILE="$(jq -r 'select((.tool_input.action // "publish") == "publish") | .tool_input.file_path // empty' <<<"$INPUT")"
    [ -n "$FILE" ] && [ -f "$FILE" ] || exit 0
    check "$(mode_for_path "$FILE")" <"$FILE"
    ;;
  mcp__*)
    /usr/bin/grep -qiE '(send|create|update|reply|post|comment|draft|forward|schedule|write|edit|batch|append|add)' <<<"${TOOL##*__}" || exit 0
    jq -r '[.tool_input | .. | strings] | .[]' <<<"$INPUT" | check text
    ;;
  *)
    exit 0
    ;;
esac

[ -s "$UNAPPROVED" ] || exit 0

REASON="natural-japanese で承認していない日本語が含まれています。natural-japanese skill の手順 (英語で書く、translate.sh で翻訳する、英語と照合する、finalize.sh で承認する) を通した最終稿を使ってください。
承認されていない行:
$(head -20 "$UNAPPROVED")"

jq -n --arg reason "$REASON" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
exit 0
