# 100-battle headless benchmark

- Commit: `92e00f346943d55e4c7cfd320151e7df3417fe55`
- Build: `v29-dev`
- Policy: live-policy-endpoint, revision 13
- Completed: **100/100** battles in **1126.59s wall time** (53.2× real-time, 5.33 battles/min)
- Results: US **45** (45.0%), GER **55** (55.0%), draw/none **0** (0.0%)
- Battle duration: avg **599.58s**, p50 **600.15s**, p95 **600.15s**
- Captures: avg **3.17**, no-capture battles **0**
- Vacant enemy-objective stalls: **13 events across 7 battles**
- Movement stalls while ordered to advance: **406 events across 82 battles**
- Longest interval without objective-state progress: **450.1s**
- Browser/runtime errors: **1136**; warnings: **5**

## Most problematic runs

| # | Seed | Winner | Time | Captures | Vacant stalls | Move stalls | Max no-progress |
|---:|---|---|---:|---:|---:|---:|---:|
| 30 | `push-1-0030` | ge | 600.15s | 4 | 6 | 5 | 135s |
| 96 | `push-1-0096` | us | 600.15s | 6 | 1 | 18 | 135s |
| 69 | `push-1-0069` | ge | 600.15s | 3 | 0 | 23 | 234.9s |
| 58 | `push-1-0058` | ge | 600.15s | 4 | 2 | 3 | 180s |
| 9 | `push-1-0009` | ge | 600.15s | 4 | 1 | 11 | 125.1s |
| 70 | `push-1-0070` | ge | 600.15s | 1 | 0 | 13 | 420.1s |
| 75 | `push-1-0075` | ge | 600.15s | 3 | 0 | 15 | 129.9s |
| 36 | `push-1-0036` | us | 600.15s | 3 | 0 | 14 | 175.1s |
| 44 | `push-1-0044` | ge | 600.15s | 4 | 1 | 3 | 249.9s |
| 1 | `push-1-0001` | us | 600.15s | 1 | 0 | 11 | 445s |
| 79 | `push-1-0079` | us | 600.15s | 3 | 0 | 12 | 215.1s |
| 92 | `push-1-0092` | us | 600.15s | 5 | 0 | 12 | 180s |
| 18 | `push-1-0018` | ge | 600.15s | 3 | 0 | 12 | 154.9s |
| 19 | `push-1-0019` | us | 600.15s | 1 | 0 | 9 | 430s |
| 82 | `push-1-0082` | us | 600.15s | 4 | 1 | 2 | 125.1s |

## Browser/runtime errors

- `Access to image at 'https://test.ivandpopov.com/grasstex/Assets/dirttex.png' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
- `Access to image at 'https://test.ivandpopov.com/grasstex/Assets/skytex.png' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
- `Access to fetch at 'https://test.ivandpopov.com/grasstex/Assets/audio/acoustics.json?ts=1789338788564' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
- `Access to XMLHttpRequest at 'https://test.ivandpopov.com/grasstex/Assets/audio/rifle.mp3' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
- `Access to XMLHttpRequest at 'https://test.ivandpopov.com/grasstex/Assets/audio/rifle.mp3' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
- `Access to XMLHttpRequest at 'https://test.ivandpopov.com/grasstex/Assets/audio/rifle.mp3' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
- `Access to XMLHttpRequest at 'https://test.ivandpopov.com/grasstex/Assets/audio/rifle.mp3' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
- `Access to XMLHttpRequest at 'https://test.ivandpopov.com/grasstex/Assets/audio/carbine.mp3' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
- `Access to XMLHttpRequest at 'https://test.ivandpopov.com/grasstex/Assets/audio/rifle.mp3' from origin 'http://127.0.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- `Failed to load resource: net::ERR_FAILED`
