# PowerUP poster, 36 x 48 in

Portrait, print-ready: `poster.pdf` (one page, 36 x 48 in) and `poster.png` (3456 x 4608, 96 px/in).
The QR code points at the live demo, https://mrbese.github.io/PowerUp/.

Rebuild from the repo root (needs Playwright and `python3 -m pip install segno pillow`):

    NODE_PATH=$(npm root -g) node submission/poster-36x48/maps.cjs     # map-off.png, map-on.png from the pilot app
    NODE_PATH=$(npm root -g) node submission/poster-36x48/series.cjs   # fleet-series.json for the fleet-charge chart
    node submission/poster-36x48/render.mjs                             # poster.pdf, poster.png

The numbers are the ones `node pilot/app/cli.mjs` prints, plus `submission/devpost.md` (pilot business, Oct 14 evening replay).
The 24 x 36 in version is in `submission/poster/`.
