# Dotfiles

## manual install

```sh
make install
```

### iterm2

- open iterm2 preferences
- check `General > Preferences > Load preferences from a custom folder or URL`
- set path `/Users/708u/ghq/github.com/708u/dotfiles/.config/iterm2`

### karabiner

- open karebiner preferences
- click Misc > Export & Import
- import `config/karabiner/karabiner.json` from this repo.

### vimium

- simply copy keyMapping and paste it to vimium option

## local settings

You can create local setting. It is ignored by git.

```bash
touch ./zsh/.local.zsh
# you can add setting only used by local environment.
```
