import { SAMPLE_DEEDS } from "./sample"
import type { Deed } from "./types"

/**
 * One place every page reads from. Today: labelled sample data.
 * Once the testnet contracts are deployed (VITE_DEED_CONTRACT set), this reads
 * the registry, the deed contract and the indexer instead.
 */
export const DATA_SOURCE: "sample" | "testnet" = import.meta.env.VITE_DEED_CONTRACT ? "testnet" : "sample"

export function useDeeds(): Deed[] {
  return SAMPLE_DEEDS
}

export function useDeed(id: string | undefined): Deed | undefined {
  return SAMPLE_DEEDS.find((d) => d.id === id)
}
