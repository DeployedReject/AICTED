import { useEffect, useRef, useState } from 'react';
import map from './assets/india-map.json';
import { loadLocalMap } from './localMapData';
import type { LocalMapData } from './localMapData';
import { LEG_DURATION, motionAt, OPENING_DURATION } from './mapMotion';

export default function IndiaMap() {
  const panelRef = useRef<HTMLElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const packetRef = useRef<SVGGElement>(null);
  const activeRouteRef = useRef<SVGPathElement>(null);
  const localReadyRef = useRef(false);
  const localSitesRef = useRef(new Map<string, SVGGElement>());
  const [leg, setLeg] = useState(0);
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 761px)').matches);
  const [localMaps, setLocalMaps] = useState<Record<string, LocalMapData>>({});
  const current = motionAt(OPENING_DURATION + leg * LEG_DURATION);
  const initialCamera = motionAt(0).camera;

  useEffect(() => {
    const media = window.matchMedia('(min-width: 761px)');
    const update = () => setIsDesktop(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!isDesktop) return;
    let cancelled = false;
    const next = motionAt(OPENING_DURATION + (leg + 1) * LEG_DURATION);
    const codes = [...new Set([current.fromIndex, current.toIndex, next.toIndex].map(index => map.hubs[index].code))];
    Promise.all(codes.map(loadLocalMap)).then(sites => {
      if (!cancelled) {
        localReadyRef.current = true;
        setLocalMaps(previous => ({ ...previous, ...Object.fromEntries(sites.map(site => [site.code, site])) }));
      }
    }).catch(() => { /* The national vector map remains available if a local asset cannot load. */ });
    return () => { cancelled = true; };
  }, [leg, isDesktop, current.fromIndex, current.toIndex]);

  useEffect(() => {
    const panel = panelRef.current;
    const svg = svgRef.current;
    if (!panel || !svg) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const desktop = window.matchMedia('(min-width: 761px)');
    let frameId = 0;
    let elapsed = 0;
    let lastTime = 0;
    let visible = true;
    let active = false;
    let currentLeg = 0;
    let aspect = 1;
    let overviewWidth = 630;
    let panelWidth = 683;
    let previousCamera = motionAt(0).camera;
    let blur = 0;

    function setCamera(x: number, y: number, width: number) {
      const height = width * aspect;
      svg!.setAttribute('viewBox', `${(x - width / 2).toFixed(3)} ${(y - height / 2).toFixed(3)} ${width.toFixed(3)} ${height.toFixed(3)}`);
      svg!.style.setProperty('--marker-scale', (width / 630).toFixed(4));
      svg!.style.setProperty('--detail-opacity', Math.max(0, Math.min(1, (180 - width) / 90)).toFixed(3));
      svg!.style.setProperty('--overview-opacity', Math.max(0, Math.min(1, (width - 100) / 140)).toFixed(3));
      for (const hub of map.hubs) {
        const distance = Math.hypot(x - hub.x, y - hub.y);
        const t = Math.max(0, Math.min(1, (distance - 8) / 28));
        localSitesRef.current.get(hub.code)?.setAttribute('opacity', String(1 - t * t * (3 - 2 * t)));
      }
    }

    function measure() {
      const rect = panel!.getBoundingClientRect();
      panelWidth = rect.width || 683;
      aspect = rect.width ? rect.height / rect.width : 1;
      overviewWidth = Math.max(630, 650 / aspect);
      if (!active) {
        const initial = motionAt(0).camera;
        if (reducedMotion.matches) setCamera(310, 338, overviewWidth);
        else setCamera(initial.x, initial.y, initial.width);
      }
    }

    function animate(time: number) {
      if (!active) return;
      if (!localReadyRef.current) {
        lastTime = time;
        const initial = motionAt(0).camera;
        setCamera(initial.x, initial.y, initial.width);
        frameId = requestAnimationFrame(animate);
        return;
      }
      const delta = lastTime ? Math.max(1, time - lastTime) : 16;
      if (lastTime) elapsed += delta;
      lastTime = time;
      const frame = motionAt(elapsed);
      const zoomSpeed = Math.abs(Math.log(frame.camera.width / previousCamera.width)) * 1000 / delta;
      const panSpeed = Math.hypot(frame.camera.x - previousCamera.x, frame.camera.y - previousCamera.y) * panelWidth / frame.camera.width * 1000 / delta;
      const targetBlur = Math.min(2.8, zoomSpeed * .5 + panSpeed * .002);
      blur += (targetBlur - blur) * .3;
      svg!.style.setProperty('--camera-blur', `${blur.toFixed(2)}px`);
      previousCamera = frame.camera;
      setCamera(frame.camera.x, frame.camera.y, frame.camera.width);
      svg!.dataset.phase = frame.phase;
      packetRef.current?.setAttribute('transform', `translate(${frame.point.x.toFixed(3)} ${frame.point.y.toFixed(3)})`);
      packetRef.current?.setAttribute('opacity', elapsed > 800 ? '1' : '0');
      activeRouteRef.current?.setAttribute('d', frame.route);
      if (frame.leg !== currentLeg) {
        currentLeg = frame.leg;
        setLeg(frame.leg);
      }
      frameId = requestAnimationFrame(animate);
    }

    function updatePlayback() {
      const shouldRun = desktop.matches && !reducedMotion.matches && !document.hidden && visible;
      if (reducedMotion.matches) {
        setCamera(310, 338, overviewWidth);
        svg!.dataset.phase = 'still';
        packetRef.current?.setAttribute('opacity', '0');
        svg!.style.setProperty('--camera-blur', '0px');
      }
      if (shouldRun === active) return;
      active = shouldRun;
      lastTime = 0;
      cancelAnimationFrame(frameId);
      if (active) frameId = requestAnimationFrame(animate);
    }

    const resize = new ResizeObserver(measure);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      updatePlayback();
    });
    resize.observe(panel);
    intersection.observe(panel);
    reducedMotion.addEventListener('change', updatePlayback);
    desktop.addEventListener('change', updatePlayback);
    document.addEventListener('visibilitychange', updatePlayback);
    measure();
    updatePlayback();
    return () => {
      active = false;
      cancelAnimationFrame(frameId);
      resize.disconnect();
      intersection.disconnect();
      reducedMotion.removeEventListener('change', updatePlayback);
      desktop.removeEventListener('change', updatePlayback);
      document.removeEventListener('visibilitychange', updatePlayback);
    };
  }, []);

  return <section ref={panelRef} className="network-panel" aria-hidden="true">
    <div className="map-wrap">
      <svg ref={svgRef} className="india-map" viewBox={`${initialCamera.x - initialCamera.width / 2} ${initialCamera.y - initialCamera.width / 2} ${initialCamera.width} ${initialCamera.width}`} focusable="false">
        <defs>
          <clipPath id="local-map-bounds"><rect x="-44" y="-44" width="88" height="88" /></clipPath>
          <pattern id="map-dots" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".4" className="land-dot" /></pattern>
          <clipPath id="india-clip">{map.outlines.map((d, i) => <path key={i} d={d} fillRule="evenodd" />)}</clipPath>
        </defs>
        <g className="map-graticule">
          {[80, 180, 280, 380, 480, 580].map(x => <path key={`v${x}`} d={`M${x} -400V1100`} />)}
          {[80, 180, 280, 380, 480, 580].map(y => <path key={`h${y}`} d={`M-400 ${y}H1100`} />)}
          {[80, 180, 280, 380, 480, 580].flatMap(x => [80, 180, 280, 380, 480, 580].map(y => <path className="grid-cross" key={`${x}-${y}`} d={`M${x - 2} ${y}h4M${x} ${y - 2}v4`} />))}
        </g>
        <g className="map-geography" fillRule="evenodd">{map.outlines.map((d, i) => <path key={i} d={d} vectorEffect="non-scaling-stroke" />)}</g>
        <g className="overview-texture" clipPath="url(#india-clip)"><rect width="600" height="650" fill="url(#map-dots)" /></g>
        <g className="local-links">{map.nodes.filter((_, i) => i % 2 === 0).map((n, i) => <path key={i} d={`M${n.x},${n.y}L${map.hubs[n.hub].x},${map.hubs[n.hub].y}`} vectorEffect="non-scaling-stroke" />)}</g>
        <g className="network-links">{map.links.map((d, i) => <path key={i} d={d} vectorEffect="non-scaling-stroke" />)}</g>
        <g className="local-details">{map.hubs.map(hub => {
          const site = localMaps[hub.code];
          if (!site) return null;
          return <g key={site.code} ref={node => { if (node) localSitesRef.current.set(site.code, node); else localSitesRef.current.delete(site.code); }} transform={`translate(${hub.x} ${hub.y})`} clipPath="url(#local-map-bounds)" opacity="0">
            <rect className="local-ground" x="-44" y="-44" width="88" height="88" />
            <g className="local-parks">{site.parks.map((d, i) => <path key={i} d={d} />)}</g>
            <g className="local-water">{site.water.map((d, i) => <path key={i} d={d} />)}</g>
            <g className="local-streets">{site.roads.map((road, i) => <path key={i} d={road.d} className={road.major ? 'major-street' : ''} />)}</g>
            <g className="local-street-centres">{site.roads.filter(road => road.major).map((road, i) => <path key={i} d={road.d} />)}</g>
            <g className="local-buildings">{site.buildings.map((d, i) => <path key={i} d={d} />)}</g>
            <g className="local-labels">{site.labels.map((label, i) => <text key={i} x={label.x} y={label.y} textAnchor="middle" transform={label.angle ? `rotate(${label.angle} ${label.x} ${label.y})` : undefined} className={label.kind === 'road' ? 'road-label' : 'place-label'}>{label.text}</text>)}</g>
          </g>;
        })}</g>
        <path ref={activeRouteRef} className="active-route" d={current.route} vectorEffect="non-scaling-stroke" />
        <g className="institution-nodes">{map.nodes.map((n, i) => <circle key={i} cx={n.x} cy={n.y} r="1.4" vectorEffect="non-scaling-stroke" />)}</g>
        <g className="office-nodes">{map.hubs.map((h, i) => <g key={h.code}>
          <circle className="office-ring" cx={h.x} cy={h.y} r={i === 0 ? 5.5 : 4.5} vectorEffect="non-scaling-stroke" />
          <circle className="office-dot" cx={h.x} cy={h.y} r="2" />
          <text x={h.x + h.labelX} y={h.y + h.labelY} textAnchor={h.labelX < 0 ? 'end' : 'start'}>{h.name}</text>
        </g>)}</g>
        <g ref={packetRef} className="travelling-packet" transform={`translate(${map.hubs[0].x} ${map.hubs[0].y})`} opacity="0"><g className="packet-shape"><circle r="8" /><rect x="-2.5" y="-2.5" width="5" height="5" rx=".5" /></g></g>
      </svg>
    </div>
  </section>;
}
