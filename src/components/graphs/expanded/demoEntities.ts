/**
 * src/components/graphs/expanded/demoEntities.ts
 *
 * ⚠️ RELOCATED. The synthetic entity population — counts, name pools and the
 * naming rules — now lives in `src/data/entityFill.ts`, where the DATASET
 * generates every entity once for BOTH graph modes. The drill-down no longer
 * tops clusters up with layer-local "demo" entities: an expanded cluster shows
 * exactly the entities the dataset holds, the same ones the Structured focus
 * shows, so counts and names can never disagree between modes.
 *
 * This module remains as the expanded layer's import surface for the shared
 * helpers (existing call sites keep working unchanged).
 */

export { hashId, syntheticNameFor } from '@/data/entityFill'
