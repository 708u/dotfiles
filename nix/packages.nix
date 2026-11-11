{ pkgs, inputs, ... }:
let
  zoetrope = pkgs.rustPlatform.buildRustPackage {
    pname = "zoetrope";
    version = (builtins.fromTOML (builtins.readFile "${inputs.zoetrope}/Cargo.toml")).package.version;
    src = inputs.zoetrope;
    cargoLock.lockFile = "${inputs.zoetrope}/Cargo.lock";
    # codex の探索は更新時刻から日付のディレクトリを決めるため、
    # 更新時刻が 1970 年に揃う nix store の fixture ではこの test が失敗する
    checkFlags = [ "--skip=provider::tests::open_finds_every_file_of_a_fixture_session" ];
  };
in
{
  home.packages = with pkgs; [
    ansible
    awscli2
    bat
    buf
    bun
    cargo
    circleci-cli
    clang-tools
    colima
    coreutils
    deno
    direnv
    dive
    envchain
    eza
    fd
    figlet
    fira-code
    hackgen-font
    hackgen-nf-font
    nerd-fonts.symbols-only
    fzf
    gh
    ghq
    git
    git-lfs
    gnugrep
    go_1_27
    gogcli
    goku
    golangci-lint
    graphviz
    grpcurl
    herdr
    hyperfine
    # jp2a  # nixpkgs で broken
    jq
    just
    lazydocker
    lsd
    macism
    mutagen
    mutagen-compose
    mysql84
    parallel
    pnpm
    procs
    protobuf
    ripgrep
    rustc
    saml2aws
    shellcheck
    stripe-cli
    terminal-notifier
    tflint
    tig
    tmux
    tree
    trufflehog
    uv
    wget
    yarn
    zellij
    zoetrope
    zoxide
    zsh
    zsh-completions
  ];
}
