#!/usr/bin/env bash
# cmux の右 pane で saml2aws login を実行し、終了するまで Enter を送り続ける。
# 各プロンプト (Username, Password, role 選択) は保存済みの値か既定値で進む。
set -euo pipefail

account="${1:-gsuite}"
timeout="${2:-120}"

pane_out=$(cmux new-pane --direction right)
surface=$(grep -oE 'surface:[0-9]+' <<<"$pane_out" | head -1)
if [[ -z "$surface" ]]; then
  echo "pane の作成に失敗: $pane_out" >&2
  exit 1
fi

# login 済みのとき saml2aws は何も出力せずに終了するため、終了コードを目印として表示する
cmux send --surface "$surface" "saml2aws login -a $account; echo \"SAML2AWS_EXIT=\$?\"\n" >/dev/null

deadline=$((SECONDS + timeout))
while ((SECONDS < deadline)); do
  sleep 2
  screen=$(cmux read-screen --surface "$surface" --lines 60)
  if code=$(grep -oE 'SAML2AWS_EXIT=[0-9]+' <<<"$screen" | tail -1); then
    code=${code#SAML2AWS_EXIT=}
    if [[ "$code" != 0 ]]; then
      echo "status=failed exit=$code surface=$surface"
      grep -vE '^\s*$' <<<"$screen" | tail -15
      exit 1
    fi
    if grep -q 'Your new access key pair has been stored' <<<"$screen"; then
      echo "status=logged_in surface=$surface"
      grep -E 'will expire at' <<<"$screen" | tail -1 || true
    else
      echo "status=already_logged_in surface=$surface"
    fi
    exit 0
  fi
  cmux send-key --surface "$surface" enter >/dev/null
done

echo "status=timeout surface=$surface"
cmux read-screen --surface "$surface" --lines 15
exit 1
