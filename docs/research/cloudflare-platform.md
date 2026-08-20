# Cloudflare platform notes

Researched 2026-08-20 from Cloudflare's primary documentation. Prices and limits can change; re-check before adding transcoded copies or substantially increasing usage.

## Selected MVP services

- **R2 Standard** stores original Media Items. It is priced at US$0.015/GB-month, with no Internet egress charge. The monthly free tier includes 10 GB-month, 1 million Class A operations, and 10 million Class B operations. At the expected initial 100–500 GB, originals alone are approximately US$1.50–$7.50/month before free-tier effects. [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- **R2 multipart upload** supports resumable and parallel upload, 5 MiB minimum parts except the final part, up to 10,000 parts, and objects up to 5 TiB. The implemented browser flow uses 8 MiB parts and persists completed-part metadata locally. [Upload objects](https://developers.cloudflare.com/r2/objects/upload-objects/)
- **D1** stores archive metadata. The Free plan currently includes 5 million rows read/day, 100,000 rows written/day, and 5 GB total storage. D1 scales to zero and has no D1 egress charge. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- **Workers Static Assets** can serve a Vite SPA and selectively invoke the Worker first for `/api/*`. Static asset requests are free and unlimited; Worker-first requests count as Worker requests. [Static assets](https://developers.cloudflare.com/workers/static-assets/) and [routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
- The Workers Free plan includes 100,000 requests/day. The paid plan has a US$5/month minimum and includes 10 million requests/month. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

## Cost conclusion

The MVP should remain under US$10/month at the stated initial archive size while it stores only originals. At 500 GB, R2 storage leaves little room under the target for Workers Paid or duplicate playback representations. Transcoding is therefore deferred until playback requirements and the expected representation multiplier are measured. Cloudflare Stream or generated R2 copies must receive a separate cost decision before implementation.

## Deliberately deferred research

Music-recognition provider selection is deferred with Song Match implementation. No assumption has been made that an official public Shazam interface exists. Provider legitimacy, full-audio handling, live-performance accuracy, and current pricing must be researched before audio leaves the Library.
