import { desktopCapturer, screen } from 'electron'
import type { ScreenshotRegion } from './config'

/**
 * Take a screenshot.
 * - Fullscreen mode: captures the display where the cursor is.
 * - Region mode: captures the display containing the region, cropping to region bounds.
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
  const scaleFactor = targetDisplay.scaleFactor

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

      // If a valid region is provided, crop to it
      if (region && region.width >= 8 && region.height >= 8) {
        // Convert global screen coordinates to display-local pixel coordinates
        const rx = Math.round((region.x - dbX) * scaleFactor)
        const ry = Math.round((region.y - dbY) * scaleFactor)
        const rw = Math.round(region.width * scaleFactor)
        const rh = Math.round(region.height * scaleFactor)

        const imgW = image.getSize().width
        const imgH = image.getSize().height
        const cx = Math.max(0, rx)
        const cy = Math.max(0, ry)
        const cw = Math.min(rw, imgW - cx)
        const ch = Math.min(rh, imgH - cy)

        if (cw > 0 && ch > 0) {
          image = image.crop({ x: cx, y: cy, width: cw, height: ch })
        }
      }

      const base64Data = image.toPNG().toString('base64')
      return base64Data
    })
    .catch((error) => {
      console.error('Error taking screenshot:', error)
    })
}
