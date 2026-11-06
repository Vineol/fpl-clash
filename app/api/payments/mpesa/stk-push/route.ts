import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const PAYMENT_AMOUNT_KES = 50;
const ENTRY_FEE_PENCE = 5000;
const DARAJA_TIMEOUT_MS = 20_000;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function normalizeKenyanPhone(phone: unknown): string | null {
  if (typeof phone !== "string") return null;
  let value = phone.replace(/[\s+\-()]/g, "");
  if (value.startsWith("0")) value = `254${value.slice(1)}`;
  else if (value.startsWith("7") || value.startsWith("1")) value = `254${value}`;
  return /^254[17]\d{8}$/.test(value) ? value : null;
}

function getNairobiTimestamp(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`;
}

export async function POST(request: NextRequest) {
  let paymentId: number | string | null = null;
  let requestMayHaveReachedDaraja = false;

  try {
    // STK Push is initiated by a signed-in customer; never remove this check.
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return jsonError("Please sign in again.", 401);
    const accessToken = authorization.slice("Bearer ".length).trim();
    if (!accessToken) return jsonError("Please sign in again.", 401);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !supabaseKey) return jsonError("Payment service is not configured.", 500);

    const userClient = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser(accessToken);
    if (authError || !user) return jsonError("Your session is invalid. Please sign in again.", 401);

    let body: { entryId?: unknown; phone?: unknown };
    try { body = await request.json(); }
    catch { return jsonError("Invalid request body.", 400); }

    const entryId = body.entryId;
    if (!((typeof entryId === "string" && entryId.trim().length > 0) ||
      (typeof entryId === "number" && Number.isSafeInteger(entryId) && entryId > 0))) {
      return jsonError("A valid entry ID is required.", 400);
    }
    const phone = normalizeKenyanPhone(body.phone);
    if (!phone) return jsonError("Enter a valid Kenyan mobile number, such as 0712345678.", 400);

    const { data: entry, error: entryError } = await supabaseAdmin
      .from("entries").select("id, user_id, entry_fee_pence, status")
      .eq("id", entryId).eq("user_id", user.id).maybeSingle();
    if (entryError) {
      console.error("Entry lookup failed:", entryError.message);
      return jsonError("Could not verify your competition entry.", 500);
    }
    if (!entry) return jsonError("Competition entry not found.", 404);
    if (entry.status === "cancelled") return jsonError("This competition entry has been cancelled.", 400);
    if (Number(entry.entry_fee_pence) !== ENTRY_FEE_PENCE) return jsonError("The entry fee does not match the expected amount.", 400);

    const { data: existingPayments, error: lookupError } = await supabaseAdmin
      .from("payments").select("id, status, checkout_request_id")
      .eq("entry_id", entry.id).eq("provider", "mpesa")
      .in("status", ["paid", "pending"]).limit(1);
    if (lookupError) {
      console.error("Payment lookup failed:", lookupError.message);
      return jsonError("Could not check existing payments.", 500);
    }
    if (existingPayments?.length) {
      const existing = existingPayments[0];
      if (existing.status === "paid") return jsonError("This entry has already been paid for.", 409);
      return NextResponse.json({
        error: "A payment attempt is pending or being reconciled. Do not retry yet.",
        paymentId: existing.id,
        checkoutRequestId: existing.checkout_request_id ?? null,
      }, { status: 409 });
    }

    // Hard-coded sandbox host: this route must not send requests to production.
    if (process.env.MPESA_ENV !== "sandbox") return jsonError("M-PESA sandbox is not configured.", 500);
    const consumerKey = process.env.MPESA_CONSUMER_KEY;