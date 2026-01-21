import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Pane } from 'tweakpane';
import { DissolveEffect } from './DissolveEffect';

const canvas = document.querySelector('#c') as HTMLCanvasElement;
document.body.classList.remove("loading");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 5, 5);
scene.add(directionalLight);

new OrbitControls(camera, renderer.domElement);

const geometry = new THREE.TorusKnotGeometry(1, 0.4, 256, 32);
const material = new THREE.MeshPhysicalMaterial({
    color: 0x636363,
    metalness: 2.0,
    roughness: 0.0,
});
const mesh = new THREE.Mesh(geometry, material);
const dissolveEffect = new DissolveEffect(renderer, scene, mesh);

const pane = new Pane();
const params = {
    progress: -7.0,
    edgeWidth: 0.8,
    frequency: 0.25,
    amplitude: 16.0,
    edgeColor: '#4d9bff',
    particleColor: '#4d9bff',
    particleBaseSize: 80,
    playing: false,
    speed: 0.08,
    direction: 'forward',
};

pane.addBinding(params, 'playing', { label: 'Play' }).on('change', (ev) => {
    if (ev.value) {
        dissolveEffect.play();
    } else {
        dissolveEffect.pause();
    }
});

pane.addBinding(params, 'speed', { min: 0.01, max: 0.5, step: 0.01 }).on('change', (ev) => {
    dissolveEffect.setSpeed(ev.value);
});

pane.addBinding(params, 'direction', { options: { forward: 'forward', backward: 'backward' } }).on('change', (ev) => {
    dissolveEffect.setDirection(ev.value as 'forward' | 'backward');
});

const dissolveFolder = pane.addFolder({ title: 'Dissolve' });
dissolveFolder.addBinding(params, 'progress', { min: -20, max: 20, step: 0.01 }).on('change', (ev) => {
    dissolveEffect.setProgress(ev.value);
});
dissolveFolder.addBinding(params, 'edgeWidth', { min: 0.1, max: 8, step: 0.01 }).on('change', (ev) => {
    dissolveEffect.setEdgeWidth(ev.value);
});
dissolveFolder.addBinding(params, 'frequency', { min: 0.01, max: 2, step: 0.01 }).on('change', (ev) => {
    dissolveEffect.setFrequency(ev.value);
});
dissolveFolder.addBinding(params, 'amplitude', { min: 0.1, max: 20, step: 0.01 }).on('change', (ev) => {
    dissolveEffect.setAmplitude(ev.value);
});
dissolveFolder.addBinding(params, 'edgeColor').on('change', (ev) => {
    dissolveEffect.setEdgeColor(new THREE.Color(ev.value));
});

const particleFolder = pane.addFolder({ title: 'Particles' });
particleFolder.addBinding(params, 'particleColor').on('change', (ev) => {
    dissolveEffect.setParticleColor(new THREE.Color(ev.value));
});
particleFolder.addBinding(params, 'particleBaseSize', { min: 10, max: 200, step: 1 }).on('change', (ev) => {
    dissolveEffect.setParticleBaseSize(ev.value);
});


function animate() {
    requestAnimationFrame(animate);
    dissolveEffect.update();
    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
