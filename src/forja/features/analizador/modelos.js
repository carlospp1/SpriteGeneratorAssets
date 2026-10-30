/* Las 5 IAs locales del analizador (ONNX de Hugging Face, gratis, en este ordenador). */
export const MODELOS = [
  { id: 'clip32', nombre: 'CLIP B/32', hf: 'Xenova/clip-vit-base-patch32', tipo: 'clip' },
  { id: 'clip16', nombre: 'CLIP B/16', hf: 'Xenova/clip-vit-base-patch16', tipo: 'clip' },
  { id: 'siglip', nombre: 'SigLIP', hf: 'Xenova/siglip-base-patch16-224', tipo: 'siglip' },
  { id: 'dino', nombre: 'DINOv2', hf: 'Xenova/dinov2-small', tipo: 'auto' },
  { id: 'vit', nombre: 'ViT', hf: 'Xenova/vit-base-patch16-224', tipo: 'auto' }
];
export const MODELO_IDS = MODELOS.map(m => m.id);
