#!/usr/bin/env bash
# saml2aws の Browser provider で login する。
# 最初に herdr の右 pane で実行して Enter を送り続け、Google の認証を求められたら Ghostty の新しいウィンドウでの実行に切り替える。
set -euo pipefail

account="${1:-gsuite}"
timeout="${2:-300}"
force="${3:-}"
auth_wait=20

if [[ "${HERDR_ENV:-}" != 1 ]]; then
  echo "status=not_herdr"
  exit 2
fi

chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
saml2aws_bin=$(command -v saml2aws)
env_args=(
  SAML2AWS_IDP_PROVIDER=Browser
  SAML2AWS_BROWSER_TYPE=chrome
  "SAML2AWS_BROWSER_EXECUTABLE_PATH=$chrome"
)
args=(login -a "$account" --skip-prompt)
if [[ "$force" == force ]]; then
  args+=(--force)
fi

pane=""
work=$(mktemp -d)
cleanup() {
  if [[ -n "$pane" ]]; then
    herdr pane close "$pane" >/dev/null 2>&1 || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT

# $1: saml2aws の出力、$2: 終了コード
report() {
  if [[ "$2" != 0 ]]; then
    if grep -qE 'could not install driver|install the driver' <<<"$1"; then
      echo "status=driver_missing exit=$2"
    else
      echo "status=failed exit=$2"
    fi
    grep -vE '^\s*$' <<<"$1" | tail -15
    return 1
  fi
  if grep -q 'Your new access key pair has been stored' <<<"$1"; then
    echo "status=logged_in"
    grep -E 'will expire at' <<<"$1" | tail -1 || true
  else
    echo "status=already_logged_in"
  fi
}

read_screen() {
  herdr pane read "$pane" --source recent-unwrapped --lines "$1"
}

run_in_pane() {
  pane=$(herdr pane split --current --direction right --cwd "$PWD" --no-focus | jq -r '.result.pane.pane_id // empty')
  if [[ -z "$pane" ]]; then
    echo "pane の作成に失敗" >&2
    exit 1
  fi
  # login 済みのとき saml2aws は何も出力せずに終了するため、終了コードを目印として表示する。
  # 入力した command 行も画面に残るため、目印は数字が続く形で照合する
  herdr pane run "$pane" "$(printf '%q ' env "${env_args[@]}" "$saml2aws_bin" "${args[@]}"); echo \"SAML2AWS_EXIT=\$?\"" >/dev/null

  local started=$SECONDS screen code
  while ((SECONDS - started < timeout)); do
    sleep 2
    screen=$(read_screen 60)
    if code=$(grep -oE 'SAML2AWS_EXIT=[0-9]+' <<<"$screen" | tail -1); then
      report "$screen" "${code#SAML2AWS_EXIT=}"
      exit $?
    fi
    # 保存した Google の login 状態が有効なら、browser を開いてすぐに storage state を保存して role 選択に進む。
    # 保存されないまま auth_wait を過ぎたときは passkey の認証を待っている。pane から起動した Chrome は Bluetooth を使えず
    # スマートフォンの passkey で認証できないため、pane を閉じて Ghostty での実行に切り替える
    if ! grep -q 'saving storage state' <<<"$screen"; then
      if ((SECONDS - started >= auth_wait)); then
        herdr pane close "$pane" >/dev/null 2>&1 || true
        pane=""
        return 0
      fi
      continue
    fi
    herdr pane send-keys "$pane" enter >/dev/null
  done
  echo "status=timeout"
  read_screen 15
  exit 1
}

# herdr のサーバーは launchd から起動されるため、pane から起動した Chrome は macOS の Bluetooth の利用許可を得られない。
# Bluetooth の利用許可を要求できる Ghostty を open -na で起動し、その中で実行する。
# role 選択のプロンプトに TTY が要るため、出力は pipe ではなく script で記録する
run_in_ghostty() {
  local log="$work/login.log" code_file="$work/exit_code"
  open -na Ghostty.app --args -e /usr/bin/env "${env_args[@]}" \
    /bin/sh -c 'log=$1; code=$2; shift 2; script -q "$log" "$@"; echo $? > "$code"' \
    sh "$log" "$code_file" "$saml2aws_bin" "${args[@]}"
  echo "status=ghostty_opened"

  local deadline=$((SECONDS + timeout))
  while ((SECONDS < deadline)); do
    if [[ -s "$code_file" ]]; then
      report "$(tr -d '\r' <"$log")" "$(<"$code_file")"
      exit $?
    fi
    sleep 2
  done
  echo "status=timeout"
  exit 1
}

run_in_pane
run_in_ghostty
