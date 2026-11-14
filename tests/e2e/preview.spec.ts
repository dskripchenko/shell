import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mac = process.platform === 'darwin'
test.skip(process.platform === 'win32', 'driven with bash')

/** A one-page PDF with a line of text. */
function pdf(text: string): Buffer {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>']
  const stream = `BT /F1 18 Tf 20 100 Td (${text}) Tj ET`
  objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out)
}

test('previews: an HTML page as a page — its own files, no network, nothing of the window; a PDF in Chromium’s viewer', async () => {
  const work = mkdtempSync(join(tmpdir(), 'shell-preview-'))
  writeFileSync(join(work, 'style.css'), 'h1 { color: rgb(1, 2, 3) }')
  writeFileSync(
    join(work, 'page.html'),
    `<link rel="stylesheet" href="style.css"><h1 id="t">Report</h1><script>
      document.getElementById('t').dataset.script = 'ran'
      try { parent.document.title = 'pwned' } catch (e) { document.getElementById('t').dataset.parent = 'blocked' }
      fetch('https://example.com/').then(() => (document.getElementById('t').dataset.net = 'reached'), () => (document.getElementById('t').dataset.net = 'blocked'))
    </script>`,
  )
  writeFileSync(join(work, 'doc.pdf'), pdf('Hello PDF'))
  const data = mkdtempSync(join(tmpdir(), 'shell-e2e-'))
  writeFileSync(join(data, 'config.toml'), '[shell]\nprogram = "/bin/bash"\nargs = []\n[quake]\nenabled = false\n')
  const app = await electron.launch({ args: ['.'], env: { ...process.env, SHELL_DATA: data, SHELL_E2E: '1', HOME: work } })
  const page = await app.firstWindow()
  await page.waitForSelector('.term-host .dsk-term')
  await expect(page.locator('.tab.active .tab-name')).toHaveText(work.split('/').pop()!, { timeout: 20_000 })
  const openPath = async (name: string) => {
    await page.locator('.pane.focused .dsk-term').click()
    await page.keyboard.type(`echo "see ${name}"`)
    await page.keyboard.press('Enter')
    await page.locator('.pane.focused .dsk-term-link', { hasText: name }).last().click({ modifiers: [mac ? 'Meta' : 'Control'] })
  }

  await openPath('page.html')
  const frame = page.frameLocator('.viewer-frame[data-kind="html"]')
  const h1 = frame.locator('#t')
  await expect(h1).toHaveText('Report')
  await expect(h1).toHaveCSS('color', 'rgb(1, 2, 3)')
  await expect(h1).toHaveAttribute('data-script', 'ran')
  await expect(h1).toHaveAttribute('data-parent', 'blocked')
  await expect(h1).toHaveAttribute('data-net', 'blocked')
  expect(await page.title()).not.toBe('pwned')
  // As code, on request.
  await page.locator('.viewer').getByRole('button', { name: 'Как код' }).click()
  await expect(page.locator('.viewer-frame[data-kind="html"]')).toHaveCount(0)
  await expect(page.frameLocator('.viewer-frame[src="shell-doc://app/viewer.html"]').locator('pre, code').first()).toContainText('Report', { timeout: 20_000 })

  await openPath('doc.pdf')
  const pdfFrame = page.locator('.viewer-frame[data-kind="pdf"]')
  await expect(pdfFrame).toBeVisible()
  await expect.poll(() => pdfFrame.evaluate((f) => (f as HTMLIFrameElement).contentDocument?.contentType ?? 'cross-origin')).not.toBe('text/html')
  await expect.poll(() => page.frames().some((f) => f.url().startsWith('chrome-extension://'))).toBe(true)
  await app.close()
})
