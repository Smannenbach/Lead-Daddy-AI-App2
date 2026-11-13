import { requireUser } from "@/lib/auth";
import { creditsPerCheck, getReoonBalance } from "@/lib/verify/reoon";

// GET /api/verify/credits -> { emailCreditsRemaining: number | null, perCheck: { email, phone } }
// Read only. Checking the balance does not spend a credit.
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  return Response.json({
    emailCreditsRemaining: (await getReoonBalance())?.total ?? null,
    perCheck: { email: creditsPerCheck("email"), phone: creditsPerCheck("phone") },
  });
}
