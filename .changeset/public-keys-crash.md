---
'@codama/renderers-js': minor
---

Add event generation from `EventNode`s. Each program event is rendered into a dedicated `events/` page containing its discriminator constants, a typed event payload, encoder/decoder/codec functions and a `parseXxxEvent` helper validating the event discriminators before decoding. Program pages additionally expose an event enum and an `identifyMyProgramEvent` helper mirroring the existing account and instruction identification helpers. Event codecs reference their discriminator constants instead of inlining the bytes, and all generated names are configurable through the new `eventDataType`, `eventParseFunction`, `programEventsEnum`, `programEventsEnumVariant` and `programEventsIdentifierFunction` name transformers.
