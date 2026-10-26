# Vector map assets

India boundaries by the **DataMeet India community**, licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
[Original dataset](https://github.com/datameet/maps/blob/master/Country/india-composite.geojson).

Changes: projected into local SVG coordinates, simplified, recoloured, and overlaid
with a decorative communication network. The dataset is not a certified current
administrative map. No state boundaries are invented or inferred.

`src/assets/india-map.json` contains the prepared vector geometry used by React.
`public/assets/india-network.svg` is a standalone reusable vector export.
Both include the mainland and islands supplied by the source dataset.

Regenerate with `python3 scripts/prepare-map.py /path/to/india-composite.geojson`.
No third-party Python packages are needed.

Blue points are a deterministic decorative distribution, not a verified directory
of institutions. Orange regional anchors are city-level positions. The Delhi HQ
point uses the coordinate from the supplied reference specification. Other office
sites and institution coordinates still need verification before any operational map.
The login map makes no database requests and contains no complaint or user data.

`Assets/aicte-mark.svg` is an original minimalist vector adaptation of the
AICTE emblem supplied by the user. It uses a transparent centre and exterior,
orange gear/lettering and a three-part emblem. It replaces the supplied PNG in
the header and favicon. It is separate from the DataMeet map licence.
User-supplied SVG glyphs under `Assets/glyphs` are used for case/message navigation.
Icons and the entire map remain SVG. No external fonts, map tiles, or paid assets
are used. The map panel is hidden on phone-sized viewports (760px and narrower).

The decorative map uses the site's light/dark surfaces with orange and blue
accents. There are no captions, compass, status bars, or playback controls.
`src/mapMotion.ts` defines the local display itinerary: opening zoom, local pan,
partial regional pullback, and a close arrival. The camera stays centred on the
moving point, with no dwell at hubs and smooth, continuous turns between routes.
Zoom-out is capped at 175 map units, avoiding a full-country overview during
normal playback. The 650ms transitions retain motion blur, which follows
camera velocity. Reduced-motion mode disables both movement and blur.

`src/assets/hubs/*.json` contains prepared street, building, park, water, and label
vectors from **OpenStreetMap contributors**, licensed under
[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
[Attribution and licence](https://www.openstreetmap.org/copyright).
Each extract records its API source URL and centre. Names are copied from OSM;
unnamed features are left unnamed. Local insets are enlarged relative to the
country geometry for this decorative animation; they are not a continuous-scale
navigation map, and city anchors are not certified office sites.

The nine extracts are fetched once during asset preparation, not by visitors.
The ignored helper `scripts/prepare-osm-vectors.py` builds the prepared paths.
The derived dataset is downloadable at `public/assets/local-map-data.json` under
ODbL. Street and building vectors are separate from the CC BY country geometry.

Rendering updates SVG attributes without rerendering the React tree each frame.
Motion stops when the panel is hidden, the tab is inactive, or reduced motion is
enabled. Local vector chunks load as static assets and are reused by the browser;
phone layouts do not request them. There are no external map API or database
requests for the animation.

## Typography

Self-hosted Adwaita Sans and Adwaita Mono are supplied under the SIL Open Font
License in `public/fonts/ADWAITA-LICENSE.txt`. Liberation Serif regular and bold
use the SIL Open Font License in `public/fonts/LIBERATION-LICENSE.txt`. WOFF2
files were losslessly compressed from installed source fonts; family names are
unchanged in the font data. UI forms use sans-serif, headings use serif, and
identifiers/timestamps use monospace. There are no external font requests.
