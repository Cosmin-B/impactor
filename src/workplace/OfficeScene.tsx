import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  TEAMS,
  type WorkResult,
  type Team,
} from "../../shared/workplace/engine";
export function OfficeScene({
  result,
  playing,
  onFinished,
}: {
  result: WorkResult;
  playing: boolean;
  onFinished: () => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    current = useRef({ result, playing, onFinished });
  current.current = { result, playing, onFinished };
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setClearColor(0xf0f2eb);
    node.appendChild(renderer.domElement);
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
    camera.position.set(20, 23, 26);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);
    controls.maxPolarAngle = 1.35;
    controls.minDistance = 15;
    controls.maxDistance = 60;
    scene.add(new THREE.HemisphereLight(0xfffaef, 0x849a8c, 2.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(-10, 20, 8);
    scene.add(sun);
    const box = (
      w: number,
      h: number,
      d: number,
      c: string | number,
      x: number,
      y: number,
      z: number,
    ) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }),
      );
      m.position.set(x, y, z);
      scene.add(m);
      return m;
    };
    box(27, 0.6, 18, 0xdce3d1, 0, -0.4, 0);
    box(27, 0.08, 2, 0xe8decb, 0, -0.03, 0);
    for (const [team, t] of Object.entries(TEAMS)) {
      box(6.6, 0.12, 5.5, t.color, t.x, 0.04, t.z);
      for (const side of [-1, 1]) {
        box(6.6, 1.2, 0.12, 0xf1efe5, t.x, 0.65, t.z + side * 2.65);
        box(0.12, 1.2, 5.3, 0xf1efe5, t.x + side * 3.25, 0.65, t.z);
      }
      for (let i = 0; i < 4; i++) {
        box(
          1.1,
          0.12,
          0.65,
          0xc7b596,
          t.x + (i % 2) * 2 - 1,
          0.65,
          t.z + Math.floor(i / 2) * 1.8 - 0.9,
        );
        box(
          0.7,
          0.5,
          0.09,
          0x5b7777,
          t.x + (i % 2) * 2 - 1,
          0.97,
          t.z + Math.floor(i / 2) * 1.8 - 1.15,
        );
      }
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 90;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fffdf6";
      ctx.fillRect(0, 0, 512, 90);
      ctx.fillStyle = "#344b40";
      ctx.font = "600 36px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(t.name, 256, 57);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: new THREE.CanvasTexture(canvas),
          depthTest: false,
        }),
      );
      sprite.position.set(t.x, 2.5, t.z);
      sprite.scale.set(4, 0.7, 1);
      scene.add(sprite);
    }
    const capacity = 100,
      body = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.32, 0.45, 0.32),
        new THREE.MeshStandardMaterial({ color: 0xffffff }),
        capacity,
      ),
      head = new THREE.InstancedMesh(
        new THREE.SphereGeometry(0.15, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x415c51 }),
        capacity,
      );
    body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    head.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(body, head);
    const matrix = new THREE.Matrix4(),
      pos = new THREE.Vector3(),
      color = new THREE.Color();
    const queue = Array.from({ length: 100 }, () => [] as WorkResult["tasks"]);
    let prior: WorkResult | null = null,
      start = 0,
      wasPlaying = false,
      frame = 0,
      done = false;
    const observer = new ResizeObserver(() => {
      renderer.setSize(node.clientWidth, node.clientHeight);
      camera.aspect = node.clientWidth / node.clientHeight;
      camera.updateProjectionMatrix();
    });
    observer.observe(node);
    function animate(now: number) {
      const { result: r, playing: p } = current.current;
      if (prior !== r) {
        prior = r;
        for (const q of queue) q.length = 0;
        for (const task of r.tasks)
          if (task.agent >= 0) queue[task.agent].push(task);
        start = now;
        done = false;
      }
      if (p && !wasPlaying) {
        start = now;
        done = false;
      }
      wasPlaying = p;
      const progress = p ? Math.min(1, (now - start) / 18000) : 1,
        time = progress * r.minutes;
      body.count = head.count = r.settings.agents;
      for (let i = 0; i < r.settings.agents; i++) {
        const jobs = queue[i];
        const task = jobs.find((t) => time >= t.start && time < t.finish),
          previous = jobs.filter((t) => t.finish <= time).at(-1);
        const target = task
          ? TEAMS[task.team]
          : previous
            ? TEAMS[previous.team]
            : null;
        const offsetX = ((i % 5) - 2) * 0.44,
          offsetZ = ((Math.floor(i / 5) % 4) - 1.5) * 0.4;
        pos.set(
          target ? target.x + offsetX : ((i % 20) - 10) * 0.6,
          0.42,
          target ? target.z + offsetZ : (Math.floor(i / 20) - 2) * 0.4,
        );
        if (task) {
          const from = previous ? TEAMS[previous.team] : { x: 0, z: 0 },
            travel = Math.min(
              1,
              (time - task.start) / Math.min(2, task.minutes),
            );
          pos.x = from.x + (target!.x - from.x) * travel + offsetX;
          pos.z = from.z + (target!.z - from.z) * travel + offsetZ;
        }
        matrix.makeTranslation(pos.x, pos.y, pos.z);
        body.setMatrixAt(i, matrix);
        body.setColorAt(i, color.set(task ? TEAMS[task.team].color : 0xadb9a6));
        matrix.makeTranslation(pos.x, pos.y + 0.36, pos.z);
        head.setMatrixAt(i, matrix);
      }
      body.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = true;
      if (body.instanceColor) body.instanceColor.needsUpdate = true;
      if (p && progress === 1 && !done) {
        done = true;
        current.current.onFinished();
      }
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material)
          for (const a of Array.isArray(m.material)
            ? m.material
            : [m.material]) {
            (a as THREE.MeshBasicMaterial).map?.dispose();
            a.dispose();
          }
      });
      renderer.dispose();
      node.removeChild(renderer.domElement);
    };
  }, []);
  return (
    <div
      className="office-scene"
      ref={host}
      aria-label="3D workplace with up to 100 agents moving between six teams"
    >
      <span>
        Drag to orbit · {result.settings.agents} simulated agents ·{" "}
        {result.tasks.length} tasks
      </span>
    </div>
  );
}
