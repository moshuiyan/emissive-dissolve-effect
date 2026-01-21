import * as THREE from 'three';
import snoise from './noise/snoise.glsl?raw';

interface DissolveEffectOptions {
    edgeColor?: THREE.Color;
    particleColor?: THREE.Color;
    frequency?: number;
    amplitude?: number;
    progress?: number;
    edgeWidth?: number;
    particleBaseSize?: number;
    particleSpeed?: number;
}

export class DissolveEffect {
    private renderer: THREE.WebGLRenderer;
    private scene: THREE.Scene;
    private mesh: THREE.Mesh;
    private particleMesh!: THREE.Points;

    private dissolveMaterial!: THREE.ShaderMaterial;
    private particleMaterial!: THREE.ShaderMaterial;

    private dissolveUniforms: { [key: string]: THREE.IUniform };
    private particleUniforms: { [key: string]: THREE.IUniform };
    
    public isPlaying = false;
    public speed = 0.08;
    public direction: 'forward' | 'backward' = 'forward';

    constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, mesh: THREE.Mesh, options: DissolveEffectOptions = {}) {
        this.renderer = renderer;
        this.scene = scene;
        this.mesh = mesh;

        this.dissolveUniforms = this._createDissolveUniforms(options);
        this.particleUniforms = this._createParticleUniforms(options);
        
        this._initDissolveMaterial();
        this._initParticleSystem();
    }

    private _createDissolveUniforms(options: DissolveEffectOptions) {
        return {
            uEdgeColor: { value: options.edgeColor || new THREE.Color(0x4d9bff) },
            uFreq: { value: options.frequency || 0.25 },
            uAmp: { value: options.amplitude || 16.0 },
            uProgress: { value: options.progress || -7.0 },
            uEdge: { value: options.edgeWidth || 0.8 }
        };
    }

    private _createParticleUniforms(options: DissolveEffectOptions) {
        const particleTexture = new THREE.TextureLoader().load('/particle.png');
        return {
            uTexture: { value: particleTexture },
            uPixelDensity: { value: this.renderer.getPixelRatio() },
            uProgress: this.dissolveUniforms.uProgress,
            uEdge: this.dissolveUniforms.uEdge,
            uAmp: this.dissolveUniforms.uAmp,
            uFreq: this.dissolveUniforms.uFreq,
            uBaseSize: { value: options.particleBaseSize || 80 },
            uColor: { value: options.particleColor || new THREE.Color(0x4d9bff) },
            uTime: { value: 0.0 }
        };
    }

    private _initDissolveMaterial() {
        const physicalMaterial = this.mesh.material as THREE.MeshPhysicalMaterial;
        physicalMaterial.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, this.dissolveUniforms);

            // Vertex shader modifications
            shader.vertexShader = `
                varying vec3 vPos;
                ${shader.vertexShader}
            `.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                vPos = position;
                `
            );

            // Fragment shader modifications
            shader.fragmentShader = `
                varying vec3 vPos;
                uniform float uFreq;
                uniform float uAmp;
                uniform float uProgress;
                uniform float uEdge;
                uniform vec3 uEdgeColor;
                ${snoise}
                ${shader.fragmentShader}
            `.replace(
                '#include <dithering_fragment>',
                `
                #include <dithering_fragment>
                float noise = snoise(vPos * uFreq) * uAmp;
                if(noise < uProgress) discard;
                float edgeWidth = uProgress + uEdge;
                if(noise > uProgress && noise < edgeWidth){
                    gl_FragColor = vec4(uEdgeColor, 1.0);
                }
                `
            );
        };
    }

    private _updateParticleAttributes(geometry: THREE.BufferGeometry) {
        const count = geometry.attributes.position.count;
        const aCurrentPos = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
        const aControl0 = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
        const aControl1 = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
        const aEndPos = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
        const aOffset = new THREE.BufferAttribute(new Float32Array(count), 1);

        const aAngle = new THREE.BufferAttribute(new Float32Array(count), 1);
        const aDist = new THREE.BufferAttribute(new Float32Array(count), 1);


        for (let i = 0; i < count; i++) {
            aAngle.setX(i, Math.random() * Math.PI * 2);
            aDist.setX(i, Math.random() * 0.5 + 0.5);

            aOffset.setX(i, Math.random() * 2);
            const x = geometry.attributes.position.getX(i);
            const y = geometry.attributes.position.getY(i);
            const z = geometry.attributes.position.getZ(i);
            aCurrentPos.setXYZ(i, x, y, z);

            const randomVec = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(Math.random() * 20);
            aEndPos.setXYZ(i, x + randomVec.x, y + randomVec.y, z + randomVec.z);

            const controlVec = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(Math.random() * 10);
            aControl0.setXYZ(i, x + controlVec.x, y + controlVec.y, z + controlVec.z);
            aControl1.setXYZ(i, x + controlVec.x * 1.5, y + controlVec.y * 1.5, z + controlVec.z * 1.5);
        }

        geometry.setAttribute('aCurrentPos', aCurrentPos);
        geometry.setAttribute('aControl0', aControl0);
        geometry.setAttribute('aControl1', aControl1);
        geometry.setAttribute('aEndPos', aEndPos);
        geometry.setAttribute('aOffset', aOffset);
        geometry.setAttribute('aAngle', aAngle);
        geometry.setAttribute('aDist', aDist);
    }

    private _initParticleSystem() {
        const geometry = this.mesh.geometry;
        this._updateParticleAttributes(geometry);

        this.particleMaterial = new THREE.ShaderMaterial({
            uniforms: this.particleUniforms,
            vertexShader: `
                ${snoise}
                uniform float uPixelDensity;
                uniform float uBaseSize;
                uniform float uFreq;
                uniform float uAmp;
                uniform float uEdge;
                uniform float uProgress;
                uniform float uTime;
                varying float vNoise;
                attribute float aAngle;
                attribute vec3 aCurrentPos;
                attribute vec3 aControl0;
                attribute vec3 aControl1;
                attribute vec3 aEndPos;
                attribute float aOffset;
                attribute float aDist;
                varying float vAngle;

                float inOutCubic(float t){
                    return t < 0.5 ? 4.0 * t * t * t : (t - 1.0) * (2.0 * t - 2.0) * (2.0 * t - 2.0) + 1.0;
                }

                vec3 bezier4(vec3 a, vec3 b, vec3 c, vec3 d, float t) {
                    return mix(mix(mix(a, b, t), mix(b, c, t), t), mix(mix(b, c, t), mix(c, d, t), t), t);
                }

                void main() {
                    vec3 pos = position;
                    float noise = snoise(pos * uFreq) * uAmp;
                    vNoise = noise;
                    vAngle = aAngle;

                    float progress = clamp((uProgress - noise) / uEdge, 0.0, 1.0);
                    progress = inOutCubic(progress);

                    float spinFactor = sin(progress * 3.14159);
                    vec3 finalPos = bezier4(aCurrentPos, aControl0, aControl1, aEndPos, progress);

                    pos = finalPos;

                    pos.x += sin(uTime * aOffset) * aDist * spinFactor;
                    pos.y += cos(uTime * aOffset) * aDist * spinFactor;
                    pos.z += sin(uTime * aOffset) * aDist * spinFactor;

                    vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
                    vec4 viewPosition = viewMatrix * modelPosition;
                    vec4 projectedPosition = projectionMatrix * viewPosition;
                    gl_Position = projectedPosition;

                    float size = uBaseSize * uPixelDensity;
                    gl_PointSize = size / -viewPosition.z;
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                uniform float uEdge;
                uniform float uProgress;
                uniform sampler2D uTexture;
                varying float vNoise;
                varying float vAngle;

                void main(){
                    if( vNoise < uProgress ) discard;
                    if( vNoise > uProgress + uEdge) discard;
                    
                    vec2 coord = gl_PointCoord;
                    coord = coord - 0.5; 
                    coord = coord * mat2(cos(vAngle),sin(vAngle) , -sin(vAngle), cos(vAngle)); 
                    coord = coord +  0.5; 

                    vec4 texture = texture2D(uTexture,coord);

                    gl_FragColor = vec4(uColor * texture.xyz, 1.0);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.particleMesh = new THREE.Points(geometry, this.particleMaterial);
        this.mesh.add(this.particleMesh);
    }
    
    public getDissolveUniforms(){
        return this.dissolveUniforms
    }

    public getParticleUniforms(){
        return this.particleUniforms
    }

    public play() {
        this.isPlaying = true;
    }

    public pause() {
        this.isPlaying = false;
    }

    public setSpeed(speed: number) {
        this.speed = speed;
    }

    public setDirection(direction: 'forward' | 'backward') {
        this.direction = direction;
    }

    public setColor(edgeColor: THREE.Color, particleColor: THREE.Color) {
        this.dissolveUniforms.uEdgeColor.value = edgeColor;
        this.particleUniforms.uColor.value = particleColor;
    }

    public setParticlesVisible(isVisible: boolean) {
        this.particleMesh.visible = isVisible;
    }
    
    public setMesh(newMesh: THREE.Mesh){
        this.scene.remove(this.mesh);

        this.mesh = newMesh;
        this._initDissolveMaterial();

        this.particleMesh.geometry = newMesh.geometry;
        
        this.scene.add(this.mesh);
        this._updateParticleAttributes(this.particleMesh.geometry);
    }


    public update(time: number, deltaTime: number) {
        this.particleUniforms.uTime.value = time;

        if (!this.isPlaying) return;

        const progressIncrement = this.speed * deltaTime * 60;

        if (this.direction === 'forward') {
            this.dissolveUniforms.uProgress.value += progressIncrement;
        } else {
            this.dissolveUniforms.uProgress.value -= progressIncrement;
        }
    }
}
