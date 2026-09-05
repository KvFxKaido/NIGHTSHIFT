// One-time authoring transfer. Outputs ordinary editable Godot scenes, not a
// runtime generator. Refuses to overwrite files once somebody has edited them.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { createCar } from '../../src/render/car.ts';
import { createGarageScene } from '../../src/render/garage.ts';

const root = new URL('../', import.meta.url);
const n = value => Math.abs(value) < 1e-8 ? '0' : String(Number(value.toFixed(7)));
const vec = array => `Vector3(${array.map(n).join(', ')})`;
const color = (c, alpha = 1) => {
  const hex = c.getHex();
  return `Color(${n(((hex >> 16) & 255) / 255)}, ${n(((hex >> 8) & 255) / 255)}, ${n((hex & 255) / 255)}, ${n(alpha)})`;
};
async function output(path, content) {
  const target = new URL(path, root);
  await mkdir(new URL('.', target), { recursive: true });
  await writeFile(target, content + '\n', { flag: 'wx' });
  console.log(fileURLToPath(target));
}
class Scene {
  resources = [];
  external = [];
  nodes = [];
  serial = 0;
  resource(type, properties) {
    const id = `Resource_${++this.serial}`;
    this.resources.push(`[sub_resource type="${type}" id="${id}"]\n${properties}`);
    return `SubResource("${id}")`;
  }
  ext(type, path) {
    const id = `External_${this.external.length + 1}`;
    this.external.push(`[ext_resource type="${type}" path="res://${path}" id="${id}"]`);
    return `ExtResource("${id}")`;
  }
  node(name, type, parent, props = '') {
    this.nodes.push(`[node name="${name}" type="${type}"${parent === null ? '' : ` parent="${parent}"`}]\n${props}`);
  }
  text() {
    return [`[gd_scene load_steps=${1 + this.resources.length + this.external.length} format=3]`,
      ...this.external, ...this.resources, ...this.nodes].join('\n\n');
  }
}
function materialProps(material) {
  const lines = [`albedo_color = ${color(material.color, material.opacity)}`,
    `metallic = ${n(material.metalness ?? 0)}`, `roughness = ${n(material.roughness ?? 0.6)}`];
  if (material.transparent) lines.push('transparency = 1', 'cull_mode = 2');
  if (material.isMeshBasicMaterial) lines.push('shading_mode = 0');
  return lines.join('\n');
}
async function exportObjects(tree, filename, names = new Map(), carParts = null) {
  const scene = new Scene();
  const rootScript = carParts ? scene.ext('Script', 'scripts/car_visual.gd') : null;
  const materials = new Map();
  if (carParts) {
    for (const [mat, file, label] of [[carParts.paintMaterial, 'body_paint', 'BodyPaint'], [carParts.wheelMaterial, 'wheel_finish', 'WheelFinish']]) {
      await output(`materials/${file}.tres`, `[gd_resource type="StandardMaterial3D" format=3]\n\n[resource]\nresource_name = "${label}"\n${materialProps(mat)}`);
      materials.set(mat, scene.ext('Material', `materials/${file}.tres`));
    }
  }
  const geometries = new Map();
  const targets = new Set();
  tree.traverse(object => { if (object.isSpotLight) targets.add(object.target); });
  function walk(object, parent, isRoot = false) {
    if (object.isGridHelper || object.isHemisphereLight || targets.has(object)) return;
    const name = names.get(object) ?? `${object.name.replace(/[^a-zA-Z0-9_]/g, '_') || object.type}_${++scene.serial}`;
    const path = isRoot ? '.' : parent === '.' ? name : `${parent}/${name}`;
    let type = 'Node3D';
    const props = [];
    object.updateMatrix();
    const transform = object.matrix.clone();
    if (object.isMesh) {
      type = 'MeshInstance3D';
      const geometry = object.geometry;
      const p = geometry.parameters;
      if (!geometries.has(geometry)) {
        let resource;
        switch (geometry.type) {
          case 'BoxGeometry': resource = scene.resource('BoxMesh', `size = ${vec([p.width, p.height, p.depth])}`); break;
          case 'CylinderGeometry': resource = scene.resource('CylinderMesh', `top_radius = ${n(p.radiusTop)}\nbottom_radius = ${n(p.radiusBottom)}\nheight = ${n(p.height)}\nradial_segments = ${p.radialSegments}\nrings = 1`); break;
          case 'PlaneGeometry': resource = scene.resource('QuadMesh', `size = Vector2(${n(p.width)}, ${n(p.height)})`); break;
          case 'TorusGeometry': resource = scene.resource('TorusMesh', `inner_radius = ${n(p.radius - p.tube)}\nouter_radius = ${n(p.radius + p.tube)}\nrings = ${p.tubularSegments}\nring_segments = ${p.radialSegments}`); break;
          default: throw Error(`Unsupported geometry: ${geometry.type}`);
        }
        geometries.set(geometry, resource);
      }
      if (geometry.type === 'TorusGeometry') transform.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      if (!materials.has(object.material)) materials.set(object.material, scene.resource('StandardMaterial3D', materialProps(object.material)));
      props.push(`mesh = ${geometries.get(geometry)}`, `material_override = ${materials.get(object.material)}`);
      props.push(`cast_shadow = ${object.castShadow ? 1 : 0}`);
    } else if (object.isSpotLight || object.isPointLight) {
      type = object.isSpotLight ? 'SpotLight3D' : 'OmniLight3D';
      props.push(`light_color = ${color(object.color)}`, `light_energy = ${n(Math.sqrt(object.intensity) * 0.35)}`,
        `shadow_enabled = ${object.castShadow}`);
      if (object.isSpotLight) {
        props.push(`spot_range = ${n(object.distance || 30)}`, `spot_angle = ${n(THREE.MathUtils.radToDeg(object.angle))}`, 'spot_attenuation = 1.0');
        const camera = new THREE.PerspectiveCamera();
        camera.position.copy(object.position);
        camera.lookAt(object.target.position);
        camera.updateMatrix();
        transform.copy(camera.matrix);
      } else props.push(`omni_range = ${n(object.distance || 12)}`, 'omni_attenuation = 1.0');
    }
    const m = transform.elements;
    // Three stores matrix columns; Godot's text-format scalar constructor reads
    // basis rows. Preserve translation, but transpose the serialized 3x3 basis.
    props.unshift(`transform = Transform3D(${[m[0],m[4],m[8],m[1],m[5],m[9],m[2],m[6],m[10],m[12],m[13],m[14]].map(n).join(', ')})`);
    if (isRoot && rootScript) props.push(`script = ${rootScript}`);
    scene.node(name, type, isRoot ? null : parent, props.join('\n'));
    for (const child of object.children) walk(child, path);
  }
  walk(tree, '.', true);
  await output(filename, scene.text());
}

const car = createCar();
const names = new Map([[car.car, 'Car'], [car.carVisual, 'Visual'], [car.bodyShell, 'BodyShell']]);
for (const pivot of car.wheelPivots) {
  names.set(pivot, `${pivot.position.z < 0 ? 'Front' : 'Rear'}${pivot.position.x < 0 ? 'Left' : 'Right'}Pivot`);
  names.set(pivot.children[0], 'Spin');
  pivot.children[0].children.forEach((mesh, i) => names.set(mesh, ['Tire', 'RimLip', 'Dish', 'Hub'][i]));
}
await exportObjects(car.car, 'scenes/car.tscn', names, car);
const garage = createGarageScene();
await exportObjects(garage, 'scenes/garage.tscn', new Map([[garage, 'Garage']]));

const circuit = new Scene();
circuit.node('Circuit', 'Node3D', null);
for (const group of ['Road', 'Barriers', 'Markings', 'Tunnel', 'Lights', 'Buildings']) circuit.node(group, 'Node3D', '.');
const mat = (hex, roughness = 0.7, unshaded = false) => circuit.resource('StandardMaterial3D',
  `albedo_color = ${color(new THREE.Color(hex))}\nroughness = ${roughness}${unshaded ? '\nshading_mode = 0' : ''}`);
const road = mat(0x202832, 0.35), curb = mat(0xced0c8), red = mat(0xa82943), wall = mat(0x333d48);
const warm = mat(0xffc585, 0.8, true), white = mat(0xcbd2d5, 0.7, true), concrete = mat(0x282d36);
const buildingMaterials = [mat(0x141a27), mat(0x192331), mat(0x202838)];
let count = 0;
function box(group, label, size, pos, yaw, material, collision = false) {
  const name = `${label}_${++count}`;
  const mesh = circuit.resource('BoxMesh', `size = ${vec(size)}`);
  const transform = `position = ${vec(pos)}\nrotation = Vector3(0, ${n(yaw)}, 0)`;
  if (collision) {
    circuit.node(name, 'StaticBody3D', group, transform);
    circuit.node('Mesh', 'MeshInstance3D', `${group}/${name}`, `mesh = ${mesh}\nmaterial_override = ${material}`);
    const shape = circuit.resource('BoxShape3D', `size = ${vec(size)}`);
    circuit.node('Collision', 'CollisionShape3D', `${group}/${name}`, `shape = ${shape}`);
  } else circuit.node(name, 'MeshInstance3D', group, `${transform}\nmesh = ${mesh}\nmaterial_override = ${material}`);
}
const route = [];
for (let i = 0; i < 30; i++) route.push(new THREE.Vector2(45, 75 - 5 * i));
for (let i = 0; i < 30; i++) { const a = -Math.PI * i / 30; route.push(new THREE.Vector2(45 * Math.cos(a), -75 + 45 * Math.sin(a))); }
for (let i = 0; i < 30; i++) route.push(new THREE.Vector2(-45, -75 + 5 * i));
for (let i = 0; i < 30; i++) { const a = Math.PI - Math.PI * i / 30; route.push(new THREE.Vector2(45 * Math.cos(a), 75 + 45 * Math.sin(a))); }
for (let i = 0; i < route.length; i++) {
  const p = route[i], q = route[(i + 1) % route.length], d = q.clone().sub(p), center = p.clone().add(q).multiplyScalar(0.5);
  const yaw = Math.atan2(-d.x, -d.y);
  const right = new THREE.Vector2(Math.cos(yaw), -Math.sin(yaw));
  box('Road', 'Asphalt', [14,0.12,d.length()+0.04], [center.x,-0.06,center.y], yaw, road);
  if (i % 2 === 0) box('Markings','CenterDash',[0.12,0.012,2.2],[center.x,0.015,center.y],yaw,white);
  for (const side of [-1, 1]) {
    const edge = center.clone().addScaledVector(right, side * 7.2);
    box('Markings','Curb',[0.55,0.08,d.length()+0.03],[edge.x,0.015,edge.y],yaw,i%2?curb:red);
    const border = center.clone().addScaledVector(right, side * 7.8);
    box('Barriers','Wall',[0.45,0.85,d.length()+0.14],[border.x,0.425,border.y],yaw,wall,true);
  }
  if (i % 8 === 0) {
    const pole = center.clone().addScaledVector(right, 9.4);
    box('Lights','Pole',[0.15,6.7,0.15],[pole.x,3.35,pole.y],yaw,wall);
    circuit.node(`StreetLight_${i}`, 'OmniLight3D', 'Lights', `position = ${vec([pole.x,6.1,pole.y])}\nlight_color = Color(1, 0.69, 0.39, 1)\nlight_energy = 2.3\nomni_range = 21.0`);
    box('Lights','Lamp',[0.75,0.1,0.35],[pole.x,6.6,pole.y],yaw,warm);
  }
}
for(let row=0;row<2;row++) for(let col=0;col<14;col++) box('Markings','StartGrid',[1,0.02,1],[38.5+col,0.025,45+row],0,(col+row)%2?road:curb);
box('Tunnel','LeftWall',[0.45,5.2,34],[37.2,2.6,-35],0,concrete);
box('Tunnel','RightWall',[0.45,5.2,34],[52.8,2.6,-35],0,concrete);
box('Tunnel','Roof',[16.2,0.4,34],[45,5.2,-35],0,concrete);
for(let z=-48;z<=-20;z+=7) {
  box('Tunnel','CeilingStrip',[10,0.07,0.28],[45,4.96,z],0,warm);
  circuit.node(`TunnelLight_${-z}`,'OmniLight3D','Tunnel',`position = Vector3(45, 4.2, ${z})\nlight_color = Color(1, 0.76, 0.49, 1)\nlight_energy = 2.0\nomni_range = 12.0`);
}
for(let i=0;i<24;i++) {
  const side = i%2 ? -1:1, z=-122+Math.floor(i/2)*22;
  const x = side*(72+(i%3)*9), height=12+(i*13)%38;
  box('Buildings','Tower',[12+(i%3)*4,height,13],[x,height/2,z],0,buildingMaterials[i%3]);
  for(let y=4;y<height-2;y+=6) for(let w=-1;w<=1;w++)
    if((i+y+w)%3!==0)box('Buildings','Window',[0.04,0.5,1.4],[x-side*(6+(i%3)*2+0.025),y,z+w*3.2],0,i%2?warm:white);
}
box('Road','Ground',[250,0.1,320],[0,-0.2,0],0,mat(0x111923));
circuit.node('Spawn','Marker3D','.', 'position = Vector3(45, 0, 55)');
await output('scenes/circuit.tscn', circuit.text());
await output('resources/route.json', JSON.stringify(route.map(p=>({x:p.x,z:p.y}))));
