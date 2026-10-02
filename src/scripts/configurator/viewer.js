// FR-7: Three.js configurator viewer. Loaded on demand (dynamic import) only on capable devices.
// Renders on demand: a frame is drawn only when the camera or an option changes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

function groundShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(0,0,0,0.7)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.3)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export async function createViewer({ canvas, modelUrl, simplified = false, reducedMotion = false, onProgress }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, simplified ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x0b0c0f, 1);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const key = new THREE.DirectionalLight(0xffe2c4, 2.2);
  key.position.set(-2, 3, 2.5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xd08a4e, 1.4);
  rim.position.set(2.5, 1.5, -2.5);
  scene.add(rim);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.1), new THREE.MeshBasicMaterial({ map: groundShadowTexture(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.001;
  scene.add(shadow);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  camera.position.set(-1.9, 1.05, 3.3);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0.01, 0.55, 0);
  controls.enablePan = false;
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2.1;
  controls.maxDistance = simplified ? 4.2 : 6;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.enableZoom = !simplified;
  controls.update();

  const draco = new DRACOLoader().setDecoderPath('/draco/');
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const gltf = await loader.loadAsync(modelUrl, (e) => e.total && onProgress?.(e.loaded / e.total));
  const root = gltf.scene;
  scene.add(root);

  const materials = {};
  const nodes = {};
  root.traverse((o) => {
    if (o.name) nodes[o.name] = o;
    if (o.isMesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => (materials[m.name] = m));
    }
  });
  if (materials.LightFront) materials.LightFront.emissiveIntensity = 3;
  if (materials.LightRear) materials.LightRear.emissiveIntensity = 2;

  let needsRender = true;
  let colourAnim = null;
  const request = () => (needsRender = true);
  controls.addEventListener('change', request);

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep the whole bike in frame on narrow (portrait) screens.
    camera.fov = w / h < 1 ? 30 + (1 - w / h) * 26 : 30;
    camera.updateProjectionMatrix();
    request();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  let raf = 0;
  const loop = (t) => {
    raf = requestAnimationFrame(loop);
    const moving = controls.update();
    if (colourAnim) {
      const k = Math.min(1, (t - colourAnim.start) / 320);
      colourAnim.mat.color.copy(colourAnim.from).lerp(colourAnim.to, 1 - Math.pow(1 - k, 3));
      if (k >= 1) colourAnim = null;
      needsRender = true;
    }
    if (needsRender || moving) {
      renderer.render(scene, camera);
      needsRender = false;
    }
  };
  raf = requestAnimationFrame(loop);

  return {
    setColour(hex) {
      const mat = materials.FramePaint;
      if (!mat) return;
      const to = new THREE.Color(hex);
      if (reducedMotion) {
        mat.color.copy(to);
        request();
      } else {
        colourAnim = { mat, from: mat.color.clone(), to, start: performance.now() };
      }
    },
    setAccessory(name, on) {
      const node = nodes[name === 'rack' ? 'Rack' : 'Basket'];
      if (node) node.visible = on;
      request();
    },
    /** Renders a fresh frame and returns it as a PNG blob (no preserveDrawingBuffer needed). */
    screenshot() {
      renderer.render(scene, camera);
      return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
    },
  };
}
