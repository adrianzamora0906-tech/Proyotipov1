export function createDocumentImageSheet(images) {
  if (!images.length || images.length > 4) throw new Error('Selecciona entre una y cuatro fotos.');
  const encoder = new TextEncoder();
  const join = parts => {
    const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    parts.forEach(part => { result.set(part, offset); offset += part.length; });
    return result;
  };
  const stream = (bytes, attributes = '') => join([
    encoder.encode(`<< ${attributes} /Length ${bytes.length} >>\nstream\n`),bytes,encoder.encode('\nendstream'),
  ]);
  const content = images.map((image, index) => {
    const scale = Math.min(235 / image.width, 175 / image.height);
    const width = image.width * scale, height = image.height * scale;
    const x = (index % 2 ? 312 : 48) + (235 - width) / 2;
    const y = (index < 2 ? 560 : 275) + (175 - height) / 2;
    return `q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im${index + 1} Do Q`;
  }).join('\n');
  const resources = images.map((_, index) => `/Im${index + 1} ${index + 4} 0 R`).join(' ');
  const objects = [
    encoder.encode('<< /Type /Catalog /Pages 2 0 R >>'),
    encoder.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    encoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << ${resources} >> >> /Contents ${images.length + 4} 0 R >>`),
    ...images.map(image => stream(image.bytes, `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`)),
    stream(encoder.encode(content)),
  ];
  const parts = [encoder.encode('%PDF-1.4\n')];
  const offsets = [0];
  let position = parts[0].length;
  objects.forEach((object,index) => {
    offsets.push(position);
    const header=encoder.encode(`${index+1} 0 obj\n`),footer=encoder.encode('\nendobj\n');
    parts.push(header,object,footer);
    position += header.length+object.length+footer.length;
  });
  const xref = ['xref',`0 ${objects.length+1}`,'0000000000 65535 f ',
    ...offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n `),
    'trailer',`<< /Size ${objects.length+1} /Root 1 0 R >>`,'startxref',String(position),'%%EOF',''].join('\n');
  parts.push(encoder.encode(xref));
  return new Blob(parts,{type:'application/pdf'});
}
