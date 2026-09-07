// Scène 3D unique — sphère céleste + Terre stylisée orientée.
//
// Référentiel scène (repère local de l'observateur) :
//   +Y = zénith du lieu (Montréal par défaut)
//   -Z = azimut nord (regarder vers -Z = regarder vers le nord)
//   +X = azimut est
// Le plan XZ = plan horizontal du lieu, contenant l'axe ASC-DSC (à venir).
//
// L'axe polaire céleste (NCP) est donc incliné dans le plan méridien (YZ) :
//   inclinaison depuis +Y = 90° - latitude
//   direction en world = (0, sin(lat), -cos(lat))
// À Montréal (lat=45.5°) : ~ (0, 0.713, -0.701).
//
// Échelles symboliques (voir addendum 2026-09-06_addendum-terre-camera-echelles) :
//   R_CELESTE = 100, R_TERRE = 8.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const R_CELESTE = 100;
export const R_TERRE = 8;

// Montréal par défaut. La longitude n'affecte pas le rendu tant que la
// Terre reste non-texturée (task future).
export const MONTREAL = {
  latitude: 45.5017,
  longitude: -73.5673,
  label: 'Montréal',
};

const DEG = Math.PI / 180;

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x000000);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    2000,
  );
  camera.position.set(60, 45, 90);
  camera.lookAt(0, 0, 0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  // --- Sphère céleste (wireframe, discret) ---
  const celeste = new THREE.Mesh(
    new THREE.SphereGeometry(R_CELESTE, 48, 32),
    new THREE.MeshBasicMaterial({
      color: 0x224466,
      wireframe: true,
      transparent: true,
      opacity: 0.18,
    }),
  );
  scene.add(celeste);

  // --- Terre stylisée ---
  // Sphère solide grise-bleu, avec axe polaire incliné selon la latitude
  // du lieu d'observation (Montréal au sommet +Y).
  const terre = new THREE.Mesh(
    new THREE.SphereGeometry(R_TERRE, 48, 32),
    new THREE.MeshStandardMaterial({
      color: 0x334455,
      roughness: 0.7,
      metalness: 0.1,
    }),
  );
  // Rotation autour de -X pour incliner l'axe polaire depuis +Y (défaut
  // Three.js) vers (0, sin(lat), -cos(lat)). Angle = (90° - lat).
  terre.rotation.x = -(90 - MONTREAL.latitude) * DEG;
  scene.add(terre);

  // Marqueur brillant au sommet de la Terre = point d'observation (Montréal).
  // On l'ajoute AVANT la rotation en tant qu'enfant de terre pour qu'il
  // suive l'orientation ; on le place à (0, R_TERRE, 0) dans le repère
  // local Terre — mais après rotation.x=−(90−lat), ce point local n'est
  // plus au sommet world. Corrigeons : le marqueur est un enfant de
  // scene, pas de terre, positionné en world à (0, R_TERRE, 0).
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(R_TERRE * 0.06, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffcc44 }),
  );
  marker.position.set(0, R_TERRE, 0);
  scene.add(marker);

  // Petit axe polaire visible (tige fine) pour repérer l'orientation.
  // Vecteur NCP en world : (0, sin(lat), -cos(lat)). Longueur R_TERRE * 1.6.
  const ncp = new THREE.Vector3(
    0,
    Math.sin(MONTREAL.latitude * DEG),
    -Math.cos(MONTREAL.latitude * DEG),
  );
  const axeGeo = new THREE.BufferGeometry().setFromPoints([
    ncp.clone().multiplyScalar(-R_TERRE * 1.4),
    ncp.clone().multiplyScalar(R_TERRE * 1.4),
  ]);
  const axeMat = new THREE.LineBasicMaterial({
    color: 0x88aaff,
    transparent: true,
    opacity: 0.55,
  });
  scene.add(new THREE.Line(axeGeo, axeMat));

  // --- Éclairage minimal ---
  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(50, 80, 30);
  scene.add(key);

  // --- Repères de dev (à retirer plus tard) ---
  // Axes XYZ (rouge=X est, vert=Y zénith, bleu=Z sud).
  scene.add(new THREE.AxesHelper(R_CELESTE * 1.1));
  // Grille dans le plan horizontal (XZ), à Y=0. Pas trop dense.
  const grid = new THREE.GridHelper(R_CELESTE * 2, 20, 0x334455, 0x223344);
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  scene.add(grid);

  // --- Resize handler ---
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  function animate() {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  return { renderer, scene, camera, controls, animate };
}
