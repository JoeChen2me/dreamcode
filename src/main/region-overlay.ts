import { BrowserWindow, screen, ipcMain } from 'electron'
import type { ScreenshotRegion } from './config'
import { saveConfig } from './config'
import { settings } from './settings'

let selecting = false

function buildOverlayHTML(displayX: number, displayY: number): string {
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
  var sx = 0, sy = 0, dragging = false, minSize = 8;
  var sel = document.getElementById('sel');
  var bar = document.getElementById('bar');

  document.addEventListener('mousedown', function(e) {
    sx = e.screenX; sy = e.screenY;
    dragging = true;
    sel.style.display = 'block';
    update(e);
  });

  document.addEventListener('mousemove', function(e) {
    if (!dragging) return;
    update(e);
  });

  function update(e) {
    var x = Math.min(sx, e.screenX);
    var y = Math.min(sy, e.screenY);
    var w = Math.abs(e.screenX - sx);
    var h = Math.abs(e.screenY - sy);
    sel.style.left = (x - ${displayX}) + 'px';
    sel.style.top = (y - ${displayY}) + 'px';
    sel.style.width = w + 'px';
    sel.style.height = h + 'px';
    bar.textContent = w + ' × ' + h + '  |  松开确认 · Esc 取消';
  }

  document.addEventListener('mouseup', function(e) {
    if (!dragging) return;
    dragging = false;
    var x = Math.min(sx, e.screenX);
    var y = Math.min(sy, e.screenY);
    var w = Math.abs(e.screenX - sx);
    var h = Math.abs(e.screenY - sy);
    if (w < minSize && h < minSize) {
      document.title = 'toosmall:' + x + ',' + y;
    } else {
      document.title = JSON.stringify({x:x, y:y, width:w, height:h});
    }
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') document.title = 'cancelled';
  });
</script>
</body>
</html>`
}

function startRegionSelectionOnDisplay(): Promise<ScreenshotRegion | null> {
  return new Promise((resolve) => {
    const cursorPoint = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursorPoint)
    const { x, y, width: dw, height: dh } = display.bounds

    const overlay = new BrowserWindow({
      x,
      y,
      width: dw,
      height: dh,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: true,
      hasShadow: false,
      webPreferences: {
        sandbox: false,             // kept false with CSP for defense-in-depth
        contextIsolation: false,    // title-based IPC needs this; CSP mitigates
        nodeIntegration: false
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
      if (!overlay.isDestroyed()) overlay.close()
      resolve(region)
    }

    const safetyTimer = setTimeout(() => {
      done(null)
    }, TIMEOUT_MS)

    overlay.on('page-title-updated', (_event, title) => {
      if (title === 'cancelled') { done(null); return }
      if (title.startsWith('toosmall:')) { done(null); return }
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
      'data:text/html;charset=utf-8,' + encodeURIComponent(buildOverlayHTML(x, y))
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
      saveConfig({
        apiProvider: settings.apiProvider,
        apiBaseURL: settings.apiBaseURL,
        apiKey: settings.apiKey,
        extraHeaders: settings.extraHeaders,
        model: settings.model,
        codeLanguage: settings.codeLanguage,
        customPrompt: settings.customPrompt,
        proxyUrl: settings.proxyUrl,
        autoCheckUpdate: settings.autoCheckUpdate,
        screenshotMode: settings.screenshotMode,
        screenshotRegion: settings.screenshotRegion
      })
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

// Also export for internal use by shortcuts (direct call, not IPC)
export { startRegionSelectionOnDisplay as startRegionSelection }
