// The live Base44 org ("Go Buy Leads LLC") in Supabase project zdnlouluogpdfhygdnjn.
// All rows in the adapted tables carry this organization_id.
export const DEFAULT_ORGANIZATION_ID = "e5eef388-09e1-4fd4-9e93-19121d60125b";

export function organizationId(): string {
  return (process.env.LEADDADDY_ORGANIZATION_ID ?? process.env.ORGANIZATION_ID ?? DEFAULT_ORGANIZATION_ID).trim();
}
