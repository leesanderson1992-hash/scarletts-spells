# Identify policy holds: Production receipt

The owner approved the readiness recommendation on 31 October 2026. The exact manifest `data/adle/approved/d4-mor/v2/identify-policy-holds-2026-10-31.json` lists 198 currently published Identify pairs whose available evidence does not satisfy the agreed assignment rule: 152 families below two eligible affixed relatives, 41 words without an approved base-plus-affix analysis, and 5 irregular-base families.

`scripts/deassign-identify-policy-holds.mjs` verified all 198 word IDs and spellings, active dictionary status, current published pairs, and enabled Production review controls. Its serializable rollback proof passed. The subsequent Production transaction committed 198 governed `deassign` decisions and 198 bulk review exclusions across request IDs `c22f677f-a947-46d9-aa62-cfc010fb6221` and `d4659566-b317-4b0f-8dc1-e524d5a02bcc`. Source pair releases and learner history were not rewritten. Readback found 350 published pairs and 142 effective pairs after all current cluster-key vetoes.

These are reversible holds. Restore a pair only after its English free-base analysis, family breadth, and released lesson content are reviewed and ready. The remaining historical-origin and uncertain-link words require individual decisions; they were not included in this batch.
