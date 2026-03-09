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
