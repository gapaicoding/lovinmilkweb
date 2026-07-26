# Dynamic Source Separation Decision

`data_origin` currently describes data quality (`actual`, `adjusted`,
`estimated`) and must not be overloaded with provenance. A new
`record_source` field expresses `historical_import`, `operational`,
`adjustment`, or retained `legacy_unclassified`.

Operational records use `import_batch_id = NULL`. Imported rows retain the
batch UUID and source key. Corrections reference the original row and require
a reason. Existing legacy sales/expenses are preserved as
`legacy_unclassified`; they are not silently counted as new live actual.

The historical invalidation trigger naturally ignores operational rows because
their batch ID is null. Adjustments retain a reference to historical source
and are expected to invalidate only the referenced batch through controlled
correction functions in the next migration/UI layer.
