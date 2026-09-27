import type * as THREE from "three";

/**
 * What an adopted place does while the player drives past (design/CITY_ADOPTION.md): a beacon, a forklift, a light
 * sequence. Drawn from the sim's clock, as the junction flashers are, so a frozen or paused world stands still with
 * it; nothing here is read back by the sim. Keyed by place, so building a world twice replaces a place's activity
 * instead of running it twice.
 */
export type PlaceActivity = (seconds: number) => void;

export function addPlaceActivity(scene: THREE.Scene, place: string, activity: PlaceActivity): void {
  const places = (scene.userData.placeActivity ??= new Map<string, PlaceActivity>()) as Map<string, PlaceActivity>;
  places.set(place, activity);
}

export function updatePlaceActivity(scene: THREE.Scene, seconds: number): void {
  const places = scene.userData.placeActivity as Map<string, PlaceActivity> | undefined;
  if (places) for (const activity of places.values()) activity(seconds);
}
