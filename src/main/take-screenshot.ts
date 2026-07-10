import { desktopCapturer, screen } from 'electron'
import type { ScreenshotRegion } from './config'

/**
 * Take a screenshot.
 * - Fullscreen mode: captures the display where the cursor is.
 * - Region mode: captures the display containing the region, cropping to region bounds.
 *
 * IMPORTANT: coordinate scaling uses the ACTUAL pixel ratio measured from the
 * desktopCapturer thumbnail (image.getSize() / display.bounds), NOT display.scaleFactor.
 * desktopCapturer's returned thumbnail pixel density varies across platforms/DPI
 * (it may be HiDPI on macOS, 1x on Windows, or downsampled when thumbnailSize is
 * smaller than native). Measuring from the real image is correct in all cases.
 */
export function takeScreenshot(region?: ScreenshotRegion | null): Promise<string | void> {
  const mainWindow = global.mainWindow
  if (!mainWindow || mainWindow.isDestroyed()) return Promise.resolve()

  const allDisplays = screen.getAllDisplays()
  if (allDisplays.length === 0) return Promise.resolve()

  // Determine which display to target
  let targetDisplay: Electron.Display
  if (region && region.width >= 8 && region.height >= 8) {
    const cx = region.x + region.width / 2
    const cy = region.y + region.height / 2
    targetDisplay = screen.getDisplayNearestPoint({ x: cx, y: cy })
  } else {
    targetDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  }

  const { x: dbX, y: dbY, width: dbW, height: dbH } = targetDisplay.bounds

  return desktopCapturer
    .getSources({ types: ['screen'], thumbnailSize: { width: dbW, height: dbH } })
    .then((sources) => {
      if (sources.length === 0) return undefined

      // Find the source matching the target display
      let image = sources[0]?.thumbnail
      for (const source of sources) {
        if (source.display_id === String(targetDisplay.id)) {
          image = source.thumbnail
          break
        }
      }
      if (!image) return undefined

      // Measure the REAL pixel ratio from the actual thumbnail dimensions.
      // This is robust regardless of whether desktopCapturer returned a HiDPI
      // (2x) image, a 1x image, or a downsampled image.
      const imgW = image.getSize().width
      const imgH = image.getSize().height
      const ratioX = dbW > 0 ? imgW / dbW : 1
      const ratioY = dbH > 0 ? imgH / dbH : 1

      // If a valid region is provided, crop to it
      if (region && region.width >= 8 && region.height >= 8) {
        // Convert global screen coords (logical) to thumbnail-local pixel coords
        let rx = Math.round((region.x - dbX) * ratioX)
        let ry = Math.round((region.y - dbY) * ratioY)
        let rw = Math.round(region.width * ratioX)
        let rh = Math.round(region.height * ratioY)

        // Clamp to image bounds. When the region straddles the display edge
        // (rx/ry negative), reduce the crop size accordingly so we don't
        // capture off-display pixels.
        if (rx < 0) { rw += rx; rx = 0 }
        if (ry < 0) { rh += ry; ry = 0 }
        const cw = Math.min(rw, imgW - rx)
        const ch = Math.min(rh, imgH - ry)

        if (cw > 0 && ch > 0) {
          image = image.crop({ x: rx, y: ry, width: cw, height: ch })
        }
      }

      const base64Data = image.toPNG().toString('base64')
      return base64Data
    })
    .catch((error) => {
      console.error('Error taking screenshot:', error)
    })
}
