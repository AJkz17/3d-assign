"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import * as TWEEN from "@tweenjs/tween.js";
import Papa from "papaparse";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";
import {
  CSS3DRenderer,
  CSS3DObject,
} from "three/addons/renderers/CSS3DRenderer.js";

// Published Google Sheet CSV link (set in .env.local) or a CSV file in /public
const DATA_URL = process.env.NEXT_PUBLIC_SHEET_CSV_URL || "/data.csv";

// Sheet headers: Name, Photo, Age, Country, Interest, Net Worth
// Headers are lowercased and spaces become "_" ("Net Worth" -> net_worth)
type Row = {
  name: string;
  photo: string; // image URL
  age: string;
  country: string;
  interest: string;
  net_worth: string;
};

type LayoutName = "table" | "sphere" | "helix" | "grid";
const LAYOUTS: LayoutName[] = ["table", "sphere", "helix", "grid"];

// ---- Layout sizes (200 cards) ----
const TABLE_COLUMNS = 20; // TABLE: 20 x 10
const TABLE_ROWS = 10;
const GRID = { x: 5, y: 4, z: 10 }; // GRID: 5 x 4 x 10
const GRID_GAP = { x: 320, y: 300, z: 300 }; // space between grid cards

// ---- Net worth -> tile color (colors live in globals.css) ----
// Red: under $100K, Orange: $100K to $200K, Green: over $200K
function parseNetWorth(text?: string): number | null {
  const cleaned = (text ?? "").replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function tierColor(netWorth: number | null): string {
  if (netWorth === null) return "var(--line)"; // missing/invalid value
  if (netWorth < 100000) return "var(--net-low)"; // red
  if (netWorth <= 200000) return "var(--net-mid)"; // orange
  return "var(--net-high)"; // green
}

function buildScene(container: HTMLElement, rows: Row[]) {
  // fall back to the window size if the container has no size yet
  const getSize = () => ({
    width: container.clientWidth || window.innerWidth,
    height: container.clientHeight || window.innerHeight,
  });

  const camera = new THREE.PerspectiveCamera(
    40,
    getSize().width / getSize().height,
    1,
    10000
  );
  camera.position.z = 3000;

  const scene = new THREE.Scene();
  // Our own tween group: works the same in every tween.js version
  const group = new TWEEN.Group();
  const objects: CSS3DObject[] = [];
  const targets: Record<LayoutName, THREE.Object3D[]> = {
    table: [],
    sphere: [],
    helix: [],
    grid: [],
  };

  // One card per row of the sheet, plus its TABLE position
  rows.forEach((row, i) => {
    const element = document.createElement("div");
    element.className = "element";
    // tile color by net worth (the CSS reads --tier)
    element.style.setProperty("--tier", tierColor(parseNetWorth(row.net_worth)));

    const photo = document.createElement("img");
    photo.className = "photo";
    photo.alt = row.name ?? "";
    photo.decoding = "async";
    photo.referrerPolicy = "no-referrer";
    // only accept http(s) links from the sheet
    if (/^https?:\/\//i.test(row.photo ?? "")) photo.src = row.photo;
    // if the image can't load, hide it instead of showing a broken icon
    photo.onerror = () => {
      photo.style.visibility = "hidden";
    };

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = row.name ?? "";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = [row.age, row.country, row.interest]
      .filter(Boolean)
      .join(" · ");

    const worth = document.createElement("div");
    worth.className = "worth";
    worth.textContent = row.net_worth ?? "";

    // textContent (not innerHTML) so sheet content can't inject HTML
    element.append(photo, name, meta, worth);

    const card = new CSS3DObject(element);
    card.position.set(
      Math.random() * 4000 - 2000,
      Math.random() * 4000 - 2000,
      Math.random() * 4000 - 2000
    );
    scene.add(card);
    objects.push(card);

    // TABLE layout: 20 columns x 10 rows, centered
    const col = i % TABLE_COLUMNS;
    const line = Math.floor(i / TABLE_COLUMNS);

    const target = new THREE.Object3D();
    target.position.x = (col - (TABLE_COLUMNS - 1) / 2) * 140;
    target.position.y = ((TABLE_ROWS - 1) / 2 - line) * 180;
    targets.table.push(target);
  });

  const count = objects.length;
  const vector = new THREE.Vector3();

  // SPHERE layout
  for (let i = 0; i < count; i++) {
    const phi = Math.acos(-1 + (2 * i) / count);
    const theta = Math.sqrt(count * Math.PI) * phi;

    const target = new THREE.Object3D();
    target.position.setFromSphericalCoords(800, phi, theta);
    vector.copy(target.position).multiplyScalar(2);
    target.lookAt(vector);
    targets.sphere.push(target);
  }

  // HELIX layout: DOUBLE helix, two strands 180 degrees apart
  const perStrand = Math.ceil(count / 2);
  for (let i = 0; i < count; i++) {
    const strand = i % 2; // 0 = first strand, 1 = second strand
    const k = Math.floor(i / 2); // position along its strand
    const theta = k * 0.35 + strand * Math.PI;
    const y = ((perStrand - 1) / 2 - k) * 16;

    const target = new THREE.Object3D();
    target.position.setFromCylindricalCoords(900, theta, y);
    vector.set(target.position.x * 2, target.position.y, target.position.z * 2);
    target.lookAt(vector);
    targets.helix.push(target);
  }

  // GRID layout: 5 (x) by 4 (y) by 10 (z) layers, first cards in front
  for (let i = 0; i < count; i++) {
    const col = i % GRID.x;
    const row = Math.floor(i / GRID.x) % GRID.y;
    const layer = Math.floor(i / (GRID.x * GRID.y));

    const target = new THREE.Object3D();
    target.position.x = (col - (GRID.x - 1) / 2) * GRID_GAP.x;
    target.position.y = ((GRID.y - 1) / 2 - row) * GRID_GAP.y;
    target.position.z = ((GRID.z - 1) / 2 - layer) * GRID_GAP.z;
    targets.grid.push(target);
  }

  const renderer = new CSS3DRenderer();
  renderer.setSize(getSize().width, getSize().height);
  container.appendChild(renderer.domElement);

  const render = () => renderer.render(scene, camera);

  const controls = new TrackballControls(camera, renderer.domElement);
  controls.minDistance = 500;
  controls.maxDistance = 6000;
  controls.addEventListener("change", render);

  function transform(layout: LayoutName, duration = 2000) {
    group.removeAll();

    objects.forEach((object, i) => {
      const target = targets[layout][i];

      new TWEEN.Tween(object.position, group)
        .to(
          { x: target.position.x, y: target.position.y, z: target.position.z },
          Math.random() * duration + duration
        )
        .easing(TWEEN.Easing.Exponential.InOut)
        .start();

      new TWEEN.Tween(object.rotation, group)
        .to(
          { x: target.rotation.x, y: target.rotation.y, z: target.rotation.z },
          Math.random() * duration + duration
        )
        .easing(TWEEN.Easing.Exponential.InOut)
        .start();
    });

    // keeps re-rendering while the cards move
    new TWEEN.Tween({}, group).to({}, duration * 2).onUpdate(render).start();
  }

  function onResize() {
    camera.aspect = getSize().width / getSize().height;
    camera.updateProjectionMatrix();
    renderer.setSize(getSize().width, getSize().height);
    render();
  }
  window.addEventListener("resize", onResize);

  let frameId = requestAnimationFrame(function animate() {
    frameId = requestAnimationFrame(animate);
    group.update();
    controls.update();
    render(); // draw every frame so the layout animation always shows
  });

  transform("table");

  return {
    transform,
    dispose() {
      cancelAnimationFrame(frameId);
      group.removeAll();
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.domElement.remove();
    },
  };
}

export default function DashboardPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ReturnType<typeof buildScene> | null>(null);
  const [status, setStatus] = useState("Loading data…");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;

    Papa.parse<Row>(DATA_URL, {
      download: true,
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
      complete: (result) => {
        if (disposed) return;
        try {
          // keep only rows that have a name
          const rows = result.data.filter((r) => r.name);
          if (rows.length === 0) {
            setStatus(
              `No usable rows in ${DATA_URL}. The first row must be: Name,Photo,Age,Country,Interest,Net Worth`
            );
            return;
          }
          sceneRef.current = buildScene(container, rows);
          setStatus("");
        } catch (e) {
          console.error(e);
          setStatus(`3D scene error: ${(e as Error).message}`);
        }
      },
      error: (err) => {
        if (disposed) return;
        console.error(err);
        setStatus(`Could not load ${DATA_URL}: ${err.message}`);
      },
    });

    return () => {
      disposed = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  return (
    <div className="scene-wrap">
      <div ref={containerRef} className="scene-container" />

      {/* Shows what went wrong (loading, missing file, bad header, error) */}
      {status && (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            right: 16,
            zIndex: 20,
            padding: "10px 12px",
            borderRadius: 8,
            background: "#fff",
            border: "1px solid #d9dce3",
            color: "#14171f",
            fontSize: 14,
          }}
        >
          {status}
        </div>
      )}

      <div className="scene-menu">
        {LAYOUTS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => sceneRef.current?.transform(name)}
          >
            {name.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Net worth legend: red (low) -> orange -> green (high) */}
      <div
        className="legend"
        title="Net worth: red under $100K, orange $100K to $200K, green over $200K"
      >
        <span>LOW</span>
        <div className="legend-bar" />
        <span>HIGH</span>
      </div>
    </div>
  );
}