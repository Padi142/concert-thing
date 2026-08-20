# Music recognition provider and processing decision

Researched 2026-08-20 from provider and platform primary sources. Provider accuracy claims have not yet been validated against the Owner's own concert recordings.

## Decision

Use **ACRCloud File Scanning**, with a provider-neutral recognition interface. Recognition runs automatically for newly uploaded videos. The browser obtains a provider presigned upload through the Worker and sends the original video directly to ACRCloud. ACRCloud performs its own asynchronous traversal; the Worker polls and persists results.

The Owner chose:

- automatic recognition after every video upload
- direct original-video upload to avoid browser FFmpeg overhead
- confirm, reject, edit, and manual-add review actions
- pragmatic Song identity: title + primary Artist
- one automatic retry (two attempts total)

The deployed archive uses a conservative limit of 10 new recognition jobs per month. This is the hard spend control; upload and playback do not depend on recognition.

## Provider comparison

| Question | ACRCloud | AudD | Official Shazam |
| --- | --- | --- | --- |
| Legitimate interface | Identification and File Scanning HTTP interfaces are documented. File Scanning accepts an uploaded file or presigned upload and processes it asynchronously. | Standard, enterprise, and stream HTTP surfaces are documented. | Apple provides ShazamKit for native Apple platforms and Android. Apple does not document a browser/Worker Shazam web API. |
| Concert/live fit | A separate Cover Song Identification engine explicitly targets covers and live performances by melodic similarity, including key and tempo variation. This is the strongest stated fit, but remains a provider claim. | Standard recognition fingerprints released recordings. AudD does not make an equivalent official live-performance accuracy claim. | Shazam catalog matching is available through native ShazamKit only. |
| Whole file / multiple songs | File Scanning traversal returns multiple timestamped results. Direct API upload is under 500 MB; ACRCloud recommends its presigned S3 flow over 100 MB and describes that path as having no file-size limit. | Standard requests are short. Enterprise splits long files into 12-second chunks and returns offsets, but enterprise pricing is custom. | Not applicable to this web architecture. |
| Short request limits | Identification samples must be below 5 MB and the docs recommend less than 15 seconds. | Standard accepts up to 10 MB and identifies a short excerpt. | Native SDK controls apply. |
| Returned data | File results include score, offset, played duration, title, Artists, ACRID, ISRC/UPC and linked platform metadata when available. Cover results are returned separately. | Enterprise returns score, file offset, within-chunk offsets, title/Artist and identifiers depending on plan. | Native ShazamKit returns matched media items. |
| Async support | File state is processing, ready, no-result, or error; polling and callbacks are documented. | Enterprise supports callbacks; streams support callbacks or long polling. | Native session callbacks. |
| Price / hard controls | ACRCloud advertises a 14-day trial without a card, but public pages do not state a dependable File Scanning/Cover price; price must be confirmed in the console or quote. The archive therefore enforces its own monthly job cap. | Provider-published 2026 pricing says 300 free standard requests, then $5/1,000; long-file enterprise is custom. | Requires Apple developer setup and a native application; not comparable to an HTTP request price. |
| Retention/privacy | Terms say uploaded audio/video is permanently removed after fingerprints are generated. Account/customer metadata and generated recognition records remain governed by the terms. | AudD says submitted audio is removed after processing and offers contractual enterprise assurances. | Governed by Apple developer terms/native SDK behavior. |

## Why File Scanning rather than short samples

One concert video can contain multiple Songs. A sequence of short-window Identification calls would require choosing a sampling interval, can miss short songs and transitions, and makes request count proportional to duration. File Scanning's traversal is the provider surface intended for multiple results across one file.

Direct video upload avoids a 32 MB FFmpeg WebAssembly runtime and substantial browser CPU/memory use. The trade-off is that ACRCloud temporarily receives the full original video rather than audio alone. Existing videos are streamed from the authenticated private content endpoint to the provider upload. The R2 upload remains complete and playable when recognition fails.

## Async/orchestration choice

ACRCloud File Scanning is already an asynchronous durable job. D1 stores local jobs and attempts; the client polls status, and provider candidate upserts are idempotent. A Cloudflare Queue or Workflow would add a provisioned resource without improving this direct provider upload flow. Cloudflare recommends Queues for simple single-step background work and Workflows for durable multi-step execution; either can be added later if extraction moves to a server-side media processor. [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/), [Queues limits](https://developers.cloudflare.com/queues/platform/limits/), [Workflows limits](https://developers.cloudflare.com/workflows/reference/limits/)

## Primary sources

- [ACRCloud File Scanning API](https://docs.acrcloud.com/reference/console-api/file-scanning/file-scanning)
- [ACRCloud Identification API](https://docs.acrcloud.com/reference/identification-api/identification-api)
- [ACRCloud Cover Song Identification](https://www.acrcloud.com/cover-song-identification/)
- [ACRCloud Terms of Use](https://www.acrcloud.com/terms/)
- [AudD standard vs enterprise vs streams](https://audd.io/resources/concepts/standard-vs-enterprise-vs-streams)
- [AudD pricing](https://audd.io/resources/articles/music-recognition-api-pricing)
- [AudD enterprise cost controls](https://audd.io/resources/concepts/enterprise-cost-control)
- [AudD enterprise fields](https://audd.io/resources/reference/enterprise-match-fields)
- [AudD score guidance](https://audd.io/resources/concepts/score-thresholds)
- [AudD GDPR/audio handling](https://audd.io/resources/articles/gdpr-music-recognition)
- [Apple ShazamKit](https://developer.apple.com/shazamkit/)
- [Apple ShazamKit for Android](https://developer.apple.com/shazamkit/android/)
