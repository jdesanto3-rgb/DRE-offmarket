import { SupabaseClient } from "@supabase/supabase-js";

export async function isDnc(
  supabase: SupabaseClient,
  contact: { phone?: string | null; email?: string | null; mailing_address_std?: string | null }
): Promise<boolean> {
  const conditions: string[] = [];
  const values: (string | null)[] = [];

  if (contact.phone) {
    conditions.push("phone");
    values.push(contact.phone);
  }
  if (contact.email) {
    conditions.push("email");
    values.push(contact.email);
  }
  if (contact.mailing_address_std) {
    conditions.push("mailing_address_std");
    values.push(contact.mailing_address_std);
  }

  if (conditions.length === 0) return false;

  let query = supabase.from("do_not_contact").select("id").limit(1);

  // Build OR filter
  const orParts = conditions
    .map((col, i) => `${col}.eq.${values[i]}`)
    .join(",");
  query = query.or(orParts);

  const { data } = await query;
  return (data?.length ?? 0) > 0;
}

export async function hasRecentOutreach(
  supabase: SupabaseClient,
  propertyId: string,
  channel: string,
  withinDays: number = 30
): Promise<boolean> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - withinDays);

  const { data } = await supabase
    .from("outreach_queue")
    .select("id")
    .eq("property_id", propertyId)
    .eq("channel", channel)
    .gte("created_at", cutoff.toISOString())
    .limit(1);

  return (data?.length ?? 0) > 0;
}

export async function enqueueOutreach(
  supabase: SupabaseClient,
  propertyId: string,
  contactId: string,
  channel: string,
  campaignId?: string | null
): Promise<void> {
  await supabase.from("outreach_queue").insert({
    campaign_id: campaignId || null,
    property_id: propertyId,
    owner_contact_id: contactId,
    channel,
    status: "queued",
  });
}
