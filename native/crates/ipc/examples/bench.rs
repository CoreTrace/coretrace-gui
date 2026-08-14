// Phase 0 exit criteria asks for concrete IPC round-trip latency numbers,
// not just "it works". Runs N pings against a live sidecar and reports
// min/avg/p99/max. Debug build, single machine, TCP loopback transport --
// see native/docs/phase0-measurements.md for caveats before citing these.
use std::time::{Duration, Instant};

use coretrace_ipc::ExtensionHostClient;

const ITERATIONS: usize = 500;

fn main() {
    let mut client = ExtensionHostClient::connect(7331).expect("connect to sidecar");

    // Warm up the connection/OS buffers before measuring.
    for _ in 0..20 {
        client.ping().expect("warmup ping");
    }

    let mut samples: Vec<Duration> = Vec::with_capacity(ITERATIONS);
    for _ in 0..ITERATIONS {
        let start = Instant::now();
        client.ping().expect("ping");
        samples.push(start.elapsed());
    }

    samples.sort();
    let min = samples[0];
    let max = samples[samples.len() - 1];
    let p50 = samples[samples.len() / 2];
    let p99 = samples[(samples.len() as f64 * 0.99) as usize];
    let avg: Duration = samples.iter().sum::<Duration>() / samples.len() as u32;

    println!("ping round-trip over {ITERATIONS} iterations (TCP loopback, debug build):");
    println!("  min: {min:?}");
    println!("  avg: {avg:?}");
    println!("  p50: {p50:?}");
    println!("  p99: {p99:?}");
    println!("  max: {max:?}");
}
