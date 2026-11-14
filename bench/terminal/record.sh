#!/bin/sh
# Records real coloured output (git log of ../folio, ls -laR of its node_modules) into data-real.js.
set -e
cd "$(dirname "$0")"
F=../../../folio
git -C "$F" log --graph --color=always --stat --decorate -n 4000 > real-gitlog.txt
(cd "$F/node_modules" && CLICOLOR_FORCE=1 ls -laRG . 2>/dev/null | head -c 6000000) > real-ls.txt
node -e 'const fs=require("fs");const r=(f)=>fs.readFileSync(f,"utf8").replace(/\n/g,"\r\n");fs.writeFileSync("data-real.js","window.REAL="+JSON.stringify({gitlog:r("real-gitlog.txt"),ls:r("real-ls.txt")})+";")'
