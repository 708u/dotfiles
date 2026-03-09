#!/bin/bash

for file in .zshrc .gitignore .gitignore_global
do
    if [ ! -f ~/${file} ]; then
        ln -s $(pwd)/${file} ~/${file}
    fi
done

touch $(pwd)/zsh/.local.zsh
mkdir -p $(pwd)/zsh/completion/.local

# karabiner
if [ ! -d ~/.config/karabiner ]; then
    mkdir -p ~/.config
    ln -s $(pwd)/.config/karabiner ~/.config/karabiner
fi

# ghostty
if [ ! -d ~/.config/ghostty ]; then
    mkdir -p ~/.config
    ln -s $(pwd)/.config/ghostty ~/.config/ghostty
fi

# gh
if [ ! -f ~/.config/gh/config.yml ]; then
    mkdir -p ~/.config/gh
    ln -s $(pwd)/.config/gh/config.yml ~/.config/gh/config.yml
fi

# zellij
if [ ! -f ~/.config/zellij/config.kdl ]; then
    mkdir -p ~/.config/zellij
    ln -s $(pwd)/.config/zellij/config.kdl ~/.config/zellij/config.kdl
fi

# claude
mkdir -p ~/.claude
for file in CLAUDE.md settings.json statusline.sh
do
    if [ ! -f ~/.claude/${file} ]; then
        ln -s $(pwd)/.config/claude/${file} ~/.claude/${file}
    fi
done
for dir in agents commands skills
do
    if [ ! -d ~/.claude/${dir} ]; then
        ln -s $(pwd)/.config/claude/${dir} ~/.claude/${dir}
    fi
done
