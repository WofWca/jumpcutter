#!/usr/bin/env python3

# Ok, we've actually stopped doing branches and started commiting to `master` directly
# so I guess we only need a version bump commit now

import sys
import os
import json

# TODO chore: add scripts to
# * Merge the release branch, create a tag
# * `yarn install`, build, publish to Chrome Web Store, Mozilla, etc.

def main():
    """
    * Switch to a new `release-x.x.x` branch
    * Bump version in `manifest.json` (minor or patch, depending on arguments)
    * `git commit -m "chore: bump version"`
    """
    manifest_path = 'src/manifest.json'
    with open(manifest_path) as f:
        parsed = json.load(f)
    curr_version = parsed['version']
    major, minor, patch = [int(string) for string in curr_version.split('.')]

    def format_version():
        return '{}.{}.{}'.format(major, minor, patch)

    print('Current version: {}'.format(format_version()))

    release_type = sys.argv[1] if len(sys.argv) > 1 else None
    if release_type == 'minor':
        minor += 1
        patch = 0
    elif release_type == 'patch':
        patch += 1
    else:
        raise Exception('Expected release type ("minor" or "patch"), got {}'.format(release_type))

    bumped_version = format_version()
    print('Bumped version: {}'.format(bumped_version))

    with os.popen('git status --short') as stream:
        output = stream.read()
    if len(output) != 0:
        msg = input('Uncommited changes detected. Continue (y/n)?')
        if msg != 'y':
            return -1

    with open(manifest_path, 'r') as f:
        content = f.read()
    content = content.replace(curr_version, bumped_version)
    with open(manifest_path, 'w') as f:
        f.write(content)

    def exec_command(command):
        return_code = os.system(command)
        if return_code != 0:
            raise Exception()

    exec_command('git checkout -b release-{}'.format(bumped_version))
    exec_command('git add {}'.format(manifest_path))
    exec_command('git commit -m "chore: bump version"')

if __name__ == '__main__':
    main()
