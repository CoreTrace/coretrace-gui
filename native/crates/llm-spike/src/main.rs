// Phase 0 spike: is a Rust llama.cpp binding viable on Windows, as an
// alternative to keeping node-llama-cpp in a sidecar (see
// native/docs/phase0-status.md "existing business logic disposition").
// llama_backend_init() calls straight into the compiled native
// ggml/llama.cpp code, so a clean run here proves real runtime linkage,
// not just a successful compile.
use llama_cpp_4::llama_backend::LlamaBackend;

fn main() {
    let backend = LlamaBackend::init().expect("initialize llama.cpp backend");
    println!("llama.cpp backend initialized: {backend:?}");
    println!("CPU-only build (default features). GPU backend features (cuda/vulkan/hip/metal/opencl) exist but are unverified on this machine -- see phase0-status.md.");
}
