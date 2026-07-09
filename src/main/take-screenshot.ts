import { desktopCapturer, screen } from 'electron'
import type { ScreenshotRegion } from './config'

/**
 * Take a screenshot, optionally cropped to a region.
 * Uses the actual thumbnail-to-screen-pixel ratio instead of raw scaleFactor,
 * which avoids misalignment on Windows/Linux HiDPI where desktopCapturer
 * returns non-HiDPI thumbnails.
 */
export function takeScreenshot(region?: ScreenshotRegion | null): Promise<string | void> {
  const mainWindow = global.mainWindow
  if (!mainWindow || mainWindow.isDestroyed()) return Promise.resolve()

  // Compute virtual desktop bounds to capture all monitors
  const allDisplays = screen.getAllDisplays()
  if (allDisplays.length === 0) return Promise.resolve()

  let minX = 0, minY = 0, maxX = 1, maxY = 1
  for (const d of allDisplays) {
    minX = Math.min(minX, d.bounds.x)
    minY = Math.min(minY, d.bounds.y)
    maxX = Math.max(maxX, d.bounds.x + d.bounds.width)
    maxY = Math.max(maxY, d.bounds.y + d.bounds.height)
  }
  const virtWidth = maxX - minX
  const virtHeight = maxY - minY

  return desktopCapturer
    .getSources({ types: ['screen'], thumbnailSize: { width: virtWidth, height: virtHeight } })
    .then((sources) => {
      if (sources.length === 0) return undefined

      // Default to first source
      let image = sources[0]?.thumbnail
      if (!image) return undefined

      // If a valid region is provided, crop to it
      if (region && region.width >= 8 && region.height >= 8) {
        // Find which display contains the region center; match its source
        const regionCenterX = region.x + region.width / 2
        const regionCenterY = region.y + region.height / 2
        const targetDisplay = screen.getDisplayNearestPoint({ x: regionCenterX, y: regionCenterY })

        if (targetDisplay) {
          const displayId = targetDisplay.id
          for (const source of sources) {
            if (source.display_id === String(displayId)) {
              image = source.thumbnail
              break
            }
          }
        }

        // Compute pixel ratio from the FINAL image (after display-source matching)
        const imgW = image.getSize().width
        const imgH = image.getSize().height
        const ratioX = imgW / virtWidth
        const ratioY = imgH / virtHeight

        // Convert global screen coordinates to thumbnail-local coordinates
        let rx = Math.round((region.x - minX) * ratioX)
        let ry = Math.round((region.y - minY) * ratioY)
        let rw = Math.round(region.width * ratioX)
        let rh = Math.round(region.height * ratioY)

        // Clamp to image bounds
        if (rx < 0) { rw += rx; rx = 0 }
        if (ry < 0) { rh += ry; ry = 0 }
        if (rx + rw > imgW) rw = imgW - rx
        if (ry + rh > imgH) rh = imgH - ry

        if (rw > 0 && rh > 0) {
          image = image.crop({ x: rx, y: ry, width: rw, height: rh })
        }
      }

      const base64Data = image.toPNG().toString('base64')
      return base64Data
    })
    .catch((error) => {
      console.error('Error taking screenshot:', error)
    })
}
