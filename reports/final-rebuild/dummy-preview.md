# Dummy Cleanup Preview

`scripts/preview_dummy_cleanup.sql` is SELECT-only. It reports all legacy rows
as unclassified and zero rows as proven dummy, then verifies the protected
actual batch. This deliberately blocks deletion until a deterministic marker
or documented ID list is available.

No production DELETE, TRUNCATE, DROP, reseed, or re-import was performed.
