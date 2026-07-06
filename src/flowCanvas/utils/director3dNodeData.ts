import type { FlowDirector3dData } from '../types';

type DirectorActor = FlowDirector3dData['actors'][number];
type DirectorCamera = FlowDirector3dData['cameras'][number];
type DirectorShot = FlowDirector3dData['shots'][number];
type DirectorVector = [number, number, number];

const DIRECTOR_SHOT_MOTIONS = new Set<NonNullable<DirectorShot['motion']>>([
  'static',
  'dolly',
  'orbit',
  'pan',
  'custom_path',
]);

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isSafeAssetId(value: string): boolean {
  return Boolean(value) && !/^(?:blob:|data:|https?:\/\/)/i.test(value);
}

function readSafeAssetId(value: unknown): string | undefined {
  const trimmed = readTrimmedString(value);
  return isSafeAssetId(trimmed) ? trimmed : undefined;
}

function readNonNegativeInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.round(value));
}

function readClampedNumber(
  value: unknown,
  options: { fallback?: number; max: number; min: number },
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return options.fallback;
  return Math.min(options.max, Math.max(options.min, value));
}

function normalizeVector(
  value: unknown,
  fallback: DirectorVector,
  options?: { min?: number },
): DirectorVector {
  const source = Array.isArray(value) ? value : [];
  return [0, 1, 2].map((index) => {
    const value = source[index];
    const raw = typeof value === 'number' && Number.isFinite(value) ? value : fallback[index];
    return typeof options?.min === 'number' ? Math.max(options.min, raw) : raw;
  }) as DirectorVector;
}

function normalizeActor(value: unknown, index: number): DirectorActor {
  const input = readRecord(value);
  const kind = input.kind === 'image_plane' || input.kind === 'asset_model'
    ? input.kind
    : 'placeholder_humanoid';
  const assetId = readSafeAssetId(input.assetId);
  const pose = readTrimmedString(input.pose);

  return {
    id: readTrimmedString(input.id) || `actor-${index + 1}`,
    name: readTrimmedString(input.name) || `Actor ${index + 1}`,
    kind,
    ...(assetId ? { assetId } : {}),
    position: normalizeVector(input.position, [0, 0, 0]),
    rotation: normalizeVector(input.rotation, [0, 0, 0]),
    scale: normalizeVector(input.scale, [1, 1, 1], { min: 0.1 }),
    ...(pose ? { pose } : {}),
    visible: typeof input.visible === 'boolean' ? input.visible : true,
    locked: typeof input.locked === 'boolean' ? input.locked : false,
  };
}

function normalizeCamera(value: unknown, index: number): DirectorCamera {
  const input = readRecord(value);
  const focalMm = readClampedNumber(input.focalMm, { min: 1, max: 300 });
  const fov = readClampedNumber(input.fov, { min: 1, max: 179 });
  const prompt = readTrimmedString(input.prompt);

  return {
    id: readTrimmedString(input.id) || `camera-${index + 1}`,
    name: readTrimmedString(input.name) || `Camera ${index + 1}`,
    position: normalizeVector(input.position, [0, 1.8, 5]),
    target: normalizeVector(input.target, [0, 1, 0]),
    ...(typeof focalMm === 'number' ? { focalMm } : {}),
    ...(typeof fov === 'number' ? { fov } : {}),
    durationMs: readNonNegativeInteger(input.durationMs, 3000),
    ...(prompt ? { prompt } : {}),
  };
}

function normalizeCameraSnapshot(
  value: unknown,
  fallbackCamera: DirectorCamera | null,
): DirectorShot['cameraSnapshot'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const input = readRecord(value);
  const name = readTrimmedString(input.name);
  const focalMm = readClampedNumber(input.focalMm, { min: 1, max: 300 });
  const fov = readClampedNumber(input.fov, { min: 1, max: 179 });

  return {
    ...(name ? { name } : {}),
    position: normalizeVector(input.position, fallbackCamera?.position ?? [0, 1.8, 5]),
    target: normalizeVector(input.target, fallbackCamera?.target ?? [0, 1, 0]),
    ...(typeof focalMm === 'number' ? { focalMm } : {}),
    ...(typeof fov === 'number' ? { fov } : {}),
  };
}

function normalizeShot(value: unknown, index: number, cameras: DirectorCamera[]): DirectorShot {
  const input = readRecord(value);
  const fallbackCamera = cameras[0] ?? null;
  const cameraId = readTrimmedString(input.cameraId) || fallbackCamera?.id || `camera-${index + 1}`;
  const selectedCamera = cameras.find((camera) => camera.id === cameraId) ?? fallbackCamera;
  const prompt = readTrimmedString(input.prompt);
  const generatedAssetId = readSafeAssetId(input.generatedAssetId);
  const generatedSourceNodeId = readTrimmedString(input.generatedSourceNodeId);
  const targetStoryboardCellId = readTrimmedString(input.targetStoryboardCellId);
  const motion = DIRECTOR_SHOT_MOTIONS.has(input.motion as NonNullable<DirectorShot['motion']>)
    ? input.motion as NonNullable<DirectorShot['motion']>
    : 'static';
  const cameraSnapshot = normalizeCameraSnapshot(input.cameraSnapshot, selectedCamera);

  return {
    ...(cameraSnapshot ? { cameraSnapshot } : {}),
    id: readTrimmedString(input.id) || `shot-${index + 1}`,
    cameraId,
    startMs: readNonNegativeInteger(input.startMs, 0),
    durationMs: readNonNegativeInteger(input.durationMs, 3000),
    motion,
    ...(prompt ? { prompt } : {}),
    ...(generatedAssetId ? { generatedAssetId } : {}),
    ...(generatedSourceNodeId ? { generatedSourceNodeId } : {}),
    ...(targetStoryboardCellId ? { targetStoryboardCellId } : {}),
  };
}

export function normalizeDirector3dData(value: unknown): FlowDirector3dData {
  const input = readRecord(value);
  const sceneInput = readRecord(input.scene);
  const backgroundAssetId = readSafeAssetId(sceneInput.backgroundAssetId);
  const cameras = Array.isArray(input.cameras)
    ? input.cameras.map((camera, index) => normalizeCamera(camera, index))
    : [];

  return {
    version: 1,
    scene: {
      ...(backgroundAssetId ? { backgroundAssetId } : {}),
      gridVisible: sceneInput.gridVisible !== false,
      units: 'meters',
    },
    actors: Array.isArray(input.actors)
      ? input.actors.map((actor, index) => normalizeActor(actor, index))
      : [],
    cameras,
    shots: Array.isArray(input.shots)
      ? input.shots.map((shot, index) => normalizeShot(shot, index, cameras))
      : [],
  };
}
