const MAX_SIDE = 1280

/** Downscales a camera photo to ≤1280px JPEG so dozens of progress photos stay small. */
export async function downscaleImage(file: Blob, maxSide = MAX_SIDE, quality = 0.85): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality))
    return blob ?? file
  } catch {
    return file
  } finally {
    URL.revokeObjectURL(url)
  }
}
