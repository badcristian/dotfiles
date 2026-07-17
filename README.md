# dotfiles

1. Check installed dependencies

```
bash check_dependencies.sh
```
2. Symlink

```
bash symlink.sh
```

This also links VS Code user settings, keybindings, and local extensions from `files_to_symlink/vscode`.

For VS Code-specific details, see:

```
files_to_symlink/vscode/README.md
```

3. Add PhpStorm command line command

```
cd /usr/local/bin
touch storm
vim storm

---

#!/bin/sh

open -na "PhpStorm.app" --args "$@"

---
```
------
