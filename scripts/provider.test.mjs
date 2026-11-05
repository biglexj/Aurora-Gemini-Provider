import test from 'node:test';
import assert from 'node:assert/strict';
import {IMAGE_PROMPT_MAX_CHARS, validatePrompt} from './prompt-limits.mjs';
import {referenceGuide, validateReferenceRoles} from './reference-roles.mjs';
import {EXPRESSIONS, RATIOS, RESOLUTIONS, outputSize} from './presets.mjs';
import {requestBody} from './request-body.mjs';
import {validateOrigins} from './config.mjs';

const bodyOf = bytes => (async function* () {
  yield bytes;
})();

test('el prompt vacío se rechaza y el límite es de 20 000 caracteres', () => {
  assert.throws(() => validatePrompt('   '), /Escribe una idea/);
  assert.throws(() => validatePrompt('a'.repeat(IMAGE_PROMPT_MAX_CHARS + 1)), /20 000 caracteres/);
  assert.doesNotThrow(() => validatePrompt('a'.repeat(IMAGE_PROMPT_MAX_CHARS)));
  assert.equal(IMAGE_PROMPT_MAX_CHARS, 20_000);
});

test('los roles de referencia se validan y la base va primera', () => {
  assert.deepEqual(validateReferenceRoles(['base', 'style'], 2, 'image'), ['base', 'style']);
  assert.equal(validateReferenceRoles(undefined, 2, 'image'), undefined);
  assert.throws(() => validateReferenceRoles(['style', 'base'], 2, 'image'), /base/);
  assert.throws(() => validateReferenceRoles(['base', 'base'], 2, 'image'), /base/);
  assert.throws(() => validateReferenceRoles(['base', 'unknown'], 2, 'image'), /funciones de referencia/);
  assert.throws(() => validateReferenceRoles(['base'], 2, 'image'), /corresponder a las imágenes/);
  assert.throws(() => validateReferenceRoles(['base'], 1, 'expressions'), /expresiones/);
});

test('la guía de referencias describe el papel de cada imagen', () => {
  const guide = referenceGuide(['base', 'outfit', 'background']);
  assert.match(guide, /Imagen 1: imagen base principal/);
  assert.match(guide, /Imagen 2: solo ropa/);
  assert.match(guide, /Imagen 3: solo escenario/);
});

test('el tamaño de salida sigue la proporción y la resolución elegidas', () => {
  assert.deepEqual(outputSize('1:1', '1024'), {width: 1024, height: 1024});
  assert.deepEqual(outputSize('16:9', '1024'), {width: 1024, height: 576});
  assert.deepEqual(outputSize('9:21', '2048'), {width: 873, height: 2037});
});

test('los presets publicados son los que expone la API', () => {
  assert.deepEqual(RATIOS, ['1:1', '16:9', '9:16', '3:4', '4:3', '21:9', '9:21']);
  assert.deepEqual(RESOLUTIONS, ['1024', '2048']);
  assert.equal(new Set(EXPRESSIONS.map(expression => expression.id)).size, EXPRESSIONS.length);
  assert.ok(EXPRESSIONS.every(expression => expression.prompt.length > 0));
});

test('el cuerpo de la solicitud se rechaza por encima del máximo', async () => {
  await assert.rejects(
    () => requestBody(bodyOf(Buffer.alloc(64)), 32),
    error => error.status === 413
  );
  const bytes = await requestBody(bodyOf(Buffer.from('hola')), 32);
  assert.equal(bytes.toString('utf8'), 'hola');
});

test('los orígenes permitidos se validan y se limitan a ocho', () => {
  assert.deepEqual(validateOrigins(['http://localhost:4321']), ['http://localhost:4321']);
  assert.throws(() => validateOrigins(['http://localhost:4321/ruta']), /solo el origen/);
  assert.throws(() => validateOrigins(['ftp://localhost:4321']), /solo el origen/);
  assert.throws(() => validateOrigins(Array.from({length: 9}, (_, index) => `http://localhost:432${index}`)), /hasta ocho/);
});
