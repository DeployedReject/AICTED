import map from './assets/india-map.json';

export type Point = { x: number; y: number };
const itinerary = [0, 3, 6, 7, 8, 4, 2, 0];
export const OPENING_DURATION = 850;
export const LEG_DURATION = 5900;
const LOCAL_WIDTH = 52;
const TRAVEL_WIDTH = 175;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => { const n = Math.min(1, Math.max(0, t)); return n * n * (3 - 2 * n); };

export function routeBetween(from: Point, to: Point, previous = from, next = to) {
  return { from, to,
    first: { x: from.x + (to.x - previous.x) / 6, y: from.y + (to.y - previous.y) / 6 },
    second: { x: to.x - (next.x - from.x) / 6, y: to.y - (next.y - from.y) / 6 },
  };
}

export function routePath(route: ReturnType<typeof routeBetween>) {
  return `M${route.from.x},${route.from.y} C${route.first.x},${route.first.y} ${route.second.x},${route.second.y} ${route.to.x},${route.to.y}`;
}

function along(route: ReturnType<typeof routeBetween>, t: number) {
  return {
    x: (1 - t) ** 3 * route.from.x + 3 * (1 - t) ** 2 * t * route.first.x + 3 * (1 - t) * t ** 2 * route.second.x + t ** 3 * route.to.x,
    y: (1 - t) ** 3 * route.from.y + 3 * (1 - t) ** 2 * t * route.first.y + 3 * (1 - t) * t ** 2 * route.second.y + t ** 3 * route.to.y,
  };
}

// Continuous, monotonic progress. Nonzero matching speeds prevent pauses at
// phase boundaries and keep the camera moving as it passes each hub.
const progressKnots = [
  [0, 0, .00003], [1400, .08, .00009], [2050, .25, .00035],
  [3350, .75, .00035], [4000, .92, .00009], [LEG_DURATION, 1, .00003],
];

function progressAt(time: number) {
  const index = progressKnots.findIndex((knot, i) => i > 0 && time <= knot[0]);
  const a = progressKnots[Math.max(0, index - 1)];
  const b = progressKnots[index < 0 ? progressKnots.length - 1 : index];
  const duration = b[0] - a[0];
  const t = (time - a[0]) / duration;
  return (2*t**3 - 3*t**2 + 1)*a[1] + (t**3 - 2*t**2 + t)*duration*a[2]
    + (-2*t**3 + 3*t**2)*b[1] + (t**3 - t**2)*duration*b[2];
}

// Local departure → partial pullback → local arrival, without any dwell.
export function motionAt(elapsed: number) {
  const flightTime = Math.max(0, elapsed - OPENING_DURATION);
  const leg = Math.floor(flightTime / LEG_DURATION) % (itinerary.length - 1);
  const time = flightTime % LEG_DURATION;
  const fromIndex = itinerary[leg];
  const toIndex = itinerary[leg + 1];
  const count = itinerary.length - 1;
  const previous = map.hubs[itinerary[(leg - 1 + count) % count]];
  const next = map.hubs[itinerary[(leg + 2) % count]];
  const route = routeBetween(map.hubs[fromIndex], map.hubs[toIndex], previous, next);
  const travel = progressAt(time);
  let local = 1;
  let phase = 'departure';
  if (time >= 1400 && time < 2050) {
    phase = 'zoom-out';
    local = 1 - ease((time - 1400) / 650);
  } else if (time < 3350) {
    phase = time < 1400 ? 'departure' : 'transit';
    if (time >= 2050) local = 0;
  } else if (time < 4000) {
    phase = 'zoom-in';
    local = ease((time - 3350) / 650);
  } else {
    phase = 'arrival';
  }
  const point = along(route, travel);
  if (elapsed < OPENING_DURATION) {
    phase = 'opening';
    local = ease(elapsed / OPENING_DURATION);
  }
  return { leg, fromIndex, toIndex, route: routePath(route), point, progress: travel, phase,
    camera: {
      x: point.x,
      y: point.y,
      width: mix(TRAVEL_WIDTH, LOCAL_WIDTH, local),
    },
  };
}
