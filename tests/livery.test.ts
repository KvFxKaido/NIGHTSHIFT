import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createBlenderCar } from "../src/render/blender-car.ts";
import { liverySurface, projectedLayer } from "../src/render/livery.ts";
import { copyLivery, decodeLivery, defaultLivery, LiveryHistory, MAX_LAYERS, newLayer, PANELS } from "../src/customization/livery.ts";

test("livery persistence round-trips layered designs and rejects damaged or oversized data", () => {
  const design=defaultLivery();design.enabled=true;
  design.layers.push(newLayer(design,'number','left'));
  const encode=(d: unknown)=>JSON.stringify({version:1,design:d});
  assert.deepEqual(decodeLivery(encode(design)).design,design);
  for(const d of [{...design,base:'red'}, {...design,finish:'unknown'}, {...design,layers:Array(MAX_LAYERS+1).fill(design.layers[0])},
    {...design,layers:[{...design.layers[0],scale:99}]}, {...design,layers:[{...design.layers[0],text:'<script>'}]},
    {...design,layers:[design.layers[0],design.layers[0]]}]) assert.equal(decodeLivery(encode(d)).recovered,true);
  assert.equal(decodeLivery('{').recovered,true);
  assert.equal(decodeLivery(null).recovered,false);
});

test("undo restores deletion, panel placement and order; a new edit invalidates redo", () => {
  const history=new LiveryHistory(defaultLivery());
  const first=copyLivery(history.current);first.enabled=true;first.layers.push(newLayer(first,'stripe','hood'));history.commit(first);
  const second=copyLivery(history.current);second.layers.push(newLayer(second,'number','left'));history.commit(second);
  const third=copyLivery(history.current);third.layers.reverse();third.layers[0]!.rotation=45;history.commit(third);
  history.undo();assert.deepEqual(history.current,second);
  history.redo();assert.deepEqual(history.current,third);
  history.commit({...copyLivery(third),layers:[]});history.undo();assert.deepEqual(history.current,third);
  history.undo();history.commit({...copyLivery(history.current),base:'#59d8ff'});assert.equal(history.canRedo,false);
  assert.equal(first.layers.length,1,'history does not mutate caller snapshots');
});

test("every NS-01 panel accepts graphics on paint; mirrored doors stay on opposite sides", async () => {
  const bytes=await readFile(new URL('../public/assets/cars/ns-coupe-01.glb',import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const car=createBlenderCar(gltf.scene);
  for (const panel of PANELS) {
    const surface=liverySurface(car,panel), layer=newLayer(defaultLivery(),'number',panel);
    const geometry=projectedLayer(surface,layer);geometry.computeBoundingBox();
    assert.ok(geometry.getAttribute('position').count>0,`${panel} must land on real painted triangles`);
    const bounds=geometry.boundingBox!;
    if(panel==='left')assert.ok(bounds.max.x<0);
    if(panel==='right')assert.ok(bounds.min.x>0);
    if(panel==='roof')assert.ok(bounds.min.y>1.2,'roof cannot project onto lower coachwork');
    if(panel==='hood')assert.ok(bounds.max.z<-.8,'hood stays ahead of greenhouse');
    geometry.dispose();surface.dispose();
  }
});
