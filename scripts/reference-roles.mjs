const roles = new Set(['base', 'identity', 'outfit', 'pose', 'style', 'background']);

export function validateReferenceRoles(input, count, kind) {
  if (input === undefined) return undefined;
  if (!Array.isArray(input) || input.length !== count || input.some(role => !roles.has(role)) || input.filter(role => role === 'base').length > 1 || (input.includes('base') && input[0] !== 'base')) {
    throw new Error('Las funciones de referencia deben corresponder a las imágenes; la base, si existe, va primero.');
  }
  if (kind === 'expressions') throw new Error('Los lotes de expresiones conservan las referencias de identidad originales.');
  return [...input];
}

export function referenceGuide(referenceRoles) {
  if (!referenceRoles) return 'La primera imagen es la referencia base y las demás aportan detalles complementarios.';
  const meaning = {
    base: 'imagen base principal; conserva los aspectos que el prompt no pida modificar',
    identity: 'solo identidad facial y rasgos anatómicos',
    outfit: 'solo ropa, atuendo y accesorios (sin transferir el rostro)',
    pose: 'solo postura y articulaciones, sin imponer encuadre ni fondo',
    background: 'solo escenario y distribución del fondo; adapta al formato final y al estilo del sujeto base o estilo elegido, sin copiar personas, textos ni imponer estilo fotográfico',
    style: 'solo acabado artístico, renderizado y estética'
  };
  return (referenceRoles.includes('base') ? '' : 'Referencias de apoyo: ') +
    referenceRoles.map((role, index) => 'Imagen ' + (index + 1) + ': ' + meaning[role] + '.').join(' ');
}
