#!/usr/bin/env bash
# Regenerates brand/png/ from the SVGs.
#
# The SVGs are the source; these PNGs are derived and committed because the
# places that need them cannot take an SVG: npm's README renderer, most social
# card scrapers, and any chat client that pastes an image.
#
# librsvg rather than a headless browser, because the wordmark in
# flare-kit-logo.svg and flare-kit-banner.svg is already OUTLINED PATHS (see
# build.mjs) — there is no webfont to resolve, so there is nothing a browser
# would get right that librsvg gets wrong. architecture.svg and packages.svg do
# use live <text> on a system font stack; librsvg resolves those through
# fontconfig, and the committed output was checked by eye.
#
#   brew install librsvg
#   ./brand/to-png.sh
#
# 2x everywhere: these are shown at CSS size on retina displays, and a 1x PNG
# of a diagram is unreadable. The 512 mark is the square icon size that avatar
# and app-listing forms ask for.
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p png

rsvg-convert -z 2 flare-kit-mark.svg    -o png/flare-kit-mark-2x.png
rsvg-convert -w 512 -h 512 flare-kit-mark.svg -o png/flare-kit-mark-512.png
rsvg-convert -z 2 flare-kit-logo.svg    -o png/flare-kit-logo-2x.png
rsvg-convert -z 2 flare-kit-banner.svg  -o png/flare-kit-banner-2x.png
rsvg-convert -z 2 architecture.svg      -o png/architecture-2x.png
rsvg-convert -z 2 packages.svg          -o png/packages-2x.png

echo "Regenerated:"
ls -1 png/
