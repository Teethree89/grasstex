# 100-battle headless benchmark

- Commit: `1aaa86642fa3a0a9352289b03089b6113c816b1d`
- Build: `v29-dev`
- Policy: live-policy-endpoint, revision 13
- Parallel shards: **5**
- Completed: **100/100** battles in about **299.72s parallel wall time** (200.2× real-time, 20.02 battles/min)
- Results: US **46** (46.0%), GER **54** (54.0%), draw/none **0** (0.0%)
- Battle duration: avg **600.15s**, p50 **600.15s**, p95 **600.15s**
- Captures: avg **2.97**, no-capture battles **0**
- Vacant enemy-objective stalls: **14 events across 8 battles**
- Movement stalls while ordered to advance: **380 events across 87 battles**
- Longest interval without objective-state progress: **470.1s**
- Browser/runtime errors: **1697**; warnings: **25**

## Most problematic runs

| Seed | Winner | Time | Captures | Vacant stalls | Move stalls | Max no-progress |
|---|---|---:|---:|---:|---:|---:|
| `manual-benchmark-s3-0013` | ge | 600.15s | 2 | 3 | 6 | 305.1s |
| `manual-benchmark-s4-0009` | ge | 600.15s | 4 | 3 | 5 | 260.1s |
| `manual-benchmark-s4-0007` | us | 600.15s | 4 | 2 | 5 | 185.1s |
| `manual-benchmark-s2-0019` | ge | 600.15s | 1 | 2 | 3 | 155.1s |
| `manual-benchmark-s4-0015` | us | 600.15s | 1 | 0 | 18 | 455.1s |
| `manual-benchmark-s1-0014` | ge | 600.15s | 1 | 0 | 15 | 270.1s |
| `manual-benchmark-s1-0003` | us | 600.15s | 3 | 0 | 16 | 155.1s |
| `manual-benchmark-s1-0004` | ge | 600.15s | 2 | 0 | 13 | 385s |
| `manual-benchmark-s5-0016` | ge | 600.15s | 1 | 1 | 4 | 230.1s |
| `manual-benchmark-s3-0006` | us | 600.15s | 4 | 0 | 13 | 200.1s |
| `manual-benchmark-s4-0011` | us | 600.15s | 3 | 1 | 3 | 165s |
| `manual-benchmark-s2-0001` | us | 600.15s | 3 | 0 | 12 | 205.1s |
| `manual-benchmark-s5-0002` | us | 600.15s | 2 | 0 | 10 | 375s |
| `manual-benchmark-s3-0009` | ge | 600.15s | 4 | 0 | 11 | 215.1s |
| `manual-benchmark-s3-0014` | ge | 600.15s | 3 | 1 | 1 | 130.1s |
| `manual-benchmark-s2-0012` | ge | 600.15s | 3 | 0 | 10 | 175.1s |
| `manual-benchmark-s1-0008` | ge | 600.15s | 3 | 1 | 0 | 135s |
| `manual-benchmark-s2-0016` | us | 600.15s | 2 | 0 | 6 | 425.1s |
| `manual-benchmark-s3-0002` | us | 600.15s | 2 | 0 | 6 | 395.1s |
| `manual-benchmark-s5-0019` | us | 600.15s | 1 | 0 | 6 | 384.9s |

## Browser/runtime errors

- `Access to image at 'https://test.ivandpopov.com/grasstex/Assets/dirttex.png' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
- `Access to image at 'https://test.ivandpopov.com/grasstex/Assets/skytex.png' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
- `Access to fetch at 'https://test.ivandpopov.com/grasstex/Assets/audio/acoustics.json?ts=1789340490151' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
- `Access to XMLHttpRequest at 'https://test.ivandpopov.com/grasstex/Assets/audio/lmg.mp3' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
- `Access to XMLHttpRequest at 'https://test.ivandpopov.com/grasstex/Assets/audio/carbine.mp3' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
- `Access to XMLHttpRequest at 'https://test.ivandpopov.com/grasstex/Assets/audio/pistol.mp3' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
- `Access to XMLHttpRequest at 'https://test.ivandpopov.com/grasstex/Assets/audio/rifle.mp3' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
- `Access to XMLHttpRequest at 'https://test.ivandpopov.com/grasstex/Assets/audio/rifle.mp3' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
- `Access to XMLHttpRequest at 'https://test.ivandpopov.com/grasstex/Assets/audio/rifle.mp3' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
- `Access to XMLHttpRequest at 'https://test.ivandpopov.com/grasstex/Assets/audio/rifle.mp3' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
