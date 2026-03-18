// ══════════════════════════════════════════════════════════════
// SAP Spektra — Shared Type Definitions
// ══════════════════════════════════════════════════════════════
//
// Generic base type for API data objects. Pages receive loosely-typed
// JSON from the backend / mock layer. Using Record<string, any> as a
// base lets us access any property without TS errors while still being
// explicit about the "shape is dynamic" contract.
//

/** Generic API record — used for loosely typed API responses */
export type ApiRecord = Record<string, any>;
