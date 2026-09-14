# 100-battle headless benchmark

- Commit: `1aaa86642fa3a0a9352289b03089b6113c816b1d`
- Build: `v29-dev`
- Policy: live-policy-endpoint, revision 13
- Parallel shards: **5**
- Completed: **100/100** battles in about **377.08s parallel wall time** (158.7× real-time, 15.91 battles/min)
- Results: US **56** (56.0%), GER **44** (44.0%), draw/none **0** (0.0%)
- Battle duration: avg **598.41s**, p50 **600.15s**, p95 **600.15s**
- Captures: avg **3.28**, no-capture battles **1**
- Vacant enemy-objective stalls: **2 events across 2 battles**
- Movement stalls while ordered to advance: **441 events across 84 battles**
- Longest interval without objective-state progress: **600.1s**
- Browser/runtime errors: **1695**; warnings: **25**

## Most problematic runs

| Seed | Winner | Time | Captures | Vacant stalls | Move stalls | Max no-progress |
|---|---|---:|---:|---:|---:|---:|
| `push-2-s5-0018` | us | 600.15s | 3 | 0 | 36 | 289.9s |
| `push-2-s3-0020` | ge | 600.15s | 3 | 0 | 20 | 234.9s |
| `push-2-s2-0009` | ge | 600.15s | 3 | 0 | 21 | 125.1s |
| `push-2-s4-0003` | us | 600.15s | 3 | 0 | 17 | 330.1s |
| `push-2-s4-0005` | us | 600.15s | 3 | 0 | 15 | 310s |
| `push-2-s5-0009` | us | 600.15s | 5 | 0 | 14 | 145.1s |
| `push-2-s4-0008` | us | 600.15s | 1 | 0 | 11 | 440.1s |
| `push-2-s3-0011` | ge | 600.15s | 2 | 0 | 10 | 430s |
| `push-2-s3-0002` | ge | 600.15s | 4 | 0 | 13 | 125.1s |
| `push-2-s2-0017` | us | 600.15s | 3 | 1 | 1 | 279.9s |
| `push-2-s1-0005` | us | 542.25s | 5 | 1 | 2 | 160.1s |
| `push-2-s2-0007` | us | 600.15s | 4 | 0 | 10 | 274.9s |
| `push-2-s5-0010` | ge | 600.15s | 4 | 0 | 9 | 325s |
| `push-2-s2-0011` | ge | 600.15s | 2 | 0 | 9 | 310s |
| `push-2-s3-0009` | us | 600.15s | 4 | 0 | 10 | 185.1s |
| `push-2-s4-0007` | us | 600.15s | 4 | 0 | 10 | 155.1s |
| `push-2-s4-0006` | us | 600.15s | 3 | 0 | 8 | 324.9s |
| `push-2-s2-0003` | us | 600.15s | 3 | 0 | 9 | 199.9s |
| `push-2-s4-0016` | us | 600.15s | 3 | 0 | 8 | 289.9s |
| `push-2-s1-0010` | ge | 600.15s | 2 | 0 | 9 | 185.1s |

## Browser/runtime errors

- `Access to image at 'https://test.ivandpopov.com/grasstex/Assets/skytex.png' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
- `Access to fetch at 'https://test.ivandpopov.com/grasstex/Assets/audio/acoustics.json?ts=1789339786361' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
- `Access to image at 'https://test.ivandpopov.com/grasstex/Assets/dirttex.png' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
- `Access to XMLHttpRequest at 'https://test.ivandpopov.com/grasstex/Assets/audio/rifle.mp3' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
- `Access to XMLHttpRequest at 'https://test.ivandpopov.com/grasstex/Assets/audio/carbine.mp3' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
- `Access to XMLHttpRequest at 'https://test.ivandpopov.com/grasstex/Assets/audio/rifle.mp3' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
- `Access to XMLHttpRequest at 'https://test.ivandpopov.com/grasstex/Assets/audio/carbine.mp3' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
- `Access to XMLHttpRequest at 'https://test.ivandpopov.com/grasstex/Assets/audio/rifle.mp3' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
- `Access to XMLHttpRequest at 'https://test.ivandpopov.com/grasstex/Assets/audio/carbine.mp3' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
- `Access to XMLHttpRequest at 'https://test.ivandpopov.com/grasstex/Assets/audio/rifle.mp3' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
