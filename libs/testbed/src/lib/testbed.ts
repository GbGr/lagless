import { Container, ECSSystem } from '@lagless/core';

@ECSSystem()
class ASystem {

}
@ECSSystem()
class TestSystem {
  constructor(public readonly aSystem: ASystem) {
    console.log(this.aSystem, this);
  }
}

export function testbed() {
  const container = new Container();

  const testSystem = container.resolve(TestSystem);

  console.log({ container, testSystem });
}
