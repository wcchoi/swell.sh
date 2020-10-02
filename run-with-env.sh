#!/usr/bin/env bash

# this script runs Swell.sh with the NeoVim installed in the repo root

export PATH=$PWD/nvim-linux64/bin:$PATH
export VIMINIT=":source $PWD/nvim-linux64/init.vim"

./venv/bin/python app.py
