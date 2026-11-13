"""ARIA brain engine: LLM local dentro del proceso (llama.cpp).
Sin servidores, sin puertos, sin red. Formato ChatML (Qwen) para fluidez real.
"""
import os


def _hilos():
    """Hilos para llama.cpp: solo núcleos físicos y dejando 2 libres para la ventana.
    Antes usaba casi todos los hilos lógicos (14 de 16 en el Ryzen 7 5700G): el SMT no ayuda
    a llama.cpp y la interfaz se quedaba sin CPU (ARIA 'trabada' mientras pensaba)."""
    v = os.environ.get("ARIA_LLM_HILOS", "").strip()
    if v.isdigit() and int(v) > 0:
        return int(v)
    fisicos = max(1, (os.cpu_count() or 4) // 2)
    return max(2, min(6, fisicos - 2))


class LlamaEngine:
    def __init__(self, model_path):
        self.model_path = str(model_path)
        self.available = False
        self.error = None
        self._llm = None

    def load(self):
        try:
            if not os.path.isfile(self.model_path):
                self.error = "no existe el modelo: %s" % self.model_path
                return
            from llama_cpp import Llama
            self._llm = Llama(
                model_path=self.model_path,
                n_ctx=2048,
                n_threads=_hilos(),
                n_batch=256,
                verbose=False,
            )
            self.available = True
        except Exception as exc:
            self.available = False
            self.error = "%s: %s" % (type(exc).__name__, exc)

    # ---- ChatML (Qwen) : da fluidez, razonamiento y memoria de turno ----
    @staticmethod
    def _to_chatml(messages):
        partes = []
        for m in messages:
            rol = m.get("role", "user")
            cont = (m.get("content") or "").strip()
            if not cont:
                continue
            partes.append("<|im_start|>%s\n%s<|im_end|>" % (rol, cont))
        partes.append("<|im_start|>assistant\n")
        return "\n".join(partes)

    def chat(self, messages, max_tokens=200):
        """messages = [{'role':'system'|'user'|'assistant','content':...}, ...]"""
        if not self.available or self._llm is None:
            return ""
        try:
            prompt = self._to_chatml(messages)
            out = self._llm.create_completion(
                prompt=prompt,
                max_tokens=max_tokens,
                temperature=0.4,
                top_p=0.9,
                top_k=40,
                repeat_penalty=1.15,
                stop=["<|im_end|>", "<|im_start|>"],
            )
            txt = (out.get("choices") or [{}])[0].get("text", "")
            return txt.strip()
        except Exception:
            return ""

    # ---- streaming: cada trozo va al callback; el hilo que llama hace el resto ----
    def chat_stream(self, messages, on_token, max_tokens=200):
        if not self.available or self._llm is None:
            return ""
        prompt = self._to_chatml(messages)
        full = []
        try:
            for chunk in self._llm.create_completion(
                prompt=prompt, max_tokens=max_tokens, temperature=0.4,
                top_p=0.9, top_k=40, repeat_penalty=1.15,
                stop=["<|im_end|>", "<|im_start|>"], stream=True):
                piece = (chunk.get("choices") or [{}])[0].get("text", "")
                if piece:
                    full.append(piece)
                    try: on_token(piece)
                    except Exception: pass
        except Exception:
            pass
        return "".join(full).strip()

    # compat: generacion plana (ruta antigua)
    def generate(self, prompt, max_tokens=160):
        if not self.available or self._llm is None:
            return ""
        try:
            out = self._llm.create_completion(
                prompt=prompt,
                max_tokens=max_tokens,
                temperature=0.4,
                top_p=0.9,
                repeat_penalty=1.15,
                stop=["<|im_end|>", "\nUsuario:", "\nDaniel:"],
            )
            txt = (out.get("choices") or [{}])[0].get("text", "")
            return txt.strip()
        except Exception:
            return ""
