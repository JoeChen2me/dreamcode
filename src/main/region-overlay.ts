import { BrowserWindow, screen, ipcMain } from 'electron'
import type { ScreenshotRegion } from './config'
import { settings, persistConfig } from './settings'

let selecting = false

function buildOverlayHTML(): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
  * { margin: 0; padding: 0; }
  body { overflow: hidden; background: rgba(0, 0, 0, 0.3); cursor: crosshair; user-select: none; }
  .selection {
    position: fixed; border: 2px dashed #a3a3a3; outline: 1px dashed #4ade80;
    background: rgba(74, 222, 128, 0.08); pointer-events: none; display: none;
  }
  .bar {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    color: #fff; background: rgba(0,0,0,0.72); padding: 6px 18px;
    border-radius: 999px; font: 13px system-ui; pointer-events: none; white-space: nowrap;
  }
</style>
</head>
<body>
<div class="selection" id="sel"></div>
<div class="bar" id="bar">拖拽选择截图区域 · Esc 取消 · 松开鼠标确认</div>
<script>
  (function() {
    var sx_client = 0, sy_client = 0;
    var sx_screen = 0, sy_screen = 0;
    var dragging = false, minSize = 8;
    var sel = document.getElementById('sel');
    var bar = document.getElementById('bar');

    document.addEventListener('mousedown', function(e) {
      sx_client = e.clientX; sy_client = e.clientY;
      sx_screen = e.screenX; sy_screen = e.screenY;
      dragging = true;
      sel.style.display = 'block';
      update(e);
    });

    document.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      update(e);
    });

    function update(e) {
      var cx = Math.min(sx_client, e.clientX);
      var cy = Math.min(sy_client, e.clientY);
      var cw = Math.abs(e.clientX - sx_client);
      var ch = Math.abs(e.clientY - sy_client);
      sel.style.left = cx + 'px';
      sel.style.top = cy + 'px';
      sel.style.width = cw + 'px';
      sel.style.height = ch + 'px';

      // Compute screen (global) coordinates for the info bar
      var gx = Math.min(sx_screen, e.screenX);
      var gy = Math.min(sy_screen, e.screenY);
      var gw = Math.abs(e.screenX - sx_screen);
      var gh = Math.abs(e.screenY - sy_screen);
      bar.textContent = gw + ' x ' + gh + '  |  松开确认 · Esc 取消';
    }

    document.addEventListener('mouseup', function(e) {
      if (!dragging) return;
      dragging = false;
      var gx = Math.min(sx_screen, e.screenX);
      var gy = Math.min(sy_screen, e.screenY);
      var gw = Math.abs(e.screenX - sx_screen);
      var gh = Math.abs(e.screenY - sy_screen);
      if (gw < minSize && gh < minSize) {
        document.title = 'toosmall';
      } else {
        document.title = JSON.stringify({x: gx, y: gy, width: gw, height: gh});
      }
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') document.title = 'cancelled';
    });
  })();
</script>
</body>
</html>`
}

/**
 * Create a transparent window covering all displays, let the user drag-select
 * a region, and return the selected bounds in global screen coordinates.
 */
function startRegionSelectionOnDisplay(): Promise<ScreenshotRegion | null> {
  return new Promise((resolve) => {
    // Compute virtual desktop bounds to cover all monitors
    const allDisplays = screen.getAllDisplays()
    let minX = 0, minY = 0, maxX = 1, maxY = 1
    for (const d of allDisplays) {
      minX = Math.min(minX, d.bounds.x)
      minY = Math.min(minY, d.bounds.y)
      maxX = Math.max(maxX, d.bounds.x + d.bounds.width)
      maxY = Math.max(maxY, d.bounds.y + d.bounds.height)
    }

    const overlay = new BrowserWindow({
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: true,
      hasShadow: false,
      webPreferences: {
        sandbox: false,
        contextIsolation: false,
        nodeIntegration: false,
        zoomFactor: 1
      }
    })

    overlay.setAlwaysOnTop(true, 'screen-saver', 2)
    overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    let settled = false
    const TIMEOUT_MS = 60_000

    function done(region: ScreenshotRegion | null) {
      if (settled) return
      settled = true
      clearTimeout(safetyTimer)
      overlay.removeAllListeners('page-title-updated')
      overlay.removeAllListeners('closed')
      overlay.removeAllListeners('render-process-gone')
      overlay.removeAllListeners('unresponsive')
      if (!overlay.isDestroyed()) overlay.close()
      resolve(region)
    }

    const safetyTimer = setTimeout(() => { done(null) }, TIMEOUT_MS)

    // Cleanup on renderer crash (events are on webContents, not BrowserWindow)
    overlay.webContents.on('render-process-gone', () => { done(null) })
    overlay.on('unresponsive', () => { done(null) })

    overlay.on('page-title-updated', (_event, title) => {
      if (title === 'cancelled' || title === 'toosmall') { done(null); return }
      try {
        const r = JSON.parse(title) as ScreenshotRegion
        if (r && typeof r.width === 'number' && r.width >= 8) {
          done(r)
        }
      } catch {
        /* ignore non-JSON titles during initial load */
      }
    })

    overlay.on('closed', () => { done(null) })

    overlay.loadURL(
      'data:text/html;charset=utf-8,' + encodeURIComponent(buildOverlayHTML())
    )
  })
}

ipcMain.handle('startRegionSelection', async () => {
  if (selecting) return null
  selecting = true
  try {
    const region = await startRegionSelectionOnDisplay()
    if (region) {
      Object.assign(settings, { screenshotRegion: region })
      persistConfig()
      const mainWindow = global.mainWindow
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('region-updated', region)
      }
    }
    return region
  } finally {
    selecting = false
  }
})

export { startRegionSelectionOnDisplay as startRegionSelection }
