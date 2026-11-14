#!/bin/sh
# Usage: ./run.sh            all engines and scenarios, 3 repetitions -> results.json
#        ENGINES=terminal SCENARIOS=bulk,agent REPS=1 ./run.sh
# Needs: npm install here, ../../../terminal built (dist/), ../../../folio with electron and esbuild installed.
set -e
cd "$(dirname "$0")"
[ -f data-real.js ] || ./record.sh
F=../../../folio/node_modules/.bin
$F/esbuild bench.js --bundle --format=iife --outfile=out.js --log-level=warning
$F/electron main.cjs 2>&1 | grep '^{'
