-- Add unique constraints for batch upsert support
-- PostgreSQL treats NULLs as distinct in unique indexes, so
-- multiple rows with NULL parcel_id in the same county are allowed.

-- Properties: replace partial index with full unique index
drop index if exists idx_properties_parcel;
drop index if exists idx_properties_address;
create unique index idx_properties_county_parcel on properties (county, parcel_id);

-- Tax signals: unique per property + signal_type + source
create unique index idx_tax_signals_upsert
  on tax_signals (property_id, signal_type, source_name);

-- Owner contacts: unique per property + source
create unique index idx_owner_contacts_upsert
  on owner_contacts (property_id, contact_source);
