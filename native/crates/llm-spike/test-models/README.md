# Test model fixture

Not vendored (binary, third-party, trivially refetchable). Fetch before
running the llm-spike binary's load/generate path:

```sh
cd native/crates/llm-spike/test-models
curl -sL -o stories260K.gguf \
  https://huggingface.co/ggml-org/models/resolve/main/tinyllamas/stories260K.gguf
```

`stories260K.gguf` (~1.2MB) is llama.cpp's own tiny CI test model — the
same default fixture `llama-cpp-4`'s own `tests/test_integration.rs`
looks for (see `LLAMA_TEST_MODEL` / `scripts/fetch-test-model.sh` in that
crate). Reusing it keeps this spike aligned with how the crate itself is
tested upstream, rather than picking an arbitrary model.
