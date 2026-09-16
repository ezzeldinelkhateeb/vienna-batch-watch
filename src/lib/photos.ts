import { supabase } from "@/integrations/supabase/client";

export const PHOTO_BUCKET = "item-photos";
export const ACCEPTED_PHOTO_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

const MAX_EDGE = 1400;

/** Check if file is a supported image */
export function isSupportedImage(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return ACCEPTED_PHOTO_TYPES.includes(file.type);
}

/** Physically rotate an image blob or file by given degrees (e.g. 90, 180, 270) using Canvas */
export async function rotateImageBlob(blobOrFile: Blob | File, degrees: number): Promise<Blob> {
  const normDeg = ((degrees % 360) + 360) % 360;
  if (normDeg === 0) return blobOrFile;

  try {
    const bitmap = await createImageBitmap(blobOrFile);
    const canvas = document.createElement("canvas");
    const isSwap = normDeg === 90 || normDeg === 270;
    canvas.width = isSwap ? bitmap.height : bitmap.width;
    canvas.height = isSwap ? bitmap.width : bitmap.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return blobOrFile;

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((normDeg * Math.PI) / 180);
    ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);

    const rotatedBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    return rotatedBlob ?? blobOrFile;
  } catch {
    return blobOrFile;
  }
}

/** Downscale to a reasonable size and re-encode as JPEG. Falls back to the original file. */
export async function compressImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

export async function uploadItemPhoto(file: File): Promise<string> {
  const blob = await compressImage(file);
  const path = `${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}

export async function deleteItemPhoto(path: string): Promise<void> {
  await supabase.storage.from(PHOTO_BUCKET).remove([path]);
}

export async function signedPhotoUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function signedPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return {};
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(unique, 3600);
  const map: Record<string, string> = {};
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) map[entry.path] = entry.signedUrl;
  }
  return map;
}

export interface ItemPhoto {
  id: string;
  path: string;
  caption?: string | undefined;
}

/** Parse raw photo_path field which can be either legacy string path or JSON array */
export function parsePhotos(raw: string | null | undefined): ItemPhoto[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((item, index): ItemPhoto | null => {
            if (!item) return null;
            if (typeof item === "string") {
              return { id: `photo-${index}-${item}`, path: item, caption: "" };
            }
            if (typeof item === "object" && "path" in item && typeof (item as { path: unknown }).path === "string") {
              const obj = item as { path: string; caption?: string };
              return {
                id: `photo-${index}-${obj.path}`,
                path: obj.path,
                caption: obj.caption || "",
              };
            }
            return null;
          })
          .filter((p): p is ItemPhoto => p !== null && !!p.path);
      }
    } catch {
      // Fall through to single string
    }
  }

  // Legacy single file path
  return [{ id: `photo-0-${trimmed}`, path: trimmed, caption: "" }];
}

/** Serialize array of photos into JSON string or null */
export function serializePhotos(photos: Array<{ path: string; caption?: string | undefined }>): string | null {
  const valid = photos
    .filter((p) => Boolean(p.path && p.path.trim()))
    .map((p) => ({
      path: p.path.trim(),
      caption: (p.caption || "").trim(),
    }));

  if (valid.length === 0) return null;
  return JSON.stringify(valid);
}

/** Extract all unique storage paths from a list of raw photo_path fields */
export function extractAllPhotoPaths(rawList: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const raw of rawList) {
    const list = parsePhotos(raw);
    for (const p of list) {
      if (p.path) set.add(p.path);
    }
  }
  return Array.from(set);
}

