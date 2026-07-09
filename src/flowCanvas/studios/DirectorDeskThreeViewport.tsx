import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

import type { FlowDirector3dData } from '../types';

type DirectorViewportSelectionType = 'actor' | 'camera' | 'scene' | 'shot';

interface DirectorDeskThreeViewportProps {
  actors: FlowDirector3dData['actors'];
  cameras: FlowDirector3dData['cameras'];
  scene?: FlowDirector3dData['scene'];
  shots: FlowDirector3dData['shots'];
  selectedId: string | null;
  selectedType: DirectorViewportSelectionType | null;
}

type ViewportSize = { width: number; height: number };
type DirectorVector = [number, number, number];
type DirectorShotPose = {
  id: string;
  label: string;
  position: DirectorVector;
  target: DirectorVector;
  selected: boolean;
};

const getViewportSize = (container: HTMLDivElement): ViewportSize => {
  const rect = container.getBoundingClientRect();
  return {
    width: Math.max(320, Math.floor(rect.width || container.clientWidth || 640)),
    height: Math.max(240, Math.floor(rect.height || container.clientHeight || 420)),
  };
};

export const DirectorDeskThreeViewport: React.FC<DirectorDeskThreeViewportProps> = ({
  actors,
  cameras,
  scene: directorScene,
  shots,
  selectedId,
  selectedType,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [rendererMode, setRendererMode] = useState<'pending' | 'three' | 'fallback'>('pending');
  const assetActorCount = actors.filter((actor) => actor.visible && Boolean(actor.assetId)).length;
  const backgroundAssetId = directorScene?.backgroundAssetId || '';
  const shotPoses = React.useMemo(
    () => buildShotPoses(shots, cameras, selectedId, selectedType),
    [cameras, selectedId, selectedType, shots],
  );
  const selectedShotPose = shotPoses.find((shot) => shot.selected) ?? null;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) {
      setRendererMode('fallback');
      return undefined;
    }

    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let frameId = 0;
    let resizeObserver: ResizeObserver | null = null;
    let removeWindowResize: (() => void) | null = null;

    try {
      const size = getViewportSize(container);
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0b1020);

      const camera = new THREE.PerspectiveCamera(50, size.width / size.height, 0.1, 100);
      camera.position.set(5.4, 3.2, 6.4);
      camera.lookAt(0, 0.8, 0);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
      renderer.setClearColor(0x0b1020, 1);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(size.width, size.height);
      container.appendChild(renderer.domElement);

      scene.add(new THREE.AmbientLight(0xffffff, 0.52));
      const keyLight = new THREE.DirectionalLight(0xffffff, 1.25);
      keyLight.position.set(4, 6, 4);
      scene.add(keyLight);
      const rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.6);
      rimLight.position.set(-4, 3, -5);
      scene.add(rimLight);

      const root = new THREE.Group();
      scene.add(root);
      root.add(new THREE.GridHelper(12, 12, 0x38bdf8, 0x334155));
      const axes = new THREE.AxesHelper(1.4);
      axes.position.set(-4.6, 0.04, -4.3);
      root.add(axes);

      actors
        .filter((actor) => actor.visible)
        .forEach((actor, index) => {
          const actorGroup = createActorGroup(selectedType === 'actor' && selectedId === actor.id);
          const [x, y, z] = actor.position;
          const [rx, ry, rz] = actor.rotation;
          const [sx, sy, sz] = actor.scale;
          actorGroup.position.set(x || index * 0.75, y, z);
          actorGroup.rotation.set(rx, ry, rz);
          actorGroup.scale.set(Math.max(0.2, sx), Math.max(0.2, sy), Math.max(0.2, sz));
          root.add(actorGroup);
        });

      cameras.forEach((directorCamera, index) => {
        const cameraGroup = createCameraGroup(selectedType === 'camera' && selectedId === directorCamera.id);
        const [x, y, z] = directorCamera.position;
        cameraGroup.position.set(x || -1.6 + index * 0.5, y || 1.5, Math.min(4.8, z || 3.8));
        cameraGroup.lookAt(
          directorCamera.target[0] || 0,
          directorCamera.target[1] || 0.8,
          directorCamera.target[2] || 0,
        );
        root.add(cameraGroup);
      });

      shotPoses.forEach((shotPose, index) => {
        const shotGroup = createShotGroup(shotPose.selected, index);
        const [x, y, z] = shotPose.position;
        shotGroup.position.set(x, y, z);
        shotGroup.lookAt(shotPose.target[0], shotPose.target[1], shotPose.target[2]);
        root.add(shotGroup);
        root.add(createShotTargetLine(shotPose));
      });

      const resize = () => {
        if (!renderer) return;
        const nextSize = getViewportSize(container);
        camera.aspect = nextSize.width / nextSize.height;
        camera.updateProjectionMatrix();
        renderer.setSize(nextSize.width, nextSize.height);
      };
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(container);
      } else {
        window.addEventListener('resize', resize);
        removeWindowResize = () => window.removeEventListener('resize', resize);
      }

      const clock = new THREE.Clock();
      const animate = () => {
        if (!renderer || !scene) return;
        const elapsed = clock.getElapsedTime();
        root.rotation.y = Math.sin(elapsed * 0.36) * 0.08;
        renderer.render(scene, camera);
        frameId = requestAnimationFrame(animate);
      };
      animate();
      setRendererMode('three');
    } catch {
      setRendererMode('fallback');
    }

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      removeWindowResize?.();
      if (scene) {
        scene.traverse((object) => {
          const mesh = object as THREE.Mesh;
          mesh.geometry?.dispose?.();
          const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(material)) material.forEach((item) => item.dispose());
          else material?.dispose?.();
        });
      }
      if (renderer) {
        const canvas = renderer.domElement;
        renderer.dispose();
        if (canvas.parentElement === container) container.removeChild(canvas);
      }
    };
  }, [actors, cameras, selectedId, selectedType, shotPoses]);

  return (
    <div
      ref={containerRef}
      aria-label="3D导演视口"
      data-actor-count={actors.filter((actor) => actor.visible).length}
      data-asset-actor-count={assetActorCount}
      data-camera-count={cameras.length}
      data-renderer={rendererMode}
      data-scene-background-asset-id={backgroundAssetId}
      data-selected-id={selectedId ?? ''}
      data-selected-shot-camera-position={selectedShotPose ? selectedShotPose.position.join(',') : ''}
      data-selected-shot-id={selectedShotPose?.id ?? ''}
      data-shot-count={shots.length}
      data-testid="director-three-viewport"
      style={viewportHostStyle}
    >
      <div style={viewportGlowStyle} />
      {backgroundAssetId || assetActorCount ? (
        <div style={assetHudStyle}>
          {backgroundAssetId ? <span>背景 {backgroundAssetId}</span> : null}
          {assetActorCount ? <span>资产角色 {assetActorCount}</span> : null}
        </div>
      ) : null}
      {selectedShotPose ? <div style={selectedShotLabelStyle}>{selectedShotPose.label}</div> : null}
    </div>
  );
};

function buildShotPoses(
  shots: FlowDirector3dData['shots'],
  cameras: FlowDirector3dData['cameras'],
  selectedId: string | null,
  selectedType: DirectorViewportSelectionType | null,
): DirectorShotPose[] {
  return shots.map((shot, index) => {
    const camera = cameras.find((candidate) => candidate.id === shot.cameraId) ?? cameras[0] ?? null;
    const cameraPosition = normalizeVector(camera?.position, [0, 1.8, 5 + index * 0.42]);
    const cameraTarget = normalizeVector(camera?.target, [0, 1, 0]);
    const snapshot = shot.cameraSnapshot;
    const label = snapshot?.name?.trim() || camera?.name?.trim() || `Shot ${index + 1}`;
    return {
      id: shot.id,
      label,
      position: normalizeVector(snapshot?.position, cameraPosition),
      selected: selectedType === 'shot' && selectedId === shot.id,
      target: normalizeVector(snapshot?.target, cameraTarget),
    };
  });
}

function normalizeVector(value: unknown, fallback: DirectorVector): DirectorVector {
  if (!Array.isArray(value)) return fallback;
  return [0, 1, 2].map((index) => {
    const axisValue = Number(value[index]);
    return Number.isFinite(axisValue) ? axisValue : fallback[index];
  }) as DirectorVector;
}

function createActorGroup(selected: boolean) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: selected ? 0xfacc15 : 0x22c55e,
    roughness: 0.48,
    metalness: 0.06,
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.72, 28), material);
  body.position.y = 0.52;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 28, 18), material);
  head.position.y = 1.02;
  group.add(head);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.34, 0.035, 32),
    new THREE.MeshBasicMaterial({ color: selected ? 0xfbbf24 : 0x14532d, transparent: true, opacity: 0.72 }),
  );
  base.position.y = 0.02;
  group.add(base);
  return group;
}

function createCameraGroup(selected: boolean) {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: selected ? 0xfacc15 : 0x38bdf8,
    roughness: 0.38,
    metalness: 0.22,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.34, 0.24), bodyMaterial);
  group.add(body);
  const lens = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.36, 28),
    new THREE.MeshStandardMaterial({ color: 0xe0f2fe, roughness: 0.24, metalness: 0.32 }),
  );
  lens.rotation.x = Math.PI / 2;
  lens.position.z = -0.28;
  group.add(lens);
  const frustumGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, -0.46),
    new THREE.Vector3(-0.42, -0.24, -1.1),
    new THREE.Vector3(0, 0, -0.46),
    new THREE.Vector3(0.42, -0.24, -1.1),
    new THREE.Vector3(0, 0, -0.46),
    new THREE.Vector3(-0.42, 0.24, -1.1),
    new THREE.Vector3(0, 0, -0.46),
    new THREE.Vector3(0.42, 0.24, -1.1),
  ]);
  const frustum = new THREE.LineSegments(
    frustumGeometry,
    new THREE.LineBasicMaterial({ color: selected ? 0xfacc15 : 0x7dd3fc, transparent: true, opacity: 0.62 }),
  );
  group.add(frustum);
  group.scale.setScalar(0.72);
  return group;
}

function createShotGroup(selected: boolean, index: number) {
  const group = new THREE.Group();
  const baseColor = selected ? 0xfacc15 : 0xfb7185;
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(selected ? 0.12 : 0.09, 20, 14),
    new THREE.MeshStandardMaterial({
      color: baseColor,
      emissive: baseColor,
      emissiveIntensity: selected ? 0.32 : 0.16,
      roughness: 0.42,
      metalness: 0.08,
    }),
  );
  group.add(marker);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(selected ? 0.27 : 0.21, 0.012, 10, 36),
    new THREE.MeshBasicMaterial({ color: baseColor, transparent: true, opacity: selected ? 0.88 : 0.48 }),
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  const tick = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, 0.26 + index * 0.015, 0.045),
    new THREE.MeshBasicMaterial({ color: baseColor, transparent: true, opacity: selected ? 0.78 : 0.46 }),
  );
  tick.position.y = 0.18;
  group.add(tick);
  return group;
}

function createShotTargetLine(shotPose: DirectorShotPose) {
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(...shotPose.position),
    new THREE.Vector3(...shotPose.target),
  ]);
  return new THREE.Line(
    lineGeometry,
    new THREE.LineBasicMaterial({
      color: shotPose.selected ? 0xfacc15 : 0xfb7185,
      transparent: true,
      opacity: shotPose.selected ? 0.7 : 0.32,
    }),
  );
}

const viewportHostStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  background: '#0b1020',
};

const viewportGlowStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  background: 'radial-gradient(circle at 52% 42%, rgba(56,189,248,0.14), transparent 42%)',
};

const assetHudStyle: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  display: 'grid',
  gap: 5,
  justifyItems: 'end',
  maxWidth: 'min(280px, calc(100% - 24px))',
  color: '#bfdbfe',
  fontSize: 11,
  fontWeight: 800,
  pointerEvents: 'none',
};

const selectedShotLabelStyle: React.CSSProperties = {
  position: 'absolute',
  left: 12,
  bottom: 12,
  maxWidth: 'min(260px, calc(100% - 24px))',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  border: '1px solid rgba(250,204,21,0.34)',
  borderRadius: 8,
  background: 'rgba(15,23,42,0.74)',
  color: '#fde68a',
  fontSize: 11,
  fontWeight: 800,
  padding: '6px 8px',
  pointerEvents: 'none',
};
