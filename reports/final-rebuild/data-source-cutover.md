# Data Source Cutover

Historical actual is read from date-bearing aggregate tables. Live actual is
read from the existing operational transaction/visit workflow.

No fixed June cutover is embedded in the query layer. For each requested
range, dates present in historical aggregate sources are authoritative.
Operational rows on those same dates are excluded from combined KPI totals;
operational dates without historical coverage remain live actual. This permits
mixed ranges while preventing day-level overlap.

Transaction-level historical details are not fabricated. The old transaction
cards continue to represent live operational records, while historical data is
shown only as supported aggregates.
