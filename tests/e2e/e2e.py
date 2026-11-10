"""Browser end to end check of the main flows. Run against a fresh database:

    DATABASE_URL=file:/tmp/e2e.db npm start   # after npm run build
    pip install playwright && playwright install chromium
    python tests/e2e/e2e.py docs/screenshots
"""
import os, sys
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('BASE_URL', 'http://localhost:3001')
SHOTS = sys.argv[1] if len(sys.argv) > 1 else 'docs/screenshots'
FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'fixtures')
os.makedirs(SHOTS, exist_ok=True)
errors = []

def ctx_login(browser, name):
    ctx = browser.new_context(viewport={'width': 1280, 'height': 900})
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(f'{name}: {e}'))
    page.on('console', lambda m: m.type == 'error' and errors.append(f'{name} console: {m.text}'))
    page.goto(BASE)
    page.get_by_role('button', name=f'Sign in as {name}').click()
    expect(page.get_by_role('heading', name='Documents')).to_be_visible()
    return ctx, page

with sync_playwright() as p:
    chrome = os.environ.get('CHROME_PATH')
    browser = p.chromium.launch(executable_path=chrome) if chrome else p.chromium.launch()

    # Login screen
    c0 = browser.new_context(viewport={'width': 1280, 'height': 900}); pg = c0.new_page(); pg.goto(BASE)
    pg.evaluate('window.scrollTo(0,0)'); pg.wait_for_timeout(150); pg.screenshot(path=f'{SHOTS}/01-login.png'); c0.close()

    actx, alice = ctx_login(browser, 'Alice')
    alice.evaluate('window.scrollTo(0,0)'); alice.wait_for_timeout(150); alice.screenshot(path=f'{SHOTS}/02-dashboard-alice.png')

    # Create, rename, format, autosave, reload
    alice.get_by_role('button', name='New document').click()
    expect(alice.get_by_label('Document title')).to_have_value('Untitled document')
    alice.get_by_label('Document title').fill('Launch checklist')
    ed = alice.locator('.ProseMirror')
    ed.click()
    alice.get_by_label('Text style').select_option('h1')
    alice.keyboard.type('Launch checklist')
    alice.keyboard.press('Enter')
    alice.keyboard.type('This is ')
    alice.keyboard.press('Control+b'); alice.keyboard.type('bold'); alice.keyboard.press('Control+b')
    alice.keyboard.type(', ')
    alice.keyboard.press('Control+i'); alice.keyboard.type('italic'); alice.keyboard.press('Control+i')
    alice.keyboard.type(' and ')
    alice.keyboard.press('Control+u'); alice.keyboard.type('underlined'); alice.keyboard.press('Control+u')
    alice.keyboard.press('Enter')
    alice.get_by_role('button', name='Bulleted list').click()
    alice.keyboard.type('Item one'); alice.keyboard.press('Enter'); alice.keyboard.type('Item two')
    alice.keyboard.press('Enter'); alice.keyboard.press('Enter')
    alice.get_by_role('button', name='Numbered list').click()
    alice.keyboard.type('Step one')
    expect(alice.locator('.save-status')).to_have_text('All changes saved', timeout=5000)
    alice.evaluate('window.scrollTo(0,0)'); alice.wait_for_timeout(150); alice.screenshot(path=f'{SHOTS}/03-editor-formatting.png')
    alice.reload()
    expect(alice.get_by_label('Document title')).to_have_value('Launch checklist')
    html = ed.inner_html()
    for tag in ['<h1>', '<strong>bold</strong>', '<em>italic</em>', '<u>underlined</u>', '<ul>', '<ol>']:
        assert tag in html, f'missing {tag} after reload: {html}'
    print('PASS create/rename/format/persist')

    # Import into open doc
    alice.locator('input[type=file]').set_input_files(os.path.join(FIX, 'retro.md'))
    expect(ed).to_contain_text('Retro notes')
    expect(alice.locator('.save-status')).to_have_text('All changes saved', timeout=5000)
    print('PASS insert from file')

    # Share with Bob (editor) and Carol (viewer)
    alice.get_by_role('button', name='Share').click()
    dlg = alice.locator('dialog')
    dlg.get_by_label('Email of person to share with').fill('bob@ajaia.test')
    dlg.get_by_label('Access level').select_option('editor')
    dlg.get_by_role('button', name='Share').click()
    expect(dlg).to_contain_text('Bob Rivera')
    dlg.get_by_label('Email of person to share with').fill('carol@ajaia.test')
    dlg.get_by_label('Access level').select_option('viewer')
    dlg.get_by_role('button', name='Share').click()
    expect(dlg).to_contain_text('Carol Singh')
    dlg.get_by_label('Email of person to share with').fill('nobody@ajaia.test')
    dlg.get_by_role('button', name='Share').click()
    expect(dlg.locator('.form-error')).to_contain_text('No user with email')
    alice.evaluate('window.scrollTo(0,0)'); alice.wait_for_timeout(150); alice.screenshot(path=f'{SHOTS}/04-share-dialog.png')
    dlg.get_by_role('button', name='Done').click()
    doc_url = alice.url
    print('PASS sharing dialog')

    # Import docx from dashboard as new doc
    alice.goto(BASE + '/#/')
    expect(alice.get_by_role('heading', name='Documents')).to_be_visible()
    alice.locator('input[type=file]').set_input_files(os.path.join(FIX, 'vendor_review.docx'))
    expect(alice.get_by_label('Document title')).to_have_value('vendor review')
    expect(ed).to_contain_text('Vendor Review')
    assert '<strong>bold</strong>' in ed.inner_html() and '<li>' in ed.inner_html(), ed.inner_html()
    print('PASS docx import')
    alice.goto(BASE + '/#/')
    alice.locator('input[type=file]').set_input_files(os.path.join(FIX, 'retro.md'))
    expect(alice.get_by_label('Document title')).to_have_value('retro')

    # Carol: viewer
    cctx, carol = ctx_login(browser, 'Carol')
    expect(carol.locator('.doclist').nth(1)).to_contain_text('Launch checklist')
    expect(carol.locator('.doclist').nth(1)).to_contain_text('Owned by Alice Chen')
    carol.evaluate('window.scrollTo(0,0)'); carol.wait_for_timeout(150); carol.screenshot(path=f'{SHOTS}/05-dashboard-carol-shared.png')
    carol.goto(doc_url)
    expect(carol.locator('.banner-view')).to_be_visible()
    assert carol.locator('.toolbar').count() == 0
    assert carol.locator('.ProseMirror').get_attribute('contenteditable') == 'false'
    carol.evaluate('window.scrollTo(0,0)'); carol.wait_for_timeout(150); carol.screenshot(path=f'{SHOTS}/06-viewer-readonly.png')
    print('PASS viewer read only')

    # Bob edits; Alice (stale tab) gets conflict
    bctx, bob = ctx_login(browser, 'Bob')
    alice.goto(doc_url); expect(alice.locator('.ProseMirror')).to_contain_text('Launch checklist')
    bob.goto(doc_url)
    bed = bob.locator('.ProseMirror')
    bed.click(); bob.keyboard.press('Control+End'); bob.keyboard.type(' Bob added this.')
    expect(bob.locator('.save-status')).to_have_text('All changes saved', timeout=5000)
    print('PASS editor can edit')
    ed.click(); alice.keyboard.press('Control+End'); alice.keyboard.type(' Alice stale edit.')
    expect(alice.locator('.banner-warn')).to_be_visible(timeout=5000)
    alice.evaluate('window.scrollTo(0,0)'); alice.wait_for_timeout(150); alice.screenshot(path=f'{SHOTS}/07-conflict.png')
    alice.get_by_role('button', name='Load latest version').click()
    expect(ed).to_contain_text('Bob added this.')
    print('PASS conflict detection and reload')

    # Unknown doc
    carol.goto(BASE + '/#/d/does-not-exist')
    expect(carol.locator('.banner-error')).to_contain_text('does not exist')

    # Mobile
    m = browser.new_context(viewport={'width': 390, 'height': 844}, storage_state=actx.storage_state())
    mp = m.new_page(); mp.goto(doc_url); expect(mp.locator('.ProseMirror')).to_be_visible()
    mp.evaluate('window.scrollTo(0,0)'); mp.wait_for_timeout(150); mp.screenshot(path=f'{SHOTS}/08-mobile-editor.png')

    browser.close()

print('ERRORS:', errors if errors else 'none')
