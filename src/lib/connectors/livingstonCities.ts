// Livingston County city-level parcel ingestion.
// Uses Regrid ArcGIS FeatureServer (REGRID_API_TOKEN required).
// Previous MCGI statewide service was taken offline.
export { fetchRegridCityParcels as fetchLivingstonCityParcels, discoverRegridFields as discoverCityFields } from "./regridCities";
export type { RegridParcel as LivingstonCityParcel, RegridCity as SupportedCity } from "./regridCities";
