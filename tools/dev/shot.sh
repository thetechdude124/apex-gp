#!/bin/sh
# Headless screenshot of a dev page or of the running game. Needs tools/dev/serve.py running.
#
#   tools/dev/shot.sh <out.png> <url> [wait ms]
#
#   tools/dev/shot.sh /tmp/p.png "http://127.0.0.1:8123/tools/dev/studio.html?car=porsche&views=front,rear,side,top&team=2"
#   tools/dev/shot.sh /tmp/g.png "http://127.0.0.1:8123/?auto=hallberg&vehicle=porsche&field=mixed&cam=2" 30000
#
# Prints page console messages and errors. Set PROF to a unique name when several run at once.
OUT=$1; URL=$2; WAIT=${3:-6000}
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --use-angle=metal --hide-scrollbars --mute-audio \
  --window-size=${SIZE:-1600,1000} --virtual-time-budget=$WAIT --user-data-dir=${TMPDIR:-/tmp}/apex-shot-${PROF:-main} \
  --enable-logging=stderr --v=0 --screenshot="$OUT" "$URL" 2>&1 | grep "CONSOLE" | sed 's/^.*CONSOLE[^"]*//' | head -${LINES_MAX:-12}
