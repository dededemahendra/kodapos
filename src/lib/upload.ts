import type { Id } from 'convex/_generated/dataModel';

/**
 * Upload a file to Convex file storage and return its storage id. Shared by the
 * settings handlers that accept an image (cafe logo, static-QRIS image): request
 * a one-time upload URL, POST the file, and read back the storage id.
 */
export async function uploadToStorage(
  generateUploadUrl: () => Promise<string>,
  file: File
): Promise<Id<'_storage'>> {
  const url = await generateUploadUrl();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  const json = (await res.json()) as { storageId: Id<'_storage'> };
  return json.storageId;
}
