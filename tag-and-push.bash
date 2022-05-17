#!/usr/bin/env bash

# https://stackoverflow.com/questions/821396/aborting-a-shell-script-if-any-command-returns-a-non-zero-value
set -e

currentVersion=$(cat src/manifest.json | grep -Po '(?<="version": ").+(?=")');
tagName=v$currentVersion;
git tag -s $tagName -m $tagName;
git push --recurse-submodules=on-demand gitlab master $tagName & git push --recurse-submodules=on-demand origin master $tagName;
