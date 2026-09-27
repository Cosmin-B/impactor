import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PLACES, ROADS, JOBS } from "../../shared/ops/engine";
import type { OpsRun, OpsWorld } from "../../shared/ops/types";
const COLORS = [
  0xf0785a, 0x47aaa0, 0xe6ad48, 0x7c83cf, 0xd36b8e, 0x6a9c55, 0x8596a9,
  0xd08a50,
];
export function CityScene({
  world,
  run,
  playing,
  onFinished,
}: {
  world: OpsWorld;
  run: OpsRun | null;
  playing: boolean;
  onFinished: () => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    latest = useRef({ run, playing, onFinished });
  latest.current = { run, playing, onFinished };
  const [error, setError] = useState("");
  useEffect(() => {
    if (!host.current) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError(
        "3D rendering is unavailable in this browser. The measured results below remain usable.",
      );
      return;
    }
    const node = host.current;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0xf0f2eb);
    node.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xf0f2eb, 35, 85);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 150);
    camera.position.set(16, 19, 22);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.minDistance = 15;
    controls.maxDistance = 55;
    controls.maxPolarAngle = Math.PI * 0.46;
    scene.add(new THREE.HemisphereLight(0xfffae6, 0x729584, 1.8));
    const sun = new THREE.DirectionalLight(0xfff5de, 2.2);
    sun.position.set(-12, 22, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -20,
      right: 20,
      top: 20,
      bottom: -20,
    });
    sun.shadow.normalBias = 0.05;
    scene.add(sun);
    const mat = (color: number, extra = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
    const mesh = (
      geo: THREE.BufferGeometry,
      m: THREE.Material,
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D = scene,
    ) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      o.castShadow = true;
      o.receiveShadow = true;
      parent.add(o);
      return o;
    };
    const box = (
      w: number,
      h: number,
      d: number,
      color: number,
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D = scene,
    ) => mesh(new THREE.BoxGeometry(w, h, d), mat(color), x, y, z, parent);
    box(24, 0.7, 21, 0xc4d5b5, 0, -0.55, 0);
    box(2.2, 0.18, 21, 0x78b9c7, 0, -0.12, 0);
    box(0.35, 0.17, 21, 0xd6c7a3, -1.25, -0.07, 0);
    box(0.35, 0.17, 21, 0xd6c7a3, 1.25, -0.07, 0);
    function label(
      text: string,
      x: number,
      y: number,
      z: number,
      color = "#31423b",
    ) {
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 96;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fffdf4";
      ctx.fillRect(0, 0, 512, 96);
      ctx.fillStyle = color;
      ctx.font = "600 34px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(text, 256, 59);
      const tex = new THREE.CanvasTexture(c);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, depthTest: false }),
      );
      sprite.position.set(x, y, z);
      sprite.scale.set(3.4, 0.64, 1);
      scene.add(sprite);
    }
    for (const edge of ROADS) {
      const a = PLACES.find((p) => p.id === edge.a)!,
        b = PLACES.find((p) => p.id === edge.b)!;
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      const bridge = edge.kind === "bridge";
      const color = bridge
        ? world.paint === "coral"
          ? 0xe98b70
          : world.paint === "teal"
            ? 0x60b5a3
            : 0xe7b34e
        : edge.kind === "highway"
          ? 0x9daba7
          : 0xe4d9c2;
      const road = box(
        0.92,
        bridge ? 0.3 : 0.13,
        bridge ? length : Math.max(0.1, length - 0.6),
        color,
        (a.x + b.x) / 2,
        bridge ? 0.12 : 0.02,
        (a.z + b.z) / 2,
      );
      road.castShadow = bridge;
      road.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      if (bridge) {
        for (const side of [-0.48, 0.48]) {
          const rail = box(
            0.09,
            0.55,
            length,
            0xba705a,
            (a.x + b.x) / 2,
            0.52,
            side,
          );
          rail.rotation.y = road.rotation.y;
          rail.position.set(0, 0.5, side);
        }
        label(`BRIDGE · ${world.bridgeLimit} kg`, 0, 1.45, 0);
      }
    }
    // Cover road ends with a raised junction surface so crossing decks never share a plane.
    for (const p of PLACES) {
      const cap = box(1.02, 0.08, 1.02, 0xe4d9c2, p.x, 0.1, p.z);
      cap.castShadow = false;
    }
    for (const p of PLACES) {
      if (p.kind === "junction") continue;
      if (p.kind === "charge") {
        box(1.5, 0.1, 1.4, 0x84ba9d, p.x, 0.15, p.z);
        box(0.45, 0.9, 0.35, 0x2f665d, p.x, 0.5, p.z);
        label("Charging hub", p.x, 1.7, p.z);
        continue;
      }
      const h =
        p.id === "office"
          ? 3.8
          : p.id === "studio"
            ? 2.1
            : p.kind === "depot"
              ? 1.2
              : 1.5;
      const g = new THREE.Group();
      g.position.set(p.x, 0, p.z - 0.9);
      scene.add(g);
      box(2, h, 1.8, p.kind === "depot" ? 0xf2b681 : 0xe9e7db, 0, h / 2, 0, g);
      box(
        2.3,
        0.2,
        2.1,
        p.id === "studio" ? 0x6b8f99 : p.id === "office" ? 0xa4aaa8 : 0xcb8066,
        0,
        h + 0.08,
        0,
        g,
      );
      for (let level = 0.6; level < h; level += 0.9)
        for (const x of [-0.52, 0.52])
          box(0.48, 0.47, 0.02, 0x769b9f, x, level, 0.91, g);
      box(0.5, 0.75, 0.04, 0x45655d, 0, 0.37, 0.93, g);
      label(p.name, p.x, h + 1.1, p.z - 0.9);
    }
    for (let i = 0; i < 38; i++) {
      const x = -10.5 + (i % 10) * 2.25,
        z = -9 + Math.floor(i / 10) * 5.6;
      if (
        Math.abs(x) < 2 ||
        PLACES.some((p) => Math.hypot(x - p.x, z - p.z) < 1.7)
      )
        continue;
      mesh(
        new THREE.CylinderGeometry(0.08, 0.13, 0.7, 6),
        mat(0x8b7856),
        x,
        0.25,
        z,
      );
      mesh(
        new THREE.IcosahedronGeometry(0.55, 1),
        mat(i % 2 ? 0x81a783 : 0x598a6c),
        x,
        0.94,
        z,
      );
    }
    const robots: THREE.Group[] = [];
    for (let i = 0; i < world.agents; i++) {
      const g = new THREE.Group();
      scene.add(g);
      const color =
        world.paint === "teal"
          ? 0x47aaa0
          : world.paint === "gold"
            ? 0xe6ad48
            : COLORS[i];
      box(0.55, 0.35, 0.72, color, 0, 0.42, 0, g);
      box(0.5, 0.34, 0.4, color, 0, 0.79, -0.06, g);
      box(0.39, 0.18, 0.02, 0x233b3d, 0, 0.8, 0.151, g);
      for (const x of [-0.12, 0.12])
        mesh(
          new THREE.SphereGeometry(0.03, 8, 8),
          mat(0xffffff),
          x,
          0.81,
          0.178,
          g,
        );
      for (const x of [-0.31, 0.31])
        for (const z of [-0.2, 0.2]) {
          const wheel = mesh(
            new THREE.CylinderGeometry(0.13, 0.13, 0.1, 12),
            mat(0x35413f),
            x,
            0.2,
            z,
            g,
          );
          wheel.rotation.z = Math.PI / 2;
        }
      box(0.35, 0.3, 0.35, 0xd6b281, 0, 0.7, 0.33, g);
      g.position.set(-8 + (i % 3) * 0.6, 0, 1 + Math.floor(i / 3) * 0.7);
      robots.push(g);
    }
    let frame = 0,
      start = 0,
      lastId = "",
      done = false;
    const rainCount = 160;
    const rainGeo = new THREE.BufferGeometry(),
      drops = new Float32Array(rainCount * 3);
    for (let i = 0; i < drops.length; i += 3) {
      drops[i] = Math.random() * 24 - 12;
      drops[i + 1] = Math.random() * 8 + 1;
      drops[i + 2] = Math.random() * 20 - 10;
    }
    rainGeo.setAttribute("position", new THREE.BufferAttribute(drops, 3));
    const rain = new THREE.Points(
      rainGeo,
      new THREE.PointsMaterial({
        color: 0x9dbbcb,
        size: 0.06,
        transparent: true,
        opacity: world.rain / 130,
      }),
    );
    scene.add(rain);
    const routeGroup = new THREE.Group();
    scene.add(routeGroup);
    function clearRoutes() {
      for (const child of [...routeGroup.children]) {
        const l = child as THREE.Line;
        l.geometry.dispose();
        (l.material as THREE.Material).dispose();
        routeGroup.remove(child);
      }
    }
    function position(path: string[], fraction: number) {
      const points = path.map((id) => PLACES.find((p) => p.id === id)!);
      if (!points.length) return new THREE.Vector3(-8, 0, 0);
      const lengths = points
        .slice(1)
        .map((p, i) => Math.hypot(p.x - points[i].x, p.z - points[i].z));
      let d =
        Math.max(0, Math.min(1, fraction)) * lengths.reduce((a, b) => a + b, 0);
      for (let i = 0; i < lengths.length; i++) {
        if (d <= lengths[i]) {
          const t = d / lengths[i];
          return new THREE.Vector3(
            points[i].x + (points[i + 1].x - points[i].x) * t,
            0.1,
            points[i].z + (points[i + 1].z - points[i].z) * t,
          );
        }
        d -= lengths[i];
      }
      const p = points.at(-1)!;
      return new THREE.Vector3(p.x, 0.1, p.z);
    }
    const resize = new ResizeObserver(() => {
      const w = node.clientWidth,
        h = node.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resize.observe(node);
    function animate(now: number) {
      const { run: r, playing: p } = latest.current;
      if (r?.id !== lastId) {
        lastId = r?.id || "";
        start = now;
        done = false;
        clearRoutes();
        if (r)
          for (const visit of r.plan.visits) {
            const points = visit.path.map((id) => {
              const v = PLACES.find((p) => p.id === id)!;
              return new THREE.Vector3(v.x, 0.3, v.z);
            });
            routeGroup.add(
              new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(points),
                new THREE.LineBasicMaterial({
                  color: COLORS[visit.robot],
                  transparent: true,
                  opacity: 0.7,
                }),
              ),
            );
          }
      }
      if (r) {
        const progress = p ? Math.min(1, (now - start) / 14000) : 1,
          time = progress * r.plan.minutes;
        for (let i = 0; i < robots.length; i++) {
          const jobs = r.plan.visits.filter((v) => v.robot === i),
            v =
              jobs.find((v) => time >= v.departure && time <= v.finish) ||
              jobs.filter((v) => time > v.finish).at(-1);
          if (!v) continue;
          const failure = !["delivered", "late"].includes(v.status);
          const t = (time - v.departure) / (v.arrival - v.departure || 1);
          const pos =
            time <= v.arrival
              ? position(v.path, Math.min(t, failure ? 0.5 : 1))
              : failure
                ? position(v.path, 0.5)
                : position(
                    v.returnPath,
                    (time - v.arrival) / (v.finish - v.arrival),
                  );
          const old = robots[i].position.clone();
          robots[i].position.copy(pos);
          if (old.distanceTo(pos) > 0.005)
            robots[i].rotation.y = Math.atan2(pos.x - old.x, pos.z - old.z);
          if (failure && time > v.arrival) robots[i].rotation.z = 0.18;
        }
        if (p && progress === 1 && !done) {
          done = true;
          latest.current.onFinished();
        }
      }
      if (world.rain > 0) {
        for (let i = 1; i < drops.length; i += 3) {
          drops[i] -= 0.15;
          if (drops[i] < 0) drops[i] = 8;
        }
        rainGeo.attributes.position.needsUpdate = true;
      }
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material)
          for (const material of Array.isArray(m.material)
            ? m.material
            : [m.material]) {
            const t = (material as THREE.MeshBasicMaterial).map;
            if (t) t.dispose();
            material.dispose();
          }
      });
      renderer.dispose();
      node.removeChild(renderer.domElement);
    };
  }, [world.agents, world.rain, world.bridgeLimit, world.paint]);
  return (
    <div
      className="city-host"
      ref={host}
      aria-label="Interactive 3D delivery district. Drag to orbit; scroll to zoom."
    >
      {error && <div className="city-error">{error}</div>}
      <div className="city-hint">Drag to orbit · Scroll to explore</div>
      <div className="city-key">
        <i />
        {world.agents} robots · 6 deliveries · 3 river crossings
      </div>
    </div>
  );
}
