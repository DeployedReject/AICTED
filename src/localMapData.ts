export interface LocalMapData {
  code: string;
  buildings: string[];
  parks: string[];
  water: string[];
  roads: { d: string; major: boolean }[];
  labels: { text: string; x: number; y: number; angle: number; kind: string }[];
}

const loaders = import.meta.glob<{ default: LocalMapData }>('./assets/hubs/*.json');

export async function loadLocalMap(code: string) {
  const loader = loaders[`./assets/hubs/${code}.json`];
  if (!loader) throw new Error(`Missing local vector asset: ${code}`);
  return (await loader()).default;
}
