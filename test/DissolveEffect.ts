import * as THREE from 'three';
import snoise from '../src/lib/noise/snoise.glsl?raw';

interface DissolveEffectOptions {
    edgeColor?: THREE.Color;
    frequency?: number;
    amplitude?: number;
    progress?: number;
    edgeWidth?: number;
    particleTexture?: THREE.Texture;
    particleBaseSize?: number;
    particleColor?: THREE.Color;
    particleSpeed?: number;
}

export class DissolveEffect {
    private renderer: THREE.WebGLRenderer;
    private scene: THREE.Scene;
    private mesh: THREE.Mesh;

    private dissolveUniforms: { [uniform: string]: THREE.IUniform };
    private particleMaterial: THREE.ShaderMaterial;
    private particleMesh: THREE.Points;

    private isPlaying: boolean = false;
    private speed: number = 0.08;
    private direction: 'forward' | 'backward' = 'forward';

    constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, mesh: THREE.Mesh, options?: DissolveEffectOptions) {
        this.renderer = renderer;
        this.scene = scene;
        this.mesh = mesh;

        const defaultOptions = {
            edgeColor: new THREE.Color(0x4d9bff),
            frequency: 0.25,
            amplitude: 16.0,
            progress: -7.0,
            edgeWidth: 0.8,
            particleTexture: new THREE.TextureLoader().load('/particle.png'),
            particleBaseSize: 80,
            particleColor: new THREE.Color(0x4d9bff),
            particleSpeed: 0.02,
        };

        const finalOptions = { ...defaultOptions, ...options };

        this.dissolveUniforms = {
            uEdgeColor: { value: finalOptions.edgeColor },
            uFreq: { value: finalOptions.frequency },
            uAmp: { value: finalOptions.amplitude },
            uProgress: { value: finalOptions.progress },
            uEdge: { value: finalOptions.edgeWidth },
        };

        this.setupDissolveMaterial();
        this.setupParticleSystem(finalOptions);

        this.scene.add(this.mesh);
        this.scene.add(this.particleMesh);
    }

    private setupDissolveMaterial() {
        const material = (this.mesh.material as THREE.MeshPhysicalMaterial).clone();
        material.onBeforeCompile = (shader) => {
            shader.uniforms.uEdgeColor = this.dissolveUniforms.uEdgeColor;
            shader.uniforms.uFreq = this.dissolveUniforms.uFreq;
            shader.uniforms.uAmp = this.dissolveUniforms.uAmp;
            shader.uniforms.uProgress = this.dissolveUniforms.uProgress;
            shader.uniforms.uEdge = this.dissolveUniforms.uEdge;

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
        this.mesh.material = material;
    }

    private setupParticleSystem(options: any) {
        const geometry = this.mesh.geometry;
        const particleCount = geometry.attributes.position.count;

        this.particleMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { value: options.particleTexture },
                uPixelDensity: { value: this.renderer.getPixelRatio() },
                uProgress: this.dissolveUniforms.uProgress,
                uEdge: this.dissolveUniforms.uEdge,
                uAmp: this.dissolveUniforms.uAmp,
                uFreq: this.dissolveUniforms.uFreq,
                uBaseSize: { value: options.particleBaseSize },
                uColor: { value: options.particleColor },
            },
            vertexShader: `
                ${snoise}
                uniform float uPixelDensity;
                uniform float uBaseSize;
                uniform float uFreq;
                uniform float uAmp;
                uniform float uEdge;
                uniform float uProgress;
                varying float vNoise;
                void main() {
                    vec3 pos = position;
                    float noise = snoise(pos * uFreq) * uAmp;
                    vNoise = noise;
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
                void main(){
                    if( vNoise < uProgress ) discard;
                    if( vNoise > uProgress + uEdge) discard;
                    vec4 texture = texture2D(uTexture, gl_PointCoord);
                    gl_FragColor = vec4(uColor * texture.xyz, 1.0);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
        });

        this.particleMesh = new THREE.Points(geometry, this.particleMaterial);
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

    public setEdgeColor(color: THREE.Color) {
        this.dissolveUniforms.uEdgeColor.value = color;
    }

    public setFrequency(frequency: number) {
        this.dissolveUniforms.uFreq.value = frequency;
    }

    public setAmplitude(amplitude: number) {
        this.dissolveUniforms.uAmp.value = amplitude;
    }

    public setEdgeWidth(edgeWidth: number) {
        this.dissolveUniforms.uEdge.value = edgeWidth;
    }

    public setParticleColor(color: THREE.Color) {
        this.particleMaterial.uniforms.uColor.value = color;
    }

    public setParticleBaseSize(size: number) {
        this.particleMaterial.uniforms.uBaseSize.value = size;
    }

    public setProgress(progress: number) {
        this.dissolveUniforms.uProgress.value = progress;
    }

    public update() {
        if (this.isPlaying) {
            if (this.direction === 'forward') {
                this.dissolveUniforms.uProgress.value += this.speed;
            } else {
                this.dissolveUniforms.uProgress.value -= this.speed;
            }
        }
    }
}
