export const MAX_COMMUNITY_IMAGE_BYTES = 5 * 1024 * 1024;
export const COMMUNITY_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
// File names/extensions are never used to select response types or storage paths.
export function validateCommunityImage(bytes: Uint8Array, mime: string): asserts mime is "image/jpeg" | "image/png" | "image/webp" {
  if (!COMMUNITY_IMAGE_TYPES.includes(mime)) throw new Error("JPEG, PNG, WebP 이미지만 첨부할 수 있습니다.");
  if (!bytes.length || bytes.length > MAX_COMMUNITY_IMAGE_BYTES) throw new Error("이미지는 각각 5MB 이하여야 합니다.");
  const starts = (signature: number[]) => signature.every((byte, i) => bytes[i] === byte);
  const jpeg = bytes.length > 4 && starts([255, 216, 255]) && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217;
  const png = bytes.length >= 33 && starts([137,80,78,71,13,10,26,10]) && bytes[12] === 73 && bytes[13] === 72 && bytes[14] === 68 && bytes[15] === 82;
  const webp = bytes.length >= 16 && starts([82,73,70,70]) && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80 && bytes[12] === 86 && bytes[13] === 80 && bytes[14] === 56;
  if (!(mime === "image/jpeg" ? jpeg : mime === "image/png" ? png : webp)) throw new Error("이미지의 실제 형식이 일치하지 않습니다.");
}

export function validateCommunityImageName(name: string, mime: string) {
 const valid = name.length <= 200 && !/[\\/\x00]/.test(name) && (mime === "image/jpeg" ? /\.jpe?g$/i.test(name) : mime === "image/png" ? /\.png$/i.test(name) : mime === "image/webp" && /\.webp$/i.test(name));
 if (!valid) throw new Error("파일 이름과 이미지 확장자를 확인해 주세요.");
}
