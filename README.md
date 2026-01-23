# dotfiles

1. Check installed dependencies

```
bash check_dependencies.sh
```
2. Symlink

```
bash symlink.sh
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