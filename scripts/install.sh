#!/bin/bash

for file in .zshrc .gitignore .gitignore_global
do
    if [ ! -f ~/${file} ]; then
        ln -s $(pwd)/${file} ~/${file}
    fi
done

touch $(pwd)/zsh/.local.zsh
