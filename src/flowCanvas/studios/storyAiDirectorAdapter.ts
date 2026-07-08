import type { FlowDirector3dData } from '../types';
import { normalizeDirector3dData } from '../utils/director3dNodeData';
import { MANNEQUIN_POSE_PRESETS } from './storyai/editor/presets/mannequinPosePresets';
import type {
  CharacterBodyType,
  DirectorAssetRef,
  DirectorCameraShot,
  DirectorObject,
  DirectorProject,
  DirectorTransform,
  GeometryPrimitiveType,
  SceneSettings,
} from './storyai/editor/schema/directorProject';
import { createDefaultDirectorProject } from './storyai/editor/store/directorStore';

type DirectorVector = [number, number, number];
type StoryAiProjectDraft = Record<string, unknown>;

const CHARACTER_COLORS = ['#4F8EF7', '#E0524D', '#E91E63', '#F2A900', '#9C4DCC', '#12B886'];
const DEFAULT_SCENE: SceneSettings = createDefaultDirectorProject().scene;
const UNSAFE_DRAFT_STRING = /^(?:blob:|data:|https?:\/\/)/i;
const GEOMETRY_TYPES = new Set<GeometryPrimitiveType>(['box', 'sphere', 'cylinder', 'torus', 'cone', 'pyramid']);
const BODY_TYPES = new Set<CharacterBodyType>([
  'mannequin',
  'female',
  'broad',
  'muscular',
  'slim',
  'teen',
  'child',
  'chibi',
]);

export function createStoryAiProjectFromDirectorData(data: FlowDirector3dData | undefined): DirectorProject {
  const normalized = normalizeDirector3dData(data);
  const projectDraft = readStoryAiProjectDraft(data);
  const project = projectDraft ? normalizeStoryAiProject(projectDraft) : null;

  if (project) {
    return project;
  }

  const defaultProject = createDefaultDirectorProject();
  const actorObjects = normalized.actors.map((actor, index): DirectorObject => ({
    id: actor.id,
    name: actor.name,
    kind: actor.kind === 'asset_model' ? 'prop' : 'character',
    visible: actor.visible,
    locked: actor.locked,
    transform: createTransform(actor.position, actor.rotation, actor.scale),
    ...(actor.kind === 'asset_model' ? { geometryType: 'box' as GeometryPrimitiveType } : {}),
      ...(actor.kind !== 'asset_model'
        ? {
            bodyType: 'mannequin' as CharacterBodyType,
            characterRig: {
              rigType: 'ue4-mannequin' as const,
              posePresetId: actor.pose ?? 'stand',
            controls: actor.poseControls
              ? { ...actor.poseControls }
              : { ...(MANNEQUIN_POSE_PRESETS.find((preset) => preset.id === (actor.pose ?? 'stand'))?.controls ?? {}) },
          },
          color: CHARACTER_COLORS[index % CHARACTER_COLORS.length],
        }
      : { color: '#d7e7ff' }),
    ...(actor.assetId ? { assetRefId: actor.assetId } : {}),
  }));
  const cameras = normalized.cameras.length
    ? normalized.cameras.map((camera, index): DirectorCameraShot => ({
        id: camera.id,
        name: camera.name,
        fov: camera.fov ?? focalMmToFov(camera.focalMm ?? 35),
        transform: createTransform(camera.position),
        targetMode: 'manual',
        target: camera.target,
        lastCaptureUrl: null,
        captures: [],
      }))
    : defaultProject.cameras;
  const cameraObjects = cameras.map((camera, index): DirectorObject => ({
    id: `camera-object-${index + 1}`,
    name: camera.name,
    kind: 'camera',
    visible: true,
    locked: false,
    linkedCameraId: camera.id,
    transform: camera.transform,
  }));

  return {
    ...defaultProject,
    scene: {
      ...defaultProject.scene,
      showGround: normalized.scene.gridVisible,
    },
    objects: actorObjects.length ? [...actorObjects, ...cameraObjects] : defaultProject.objects,
    cameras,
    activeCameraId: cameras[0]?.id ?? null,
    panoramaAssetId: null,
  };
}

export function createDirectorDataFromStoryAiProject(project: DirectorProject): FlowDirector3dData {
  const safeProject = sanitizeStoryAiProject(project);
  const safeAssetsById = new Map(safeProject.assets.map((asset) => [asset.id, asset]));
  const actors = safeProject.objects
    .filter((object) => object.kind === 'character' || object.kind === 'prop')
    .map((object, index) => {
      const asset = object.assetRefId ? safeAssetsById.get(object.assetRefId) : null;
      const assetId = readSafeId(asset?.id);
      return {
        id: readSafeId(object.id) ?? `actor-${index + 1}`,
        name: object.name.trim() || `Actor ${index + 1}`,
        kind: object.kind === 'prop' ? ('asset_model' as const) : ('placeholder_humanoid' as const),
        ...(assetId ? { assetId } : {}),
        position: normalizeVector(object.transform.position, [0, 0, 0]),
        rotation: normalizeVector(object.transform.rotation, [0, 0, 0]),
        scale: normalizeVector(object.transform.scale, [1, 1, 1], { min: 0.1 }),
        ...(object.characterRig?.posePresetId ? { pose: object.characterRig.posePresetId } : {}),
        ...(object.characterRig?.controls && Object.keys(object.characterRig.controls).length
          ? { poseControls: object.characterRig.controls }
          : {}),
        visible: object.visible,
        locked: object.locked,
      };
    });
  const cameras = safeProject.cameras.map((camera, index) => ({
    id: readSafeId(camera.id) ?? `camera-${index + 1}`,
    name: camera.name.trim() || `Camera ${index + 1}`,
    position: normalizeVector(camera.transform.position, [0, 2.2, 9]),
    target: normalizeVector(camera.target, [0, 1.2, 0]),
    fov: clampNumber(camera.fov, 1, 179, 50),
    durationMs: 3000,
  }));
  const shots = cameras.map((camera, index) => ({
    id: `shot-${index + 1}`,
    cameraId: camera.id,
    cameraSnapshot: {
      name: camera.name,
      position: camera.position,
      target: camera.target,
      fov: camera.fov,
    },
    startMs: index * 3000,
    durationMs: 3000,
    motion: 'static' as const,
  }));

  const normalized = normalizeDirector3dData({
    version: 1,
    scene: {
      gridVisible: safeProject.scene.showGround,
      units: 'meters',
    },
    actors,
    cameras,
    shots,
  });

  return {
    ...normalized,
    storyAiProject: safeProject as unknown as Record<string, unknown>,
  };
}

function readStoryAiProjectDraft(data: FlowDirector3dData | undefined): StoryAiProjectDraft | null {
  const value = data?.storyAiProject;
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function normalizeStoryAiProject(value: StoryAiProjectDraft): DirectorProject | null {
  const version = value.version;
  const scene = readRecord(value.scene);
  const objects = Array.isArray(value.objects) ? value.objects.map(normalizeStoryAiObject).filter(Boolean) : [];
  const cameras = Array.isArray(value.cameras) ? value.cameras.map(normalizeStoryAiCamera).filter(Boolean) : [];
  const assets = Array.isArray(value.assets) ? value.assets.map(normalizeStoryAiAsset).filter(Boolean) : [];
  const activeCameraId = readSafeId(value.activeCameraId) ?? cameras[0]?.id ?? null;
  const panoramaAssetId = readSafeId(value.panoramaAssetId) ?? null;

  if (version !== 1 || !objects.length || !cameras.length) return null;

  return {
    version: 1,
    scene: normalizeStoryAiScene(scene),
    assets,
    objects,
    cameras,
    activeCameraId,
    panoramaAssetId,
  };
}

function sanitizeStoryAiProject(project: DirectorProject): DirectorProject {
  const assets = project.assets.map(sanitizeStoryAiAsset).filter(Boolean);
  const assetIds = new Set(assets.map((asset) => asset.id));
  const cameras = project.cameras.map((camera, index) => sanitizeStoryAiCamera(camera, index));
  const cameraIds = new Set(cameras.map((camera) => camera.id));

  return {
    version: 1,
    scene: normalizeStoryAiScene(project.scene as unknown as Record<string, unknown>),
    assets,
    objects: project.objects.map((object, index) => sanitizeStoryAiObject(object, index, assetIds, cameraIds)),
    cameras,
    activeCameraId: readSafeId(project.activeCameraId) && cameraIds.has(project.activeCameraId ?? '')
      ? project.activeCameraId
      : cameras[0]?.id ?? null,
    panoramaAssetId: readSafeId(project.panoramaAssetId) && assetIds.has(project.panoramaAssetId ?? '')
      ? project.panoramaAssetId
      : null,
  };
}

function normalizeStoryAiScene(scene: Record<string, unknown>): SceneSettings {
  return {
    ...DEFAULT_SCENE,
    scale: clampNumber(scene.scale, 0.01, 100, DEFAULT_SCENE.scale),
    position: normalizeVector(scene.position, DEFAULT_SCENE.position),
    rotation: normalizeVector(scene.rotation, DEFAULT_SCENE.rotation),
    backgroundColor: readColor(scene.backgroundColor) ?? DEFAULT_SCENE.backgroundColor,
    panoramaYaw: clampNumber(scene.panoramaYaw, -360, 360, DEFAULT_SCENE.panoramaYaw),
    panoramaRadius: clampNumber(scene.panoramaRadius, 1, 500, DEFAULT_SCENE.panoramaRadius),
    showLabels: typeof scene.showLabels === 'boolean' ? scene.showLabels : DEFAULT_SCENE.showLabels,
    snapToGrid: typeof scene.snapToGrid === 'boolean' ? scene.snapToGrid : DEFAULT_SCENE.snapToGrid,
    showGround: typeof scene.showGround === 'boolean' ? scene.showGround : DEFAULT_SCENE.showGround,
    groundOpacity: clampNumber(scene.groundOpacity, 0, 1, DEFAULT_SCENE.groundOpacity),
    groundHeight: clampNumber(scene.groundHeight, -100, 100, DEFAULT_SCENE.groundHeight),
  };
}

function normalizeStoryAiAsset(value: unknown): DirectorAssetRef | null {
  const input = readRecord(value);
  const id = readSafeId(input.id);
  const kind = input.kind === 'scene' || input.kind === 'prop' || input.kind === 'panorama' ? input.kind : 'character';
  const sourceType = input.sourceType === 'image' ? 'image' : 'model';
  const fileName = readSafeLabel(input.fileName) || `${id ?? 'asset'}`;
  const name = readSafeLabel(input.name);
  const assetSource = input.assetSource === 'library' || input.assetSource === 'local' ? input.assetSource : undefined;
  const projectionMode = input.projectionMode === 'equirectangular' || input.projectionMode === 'backdrop'
    ? input.projectionMode
    : undefined;

  if (!id) return null;

  return {
    id,
    kind,
    sourceType,
    fileName,
    ...(name ? { name } : {}),
    url: '',
    ...(assetSource ? { assetSource } : {}),
    ...(projectionMode ? { projectionMode } : {}),
  };
}

function sanitizeStoryAiAsset(asset: DirectorAssetRef): DirectorAssetRef | null {
  return normalizeStoryAiAsset(asset);
}

function normalizeStoryAiObject(value: unknown): DirectorObject | null {
  const input = readRecord(value);
  const id = readSafeId(input.id);
  const transform = normalizeTransform(input.transform);
  const kind = input.kind === 'scene' || input.kind === 'prop' || input.kind === 'camera' || input.kind === 'panorama'
    ? input.kind
    : 'character';
  const geometryType = GEOMETRY_TYPES.has(input.geometryType as GeometryPrimitiveType)
    ? input.geometryType as GeometryPrimitiveType
    : undefined;
  const bodyType = BODY_TYPES.has(input.bodyType as CharacterBodyType) ? input.bodyType as CharacterBodyType : undefined;
  const linkedCameraId = readSafeId(input.linkedCameraId) ?? null;
  const assetRefId = readSafeId(input.assetRefId);
  const crowdId = readSafeId(input.crowdId);
  const crowdLabel = readSafeLabel(input.crowdLabel);
  const posePresetId = readSafeLabel(readRecord(input.characterRig).posePresetId) || 'stand';

  if (!id) return null;

  return {
    id,
    name: readSafeLabel(input.name) || id,
    kind,
    visible: input.visible !== false,
    locked: input.locked === true,
    transform,
    ...(bodyType ? { bodyType } : {}),
    ...(readColor(input.color) ? { color: readColor(input.color) } : {}),
    ...(assetRefId ? { assetRefId } : {}),
    ...(geometryType ? { geometryType } : {}),
    ...(crowdId ? { crowdId } : {}),
    ...(crowdLabel ? { crowdLabel } : {}),
    ...(linkedCameraId ? { linkedCameraId } : kind === 'camera' ? { linkedCameraId: null } : {}),
    ...(kind === 'character'
      ? {
          characterRig: {
            rigType: 'ue4-mannequin' as const,
            posePresetId,
            controls: readPoseControls(readRecord(input.characterRig).controls),
          },
        }
      : {}),
  };
}

function sanitizeStoryAiObject(
  object: DirectorObject,
  index: number,
  assetIds: Set<string>,
  cameraIds: Set<string>,
): DirectorObject {
  const normalized = normalizeStoryAiObject(object) ?? {
    id: `object-${index + 1}`,
    name: `Object ${index + 1}`,
    kind: 'character' as const,
    visible: true,
    locked: false,
    transform: createTransform([0, 0, 0]),
  };
  return {
    ...normalized,
    ...(normalized.assetRefId && assetIds.has(normalized.assetRefId) ? { assetRefId: normalized.assetRefId } : { assetRefId: undefined }),
    ...(normalized.linkedCameraId && cameraIds.has(normalized.linkedCameraId)
      ? { linkedCameraId: normalized.linkedCameraId }
      : normalized.kind === 'camera'
        ? { linkedCameraId: null }
        : {}),
  };
}

function normalizeStoryAiCamera(value: unknown): DirectorCameraShot | null {
  const input = readRecord(value);
  const id = readSafeId(input.id);
  if (!id) return null;

  return {
    id,
    name: readSafeLabel(input.name) || id,
    fov: clampNumber(input.fov, 1, 179, 50),
    transform: normalizeTransform(input.transform),
    targetMode: input.targetMode === 'object' ? 'object' : 'manual',
    ...(readSafeId(input.targetObjectId) ? { targetObjectId: readSafeId(input.targetObjectId) } : {}),
    target: normalizeVector(input.target, [0, 1.2, 0]),
    lastCaptureUrl: null,
    captures: [],
  };
}

function sanitizeStoryAiCamera(camera: DirectorCameraShot, index: number): DirectorCameraShot {
  return normalizeStoryAiCamera(camera) ?? {
    id: `camera-${index + 1}`,
    name: `Camera ${index + 1}`,
    fov: 50,
    transform: createTransform([0, 2.2, 9]),
    targetMode: 'manual',
    target: [0, 1.2, 0],
    lastCaptureUrl: null,
    captures: [],
  };
}

function normalizeTransform(value: unknown): DirectorTransform {
  const input = readRecord(value);
  return createTransform(
    normalizeVector(input.position, [0, 0, 0]),
    normalizeVector(input.rotation, [0, 0, 0]),
    normalizeVector(input.scale, [1, 1, 1], { min: 0.1 }),
  );
}

function createTransform(
  position: DirectorVector,
  rotation: DirectorVector = [0, 0, 0],
  scale: DirectorVector = [1, 1, 1],
): DirectorTransform {
  return { position, rotation, scale };
}

function normalizeVector(value: unknown, fallback: DirectorVector, options?: { min?: number }): DirectorVector {
  const source = Array.isArray(value) ? value : [];
  return [0, 1, 2].map((index) => {
    const raw = typeof source[index] === 'number' && Number.isFinite(source[index]) ? source[index] : fallback[index];
    return typeof options?.min === 'number' ? Math.max(options.min, raw) : raw;
  }) as DirectorVector;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function focalMmToFov(focalMm: number): number {
  return clampNumber(2 * Math.atan(36 / (2 * focalMm)) * (180 / Math.PI), 1, 179, 50);
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readSafeId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && !UNSAFE_DRAFT_STRING.test(trimmed) ? trimmed : undefined;
}

function readSafeLabel(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return UNSAFE_DRAFT_STRING.test(trimmed) ? '' : trimmed;
}

function readColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : undefined;
}

function readPoseControls(value: unknown): Record<string, number> {
  const input = readRecord(value);
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, controlValue]) => typeof controlValue === 'number' && Number.isFinite(controlValue))
      .map(([key, controlValue]) => [key, controlValue]),
  );
}
