export enum TerrainZone {
  Grass = 0,
  Beach = 1,
  RiverShore = 2,
  River = 3,
  Lake = 4,
  Bridge = 5,
  WaterEdge = 6,
}

export interface PlacedObject {
  readonly typeId: number;
  readonly posX: number;
  readonly posY: number;
  readonly rotation: number;
  readonly scale: number;
  readonly terrainZone: TerrainZone;
  readonly children: ReadonlyArray<PlacedObject>;
}
