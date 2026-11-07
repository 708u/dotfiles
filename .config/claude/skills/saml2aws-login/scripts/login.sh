#!/usr/bin/env bash
# herdr の右 pane で saml2aws login を実行し、終了するまで Enter を送り続ける。
# 各プロンプト (Username, Password, role 選択) は保存済みの値か既定値で進む。
set -euo pipefail

account="${1:-gsuite}"
timeout="${2:-120}"

if [[ "${HERDR_ENV:-}" != 1 ]]; then
  echo "herdr の pane 内で実行されていない" >&2
  exit 1
fi

pane=$(herdr pane split --current --direction right --cwd "$PWD" --no-focus | jq -r '.result.pane.pane_id // empty')
if [[ -z "$pane" ]]; then
  echo "pane の作成に失敗" >&2
  exit 1
fi
# 結果に関わらず、作成した pane を終了時に閉じる
trap 'herdr pane close "$pane" >/dev/null 2>&1 || true' EXIT

# login 済みのとき saml2aws は何も出力せずに終了するため、終了コードを目印として表示する。
# 入力した command 行も画面に残るため、目印は数字が続く形で照合する
herdr pane run "$pane" "saml2aws login -a $account; echo \"SAML2AWS_EXIT=\$?\"" >/dev/null

read_screen() {
  herdr pane read "$pane" --source recent-unwrapped --lines "$1"
}

deadline=$((SECONDS + timeout))
while ((SECONDS < deadline)); do
  sleep 2
  screen=$(read_screen 60)
  if code=$(grep -oE 'SAML2AWS_EXIT=[0-9]+' <<<"$screen" | tail -1); then
    code=${code#SAML2AWS_EXIT=}
    if [[ "$code" != 0 ]]; then
      echo "status=failed exit=$code"
      grep -vE '^\s*$' <<<"$screen" | tail -15
      exit 1
    fi
    if grep -q 'Your new access key pair has been stored' <<<"$screen"; then
      echo "status=logged_in"
      grep -E 'will expire at' <<<"$screen" | tail -1 || true
    else
      echo "status=already_logged_in"
    fi
    exit 0
  fi
  herdr pane send-keys "$pane" enter >/dev/null
done

echo "status=timeout"
read_screen 15
exit 1
