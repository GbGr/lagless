import { Filter, GlProgram } from 'pixi.js';

const vertex = `
    in vec2 aPosition;
    out vec2 vTextureCoord;

    uniform vec4 uInputSize;
    uniform vec4 uOutputFrame;
    uniform vec4 uOutputTexture;

    void main(void) {
        vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
        position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
        position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
        gl_Position = vec4(position, 0.0, 1.0);
        vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
    }
`;

const fragment = `
    precision highp float;

    in vec2 vTextureCoord;
    out vec4 finalColor;

    uniform sampler2D uTexture;
    uniform vec2 uCenter;
    uniform float uRadius;
    uniform float uStrength;
    uniform float uTime;

    void main() {
        vec2 uv = vTextureCoord;
        vec2 dir = uCenter - uv;
        float dist = length(dir);

        if (dist < uRadius && dist > 0.001) {
            float factor = 1.0 - (dist / uRadius);
            factor = factor * factor * uStrength;
            // Add subtle time-based swirl
            float swirl = sin(uTime * 2.0 + dist * 30.0) * 0.02 * factor;
            vec2 offset = normalize(dir) * factor * 0.05;
            vec2 perpDir = vec2(-dir.y, dir.x);
            offset += normalize(perpDir) * swirl;
            uv += offset;
        }

        finalColor = texture(uTexture, uv);
    }
`;

export class BlackHoleDistortionFilter extends Filter {
  constructor() {
    const glProgram = new GlProgram({
      vertex,
      fragment,
      name: 'black-hole-distortion',
    });

    super({
      glProgram,
      resources: {
        distortionUniforms: {
          uCenter: { value: new Float32Array([0.5, 0.5]), type: 'vec2<f32>' },
          uRadius: { value: 0.15, type: 'f32' },
          uStrength: { value: 1.0, type: 'f32' },
          uTime: { value: 0.0, type: 'f32' },
        },
      },
    });
  }

  public set center(value: [number, number]) {
    this.resources.distortionUniforms.uniforms.uCenter[0] = value[0];
    this.resources.distortionUniforms.uniforms.uCenter[1] = value[1];
  }

  public set radius(value: number) {
    this.resources.distortionUniforms.uniforms.uRadius = value;
  }

  public set strength(value: number) {
    this.resources.distortionUniforms.uniforms.uStrength = value;
  }

  public get time(): number {
    return this.resources.distortionUniforms.uniforms.uTime;
  }

  public set time(value: number) {
    this.resources.distortionUniforms.uniforms.uTime = value;
  }
}
