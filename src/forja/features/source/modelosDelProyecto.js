/* Los ONNX de Hugging Face viven en public/modelos (mismo sitio que el fondo y el line art).
   Sin esto, el navegador los vuelve a pedir a huggingface.co en cada sesión. */
import { env } from '@huggingface/transformers';

env.allowLocalModels = true;
env.localModelPath = new URL('modelos/', self.location.origin + '/').href;
