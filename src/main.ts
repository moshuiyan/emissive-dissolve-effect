import './style.css'
import * as THREE from 'three';
import { Pane } from 'tweakpane';
import { OrbitControls } from 'three/examples/jsm/Addons.js';
import { EffectComposer, RenderPass, OutputPass, UnrealBloomPass, ShaderPass } from 'three/examples/jsm/Addons.js';
import { TeapotGeometry } from 'three/examples/jsm/Addons.js';
import { BladeApi } from 'tweakpane';
import { DissolveEffect } from './lib/DissolveEffect';

let scale = 1.0;
function isMobileDevice() {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
if (isMobileDevice()) scale = 0.7;


const cnvs = document.getElementById('c') as HTMLCanvasElement;
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(75, cnvs.clientWidth / cnvs.clientHeight, 0.001, 100);


if (isMobileDevice()) cam.position.set(0, 8, 18)
else cam.position.set(0, 1, 14);
const blackColor = new THREE.Color(0x000000);
scene.background = blackColor;


const re = new THREE.WebGLRenderer({ canvas: cnvs, antialias: true });
re.setPixelRatio(window.devicePixelRatio);
re.setSize(cnvs.clientWidth * scale, cnvs.clientHeight * scale, false);
re.toneMapping = THREE.CineonToneMapping;
re.outputColorSpace = THREE.SRGBColorSpace;


const effectComposer1 = new EffectComposer(re);
const renderPass = new RenderPass(scene, cam);
let radius = isMobileDevice() ? 0.1 : 0.25;
const unrealBloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerHeight * scale, window.innerWidth * scale), 0.5, radius, 0.2);
const outPass = new OutputPass();

const effectComposer2 = new EffectComposer(re);
const shaderPass = new ShaderPass(new THREE.ShaderMaterial({
    uniforms: {
        tDiffuse: { value: null },
        uBloomTexture: {
            value: effectComposer1.renderTarget2.texture
        },
        uStrength: {
            value: isMobileDevice() ? 6.00 : 8.00,
        },
    },

    vertexShader: `
        varying vec2 vUv;
        void main(){
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
    `,

    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D uBloomTexture;
        uniform float uStrength;
        varying vec2 vUv;
        void main(){
            vec4 baseEffect = texture2D(tDiffuse,vUv);
            vec4 bloomEffect = texture2D(uBloomTexture,vUv);
            gl_FragColor =baseEffect + bloomEffect * uStrength;
        }
    `,
}));

effectComposer1.addPass(renderPass);
effectComposer1.addPass(unrealBloomPass);
effectComposer1.renderToScreen = false;

effectComposer2.addPass(renderPass);
effectComposer2.addPass(shaderPass);
effectComposer2.addPass(outPass);


const orbCtrls = new OrbitControls(cam, cnvs);


const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256);
const cubeCamera = new THREE.CubeCamera(0.1, 500, cubeRenderTarget);
let cubeTextureUrls: string[];
let cubeTexture: THREE.CubeTexture;


function generateCubeUrls(prefix: string, postfix: string) {
    return [
        prefix + 'posx' + postfix, prefix + 'negx' + postfix,
        prefix + 'posy' + postfix, prefix + 'negy' + postfix,
        prefix + 'posz' + postfix, prefix + 'negz' + postfix
    ];
}


cubeTextureUrls = generateCubeUrls('/cubeMap2/', '.png');


async function loadTextures() {
    const cubeTextureLoader = new THREE.CubeTextureLoader();
    cubeTexture = await cubeTextureLoader.loadAsync(cubeTextureUrls);

    scene.background = cubeTexture;
    scene.environment = cubeTexture;

    cubeCamera.update(re, scene);

    document.body.classList.remove("loading");
}


loadTextures();


let segments1 = isMobileDevice() ? 90 : 140;
let segments2 = isMobileDevice() ? 18 : 32;

const sphere = new THREE.SphereGeometry(4.5, segments1, segments1);
const teaPot = new TeapotGeometry(3, segments2);
const torus = new THREE.TorusGeometry(3, 1.5, segments1, segments1);
const torusKnot = new THREE.TorusKnotGeometry(2.5, 0.8, segments1, segments1);
let geoNames = ["TorusKnot", "Tea Pot", "Sphere", "Torus"];
let geometries = [torusKnot, teaPot, sphere, torus];


const phyMat = new THREE.MeshPhysicalMaterial();
phyMat.color = new THREE.Color(0x636363);
phyMat.metalness = 2.0;
phyMat.roughness = 0.0;
phyMat.side = THREE.DoubleSide;


let mesh = new THREE.Mesh(geometries[0], phyMat);
scene.add(mesh);

const dissolveEffect = new DissolveEffect(re, scene, mesh);
const dissolveUniforms = dissolveEffect.getDissolveUniforms();
const particleUniforms = dissolveEffect.getParticleUniforms();


function resizeRendererToDisplaySize() {
    const width = cnvs.clientWidth * scale;
    const height = cnvs.clientHeight * scale;
    const needResize = cnvs.width !== width || cnvs.height !== height;
    if (needResize) {
        re.setSize(width, height, false);

        renderPass.setSize(width, height);
        outPass.setSize(width, height);
        unrealBloomPass.setSize(width, height);

        effectComposer1.setSize(width, height);
        effectComposer2.setSize(width, height);
    }

    return needResize;
}

const tweaks = {
    dissolveProgress: dissolveUniforms.uProgress.value,
    edgeWidth: dissolveUniforms.uEdge.value,
    amplitude: dissolveUniforms.uAmp.value,
    frequency: dissolveUniforms.uFreq.value,
    meshVisible: true,
    meshColor: "#" + (mesh.material as THREE.MeshPhysicalMaterial).color.getHexString(),
    edgeColor: "#" + dissolveUniforms.uEdgeColor.value.getHexString(),
    autoDissolve: false,
    particleVisible: true,
    particleBaseSize: particleUniforms.uBaseSize.value,
    particleColor: "#" + particleUniforms.uColor.value.getHexString(),
    particleSpeed: dissolveEffect.speed,
    bloomStrength: shaderPass.uniforms.uStrength.value,
    rotationY: mesh.rotation.y,
};


function createTweakList(name: string, keys: string[], vals: any[]): BladeApi {
    const opts = [];
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const v = vals[i];
        opts.push({ text: k, value: v });
    }

    return pane.addBlade({
        view: 'list', label: name,
        options: opts,
        value: vals[0]
    })
}


function handleMeshChange(geo: any) {
    const newMesh = new THREE.Mesh(geo, phyMat);
    dissolveEffect.setMesh(newMesh);
    mesh = newMesh;
}


const pane = new Pane();
const controller = pane.addFolder({ title: "Controls", expanded: false });

const meshFolder = controller.addFolder({ title: "Mesh", expanded: false });
let meshBlade = createTweakList('Mesh', geoNames, geometries);
//@ts-ignore
meshBlade.on('change', (val) => { handleMeshChange(val.value) })
meshFolder.add(meshBlade);
meshFolder.addBinding(tweaks, "bloomStrength", { min: 1, max: 20, step: 0.01, label: "Bloom Strength" }).on('change', (obj) => { shaderPass.uniforms.uStrength.value = obj.value; })
meshFolder.addBinding(tweaks, "rotationY", { min: -(Math.PI * 2), max: (Math.PI * 2), step: 0.01, label: "Rotation Y" }).on('change', (obj) => { 
    mesh.rotation.y = obj.value;
});

const dissolveFolder = controller.addFolder({ title: "Dissolve Effect", expanded: false, });
dissolveFolder.addBinding(tweaks, "meshVisible", { label: "Visible" }).on('change', (obj) => { mesh.visible = obj.value; });
let progressBinding = dissolveFolder.addBinding(tweaks, "dissolveProgress", { min: -20, max: 20, step: 0.0001, label: "Progress" }).on('change', (obj) => { dissolveUniforms.uProgress.value = obj.value; });
dissolveFolder.addBinding(tweaks, "autoDissolve", { label: "Auto Animate" }).on('change', (obj) => { 
    tweaks.autoDissolve = obj.value
    if(tweaks.autoDissolve) dissolveEffect.play(); else dissolveEffect.pause();
});
dissolveFolder.addBinding(tweaks, "edgeWidth", { min: 0.1, max: 8, step: 0.001, label: "Edge Width" }).on('change', (obj) => { dissolveUniforms.uEdge.value = obj.value });
dissolveFolder.addBinding(tweaks, "frequency", { min: 0.001, max: 2, step: 0.001, label: "Frequency" }).on('change', (obj) => { dissolveUniforms.uFreq.value = obj.value });
dissolveFolder.addBinding(tweaks, "amplitude", { min: 0.1, max: 20, step: 0.001, label: "Amplitude" }).on('change', (obj) => { dissolveUniforms.uAmp.value = obj.value });
dissolveFolder.addBinding(tweaks, "meshColor", { label: "Mesh Color" }).on('change', (obj) => { (mesh.material as THREE.MeshPhysicalMaterial).color.set(obj.value) });
dissolveFolder.addBinding(tweaks, "edgeColor", { label: "Edge Color" }).on('change', (obj) => { dissolveUniforms.uEdgeColor.value.set(obj.value); });


const particleFolder = controller.addFolder({ title: "Particle", expanded: false });
particleFolder.addBinding(tweaks, "particleVisible", { label: "Visible" }).on('change', (obj) => { dissolveEffect.setParticlesVisible(obj.value) });
particleFolder.addBinding(tweaks, "particleBaseSize", { min: 10.0, max: 100, step: 0.01, label: "Base size" }).on('change', (obj) => { particleUniforms.uBaseSize.value = obj.value; });
particleFolder.addBinding(tweaks, "particleColor", { label: "Color" }).on('change', (obj) => { particleUniforms.uColor.value.set(obj.value); });
particleFolder.addBinding(tweaks, "particleSpeed", { min: 0.001, max: 0.1, step: 0.001, label: "Speed" }).on('change', (obj) => { dissolveEffect.speed = obj.value });


let geoIdx = 0;
let geoLength = geometries.length;

function animateDissolve() {
    if (!tweaks.autoDissolve) return;

    let progress = dissolveUniforms.uProgress;

    if (dissolveEffect.direction === 'forward' && progress.value > 14) {
        dissolveEffect.direction = 'backward';
        geoIdx++;
        handleMeshChange(geometries[geoIdx % geoLength]);
        //@ts-ignore
        meshBlade.value = geometries[geoIdx % geoLength];
    } else if (dissolveEffect.direction === 'backward' && progress.value < -17) {
        dissolveEffect.direction = 'forward';
    }

    progressBinding.controller.value.setRawValue(progress.value);
}

function floatMeshes(time: number) {
    mesh.position.set(0, Math.sin(time * 2.0) * 0.5, 0);
}


const clock = new THREE.Clock();
function animate() {
    orbCtrls.update();
    const elapsedTime = clock.getElapsedTime();
    const deltaTime = clock.getDelta();

    dissolveEffect.update(elapsedTime, deltaTime);
    
    animateDissolve();
    floatMeshes(elapsedTime);

    if (resizeRendererToDisplaySize()) {
        const canvas = re.domElement;
        cam.aspect = canvas.clientWidth / canvas.clientHeight;
        cam.updateProjectionMatrix();
    }

    scene.background = blackColor;
    effectComposer1.render();

    scene.background = cubeTexture;
    effectComposer2.render();
    requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

window.addEventListener('orientationchange', () => {
    location.reload();
});