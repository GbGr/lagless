import { Filter, GlProgram } from 'pixi.js';

export interface ScreenSpaceNoiseOptions {
  /** Первый цвет (фон) */
  color1?: number;
  /** Второй цвет (узор) */
  color2?: number;
  /** Масштаб узора. Default: 3.0 */
  scale?: number;
  /** Скорость движения. Default: 1.0 */
  speed?: number;
}

// 1. ВЕРШИННЫЙ ШЕЙДЕР
const vertex = `
    in vec2 aPosition;
    out vec2 vTextureCoord; // Координаты для текстуры спрайта (чтобы обрезать края)
    out vec2 vScreenCoord;  // Координаты экрана (для шума)

    uniform vec4 uInputSize;
    uniform vec4 uOutputFrame;
    uniform vec4 uOutputTexture;

    void main(void) {
        // 1. Вычисляем позицию вершины в пространстве клипа (-1..1)
        vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
        position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
        position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;

        gl_Position = vec4(position, 0.0, 1.0);

        // 2. Передаем обычные UV для маски спрайта
        vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
    }
`;

// 2. ФРАГМЕНТНЫЙ ШЕЙДЕР (Domain Warping)
const fragment = `
    precision highp float;

    in vec2 vTextureCoord;
    out vec4 finalColor;

    uniform sampler2D uTexture; // Текстура самого спрайта

    uniform vec3 uColor1;
    uniform vec3 uColor2;
    uniform float uScale;
    uniform float uSpeed;
    uniform float uTime;
    uniform float uAspectRatio; // Чтобы шум не сплющивался

    // --- FBM Noise Functions ---
    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    float noise(vec2 st) {
        vec2 i = floor(st);
        vec2 f = fract(st);
        float a = random(i);
        float b = random(i + vec2(1.0, 0.0));
        float c = random(i + vec2(0.0, 1.0));
        float d = random(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    float fbm(vec2 st) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 4; i++) { // 4 октавы
            value += amplitude * noise(st);
            st *= 2.0;
            amplitude *= 0.5;
        }
        return value;
    }

    void main() {
        // 1. Проверяем прозрачность исходного спрайта
        vec4 originalColor = texture(uTexture, vTextureCoord);
        if (originalColor.a < 0.01) discard;

        // 2. Настраиваем координаты для шума
        vec2 uv = vTextureCoord;

        // Корректируем соотношение сторон, чтобы шум был квадратным, а не растянутым
        uv.x *= uAspectRatio;

        // Применяем масштаб
        vec2 st = uv * uScale;

        // 3. Domain Warping (Искажение пространства)
        float t = uTime * uSpeed;

        vec2 q = vec2(0.0);
        q.x = fbm(st + 0.00 * t);
        q.y = fbm(st + vec2(1.0));

        vec2 r = vec2(0.0);
        r.x = fbm(st + 1.0 * q + vec2(1.7, 9.2) + 0.15 * t);
        r.y = fbm(st + 1.0 * q + vec2(8.3, 2.8) + 0.126 * t);

        float f = fbm(st + r);

        // 4. Смешивание цветов
        // Делаем переходы более резкими и "масляными"
        float mixVal = f * f * 4.0;
        mixVal = clamp(mixVal, 0.0, 1.0);

        vec3 color = mix(uColor1, uColor2, mixVal);

        // Добавляем детализацию (тени) на основе вектора искажения
        color = mix(color, uColor2, length(q) * 0.2);

        // 5. Финальный вывод
        // Умножаем на альфу спрайта, чтобы сохранить форму
        finalColor = vec4(color * originalColor.a, originalColor.a);
    }
`;

export class ScreenSpaceNoiseFilter extends Filter {
  constructor(options?: ScreenSpaceNoiseOptions) {
    const {
      color1 = 0xFF0000,
      color2 = 0x00ff00,
      scale = 35.0,
      speed = 0.05,
    } = options || {};

    const glProgram = new GlProgram({
      vertex,
      fragment,
      name: 'screen-space-noise',
    });

    super({
      glProgram,
      resources: {
        noiseUniforms: {
          uColor1: { value: new Float32Array(3), type: 'vec3<f32>' },
          uColor2: { value: new Float32Array(3), type: 'vec3<f32>' },
          uScale: { value: scale, type: 'f32' },
          uSpeed: { value: speed, type: 'f32' },
          uTime: { value: 0.0, type: 'f32' },
          uAspectRatio: { value: 1.0, type: 'f32' },
        },
      },
    });

    this.color1 = color1;
    this.color2 = color2;

    // Автоматическое обновление времени
    // Ticker.shared.add((ticker) => {
    //   this.resources.noiseUniforms.uniforms.uTime += ticker.deltaTime * 0.01;
    // });
  }

  /**
   * ВАЖНО: Вызывать этот метод при изменении размера экрана,
   * чтобы шум не растягивался.
   */
  public updateAspectRatio(width: number, height: number) {
    this.resources.noiseUniforms.uniforms.uAspectRatio = width / height;
  }

  public get time(): number {
    return this.resources.noiseUniforms.uniforms.uTime;
  }

  public set time(value: number) {
    this.resources.noiseUniforms.uniforms.uTime = value;
  }

  public set color1(value: number) {
    const r = ((value >> 16) & 0xff) / 255;
    const g = ((value >> 8) & 0xff) / 255;
    const b = (value & 0xff) / 255;
    this.resources.noiseUniforms.uniforms.uColor1[0] = r;
    this.resources.noiseUniforms.uniforms.uColor1[1] = g;
    this.resources.noiseUniforms.uniforms.uColor1[2] = b;
  }

  public set color2(value: number) {
    const r = ((value >> 16) & 0xff) / 255;
    const g = ((value >> 8) & 0xff) / 255;
    const b = (value & 0xff) / 255;
    this.resources.noiseUniforms.uniforms.uColor2[0] = r;
    this.resources.noiseUniforms.uniforms.uColor2[1] = g;
    this.resources.noiseUniforms.uniforms.uColor2[2] = b;
  }

  public set scale(value: number) {
    this.resources.noiseUniforms.uniforms.uScale = value;
  }

  public set speed(value: number) {
    this.resources.noiseUniforms.uniforms.uSpeed = value;
  }
}
