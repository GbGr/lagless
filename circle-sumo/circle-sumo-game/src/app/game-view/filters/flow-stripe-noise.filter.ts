// FabricPatternFilter.ts
import { Filter, GlProgram } from 'pixi.js';
import { setVec3FromHex } from './utils';

export interface FabricPatternOptions {
  colorA?: number; // Основной цвет (0xRRGGBB)
  colorB?: number; // Акцентный цвет (0xRRGGBB)
  scale?: number;  // Размер узора
}

const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition( void )
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord( void )
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

const fragment = /* glsl */ `
precision highp float;

in vec2 vTextureCoord;

uniform sampler2D uTexture;

uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uScale;

// Функция шума для органичности
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float damaskPattern(vec2 uv) {
    vec2 p = uv * 2.0;

    float pattern = 0.0;

    float wave1 = sin(p.x * 3.14159) * cos(p.y * 3.14159);
    float wave2 = sin(p.x * 6.28318 + 1.5) * sin(p.y * 4.0);

    vec2 cell = fract(p) - 0.5;
    float flower = length(cell);
    flower = abs(sin(flower * 12.0 - length(cell) * 8.0));
    flower = smoothstep(0.3, 0.7, flower);

    float angle = atan(cell.y, cell.x);
    float leaves = abs(sin(angle * 4.0)) * (1.0 - smoothstep(0.1, 0.5, length(cell)));

    pattern = wave1 * 0.3 + wave2 * 0.2 + flower * 0.3 + leaves * 0.2;

    float fabric = noise(uv * 50.0) * 0.1;

    return clamp(pattern + fabric, 0.0, 1.0);
}

void main(void)
{
    vec4 base = texture(uTexture, vTextureCoord);
    if (base.a < 0.0001) {
        discard;
    }

    // КЛЮЧЕВОЕ ИЗМЕНЕНИЕ: используем просто текстурные координаты
    // Они привязаны к самому спрайту, а не к миру
    vec2 uv = vTextureCoord * uScale;

    // Выбор паттерна
    float pattern = damaskPattern(uv);

    // Добавляем легкий шум для текстуры ткани
    float fabricNoise = noise(uv * 80.0) * 0.05;
    pattern = clamp(pattern + fabricNoise, 0.0, 1.0);

    // Смешиваем цвета с мягким переходом
    float t = smoothstep(0.3, 0.7, pattern);
    vec3 color = mix(uColorA, uColorB, t);

    // Добавляем объем через затенение
    float shadow = pattern * 0.15 + 0.85;
    color *= shadow;

    // Легкий блеск ткани
    float highlight = smoothstep(0.7, 1.0, pattern) * 0.2;
    color += highlight;

    gl_FragColor = vec4(color, base.a);
}
`;


export class FabricPatternFilter extends Filter {
  public uniforms: {
    uColorA: Float32Array;
    uColorB: Float32Array;
    uScale: number;
  };

  constructor(options: FabricPatternOptions = {}) {
    const {
      // colorA = 0x8B4513,  // Коричневый
      // colorB = 0xD4AF37,  // Золотой
      colorA = 0xFF0000,
      colorB = 0x0000FF,
      scale = 3
    } = options;

    const glProgram = new GlProgram({
      vertex,
      fragment,
    });

    super({
      glProgram,
      resources: {
        fabricUniforms: {
          uColorA: { value: new Float32Array(3), type: 'vec3<f32>' },
          uColorB: { value: new Float32Array(3), type: 'vec3<f32>' },
          uScale: { value: scale, type: 'f32' },
        },
      },
    });

    this.uniforms = this.resources.fabricUniforms.uniforms;

    setVec3FromHex(this.uniforms.uColorA, colorA);
    setVec3FromHex(this.uniforms.uColorB, colorB);
  }

  set colorA(hex: number) {
    setVec3FromHex(this.uniforms.uColorA, hex);
  }

  get colorA(): number {
    const [r, g, b] = this.uniforms.uColorA;
    return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
  }

  set colorB(hex: number) {
    setVec3FromHex(this.uniforms.uColorB, hex);
  }

  get colorB(): number {
    const [r, g, b] = this.uniforms.uColorB;
    return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
  }

  set scale(value: number) {
    this.uniforms.uScale = value;
  }

  get scale(): number {
    return this.uniforms.uScale;
  }
}
