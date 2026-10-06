module.exports = `(async () => { try {
  const start = performance.now();
  let designer;
  while (!(designer = document.querySelector('gorak-frame-designer'))?.document?.uri.endsWith('image-smoke.wml')) {
    const status = document.querySelector('.status');
    if (status && !status.hidden) throw Error(status.textContent);
    if (performance.now() - start > 10000) throw Error('Image fixture did not load');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  const doc = designer.document, root = designer.shadowRoot;
  if (!doc.metadata?.text.startsWith("[frametemplate]")) throw Error("Template companion did not load");
  const button = doc.fields.find(f => f.kind === 'buttonfield');
  const palette = doc.fields.find(f => f.kind === 'palettefield');
  if (!doc.backgroundBitmap || !button.bitmap || !button.selectedBitmap || !palette.choices[0].bitmap) throw Error('Image references were not resolved');
  if (!root.querySelector('.canvas').style.backgroundImage.startsWith('url(')) throw Error('Frame background missing');
  if (!root.querySelector('[data-field="'+button.id+'"] canvas')) throw Error('Button bitmap missing');
  if (button.selectedBitmap.rgba[3] !== 0 || button.selectedBitmap.rgba[7] !== button.bitmap.rgba[7]) throw Error('Native image mask failed');
  if (!Array.from(palette.choices[0].bitmap.rgba).some((v,i)=>i%4===3 && v===0)) throw Error('Built-in monochrome transparency failed');
  designer.selectField(button.id);
  const input = root.querySelector('[aria-label="width"]');
  input.value = '1800'; input.dispatchEvent(new Event('change'));
  if (!designer.document.fields.find(f=>f.id===button.id).bitmap) throw Error('Edit lost host images');
  Array.from(document.querySelectorAll('.menubar button')).find(b=>b.textContent.startsWith('Undo')).click();
  if (designer.document.source.text !== doc.source.text) throw Error('Undo changed image reference source');
  designer.selectFrame();
  const width = root.querySelector('[aria-label="windowwidth"]');
  width.value = '5500'; width.dispatchEvent(new Event('change'));
  if (designer.document.metadata.text !== doc.metadata.text.replace('windowwidth = "5000"', 'windowwidth = "5500"') || designer.document.source.text !== doc.source.text) throw Error('Template metadata edit changed unrelated source');
  Array.from(document.querySelectorAll('.menubar button')).find(b=>b.textContent.startsWith('Undo')).click();
  if (designer.document.metadata.text !== doc.metadata.text) throw Error('Template metadata undo lost component type or script');
  const pattern = root.querySelector('[aria-label="bgpattern"]');
  pattern.value = '1'; pattern.dispatchEvent(new Event('change'));
  if (root.querySelector('.canvas').style.backgroundImage) throw Error('Solid pattern displayed dormant bitmap');
  Array.from(document.querySelectorAll('.menubar button')).find(b=>b.textContent.startsWith('Undo')).click();
  return 'PASS: contract 3 PNG and built-in images, mask pixels, frame backgrounds, template companion edits and undo; '+Math.round(performance.now()-start)+' ms';
} catch(error) { return 'FAIL: '+error.stack; } })()`;
