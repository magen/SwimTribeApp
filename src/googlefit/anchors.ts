import AsyncStorage from '@react-native-async-storage/async-storage';
import { ANCHOR_STORAGE_KEY } from './config';

export type Anchors = {
  sessions?: string;
  heartRate?: string;
};

export async function loadAnchors(): Promise<Anchors> {
  try {
    const raw = await AsyncStorage.getItem(ANCHOR_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[GoogleFit][Anchors] Failed to load anchors', err);
    return {};
  }
}

export async function saveAnchors(next: Anchors) {
  try {
    await AsyncStorage.setItem(ANCHOR_STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn('[GoogleFit][Anchors] Failed to save anchors', err);
  }
}

export async function clearAnchors() {
  try {
    await AsyncStorage.removeItem(ANCHOR_STORAGE_KEY);
  } catch (err) {
    console.warn('[GoogleFit][Anchors] Failed to clear anchors', err);
  }
}
