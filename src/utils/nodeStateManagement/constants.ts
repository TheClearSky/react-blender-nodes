/**
 * Length of generated random ids for graph entities (nodes, edges, handles,
 * types). Single source of truth, imported by `applyPlan`, `constructAndModifyNodes`,
 * and `constructAndModifyHandles`. Lives here (not in `validators.ts`) because id
 * minting is part of apply, not validate — keeps `validateAction` deterministic.
 */
export const lengthOfIds = 20;
