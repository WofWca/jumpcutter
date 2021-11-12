#!/usr/bin/env bash

# https://stackoverflow.com/questions/821396/aborting-a-shell-script-if-any-command-returns-a-non-zero-value
set -e

currentVersion=$(cat src/manifest.json | grep -Po '(?<="version": ").+(?=")');
tagName=v$currentVersion;
git tag -s $tagName -m $tagName;
git push gitlab master $tagName & git push origin master $tagName;
