#!/usr/bin/env bash
set -e

git clone https://github.com/xtermjs/xterm.js.git
cd xterm.js
git checkout 4.8.1
cp -r ../xterm-addon-terminado/ addons/
cp ../xterm-addon-terminado/tsconfig.all.json.patch ./
patch < tsconfig.all.json.patch
npm i
npm run package # Build lib/xterm.js
cd addons/xterm-addon-fit/
npm run package # Build addons/xterm-addon-fit.js
cd ../xterm-addon-webgl/
npm run package # Build addons/xterm-addon-webgl.js
cd ../xterm-addon-terminado/
npm run package # Build addons/xterm-addon-terminado.js
cd ../../
mkdir -p ../../static/lib/xterm/addons
cp css/xterm.css lib/xterm.js ../../static/lib/xterm
cp addons/xterm-addon-{fit,webgl,terminado}/lib/*.js ../../static/lib/xterm/addons
