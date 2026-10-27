# AUVIONA — interactive web demo

This folder contains the **static HTML/CSS/JavaScript source** of the public [AUVIONA web demo](https://sonora-vibecodefest-2026.swiftmule128.chatgpt.site), as of 2026-10-25. It uses no backend, accounts or third-party JavaScript dependencies.

Run it locally from the repository root:

```sh
python3 -m http.server 8000 --directory web-demo
```

Then open http://localhost:8000. A local HTTP server is required because the script imports JavaScript modules.

- Three soundscapes and their labels are **illustrative examples**, not microphone detections.
- With permission, the browser microphone drives loudness/tone visualization **locally**; it never runs YAMNet sound classification.
- The native iOS and Android app lives in the repository's `src/` and `modules/` folders.

The website is hosted separately; this is a versioned source snapshot, not an automatic deployment pipeline. Keep this folder in sync when making future website changes. The original website code is released under the repository's [MIT license](../LICENSE).
