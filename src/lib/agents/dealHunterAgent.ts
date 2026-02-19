import { SupabaseClient } from "@supabase/supabase-js";
import { computeDealScore } from "@/lib/scoring/dealScoreV2";
import { isDnc, hasRecentOutreach, enqueueOutreach } from "@/lib/outreach";

interface AgentResult {
  propertiesScored: number;
  newHot: number;
  alertsCreated: number;
  outreachQueued: number;
  errors: string[];
}

export async function runDealHunterAgent(
  supabase: SupabaseClient
): Promise<AgentResult> {
  const result: AgentResult = {
    propertiesScored: 0,
    newHot: 0,
    alertsCreated: 0,
    outreachQueued: 0,
    errors: [],
  };

  // 1. Fetch all properties
  const { data: properties, error: propErr } = await supabase
    .from("properties")
    .select("id, county, deal_score, first_hot_at, lead_status");

  if (propErr || !properties) {
    result.errors.push(`Failed to fetch properties: ${propErr?.message}`);
    return result;
  }

  for (const prop of properties) {
    try {
      // 2. Fetch signals for this property
      const { data: signals } = await supabase
        .from("tax_signals")
        .select("signal_type, stage")
        .eq("property_id", prop.id);

      // 3. Fetch PropStream data if linked
      const { data: psRecords } = await supabase
        .from("propstream_records")
        .select("equity_percent, absentee_owner, vacant, owner_occupied")
        .eq("property_id", prop.id)
        .limit(1);

      const ps = psRecords?.[0];

      // 4. Compute score
      const scoreResult = computeDealScore({
        signals: signals || [],
        equity_percent: ps?.equity_percent,
        absentee_owner: ps?.absentee_owner,
        vacant: ps?.vacant,
        owner_occupied: ps?.owner_occupied,
        county: prop.county,
      });

      // 5. Update property
      const wasHot = prop.deal_score >= 85;
      const isNowHot = scoreResult.score >= 85;
      const updateData: Record<string, unknown> = {
        deal_score: scoreResult.score,
        score_breakdown: scoreResult,
        last_scored_at: new Date().toISOString(),
      };

      if (isNowHot && !prop.first_hot_at) {
        updateData.first_hot_at = new Date().toISOString();
      }

      await supabase.from("properties").update(updateData).eq("id", prop.id);
      result.propertiesScored++;

      // 6. Detect newly HOT
      if (isNowHot && !wasHot) {
        result.newHot++;

        // Create deal alert
        await supabase.from("deal_alerts").insert({
          property_id: prop.id,
          alert_type: "newly_hot",
        });
        result.alertsCreated++;

        // 7. Auto-queue outreach
        await autoQueueOutreach(supabase, prop.id, result);
      }
    } catch (err) {
      result.errors.push(`Error scoring ${prop.id}: ${err}`);
    }
  }

  return result;
}

async function autoQueueOutreach(
  supabase: SupabaseClient,
  propertyId: string,
  result: AgentResult
): Promise<void> {
  // Ensure owner contact exists
  const { data: contacts } = await supabase
    .from("owner_contacts")
    .select("id, phone, email, mailing_address_std")
    .eq("property_id", propertyId)
    .limit(1);

  const contact = contacts?.[0];
  if (!contact) {
    result.errors.push(`No owner contact for property ${propertyId}`);
    return;
  }

  // Check DNC
  const blocked = await isDnc(supabase, contact);
  if (blocked) return;

  // Always queue direct mail
  const hasRecentMail = await hasRecentOutreach(supabase, propertyId, "direct_mail");
  if (!hasRecentMail) {
    await enqueueOutreach(supabase, propertyId, contact.id, "direct_mail");
    result.outreachQueued++;
  }

  // Queue SMS if phone exists
  if (contact.phone) {
    const hasRecentSms = await hasRecentOutreach(supabase, propertyId, "sms");
    if (!hasRecentSms) {
      await enqueueOutreach(supabase, propertyId, contact.id, "sms");
      result.outreachQueued++;
    }
  }

  // Update lead status
  await supabase
    .from("properties")
    .update({
      lead_status: "queued",
      last_outreach_at: new Date().toISOString(),
    })
    .eq("id", propertyId);
}
