/* Line art drawn by an AI (Informative Drawings, MIT, ONNX at 768×768) with onnxruntime-web, off the main
   thread. In: the picture as RGB 0..1 (planar, 768×768). Out: grey 0..1 per pixel (dark = line). */
import '../source/silenciar.js';   // the AI library must not write to the console
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import mjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';

ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };
// all the cores but one (the page keeps one for itself); several threads need the cross-origin isolated page
ort.env.wasm.numThreads = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);

const sesiones = new Map();   // model url -> session (each style is loaded once)

self.onmessage = async ({ data: { id, modelo, entrada, lado } }) => {
  try {
    let s = sesiones.get(modelo);
    if (!s) {
      const r = await fetch(modelo);
      if (!r.ok) throw new Error(`no se encuentra el modelo (${r.status})`);
      s = await ort.InferenceSession.create(new Uint8Array(await r.arrayBuffer()), { executionProviders: ['wasm'] });
      sesiones.set(modelo, s);
    }
    const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', entrada, [1, 3, lado, lado]) });
    const gris = out[s.outputNames[0]].data;
    self.postMessage({ id, gris }, [gris.buffer]);
  } catch (e) {
    self.postMessage({ id, error: String(e?.message || e) });
  }
};
