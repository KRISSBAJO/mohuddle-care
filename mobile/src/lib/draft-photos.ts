import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync, randomUUID } from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { readValue, removeValue, writeValue } from "./storage";

import type { DraftPhoto } from "./draft-photo-types";
export type { DraftPhoto } from "./draft-photo-types";
const keyName = (id: string) => `mohuddle.draftPhoto.${id}`;
const folder = () => new Directory(Paths.document, "draft-photos");
export async function keepDraftPhoto(uri: string, type: string): Promise<DraftPhoto> {
  if (Platform.OS === "web") throw new Error("Use the phone app to keep report photos for retry.");
  const id = randomUUID();
  const key = await AESEncryptionKey.generate();
  const sealed = await aesEncryptAsync(await new File(uri).bytes(), key);
  const directory = folder(); directory.create({ intermediates: true, idempotent: true });
  await writeValue(keyName(id), await key.encoded("base64"));
  try { new File(directory, id).write(await sealed.combined()); }
  catch (error) { await removeValue(keyName(id)); throw error; }
  return { id, uri, type };
}
export async function photoForUpload(photo: DraftPhoto) {
  const raw = await readValue(keyName(photo.id));
  if (!raw) throw new Error("Photo cannot be opened");
  const key = await AESEncryptionKey.import(raw, "base64");
  const bytes = await aesDecryptAsync(AESSealedData.fromCombined(await new File(folder(), photo.id).bytes()), key);
  const temp = new File(Paths.cache, `draft-photo-${photo.id}`);
  temp.write(bytes);
  return temp;
}
export async function forgetDraftPhoto(photo: DraftPhoto) {
  const file = new File(folder(), photo.id);
  if (file.exists) file.delete();
  const temp = new File(Paths.cache, `draft-photo-${photo.id}`);
  if (temp.exists) temp.delete();
  await removeValue(keyName(photo.id));
}
