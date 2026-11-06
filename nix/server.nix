{ ... }:
{
  # 充電上限の制御は root の daemon が必要で、brew bundle の start_service では
  # 起動できないため、初回のみ手動で sudo brew services start batt && batt limit 80
  homebrew.brews = [ "batt" ];

  # Claude Code を常時稼働させるため、電源や蓋の状態に関係なくスリープさせない。
  # スリープ以外は消費電力を抑える側に寄せる
  system.activationScripts.postActivation.text = ''
    sudo pmset -a sleep 0
    sudo pmset -a disablesleep 1
    sudo pmset -a displaysleep 1
    sudo pmset -a powernap 0
    sudo pmset -a lowpowermode 1
  '';
}
