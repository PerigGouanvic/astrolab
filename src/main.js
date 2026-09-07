// astrolab — point d'entrée.
// Charge la scène 3D unique et lance la boucle de rendu.

import { createScene } from './scene.js';

const canvas = document.getElementById('scene');
if (!canvas) throw new Error('#scene canvas introuvable');

const { animate } = createScene(canvas);
animate();

// Le HUD (boutons astrologue/astronome) est câblé à la task #12.
