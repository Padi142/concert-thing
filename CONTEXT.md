# Concert Archive

A private personal archive for organizing, identifying, finding, and selectively sharing media captured at live performances.

## Language

**Owner**:
One authenticated account that manages and organizes its own isolated Library.
_Avoid_: Admin, user

**Library**:
The Owner's complete private collection of concert media and its organization.
_Avoid_: Gallery, feed

**Show**:
One live performance attended by the Owner, potentially crossing midnight and featuring one or more Artists. A Show is not defined solely by a calendar date.
_Avoid_: Concert, event, date, album

**Artist**:
A performer credited as part of a Show.
_Avoid_: Band, act

**Assignment**:
The association of a Media Item with a Show, made automatically only when confidence is high enough; otherwise it awaits Owner review.
_Avoid_: Date grouping, album membership

**Inbox**:
The set of Media Items whose Show assignment needs Owner review.
_Avoid_: Unsorted album, uploads

**Media Item**:
One original photo or video in the Library.
_Avoid_: Asset, file, upload

**Song Match**:
A candidate identification of a Song within a time range of a video, carrying confidence and an Owner-review state. A video may have multiple Song Matches, and recognition never replaces an Owner correction.
_Avoid_: Video song, tag

**Song**:
A pragmatic, searchable identity for music in the Library, defined by a title and primary Artist. It does not claim to identify a composition or a specific commercial recording.
_Avoid_: Track, composition, recording, audio fingerprint

**Share Link**:
An unguessable read-only invitation that exposes a selected part of the Library without granting management access.
_Avoid_: Public link, guest account
