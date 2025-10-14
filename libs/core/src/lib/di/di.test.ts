import { Container } from './di-container.js';
import { ECSSystem } from './di-decorators.js';

@ECSSystem()
class ASystem {

}
@ECSSystem()
class TestSystem {
  constructor(public readonly aSystem: ASystem) {
    console.log(this.aSystem, this);
  }
}

describe('Dependency Injection', () => {
  const diContainer = new Container();
  diContainer.register(ASystem, new ASystem());

  it('should works', () => {
    const testSystem = diContainer.resolve(TestSystem);
    expect(testSystem).toBeInstanceOf(TestSystem);
    expect((testSystem).aSystem).toBeInstanceOf(ASystem);
  });
});
